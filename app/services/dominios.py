"""AdsHosting — verificação de domínios via Cloudflare API + DNS público."""
import json

import httpx

from .llm import LLMError

CF_BASE = "https://api.cloudflare.com/client/v4"


def _cloudflare_token() -> str:
    from .store import get_settings

    keys = (get_settings().get("api_keys") or {}).get("cloudflare") or {}
    return (keys.get("api_token") or "").strip()


def _dns_query_ns(nome: str) -> list[str]:
    try:
        import dns.resolver

        answers = dns.resolver.Resolver().resolve(nome, "NS")
        return sorted(str(rdata.target).rstrip(".").lower() for rdata in answers)
    except Exception:
        return []


def _dns_query_a(nome: str) -> list[str]:
    try:
        import dns.resolver

        answers = dns.resolver.Resolver().resolve(nome, "A")
        return sorted(str(rdata) for rdata in answers)
    except Exception:
        return []


def verificar_dominio(nome: str) -> dict:
    """Verifica NS/A via DNS público e status na Cloudflare (se token configurado).

    Nunca inventa dados: sem token, usa apenas DNS; sem DNS, marca como pendente.
    """
    nome = (nome or "").strip().lower().rstrip(".")
    if not nome or "." not in nome:
        raise LLMError("Informe um domínio válido (ex.: meusite.com).")

    resultado = {
        "ns": _dns_query_ns(nome),
        "a": _dns_query_a(nome),
        "ns_cloudflare": False,
        "cf_status": "",
        "cf_zone_id": "",
        "cf_name_servers": [],
    }
    resultado["ns_cloudflare"] = any("ns.cloudflare.com" in ns for ns in resultado["ns"])

    token = _cloudflare_token()
    if token:
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(f"{CF_BASE}/zones", headers={"Authorization": f"Bearer {token}"}, params={"name": nome})
                if response.status_code == 200:
                    payload = response.json()
                    zones = (payload.get("result") or [])
                    if zones:
                        zone = zones[0]
                        resultado["cf_status"] = zone.get("status") or ""
                        resultado["cf_zone_id"] = zone.get("id") or ""
                        resultado["cf_name_servers"] = zone.get("name_servers") or []
                        resultado["ns_cloudflare"] = resultado["ns_cloudflare"] or bool(resultado["cf_name_servers"]) and zone.get("status") == "active"
                elif response.status_code in (401, 403):
                    raise LLMError("Cloudflare rejeitou o token (401/403) — confira o API Token em Chaves de API.")
        except httpx.HTTPError as exc:
            raise LLMError(f"Falha de conexão com a Cloudflare: {exc}") from exc

    online = resultado["ns_cloudflare"] or resultado["cf_status"] == "active"
    resultado["status"] = "online" if online else "pendente"
    return resultado
