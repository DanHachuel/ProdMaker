# Changelog — ProdMaker

Todas as versões seguem a etiqueta visual `MAJOR.MINOR.PATCH` com patch de dois dígitos
(o registry NPM normaliza `0.1.00` → `0.1.0`).

## 0.1.08 — 2026-10-30

- **Parte 6 — Minhas Vendas & Conversões GCLID.**
- **Vendas funcionais:** tabela com cards (vendas aprovadas, receita, comissão, conversões
  pendentes), adição manual, **importação CSV** (colunas em ordem livre + upload de arquivo),
  exclusão e filtro por status de conversão.
- **Webhooks de venda públicos:** `POST /api/webhook/sale/{hotmart|clickbank|digistore24|
  kiify|cakto}` com parser **tolerante** (percorre o JSON procurando valor, comissão, e-mail,
  transação, GCLID, produto e status — cada plataforma usa nomes diferentes; aceita JSON e form).
  Página lista as URLs prontas para copiar no postback de cada plataforma.
- **Matching por GCLID:** ao registrar venda com GCLID, o sistema cruza com a visita
  correspondente na tabela `visitas` (página, IP, origem) e marca 🎯 no GCLID rastreado.
- **Conversões offline (GCLID):** enxuta implementação REST `uploadClickConversions`
  (`services/gads.py`): refresh token OAuth → POST Google Ads API (versão configurável,
  default v22); upload individual ou **em lote** das pendentes; status por venda
  (pendente/enviada/erro) com erro atribuído; exige Google Ads completo em Chaves de API
  (developer token, client, refresh token, customer_id e **conversion_action**).
- Nova tabela `vendas` (com índices em gclid/created_at). Sem novas dependências Python
  (upload via httpx já incluso).

## 0.1.07 — 2026-10-27

- **Código de Ativação Mestre:** o login local agora valida o código de verdade.
  O backend define `MASTER_CODE` (`get_master_code()` — default `1234`, sobrescrevível
  via variável `PRODMAKER_MASTER_CODE`) e o alias **`admin`** também é sempre aceito;
  qualquer e-mail + código mestre entram. Códigos comuns deixam de ser aceitos
  (antes qualquer código ≥ 4 caracteres passava na validação simulada).
- **Launcher imprime o código ao iniciar:** o box de inicialização agora mostra
  `CODIGO DE ATIVACAO: <código>` (buscado direto do backend — fonte única de verdade,
  com fallback para env/default). Sessões já autenticadas continuam válidas (JWT 30 dias).
- **Robustez de boot:** imports de dependências de serviço (markdown, xhtml2pdf, httpx,
  bs4, dns) tornados preguiçosos — o servidor sobe com qualquer Python que tenha
  fastapi/uvicorn, e o erro claro (com instrução `prodmaker install`) aparece apenas na
  ação que precisa da dependência.
- Docs: MANUAL-INSTALACAO e README atualizados com o fluxo de login pelo código mestre.

## 0.1.06 — 2026-10-26

- **Parte 5 — AdsTracking: Minhas Visitas (AdsPixel) funcional, layout AdsX 1:1.**
- Página completa sobre a tabela `visitas`: barra superior com período (90 dias) e contagens;
  **alerta de POSSÍVEL DRENAGEM DE ORÇAMENTO** (IPs com ≥ 4 cliques repetidos) com botão
  "Copiar Todos (N IPs)"; cards de visitantes (IP, ID, cliques, dispositivo, último acesso) com
  **modal do visitante** (badge Humano, detalhes, abas IDs de Rastreamento / Payload JSON com
  copiar, e últimos eventos).
- Métricas: Visitas Humanas, Cliques/CTR, Checkouts, Vendas (zerados até chegarem webhooks —
  nunca inventados); 3 donuts CSS (Origem do Tráfego, Dispositivos, Sistemas Operacionais —
  parser de User-Agent local, sem serviços externos); **Fluxo de Tráfego ao Vivo** (SVG por
  hora) e **Funil de Conversão** (Visitas → Cliques → Checkouts → Vendas).
- Backend: `services/tracking.py` (agregações + parser UA + visitor_id por hash de IP) e
  `api/tracking.py` (`GET /api/tracking/dashboard`, `GET /api/tracking/visitante/{ip}`).
- Estado vazio honesto com instruções (configurar URL do `/track` via túnel + publicar páginas).

## 0.1.05 — 2026-10-26

- **Parte 4 — AdsPages & AdsHosting (geração de páginas, clonagem, pixel, domínios e publicação).**
- **AdsPages funcional:** pre-sell de afiliado e página de vendas (12 seções) geradas por LLM
  (templates do seed, idioma selecionável, dados preenchidos a partir do produto vinculado);
  **clonagem de páginas com higienização** (BeautifulSoup remove scripts, iframes, noscript e
  pixels/analytics do original); pré-visualização local em `/pages/{id}`, editor de HTML
  integrado e download.
- **Pixel próprio (AdsPixel) embutido** nas páginas geradas quando a URL pública do `/track`
  está configurada (card "Pixel de Rastreamento" em Chaves de API): pageview, clique em CTA e
  tempo na página, capturando gclid/utm/ref — endpoint `/track` (GET/POST + CORS) grava na
  tabela `visitas` (a UI de Minhas Visitas vem na sequência). Sem URL configurada, nenhuma
  tag é embutida (a UI não inventa dados).
- **AdsHosting — Domínios:** cards no layout AdsX com status pendente/online; verificação por
  DNS público (NS/A via dnspython) e, com API Token Cloudflare configurado, status da zona
  via API; name servers exibidos com botão copiar; "+ Tags, Pixels and Scripts (Opcional)"
  por domínio; adicionar/remover domínios.
- **Páginas Criadas:** tabela com preview, download, edição de HTML, status rascunho/publicada
  e **Publicar 🚀 via GitHub Contents API** (commit do HTML no repositório configurado em
  Chaves de API; Cloudflare Pages deploy automaticamente quando o repositório está conectado) —
  com link do commit e URL pública.
- Novas tabelas: `paginas`, `dominios`, `visitas`. requirements.txt: + beautifulsoup4, dnspython.

## 0.1.04 — 2026-10-25

- Favicon 🚀 (SVG) nas guias do navegador: app (SPA), login e páginas `/legal`.

## 0.1.03 — 2026-10-25

- **Parte 3 — Motor LLM + Chaves de API + Análise de Produto por IA + Studio de PDF.**
- **Motor LLM (`app/services/llm.py`):** pool NVIDIA NIM (compatível OpenAI) + Google Gemini
  com prioridade (1 = primeiro) e failover apenas em erros transitórios (quota, timeout,
  transporte, 429/5xx); erro de credencial/payload registrado com attribution e nunca
  mascarado. Importações preguiçosas — o servidor sobe mesmo sem deps de LLM instaladas.
- **Chaves de API funcional:** página com cards (AdsX api-grid) para NVIDIA, Gemini, Gamma,
  GitHub, Cloudflare, Telegram, Pinterest, Google Ads, Meta, TikTok e Canva (em breve);
  modais por card; LLMs com modelo/prioridade/ativo + **Testar chamada** (read-only, mostra
  latência e modelo); demais integrações com campos por serviço salvos no storage local.
- **Análise de produto por IA:** ao **✓ Aprovar**, se houver LLM ativo o produto recebe o
  plano de ataque (resumo, ângulos de copy, palavras-chave, negativas, brief da presell,
  público) via `seed/prompts/analise-produto.md`; modal 🧠 na listagem e regeneração via 🔬.
  Sem LLM configurado a aprovação funciona normalmente (sem travas).
- **Studio (Criar Infoproduto):** formulário completo (modo, formato, título, nicho, dor,
  avatar, resultado, prompt) → Modo Rápido (LLM → Markdown → HTML A4 → PDF via xhtml2pdf,
  sem dependências de sistema) e Modo Premium (Gamma AI: `POST /v1.0/generations` com
  `exportAs: "pdf"`, polling e download); resultado com download direto do PDF.
- **Biblioteca de Infoprodutos:** tabela (criado, título, formato, modo) com download de PDF,
  visualização do Markdown e exclusão.
- Backend reorganizado em módulos: `services/store.py` (settings), `services/database.py`
  (SQLite + migração: coluna `analysis` em produtos + tabela `infoprodutos`),
  `services/llm.py`, `services/pdf.py`, `services/gamma.py`, `api/llm.py`, `api/infoprodutos.py`.
- requirements.txt: + openai, google-genai, markdown, xhtml2pdf.

## 0.1.02 — 2026-10-25

- Launcher: caixa da URL em ASCII puro (evita mojibake de caracteres Unicode no CMD/Windows).
- Documentação (README/MANUAL): ressalva obrigatória — os comandos npx devem ser executados
  **fora da pasta do repositório** (dentro dela o npx prioriza o projeto local sem
  `node_modules/.bin`); para desenvolvimento local usar `node scripts\cli.mjs`.
- Validado ponta a ponta com o pacote publicado no registry (install com venv + deps,
  auto-migração de porta 8188→8189, health e SPA servidos).

## 0.1.01 — 2026-10-25

- **Parte 2 — Frontend React + Vite + Tailwind (base AdsX 1:1).**
- Tela de login 1:1: split-screen com lado escuro (`#0A0A0A`) — título com highlight violeta,
  4 etapas numeradas (Adicione o produto → Crie a Presell → Crie a Campanha → Receba Vendas)
  com setas rosa, orbs flutuantes violeta/rosa, partículas animadas — e lado claro com
  formulário (e-mail + código de ativação com olho mostrar/ocultar), seletor de idioma
  (PT/EN/ES), links de suporte e rodapé com Termos/Privacidade (`/legal`). **Sem marcas terceiras.**
- Painel AdsX 1:1: sidebar 260px com menu completo (Seus Produtos, AdsDashboard, AdsHosting,
  Infoprodutos, AdsPages, AdsWords, AdsCreator, AdsTracking, AdsBot, Pinterest, Contas do
  Google, Chaves de API, Notificações, Logs, FAQ), submenus expansíveis, badge de versão,
  botão Sair (gradiente); top bar com pill de contexto, avatar do usuário e **tema claro/escuro**
  via `data-theme` (variáveis CSS do protótipo).
- **Seus Produtos funcional:** busca, abas 🔍 Em Análise / ✓ Aprovados, tabela com ações
  (✏️ Editar, ✈️ AdsWord, ✓ Aprovar · 🛡️ AdsPages, 🎯 AdsCreator, ✈️ AdsWord, 🗑️), modal de
  adicionar/editar (nome, plataforma, nicho, link de afiliado, comissão, preço), estados vazios
  sem dados inventados.
- **AdsDashboard:** cards Conversões, Lucro Líquido, ROAS, Investimento (zerados até houver
  tracking real — a UI nunca inventa dados).
- Módulos restantes como placeholders documentados (o que vem em cada um).
- Backend: CRUD completo de produtos em SQLite (`/api/produtos` GET/POST/PUT/DELETE +
  `/aprovar`), versão 0.1.01.
- Auth: guard de sessão no frontend (cookie HMAC httpOnly), logout via sidebar.
- Workflow `publish-npm`: normalização canônica da versão solicitada antes do `npm version`
  (corrige `npm error Version not changed` no npm 11 / Node 24 quando o package.json já
  está na versão canônica da etiqueta visual pedida).

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
