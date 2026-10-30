"""Google Ads — upload de conversões offline (click conversions via GCLID).

Implementação enxuta via REST (httpx), sem SDK pesado:
1. refresh_token -> access_token (OAuth2)
2. POST /{version}/customers/{customer_id}:uploadClickConversions

Best-effort: a versão da API é configurável (settings.api_keys['google-ads'].api_version,
default v22) e erros da API são devolvidos com attribution clara.
"""
import time

import httpx

from .llm import LLMError
from .store import get_settings

DEFAULT_API_VERSION = "v22"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ADS_BASE = "https://googleads.googleapis.com"


def _google_ads_config() -> dict:
    keys = (get_settings().get("api_keys") or {}).get("google-ads") or {}
    return {
        "developer_token": (keys.get("developer_token") or "").strip(),
        "client_id": (keys.get("client_id") or "").strip(),
        "client_secret": (keys.get("client_secret") or "").strip(),
        "refresh_token": (keys.get("refresh_token") or "").strip(),
        "customer_id": (keys.get("customer_id") or "").strip().replace("-", ""),
        "conversion_action": (keys.get("conversion_action") or "").strip(),
        "api_version": (keys.get("api_version") or "").strip() or DEFAULT_API_VERSION,
    }


def _access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    try:
        response = httpx.post(
            TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com o OAuth do Google: {exc}", provider="google-ads", transient=True) from exc
    if response.status_code != 200:
        raise LLMError(
            f"Google OAuth rejeitou as credenciais ({response.status_code}): {response.text[:200]} — confira client_id/client_secret/refresh_token em Chaves de API.",
            provider="google-ads",
        )
    return (response.json() or {}).get("access_token", "")


def upload_conversao(gclid: str, valor: float, ocorrido_em: str | None = None, currency: str = "BRL") -> dict:
    """Envia uma conversão offline (GCLID) ao Google Ads. Retorna dict de resultado."""
    config = _google_ads_config()
    missing = [field for field in ("developer_token", "client_id", "client_secret", "refresh_token", "customer_id", "conversion_action") if not config[field]]
    if missing:
        raise LLMError(
            "Conversões GCLID requerem Google Ads configurado em Chaves de API: " + ", ".join(missing) + ".",
            provider="google-ads",
        )
    if not gclid:
        raise LLMError("Venda sem GCLID — não é possível enviar conversão offline.", provider="google-ads")

    try:
        access_token = _access_token(config["client_id"], config["client_secret"], config["refresh_token"])
    except LLMError:
        raise
    if not access_token:
        raise LLMError("OAuth do Google não devolveu access_token.", provider="google-ads")

    ocorrido_em = ocorrido_em or time.strftime("%Y-%m-%d %H:%M:%S%z")
    if "%z" in ocorrido_em:
        # Formato esperado pelo Google Ads: yyyy-mm-dd hh:mm:ss+|-hh:mm
        ocorrido_em = ocorrido_em.replace("+0000", "+00:00")
        if len(ocorrido_em) >= 5 and ocorrido_em[-5] in "+-":
            ocorrido_em = ocorrido_em[:-2] + ":" + ocorrido_em[-2:]
    url = f"{ADS_BASE}/{config['api_version']}/customers/{config['customer_id']}:uploadClickConversions"
    body = {
        "conversions": [
            {
                "gclid": gclid,
                "conversionAction": config["conversion_action"],
                "conversionDateTime": ocorrido_em,
                "conversionValue": valor,
                "currencyCode": currency,
            }
        ],
        "partialFailure": True,
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": config["developer_token"],
        "Content-Type": "application/json",
    }
    try:
        response = httpx.post(url, headers=headers, json=body, timeout=60.0)
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com a Google Ads API: {exc}", provider="google-ads", transient=True) from exc
    if response.status_code == 200:
        return {"ok": True, "resultado": response.json()}
    raise LLMError(
        f"Google Ads API respondeu {response.status_code}: {response.text[:300]} (API {config['api_version']}).",
        provider="google-ads",
    )
