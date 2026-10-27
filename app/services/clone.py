"""Clonagem de páginas com higienização — remove scripts, pixels e iframes do original."""
from .llm import LLMError


def clonar_url(url: str) -> tuple[str, str]:
    """Baixa a URL e devolve (HTML higienizado, título) — scripts/pixels/iframes removidos."""
    try:
        import httpx
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise LLMError(
            f"Dependência de clonagem ausente ({exc.name}) — rode 'prodmaker install' para concluir a instalação."
        ) from exc
    if not url.strip().startswith(("http://", "https://")):
        raise LLMError("Informe uma URL válida (http/https) para clonar.")
    try:
        response = httpx.get(
            url,
            timeout=45.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ProdMaker/0.1; +local)"},
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha ao baixar a página: {exc}") from exc
    if response.status_code >= 400:
        raise LLMError(f"A página respondeu {response.status_code} — confira a URL.")

    soup = BeautifulSoup(response.text, "html.parser")

    # Higienização: remove rastreadores e código de terceiros
    for tag in soup.find_all(["script", "noscript", "iframe"]):
        tag.decompose()
    for pattern in ("facebook", "pixel", "analytics", "googletagmanager", "doubleclick", "hotjar", "clarity"):
        for img in soup.find_all("img", src=lambda src: src and pattern in src.lower()):
            img.decompose()
        for link in soup.find_all("link", href=lambda href: href and pattern in href.lower()):
            link.decompose()
    for comment in soup.find_all(string=lambda text: isinstance(text, str) and text.strip().startswith(("<!--", "<!["))):
        comment.extract()

    title = soup.title.get_text(strip=True) if soup.title else url
    meta = soup.new_tag("meta")
    meta.attrs["name"] = "generator"
    meta.attrs["content"] = "ProdMaker (clone higienizado)"
    if soup.head:
        soup.head.append(meta)
    return str(soup), title
