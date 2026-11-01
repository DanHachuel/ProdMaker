"""Publicação de páginas — 1 repositório GitHub por domínio, 1 pasta por produto.

Padrão do repositório trustbeacon.store: o repositório tem o NOME DO DOMÍNIO
(ex.: trustbeacon.store) e cada infoproduto tem sua própria pasta com index.html:
    {repositorio = dominio}/{product_slug}/index.html
    URL pública: https://{dominio}/{product_slug}/   (domínio apontado ao GitHub Pages)

Auto-provisionamento: se o repositório do domínio não existir, é criado via
POST /user/repos (público, auto_init) antes do commit.
"""
import base64
import re

import httpx

from .llm import LLMError
from .store import get_settings

GITHUB_API = "https://api.github.com"


def slugify(texto: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (texto or "").lower()).strip("-")
    return slug[:60] or "produto"


def _github_token() -> str:
    keys = (get_settings().get("api_keys") or {}).get("github") or {}
    return (keys.get("token") or "").strip()


def _owner(token: str, client: httpx.Client, headers: dict) -> str:
    response = client.get(f"{GITHUB_API}/user", headers=headers)
    if response.status_code == 401:
        raise LLMError(
            "GitHub rejeitou o token (401). Gere um PAT em github.com/settings/tokens com escopo 'repo' "
            "e salve em Chaves de API (card GitHub)."
        )
    if response.status_code != 200:
        raise LLMError(f"GitHub não identificou o usuário ({response.status_code}): {response.text[:200]}")
    login = (response.json() or {}).get("login")
    if not login:
        raise LLMError("GitHub não devolveu o login do usuário.")
    return login


def _repo_existe(client: httpx.Client, headers: dict, owner: str, repo: str) -> bool:
    response = client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=headers)
    if response.status_code == 200:
        return True
    if response.status_code == 404:
        return False
    raise LLMError(f"Falha ao consultar o repositório do domínio ({response.status_code}): {response.text[:200]}")


def _criar_repo(client: httpx.Client, headers: dict, repo: str) -> bool:
    response = client.post(
        f"{GITHUB_API}/user/repos",
        headers=headers,
        json={"name": repo, "private": False, "auto_init": True, "description": f"Páginas do domínio {repo} (ProdMaker)"},
    )
    if response.status_code in (201, 200):
        return True
    if response.status_code == 422:
        # Repositório já existe (possivelmente criado em paralelo) — seguimos.
        return False
    if response.status_code == 403:
        raise LLMError(
            f"GitHub barrou a criação do repositório '{repo}' (403): o PAT não tem permissão para criar repositórios. "
            "Use um token com escopo 'repo' (classic) ou com permissão 'Administration / Repositories: write' (fine-grained) "
            "em Chaves de API → GitHub."
        )
    raise LLMError(f"GitHub não criou o repositório '{repo}' ({response.status_code}): {response.text[:300]}")


def publicar_pagina(titulo: str, html: str, domain_name: str, product_slug: str) -> dict:
    """Cria (se preciso) o repositório do domínio e commita {slug}/index.html."""
    token = _github_token()
    if not token:
        raise LLMError(
            "Publicação requer GitHub configurado (token PAT com escopo 'repo') em Chaves de API. "
            "Alternativa sem publicar: use o download do HTML e hospede manualmente."
        )
    repo = (domain_name or "").strip().lower().rstrip(".")
    if not repo or "." not in repo:
        raise LLMError(f"Domínio inválido para publicação: '{domain_name}'.")
    slug = slugify(product_slug)
    path = f"{slug}/index.html"
    content_b64 = base64.b64encode(html.encode("utf-8")).decode()

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            owner = _owner(token, client, headers)
            repo_existia = _repo_existe(client, headers, owner, repo)
            repo_criado = False
            if not repo_existia:
                repo_criado = _criar_repo(client, headers, repo)

            existing = client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
                headers=headers,
                params={"ref": "main"},
            )
            sha = None
            if existing.status_code == 200:
                sha = (existing.json() or {}).get("sha")
            elif existing.status_code not in (404,):
                raise LLMError(f"GitHub respondeu {existing.status_code} ao consultar '{path}': {existing.text[:200]}")

            body = {
                "message": f"ProdMaker: {titulo} → {repo}/{path}",
                "content": content_b64,
                "branch": "main",
            }
            if sha:
                body["sha"] = sha
            put = client.put(f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}", headers=headers, json=body)
            if put.status_code not in (200, 201):
                raise LLMError(f"GitHub rejeitou o commit ({put.status_code}): {put.text[:300]}")
            payload = put.json() or {}
            commit_url = (payload.get("content") or {}).get("html_url") or (payload.get("commit") or {}).get("html_url") or ""
    except httpx.HTTPError as exc:
        raise LLMError(f"Falha de conexão com o GitHub: {exc}", transient=True) from exc

    return {
        "ok": True,
        "repo": f"{owner}/{repo}",
        "repo_criado": repo_criado,
        "repo_existia": repo_existia,
        "path": path,
        "commit_url": commit_url,
        "pages_url": f"https://{repo}/{slug}/",
        "repo_url": f"https://github.com/{owner}/{repo}",
        "aviso": (
            "Repositório do domínio criado automaticamente. "
            "Aponte o DNS do domínio para o GitHub Pages (Settings → Pages do repositório) e ative HTTPS."
        ) if repo_criado else (
            "Se o repositório estiver conectado ao Cloudflare Pages, o deploy é automático; "
            "caso contrário, ative GitHub Pages em Settings → Pages."
        ),
    }
