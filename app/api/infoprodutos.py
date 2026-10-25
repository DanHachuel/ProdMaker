from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..services.database import get_db, now_str, row_to_dict
from ..services.llm import LLMError, generate
from ..services.pdf import markdown_para_pdf
from ..services.store import STORAGE
from ..services import gamma as gamma_service

router = APIRouter(prefix="/api/infoprodutos", tags=["infoprodutos"])

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


class InfoprodutoBody(BaseModel):
    titulo: str
    prompt: str
    formato: str = "E-book"
    nicho: str = ""
    dor: str = ""
    avatar: str = ""
    resultado: str = ""
    modo: str = "rapido"  # rapido (LLM+PDF local) | gamma (API premium)


def _build_prompt(body: InfoprodutoBody) -> str:
    template_path = SEED_DIR / "prompts" / "infoproduto.md"
    template = template_path.read_text(encoding="utf-8") if template_path.exists() else ""
    return (
        template.replace("{FORMATO}", body.formato)
        .replace("{NICHO}", body.nicho)
        .replace("{DOR}", body.dor)
        .replace("{AVATAR}", body.avatar)
        .replace("{RESULTADO}", body.resultado)
        + f"\n\n**Título desejado:** {body.titulo}\n**Instrução adicional do usuário:** {body.prompt}\n"
    )


@router.post("")
def create_infoproduto(body: InfoprodutoBody):
    if not body.titulo.strip():
        raise HTTPException(status_code=400, detail="Informe o título do infoproduto.")
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO infoprodutos (titulo, formato, nicho, modo, provider, created_at) VALUES (?, ?, ?, ?, '', ?)",
            (body.titulo.strip(), body.formato, body.nicho.strip(), body.modo, timestamp),
        )
        record_id = cursor.lastrowid

    folder = STORAGE / "produtos" / str(record_id)
    try:
        if body.modo == "gamma":
            from ..services.store import get_settings

            gamma_keys = (get_settings().get("api_keys") or {}).get("gamma") or {}
            api_key = (gamma_keys.get("api_key") or "").strip()
            base_url = (gamma_keys.get("base_url") or "").strip()
            if not api_key:
                raise LLMError("Modo Premium (Gamma) requer a API key da Gamma — configure em Chaves de API.")
            pdf_bytes = gamma_service.gerar_pdf_gamma(api_key, base_url, body.titulo.strip(), _build_prompt(body))
            folder.mkdir(parents=True, exist_ok=True)
            pdf_path = folder / "infoproduto.pdf"
            pdf_path.write_bytes(pdf_bytes)
            md_path = None
            provider = "gamma"
        else:
            result = generate(
                _build_prompt(body),
                system="Você é um especialista em criação de infoprodutos low-ticket. Gere conteúdo prático e direto em Markdown.",
                max_tokens=8000,
            )
            md_text = result["text"]
            folder.mkdir(parents=True, exist_ok=True)
            md_path = folder / "infoproduto.md"
            md_path.write_text(md_text, encoding="utf-8")
            pdf_path = markdown_para_pdf(md_text, folder / "infoproduto.pdf")
            provider = result["provider"]

        rel_pdf = pdf_path.relative_to(STORAGE).as_posix()
        rel_md = md_path.relative_to(STORAGE).as_posix() if md_path else ""
        with get_db() as conn:
            conn.execute(
                "UPDATE infoprodutos SET provider = ?, pdf_path = ?, md_path = ? WHERE id = ?",
                (provider, rel_pdf, rel_md, record_id),
            )
            row = conn.execute("SELECT * FROM infoprodutos WHERE id = ?", (record_id,)).fetchone()
        return row_to_dict(row)
    except (LLMError, gamma_service.GammaError, RuntimeError) as exc:
        with get_db() as conn:
            conn.execute("DELETE FROM infoprodutos WHERE id = ?", (record_id,))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("")
def list_infoprodutos():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM infoprodutos ORDER BY id DESC").fetchall()
    return [row_to_dict(row) for row in rows]


@router.get("/{infoproduto_id}/download")
def download_infoproduto(infoproduto_id: int):
    row = _get_or_404(infoproduto_id)
    pdf_path = STORAGE / row["pdf_path"]
    if not row["pdf_path"] or not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF não encontrado.")
    return FileResponse(pdf_path, filename=f"{row['titulo']}.pdf", media_type="application/pdf")


@router.get("/{infoproduto_id}/markdown")
def infoproduto_markdown(infoproduto_id: int):
    row = _get_or_404(infoproduto_id)
    md_path = STORAGE / row["md_path"] if row["md_path"] else None
    if not md_path or not md_path.exists():
        raise HTTPException(status_code=404, detail="Markdown não disponível para este infoproduto.")
    return {"markdown": md_path.read_text(encoding="utf-8")}


@router.delete("/{infoproduto_id}")
def delete_infoproduto(infoproduto_id: int):
    row = _get_or_404(infoproduto_id)
    for rel in (row["pdf_path"], row["md_path"]):
        if rel:
            path = STORAGE / rel
            if path.exists():
                path.unlink(missing_ok=True)
    with get_db() as conn:
        conn.execute("DELETE FROM infoprodutos WHERE id = ?", (infoproduto_id,))
    return {"ok": True}


def _get_or_404(infoproduto_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM infoprodutos WHERE id = ?", (infoproduto_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Infoproduto não encontrado.")
    return row
