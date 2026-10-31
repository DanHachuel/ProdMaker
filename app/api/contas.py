"""Contas do Google — OAuth 1 clique (URL de consentimento + callback)."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from ..services import oauth_google
from ..services.llm import LLMError

router = APIRouter(prefix="/api/google", tags=["google-oauth"])


@router.get("/oauth/url")
def oauth_url(request: Request):
    """Monta a URL de consentimento do Google (abrir em popup/aba)."""
    try:
        return oauth_google.build_auth_url(request)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/callback")
def oauth_callback(request: Request, code: str = "", error: str = ""):
    """Callback do OAuth do Google — troca o code e salva o refresh_token."""
    if error:
        return _result_page(False, f"Google retornou erro: {error}")
    if not code:
        return _result_page(False, "Callback sem código de autorização.")
    try:
        oauth_google.exchange_code(code, request)
    except LLMError as exc:
        return _result_page(False, str(exc))
    return _result_page(True, "Conta Google conectada! O Refresh Token foi salvo automaticamente em Chaves de API.")


def _result_page(ok: bool, mensagem: str) -> HTMLResponse:
    cor = "#10b981" if ok else "#ef4444"
    titulo = "Conectado" if ok else "Falha na conexão"
    return HTMLResponse(
        f"""
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>ProdMaker — Google OAuth</title>
<style>body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}}
.box{{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:36px;max-width:460px;text-align:center}}
.ico{{font-size:40px}} h1{{color:{cor};font-size:20px;margin:12px 0}} p{{color:#64748b;font-size:14px}}
</style></head><body><div class="box"><div class="ico">{'✅' if ok else '❌'}</div><h1>{titulo}</h1><p>{mensagem}</p>
<p style="font-size:12px;margin-top:16px">Pode fechar esta janela e voltar ao ProdMaker.</p></div></body></html>"""
    )
