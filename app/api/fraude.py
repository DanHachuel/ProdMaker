"""Anti-Fraude (AdsPixel) — painel de IPs bloqueados, bloqueio/desbloqueio e resumo."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import fraude
from ..services.llm import LLMError

router = APIRouter(prefix="/api/fraude", tags=["anti-fraude"])


class BloquearBody(BaseModel):
    ip: str
    motivo: str = "manual"


@router.get("/resumo")
def resumo():
    return fraude.resumo()


@router.post("/bloquear")
def bloquear(body: BloquearBody):
    try:
        return fraude.bloquear_ip(body.ip, body.motivo)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/ips/{ip}")
def desbloquear(ip: str):
    try:
        fraude.desbloquear_ip(ip)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}
