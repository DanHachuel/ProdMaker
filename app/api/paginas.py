from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..deps import get_current_user
from ..services.database import get_db, now_str, row_to_dict
from ..services.llm import LLMError
from ..services.pages import gerar_pagina, salvar_html
from ..services.publish import publicar_pagina, slugify
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
def create_pagina(body: PaginaBody, user=Depends(get_current_user)):
    if not body.titulo.strip():
        raise HTTPException(status_code=400, detail="Informe o título da página.")
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO paginas (user_id, titulo, tipo, produto_id, idioma, html_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', 'rascunho', ?, ?)",
            (user["user_id"], body.titulo.strip(), body.tipo, body.produto_id, body.idioma, timestamp, timestamp),
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
            conn.execute("UPDATE paginas SET html_path = ?, updated_at = ? WHERE id = ? AND user_id = ?", (rel_path, now_str(), page_id, user["user_id"]))
            row = conn.execute("SELECT * FROM paginas WHERE id = ? AND user_id = ?", (page_id, user["user_id"])).fetchone()
        record = row_to_dict(row)
        record["preview_url"] = f"/pages/{page_id}"
        record["provider"] = provider
        return record
    except (LLMError, RuntimeError) as exc:
        with get_db() as conn:
            conn.execute("DELETE FROM paginas WHERE id = ?", (page_id,))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("")
def list_paginas(user=Depends(get_current_user)):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM paginas WHERE user_id = ? ORDER BY id DESC", (user["user_id"],)).fetchall()
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


class PublicarBody(BaseModel):
    dominio_id: int


def _get_dominio_or_404(dominio_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM dominios WHERE id = ?", (dominio_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Domínio não encontrado — cadastre-o em AdsHosting.")
    return row_to_dict(row)


def _product_slug(page: dict) -> str:
    """Slugar do produto vinculado (pasta no repositório do domínio)."""
    if page.get("produto_id"):
        produto = _get_produto(page["produto_id"])
        if produto and produto.get("nome"):
            return slugify(produto["nome"])
    return slugify(page["titulo"])


@router.post("/{page_id}/publicar")
def publicar(page_id: int, body: PublicarBody):
    record = _get_or_404(page_id)
    dominio = _get_dominio_or_404(body.dominio_id)
    if dominio["status"] != "online":
        raise HTTPException(
            status_code=400,
            detail=f"Domínio {dominio['nome']} ainda não está online (NS pendente). Verifique em AdsHosting → Domínios.",
        )
    path = STORAGE / record["html_path"] if record["html_path"] else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="HTML não encontrado.")
    slug = _product_slug(record)
    try:
        result = publicar_pagina(record["titulo"], path.read_text(encoding="utf-8"), dominio["nome"], slug)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    with get_db() as conn:
        conn.execute(
            "UPDATE paginas SET status = 'publicada', published_url = ?, dominio_id = ?, updated_at = ? WHERE id = ?",
            (result["pages_url"], dominio["id"], now_str(), page_id),
        )
    updated = _get_or_404(page_id)
    updated["publish_result"] = result

    from ..services.notify import notify_event

    notify_event(
        "pagina_publicada",
        "Página publicada",
        f"{updated['titulo']} — {result['pages_url']}",
    )
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
