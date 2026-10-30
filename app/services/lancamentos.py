"""AdsBot — Lançamento Assistido: wizard persistido + Relatório de Lançamento."""
import json
from pathlib import Path

from .database import get_db, now_str, row_to_dict
from .llm import LLMError

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"
ETAPAS = [
    {"numero": 1, "nome": "Produto", "emoji": "📦", "rota": "/"},
    {"numero": 2, "nome": "Página", "emoji": "🛡️", "rota": "/adspages"},
    {"numero": 3, "nome": "Publicar", "emoji": "🌐", "rota": "/hosting/paginas"},
    {"numero": 4, "nome": "Campanhas", "emoji": "🎯", "rota": "/adscreator"},
    {"numero": 5, "nome": "Tracking", "emoji": "🔄", "rota": "/tracking/visitas"},
    {"numero": 6, "nome": "Conclusão", "emoji": "✅", "rota": "/adsbot"},
]


def _decode(record: dict) -> dict:
    try:
        record["dados"] = json.loads(record.get("dados_json") or "{}")
    except Exception:  # noqa: BLE001
        record["dados"] = {}
    return record


def _get_row(lancamento_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM lancamentos WHERE id = ?", (lancamento_id,)).fetchone()
    if not row:
        raise LLMError("Lançamento não encontrado.")
    return row_to_dict(row)


def atual() -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM lancamentos WHERE status = 'em_andamento' ORDER BY id DESC LIMIT 1").fetchone()
    return _decode(row_to_dict(row)) if row else None


def listar() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM lancamentos ORDER BY id DESC").fetchall()
    return [_decode(row_to_dict(row)) for row in rows]


def iniciar(produto_id: int | None = None) -> dict:
    existing = atual()
    if existing:
        if produto_id and not existing.get("produto_id"):
            return definir_produto(existing["id"], produto_id)
        return existing
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO lancamentos (produto_id, etapa_atual, status, dados_json, created_at, updated_at) VALUES (?, 1, 'em_andamento', '{}', ?, ?)",
            (produto_id, timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM lancamentos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return _decode(row_to_dict(row))


def definir_produto(lancamento_id: int, produto_id: int) -> dict:
    with get_db() as conn:
        conn.execute("UPDATE lancamentos SET produto_id = ?, updated_at = ? WHERE id = ?", (produto_id, now_str(), lancamento_id))
    return _get_row(lancamento_id)


def salvar_etapa(lancamento_id: int, etapa: int, dados: dict) -> dict:
    if not 1 <= etapa <= len(ETAPAS):
        raise LLMError(f"Etapa inválida (1–{len(ETAPAS)}).")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM lancamentos WHERE id = ?", (lancamento_id,)).fetchone()
        if not row:
            raise LLMError("Lançamento não encontrado.")
        merged = {}
        try:
            merged = json.loads(row["dados_json"] or "{}")
        except Exception:  # noqa: BLE001
            merged = {}
        merged.update(dados or {})
        conn.execute(
            "UPDATE lancamentos SET etapa_atual = ?, dados_json = ?, updated_at = ? WHERE id = ?",
            (max(etapa, row["etapa_atual"] if row["status"] == "concluido" else 0), json.dumps(merged, ensure_ascii=False), now_str(), lancamento_id),
        )
    return _get_row(lancamento_id)


def concluir(lancamento_id: int) -> dict:
    with get_db() as conn:
        conn.execute("UPDATE lancamentos SET status = 'concluido', etapa_atual = ?, updated_at = ? WHERE id = ?", (len(ETAPAS), now_str(), lancamento_id))
    return relatorio(lancamento_id)


def relatorio(lancamento_id: int) -> dict:
    record = _get_row(lancamento_id)
    dados = json.loads(record.get("dados_json") or "{}")
    produto_id = record.get("produto_id") or dados.get("produto_id")
    produto = None
    analysis = None
    paginas = []
    campanhas = []
    if produto_id:
        with get_db() as conn:
            produto_row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
            if produto_row:
                produto = row_to_dict(produto_row)
        if produto and produto.get("analysis"):
            try:
                analysis = json.loads(produto["analysis"])
            except Exception:  # noqa: BLE001
                analysis = None
        with get_db() as conn:
            paginas = [row_to_dict(r) for r in conn.execute("SELECT * FROM paginas WHERE produto_id = ? ORDER BY id DESC", (produto_id,)).fetchall()]
            campanhas = [row_to_dict(r) for r in conn.execute("SELECT * FROM campanhas WHERE produto_id = ? ORDER BY id DESC", (produto_id,)).fetchall()]
    checklist_path = SEED_DIR / "checklists" / "lancamento.md"
    checklist = ""
    if checklist_path.exists():
        checklist = checklist_path.read_text(encoding="utf-8")
    return {
        "lancamento": record,
        "produto": produto,
        "analysis": analysis,
        "paginas": [
            {"id": p["id"], "titulo": p["titulo"], "tipo": p["tipo"], "status": p["status"], "published_url": p["published_url"]}
            for p in paginas
        ],
        "campanhas": [
            {"id": c["id"], "nome": c["nome"], "plataforma": c["plataforma"], "status": c["status"], "cpa_alvo": c["cpa_alvo"], "orcamento_diario": c["orcamento_diario"]}
            for c in campanhas
        ],
        "checklist": checklist,
        "etapas": ETAPAS,
    }


def progresso(record: dict) -> dict:
    etapa = record.get("etapa_atual") or 1
    total = len(ETAPAS)
    concluido = record.get("status") == "concluido"
    percentual = 100 if concluido else round((etapa - 1) / total * 100)
    return {
        "etapa": etapa,
        "total": total,
        "percentual": percentual,
        "faltam": 0 if concluido else total - etapa + 1,
        "status": record.get("status"),
    }
