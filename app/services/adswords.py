"""AdsWords — geração de palavras-chave e negativas por IA + listas por produto."""
import json
from pathlib import Path

from .database import DEV_USER_ID, get_db, now_str, row_to_dict
from .llm import LLMError, generate
from .store import STORAGE

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"
SEED_NEGATIVAS = SEED_DIR / "negatives" / "google-words.txt"


def _seed_negativas() -> list[str]:
    if SEED_NEGATIVAS.exists():
        return [line.strip() for line in SEED_NEGATIVAS.read_text(encoding="utf-8").splitlines() if line.strip()]
    return ["gratis", "download", "torrent", "refund", "scams"]


def gerar(produto: dict, user_id: str = "") -> dict:
    """Gera palavras-chave e negativas com IA (seed/prompts/keywords.md)."""
    template_path = SEED_DIR / "prompts" / "keywords.md"
    template = template_path.read_text(encoding="utf-8") if template_path.exists() else (
        "Para o produto {NOME_DO_PRODUTO} (nicho {NICHO}) liste palavras-chave de compra e negativas em JSON: "
        '{"principais":[{"palavra":"","correspondencia":"frase"}],"negativas":[{"palavra":""}]}'
    )
    prompt = (
        template.replace("{NOME_DO_PRODUTO}", produto.get("nome") or "")
        .replace("{NICHO}", produto.get("nicho") or "")
        .replace("{PLATAFORMA}", produto.get("plataforma") or "")
    )
    result = generate(
        prompt,
        system="Você é um especialista em Google Ads. Responda SOMENTE com JSON válido, sem markdown.",
        max_tokens=2000,
    )
    try:
        parsed = json.loads(_clean_json(result["text"]))
    except Exception as exc:  # noqa: BLE001
        raise LLMError(f"Resposta do LLM não trouxe JSON utilizável: {exc}") from exc

    positivas = []
    for item in parsed.get("principais") or []:
        text = (item.get("palavra") or "").strip()
        if text:
            positivas.append({"texto": text, "correspondencia": item.get("correspondencia") or "frase"})
    negativas_ia = []
    for item in parsed.get("negativas") or []:
        text = (item.get("palavra") or "").strip()
        if text:
            negativas_ia.append({"texto": text, "correspondencia": "exata"})
    for seed_word in _seed_negativas():
        if not any(n["texto"] == seed_word for n in negativas_ia):
            negativas_ia.append({"texto": seed_word, "correspondencia": "exata", "seed": True})

    salvar(produto, positivas, negativas_ia, origem="ia", user_id=user_id)
    return {"positivas": positivas, "negativas": negativas_ia, "provider": result["provider"]}


def _clean_json(text: str) -> str:
    import re

    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    return match.group(0) if match else cleaned


def salvar(produto: dict, positivas: list, negativas: list, origem: str = "manual", user_id: str = "") -> None:
    user_id = user_id or DEV_USER_ID
    timestamp = now_str()
    with get_db() as conn:
        for item in positivas:
            exists = conn.execute(
                "SELECT id FROM palavras WHERE produto_id = ? AND tipo = 'positiva' AND texto = ? AND user_id = ?",
                (produto.get("id"), item["texto"], user_id),
            ).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO palavras (user_id, produto_id, produto_nome, tipo, texto, correspondencia, origem, created_at) VALUES (?, ?, ?, 'positiva', ?, ?, ?, ?)",
                    (user_id, produto.get("id"), produto.get("nome") or "", item["texto"], item.get("correspondencia", "frase"), origem, timestamp),
                )
        for item in negativas:
            exists = conn.execute(
                "SELECT id FROM palavras WHERE produto_id = ? AND tipo = 'negativa' AND texto = ? AND user_id = ?",
                (produto.get("id"), item["texto"], user_id),
            ).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO palavras (user_id, produto_id, produto_nome, tipo, texto, correspondencia, origem, created_at) VALUES (?, ?, ?, 'negativa', ?, ?, ?, ?)",
                    (user_id, produto.get("id"), produto.get("nome") or "", item["texto"], "exata", origem, timestamp),
                )


def listar(produto_id: int | None = None, user_id: str = "") -> dict:
    query = "SELECT * FROM palavras"
    params: tuple = ()
    if produto_id and user_id:
        query += " WHERE produto_id = ? AND user_id = ?"
        params = (produto_id, user_id)
    elif user_id:
        query += " WHERE user_id = ?"
        params = (user_id,)
    elif produto_id:
        query += " WHERE produto_id = ?"
        params = (produto_id,)
    query += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {
        "positivas": [item for item in items if item["tipo"] == "positiva"],
        "negativas": [item for item in items if item["tipo"] == "negativa"],
    }


def adicionar_manual(produto: dict, tipo: str, texto: str, correspondencia: str = "frase", user_id: str = "") -> dict:
    user_id = user_id or DEV_USER_ID
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO palavras (user_id, produto_id, produto_nome, tipo, texto, correspondencia, origem, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?)",
            (user_id, produto.get("id"), produto.get("nome") or "", tipo, texto.strip(), correspondencia, timestamp),
        )
        row = conn.execute("SELECT * FROM palavras WHERE id = ? AND user_id = ?", (cursor.lastrowid, user_id)).fetchone()
    return row_to_dict(row)


def remover(palavra_id: int, user_id: str = "") -> None:
    escopo = " AND user_id = ?" if user_id else ""
    params = (palavra_id, user_id) if user_id else (palavra_id,)
    with get_db() as conn:
        cursor = conn.execute(f"DELETE FROM palavras WHERE id = ?{escopo}", params)
        if cursor.rowcount == 0:
            raise LLMError("Palavra não encontrada.")


def gerar_criativos(produto: dict, quantidade: int = 3) -> dict:
    """Gera roteiros de criativos por IA (seed/prompts/criativos.md)."""
    template_path = SEED_DIR / "prompts" / "criativos.md"
    template = template_path.read_text(encoding="utf-8") if template_path.exists() else (
        'Gere {QUANTIDADE} roteiros de criativo para {NOME_DO_PRODUTO} no formato '
        '{"criativos":[{"gancho_3s":"","roteiro":"","texto_na_tela":"","cta":""}]}'
    )
    prompt = (
        template.replace("{QUANTIDADE}", str(quantidade))
        .replace("{NOME_DO_PRODUTO}", produto.get("nome") or "")
        .replace("{DOR}", produto.get("nicho") or "")
    )
    result = generate(
        prompt,
        system="Você é um copywriter de direct response para tráfego pago. Responda SOMENTE com JSON válido.",
        max_tokens=3000,
    )
    try:
        parsed = json.loads(_clean_json(result["text"]))
    except Exception as exc:  # noqa: BLE001
        raise LLMError(f"Resposta do LLM não trouxe JSON utilizável: {exc}") from exc
    criativos = parsed.get("criativos") or parsed.get("roteiros") or []
    normalizados = [
        {
            "gancho_3s": item.get("gancho_3s") or "",
            "roteiro": item.get("roteiro") or "",
            "texto_na_tela": item.get("texto_na_tela") or "",
            "cta": item.get("cta") or "Clique no link abaixo e comece agora!",
        }
        for item in criativos
        if isinstance(item, dict)
    ]
    return {"criativos": normalizados, "provider": result["provider"]}
