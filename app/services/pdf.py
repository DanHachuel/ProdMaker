"""Geração de PDF — Markdown -> HTML (estilo A4) -> PDF via xhtml2pdf (puro Python)."""
import re
from pathlib import Path

EMOJI_RE = re.compile("[\U00010000-\U0010FFFF]")

A4_CSS = """
<style>
@page { size: A4; margin: 2cm; }
body { font-family: Helvetica; font-size: 11pt; color: #1e293b; line-height: 1.5; }
h1 { color: #7C3AED; font-size: 20pt; margin-bottom: 6pt; }
h2 { color: #6D28D9; font-size: 14pt; margin-top: 16pt; }
h3 { color: #4C1D95; font-size: 12pt; }
table { border-collapse: collapse; width: 100%; margin-top: 8pt; }
th, td { border: 1px solid #cbd5e1; padding: 6pt; font-size: 10pt; }
th { background-color: #ede9fe; }
blockquote { color: #64748b; }
li { margin-bottom: 3pt; }
</style>
"""


def markdown_para_pdf(md_text: str, output_path: Path) -> Path:
    """Converte Markdown em PDF A4. Retorna o caminho do PDF gerado."""
    try:
        import markdown
        from xhtml2pdf import pisa
    except ImportError as exc:
        raise RuntimeError(
            f"Dependência de PDF ausente ({exc.name}) — rode 'prodmaker install' para concluir a instalação."
        ) from exc

    clean = EMOJI_RE.sub("", md_text or "")
    body = markdown.markdown(clean, extensions=["extra", "toc"])
    html = f"<html><head><meta charset='utf-8'/>{A4_CSS}</head><body>{body}</body></html>"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as handle:
        status = pisa.CreatePDF(html, dest=handle, encoding="utf-8")
    if status.err:
        raise RuntimeError("Falha ao gerar o PDF (xhtml2pdf).")
    return output_path
