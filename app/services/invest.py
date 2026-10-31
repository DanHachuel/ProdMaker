"""Investimento em tráfego — base do ROAS real e do Lucro Líquido."""
from .database import get_db, now_str, row_to_dict
from .llm import LLMError


def registrar(valor: float, data: str = "", observacao: str = "") -> dict:
    if float(valor) <= 0:
        raise LLMError("Informe um valor de investimento maior que zero.")
    data = (data or "").strip() or now_str()[:10]
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO investimentos (data, valor, fonte, observacao, created_at) VALUES (?, ?, 'manual', ?, ?)",
            (data, float(valor), observacao.strip(), timestamp),
        )
        row = conn.execute("SELECT * FROM investimentos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


def listar(limit: int = 60) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM investimentos ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [row_to_dict(row) for row in rows]


def remover(investimento_id: int) -> None:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM investimentos WHERE id = ?", (investimento_id,))
        if cursor.rowcount == 0:
            raise LLMError("Registro não encontrado.")


def resumo_financeiro() -> dict:
    """ROAS e Lucro Líquido reais (faturamento = receita das vendas aprovadas)."""
    with get_db() as conn:
        receita = conn.execute(
            "SELECT COALESCE(SUM(valor),0) AS r, COALESCE(SUM(comissao),0) AS c FROM vendas WHERE status = 'aprovada'"
        ).fetchone()
        investido = conn.execute("SELECT COALESCE(SUM(valor),0) AS t FROM investimentos").fetchone()
    receita_valor = float(receita["r"] or 0)
    comissao_valor = float(receita["c"] or 0)
    investido_valor = float(investido["t"] or 0)
    roas = round(receita_valor / investido_valor, 2) if investido_valor > 0 else None
    lucro = round(receita_valor - investido_valor, 2)
    return {
        "faturamento": round(receita_valor, 2),
        "comissao": round(comissao_valor, 2),
        "investimento": round(investido_valor, 2),
        "lucro_liquido": lucro,
        "roas": roas,
        "tem_investimento": investido_valor > 0,
    }
