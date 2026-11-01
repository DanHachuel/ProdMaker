"""Billing — planos (seed), checkout Stripe, webhook público e status da assinatura."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..services import stripe_billing
from ..services.llm import LLMError

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutBody(BaseModel):
    plano_id: str
    email: str


@router.get("/planos")
def planos():
    return stripe_billing.planos_local()


@router.get("/assinatura")
def assinatura():
    return stripe_billing.assinatura_atual()


@router.get("/historico")
def historico():
    return stripe_billing.historico()


@router.post("/checkout")
def checkout(body: CheckoutBody, request: Request):
    base = f"{request.url.scheme}://{request.headers.get('host', 'localhost:8188')}"
    try:
        return stripe_billing.criar_checkout(
            body.plano_id,
            body.email,
            f"{base}/configuracoes?checkout=ok",
            f"{base}/configuracoes?checkout=cancelado",
        )
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.options("/webhook")
def webhook_options():
    return Response(status_code=204)


@router.post("/webhook")
async def webhook_stripe(request: Request):
    """Webhook público do Stripe — verifica assinatura e processa o evento."""
    body = await request.body()
    if not stripe_billing.verificar_assinatura(body, request.headers.get("stripe-signature", "")):
        raise HTTPException(status_code=400, detail="Assinatura do webhook inválida.")
    import json

    try:
        evento = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload inválido.")
    return stripe_billing.processar_webhook(evento)
