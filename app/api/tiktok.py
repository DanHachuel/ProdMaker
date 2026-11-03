"""TikTok Ads — troca do auth_code por access_token (1 clique)."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_admin_user
from ..services.llm import LLMError
from ..services.publish_tiktok import trocar_auth_code

router = APIRouter(prefix="/api/tiktok", tags=["tiktok"])


@router.post("/token")
def token(user=Depends(get_admin_user)):
    """Troca o auth_code salvo em Chaves de API por access_token + refresh_token."""
    try:
        return trocar_auth_code()
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
