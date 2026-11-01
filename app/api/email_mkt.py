"""E-mail Marketing (AdsAcademy) — sequências com gatilho, envio manual e histórico."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import email_mkt
from ..services.llm import LLMError

router = APIRouter(prefix="/api/email", tags=["email"])


class SequenciaBody(BaseModel):
    nome: str
    gatilho: str
    assunto: str
    corpo: str
    ativo: bool = True


class EnviarBody(BaseModel):
    sequencia_id: int
    destinos: list = []
    variaveis: dict = {}


@router.get("/sequencias")
def sequencias():
    return email_mkt.listar()


@router.post("/sequencias")
def criar(body: SequenciaBody):
    try:
        return email_mkt.salvar(body.nome, body.gatilho, body.assunto, body.corpo, body.ativo)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/sequencias/{sequencia_id}")
def atualizar(sequencia_id: int, body: SequenciaBody):
    try:
        return email_mkt.salvar(body.nome, body.gatilho, body.assunto, body.corpo, body.ativo, sequencia_id)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/sequencias/{sequencia_id}")
def remover(sequencia_id: int):
    try:
        email_mkt.remover(sequencia_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}


@router.post("/enviar")
def enviar(body: EnviarBody):
    try:
        return email_mkt.enviar_manual(body.sequencia_id, body.destinos, body.variaveis)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/historico")
def historico():
    return email_mkt.historico()
