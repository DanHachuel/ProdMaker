"""Investimento em tráfego — base do ROAS real e do Lucro Líquido."""
from .database import DEV_USER_ID, get_db, now_str, row_to_dict
from .llm import LLMError


def registrar(valor: float, data: str = "", observacao: str = "", user_id: str = "") -> dict:
    user_id = user_id or DEV_USER_ID
    if float(valor) <= 0:
        raise LLMError("Informe um valor de investimento maior que zero.")
    data = (data or "").strip() or now_str()[:10]
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO investimentos (user_id, data, valor, fonte, observacao, created_at) VALUES (?, ?, ?, 'manual', ?, ?)",
            (user_id, data, float(valor), observacao.strip(), timestamp),
        )
        row = conn.execute("SELECT * FROM investimentos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


def listar(limit: int = 60, user_id: str = "") -> list[dict]:
    escopo = "WHERE user_id = ?" if user_id else ""
    params = (user_id, limit) if user_id else (limit,)
    with get_db() as conn:
        rows = conn.execute(f"SELECT * FROM investimentos {escopo} ORDER BY id DESC LIMIT ?", params).fetchall()
    return [row_to_dict(row) for row in rows]


def remover(investimento_id: int, user_id: str = "") -> None:
    escopo = " AND user_id = ?" if user_id else ""
    params = (investimento_id, user_id) if user_id else (investimento_id,)
    with get_db() as conn:
        cursor = conn.execute(f"DELETE FROM investimentos WHERE id = ?{escopo}", params)
        if cursor.rowcount == 0:
            raise LLMError("Registro não encontrado.")


def resumo_financeiro(user_id: str = "") -> dict:
    user_id = user_id or DEV_USER_ID
    escopo = "AND user_id = ?" if user_id else ""
    with get_db() as conn:
        receita = conn.execute(
            f"SELECT COALESCE(SUM(valor),0) AS r, COALESCE(SUM(comissao),0) AS c FROM vendas WHERE status = 'aprovada' {escopo}",
            (user_id,),
        ).fetchone()
        investido = conn.execute(
            f"SELECT COALESCE(SUM(valor),0) AS t FROM investimentos WHERE user_id = ?",
            (user_id,),
        ).fetchone()
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
