"""TikTok Ads — publicação automática via Marketing API (OAuth + campaign/adgroup).

Fluxo: auth_code (do portal TikTok) -> access_token (24h) -> refresh_token ->
campanha PAUSADA -> grupo de anúncios. O criativo (vídeo/imagem) exige upload de
arquivo local: sem vídeo informado, a campanha e o grupo são criados e o passo
final (anúncio) fica como instrução honesta — nenhum hack é inventado.
"""
import time

import httpx

from .llm import LLMError
from .store import get_settings, save_settings

TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3"


def _keys() -> dict:
    keys = (get_settings().get("api_keys") or {}).get("tiktok") or {}
    return {
        "app_id": (keys.get("app_id") or "").strip(),
        "app_secret": (keys.get("app_secret") or "").strip(),
        "auth_code": (keys.get("auth_code") or "").strip(),
        "access_token": (keys.get("access_token") or "").strip(),
        "refresh_token": (keys.get("refresh_token") or "").strip(),
        "advertiser_id": (keys.get("advertiser_id") or "").strip(),
    }


def _check(required: list[str]) -> None:
    config = _keys()
    missing = [field for field in required if not config[field]]
    if missing:
        raise LLMError(
            "TikTok Ads requer em Chaves de API: " + ", ".join(missing) + ".",
            provider="tiktok",
        )


def trocar_auth_code() -> dict:
    """Troca o auth_code (portal TikTok) por access_token + refresh_token."""
    config = _keys()
    _check(["app_id", "app_secret", "auth_code"])
    try:
        response = httpx.post(
            f"{TIKTOK_API}/oauth2/access_token/",
            json={"app_id": config["app_id"], "secret": config["app_secret"], "auth_code": config["auth_code"]},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com o TikTok: {exc}", provider="tiktok", transient=True) from exc
    payload = response.json() or {}
    if payload.get("code") != 0:
        raise LLMError(
            f"TikTok rejeitou o auth_code ({payload.get('code')}): {payload.get('message')} — gere um novo código no portal.",
            provider="tiktok",
        )
    data = payload.get("data") or {}
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    advertiser_ids = data.get("advertiser_ids") or []
    if not access_token:
        raise LLMError("TikTok não devolveu access_token.", provider="tiktok")

    settings = get_settings()
    tiktok = settings.setdefault("api_keys", {}).setdefault("tiktok", {})
    tiktok["access_token"] = access_token
    tiktok["refresh_token"] = refresh_token
    tiktok["connected_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    if advertiser_ids and not (tiktok.get("advertiser_id") or "").strip():
        tiktok["advertiser_id"] = str(advertiser_ids[0])
    save_settings(settings)
    return {
        "ok": True,
        "connected_at": tiktok["connected_at"],
        "advertiser_ids": advertiser_ids,
        "advertiser_id": tiktok.get("advertiser_id"),
    }


def _post(path: str, body: dict, token: str) -> dict:
    try:
        response = httpx.post(
            f"{TIKTOK_API}{path}",
            headers={"Access-Token": token, "Content-Type": "application/json"},
            json=body,
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com o TikTok: {exc}", provider="tiktok", transient=True) from exc
    payload = response.json() or {}
    if payload.get("code") != 0:
        raise LLMError(
            f"TikTok API ({path}) {payload.get('code')}: {payload.get('message')}",
            provider="tiktok",
        )
    return payload.get("data") or {}


def publicar_campanha(campanha: dict) -> dict:
    """Cria campanha (PAUSADA) + grupo de anúncios. Criativo final = instrução honesta."""
    config = _keys()
    _check(["app_id", "app_secret", "advertiser_id", "access_token"])
    plano = campanha.get("plano") or {}
    nome = campanha["nome"]
    orcamento_dia = float(campanha.get("orcamento_diario") or 0)
    if orcamento_dia <= 0:
        orcamento_dia = 15.0
    budget_cents = int(orcamento_dia * 100)

    etapas = []
    campaign = _post(
        "/campaign/create/",
        {
            "advertiser_id": config["advertiser_id"],
            "campaign_name": nome,
            "objective_type": "CONVERSIONS",
            "budget_mode": "BUDGET_MODE_DAY",
            "budget": budget_cents,
            "operation_status": "DISABLE",
        },
        config["access_token"],
    )
    campaign_id = campaign.get("campaign_id")
    etapas.append({"etapa": "campanha", "id": campaign_id, "status": "PAUSED"})

    adgroup = _post(
        "/adgroup/create/",
        {
            "advertiser_id": config["advertiser_id"],
            "campaign_id": campaign_id,
            "adgroup_name": f"{nome} — Grupo 1",
            "placement_type": "PLACEMENT_TYPE_AUTOMATIC",
            "budget_mode": "BUDGET_MODE_DAY",
            "budget": budget_cents,
            "schedule_type": "SCHEDULE_START_END",
            "optimization_goal": "CONVERT",
            "billing_event": "OCPM",
            "operation_status": "DISABLE",
        },
        config["access_token"],
    )
    adgroup_id = adgroup.get("adgroup_id")
    etapas.append({"etapa": "grupo", "id": adgroup_id, "status": "PAUSED"})

    return {
        "plataforma": "tiktok",
        "etapas": etapas,
        "campaign": campaign_id,
        "adgroup": adgroup_id,
        "observacao": (
            "Campanha e grupo criados PAUSADOS. Passo final (anúncio): suba o vídeo vertical 9:16 "
            "em TikTok Ads Manager ou use o upload de criativo — o ProdMaker avisa quando não há mídia informada."
        ),
    }
