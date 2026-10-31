"""Product Builder Wizard — 4 rotas de LLM + geração de PDF (Fase 10)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import builder
from ..services.llm import LLMError

router = APIRouter(prefix="/api/builder", tags=["builder"])


class OfertasBody(BaseModel):
    nicho: str
    avatar: str = ""


class EstruturaBody(BaseModel):
    oferta: dict


class AnunciosBody(BaseModel):
    produto: str
    promessa: str = ""
    nicho: str = ""
    link: str = ""


class PdfBody(BaseModel):
    oferta: dict
    estrutura: dict
    preco: float
    parceiro: str = ""
    modo: str = "rapido"


class SalvarBody(BaseModel):
    record_id: int
    anuncios: list


def _erro(exc: LLMError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.post("/generate-offers")
def generate_offers(body: OfertasBody):
    try:
        return builder.gerar_ofertas(body.nicho, body.avatar)
    except LLMError as exc:
        raise _erro(exc)


@router.post("/generate-structure")
def generate_structure(body: EstruturaBody):
    try:
        return builder.gerar_estrutura(body.oferta)
    except LLMError as exc:
        raise _erro(exc)


@router.post("/generate-ads")
def generate_ads(body: AnunciosBody):
    try:
        return builder.gerar_anuncios(body.produto, body.promessa, body.nicho, body.link)
    except LLMError as exc:
        raise _erro(exc)


@router.post("/generate-pdf")
def generate_pdf(body: PdfBody):
    try:
        return builder.gerar_pdf(body.oferta, body.estrutura, body.preco, body.parceiro, body.modo)
    except LLMError as exc:
        raise _erro(exc)


@router.post("/salvar")
def salvar(body: SalvarBody):
    try:
        return builder.salvar(body.anuncios, body.record_id)
    except (LLMError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
