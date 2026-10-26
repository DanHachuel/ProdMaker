"""Geração de landing pages via LLM — pre-sell (afiliado) e página de vendas (12 seções)."""
import re
from pathlib import Path

from .llm import LLMError, generate
from .store import STORAGE

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


def _pixel_snippet() -> str:
    """Pixel do ProdMaker embutido nas páginas geradas (se configurado)."""
    from .store import get_settings

    settings = get_settings()
    pixel_url = (((settings.get("api_keys") or {}).get("tracking") or {}).get("pixel_url") or "").strip()
    if not pixel_url:
        return ""
    base = pixel_url.rstrip("/")
    return (
        "\n<!-- ProdMaker Pixel -->\n<script>\n"
        "(function(){\n"
        f"  var base = \"{base}\";\n"
        "  var q = new URLSearchParams(window.location.search);\n"
        "  var params = \"event=pageview&page=\" + encodeURIComponent(location.pathname) +\n"
        "    \"&ref=\" + encodeURIComponent(document.referrer || \"\") +\n"
        "    \"&gclid=\" + encodeURIComponent(q.get(\"gclid\") || \"\") +\n"
        "    \"&utm_source=\" + encodeURIComponent(q.get(\"utm_source\") || \"\") +\n"
        "    \"&utm_medium=\" + encodeURIComponent(q.get(\"utm_medium\") || \"\") +\n"
        "    \"&utm_campaign=\" + encodeURIComponent(q.get(\"utm_campaign\") || \"\");\n"
        "  try { navigator.sendBeacon(base + \"?\" + params); } catch (e) {}\n"
        "  document.addEventListener(\"click\", function (e) {\n"
        "    var a = e.target.closest ? e.target.closest(\"a[href]\") : null;\n"
        "    if (a) { try { navigator.sendBeacon(base + \"?event=cta_click&href=\" + encodeURIComponent(a.href)); } catch (err) {} }\n"
        "  }, true);\n"
        "  window.addEventListener(\"beforeunload\", function () {\n"
        "    try { navigator.sendBeacon(base + \"?event=unload&seconds=\" + Math.round(performance.now() / 1000)); } catch (e) {}\n"
        "  });\n"
        "})();\n</script>\n"
    )


def _load_template(nome: str) -> str:
    path = SEED_DIR / "prompts" / nome
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _fill(template: str, values: dict) -> str:
    for key, value in values.items():
        template = template.replace("{" + key + "}", str(value or ""))
    return template


def _ensure_single_html(html: str) -> str:
    """Extrai o primeiro documento HTML completo da resposta do LLM."""
    match = re.search(r"<!DOCTYPE html>.*</html>", html, re.DOTALL | re.IGNORECASE)
    return (match.group(0) if match else html).strip()


def gerar_pagina(tipo: str, produto: dict | None, form: dict) -> dict:
    """Gera o HTML da página. tipo: 'presell' | 'vendas'."""
    if tipo not in ("presell", "vendas"):
        raise LLMError("Tipo de página inválido.")
    produto = produto or {}
    afiliado = (form.get("afiliado_link") or produto.get("link_afiliado") or "").strip()
    checkout = (form.get("checkout_link") or afiliado or "#").strip()
    template = _load_template("pre-sell.md" if tipo == "presell" else "pagina-vendas.md")
    prompt = _fill(
        template,
        {
            "NOME_DO_PRODUTO": form.get("titulo") or produto.get("nome") or "Produto",
            "NOME": produto.get("nome") or form.get("titulo") or "Produto",
            "RESUMO": produto.get("analysis") and "ver análise" or form.get("prompt") or "",
            "PRECO": produto.get("preco") or "",
            "AVATAR": form.get("avatar") or "",
            "RESULTADO": form.get("resultado") or "",
            "TEMPO": form.get("tempo") or "poucos dias",
            "DOR": form.get("dor") or produto.get("nicho") or "",
            "LINK_AFILIADO": afiliado or checkout,
            "LINK_CHECKOUT": checkout,
            "PIXEL_SNIPPET": _pixel_snippet(),
        },
    )
    idioma = form.get("idioma") or "Português"
    system = (
        f"Escreva TODO o conteúdo da página em {idioma}. "
        "Você é um copywriter de direct response especialista em páginas de alta conversão. "
        "Retorne APENAS o HTML completo em um único arquivo (CSS e JS embutidos), sem comentários fora do código."
    )
    result = generate(prompt, system=system, max_tokens=8000)
    html = _ensure_single_html(result["text"])
    if "</html>" not in html.lower():
        html = f"<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>{form.get('titulo') or 'Página'}</title></head><body>{html}</body></html>"
    return {"html": html, "provider": result["provider"]}


def salvar_html(page_id: int, html: str) -> Path:
    folder = STORAGE / "pages" / str(page_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "index.html"
    path.write_text(html, encoding="utf-8")
    return path
