"""Dependências FastAPI — get_current_user.

Lê o header `Authorization: Bearer <token>`:
- Cloud mode (SUPABASE_URL/KEY sem DEV_MODE): valida via SDK do Supabase → user_id (UUID).
- DEV fallback (sem chaves ou DEV_MODE=true): usuário local padrão (00000000-...) para
  o sistema continuar funcionando em localhost sem nuvem.
"""
from fastapi import Header, HTTPException

from .services import auth_supabase


def get_current_user(authorization: str = Header(default="")) -> dict:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not auth_supabase.cloud_enabled():
        return {"user_id": auth_supabase.DEV_USER_ID, "email": "dev@local", "mode": "dev"}
    if not token:
        raise HTTPException(status_code=401, detail="Autenticação obrigatória (token ausente).")
    try:
        dados = auth_supabase.verify_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=str(exc))
    return {**dados, "mode": "cloud"}
