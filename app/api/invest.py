"""Investimento em tráfego — endpoints (registro diário para ROAS real)."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..services import invest
from ..services.llm import LLMError
from fastapi import HTTPException

router = APIRouter(prefix="/api/investimentos", tags=["investimentos"])


class InvestBody(BaseModel):
    valor: float
    data: str = ""
    observacao: str = ""


@router.get("")
def listar():
    return {"registros": invest.listar(), "resumo": invest.resumo_financeiro()}


@router.post("")
def registrar(body: InvestBody):
    try:
        return invest.registrar(body.valor, body.data, body.observacao)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{investimento_id}")
def remover(investimento_id: int):
    try:
        invest.remover(investimento_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}
