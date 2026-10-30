from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import lancamentos
from ..services.llm import LLMError

router = APIRouter(prefix="/api/lancamentos", tags=["lancamentos"])


class IniciarBody(BaseModel):
    produto_id: int | None = None


class EtapaBody(BaseModel):
    etapa: int
    dados: dict = {}


class ProdutoBody(BaseModel):
    produto_id: int


@router.get("/etapas")
def etapas():
    return lancamentos.ETAPAS


@router.get("/atual")
def lancamento_atual():
    return lancamentos.atual()


@router.get("")
def listar():
    return lancamentos.listar()


@router.post("")
def iniciar(body: IniciarBody):
    return lancamentos.iniciar(body.produto_id)


@router.post("/{lancamento_id}/etapa")
def salvar_etapa(lancamento_id: int, body: EtapaBody):
    try:
        return lancamentos.salvar_etapa(lancamento_id, body.etapa, body.dados)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{lancamento_id}/produto")
def definir_produto(lancamento_id: int, body: ProdutoBody):
    try:
        return lancamentos.definir_produto(lancamento_id, body.produto_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{lancamento_id}/relatorio")
def relatorio(lancamento_id: int):
    try:
        return lancamentos.relatorio(lancamento_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{lancamento_id}/progresso")
def progresso(lancamento_id: int):
    try:
        record = lancamentos._get_row(lancamento_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return lancamentos.progresso(record)


@router.post("/{lancamento_id}/concluir")
def concluir(lancamento_id: int):
    try:
        return lancamentos.concluir(lancamento_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
