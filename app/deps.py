"""Dependências FastAPI — get_current_user / get_admin_user.

Lê o header `Authorization: Bearer <token>`:
- Cloud mode (SUPABASE_URL/KEY sem DEV_MODE): valida via SDK do Supabase → user_id (UUID).
- DEV fallback (sem chaves ou DEV_MODE=true): usuário local padrão (00000000-...) para
  o sistema continuar funcionando em localhost sem nuvem.

Roles (RBAC): 'admin' (Super Admin: dan.hachuel@gmail.com ou modo DEV) ou 'user'.
"""
from fastapi import Depends, Header, HTTPException

from .services import auth_supabase


def get_current_user(authorization: str = Header(default="")) -> dict:
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not auth_supabase.cloud_enabled():
        role = auth_supabase.registrar_usuario(auth_supabase.DEV_USER_ID, "dev@local", "dev")
        return {"user_id": auth_supabase.DEV_USER_ID, "email": "dev@local", "mode": "dev", "role": role}
    if not token:
        raise HTTPException(status_code=401, detail="Autenticação obrigatória (token ausente).")
    try:
        dados = auth_supabase.verify_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=str(exc))
    role = auth_supabase.registrar_usuario(dados["user_id"], dados["email"], "cloud")
    return {**dados, "mode": "cloud", "role": role}


def get_admin_user(user=Depends(get_current_user)) -> dict:
    """Exige role 'admin' (Super Admin); caso contrário, 403."""
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao Super Admin.")
    return user
