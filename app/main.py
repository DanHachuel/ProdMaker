import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

APP_VERSION = "0.1.01"
COOKIE_NAME = "prodmaker_session"
SESSION_DAYS = 30

PRODMAKER_HOME = Path(os.environ.get("PRODMAKER_HOME", str(Path.home() / "ProdMaker")))
STORAGE = PRODMAKER_HOME / "storage"
STATE = STORAGE / "state"
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
LEGAL_DIR = Path(__file__).resolve().parent.parent / "legal"

app = FastAPI(title="ProdMaker", version=APP_VERSION)


# ---------------------------------------------------------------------------
# Storage helpers (leitura protegida: nunca sobrescrever dados corrompidos)
# ---------------------------------------------------------------------------


def ensure_state_dir() -> None:
    STATE.mkdir(parents=True, exist_ok=True)


def get_settings() -> dict:
    settings_path = STATE / "settings.json"
    if not settings_path.exists():
        return {"schema": 1, "port": 8188, "language": "pt-BR", "theme": "light", "api_keys": {}, "llm": {"providers": []}}
    try:
        return json.loads(settings_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="settings.json corrompido — leitura protegida. Restaure o arquivo manualmente.")


def save_settings(data: dict) -> dict:
    ensure_state_dir()
    settings_path = STATE / "settings.json"
    if settings_path.exists():
        try:
            json.loads(settings_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            backup = STATE / "settings.corrupt.json"
            backup.write_text(settings_path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
            raise HTTPException(status_code=500, detail="settings.json corrompido — cópia preservada em settings.corrupt.json.")
    settings_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def get_secret() -> bytes:
    ensure_state_dir()
    secret_path = STATE / "secret.key"
    if not secret_path.exists():
        secret_path.write_bytes(os.urandom(32))
    return secret_path.read_bytes()


# ---------------------------------------------------------------------------
# Banco de dados local (SQLite via stdlib)
# ---------------------------------------------------------------------------


def get_db():
    ensure_state_dir()
    conn = sqlite3.connect(STATE / "prodmaker.db")
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS produtos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                plataforma TEXT NOT NULL DEFAULT 'Outro',
                link_afiliado TEXT NOT NULL DEFAULT '',
                comissao REAL NOT NULL DEFAULT 0,
                preco REAL NOT NULL DEFAULT 0,
                nicho TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'em_analise',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


ensure_db()


def now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def row_to_dict(row) -> dict:
    return {key: row[key] for key in row.keys()}


# ---------------------------------------------------------------------------
# Auth local (v1: validação simulada; estrutura pronta para validação remota)
# ---------------------------------------------------------------------------


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


@app.post("/api/auth/login")
def auth_login(body: LoginBody, response: Response):
    email = body.email.strip()
    code = body.activation_code.strip()
    if "@" not in email or len(code) < 4:
        raise HTTPException(status_code=400, detail="E-mail inválido ou código de ativação muito curto (mínimo 4 caracteres).")
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
# Produtos (Seus Produtos — em análise / aprovados)
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
    with get_db() as conn:
        cursor = conn.execute("UPDATE produtos SET status = 'aprovado', updated_at = ? WHERE id = ?", (now_str(), produto_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        row = conn.execute("SELECT * FROM produtos WHERE id = ?", (produto_id,)).fetchone()
    return row_to_dict(row)


# ---------------------------------------------------------------------------
# Núcleo
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION}


@app.get("/api/version")
def version():
    return {"version": APP_VERSION, "canonical": "0.1.1"}


@app.get("/api/settings")
def read_settings():
    return get_settings()


@app.put("/api/settings")
def update_settings(data: dict):
    return save_settings(data)


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
<p class="muted">O frontend (React + Vite + Tailwind) será publicado na Parte 2.</p>
<p class="muted">API: <code>/api/health</code> · Legal: <code>/legal/</code></p></div></body></html>"""
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
