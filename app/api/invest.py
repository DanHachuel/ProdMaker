"""Investimento em tráfego — endpoints (registro diário para ROAS real)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import get_current_user
from ..services import invest
from ..services.llm import LLMError
from fastapi import HTTPException

router = APIRouter(prefix="/api/investimentos", tags=["investimentos"])


class InvestBody(BaseModel):
    valor: float
    data: str = ""
    observacao: str = ""


@router.get("")
def listar(user=Depends(get_current_user)):
    return {"registros": invest.listar(60, user["user_id"]), "resumo": invest.resumo_financeiro(user["user_id"])}


@router.post("")
def registrar(body: InvestBody, user=Depends(get_current_user)):
    try:
        return invest.registrar(body.valor, body.data, body.observacao, user["user_id"])
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{investimento_id}")
def remover(investimento_id: int, user=Depends(get_current_user)):
    try:
        invest.remover(investimento_id, user["user_id"])
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}
