import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.database import get_db, now_str, row_to_dict
from ..services.dominios import verificar_dominio
from ..services.llm import LLMError

router = APIRouter(prefix="/api/dominios", tags=["dominios"])


class DominioBody(BaseModel):
    nome: str


class TagsBody(BaseModel):
    tags: str = ""


@router.get("")
def list_dominios():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM dominios ORDER BY id DESC").fetchall()
    return [row_to_dict(row) for row in rows]


@router.post("")
def create_dominio(body: DominioBody):
    nome = (body.nome or "").strip().lower().rstrip(".")
    if "." not in nome:
        raise HTTPException(status_code=400, detail="Informe um domínio válido (ex.: meusite.com).")
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM dominios WHERE nome = ?", (nome,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Este domínio já está cadastrado.")
        timestamp = now_str()
        cursor = conn.execute(
            "INSERT INTO dominios (nome, status, created_at, updated_at) VALUES (?, 'pendente', ?, ?)",
            (nome, timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM dominios WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


@router.post("/{dominio_id}/verificar")
def verificar(dominio_id: int):
    record = _get_or_404(dominio_id)
    try:
        resultado = verificar_dominio(record["nome"])
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    with get_db() as conn:
        conn.execute(
            "UPDATE dominios SET status = ?, ns_data = ?, a_data = ?, cf_zone_id = ?, updated_at = ? WHERE id = ?",
            (
                resultado["status"],
                json.dumps({"ns": resultado["ns"], "cf_name_servers": resultado["cf_name_servers"]}, ensure_ascii=False),
                json.dumps({"a": resultado["a"]}, ensure_ascii=False),
                resultado["cf_zone_id"],
                now_str(),
                dominio_id,
            ),
        )
        row = conn.execute("SELECT * FROM dominios WHERE id = ?", (dominio_id,)).fetchone()
    record = row_to_dict(row)
    record["verificacao"] = resultado
    return record


@router.put("/{dominio_id}/tags")
def update_tags(dominio_id: int, body: TagsBody):
    _get_or_404(dominio_id)
    with get_db() as conn:
        conn.execute("UPDATE dominios SET tags = ?, updated_at = ? WHERE id = ?", (body.tags, now_str(), dominio_id))
    return _get_or_404(dominio_id)


@router.delete("/{dominio_id}")
def delete_dominio(dominio_id: int):
    _get_or_404(dominio_id)
    with get_db() as conn:
        conn.execute("DELETE FROM dominios WHERE id = ?", (dominio_id,))
    return {"ok": True}


def _get_or_404(dominio_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM dominios WHERE id = ?", (dominio_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Domínio não encontrado.")
    return row_to_dict(row)
