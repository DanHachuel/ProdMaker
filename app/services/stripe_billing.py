"""Stripe — planos, checkout sessions e webhooks de assinatura (infraestrutura pronta).

Modo local primeiro: sem chaves Stripe, o app segue 100% liberado (nenhuma trava).
Com stripe_secret_key + stripe_price_id configurados, o checkout e os webhooks
passam a operar. Verificação de assinatura do webhook (t=...,v1=...) via HMAC-SHA256.
"""
import hashlib
import hmac
import json
import time
from pathlib import Path

import httpx

from .database import get_db, now_str, row_to_dict
from .llm import LLMError
from .store import get_settings, save_settings

STRIPE_API = "https://api.stripe.com/v1"
SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


def _keys() -> dict:
    keys = (get_settings().get("api_keys") or {}).get("stripe") or {}
    return {
        "secret_key": (keys.get("secret_key") or "").strip(),
        "webhook_secret": (keys.get("webhook_secret") or "").strip(),
    }


def planos_local() -> dict:
    path = SEED_DIR / "planos.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"planos": [], "nota": "seed/planos.json ausente."}


def _plano(plano_id: str) -> dict | None:
    for plano in planos_local().get("planos") or []:
        if plano.get("id") == plano_id:
            return plano
    return None


def criar_checkout(plano_id: str, email: str, sucesso_url: str, cancelamento_url: str) -> dict:
    config = _keys()
    plano = _plano(plano_id)
    if not plano:
        raise LLMError(f"Plano '{plano_id}' não encontrado em seed/planos.json.")
    price_id = (plano.get("stripe_price_id") or "").strip()
    if not config["secret_key"] or not price_id:
        raise LLMError(
            "Assinatura requer Stripe configurado: stripe_secret_key e o stripe_price_id do plano "
            "(em seed/planos.json / Chaves de API). Sem isso, o app segue liberado em modo local."
        )
    try:
        response = httpx.post(
            f"{STRIPE_API}/checkout/sessions",
            headers={"Authorization": f"Bearer {config['secret_key']}"},
            data={
                "mode": "subscription",
                "customer_email": email,
                "client_reference_id": plano_id,
                "line_items[0][price]": price_id,
                "line_items[0][quantity]": "1",
                "success_url": sucesso_url,
                "cancel_url": cancelamento_url,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com o Stripe: {exc}", provider="stripe", transient=True) from exc
    payload = response.json() or {}
    if response.status_code >= 400:
        raise LLMError(
            f"Stripe rejeitou o checkout ({response.status_code}): {(payload.get('error') or {}).get('message', payload)}",
            provider="stripe",
        )
    _registrar(plano_id, email, "checkout_criado", payload.get("id", ""), payload)
    return {"ok": True, "checkout_url": payload.get("url"), "session_id": payload.get("id")}


def verificar_assinatura(payload_body: bytes, cabecalho: str) -> bool:
    """Stripe-Signature: t=<ts>,v1=<hmac_sha256(secret, ts.body)>"""
    secret = _keys()["webhook_secret"]
    if not secret:
        return True  # sem segredo configurado não há como verificar localmente
    partes = {}
    for item in cabecalho.split(","):
        key, _, valor = item.strip().partition("=")
        partes[key] = valor
    timestamp = partes.get("t", "")
    assinatura = partes.get("v1", "")
    if not timestamp or not assinatura:
        return False
    esperado = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, assinatura)


def processar_webhook(evento: dict) -> dict:
    tipo = evento.get("type", "")
    objeto = (evento.get("data") or {}).get("object") or {}
    if tipo == "checkout.session.completed":
        plano_id = objeto.get("client_reference_id") or ""
        email = (objeto.get("customer_details") or {}).get("email") or objeto.get("customer_email") or ""
        _registrar(plano_id, email, "assinatura_ativa", objeto.get("subscription") or objeto.get("id", ""), objeto)
    elif tipo in ("customer.subscription.deleted", "customer.subscription.paused"):
        _registrar("", "", "assinatura_cancelada", objeto.get("id", ""), objeto)
    elif tipo == "invoice.paid":
        _registrar("", "", "pagamento_aprovado", objeto.get("id", ""), objeto)
    return {"ok": True, "tipo": tipo}


def _registrar(plano_id: str, email: str, status: str, stripe_ref: str, payload: dict) -> None:
    with get_db() as conn:
        if status == "assinatura_ativa":
            conn.execute(
                "INSERT INTO assinaturas (plano, email, stripe_ref, status, current_period_end, created_at) VALUES (?, ?, ?, 'ativa', ?, ?)",
                (plano_id, email, stripe_ref, time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() + 30 * 86400)), now_str()),
            )
        elif status == "assinatura_cancelada":
            conn.execute("UPDATE assinaturas SET status = 'cancelada' WHERE stripe_ref = ?", (stripe_ref,))
        elif status == "checkout_criado":
            conn.execute(
                "INSERT INTO assinaturas (plano, email, stripe_ref, status, current_period_end, created_at) VALUES (?, ?, ?, 'checkout', '', ?)",
                (plano_id, email, stripe_ref, now_str()),
            )


def assinatura_atual() -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM assinaturas WHERE status IN ('ativa','checkout') ORDER BY id DESC LIMIT 1").fetchone()
    config = _keys()
    base = {
        "stripe_configurado": bool(config["secret_key"]),
        "modo": "local" if not config["secret_key"] else "cloud",
        "recursos_liberados": True,  # regra: nenhuma trava de pré-registo no app local
    }
    if row:
        base["assinatura"] = row_to_dict(row)
    return base


def historico(limit: int = 30) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM assinaturas ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [row_to_dict(row) for row in rows]
