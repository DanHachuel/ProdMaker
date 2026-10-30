from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import notify
from ..services.llm import LLMError

router = APIRouter(prefix="/api/notificacoes", tags=["notificacoes"])


class ConfigBody(BaseModel):
    eventos: dict = {}
    targets: list = []


class TesteBody(BaseModel):
    titulo: str = "Teste ProdMaker"
    mensagem: str = "Notificação de teste do ProdMaker."


@router.get("")
def config():
    return notify.listar_config()


@router.put("")
def salvar(body: ConfigBody):
    return notify.salvar_config(body.eventos, body.targets)


@router.get("/historico")
def historico():
    return notify.historico()


@router.post("/teste")
def teste(body: TesteBody):
    try:
        return notify.enviar("teste", body.titulo, body.mensagem, forcar=True)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
