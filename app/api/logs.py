"""Logs unificados — visão de operações de todos os módulos."""
from fastapi import APIRouter

from ..services.database import get_db, row_to_dict

router = APIRouter(prefix="/api/logs", tags=["logs"])


def _entry(operacao: str, estado: str, data: str, origem: str, detalhe: str) -> dict:
    return {"operacao": operacao, "estado": estado, "data": data, "origem": origem, "detalhe": detalhe}


@router.get("")
def logs(limite: int = 300, operacao: str = "", estado: str = ""):
    entries: list[dict] = []
    with get_db() as conn:
        for row in conn.execute("SELECT * FROM campanhas ORDER BY id DESC LIMIT ?", (limite,)).fetchall():
            record = row_to_dict(row)
            estado_row = record["status"]
            entries.append(_entry("campanha", estado_row, record["updated_at"], record["plataforma"], f"{record['nome']} — CPA R$ {record['cpa_alvo']} · R$ {record['orcamento_diario']}/dia" + (f" · erro: {record['erro'][:120]}" if record["erro"] else "")))
        for row in conn.execute("SELECT * FROM paginas ORDER BY id DESC LIMIT ?", (limite,)).fetchall():
            record = row_to_dict(row)
            entries.append(_entry("pagina", record["status"], record["updated_at"], record["tipo"], f"{record['titulo']}" + (f" — {record['published_url']}" if record["published_url"] else "")))
        for row in conn.execute("SELECT * FROM infoprodutos ORDER BY id DESC LIMIT ?", (limite,)).fetchall():
            record = row_to_dict(row)
            entries.append(_entry("infoproduto", "gerado", record["created_at"], record["provider"] or "llm", f"{record['titulo']} ({record['modo']})"))
        for row in conn.execute("SELECT * FROM vendas ORDER BY id DESC LIMIT ?", (limite,)).fetchall():
            record = row_to_dict(row)
            entries.append(_entry("venda", record["status"], record["created_at"], record["fonte"], f"{record['produto_nome'] or '#' + str(record['id'])} — valor {record['valor']} · conversao {record['conversao_status']}" + (f" · gclid {record['gclid'][:16]}" if record["gclid"] else "")))
        for row in conn.execute("SELECT * FROM notificacoes ORDER BY id DESC LIMIT ?", (limite,)).fetchall():
            record = row_to_dict(row)
            entries.append(_entry("notificacao", record["status"], record["created_at"], record["canal"] or "apprise", f"{record['titulo']}" + (f" — {record['erro'][:120]}" if record["erro"] else "")))
        for row in conn.execute("SELECT * FROM visitas ORDER BY id DESC LIMIT ?", (limite,)).fetchall():
            record = row_to_dict(row)
            entries.append(_entry("visita", "ok", record["created_at"], record["ip"], f"{record['event']} {record['page']}" + (f" · gclid {record['gclid'][:16]}" if record["gclid"] else "")))

    if operacao:
        entries = [item for item in entries if item["operacao"] == operacao]
    if estado:
        entries = [item for item in entries if item["estado"] == estado]
    entries.sort(key=lambda item: item["data"] or "", reverse=True)
    return entries[:limite]
