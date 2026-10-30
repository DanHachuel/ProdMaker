"""AdsNotify — notificações push (apprise) + histórico local.

- Canais: URLs apprise configuradas em settings.notifications.targets. Se houver Telegram
  configurado em Chaves de API, o destino t://TOKEN/CHATID entra automaticamente.
- Eventos com toggle em settings.notifications.eventos (default: desligados).
- Falha de envio NUNCA quebra o fluxo — apenas registra no histórico.
"""
import json
import time

from .database import get_db, now_str, row_to_dict
from .llm import LLMError
from .store import get_settings

EVENTOS = {
    "venda_recebida": "Venda recebida",
    "campanha_publicada": "Campanha publicada",
    "pagina_publicada": "Página publicada",
    "infoproduto_gerado": "Infoproduto gerado",
}


def _telegram_target() -> str | None:
    keys = (get_settings().get("api_keys") or {}).get("telegram") or {}
    token = (keys.get("bot_token") or "").strip()
    chat_id = (keys.get("chat_id") or "").strip()
    if token and chat_id:
        return f"tgram://{token}/{chat_id}"
    return None


def listar_config() -> dict:
    settings = get_settings()
    notifications = settings.get("notifications") or {}
    return {
        "eventos": {key: bool((notifications.get("eventos") or {}).get(key, False)) for key in EVENTOS},
        "targets": notifications.get("targets") or [],
        "eventos_disponiveis": EVENTOS,
        "canal_telegram": bool(_telegram_target()),
    }


def salvar_config(eventos: dict, targets: list) -> dict:
    settings = get_settings()
    current = settings.get("notifications") or {}
    merged_eventos = {key: bool((current.get("eventos") or {}).get(key, False)) for key in EVENTOS}
    merged_eventos.update({key: bool(value) for key, value in (eventos or {}).items() if key in EVENTOS})
    settings["notifications"] = {"eventos": merged_eventos, "targets": [str(item).strip() for item in (targets or []) if str(item).strip()]}
    from .store import save_settings

    save_settings(settings)
    return listar_config()


def historico(limit: int = 50) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM notificacoes ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [row_to_dict(row) for row in rows]


def _registrar(event: str, titulo: str, mensagem: str, canal: str, status: str, erro: str = "") -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO notificacoes (event, titulo, mensagem, canal, status, erro, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event, titulo, mensagem, canal, status, erro[:2000], now_str()),
        )


def _alvos() -> list[str]:
    settings = get_settings()
    targets = list((settings.get("notifications") or {}).get("targets") or [])
    telegram = _telegram_target()
    if telegram and telegram not in targets:
        targets.insert(0, telegram)
    return [item for item in targets if item.strip()]


def _is_enabled(event: str) -> bool:
    settings = get_settings()
    return bool(((settings.get("notifications") or {}).get("eventos") or {}).get(event, False))


def enviar(event: str, titulo: str, mensagem: str, forcar: bool = False) -> dict:
    """Envia uma notificação pelos canais configurados (best-effort)."""
    if not forcar and not _is_enabled(event):
        return {"enviado": False, "motivo": "evento desligado"}
    alvos = _alvos()
    if not alvos:
        erro = "Nenhum canal configurado (settings.notifications.targets ou Telegram em Chaves de API)."
        _registrar(event, titulo, mensagem, "", "erro", erro)
        if forcar:
            raise LLMError(erro)
        return {"enviado": False, "motivo": erro}
    try:
        import apprise
    except ImportError as exc:
        _registrar(event, titulo, mensagem, ",".join(alvos), "erro", f"apprise ausente ({exc.name}) — rode 'prodmaker install'.")
        return {"enviado": False, "motivo": "apprise não instalado"}
    apobj = apprise.Apprise()
    enviados = []
    erros = []
    for alvo in alvos:
        if apobj.add(alvo):
            enviados.append(alvo)
        else:
            erros.append(f"canal inválido: {alvo}")
    if not enviados:
        erro = "; ".join(erros)
        _registrar(event, titulo, mensagem, ",".join(alvos), "erro", erro)
        raise LLMError(erro)
    ok = apobj.notify(title=titulo, body=mensagem)
    if ok:
        _registrar(event, titulo, mensagem, ",".join(enviados), "enviada")
        return {"enviado": True, "canais": enviados}
    erro = "apprise não conseguiu entregar (verifique tokens/chat id)."
    _registrar(event, titulo, mensagem, ",".join(enviados), "erro", erro)
    raise LLMError(erro)


def notify_event(event: str, titulo: str, mensagem: str) -> None:
    """Hook seguro: usado pelos fluxos de venda/página/campanha/infoproduto."""
    try:
        enviar(event, titulo, mensagem)
    except LLMError:
        pass
    except Exception:  # noqa: BLE001 — notificação nunca quebra a operação principal
        pass
