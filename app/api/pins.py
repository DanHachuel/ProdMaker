from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import pinterest
from ..services.database import get_db, row_to_dict
from ..services.llm import LLMError

router = APIRouter(prefix="/api/pins", tags=["pinterest"])


def _produto_or_none(produto_id: int | None) -> dict:
    if not produto_id:
        return {"id": None, "nome": "Produto", "nicho": ""}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    return row_to_dict(row) if row else {"id": produto_id, "nome": "Produto", "nicho": ""}


class GerarBody(BaseModel):
    produto_id: int | None = None
    board: str = ""
    link: str = ""
    quantidade: int = 10


class StatusBody(BaseModel):
    status: str


class AgendarBody(BaseModel):
    imagem_path: str = ""


class ExportBody(BaseModel):
    pin_ids: list = []


@router.get("")
def listar(produto_id: int | None = None):
    return pinterest.listar(produto_id)


@router.post("/gerar")
def gerar(body: GerarBody):
    produto = _produto_or_none(body.produto_id)
    try:
        return pinterest.gerar_ideias(produto, body.board, body.link, body.quantidade)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{pin_id}/status")
def status(pin_id: int, body: StatusBody):
    try:
        return pinterest.marcar(pin_id, body.status)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{pin_id}/agendar")
def agendar(pin_id: int, body: AgendarBody):
    try:
        return pinterest.agendar(pin_id, body.imagem_path)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/export")
def exportar(body: ExportBody):
    csv_text = pinterest.exportar_csv([int(item) for item in body.pin_ids])
    return {"csv": csv_text}


@router.delete("/{pin_id}")
def remover(pin_id: int):
    try:
        pinterest.remover(pin_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}
