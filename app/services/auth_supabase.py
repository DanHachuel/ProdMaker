"""Supabase Auth — validação de token JWT (SDK oficial, import preguiçoso).

- Cloud mode ativo quando SUPABASE_URL + SUPABASE_ANON_KEY existem (env ou settings).
- DEV fallback: sem chaves configuradas (ou DEV_MODE=true), o sistema segue com o login
  local e o user_id padrão '00000000-0000-0000-0000-000000000000' — nada quebra para
  quem ainda não configurou a nuvem.
"""
import threading
import time

from .llm import LLMError
from .store import get_settings

DEV_USER_ID = "00000000-0000-0000-0000-000000000000"
ADMIN_EMAIL = "dan.hachuel@gmail.com"
_CACHE_TTL = 300  # segundos de cache por token validado


def _db():
    from .database import get_db

    return get_db()


def obter_role(user_id: str, email: str, mode: str = "dev") -> str:
    """Regra de Ouro: e-mail do dono é sempre admin; modo DEV é admin; demais 'user'."""
    if (email or "").strip().lower() == ADMIN_EMAIL:
        return "admin"
    if mode == "dev":
        return "admin"
    with _db() as conn:
        row = conn.execute("SELECT role FROM usuarios WHERE user_id = ?", (user_id,)).fetchone()
    if row and row["role"] == "admin":
        return "admin"
    return "user"


def registrar_usuario(user_id: str, email: str, mode: str = "dev") -> str:
    """Upsert do usuário; devolve a role vigente (promove o e-mail do dono sempre)."""
    role = obter_role(user_id, email, mode)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with _db() as conn:
        existente = conn.execute("SELECT id FROM usuarios WHERE user_id = ?", (user_id,)).fetchone()
        if existente:
            conn.execute("UPDATE usuarios SET email = ?, role = ? WHERE user_id = ?", (email or "", role, user_id))
        else:
            conn.execute(
                "INSERT INTO usuarios (user_id, email, role, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email or "", role, timestamp),
            )
    return role

_client = None
_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()


def config() -> dict:
    settings = get_settings()
    supabase = (settings.get("api_keys") or {}).get("supabase") or {}
    import os

    url = (os.environ.get("SUPABASE_URL") or supabase.get("url") or "").strip()
    key = (os.environ.get("SUPABASE_ANON_KEY") or supabase.get("anon_key") or "").strip()
    dev_mode = (os.environ.get("DEV_MODE") or "").strip().lower() in ("1", "true", "yes", "on")
    return {"url": url, "key": key, "dev_mode": dev_mode}


def cloud_enabled() -> bool:
    cfg = config()
    return bool(cfg["url"] and cfg["key"] and not cfg["dev_mode"])


def _get_client():
    cfg = config()
    if not cfg["url"] or not cfg["key"]:
        raise LLMError(
            "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY (variáveis de ambiente "
            "ou Chaves de API → Supabase), ou ative DEV_MODE=true para o login local."
        )
    global _client
    with _lock:
        if _client is None:
            try:
                from supabase import create_client
            except ImportError as exc:
                raise LLMError(
                    "Biblioteca 'supabase' não instalada — rode 'prodmaker install' para concluir a instalação."
                ) from exc
            _client = create_client(cfg["url"], cfg["key"])
        return _client


def verify_token(token: str) -> dict:
    """Valida o token do Supabase e devolve {user_id, email} (cache de 5 min)."""
    token = (token or "").strip()
    if not token:
        raise LLMError("Token ausente.")
    agora = time.time()
    hit = _cache.get(token)
    if hit and hit[0] > agora:
        return hit[1]
    client = _get_client()
    try:
        resposta = client.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001 — SDK levanta exceções genéricas
        raise LLMError(f"Token inválido ou expirado: {exc}") from exc
    user = getattr(resposta, "user", None) or resposta.get("user") if isinstance(resposta, dict) else getattr(resposta, "user", None)
    if not user:
        raise LLMError("Token inválido (usuário não encontrado).")
    dados = {"user_id": str(getattr(user, "id", "") or user.get("id", "")), "email": str(getattr(user, "email", "") or user.get("email", ""))}
    if not dados["user_id"]:
        raise LLMError("Token válido sem user_id.")
    _cache[token] = (agora + _CACHE_TTL, dados)
    return dados
