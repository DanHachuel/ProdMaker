from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import adswords, campaigns, publish_ads
from ..services.database import get_db, row_to_dict
from ..services.llm import LLMError

router = APIRouter(prefix="/api", tags=["ads"])


def _produto_or_none(produto_id: int | None) -> dict:
    if not produto_id:
        return {"id": None, "nome": "Produto", "nicho": "", "plataforma": ""}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    return row_to_dict(row) if row else {"id": produto_id, "nome": "Produto", "nicho": "", "plataforma": ""}


class KeywordsBody(BaseModel):
    produto_id: int | None = None


class PalavraBody(BaseModel):
    produto_id: int | None = None
    tipo: str = "positiva"
    texto: str
    correspondencia: str = "frase"


class CriativosBody(BaseModel):
    produto_id: int | None = None
    quantidade: int = 3


class CampanhaBody(BaseModel):
    produto_id: int | None = None
    plataforma: str = "google"
    nome: str = ""
    orcamento_diario: float | None = None
    quantidade_criativos: int | None = None
    keywords: list = []
    negativas: list = []
    criativos: list = []


# ---------------------------------------------------------------------------
# AdsWords
# ---------------------------------------------------------------------------


@router.post("/adswords/gerar")
def adswords_gerar(body: KeywordsBody):
    produto = _produto_or_none(body.produto_id)
    try:
        return adswords.gerar(produto)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/adswords")
def adswords_listar(produto_id: int | None = None):
    return adswords.listar(produto_id)


@router.post("/adswords")
def adswords_adicionar(body: PalavraBody):
    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="Informe a palavra.")
    if body.tipo not in ("positiva", "negativa"):
        raise HTTPException(status_code=400, detail="Tipo inválido.")
    return adswords.adicionar_manual(_produto_or_none(body.produto_id), body.tipo, body.texto, body.correspondencia)


@router.delete("/adswords/{palavra_id}")
def adswords_remover(palavra_id: int):
    try:
        adswords.remover(palavra_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}


@router.post("/criativos/gerar")
def criativos_gerar(body: CriativosBody):
    produto = _produto_or_none(body.produto_id)
    try:
        return adswords.gerar_criativos(produto, body.quantidade)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Campanhas (AdsCreator)
# ---------------------------------------------------------------------------


@router.get("/campanhas")
def campanhas_listar(produto_id: int | None = None):
    return campaigns.listar(produto_id)


@router.post("/campanhas")
def campanhas_criar(body: CampanhaBody):
    produto = _produto_or_none(body.produto_id)
    try:
        plano = campaigns.construir(produto, body.plataforma, body.model_dump())
        if body.nome.strip():
            plano["nome"] = body.nome.strip()
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return campaigns.salvar(plano)


@router.get("/campanhas/{campanha_id}")
def campanhas_get(campanha_id: int):
    try:
        return campaigns.get(campanha_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/campanhas/{campanha_id}")
def campanhas_remover(campanha_id: int):
    try:
        campaigns.remover(campanha_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}


@router.post("/campanhas/{campanha_id}/publicar")
def campanhas_publicar(campanha_id: int):
    try:
        campanha = campaigns.get(campanha_id)
    except LLMError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if campanha["status"] == "publicada":
        raise HTTPException(status_code=400, detail="Campanha já publicada.")
    plataforma = campanha["plataforma"]
    try:
        if plataforma == "google":
            resultado = publish_ads.publicar_google(campanha)
        elif plataforma == "meta":
            resultado = publish_ads.publicar_meta(campanha)
        else:
            resultado = {
                "plataforma": "tiktok",
                "etapas": [{"etapa": "manual", "observacao": "TikTok: siga o checklist do plano (formato 9:16 UGC) e crie manualmente no TikTok Ads Manager."}],
                "observacao": "Plano manual — crie manualmente no TikTok Ads Manager.",
            }
    except LLMError as exc:
        campaigns.marcar_publicada(campanha_id, {}, status="erro", erro=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    campanha = campaigns.marcar_publicada(campanha_id, resultado)
    return campanha
