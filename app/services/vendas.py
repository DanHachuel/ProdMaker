"""Minhas Vendas — webhooks de plataformas, entrada manual, CSV e matching por GCLID.

O parser de webhooks é TOLERANTE: percorre o JSON recebido procurando os campos
conhecidos (valor, comissão, e-mail, transação, gclid, produto, status), porque cada
plataforma (Hotmart, ClickBank, Digistore24, Kiify, Cakto) usa nomes diferentes.
Nada é inventado: campo ausente fica vazio.
"""
import csv
import io
import json
from decimal import Decimal, InvalidOperation

from .database import get_db, now_str, row_to_dict
from .llm import LLMError


# ---------------------------------------------------------------------------
# Parser tolerante de webhooks
# ---------------------------------------------------------------------------

STATUS_MAP = {
    # Hotmart / genéricos
    "purchase_approved": "aprovada", "approved": "aprovada", "complete": "aprovada",
    "completed": "aprovada", "paid": "aprovada", "settled": "aprovada", "cbcheck": "aprovada",
    "purchase_refunded": "reembolsada", "refunded": "reembolsada", "refund": "reembolsada",
    "chargeback": "reembolsada",
    "purchase_delayed": "pendente", "pending": "pendente", "billet_printed": "pendente",
    "waiting_payment": "pendente", "protest": "pendente",
    "canceled": "cancelada", "cancelled": "cancelada",
}

VALOR_KEYS = ("valor", "value", "amount", "price", "total", "order_total")
COMISSAO_KEYS = ("comissao", "commission", "affiliate_value", "expected", "net")
PRODUTO_KEYS = ("produto", "product", "product_name", "item", "productname", "nome_produto")
EMAIL_KEYS = ("email", "buyer_email", "customer_email", "comprador_email", "buyer")
TRANSACAO_KEYS = ("transacao", "transaction", "transaction_id", "txid", "order", "receipt", "orderid", "pedido", "invoice")
GCLID_KEYS = ("gclid", "gbraid", "wbraid", "google_click_id", "gad_source")
UTM_KEYS = {"utm_source": "utm_source", "utm_medium": "utm_medium", "utm_campaign": "utm_campaign", "src": "utm_source"}
STATUS_KEYS = ("status", "event", "type", "situation", "transaction_type", "state")


def _walk(obj, keys, exclude_context=()):
    """Busca recursiva pelos campos encontrados (case/acentos insensíveis),
    com exclusão por contexto ancestral (ex.: ignorar 'value' dentro de 'commission').
    Valores dict/list também são percorridos, para achar chaves aninhadas."""
    wanted = {self_normalize(k) for k in keys}
    excluded = {self_normalize(k) for k in exclude_context}
    found = []
    stack = [(obj, ())]
    while stack:
        current, context = stack.pop()
        if isinstance(current, dict):
            for key, value in current.items():
                key_norm = self_normalize(key)
                new_context = context + (key_norm,)
                if key_norm in wanted and not (excluded and (excluded & set(context))):
                    found.append(value)
                stack.append((value, new_context))
        elif isinstance(current, list):
            for item in current:
                stack.append((item, context))
    return found


def _walk_numbers_by_context(obj, context_terms=()):
    """Números cujo caminho de chaves ancestrais contém algum dos termos
    (ex.: comissão Hotmart em purchase.commission.value)."""
    terms = {self_normalize(term) for term in context_terms}
    found = []
    stack = [(obj, ())]
    while stack:
        current, context = stack.pop()
        if isinstance(current, dict):
            for key, value in current.items():
                stack.append((value, context + (self_normalize(key),)))
        elif isinstance(current, list):
            for item in current:
                stack.append((item, context))
        elif isinstance(current, (int, float)) and not isinstance(current, bool):
            if terms & set(context):
                found.append(float(current))
        elif isinstance(current, str) and ";" not in current:
            parsed = _to_float(current)
            if parsed > 0 and terms & set(context):
                found.append(parsed)
    return found


def self_normalize(text: str) -> str:
    return "".join(char for char in (text or "").lower() if not char in " -_")


def _to_float(value) -> float:
    """Converte para float aceitando formatos BR (1.297,00 / 49,90) e US (197.00)."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).replace("R$", "").strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")  # 1.297,00 (BR)
    elif "," in text:
        text = text.replace(",", ".")  # 49,90 (BR decimal)
    elif text.count(".") >= 2:
        text = text.replace(".", "")  # 1.297.00 (BR sem vírgula)
    # só um ponto: formato US decimal (197.00) — mantido
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return 0.0


def _first_str(values, default=""):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            for nested_key in ("name", "nome", "title"):
                nested = value.get(nested_key)
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(value)
    return default


def _first_float(values) -> float:
    for value in values:
        result = _to_float(value)
        if result > 0:
            return result
    return 0.0


def _status_from(values: list) -> str:
    for value in values:
        if isinstance(value, str):
            return STATUS_MAP.get(self_normalize(value), "aprovada")
    return "aprovada"


COMISSAO_CONTEXT = ("comissao", "commission", "expected", "affiliate", "coproducer", "comission")


def parse_webhook(fonte: str, payload: dict) -> dict:
    """Extrai uma venda de um payload de webhook de forma tolerante."""
    valor_candidates = _walk(payload, VALOR_KEYS, exclude_context=COMISSAO_CONTEXT)
    comissao_candidates = _walk_numbers_by_context(payload, COMISSAO_CONTEXT)
    if not comissao_candidates:
        comissao_candidates = _walk(payload, ("expected", "comissao", "commission"))
    gclid = _first_str(_walk(payload, GCLID_KEYS))
    utm_source = _first_str(_walk(payload, ("utm_source", "src")))
    utm_medium = _first_str(_walk(payload, ("utm_medium",)))
    utm_campaign = _first_str(_walk(payload, ("utm_campaign", "campaign", "cname")))
    return {
        "fonte": fonte,
        "produto_nome": _first_str(_walk(payload, PRODUTO_KEYS)),
        "transacao_id": _first_str(_walk(payload, TRANSACAO_KEYS)),
        "comprador_email": _first_str(_walk(payload, EMAIL_KEYS)),
        "valor": _first_float(valor_candidates),
        "comissao": _first_float(comissao_candidates),
        "gclid": gclid,
        "utm_source": utm_source,
        "utm_medium": utm_medium,
        "utm_campaign": utm_campaign,
        "status": _status_from(_walk(payload, STATUS_KEYS)),
        "raw": json.dumps(payload, ensure_ascii=False)[:4000],
    }


# ---------------------------------------------------------------------------
# Registration, matching e leitura
# ---------------------------------------------------------------------------


def _match_gclid(gclid: str) -> str:
    if not gclid:
        return ""
    with get_db() as conn:
        row = conn.execute(
            "SELECT page, ip, created_at, ref, utm_source FROM visitas WHERE gclid = ? AND event = 'pageview' ORDER BY id DESC LIMIT 1",
            (gclid,),
        ).fetchone()
    if not row:
        return ""
    match = dict(row)
    match["matched"] = True
    return json.dumps(match, ensure_ascii=False)


def registrar_venda(data: dict) -> dict:
    timestamp = now_str()
    gclid = data.get("gclid") or ""
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO vendas (fonte, produto_id, produto_nome, transacao_id, comprador_email, valor, comissao, gclid, utm_source, utm_medium, utm_campaign, status, conversao_status, gclid_match, raw, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)",
            (
                data.get("fonte", "manual"),
                data.get("produto_id"),
                data.get("produto_nome", ""),
                data.get("transacao_id", ""),
                data.get("comprador_email", ""),
                float(data.get("valor") or 0),
                float(data.get("comissao") or 0),
                gclid,
                data.get("utm_source", ""),
                data.get("utm_medium", ""),
                data.get("utm_campaign", ""),
                data.get("status", "aprovada"),
                _match_gclid(gclid),
                data.get("raw", ""),
                timestamp,
            ),
        )
        row = conn.execute("SELECT * FROM vendas WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


def list_vendas(limit: int = 300) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM vendas ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [row_to_dict(row) for row in rows]


def resumo() -> dict:
    with get_db() as conn:
        aprovadas = conn.execute("SELECT COUNT(*) AS n, COALESCE(SUM(valor),0) AS receita, COALESCE(SUM(comissao),0) AS comissao FROM vendas WHERE status = 'aprovada'").fetchone()
        por_status = {row["status"]: row["n"] for row in conn.execute("SELECT status, COUNT(*) AS n FROM vendas GROUP BY status")}
        por_fonte = [{"fonte": row["fonte"], "n": row["n"]} for row in conn.execute("SELECT fonte, COUNT(*) AS n FROM vendas GROUP BY fonte ORDER BY n DESC")]
        por_dia = [{"dia": row["dia"], "receita": row["receita"], "vendas": row["n"]} for row in conn.execute("SELECT substr(created_at,1,10) AS dia, COUNT(*) AS n, COALESCE(SUM(valor),0) AS receita FROM vendas WHERE status = 'aprovada' GROUP BY dia ORDER BY dia")]
        por_produto = [{"produto": row["produto_nome"] or "(sem nome)", "n": row["n"], "receita": row["receita"]} for row in conn.execute("SELECT produto_nome, COUNT(*) AS n, COALESCE(SUM(valor),0) AS receita FROM vendas WHERE status = 'aprovada' GROUP BY produto_nome ORDER BY receita DESC")]
        conv = {row["conversao_status"]: row["n"] for row in conn.execute("SELECT conversao_status, COUNT(*) AS n FROM vendas GROUP BY conversao_status")}
        conversoes = {
            "pendentes": conv.get("pendente", 0),
            "enviadas": conv.get("enviada", 0),
            "erros": conv.get("erro", 0),
        }
    return {
        "vendas": aprovadas["n"],
        "receita": round(aprovadas["receita"], 2),
        "comissao": round(aprovadas["comissao"], 2),
        "por_status": por_status,
        "por_fonte": por_fonte,
        "por_dia": por_dia,
        "por_produto": por_produto,
        "conversoes": conversoes,
    }


def delete_venda(venda_id: int) -> None:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM vendas WHERE id = ?", (venda_id,))
        if cursor.rowcount == 0:
            raise LLMError("Venda não encontrada.")


def get_venda(venda_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM vendas WHERE id = ?", (venda_id,)).fetchone()
    if not row:
        raise LLMError("Venda não encontrada.")
    return row_to_dict(row)


def marcar_conversao(venda_id: int, status: str, erro: str = "") -> None:
    with get_db() as conn:
        conn.execute("UPDATE vendas SET conversao_status = ?, conversao_erro = ? WHERE id = ?", (status, erro[:2000], venda_id))


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

COLUMN_ALIASES = {
    "produto": "produto_nome", "product": "produto_nome", "produto_nome": "produto_nome", "item": "produto_nome",
    "valor": "valor", "value": "valor", "amount": "valor", "price": "valor", "preco": "valor",
    "comissao": "comissao", "commission": "comissao", "comissao_r": "comissao",
    "gclid": "gclid", "google_click_id": "gclid",
    "email": "comprador_email", "comprador_email": "comprador_email",
    "transacao": "transacao_id", "transaction": "transacao_id", "transacao_id": "transacao_id", "pedido": "transacao_id",
    "utm_source": "utm_source", "utm_medium": "utm_medium", "utm_campaign": "utm_campaign",
}


def importar_csv(texto: str) -> dict:
    """Importa vendas de CSV com cabeçalho (ordem livre). Retorna contagem e erros por linha."""
    imported = 0
    errors = []
    reader = csv.DictReader(io.StringIO(texto))
    if not reader.fieldnames:
        raise LLMError("CSV vazio — envie um cabeçalho com colunas como produto, valor, comissao, gclid, email.")
    mapping = {}
    for column in reader.fieldnames:
        alias = COLUMN_ALIASES.get(self_normalize(column))
        if alias:
            mapping[alias] = column
    if "valor" not in mapping:
        raise LLMError("CSV sem coluna de valor reconhecível (procure por: valor, value, amount, price).")
    for index, row in enumerate(reader, start=1):
        data = {}
        for alias, column in mapping.items():
            data[alias] = (row.get(column) or "").strip()
        if not data.get("produto_nome") and not data.get("valor"):
            continue
        try:
            payload = {
                "fonte": "csv",
                "produto_nome": data.get("produto_nome", ""),
                "valor": _to_float(data.get("valor")),
                "comissao": _to_float(data.get("comissao")),
                "gclid": data.get("gclid", ""),
                "comprador_email": data.get("comprador_email", ""),
                "transacao_id": data.get("transacao_id", ""),
                "utm_source": data.get("utm_source", ""),
                "utm_medium": data.get("utm_medium", ""),
                "utm_campaign": data.get("utm_campaign", ""),
                "status": "aprovada",
            }
            registrar_venda(payload)
            imported += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Linha {index}: {exc}")
    return {"importadas": imported, "erros": errors}
