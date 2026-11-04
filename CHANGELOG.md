# Changelog — ProdMaker

Todas as versões seguem a etiqueta visual `MAJOR.MINOR.PATCH` com patch de dois dígitos
(o registry NPM normaliza `0.1.00` → `0.1.0`).

## 0.1.32 — 2026-11-04

- **HOTFIX CRÍTICO — tela preta em `/api-keys` (e `/hosting/paginas`) eliminada.**
- **Causa raiz 1 (a tela preta):** `pages/ApiKeys.jsx` usava `useApp()` (RBAC,
  desde a 0.1.22) **sem o import correspondente** — `ReferenceError` em todo
  render derrubava a árvore inteira do React: clique no menu ou URL direta
  resultavam em página vazia (fundo escuro = "tela preta"). Corrigido com
  `import { useApp } from "../App"`.
- **Causa raiz 2:** `pages/PaginasCriadas.jsx` tinha `{produto}`/`{dominio}` como
  **expressões JSX** dentro de texto explicativo (`{produto}/index.html` não
  estava em string) — mesma queda de árvore na rota `/hosting/paginas`.
  Agora tudo em `<code>{`...`}</code>`.
- **ErrorBoundary (fim da tela preta como classe de bug):** novo
  `components/ErrorBoundary.jsx`; cada rota é renderizada dentro dele
  (`<Pagina>` no `App.jsx`) e a raiz também é protegida (`main.jsx`). Um crash
  em qualquer página passa a mostrar mensagem amigável + erro + botões
  ("Tentar novamente", "Recarregar", "Voltar ao Painel"), sem apagar o app.
- **ApiKeys endurecido:** estado de `loading` (esqueletos enquanto carrega),
  `try/catch` com status HTTP (401 = sessão expirada → aviso + "Sair e entrar
  novamente"; 403 = RBAC → "Acesso restrito ao Super Admin") e *optional chaining*
  (`settings?.api_keys`) para dado ausente não quebrar a renderização.
- `api.js` agora anexa `status` ao `Error` das respostas não-OK — permite à UI
  distinguir 401/403 de falhas de rede.
- Frontend rebuildado (`frontend/dist` versionado) — o pacote npm serve o build
  corrigido sem o usuário precisar rodar build.
- Verificação: sonda SSR (render de todas as 24 páginas em Node, sem navegador)
  — 100% das páginas renderizam sem crash (antes: ApiKeys e PaginasCriadas
  quebravam).

## 0.1.31 — 2026-11-04

- **HOTFIX — startup do uvicorn silenciado (terminal 100% estático ao subir).**
- `app/services/logging_setup.py` (`uvicorn_log_config()`): loggers `uvicorn` e
  `uvicorn.error` passam a `WARNING`. As 4 linhas INFO de ciclo de vida —
  "Started server process", "Waiting for application startup.",
  "Application startup complete." e "Uvicorn running on http://127.0.0.1:8188"
  — **não aparecem mais**. Erros REAIS (nível ERROR, ex.: porta em uso) continuam
  saindo no terminal e em `storage/logs/app.log`.
- Resultado: o terminal exibe apenas o box do ProdMaker (a URL já é impressa pelo
  launcher `scripts/cli.mjs` depois de o servidor começar a ouvir) e eventuais erros
  reais — o restante do boot fica limpo. Testado: boot + rajada de requisições →
  zero linhas de startup do uvicorn no terminal, exit 0 em Ctrl+C, sem traceback.
- `AccessFormatter` mantido como rede de segurança (inerte com `access_log=False`).
- Bump 0.1.31 (package.json, cli.mjs, main.py APP_VERSION + canonical) + CHANGELOG.
  (0.1.30 já havia sido publicada pela sessão concorrente — renumera por colisão.)

## 0.1.30 — 2026-11-04

- **HOTFIX — terminal 100% silencioso ao navegar + formatação + morte do filho
  explícita.**
- **Access log do uvicorn desligado no terminal** (`app/main.py`):
  `uvicorn.Config(..., access_log=False)` — navegar pelas telas (CSS/JS/SPA/API)
  não imprime mais nenhuma linha `INFO: 127.0.0.1... "GET /api/..." 200 OK`.
  Ciclo de vida (startup/shutdown) e erros reais (500/traceback) continuam
  saindo — só o ruído de acesso sai. O handler de arquivo do
  `logging_setup.py` passa a escutar apenas os loggers da aplicação (`app.*`),
  isolando o formatter (sem `KeyError: client_addr`). *(O `access_log=False` em
  si entrou no `0.1.29`; aqui ficam as correções restantes do mesmo pedido.)*
- **Formatação do launcher (`scripts/cli.mjs`)**: `Aguardando o servidor ficar
  pronto` agora é impresso com `console.log` (`\n` garantido) — o banner do
  Python (`[ProdMaker] Iniciando em...`, que chega pelo proxy de stdout) não
  nasce mais colado na mensagem. Resultado: "Aguardando o servidor ficar
  pronto..." → ciclo de vida do Python em linhas próprias → "Servidor pronto."
  → caixa de URL.
- **Morte do filho explícita**: `child.on("exit", (code, signal))` imprime
  código **e** sinal do processo Python quando ele morre sozinho, com o caminho
  de `storage/logs/app.log` — um retorno misterioso ao prompt do PowerShell
  agora tem causa registrada no terminal (o supervisor continua reiniciando até
  3 vezes em quedas reais).
- Spawn do servidor confirmado: `windowsHide: true` + `stdio: ['inherit',
  'pipe', 'pipe']` (sem janela de CMD, com proxy de logs pelo Node).
- Bump: `0.1.30` (a `0.1.29` já estava publicada no registry).

## 0.1.29 — 2026-11-04

- **HOTFIX — terminal 100% estável após subir (nada de spam ao navegar).**
- `app/main.py`: `uvicorn.Config` agora passa **`access_log=False`** — cada acesso
  HTTP (CSS/JS/SPA/API) **não imprime mais** uma linha de access log no terminal. O
  ciclo de vida e os erros reais continuam saindo; o terminal fica limpo enquanto o
  usuário navega pelo sistema.
- `app/services/logging_setup.py` (`configure()`): o handler de arquivo passa a ser
  anexado **apenas aos loggers da aplicação (`app.*`)** — não mais aos loggers do
  uvicorn. Um `logging.Formatter` global nos loggers do uvicorn referenciava campos
  (`client_addr`...) ausentes no record do access log, gerando `--- Logging error ---`
  a cada requisição. O uvicorn é configurado à parte por `uvicorn_log_config()`.
- Nota: o **heartbeat periódico** já havia sido removido no `0.1.28` (terminal estático
  após subir) e o `KeyError: 'client_addr'` no access log já fora corrigido no `0.1.27`
  (via `uvicorn.logging.AccessFormatter`). Este hotfix fecha o ciclo desligando o
  access log no terminal e isolando o formatter em `app.*`.

## 0.1.28 — 2026-11-03

- **HOTFIX — terminal limpo: removido o heartbeat periódico.**
- A mensagem `[ProdMaker] servidor ativo em http://localhost:8188 — HH:MM:SS`
  era impressa a cada 60s pelo `setInterval` do launcher (`scripts/cli.mjs`),
  poluindo visualmente o terminal. Removida por completo (intervalo e os dois
  `clearInterval` associados).
- O terminal fica **estático** após subir o servidor — nenhuma mensagem
  periódica. O monitoramento de vida continua existindo, silencioso, em
  `storage/logs/app.log` (uvicorn registra startup, cada requisição e o
  encerramento) e pelo supervisor: se o processo cair de verdade, o launcher
  ainda reinicia sozinho (até 3 vezes) e avisa no terminal.
- Bump duplo 0.1.28 (`app/main.py` APP_VERSION + canonical, `package.json`,
  `scripts/cli.mjs`).

## 0.1.27 — 2026-11-03

- **HOTFIX CRÍTICO — "Failed to fetch"/ERR_CONNECTION_REFUSED na primeira abertura
  + 500 em `GET /api/vendas`.**
- **Launcher (`scripts/cli.mjs`): a URL só é impressa quando o servidor está
  ouvindo.** Antes a caixa de URL era impressa antes do spawn — o boot do Python
  (import do FastAPI + abertura do SQLite, 2-5s) fazia o navegador receber
  conexão recusada, e a UI do React mostrava "Failed to fetch" (tela Seus
  Produtos) ou `ERR_CONNECTION_REFUSED` ao abrir rota SPA (`/api-keys`) direto.
  Agora: spawn → `waitReady()` (poll de `/api/health` a cada 250ms, timeout 30s)
  → caixa de URL. Em timeout, alerta com dica de debug (`npm run debug`,
  `storage/logs/app.log`).
- **`GET /api/vendas` voltava 500 sempre:** `vendas.list_vendas(user["user_id"])`
  passava o `user_id` no parâmetro **`limit`** (a assinatura é
  `(limit=300, user_id="")`) e o SQLite estourava `datatype mismatch` no `LIMIT`.
  Corrigido para chamada por nome (`user_id=...`) + defesa no serviço: `limit`
  não-inteiro volta ao padrão em vez de quebrar.
- **Roteamento SPA verificado (já estava correto):** `@app.get("/{full_path:path}")`
  serve `index.html` para qualquer rota não-API (`/api-keys`, `/dashboard`,
  `/produtos`, `/configuracoes/plano` — reload e acesso direto OK) e devolve 404
  JSON para `/api/*` inexistentes. Rotas de API são declaradas antes do fallback.
- **Interceptor do frontend verificado:** `api.js` já envia `credentials: "include"`
  (cookie de sessão) e o Bearer do `localStorage` quando existe; o role vem de
  `/api/auth/session` (`dan.hachuel@gmail.com` → `admin` em qualquer modo).
- Varredura de 30 endpoints autenticados: só `/api/vendas` quebrava — os demais
  (produtos, dashboard, settings, paginas, campanhas, investimentos, vendas/resumo,
  billing, email, pins, etc.) respondem 200.
- **`storage/logs/app.log` — ruído eliminado:** o formatador do access log do
  console era um `logging.Formatter` puro com `%(client_addr)s`, mas o uvicorn
  passa os dados em `record.args` — cada requisição gerava um
  "--- Logging error --- KeyError: 'client_addr'" no terminal. Agora usa o
  `uvicorn.logging.AccessFormatter` (extrai args → atributos). O arquivo
  app.log continua íntegro (linhas de acesso corretas).

## 0.1.26 — 2026-11-03

- **HOTFIX CRÍTICO — janela NATIVA do `cmd.exe` não abre mais no Windows (MobaXterm).**
- Causa raiz (dois fatores): (1) `detached: true` no `spawn` cria o Python com
  `DETACHED_PROCESS` — ele não herda o console, e o Windows **aloca um novo console**
  (a janela preta). (2) `stdio: 'inherit'` no Windows força o filho a usar um console
  **físico** herdado, que o **MobaXterm não consegue herdar** corretamente (usa pty).
- Correção (refatoração do spawn do servidor em `scripts/cli.mjs`):
  - **removido `detached: true`** — o Python fica como **filho direto** do Node (se o
    MobaXterm fechar, o servidor cai junto — comportamento normal de filho de terminal);
  - **`stdio: ['inherit', 'pipe', 'pipe']`** — o Python não herda console de saída, então
    o Windows **não aloca janela de CMD**; `stdin` segue `inherit` (teclado preservado);
  - **Node virou proxy dos logs**: `child.stdout`/`child.stderr` são repassados a
    `process.stdout`/`process.stderr` — os logs do Uvicorn aparecem **só no MobaXterm**.
    Durante o `stopping` os chunks são drenados mas **não** repassados (Ctrl+C silencioso);
  - `windowsHide: true` + `shell: false` preservados; **supervisor** (`on('close')` →
    auto-restart até 3x) e o `taskkill /F /T /PID` no SIGINT mantidos.
- Ctrl+C permanece 100% silencioso (trava `app/core/shutdown.py` + `os._exit` no
  `_SilentServer`), sem traceback de `KeyboardInterrupt`/`CancelledError`.

## 0.1.25 — 2026-11-03

- **HOTFIX CRÍTICO — janela preta de CMD não abre mais no Windows.**
- Causa raiz: `detached: true` no `spawn` do launcher faz o libuv criar o processo
  filho com `DETACHED_PROCESS` no Windows — sem console herdado, o Windows
  alocava um **novo console** para o Python (`python.exe` é app de console),
  surgindo uma janela de CMD sem autorização do usuário (mais visível no
  MobaXterm, que usa pty em vez de console Windows).
- Correção: **`windowsHide: true`** (`CREATE_NO_WINDOW`) em todos os spawns do
  launcher — spawn principal do servidor, `runCommand` (pip/venv), `taskkill` do
  Ctrl+C e nos `spawnSync` de detecção de Python/código mestre/doctor.
- `stdio: 'inherit'` preservado: os logs continuam saindo **no terminal atual**
  (MobaXterm/CMD) — a flag só impede a criação da janela, não redireciona saída.
- `package.json` revisado: nenhum script chama `.bat`/`.cmd` — `npm run debug`
  chama o executável Python direto (`venv\Scripts\python.exe -m app.main`).
- **Backend ainda mais à prova de Ctrl+C (defesa em profundidade):** `app/main.py`
  passa a rodar um `uvicorn.Server` próprio (`_SilentServer`) cujo `shutdown()`
  chama `os._exit(0)` **depois** de fechar conexões + lifespan — impedindo que o
  uvicorn reemitir o sinal capturado (KeyboardInterrupt) e que o asyncio desmonte
  tarefas pendentes (a origem real do `CancelledError`). Lifespan tolerante
  (`_prodmaker_lifespan`) engole `KeyboardInterrupt`/`CancelledError` e a
  telemetria OpenTelemetry é desligada explicitamente (env `OTEL_*` +
  `telemetry={tracing,metrics,logs,operation_spans: False}`), removendo a camada
  `fastapi.telemetry._runtime` do ciclo de encerramento.

## 0.1.24 — 2026-11-07

- **HOTFIX DEFINITIVO — trava de shutdown (sem traceback no Ctrl+C).**
- Novo `app/core/shutdown.py` (instalado no import do `app/main.py`): `sys.excepthook`
  e `threading.excepthook` globais tratam `KeyboardInterrupt` e
  `asyncio.CancelledError` como encerramento imediato (`os._exit(0)`) — sem traceback,
  mesmo que rotas/módulos futuros alterem o comportamento; telemetria do FastAPI
  desligada por variável de ambiente.
- `uvicorn.run()` protegido pelo mesmo `try/except` (encerramento silencioso com
  código 0).
- Launcher: Ctrl+C/SIGTERM agora **mata o processo Python à força**
  (`taskkill /F /T /PID` no Windows, `SIGKILL` em Unix) e retorna ao prompt
  instantaneamente, sem dar tempo de impressão de traceback.

## 0.1.23 — 2026-11-06

- **HOTFIX — servidor encerrando silenciosamente no Windows + log persistente.**
- **Log persistente:** `services/logging_setup.py` — Uvicorn passa a gravar em
  `storage/logs/app.log` (além do terminal) e exceções não tratadas
  (`sys.excepthook`) são registradas no arquivo; o launcher informa o caminho.
- **Launcher:** spawn agora usa `python -m app.main` (entry point próprio com
  log_config); processo **detached** (grupo próprio — imune a sinais de fechamento
  do terminal); **SIGHUP ignorado** (terminal que fecha/detacha não derruba mais o
  supervisor); nenhuma morte proativa por health check (heartbeat é apenas
  informativo); auto-restart real (até 3 tentativas com backoff de 2s) mantido e
  testado.
- **`npm run debug`:** novo script que sobe o Python diretamente
  (`.\venv\Scripts\python.exe -m app.main`), sem o wrapper Node — traceback fatal
  aparece na tela.
- Manual/README: comando manual agora é `python -m app.main`.

## 0.1.22 — 2026-11-05

- **HOTFIX — RBAC (roles) + Painel Super Admin.**
- Banco: nova tabela `usuarios` (user_id, email, role); role `'admin'`/`'user'`.
- **Regra de Ouro:** o e-mail `dan.hachuel@gmail.com` é **sempre admin** em qualquer
  autenticação; no **modo DEV** (código 1234) o usuário padrão é admin; demais
  e-mails (Supabase) entram como `user` — com upsert automático a cada login.
- Backend: `get_current_user` passa a retornar `role`; nova dependência
  `get_admin_user` (403 se não for admin). `PUT /api/settings`, rotas do Stripe
  (`/api/billing/assinatura|historico|checkout`), TikTok (`/api/tiktok/token`) e
  OAuth Google (`/api/google/oauth/url`) são **admin-only**. `GET /api/settings`
  filtra chaves de infraestrutura (Supabase, Stripe, GitHub, Cloudflare, Redis)
  para não-admin. `/api/auth/session` devolve o role.
- Frontend: role salvo no estado global; **Sidebar** esconde "Chaves de API" e
  "Plano & Assinatura" para não-admin; guard de rota redireciona usuário comum
  ao Painel (403 implícito); Chaves de API mostra só chaves de trabalho
  (LLM/Meta/Google/TikTok/Pinterest/Telegram/Gamma) para user; novos cards
  **Supabase** (SUPABASE_URL/ANON_KEY) e **Stripe** (SECRET_KEY/WEBHOOK_SECRET)
  visíveis só para o Super Admin.

## 0.1.21 — 2026-11-04

- **Fase 13 — Autenticação Multi-tenant com Supabase Auth.**
- Backend: dependência `supabase` (import preguiçoso — o servidor sobe sem ela);
  `services/auth_supabase.py` com validação do JWT via SDK (`auth.get_user`, cache de
  5 min por token); `deps.py` com `get_current_user` lendo `Authorization: Bearer`;
  `GET /api/auth/config` expõe modo cloud/dev + chaves públicas para o frontend;
  `GET /api/auth/session` aceita token Supabase (prioridade) ou cookie local.
- **Fallback DEV:** sem `SUPABASE_URL`/`SUPABASE_ANON_KEY` (ou com `DEV_MODE=true`)
  o login local por código mestre (1234/admin) continua funcionando com o user_id
  padrão `00000000-0000-0000-0000-000000000000`.
- Banco: default `user_id` agora é o UUID de DEV em todas as tabelas (novas instalações)
  e migração automática atualiza registros antigos (`''` → UUID de DEV) — dados
  existentes continuam visíveis no modo local.
- CRUD multi-tenant: produtos, páginas, vendas (lista/resumo/criação), campanhas,
  palavras (AdsWords), domínios, pins, infoprodutos e investimentos filtram por
  `user_id` na listagem, carimbam na criação e validam posse em update/delete.
- Frontend: login com abas **Criar Conta / Entrar** via `@supabase/supabase-js`
  (e-mail + senha), token JWT salvo em `localStorage` e enviado no header
  `Authorization` de todas as requisições; Sair limpa o token e chama `signOut`;
  guard de rota existente redireciona para /login sem sessão.
- dependência frontend: @supabase/supabase-js.
- Webhooks de venda (públicos, sem usuário autenticado) permanecem registrando com
  o UUID de DEV — atribuição por página/usuário fica como refinamento da próxima etapa.

## 0.1.20 — 2026-11-03

- **HOTFIX 3 — install inteligente (verificação real de dependências).**
- Antes de chamar o pip, o launcher executa `pip list --format=freeze` no venv, compara com o
  `requirements.txt` e, se tudo estiver instalado nas versões corretas (ou superiores),
  **não roda pip install**: imprime apenas `[✓] Dependências já instaladas e atualizadas.
  Ignorando pip install.`
- Se algo faltar (versão ausente/desatualizada), instala **apenas os pacotes em falta** e em
  modo silencioso (`-q --no-input --disable-pip-version-check`), com retry após atualizar
  o pip em caso de falha.
- Cache `storage/venv_state.json` (sha256 do requirements.txt + contagem de pacotes no venv):
  quando nada mudou, a verificação é feita por leitura de diretório (milissegundos). Cache
  invalida automaticamente quando o requirements.txt muda ou pacotes são removidos do venv.

## 0.1.19 — 2026-11-02

- **HOTFIX 2 — launcher em modo SUPERVISOR (servidor encerrando sozinho).**
- Se o processo do servidor morrer (sinal do terminal, quirk de MobaXterm/Cygwin,
  crash), o launcher **reinicia automaticamente** (até 3 tentativas, backoff 2s) em
  vez de fechar o terminal; só desiste depois de 3 mortes consecutivas — e ainda
  assim imprime o comando manual para ver o traceback.
- Heartbeat no terminal a cada 60s ("servidor ativo...") para o usuário ver que
  está vivo; tratamento explícito de SIGINT/SIGTERM/**SIGHUP**; `shell: true` no
  Windows mantido (terminal anexado); `cli.mjs` reescrito sem mojibake.

## 0.1.18 — 2026-11-02

- **HOTFIX — Motor de Publicação: 1 repositório por domínio + 1 pasta por produto.**
- `publish.py` reescrito: resolve o dono via `GET /user`; verifica `GET /repos/{owner}/{dominio}`
  e **cria o repositório automaticamente** (`POST /user/repos`, público, auto_init) quando não
  existe; commit em `{product_slug}/index.html` (atualizando sha quando o arquivo já existe);
  retorno com `repo`, `repo_criado`, `path`, `pages_url` = `https://{dominio}/{slug}/`.
- `POST /api/paginas/{id}/publicar` agora recebe `{dominio_id}`, **valida que o domínio existe
  e está online**, deriva o slug do produto vinculado e grava `dominio_id` + URL final em
  `paginas` (nova coluna `dominio_id`, migração automática).
- Frontend: **modal "Publicar" com dropdown de domínios cadastrados** (pendentes desabilitados),
  aviso "Se o repositório para este domínio ainda não existir, ele será criado automaticamente",
  resultado com repo/caminho/link final; Builder passa a publicar no primeiro domínio online.
- Sem token GitHub: erro amigável com instrução (PAT com escopo repo em Chaves de API).

## 0.1.17 — 2026-11-01

- **HOTFIX — servidor encerrando sozinho no Windows (CMD/MobaXterm/PowerShell).**
- Launcher: no Windows o processo Python é iniciado com `shell: true` além de
  `stdio: 'inherit'`, mantendo o terminal anexado; nova mensagem explícita
  "O servidor está rodando. Mantenha esta janela aberta. Pressione CTRL+C para encerrar.";
  se o filho morrer em menos de 3 segundos com código ≠ 0, o launcher imprime o
  traceback hint e o comando manual em vez de sair em silêncio; `child.on("error")`
  também diagnosticado.
- **database.py à prova de crash:** `ensure_db()` recriado com try/except por
  instrução (CREATE TABLE IF NOT EXISTS + ALTERs de migração) e recuperação de
  arquivo SQLite corrompido — o banco ruim é movido para
  `prodmaker.db.corrupt-AAAAMMDD-HHMMSS` e um novo é criado; o Uvicorn nunca cai
  na inicialização por causa do banco.
- **Fallback manual:** `app/main.py` agora tem entry point (`python -m app.main`
  sobe o uvicorn na porta 8188) para ver o traceback completo no terminal.
- README/MANual: seção "Se o servidor fechar sozinho" com o comando manual
  `.\venv\Scripts\python.exe -m app.main` (na pasta do ProdMaker).

## 0.1.16 — 2026-10-31

- **Fase 12 — Billing Stripe + E-mail Marketing (AdsAcademy) + Supabase multi-tenant pronto.**
- **Billing:** `seed/planos.json` (Local grátis / Lançador PRO R$97 / Escala AGENCY R$297),
  página **Plano & Assinatura** com cards, e-mail de conta e botão Assinar (abre o
  Checkout do Stripe em nova aba); `POST /api/billing/checkout`, `/api/billing/assinatura`,
  `/api/billing/historico` e **webhook público** `/api/billing/webhook` com verificação
  de assinatura HMAC-SHA256 (t=...,v1=...) processando checkout.session.completed,
  invoice.paid e customer.subscription.deleted. Sem chaves Stripe o app segue 100%
  liberado em modo local (nenhuma trava de pré-registo).
- **E-mail Marketing (AdsAcademy):** sequências com gatilho (`venda_recebida` dispara
  automaticamente a cada webhook de venda, `produto_salvo`, `manual`), variáveis
  {{nome}}/{{produto}}/{{valor}}/{{link}}, envio pelo apprise já integrado (mailtos://,
  tgram://...), editor de sequências, envio manual e histórico com status/erro. A
  plataforma completa emareach fica como backlog da nuvem.
- **Supabase multi-tenant:** `DATABASE_URL` agora também aceita o alias **`SUPABASE_DB_URL`**
  (connection string do Supabase) mantendo SQLite como fallback — user_id já cobre as
  15 tabelas; a ativação do multi-tenant depende apenas do Supabase Auth (backlog).
- Novas tabelas: `assinaturas`, `email_sequencias`, `email_envios`.

## 0.1.15 — 2026-10-31

- **Fase 11 — TikTok Ads real + Anti-Fraude AdsPixel (Redis).**
- **TikTok Ads (publicação automática):** `publish_tiktok.py` — troca do auth_code por
  access_token/refresh_token (`POST /api/tiktok/token`) e criação de campanha + grupo
  PAUSADOS via Marketing API v1.3 (objective CONVERSIONS, budget diário US$,
  placement automático); passo final do criativo com instrução honesta quando não há
  mídia. Erros da API atribuídos. Card TikTok em Chaves de API ganhou auth_code +
  botão "Trocar auth_code por token". AdsCreator passa a publicar TikTok de verdade.
- **Anti-Fraude (AdsPixel):** `fraude.py` seguindo o padrão do redis-datasets/fraud-detection —
  **IP blacklist (Redis Cuckoo Filter)** + **click spamming (Sorted Set com janela de 60s e
  limite de 10 cliques)**; **fallback SQLite automático sem Redis**; página **Anti-Fraude**
  (/tracking/fraude) com status do motor, bloqueio/desbloqueio manual, cópia da lista e
  métricas de spam 24h. O `/track` agora avalia IP bloqueado antes de gravar e o pixel
  nunca quebra a página do visitante. Card **Redis** em Chaves de API (REDIS_URL).
- OAuth Google Ads (item 1 da Fase 11) já estava entregue na 0.1.12.

## 0.1.14 — 2026-10-31

- **Fase 10 — REVISÃO (fechamento das lacunas apontadas na criação de produto/PDF).**
- **`POST /api/builder/generate-product`:** gera o **conteúdo completo** do produto em
  Markdown conforme o agente low-ticket — 1. Capa (≤6 palavras); 2. Diagnóstico (5 motivos);
  3. Solução (5–7 passos); 4. Exemplos (3 casos); 5. Checklist; 6. Bônus.
- **`POST /api/builder/generate-assets`:** 3 Order Bumps (checkout +R$21,90 · upsell +R$197 ·
  parceiro 50/50) + **Quiz com IA** (5 perguntas) — rota própria conforme imagem 4.
- **`POST /api/builder/generate-landing`:** landing page de vendas com as **12 seções
  validadas**, salva em `paginas` com preview em `/pages/{id}`.
- **Wizard com 4 passos:** (1) mineração + parceiro; (2) **seleção de formato** (E-book/
  Planilha/Mini-curso/Desafio/Workshop) + estrutura + assets + preço R$27–97; (3) conteúdo
  completo + **PDF** + landing page; (4) **12 anúncios + 10 pins** + **Publicar no GitHub +
  Cloudflare** (reaproveita o motor da Fase 4).
- `generate-ads` agora devolve também os 10 pins; `generate-pdf` usa o conteúdo completo
  quando disponível (antes renderia só o esqueleto).
- **Salvamento completo:** `salvar` grava anúncios + pins e **cria o registro em `produtos`**
  (status aprovado, vinculado via `infoprodutos.produto_id`) — AdsPages e AdsCreator passam
  a consumir o produto do builder automaticamente.

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
