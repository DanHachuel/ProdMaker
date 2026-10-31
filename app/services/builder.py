"""Product Builder Wizard — motor de criação de ofertas (Fase 10).

Fluxo: 5 ofertas (nicho) -> estrutura + quiz + 3 order bumps -> 12 anuncios ->
PDF (Markdown -> HTML -> PDF) -> salva em infoprodutos + produto (AdsPages/AdsCreator
consomem automaticamente).
"""
import json
import re
from pathlib import Path

from .database import get_db, now_str, row_to_dict
from .llm import LLMError, generate
from .pdf import markdown_para_pdf
from .store import STORAGE

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


def _template(nome: str, fallback: str) -> str:
    path = SEED_DIR / "prompts" / nome
    return path.read_text(encoding="utf-8") if path.exists() else fallback


def _fill(template: str, values: dict) -> str:
    for key, value in values.items():
        template = template.replace("{" + key + "}", str(value or ""))
    return template


def _parse_json(text: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise LLMError("A resposta do LLM não contém JSON válido.")
    return json.loads(match.group(0))


def _limit_ofertas(ofertas: list) -> list:
    normalizadas = []
    for item in ofertas[:5]:
        if not isinstance(item, dict) or not (item.get("promessa") or "").strip():
            continue
        normalizadas.append({
            "nome": (item.get("nome") or "Oferta").strip()[:80],
            "promessa": (item.get("promessa") or "").strip(),
            "dores": [str(item) for item in (item.get("dores") or [])][:6],
            "entregaveis": [str(item) for item in (item.get("entregaveis") or [])][:8],
            "bonus": [str(item) for item in (item.get("bonus") or [])][:4],
            "preco_sugerido": float(item.get("preco_sugerido") or 47),
            "formato": (item.get("formato") or "E-book").strip(),
            "publico": (item.get("publico") or "").strip(),
        })
    return normalizadas


def gerar_ofertas(nicho: str, avatar: str = "") -> dict:
    nicho = (nicho or "").strip()
    if not nicho:
        raise LLMError("Informe o nicho para gerar as ofertas.")
    prompt = _fill(
        _template("builder-ofertas.md", "Gere 5 ofertas low-ticket para o nicho {NICHO} em JSON com chave 'ofertas'."),
        {"NICHO": nicho, "AVATAR": avatar or "empreendedores e afiliados do nicho"},
    )
    result = generate(prompt, system="Você é um estrategista de ofertas low-ticket. Responda SOMENTE JSON válido.", max_tokens=4000)
    try:
        parsed = _parse_json(result["text"])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON do LLM inválido: {exc}") from exc
    ofertas = _limit_ofertas(parsed.get("ofertas") or [])
    if not ofertas:
        raise LLMError("O LLM não retornou ofertas utilizáveis — tente novamente.")
    return {"ofertas": ofertas, "provider": result["provider"]}


def gerar_estrutura(oferta: dict) -> dict:
    if not oferta or not (oferta.get("promessa") or "").strip():
        raise LLMError("Selecione uma oferta antes de gerar a estrutura.")
    prompt = _fill(
        _template("builder-estrutura.md", "Gere a estrutura do produto para {OFERTA} em JSON."),
        {
            "OFERTA": oferta.get("nome") or "",
            "PROMESSA": oferta.get("promessa") or "",
            "NICHO": oferta.get("publico") or (oferta.get("dores") or [""])[0],
            "AVATAR": oferta.get("publico") or "",
        },
    )
    result = generate(prompt, system="Você é um especialista em produtos digitais. Responda SOMENTE JSON válido.", max_tokens=6000)
    try:
        estrutura = _parse_json(result["text"])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON do LLM inválido: {exc}") from exc
    if not estrutura.get("modulos"):
        raise LLMError("O LLM não retornou módulos — tente novamente.")
    return {"estrutura": estrutura, "provider": result["provider"]}


def gerar_anuncios(produto: str, promessa: str, nicho: str = "", link: str = "") -> dict:
    if not produto.strip():
        raise LLMError("Informe o nome do produto para gerar os anúncios.")
    prompt = _fill(
        _template("builder-anuncios.md", "Gere 12 anuncios para {PRODUTO} em JSON com chave 'anuncios'."),
        {"PRODUTO": produto, "PROMESSA": promessa, "NICHO": nicho, "LINK": link},
    )
    result = generate(prompt, system="Você é um copywriter de direct response. Responda SOMENTE JSON válido.", max_tokens=5000)
    try:
        parsed = _parse_json(result["text"])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON do LLM inválido: {exc}") from exc
    anuncios = [item for item in (parsed.get("anuncios") or []) if isinstance(item, dict)]
    if len(anuncios) < 12:
        raise LLMError(f"O LLM retornou {len(anuncios)} anúncios (esperado 12) — tente novamente.")
    return {"anuncios": anuncios[:12], "provider": result["provider"]}


def _imagem_prompts(oferta: dict, estrutura: dict) -> list[str]:
    prompts = [
        f"Capa de e-book high-conversion para '{oferta.get('nome')}' ({oferta.get('formato')}), promessa: {oferta.get('promessa')}",
        f"Mockup 3D do produto '{oferta.get('nome')}' para página de vendas, fundo claro, estilo premium",
    ]
    for bonus in (oferta.get("bonus") or [])[:2]:
        prompts.append(f"Capa do bônus '{bonus}', estilo coeso com a capa principal")
    for modulo in (estrutura.get("modulos") or [])[:3]:
        prompts.append(f"Imagem de módulo: {modulo.get('titulo')}")
    return prompts


def _markdown_produto(oferta: dict, estrutura: dict, preco: float, parceiro: str) -> str:
    linhas = [f"# {oferta.get('nome') or 'Produto'}", "", f"**Promessa:** {oferta.get('promessa')}", ""]
    if oferta.get("publico"):
        linhas += [f"**Público:** {oferta['publico']}", ""]
    linhas += ["## Módulos", ""]
    for modulo in estrutura.get("modulos") or []:
        linhas.append(f"### {modulo.get('titulo')}")
        for aula in modulo.get("aulas") or []:
            linhas.append(f"- {aula}")
        linhas.append("")
    if estrutura.get("ebooks"):
        linhas += ["## E-books inclusos", ""] + [f"- {item}" for item in estrutura["ebooks"]] + [""]
    if estrutura.get("ferramentas"):
        linhas += ["## Ferramentas e planilhas", ""] + [f"- {item}" for item in estrutura["ferramentas"]] + [""]
    linhas += ["## Order Bumps", ""]
    for bump in estrutura.get("order_bumps") or []:
        linhas.append(f"- **{bump.get('tipo')}**: {bump.get('nome')} — {bump.get('descricao')}")
    linhas += ["", f"## Preço", "", f"**R$ {preco:.2f}**", ""]
    if parceiro:
        linhas += [f"## Parceiro 50/50", "", parceiro, ""]
    return "\n".join(linhas)


def _ensure_columns() -> None:
    from .dbengine import add_column_if_missing

    with get_db() as conn:
        add_column_if_missing(conn, "infoprodutos", "oferta_json TEXT NOT NULL DEFAULT ''", "oferta_json")
        add_column_if_missing(conn, "infoprodutos", "estrutura_json TEXT NOT NULL DEFAULT ''", "estrutura_json")
        add_column_if_missing(conn, "infoprodutos", "anuncios_json TEXT NOT NULL DEFAULT ''", "anuncios_json")
        add_column_if_missing(conn, "infoprodutos", "preco REAL NOT NULL DEFAULT 0", "preco")
        add_column_if_missing(conn, "infoprodutos", "parceiro TEXT NOT NULL DEFAULT ''", "parceiro")


def gerar_pdf(oferta: dict, estrutura: dict, preco: float, parceiro: str = "", modo: str = "rapido") -> dict:
    """Gera o PDF do produto + prompts de imagem (Gamma/Canva). Salva em infoprodutos."""
    _ensure_columns()
    md_text = _markdown_produto(oferta, estrutura, preco, parceiro)
    prompt_imagens = _imagem_prompts(oferta, estrutura)
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO infoprodutos (titulo, formato, nicho, modo, provider, created_at) VALUES (?, ?, ?, '', 'builder', ?)",
            ((oferta.get("nome") or "Produto")[:120], oferta.get("formato") or "E-book", (oferta.get("publico") or "")[:80], timestamp),
        )
        record_id = cursor.lastrowid

    pasta = STORAGE / "produtos" / str(record_id)
    pasta.mkdir(parents=True, exist_ok=True)
    md_path = pasta / "infoproduto.md"
    md_path.write_text(md_text, encoding="utf-8")
    pdf_path = None
    erro_pdf = ""
    if modo != "somente_markdown":
        try:
            pdf_path = markdown_para_pdf(md_text, pasta / "infoproduto.pdf")
        except RuntimeError as exc:
            erro_pdf = str(exc)

    with get_db() as conn:
        conn.execute(
            "UPDATE infoprodutos SET oferta_json = ?, estrutura_json = ?, preco = ?, parceiro = ?, md_path = ?, pdf_path = ? WHERE id = ?",
            (
                json.dumps(oferta, ensure_ascii=False),
                json.dumps(estrutura, ensure_ascii=False),
                float(preco or 0),
                parceiro or "",
                md_path.relative_to(STORAGE).as_posix(),
                pdf_path.relative_to(STORAGE).as_posix() if pdf_path else "",
                record_id,
            ),
        )
        row = conn.execute("SELECT * FROM infoprodutos WHERE id = ?", (record_id,)).fetchone()
    record = row_to_dict(row)
    record["markdown"] = md_text
    record["imagem_prompts"] = prompt_imagens
    record["erro_pdf"] = erro_pdf
    return record


def salvar(anuncios: list, record_id: int) -> dict:
    _ensure_columns()
    with get_db() as conn:
        conn.execute(
            "UPDATE infoprodutos SET anuncios_json = ? WHERE id = ?",
            (json.dumps(anuncios[:12], ensure_ascii=False), record_id),
        )
        row = conn.execute("SELECT * FROM infoprodutos WHERE id = ?", (record_id,)).fetchone()
    record = row_to_dict(row)
    oferta = json.loads(record.get("oferta_json") or "{}")
    return {**record, "oferta": oferta}
