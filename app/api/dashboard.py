"""Dashboard — agregação de dados reais de todos os módulos."""
from fastapi import APIRouter

from ..services.database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard():
    with get_db() as conn:
        produtos = {
            "total": conn.execute("SELECT COUNT(*) AS n FROM produtos").fetchone()["n"],
            "aprovados": conn.execute("SELECT COUNT(*) AS n FROM produtos WHERE status = 'aprovado'").fetchone()["n"],
            "em_analise": conn.execute("SELECT COUNT(*) AS n FROM produtos WHERE status = 'em_analise'").fetchone()["n"],
        }
        paginas = {
            "total": conn.execute("SELECT COUNT(*) AS n FROM paginas").fetchone()["n"],
            "publicadas": conn.execute("SELECT COUNT(*) AS n FROM paginas WHERE status = 'publicada'").fetchone()["n"],
            "rascunho": conn.execute("SELECT COUNT(*) AS n FROM paginas WHERE status != 'publicada'").fetchone()["n"],
        }
        campanhas = {
            "total": conn.execute("SELECT COUNT(*) AS n FROM campanhas").fetchone()["n"],
            "publicadas": conn.execute("SELECT COUNT(*) AS n FROM campanhas WHERE status = 'publicada'").fetchone()["n"],
            "rascunho": conn.execute("SELECT COUNT(*) AS n FROM campanhas WHERE status = 'rascunho'").fetchone()["n"],
            "erro": conn.execute("SELECT COUNT(*) AS n FROM campanhas WHERE status = 'erro'").fetchone()["n"],
        }
        vendas_row = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(valor),0) AS receita, COALESCE(SUM(comissao),0) AS comissao FROM vendas WHERE status = 'aprovada'"
        ).fetchone()
        infoprodutos = {"total": conn.execute("SELECT COUNT(*) AS n FROM infoprodutos").fetchone()["n"]}
        tracking = {
            "visitas": conn.execute("SELECT COUNT(*) AS n FROM visitas WHERE event = 'pageview'").fetchone()["n"],
            "cliques": conn.execute("SELECT COUNT(*) AS n FROM visitas WHERE event = 'cta_click'").fetchone()["n"],
            "conversoes_pendentes": conn.execute(
                "SELECT COUNT(*) AS n FROM vendas WHERE status = 'aprovada' AND gclid != '' AND conversao_status != 'enviada'"
            ).fetchone()["n"],
        }
        ultimas_vendas = [
            {key: row[key] for key in row.keys()}
            for row in conn.execute("SELECT id, produto_nome, valor, fonte, status, created_at FROM vendas ORDER BY id DESC LIMIT 5")
        ]
        ultimas_paginas = [
            {key: row[key] for key in row.keys()}
            for row in conn.execute("SELECT id, titulo, tipo, status, created_at FROM paginas ORDER BY id DESC LIMIT 5")
        ]

    from ..services.lancamentos import atual, progresso
    lancamento_atual = atual()
    progresso_atual = progresso(lancamento_atual) if lancamento_atual else None

    return {
        "produtos": produtos,
        "paginas": paginas,
        "campanhas": campanhas,
        "infoprodutos": infoprodutos,
        "vendas": {
            "total": vendas_row["n"],
            "receita": round(vendas_row["receita"], 2),
            "comissao": round(vendas_row["comissao"], 2),
        },
        "tracking": tracking,
        "ultimas_vendas": ultimas_vendas,
        "ultimas_paginas": ultimas_paginas,
        "lancamento": lancamento_atual,
        "progresso": progresso_atual,
    }
