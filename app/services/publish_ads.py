"""Engines de publicação de campanhas — Google Ads (REST mutates) e Meta Ads (Marketing API).

Best-effort com erros atribuídos por etapa. TikTok permanece manual (guia no plano).
"""
import httpx

from .llm import LLMError
from .store import get_settings

ADS_BASE = "https://googleads.googleapis.com"
GRAPH_BASE = "https://graph.facebook.com/v19.0"


# ---------------------------------------------------------------------------
# Google Ads — cadeia de mutates
# ---------------------------------------------------------------------------


def _google_config() -> dict:
    keys = (get_settings().get("api_keys") or {}).get("google-ads") or {}
    return {
        "developer_token": (keys.get("developer_token") or "").strip(),
        "client_id": (keys.get("client_id") or "").strip(),
        "client_secret": (keys.get("client_secret") or "").strip(),
        "refresh_token": (keys.get("refresh_token") or "").strip(),
        "customer_id": (keys.get("customer_id") or "").strip().replace("-", ""),
        "api_version": (keys.get("api_version") or "").strip() or "v22",
    }


def _access_token() -> str:
    from .gads import _access_token as token

    config = _google_config()
    missing = [field for field in ("client_id", "client_secret", "refresh_token") if not config[field]]
    if missing:
        raise LLMError("Google Ads: faltam " + ", ".join(missing) + " em Chaves de API.", provider="google")
    return token(config["client_id"], config["client_secret"], config["refresh_token"])


def _mutate(client, config, headers, operations: list, label: str) -> dict:
    url = f"{ADS_BASE}/{config['api_version']}/customers/{config['customer_id']}/googleAds:mutate"
    response = client.post(url, headers=headers, json={"operations": operations, "partialFailure": True})
    if response.status_code != 200:
        raise LLMError(f"[Google:{label}] HTTP {response.status_code}: {response.text[:300]}", provider="google")
    payload = response.json()
    errors = []
    for detail in (payload.get("partialFailureError") or {}).get("details", []):
        errors.append(detail.get("message") or str(detail)[:200])
    names = []
    for result in payload.get("results", []):
        names.append(result.get("resourceName", ""))
    return {"names": names, "errors": errors}


def publicar_google(campanha: dict) -> dict:
    config = _google_config()
    missing = [field for field in ("developer_token", "client_id", "client_secret", "refresh_token", "customer_id") if not config[field]]
    if missing:
        raise LLMError(
            "Publicação Google Ads requer: " + ", ".join(missing) + " (em Chaves de API).",
            provider="google",
        )
    keywords = [item.get("texto") or item.get("palavra") or "" for item in campanha.get("keywords", [])]
    negativas = [item.get("texto") or item.get("palavra") or "" for item in campanha.get("negativas", [])]
    keywords = [text for text in keywords if text.strip()]
    negativas = [text for text in negativas if text.strip()]

    cpa_micro = int((campanha.get("cpa_alvo") or 0) * 1_000_000)
    budget_micro = int((campanha.get("orcamento_diario") or 0) * 1_000_000)
    nome = campanha["nome"]

    access = _access_token()
    headers = {
        "Authorization": f"Bearer {access}",
        "developer-token": config["developer_token"],
        "Content-Type": "application/json",
    }
    etapas = []
    try:
        with httpx.Client(timeout=60.0) as client:
            # 1) Orçamento
            budget = _mutate(
                client,
                config,
                headers,
                [{"create": {"name": f"{nome} — Orçamento", "amountMicros": budget_micro, "deliveryMethod": "STANDARD"}}],
                "orçamento",
            )
            etapas.append({"etapa": "orçamento", **budget})
            if budget["errors"]:
                raise LLMError("[Google:orçamento] " + "; ".join(budget["errors"]), provider="google")
            budget_name = budget["names"][0]

            # 2) Campanha (pausada para revisão segura)
            campaign = _mutate(
                client,
                config,
                headers,
                [{
                    "create": {
                        "name": nome,
                        "status": "PAUSED",
                        "advertisingChannelType": "SEARCH",
                        "campaignBudget": budget_name,
                        "manualCpc": {},
                        "networkSettings": {"targetGoogleSearch": True, "targetSearchNetwork": True},
                        "startDate": None,
                        "endDate": None,
                    }
                }],
                "campanha",
            )
            etapas.append({"etapa": "campanha", **campaign})
            if campaign["errors"]:
                raise LLMError("[Google:campanha] " + "; ".join(campaign["errors"]), provider="google")
            campaign_name = campaign["names"][0]

            # 3) Grupo de anúncios
            ad_group = _mutate(
                client,
                config,
                headers,
                [{"create": {"name": f"{nome} — Grupo 1", "campaign": campaign_name, "status": "PAUSED", "type": "SEARCH_STANDARD", "cpcBidMicros": cpa_micro or 1_000_000}}],
                "grupo de anúncios",
            )
            etapas.append({"etapa": "grupo de anúncios", **ad_group})
            if ad_group["errors"]:
                raise LLMError("[Google:grupo de anúncios] " + "; ".join(ad_group["errors"]), provider="google")
            ad_group_name = ad_group["names"][0]

            # 4) Palavras-chave positivas (frase) + negativas (campanha)
            criterion_ops = []
            for text in keywords:
                criterion_ops.append({
                    "create": {
                        "adGroup": ad_group_name,
                        "keyword": {"text": text, "matchType": "PHRASE"},
                        "status": "PAUSED",
                    }
                })
            for text in negativas:
                criterion_ops.append({
                    "create": {
                        "campaign": campaign_name,
                        "keyword": {"text": text, "matchType": "PHRASE"},
                        "negative": True,
                    }
                })
            if criterion_ops:
                criteria = _mutate(client, config, headers, criterion_ops, "palavras-chave")
                etapas.append({"etapa": "palavras-chave", **criteria})
                if criteria["errors"]:
                    raise LLMError("[Google:palavras-chave] " + "; ".join(criteria["errors"]), provider="google")

            # 5) Anúncio RSA responsivo
            headlines = [
                {"text": f"{campanha['nome'].split(' — ')[0]}"},
                {"text": "Compre Agora com Desconto"},
                {"text": "Oferta por Tempo Limitado"},
            ]
            descriptions = [
                {"text": f"Garantia e entrega rápida. Lance R$ {campanha.get('cpa_alvo') or 0} alvo."},
                {"text": "Acesse o site oficial e aproveite."},
            ]
            ad = _mutate(
                client,
                config,
                headers,
                [{
                    "create": {
                        "adGroup": ad_group_name,
                        "status": "PAUSED",
                        "ad": {
                            "responsiveSearchAd": {
                                "headlines": headlines,
                                "descriptions": descriptions,
                                "finalUrls": (campanha.get("plano") or {}).get("final_urls", []) or [],
                            }
                        },
                    }
                }],
                "anúncio",
            )
            etapas.append({"etapa": "anúncio", **ad})
            if ad["errors"]:
                raise LLMError("[Google:anúncio] " + "; ".join(ad["errors"]), provider="google")
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com a Google Ads API: {exc}", provider="google", transient=True) from exc

    return {
        "plataforma": "google",
        "etapas": etapas,
        "campaign": campaign_name,
        "observacao": "Campanha e recursos criados PAUSADOS para revisão — ative manualmente quando aprovar.",
    }


# ---------------------------------------------------------------------------
# Meta Ads — 4 POSTs simples (campanha -> conjunto -> criativo -> anúncio)
# ---------------------------------------------------------------------------


def publicar_meta(campanha: dict) -> dict:
    keys = (get_settings().get("api_keys") or {}).get("meta") or {}
    access_token = (keys.get("access_token") or "").strip()
    ad_account_id = (keys.get("ad_account_id") or "").strip()
    missing = [name for name, value in (("access_token", access_token), ("ad_account_id", ad_account_id)) if not value]
    if missing:
        raise LLMError("Publicação Meta Ads requer: " + ", ".join(missing) + " (em Chaves de API).", provider="meta")
    account = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    plano = campanha.get("plano") or {}
    budget_cents = int((campanha.get("orcamento_diario") or 0) * 100)
    criativos = campanha.get("criativos") or []
    roteiro_base = (criativos[0].get("roteiro") if criativos else "") or f"Conheça {campanha['nome']}!"
    link = plano.get("final_urls", [""])[0] if plano.get("final_urls") else ""

    etapas = []
    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{GRAPH_BASE}/{account}/campaigns",
                data={"name": campanha["nome"], "objective": "OUTCOME_SALES", "status": "PAUSED", "special_ad_categories": "[]", "access_token": access_token},
            )
            campaign_id = (response.json() or {}).get("id")
            if not campaign_id:
                raise LLMError(f"[Meta:campanha] {response.status_code}: {response.text[:300]}", provider="meta")
            etapas.append({"etapa": "campanha", "id": campaign_id})

            response = client.post(
                f"{GRAPH_BASE}/{account}/adsets",
                data={
                    "name": f"{campanha['nome']} — Conjunto",
                    "campaign_id": campaign_id,
                    "daily_budget": budget_cents,
                    "billing_event": "IMPRESSIONS",
                    "optimization_goal": "CONVERSIONS",
                    "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
                    "status": "PAUSED",
                    "targeting": "{}",
                    "access_token": access_token,
                },
            )
            adset_id = (response.json() or {}).get("id")
            if not adset_id:
                raise LLMError(f"[Meta:conjunto] {response.status_code}: {response.text[:300]}", provider="meta")
            etapas.append({"etapa": "conjunto", "id": adset_id})

            response = client.post(
                f"{GRAPH_BASE}/{account}/adcreatives",
                data={"name": f"{campanha['nome']} — Criativo", "message": roteiro_base[:2000], "link": link, "access_token": access_token},
            )
            creative_id = (response.json() or {}).get("id")
            if not creative_id:
                raise LLMError(f"[Meta:criativo] {response.status_code}: {response.text[:300]}", provider="meta")
            etapas.append({"etapa": "criativo", "id": creative_id})

            response = client.post(
                f"{GRAPH_BASE}/{account}/ads",
                data={"name": campanha["nome"], "adset_id": adset_id, "creative": {"creative_id": creative_id}, "status": "PAUSED", "access_token": access_token},
            )
            ad_id = (response.json() or {}).get("id")
            if not ad_id:
                raise LLMError(f"[Meta:anúncio] {response.status_code}: {response.text[:300]}", provider="meta")
            etapas.append({"etapa": "anúncio", "id": ad_id})
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com a Meta API: {exc}", provider="meta", transient=True) from exc

    return {
        "plataforma": "meta",
        "etapas": etapas,
        "observacao": "Criado PAUSADO para revisão — ative manualmente quando aprovar.",
    }
