"""Google OAuth 2.0 — conexão de conta com 1 clique (gera o Refresh Token automaticmente).

Fluxo:
1. `GET /api/google/oauth/url` monta a URL de consentimento (scopes do Google Ads,
   access_type=offline + prompt=consent para GARANTIR o refresh_token).
2. O usuário autoriza no popup; o Google redireciona para `redirect_uri`
   (http://localhost:8188/api/google/callback?code=...).
3. `GET /api/google/callback` troca o code por tokens e salva o refresh_token em
   settings.api_keys.google-ads (status "conectado").

Observação: o usuário precisa criar um OAuth Client ID (tipo "Desktop app" ou "Web")
no Google Cloud, com a URL de redirect autorizada, e colar client_id/secret uma vez
em Chaves de API. A autorização da conta passa a ser 1 clique.
"""
import time

import httpx

from .store import get_settings, save_settings

OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


def callback_url(request=None) -> str:
    base = "http://localhost:8188"
    if request is not None:
        host = request.headers.get("host")
        base = f"{request.url.scheme}://{host}"
    return f"{base}/api/google/callback"


def build_auth_url(request=None) -> dict:
    keys = (get_settings().get("api_keys") or {}).get("google-ads") or {}
    client_id = (keys.get("client_id") or "").strip()
    if not client_id:
        from .llm import LLMError

        raise LLMError(
            "Para conectar com 1 clique, primeiro salve o 'OAuth Client ID' do Google Cloud em Chaves de API (card Google Ads)."
        )
    redirect = callback_url(request)
    import urllib.parse

    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": OAUTH_SCOPE,
            "access_type": "offline",
            "prompt": "consent",  # força a devolução do refresh_token
            "include_granted_scopes": "true",
        }
    )
    return {"url": f"{AUTH_URL}?{query}", "redirect_uri": redirect}


def exchange_code(code: str, request=None) -> dict:
    keys = (get_settings().get("api_keys") or {}).get("google-ads") or {}
    client_id = (keys.get("client_id") or "").strip()
    client_secret = (keys.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        from .llm import LLMError

        raise LLMError("client_id e client_secret precisam estar salvos em Chaves de API antes de concluir o OAuth.")
    redirect = callback_url(request)
    try:
        response = httpx.post(
            TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code.strip(),
                "grant_type": "authorization_code",
                "redirect_uri": redirect,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        from .llm import LLMError

        raise LLMError(f"Falha de conexão com o OAuth do Google: {exc}", provider="google-ads", transient=True) from exc
    if response.status_code != 200:
        from .llm import LLMError

        raise LLMError(
            f"Google rejeitou a troca do código ({response.status_code}): {response.text[:200]}. "
            "Confira redirect_uri autorizado e tente novamente.",
            provider="google-ads",
        )
    tokens = response.json() or {}
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        from .llm import LLMError

        raise LLMError(
            "O Google não devolveu refresh_token — apague o app nas configurações da conta Google "
            "(apps de terceiros conectados) e tente novamente, ou marque prompt=consent."
        )
    settings = get_settings()
    api_keys = settings.setdefault("api_keys", {})
    google = api_keys.setdefault("google-ads", {})
    google["refresh_token"] = refresh_token
    google["connected_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    save_settings(settings)
    return {"ok": True, "connected_at": google["connected_at"], "scope": tokens.get("scope", OAUTH_SCOPE)}
