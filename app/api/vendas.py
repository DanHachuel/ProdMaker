import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from ..services import gads, vendas
from ..services.database import get_db, now_str, row_to_dict
from ..services.llm import LLMError

router = APIRouter(prefix="/api", tags=["vendas"])

WEBHOOK_FONTES = ("hotmart", "clickbank", "digistore24", "kiify", "cakto")


class VendaBody(BaseModel):
    produto_nome: str = ""
    produto_id: int | None = None
    valor: float = 0
    comissao: float = 0
    gclid: str = ""
    comprador_email: str = ""
    transacao_id: str = ""


class CsvBody(BaseModel):
    csv: str


# ---------------------------------------------------------------------------
# Vendas
# ---------------------------------------------------------------------------


@router.get("/vendas")
def list_vendas():
    return vendas.list_vendas()


@router.get("/vendas/resumo")
def resumo_vendas():
    return vendas.resumo()


@router.post("/vendas")
def create_venda(body: VendaBody):
    if not body.produto_nome.strip():
        raise HTTPException(status_code=400, detail="Informe o nome do produto.")
    return vendas.registrar_venda(
        {
            "fonte": "manual",
            "produto_id": body.produto_id,
            "produto_nome": body.produto_nome.strip(),
            "valor": body.valor,
            "comissao": body.comissao or round(body.valor * 0.5, 2),
            "gclid": body.gclid.strip(),
            "comprador_email": body.comprador_email.strip(),
            "transacao_id": body.transacao_id.strip(),
            "status": "aprovada",
        }
    )


@router.delete("/vendas/{venda_id}")
def delete_venda(venda_id: int):
    vendas.delete_venda(venda_id)
    return {"ok": True}


@router.post("/vendas/csv")
def importar_csv(body: CsvBody):
    if not body.csv.strip():
        raise HTTPException(status_code=400, detail="CSV vazio.")
    try:
        return vendas.importar_csv(body.csv)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Conversões GCLID (upload offline ao Google Ads)
# ---------------------------------------------------------------------------


@router.post("/vendas/{venda_id}/conversao")
def upload_conversao(venda_id: int):
    venda = vendas.get_venda(venda_id)
    if venda["conversao_status"] == "enviada":
        raise HTTPException(status_code=400, detail="Conversão desta venda já foi enviada.")
    try:
        resultado = gads.upload_conversao(venda["gclid"], venda["valor"], venda["created_at"])
    except LLMError as exc:
        vendas.marcar_conversao(venda_id, "erro", str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    vendas.marcar_conversao(venda_id, "enviada")
    return {"ok": True, "venda": vendas.get_venda(venda_id), "resultado": resultado}


@router.post("/vendas/conversoes/upload")
def upload_conversoes_pendentes():
    """Envia todas as vendas aprovadas com GCLID cuja conversão ainda está pendente."""
    enviadas = []
    erros = []
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM vendas WHERE status = 'aprovada' AND gclid != '' AND conversao_status != 'enviada' ORDER BY id"
        ).fetchall()
    for row in rows:
        venda = row_to_dict(row)
        try:
            gads.upload_conversao(venda["gclid"], venda["valor"], venda["created_at"])
            vendas.marcar_conversao(venda["id"], "enviada")
            enviadas.append(venda["id"])
        except LLMError as exc:
            vendas.marcar_conversao(venda["id"], "erro", str(exc))
            erros.append(f"#{venda['id']}: {exc}")
    return {"enviadas": enviadas, "erros": erros}


# ---------------------------------------------------------------------------
# Webhooks de vendas (públicos — POST das plataformas de afiliados)
# ---------------------------------------------------------------------------


@router.options("/webhook/sale/{fonte}")
def webhook_options(fonte: str):
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@router.post("/webhook/sale/{fonte}")
async def webhook_sale(fonte: str, request: Request):
    fonte = fonte.lower()
    if fonte not in WEBHOOK_FONTES:
        raise HTTPException(status_code=404, detail=f"Fonte desconhecida. Suportadas: {', '.join(WEBHOOK_FONTES)}")
    raw = await request.body()
    payload = None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            payload = parsed
    except Exception:
        pass
    if payload is None:
        # Plataformas que postam em application/x-www-form-urlencoded
        from urllib.parse import parse_qs

        form = parse_qs(raw.decode("utf-8", errors="replace"))
        payload = {key: values[0] if len(values) == 1 else values for key, values in form.items()}
    if not payload:
        raise HTTPException(status_code=400, detail="Payload vazio ou não reconhecido (envie JSON ou form-urlencoded).")
    try:
        data = vendas.parse_webhook(fonte, payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Payload não processado: {exc}")
    venda = vendas.registrar_venda(data)
    return Response(
        content=json.dumps({"ok": True, "id": venda["id"]}, ensure_ascii=False),
        media_type="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
    )
