# Changelog — ProdMaker

Todas as versões seguem a etiqueta visual `MAJOR.MINOR.PATCH` com patch de dois dígitos
(o registry NPM normaliza `0.1.00` → `0.1.0`).

## 0.1.13 — 2026-10-31

- **Fase 10 — Product Builder Wizard (motor de criação de ofertas).**
- Studio substituído pelo **Wizard de 3 passos**: (1) mineração de **5 ofertas validadas**
  a partir do nicho (promessa, dores, entregáveis, bônus, preço R$27–97) + registro do
  **Parceiro 50/50**; (2) **estrutura** (módulos com aulas, e-books, ferramentas, **Quiz
  com IA** e **3 Order Bumps** — checkout +R$21,90, upsell +R$197, parceiro 50/50) +
  precificação com trava de faixa; (3) **12 anúncios** (Prova social/material/lógica,
  Desafio-garantia, Comparação isso-vs-aquilo) com cópia por anúncio + **exportação de PDF**
  (Markdown → HTML A4 → PDF) e **prompts de imagem** para Gamma/Canva.
- Backend: `services/builder.py` + `api/builder.py` (`POST /api/builder/generate-offers`,
  `/generate-structure`, `/generate-ads`, `/generate-pdf`, `/salvar`). Tudo é salvo em
  `infoprodutos` (novas colunas `oferta_json`, `estrutura_json`, `anuncios_json`, `preco`,
  `parceiro` com migração automática) para AdsPages/AdsCreator consumirem.
- Novos prompts no seed: `builder-ofertas.md`, `builder-estrutura.md`, `builder-anuncios.md`.
- Rota `/studio` agora abre o Wizard; barra de progresso com "passo X de 3".

## 0.1.12 — 2026-10-31

- **Parte 10 — Polish E2E + OAuth Google 1 clique + radar Supabase + ROAS real.**
- **OAuth Google (Contas do Google real):** `GET /api/google/oauth/url` monta o consentimento
  (scope adwords, access_type=offline, prompt=consent) e `GET /api/google/callback` troca o
  código e **salva o refresh_token automaticamente** em Chaves de API. Página "Contas do
  Google" com status de conexão, botão conectar/reconectar (popup) e instruções do redirect
  `http://localhost:8188/api/google/callback`. Basta colar Client ID/Secret uma vez.
- **Radar Supabase (camada pronta, multi-tenant NÃO ativado):** `dbengine.py` abstrai o banco —
  SQLite continua o padrão; definindo `DATABASE_URL` (PostgreSQL/Supabase) o sistema conecta
  via psycopg (dependência declarada, import preguiçoso), com tradução de placeholders `?`→`%s`
  e linhas dict (mesmo acesso por coluna nos serviços). Todas as 12 tabelas passaram a ter
  `user_id` (migração ALTER aplicada automaticamente nos bancos existentes) — base para o
  isolamento multi-tenant via Supabase Auth na próxima etapa.
- **ROAS real:** tabela `investimentos` (gasto diário em tráfego) + registro/remoção no
  Dashboard; cards **Investimento**, **ROAS** (Receita ÷ Investimento) e **Lucro Líquido**
  (Receita − Investimento) calculados com dados reais — sem investimento registrado, ROAS
  mostra "—" (nunca inventado).
- **Contas do Google** saiu do placeholder — menu 100% implementado.

## 0.1.11 — 2026-10-30

- **Parte 9 — Pinterest (orgânico), Logs unificado e FAQ/Documentação** — fecha o menu do AdsX.
- **Pinterest funcional:** geração de 10 ideias de pins por IA (título ≤100 chars, descrição ≤500,
  texto na imagem, sugestão de imagem), board/link por produto, estados (ideia → pronto →
  agendado → publicado), exportação CSV (selecionados ou todos) e agendamento via py3-pinterest
  (import preguiçoso; erros honestos quando sem credenciais/sessão manual).
- **Logs unificado:** tabela com Operação, Estado, Data/Hora, Origem e Detalhes agregando
  campanhas, páginas, infoprodutos, vendas, notificações e visitas — com filtros por operação,
  estado e busca livre + cópia da linha.
- **FAQ & Documentação:** FAQ em accordion (login/REGRA ZERO/chaves/publicação/tracking/etc.)
  + guias de referência servidos do `seed/references` (pixel-e-tuneis.md, webhooks-de-venda.md)
  + link para /legal (verificação de aplicação LGPD).
- requirements.txt: + apprise, py3-pinterest (imports preguiçosos — boot preservado).
- Nova tabela `pins`. Único módulo restante como placeholder: **Contas do Google** (OAuth
  multi-conta — backlog da parte de contas).
- **Conjunto AdsX completo:** Seus Produtos · AdsDashboard · AdsHosting · Infoprodutos ·
  AdsPages · AdsWords · AdsCreator · AdsTracking (Visitas/Vendas/GCLID) · AdsBot · Pinterest ·
  Chaves de API · Notificações · Logs · FAQ.

## 0.1.10 — 2026-10-30

- **Parte 8 — AdsBot (Lançamento Assistido) + Dashboard real + Notificações (adsNotify).**
- **AdsBot:** wizard de 6 etapas (Produto → Página → Publicar → Campanhas → Tracking →
  Conclusão) com progresso salvo no banco e retomável; marcação de etapas concluídas;
  **Relatório de Lançamento** (produto + resumo da análise IA, páginas vinculadas com URLs
  públicas, campanhas com CPA/orçamento e o checklist final do seed).
- **Dashboard com dados reais:** conversões, receita, comissão, visitas, produtos, páginas,
  campanhas e infoprodutos; banner do lançamento em andamento ("faltam X passos" — efeito
  meta); últimas vendas e últimas páginas. ROAS explicitamente ausente até haver registro
  de investimento (nunca inventado).
- **Notificações (adsNotify):** toggles por evento (venda recebida, campanha publicada,
  página publicada, infoproduto gerado), canais apprise por URL (Telegram entra
  automaticamente quando Bot Token + Chat ID estão em Chaves de API), teste de envio e
  histórico local com status/erro. Hooks disparados nos fluxos reais — falha de envio
  nunca quebra a operação principal.
- Novas tabelas: `lancamentos`, `notificacoes`. Novos endpoints: `/api/lancamentos/*`,
  `/api/notificacoes/*`, `/api/dashboard`.

## 0.1.09 — 2026-10-30

- **Parte 7 — AdsWords & AdsCreator (palavras-chave e campanhas).**
- **AdsWords funcional:** geração de palavras-chave + negativas por IA (prompt do seed,
  negativas padrão aplicadas automaticamente), listas por produto (positivas/negativas com
  origem IA/manual), adição manual, remoção e cópia.
- **Gerador de criativos por IA** (fórmula gancho 3s + promessa + prova + CTA) reutilizado
  pelo AdsCreator (Google/Meta/TikTok).
- **AdsCreator — construtor de campanhas:** cards por plataforma, formulário que puxa
  produto vinculado (comissão → **CPA alvo 70%** no Google; regra criativos × ½ ticket no
  Meta; teste US$10–20 no TikTok), defaults do seed versionados, salva **rascunho** com
  plano completo (review modal com JSON do plano + palavras + criativos).
- **Publicação real (best-effort):** Google Ads via cadeia de mutates REST (orçamento →
  campanha PAUSADA → grupo → keywords frase + negativas → anúncio RSA), Meta Ads via
  Marketing API (campanha → conjunto → criativo → anúncio, POSTs simples) e TikTok como
  plano manual guiado. Tudo criado **PAUSADO para revisão**; erros por etapa com attribution;
  status por campanha (rascunho/publicada/erro).
- Novas tabelas: `palavras`, `campanhas`.

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
