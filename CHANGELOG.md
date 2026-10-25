# Changelog — ProdMaker

Todas as versões seguem a etiqueta visual `MAJOR.MINOR.PATCH` com patch de dois dígitos
(o registry NPM normaliza `0.1.00` → `0.1.0`).

## 0.1.00 — 2026-10-25

- **Parte 1 — Fundação do repositório.**
- Monorepo npm `@danhachuel/prodmaker` (bin `prodmaker`) com launcher `scripts/cli.mjs`
  (comandos `install`, `run`, `doctor`) — REGRA ZERO: nunca abre o navegador, apenas
  imprime a URL `http://localhost:8188` no terminal.
- Backend FastAPI mínimo (`app/main.py`): auth local simulada (e-mail + código de
  ativação, cookie HMAC httpOnly, licença local 31/12/2099), `/api/health`,
  `/api/version`, `/api/settings` (GET/PUT com leitura protegida de JSON corrompido),
  SPA fallback para `frontend/dist` (Parte 2) e pasta `/legal`.
- Storage persistente em `PRODMAKER_HOME` (env → `C:\Users\danha\Documents\REPOSITORIO\ProdMaker`
  → `%USERPROFILE%\ProdMaker`): `storage/{state,pages,produtos,artifacts,downloads,logs}`
  + `settings.json` com defaults.
- Seeds versionados em `seed/`: prompts (infoproduto, página de vendas 12 seções,
  pre-sell, keywords, criativos, pins), negativas padrão Google Ads, defaults de
  campanha (Google/Meta/TikTok/Pinterest), árvore de decisão de otimização e
  checklist de lançamento.
- Pasta `legal/` servida em `/legal` (index, privacy LGPD, terms) para verificação
  de aplicação junto às plataformas.
- Workflow `publish-npm` adaptado (validação de metadados, smoke test do launcher,
  publicação com dist-tag `next`, verificação de tarball e promoção a `latest` via
  tag `vX.Y.ZZ`).
- Documentos: AGENTS.md (regras permanentes), README, MANUAL-INSTALACAO,
  THIRD-PARTY-NOTICES e Planejamento Único (v2.0).
