"""Anti-Fraude do AdsPixel — padrão do redis-datasets/fraud-detection:
IP blacklisting (Redis Cuckoo Filter) + click spamming (Redis Sorted Set).

- Redis é OPCIONAL: sem Redis, tudo cai em SQLite local (tabelas ips_bloqueados /
  fraude_eventos) — bloqueio e detecção continuam funcionando.
- O pixel NUNCA quebra a página do visitante: avaliação em falha = segue normalmente.
"""
import json
import os
import time

from .database import get_db, now_str, row_to_dict
from .llm import LLMError
from .store import get_settings

CUCKOO_KEY = "prodmaker:ip_blacklist_cf"      # Redis Cuckoo Filter (IP_BLOCKED)
SPAM_KEY = "prodmaker:click_spamming"          # Redis Sorted Set (IP -> timestamp)
SPAM_JANELA_SEGUNDOS = int(os.environ.get("PRODMAKER_SPAM_JANELA") or "60")
SPAM_LIMITE = int(os.environ.get("PRODMAKER_SPAM_LIMITE") or "10")


def _redis_url() -> str | None:
    env = (os.environ.get("REDIS_URL") or "").strip()
    if env:
        return env
    keys = (get_settings().get("api_keys") or {}).get("redis") or {}
    return (keys.get("url") or "").strip() or None


def _redis():
    url = _redis_url()
    if not url:
        return None
    try:
        import redis

        client = redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)
        client.ping()
        return client
    except Exception:
        return None  # sem Redis: fallback SQLite


def redis_ativo() -> bool:
    return _redis() is not None


# ---------------------------------------------------------------------------
# Blacklist (Cuckoo Filter quando há Redis; tabela local sempre)
# ---------------------------------------------------------------------------


def _bloqueados_locais() -> dict[str, str]:
    with get_db() as conn:
        rows = conn.execute("SELECT ip, motivo FROM ips_bloqueados ORDER BY id DESC").fetchall()
    return {row["ip"]: row["motivo"] for row in rows}


def bloquear_ip(ip: str, motivo: str = "manual") -> dict:
    ip = (ip or "").strip()
    if not ip:
        raise LLMError("Informe o IP a bloquear.")
    client = _redis()
    if client:
        try:
            client.execute_command("CF.ADDR", CUCKOO_KEY, ip)
        except Exception:
            pass  # filtro ausente no servidor: fica só local
    with get_db() as conn:
        existe = conn.execute("SELECT id FROM ips_bloqueados WHERE ip = ?", (ip,)).fetchone()
        if not existe:
            conn.execute(
                "INSERT INTO ips_bloqueados (ip, motivo, origem, created_at) VALUES (?, ?, ?, ?)",
                (ip, motivo, "redis" if client else "sqlite", now_str()),
            )
    return {"ok": True, "ip": ip, "engine": "redis" if client else "sqlite"}


def desbloquear_ip(ip: str) -> None:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM ips_bloqueados WHERE ip = ?", (ip.strip(),))
        if cursor.rowcount == 0:
            raise LLMError("IP não encontrado na lista de bloqueio.")


def ip_bloqueado(ip: str) -> bool:
    if not ip:
        return False
    client = _redis()
    if client:
        try:
            resposta = client.execute_command("CF.EXISTS", CUCKOO_KEY, ip)
            if isinstance(resposta, list):
                resposta = resposta[0] if resposta else 0
            if int(resposta):
                return True
        except Exception:
            pass  # redis sem o módulo RedisBloom: cai no local
    return (ip or "").strip() in _bloqueados_locais()


# ---------------------------------------------------------------------------
# Click spamming (Sorted Set quando há Redis)
# ---------------------------------------------------------------------------


def registrar_clique(ip: str, page: str = "") -> dict:
    """Registra um clique e devolve {spam: bool, cliques_janela: N}."""
    ip = (ip or "").strip()
    if not ip:
        return {"spam": False, "cliques_janela": 0, "bloqueado": False}
    agora = time.time()
    cliques = 0
    client = _redis()
    if client:
        try:
            member = f"{int(agora * 1000)}:{ip}"
            pipeline = client.pipeline()
            pipeline.execute_command("ZADD", SPAM_KEY, agora, member)
            pipeline.execute_command("ZREMRANGEBYSCORE", SPAM_KEY, 0, agora - SPAM_JANELA_SEGUNDOS)
            pipeline.execute_command(
                "ZCOUNT", SPAM_KEY, (int((agora - SPAM_JANELA_SEGUNDOS) * 1000)), int(agora * 1000)
            )
            cliques = int(pipeline.execute()[-1])
        except Exception:
            cliques = _cliques_local(ip, agora, page)
    else:
        cliques = _cliques_local(ip, agora, page)
    spam = cliques >= SPAM_LIMITE
    return {"spam": spam, "cliques_janela": cliques, "bloqueado": ip_bloqueado(ip)}


def _cliques_local(ip: str, agora: float, page: str = "") -> int:
    with get_db() as conn:
        conn.execute("DELETE FROM fraude_eventos WHERE created_epoch < ?", (agora - SPAM_JANELA_SEGUNDOS * 2,))
        conn.execute("INSERT INTO fraude_eventos (ip, page, created_epoch, created_at) VALUES (?, ?, ?, ?)", (ip, page or "", agora, now_str()))
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM fraude_eventos WHERE ip = ? AND created_epoch > ?",
            (ip, agora - SPAM_JANELA_SEGUNDOS),
        ).fetchone()
    return int(row["n"])


# ---------------------------------------------------------------------------
# Painel / API
# ---------------------------------------------------------------------------


def resumo() -> dict:
    bloqueados = _bloqueados_locais()
    spam_24h = 0
    with get_db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM fraude_eventos WHERE created_at >= datetime('now', '-1 day') GROUP BY ip HAVING COUNT(*) >= ?",
            (SPAM_LIMITE,),
        ).fetchone()
        spam_24h = row["n"] if row else 0
    return {
        "redis_ativo": redis_ativo(),
        "ips_bloqueados": [
            {"ip": ip, "motivo": motivo} for ip, motivo in bloqueados.items()
        ],
        "total_bloqueados": len(bloqueados),
        "spam_ultimas_24h": spam_24h,
        "janela_segundos": SPAM_JANELA_SEGUNDOS,
        "limite_cliques": SPAM_LIMITE,
    }


def avaliar_visita(ip: str) -> dict:
    """Chamado pelo /track: decide se a visita entra no tracking."""
    if ip_bloqueado(ip):
        return {"bloqueado": True, "motivo": _bloqueados_locais().get((ip or "").strip(), "blacklist")}
    return {"bloqueado": False}
