from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.llm import LLMError, generate, list_providers, test_provider
from ..services.store import get_settings, save_settings

router = APIRouter(prefix="/api/llm", tags=["llm"])


class TestBody(BaseModel):
    id: str


class GenerateBody(BaseModel):
    prompt: str
    system: str | None = None
    max_tokens: int = 4000


@router.get("/providers")
def providers():
    """Provedores LLM salvos (cartões de Chaves de API)."""
    return list_providers(active_only=False)


@router.put("/providers")
def save_providers(payload: dict):
    """Salva a lista de cartões de provedor LLM (substitui settings.llm.providers)."""
    if not isinstance(payload, dict) or not isinstance(payload.get("providers"), list):
        raise HTTPException(status_code=400, detail="Envie { 'providers': [ ... ] }.")
    settings = get_settings()
    settings["llm"] = {"providers": payload["providers"]}
    save_settings(settings)
    return {"ok": True, "providers": settings["llm"]["providers"]}


@router.post("/test")
def test(body: TestBody):
    """Teste de chamada read-only — valida credencial/modelo no momento da ação."""
    try:
        return test_provider(body.id)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/generate")
def generate_text(body: GenerateBody):
    """Geração pelo pool com failover — usada por Produtos, Studio, AdsPages etc."""
    try:
        return generate(body.prompt, system=body.system, max_tokens=body.max_tokens)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
