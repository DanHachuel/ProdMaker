"""AdsCreator — construtor de planos de campanha (defaults do seed + produto vinculado)."""
import json
from pathlib import Path

from .database import get_db, now_str, row_to_dict
from .llm import LLMError

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"
PLATAFORMAS = ("google", "meta", "tiktok")


def _defaults(plataforma: str) -> dict:
    aliases = {"google": "google", "meta": "meta", "tiktok": "tiktok"}
    path = SEED_DIR / "campaign-defaults" / f"{aliases[plataforma]}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def construir(produto: dict, plataforma: str, form: dict) -> dict:
    """Monta o plano da campanha com defaults do seed + dados do produto."""
    if plataforma not in PLATAFORMAS:
        raise LLMError(f"Plataforma inválida: {plataforma}. Use: google, meta, tiktok.")
    comissao = float(produto.get("comissao") or 0)
    preco = float(produto.get("preco") or 0)
    receita = comissao or preco * 0.5
    defaults = _defaults(plataforma)

    if plataforma == "google":
        cpa_alvo = round(receita * 0.7, 2) if receita else 120.0
        orcamento = float(form.get("orcamento_diario") or 110)
        plano = {
            "rede": "Pesquisa (Search)",
            "objetivo": "Vendas — conversões",
            "lance": f"Manual CPC com lance = CPA alvo (R$ {cpa_alvo}) — troque para CPA automático quando a conversão estiver ativa",
            "cpa_alvo": cpa_alvo,
            "orcamento_diario": orcamento,
            "localizacao": "Presença (apenas): Estados Unidos, Canadá, Austrália, Reino Unido",
            "idiomas": "Inglês e Francês",
            "correspondencia": "frase",
            "anuncio": defaults.get("anuncio", {}),
        }
    elif plataforma == "meta":
        ticket = preco or (receita / 0.5 if receita else 0)
        criativos = max(5, int(form.get("quantidade_criativos") or 5))
        orcamento = round(criativos * (ticket / 2), 2) if ticket else 300.0
        plano = {
            "estrutura": f"1 campanha → 1 conjunto → {criativos} criativos",
            "objetivo": "Vendas (Conversões)",
            "publico": "Aberto + Advantage+",
            "orcamento_diario": orcamento,
            "regra_budget": "criativos × metade do ticket",
            "criativos": criativos,
        }
    else:
        plano = {
            "formato": "Vídeo vertical 9:16, 15–30s, estilo UGC",
            "objetivo": "Conversões",
            "publico": "Idade 18–45 (EUA/UK/CA/AU)",
            "orcamento_diario": float(form.get("orcamento_diario") or 15),
            "moeda": "USD",
            "teste": "US$10–20/dia por criativo; escala US$50–100/dia no vencedor",
        }

    positivas = form.get("keywords") or []
    negativas = form.get("negativas") or []
    criativos = form.get("criativos") or []
    return {
        "plataforma": plataforma,
        "nome": form.get("nome") or f"{produto.get('nome') or 'Produto'} — {plataforma.title()}",
        "produto_id": produto.get("id"),
        "cpa_alvo": float(plano.get("cpa_alvo") or 0),
        "orcamento_diario": float(plano.get("orcamento_diario") or 0),
        "keywords": positivas,
        "negativas": negativas,
        "criativos": criativos,
        "plano": plano,
        "manual": plataforma == "tiktok",
    }


def salvar(campanha: dict) -> dict:
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO campanhas (produto_id, plataforma, nome, objetivo, cpa_alvo, orcamento_diario, keywords_json, negativas_json, criativos_json, plano_json, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?)",
            (
                campanha.get("produto_id"),
                campanha["plataforma"],
                campanha["nome"],
                json.dumps(campanha["plano"].get("objetivo", ""), ensure_ascii=False),
                campanha.get("cpa_alvo") or 0,
                campanha.get("orcamento_diario") or 0,
                json.dumps(campanha["keywords"], ensure_ascii=False),
                json.dumps(campanha["negativas"], ensure_ascii=False),
                json.dumps(campanha["criativos"], ensure_ascii=False),
                json.dumps(campanha["plano"], ensure_ascii=False),
                timestamp,
                timestamp,
            ),
        )
        row = conn.execute("SELECT * FROM campanhas WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


def listar(produto_id: int | None = None) -> list[dict]:
    query = "SELECT * FROM campanhas"
    params: tuple = ()
    if produto_id:
        query += " WHERE produto_id = ?"
        params = (produto_id,)
    query += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(row) for row in rows]


def get(campanha_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM campanhas WHERE id = ?", (campanha_id,)).fetchone()
    if not row:
        raise LLMError("Campanha não encontrada.")
    record = row_to_dict(row)
    for field in ("keywords_json", "negativas_json", "criativos_json", "plano_json", "resultado_json"):
        if record.get(field):
            try:
                record[field.replace("_json", "")] = json.loads(record[field])
            except Exception:  # noqa: BLE001
                record[field.replace("_json", "")] = record[field]
    return record


def remover(campanha_id: int) -> None:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM campanhas WHERE id = ?", (campanha_id,))
        if cursor.rowcount == 0:
            raise LLMError("Campanha não encontrada.")


def marcar_publicada(campanha_id: int, resultado: dict, status: str = "publicada", erro: str = "") -> dict:
    with get_db() as conn:
        conn.execute(
            "UPDATE campanhas SET status = ?, resultado_json = ?, erro = ?, updated_at = ? WHERE id = ?",
            (status, json.dumps(resultado, ensure_ascii=False), erro[:2000], now_str(), campanha_id),
        )
    if status == "publicada":
        from .notify import notify_event

        campanha = get(campanha_id)
        notify_event("campanha_publicada", f"Campanha publicada ({campanha['plataforma']})", f"{campanha['nome']} — criada PAUSADA para revisão.")
    return get(campanha_id)


def atualizar(campanha_id: int, campanha: dict) -> dict:
    with get_db() as conn:
        conn.execute(
            "UPDATE campanhas SET nome = ?, cpa_alvo = ?, orcamento_diario = ?, keywords_json = ?, negativas_json = ?, criativos_json = ?, plano_json = ?, updated_at = ? WHERE id = ?",
            (
                campanha["nome"],
                campanha.get("cpa_alvo") or 0,
                campanha.get("orcamento_diario") or 0,
                json.dumps(campanha["keywords"], ensure_ascii=False),
                json.dumps(campanha["negativas"], ensure_ascii=False),
                json.dumps(campanha["criativos"], ensure_ascii=False),
                json.dumps(campanha["plano"], ensure_ascii=False),
                now_str(),
                campanha_id,
            ),
        )
    return get(campanha_id)
