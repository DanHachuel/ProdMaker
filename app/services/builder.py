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


def gerar_produto(oferta: dict, estrutura: dict, formato: str = "") -> dict:
    """Gera o CONTEÚDO COMPLETO do produto em Markdown (estrutura obrigatória do agente .md)."""
    if not oferta or not (oferta.get("promessa") or "").strip():
        raise LLMError("Selecione uma oferta antes de gerar o conteúdo do produto.")
    formato = (formato or oferta.get("formato") or "E-book").strip()
    prompt = _fill(
        _template("builder-produto.md", "Gere o conteudo completo do produto {OFERTA} em Markdown."),
        {
            "OFERTA": oferta.get("nome") or "",
            "FORMATO": formato,
            "PROMESSA": oferta.get("promessa") or "",
            "NICHO": oferta.get("publico") or (oferta.get("dores") or [""])[0],
            "AVATAR": oferta.get("publico") or "",
            "PRECO": oferta.get("preco_sugerido") or 47,
        },
    )
    result = generate(
        prompt,
        system="Você é um especialista em produtos digitais práticos. Escreva o produto completo em Markdown, sem comentários.",
        max_tokens=12000,
    )
    md_text = (result["text"] or "").strip()
    if len(md_text) < 400 or "##" not in md_text:
        raise LLMError("O LLM não retornou o conteúdo completo do produto — tente novamente.")
    return {"markdown": md_text, "provider": result["provider"]}


def gerar_assets(oferta: dict, preco: float = 47) -> dict:
    """Gera 3 Order Bumps (checkout/upsell/parceiro 50-50) + Quiz com IA."""
    if not oferta or not (oferta.get("promessa") or "").strip():
        raise LLMError("Selecione uma oferta antes de gerar os assets.")
    prompt = _fill(
        _template("builder-assets.md", "Gere order bumps e quiz para {OFERTA} em JSON."),
        {
            "OFERTA": oferta.get("nome") or "",
            "PROMESSA": oferta.get("promessa") or "",
            "PRECO": preco or oferta.get("preco_sugerido") or 47,
        },
    )
    result = generate(prompt, system="Você é um estrategista de monetização. Responda SOMENTE JSON válido.", max_tokens=5000)
    try:
        parsed = _parse_json(result["text"])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON do LLM inválido: {exc}") from exc
    bumps = parsed.get("order_bumps") or []
    if len(bumps) < 3:
        raise LLMError(f"O LLM retornou {len(bumps)} order bumps (esperado 3) — tente novamente.")
    return {"order_bumps": bumps[:3], "quiz": parsed.get("quiz") or {}, "provider": result["provider"]}


def gerar_anuncios(produto: str, promessa: str, nicho: str = "", link: str = "") -> dict:
    if not produto.strip():
        raise LLMError("Informe o nome do produto para gerar os anúncios.")
    prompt = _fill(
        _template("builder-anuncios.md", "Gere 12 anuncios para {PRODUTO} em JSON com chave 'anuncios'."),
        {"PRODUTO": produto, "PROMESSA": promessa, "NICHO": nicho, "LINK": link},
    )
    result = generate(prompt, system="Você é um copywriter de direct response e especialista em Pinterest. Responda SOMENTE JSON válido.", max_tokens=6000)
    try:
        parsed = _parse_json(result["text"])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON do LLM inválido: {exc}") from exc
    anuncios = [item for item in (parsed.get("anuncios") or []) if isinstance(item, dict)]
    pins = [item for item in (parsed.get("pins") or []) if isinstance(item, dict)]
    if len(anuncios) < 12:
        raise LLMError(f"O LLM retornou {len(anuncios)} anúncios (esperado 12) — tente novamente.")
    return {"anuncios": anuncios[:12], "pins": pins[:10], "provider": result["provider"]}


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
        add_column_if_missing(conn, "infoprodutos", "pins_json TEXT NOT NULL DEFAULT ''", "pins_json")
        add_column_if_missing(conn, "infoprodutos", "preco REAL NOT NULL DEFAULT 0", "preco")
        add_column_if_missing(conn, "infoprodutos", "parceiro TEXT NOT NULL DEFAULT ''", "parceiro")
        add_column_if_missing(conn, "infoprodutos", "produto_id INTEGER", "produto_id")


def gerar_landing(oferta: dict, estrutura: dict, produto_md: str = "") -> dict:
    """Gera a landing page de vendas (12 seções) via motor de páginas e salva em paginas."""
    from . import pages

    form = {
        "titulo": oferta.get("nome") or "Produto",
        "avatar": oferta.get("publico") or "",
        "resultado": oferta.get("promessa") or "",
        "dor": (oferta.get("dores") or [""])[0],
        "afiliado_link": oferta.get("checkout_link") or "",
        "checkout_link": oferta.get("checkout_link") or "",
        "prompt": (produto_md or "")[:3000],
    }
    produto_ctx = {"id": None, "nome": oferta.get("nome") or "Produto", "link_afiliado": oferta.get("checkout_link") or ""}
    resultado = pages.gerar_pagina("vendas", produto_ctx, form)
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO paginas (titulo, tipo, produto_id, idioma, html_path, status, created_at, updated_at) VALUES (?, 'vendas', NULL, ?, '', 'rascunho', ?, ?)",
            ((oferta.get("nome") or "Produto")[:120], oferta.get("idioma") or "Portugues", timestamp, timestamp),
        )
        page_id = cursor.lastrowid
    pages.salvar_html(page_id, resultado["html"])
    with get_db() as conn:
        conn.execute("UPDATE paginas SET html_path = ? WHERE id = ?", (f"pages/{page_id}/index.html", page_id))
        row = conn.execute("SELECT * FROM paginas WHERE id = ?", (page_id,)).fetchone()
    record = row_to_dict(row)
    record["preview_url"] = f"/pages/{page_id}"
    record["provider"] = resultado["provider"]
    return record


def gerar_pdf(oferta: dict, estrutura: dict, preco: float, parceiro: str = "", modo: str = "rapido", produto_md: str = "") -> dict:
    """Gera o PDF do produto (conteúdo completo quando disponível) + prompts de imagem."""
    _ensure_columns()
    md_text = (produto_md or "").strip() or _markdown_produto(oferta, estrutura, preco, parceiro)
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


def _criar_produto_para_consumo(record_id: int) -> dict:
    """Cria (ou reusa) o registro em `produtos` para AdsPages/AdsCreator consumirem."""
    row = _get_infoproduto(record_id)
    oferta = json.loads(row.get("oferta_json") or "{}")
    nome = (oferta.get("nome") or row["titulo"] or "Produto")[:160]
    with get_db() as conn:
        existente = None
        if row.get("produto_id"):
            existente = conn.execute("SELECT id FROM produtos WHERE id = ?", (row["produto_id"],)).fetchone()
        if not existente:
            mesmo_nome = conn.execute("SELECT id FROM produtos WHERE nome = ? ORDER BY id DESC LIMIT 1", (nome,)).fetchone()
            if mesmo_nome:
                produto_id = mesmo_nome["id"]
            else:
                cursor = conn.execute(
                    "INSERT INTO produtos (nome, plataforma, link_afiliado, comissao, preco, nicho, status, created_at, updated_at) VALUES (?, 'Outro', '', 0, ?, ?, 'aprovado', ?, ?)",
                    (nome, float(row.get("preco") or oferta.get("preco_sugerido") or 47), (oferta.get("publico") or "")[:120], now_str(), now_str()),
                )
                produto_id = cursor.lastrowid
        conn.execute("UPDATE infoprodutos SET produto_id = ? WHERE id = ?", (produto_id, record_id))
    return {"produto_id": produto_id, "nome": nome}


def _get_infoproduto(record_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM infoprodutos WHERE id = ?", (record_id,)).fetchone()
    if not row:
        raise LLMError("Infoproduto não encontrado.")
    return row_to_dict(row)


def salvar(anuncios: list, record_id: int, pins: list | None = None) -> dict:
    _ensure_columns()
    with get_db() as conn:
        conn.execute(
            "UPDATE infoprodutos SET anuncios_json = ?, pins_json = ? WHERE id = ?",
            (json.dumps((anuncios or [])[:12], ensure_ascii=False), json.dumps((pins or [])[:10], ensure_ascii=False), record_id),
        )
    produto = _criar_produto_para_consumo(record_id)
    record = _get_infoproduto(record_id)
    oferta = json.loads(record.get("oferta_json") or "{}")
    return {**record, "oferta": oferta, "produto": produto}
