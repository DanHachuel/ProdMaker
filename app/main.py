import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .services.database import ensure_db, get_db, now_str, row_to_dict
from .services.llm import LLMError, analyze_product, list_providers
from .services.store import PRODMAKER_HOME, STORAGE, STATE, ensure_state_dir, get_master_code, get_settings, save_settings

APP_VERSION = "0.1.07"
COOKIE_NAME = "prodmaker_session"
SESSION_DAYS = 30
MASTER_ALIAS = "admin"

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
LEGAL_DIR = Path(__file__).resolve().parent.parent / "legal"

app = FastAPI(title="ProdMaker", version=APP_VERSION)

from .api import infoprodutos as infoprodutos_router  # noqa: E402
from .api import llm as llm_router  # noqa: E402
from .api import paginas as paginas_router  # noqa: E402
from .api import dominios as dominios_router  # noqa: E402
from .api import tracking as tracking_router  # noqa: E402

app.include_router(llm_router.router)
app.include_router(infoprodutos_router.router)
app.include_router(paginas_router.router)
app.include_router(dominios_router.router)
app.include_router(tracking_router.router)

ensure_db()

# ---------------------------------------------------------------------------
# Auth local (v1: validação simulada; estrutura pronta para validação remota)
# ---------------------------------------------------------------------------


def get_secret() -> bytes:
    ensure_state_dir()
    secret_path = STATE / "secret.key"
    if not secret_path.exists():
        secret_path.write_bytes(os.urandom(32))
    return secret_path.read_bytes()


def make_token(email: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"email": email, "exp": int(time.time()) + SESSION_DAYS * 86400}).encode()).decode()
    signature = hmac.new(get_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def read_token(token: str) -> dict | None:
    try:
        payload, signature = token.split(".", 1)
        expected = hmac.new(get_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload))
        if int(data.get("exp", 0)) < time.time():
            return None
        return data
    except Exception:
        return None


def get_license() -> dict:
    license_path = STATE / "license.json"
    if license_path.exists():
        try:
            return json.loads(license_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


class LoginBody(BaseModel):
    email: str
    activation_code: str


def is_master_code(code: str) -> bool:
    """Código Mestre (MASTER_CODE) ou o alias 'admin' liberam o login com qualquer e-mail."""
    return code == get_master_code() or code.strip().lower() == MASTER_ALIAS


@app.post("/api/auth/login")
def auth_login(body: LoginBody, response: Response):
    email = body.email.strip()
    code = body.activation_code.strip()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Informe um e-mail válido.")
    if not is_master_code(code):
        raise HTTPException(
            status_code=400,
            detail="Código de ativação inválido. Use o Código de Ativação Mestre impresso no terminal ao iniciar o ProdMaker (ou digite 'admin').",
        )
    ensure_state_dir()
    license_path = STATE / "license.json"
    if not license_path.exists():
        license_data = {"email": email, "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "expires": "2099-12-31"}
        license_path.write_text(json.dumps(license_data, ensure_ascii=False, indent=2), encoding="utf-8")
    response.set_cookie(COOKIE_NAME, make_token(email), httponly=True, max_age=SESSION_DAYS * 86400, samesite="lax")
    return {"ok": True, "email": email, "license": get_license()}


@app.post("/api/auth/logout")
def auth_logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@app.get("/api/auth/session")
def auth_session(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    data = read_token(token) if token else None
    if not data:
        return {"authenticated": False}
    return {"authenticated": True, "email": data.get("email"), "license": get_license()}


# ---------------------------------------------------------------------------
# Produtos (Seus Produtos — em análise / aprovados, com análise por IA)
# ---------------------------------------------------------------------------


class ProdutoBody(BaseModel):
    nome: str
    plataforma: str = "Outro"
    link_afiliado: str = ""
    comissao: float = 0
    preco: float = 0
    nicho: str = ""


@app.get("/api/produtos")
def list_produtos():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM produtos ORDER BY updated_at DESC, id DESC").fetchall()
    return [row_to_dict(row) for row in rows]


@app.post("/api/produtos")
def create_produto(body: ProdutoBody):
    if not body.nome.strip():
        raise HTTPException(status_code=400, detail="Informe o nome do produto.")
    timestamp = now_str()
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO produtos (nome, plataforma, link_afiliado, comissao, preco, nicho, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'em_analise', ?, ?)",
            (body.nome.strip(), body.plataforma, body.link_afiliado.strip(), body.comissao, body.preco, body.nicho.strip(), timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


@app.put("/api/produtos/{produto_id}")
def update_produto(produto_id: int, body: ProdutoBody):
    if not body.nome.strip():
        raise HTTPException(status_code=400, detail="Informe o nome do produto.")
    with get_db() as conn:
        found = conn.execute("SELECT id FROM produtos WHERE id = ?", (produto_id,)).fetchone()
        if not found:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        conn.execute(
            "UPDATE produtos SET nome = ?, plataforma = ?, link_afiliado = ?, comissao = ?, preco = ?, nicho = ?, updated_at = ? WHERE id = ?",
            (body.nome.strip(), body.plataforma, body.link_afiliado.strip(), body.comissao, body.preco, body.nicho.strip(), now_str(), produto_id),
        )
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    return row_to_dict(row)


@app.delete("/api/produtos/{produto_id}")
def delete_produto(produto_id: int):
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM produtos WHERE id = ?", (produto_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return {"ok": True}


@app.post("/api/produtos/{produto_id}/aprovar")
def aprovar_produto(produto_id: int):
    """Aprova o produto e, se houver LLM ativo, gera a análise (plano de ataque).

    Sem LLM configurado a aprovação acontece normalmente (sem travas de pré-registo);
    a análise fica pendente e pode ser gerada depois via /api/produtos/{id}/analisar.
    """
    with get_db() as conn:
        cursor = conn.execute("UPDATE produtos SET status = 'aprovado', updated_at = ? WHERE id = ?", (now_str(), produto_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    produto = row_to_dict(row)
    analysis = None
    if list_providers():
        try:
            analysis = analyze_product(produto)
            with get_db() as conn:
                conn.execute("UPDATE produtos SET analysis = ? WHERE id = ?", (json.dumps(analysis, ensure_ascii=False), produto_id))
            produto["analysis"] = analysis
        except LLMError as exc:
            produto["analysis_error"] = str(exc)
    return produto


@app.post("/api/produtos/{produto_id}/analisar")
def analisar_produto(produto_id: int):
    """Gera (ou regenera) a análise de IA de um produto aprovado."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    produto = row_to_dict(row)
    try:
        analysis = analyze_product(produto)
    except LLMError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    with get_db() as conn:
        conn.execute("UPDATE produtos SET analysis = ?, updated_at = ? WHERE id = ?", (json.dumps(analysis, ensure_ascii=False), now_str(), produto_id))
    produto["analysis"] = analysis
    return produto


# ---------------------------------------------------------------------------
# Núcleo
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION}


@app.get("/api/version")
def version():
    return {"version": APP_VERSION, "canonical": "0.1.7"}


@app.get("/api/settings")
def read_settings():
    return get_settings()


@app.put("/api/settings")
def update_settings(data: dict):
    return save_settings(data)


# ---------------------------------------------------------------------------
# Pixel próprio (AdsPixel) — recebe eventos das páginas geradas/publicadas
# ---------------------------------------------------------------------------


@app.options("/track")
def track_options():
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )


@app.api_route("/track", methods=["GET", "POST"])
def track(request: Request):
    params = dict(request.query_params)
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "")
    known = {"event", "page", "gclid", "utm_source", "utm_medium", "utm_campaign", "ref"}
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO visitas (event, page, gclid, utm_source, utm_medium, utm_campaign, ref, ip, user_agent, extra, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    params.get("event", "pageview"),
                    params.get("page", ""),
                    params.get("gclid", ""),
                    params.get("utm_source", ""),
                    params.get("utm_medium", ""),
                    params.get("utm_campaign", ""),
                    params.get("ref", ""),
                    ip,
                    request.headers.get("user-agent", ""),
                    json.dumps({k: v for k, v in params.items() if k not in known}, ensure_ascii=False),
                    now_str(),
                ),
            )
    except Exception:
        pass  # o pixel nunca deve quebrar a página do visitante
    return Response(status_code=204, headers={"Access-Control-Allow-Origin": "*"})


# ---------------------------------------------------------------------------
# Estáticos: /legal, frontend/dist (SPA fallback) e páginas geradas
# ---------------------------------------------------------------------------

if LEGAL_DIR.exists():
    app.mount("/legal", StaticFiles(directory=str(LEGAL_DIR), html=True), name="legal")

PAGES_DIR = STORAGE / "pages"


@app.get("/pages/{page_id}")
def preview_page(page_id: str):
    page_path = PAGES_DIR / page_id / "index.html"
    if page_path.exists():
        return FileResponse(page_path)
    raise HTTPException(status_code=404, detail="Página não encontrada.")


def _spa_index():
    index_path = DIST_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse(
        """<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ProdMaker</title>
<style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{max-width:520px;padding:40px;text-align:center}h1{color:#7C3AED}.muted{color:#64748b}</style></head>
<body><div class="box"><h1>🚀 ProdMaker</h1>
<p>O backend está rodando.</p>
<p class="muted">Frontend build pendente — rode <code>npm run build</code> em frontend/.</p></div></body></html>"""
    )


@app.get("/")
def index():
    return _spa_index()


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Não encontrado.")
    candidate = DIST_DIR / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    return _spa_index()
