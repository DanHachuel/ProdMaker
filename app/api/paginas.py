from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..services.database import get_db, now_str, row_to_dict
from ..services.llm import LLMError
from ..services.pages import gerar_pagina, salvar_html
from ..services.publish import publicar_pagina
from ..services.clone import clonar_url
from ..services.store import STORAGE

router = APIRouter(prefix="/api/paginas", tags=["paginas"])


class PaginaBody(BaseModel):
    tipo: str  # presell | vendas | clone
    produto_id: int | None = None
    titulo: str = ""
    idioma: str = "Português"
    afiliado_link: str = ""
    checkout_link: str = ""
    avatar: str = ""
    resultado: str = ""
    tempo: str = ""
    dor: str = ""
    prompt: str = ""
    clone_url: str = ""


def _get_produto(produto_id: int | None):
    if not produto_id:
        return None
    with get_db() as conn:
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    return row_to_dict(row) if row else None


@router.post("")
def create_pagina(body: PaginaBody):
    if not body.titulo.strip():
        raise HTTPException(status_code=400, detail="Informe o título da página.")
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO paginas (titulo, tipo, produto_id, idioma, html_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'rascunho', ?, ?)",
            (body.titulo.strip(), body.tipo, body.produto_id, body.idioma, timestamp, timestamp),
        )
        page_id = cursor.lastrowid

    try:
        if body.tipo == "clone":
            html, _cloned_title = clonar_url(body.clone_url)
            provider = "clone"
        else:
            produto = _get_produto(body.produto_id)
            result = gerar_pagina(body.tipo, produto, body.model_dump())
            html = result["html"]
            provider = result["provider"]
        salvar_html(page_id, html)
        rel_path = f"pages/{page_id}/index.html"
        with get_db() as conn:
            conn.execute("UPDATE paginas SET html_path = ?, updated_at = ? WHERE id = ?", (rel_path, now_str(), page_id))
            row = conn.execute("SELECT * FROM paginas WHERE id = ?", (page_id,)).fetchone()
        record = row_to_dict(row)
        record["preview_url"] = f"/pages/{page_id}"
        record["provider"] = provider
        return record
    except (LLMError, RuntimeError) as exc:
        with get_db() as conn:
            conn.execute("DELETE FROM paginas WHERE id = ?", (page_id,))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("")
def list_paginas():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM paginas ORDER BY id DESC").fetchall()
    result = []
    for row in rows:
        record = row_to_dict(row)
        record["preview_url"] = f"/pages/{record['id']}"
        result.append(record)
    return result


@router.get("/{page_id}/html")
def get_html(page_id: int):
    record = _get_or_404(page_id)
    path = STORAGE / record["html_path"] if record["html_path"] else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="HTML não encontrado.")
    return {"html": path.read_text(encoding="utf-8")}


@router.put("/{page_id}/html")
def update_html(page_id: int, payload: dict):
    _get_or_404(page_id)
    html = payload.get("html")
    if not html or not html.strip():
        raise HTTPException(status_code=400, detail="HTML vazio.")
    salvar_html(page_id, html)
    with get_db() as conn:
        conn.execute("UPDATE paginas SET updated_at = ? WHERE id = ?", (now_str(), page_id))
    return {"ok": True}


@router.get("/{page_id}/download")
def download_pagina(page_id: int):
    record = _get_or_404(page_id)
    path = STORAGE / record["html_path"] if record["html_path"] else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="HTML não encontrado.")
    return FileResponse(path, filename=f"{record['titulo']}.html", media_type="text/html")


@router.post("/{page_id}/publicar")
def publicar(page_id: int):
    record = _get_or_404(page_id)
    path = STORAGE / record["html_path"] if record["html_path"] else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="HTML não encontrado.")
    try:
        result = publicar_pagina(page_id, record["titulo"], path.read_text(encoding="utf-8"))
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    with get_db() as conn:
        conn.execute(
            "UPDATE paginas SET status = 'publicada', published_url = ?, updated_at = ? WHERE id = ?",
            (result["pages_url"], now_str(), page_id),
        )
    updated = _get_or_404(page_id)
    updated["publish_result"] = result
    return updated


@router.delete("/{page_id}")
def delete_pagina(page_id: int):
    record = _get_or_404(page_id)
    if record["html_path"]:
        folder = (STORAGE / record["html_path"]).parent
        if folder.exists():
            for item in folder.iterdir():
                item.unlink()
            folder.rmdir()
    with get_db() as conn:
        conn.execute("DELETE FROM paginas WHERE id = ?", (page_id,))
    return {"ok": True}


def _get_or_404(page_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM paginas WHERE id = ?", (page_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Página não encontrada.")
    return row_to_dict(row)
