"""Cliente LLM unificado — pool NVIDIA NIM (compatível OpenAI) + Google Gemini.

Regras do pool:
- Provedores ativos com API key, ordenados por prioridade (1 = primeiro).
- Failover SOMENTE em erro transitório (quota, timeout, transporte, 429/5xx).
- Erro de credencial/payload é registrado com attribution e NÃO é mascarado por outro provider.
- Importações preguiçosas: o servidor sobe mesmo sem as dependências de LLM instaladas
  (o erro claro aparece apenas no momento da ação que precisa do LLM).
"""
import json
import re
import time
from pathlib import Path

from .store import get_settings

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


class LLMError(Exception):
    def __init__(self, message: str, provider: str | None = None, transient: bool = False):
        super().__init__(message)
        self.provider = provider
        self.transient = transient


def list_providers(active_only: bool = True) -> list[dict]:
    settings = get_settings()
    providers = (settings.get("llm") or {}).get("providers") or []
    if active_only:
        providers = [p for p in providers if p.get("active") and (p.get("api_key") or "").strip()]
    return sorted(providers, key=lambda p: int(p.get("priority") or 99))


def find_provider(provider_id: str) -> dict | None:
    for provider in list_providers(active_only=False):
        if provider.get("id") == provider_id:
            return provider
    return None


def _classify_openai_error(exc: Exception) -> bool:
    """True = transitório (pode tentar o próximo provider)."""
    status = getattr(exc, "status_code", None)
    if status in (400, 401, 403, 404, 410):
        return False
    try:
        from openai import AuthenticationError, BadRequestError, NotFoundError

        if isinstance(exc, (AuthenticationError, BadRequestError, NotFoundError)):
            return False
    except Exception:
        pass
    return True


def _classify_gemini_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code is None:
        code = getattr(getattr(exc, "status", None), "value", None)
    if code in (400, 401, 403, 404, 410):
        return False
    return True


def _call_openai_compat(provider: dict, prompt: str, system: str | None, max_tokens: int) -> str:
    from openai import OpenAI

    client = OpenAI(
        base_url=provider.get("base_url") or "https://integrate.api.nvidia.com/v1",
        api_key=provider["api_key"],
        timeout=90.0,
    )
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = client.chat.completions.create(
        model=provider.get("model") or "",
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""


def _call_gemini(provider: dict, prompt: str, system: str | None, max_tokens: int) -> str:
    from google import genai

    client = genai.Client(api_key=provider["api_key"])
    contents = f"{system}\n\n---\n\n{prompt}" if system else prompt
    response = client.models.generate_content(
        model=provider.get("model") or "gemini-2.5-flash",
        contents=contents,
    )
    return response.text or ""


def call_provider(provider: dict, prompt: str, system: str | None = None, max_tokens: int = 4000) -> str:
    kind = provider.get("kind") or provider.get("id")
    try:
        if kind == "gemini":
            return _call_gemini(provider, prompt, system, max_tokens)
        return _call_openai_compat(provider, prompt, system, max_tokens)
    except Exception as exc:  # noqa: BLE001 — classificado abaixo
        if kind == "gemini":
            transient = _classify_gemini_error(exc)
        else:
            transient = _classify_openai_error(exc)
        raise LLMError(
            f"[{provider.get('id')}] {type(exc).__name__}: {exc}",
            provider=provider.get("id"),
            transient=transient,
        ) from exc


def generate(prompt: str, system: str | None = None, max_tokens: int = 4000) -> dict:
    """Gera texto usando o pool de provedores ativos, com failover transitório."""
    providers = list_providers()
    if not providers:
        raise LLMError(
            "Nenhum provedor LLM ativo com API key. Configure NVIDIA NIM ou Gemini em Chaves de API."
        )
    transient_errors = []
    for provider in providers:
        try:
            text = call_provider(provider, prompt, system, max_tokens)
            return {"text": text, "provider": provider.get("id"), "model": provider.get("model")}
        except LLMError as exc:
            if not exc.transient:
                raise
            transient_errors.append(str(exc))
    raise LLMError(
        "Todos os provedores ativos falharam (erros transitórios): " + " | ".join(transient_errors),
        transient=True,
    )


def test_provider(provider_id: str) -> dict:
    provider = find_provider(provider_id)
    if not provider:
        raise LLMError(f"Provedor '{provider_id}' não encontrado nas configurações.")
    if not (provider.get("api_key") or "").strip():
        raise LLMError(f"Provedor '{provider_id}' sem API key configurada.")
    started = time.time()
    text = call_provider(provider, "Responda apenas com a palavra: OK", max_tokens=16)
    latency = int((time.time() - started) * 1000)
    return {
        "ok": True,
        "provider": provider_id,
        "model": provider.get("model"),
        "latency_ms": latency,
        "resposta": (text or "").strip()[:200],
    }


def _parse_json_safely(text: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise LLMError("A resposta do LLM não contém JSON válido.")
    return json.loads(match.group(0))


def analyze_product(produto: dict) -> dict:
    """Análise de produto por IA (plano de ataque) — usa seed/prompts/analise-produto.md."""
    template_path = SEED_DIR / "prompts" / "analise-produto.md"
    template = template_path.read_text(encoding="utf-8") if template_path.exists() else ""
    prompt = (
        template.replace("{NOME}", produto.get("nome") or "")
        .replace("{PLATAFORMA}", produto.get("plataforma") or "")
        .replace("{NICHO}", produto.get("nicho") or "")
        .replace("{PRECO}", str(produto.get("preco") or "—"))
        .replace("{COMISSAO}", str(produto.get("comissao") or "—"))
        .replace("{LINK}", produto.get("link_afiliado") or "")
    )
    result = generate(
        prompt,
        system="Você é um estrategista sênior de marketing de performance e afiliados. Responda SOMENTE com JSON válido, sem markdown e sem comentários.",
        max_tokens=2000,
    )
    parsed = _parse_json_safely(result["text"])
    return {"analise": parsed, "provider": result["provider"]}
