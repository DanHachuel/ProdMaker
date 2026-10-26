"""Publicação de páginas — GitHub Contents API (commit do HTML no repositório de páginas).

A implantação no Cloudflare Pages acontece automaticamente quando o repositório
está conectado a um projeto do Cloudflare Pages (conexão única, feita no painel).
"""
import base64

import httpx

from .llm import LLMError

GITHUB_API = "https://api.github.com"


def _github_config() -> tuple[str, str]:
    from .store import get_settings

    keys = (get_settings().get("api_keys") or {}).get("github") or {}
    token = (keys.get("token") or "").strip()
    repo = (keys.get("repo") or "").strip()
    return token, repo


def publicar_pagina(page_id: int, titulo: str, html: str) -> dict:
    token, repo = _github_config()
    if not token or not repo:
        raise LLMError(
            "Publicação requer GitHub configurado (token PAT + repositório) em Chaves de API. "
            "Alternativa sem publicar: use o download do HTML e hospede manualmente."
        )
    owner, _, repo_name = repo.partition("/")
    if not repo_name:
        raise LLMError("Repositório inválido — use o formato usuario/repositorio.")
    slug = "".join(char if char.isalnum() or char in "-" else "-" for char in titulo.lower())[:40].strip("-") or f"pagina-{page_id}"
    path = f"paginas/{page_id}-{slug}.html"
    content_bytes = base64.b64encode(html.encode("utf-8")).decode()

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            existing = client.get(f"{GITHUB_API}/repos/{owner}/{repo_name}/contents/{path}", headers=headers, params={"ref": "main"})
            sha = None
            if existing.status_code == 200:
                sha = (existing.json() or {}).get("sha")
            elif existing.status_code not in (404, 409):
                raise LLMError(f"GitHub respondeu {existing.status_code} ao consultar o arquivo: {existing.text[:200]}")

            body = {
                "message": f"ProdMaker: página {page_id} — {titulo}",
                "content": content_bytes,
                "branch": "main",
            }
            if sha:
                body["sha"] = sha
            put = client.put(f"{GITHUB_API}/repos/{owner}/{repo_name}/contents/{path}", headers=headers, json=body)
            if put.status_code not in (200, 201):
                raise LLMError(f"GitHub rejeitou o commit ({put.status_code}): {put.text[:300]}")
            commit = (put.json() or {}).get("commit") or {}
            commit_url = (put.json() or {}).get("content", {}).get("html_url") or (commit.get("html_url") or "")
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com o GitHub: {exc}") from exc

    pages_url = f"https://{owner}.github.io/{repo_name}/{path}"
    return {
        "ok": True,
        "path": path,
        "commit_url": commit_url,
        "pages_url": pages_url,
        "aviso": "Se o repositório estiver conectado a um projeto no Cloudflare Pages, o deploy acontece automaticamente.",
    }
