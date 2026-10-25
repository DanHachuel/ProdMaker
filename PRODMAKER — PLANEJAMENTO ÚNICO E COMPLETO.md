# PRODMAKER — PLANEJAMENTO ÚNICO E COMPLETO

> **Documento:** Planejamento base para a construção do ProdMaker — equivalente, para este projeto, ao que os planejamentos Content-Hermes (fases 1–3) foram para o Thunderbolt.
> **Versão do documento:** 1.0 — 24/10/2026
> **Repositório oficial (JÁ EXISTE — NÃO criar outro):** https://github.com/DanHachuel/ProdMaker — branch `main`, atualmente contém apenas o LICENSE.
> **Pacote NPM:** `@danhachuel/prodmaker` (bin: `prodmaker`)
> **Pasta local de trabalho:** `C:\Users\danha\Documents\REPOSITORIO\ProdMaker`
> **Missão:** construir um SaaS local — instalado via npx, executado no próprio computador, acessado manualmente pelo navegador — que fábrica infoprodutos low-ticket e todo o stack de lançamento (página, publicação, campanhas, tracking, otimização), seguindo o fluxo de 12 horas.
> **Base de consolidação:** plano AdsX/ProdMaker (FastAPI local + LLM via API), Agente de Infoprodutos Low-Ticket (regras de negócio), mapeamento de repositórios open source, painel LeadMaster (base visual do app), página de login premium (base visual da porta de entrada), 7 leis de usabilidade e as regras de projeto/versionamento herdadas do Thunderbolt.

---

## REGRA ZERO — O SISTEMA NUNCA ABRE O NAVEGADOR

**Isso é inaceitável e NUNCA deve acontecer.**

1. Ao iniciar a aplicação (comando `prodmaker`), o sistema **NÃO pode abrir nenhuma janela ou aba do navegador** — nem via Node (`start`, `opencode`, `child_process`), nem via Python (`webbrowser.open`, `os.startfile`), nem por qualquer outro meio, em nenhuma plataforma.
2. O usuário é quem abre a janela. O launcher apenas **imprime a URL no terminal**, de forma grande, clara e copiável, por exemplo:

```
┌─────────────────────────────────────────────┐
│  ProdMaker rodando em:                      │
│  >>>  http://localhost:8188  <<<            │
│  Abra esta URL manualmente no navegador.    │
└─────────────────────────────────────────────┘
```

3. O comando `install` também nunca abre navegador; ao final apenas imprime as instruções.
4. Esta é regra permanente do AGENTS.md e **critério de aceite bloqueante em todas as fases**: iniciar a aplicação não pode abrir navegador. Qualquer violação é tratada como bug crítico e corrigida antes de qualquer publicação.

---

## 1. O QUE É O PRODMAKER

O ProdMaker é um aplicativo local (SaaS na máquina do usuário) que executa o fluxo completo de lançamento de infoprodutos low-ticket em até 12 horas:

1. **Produto** — geração de e-book, planilha/template, mini-curso, desafio ou workshop via IA, com nome, preço, order bump e upsell.
2. **Página** — landing page de vendas (12 seções validadas) ou página de pré-venda (pre-sell de afiliado), em HTML/CSS/JS puro, single-file, mobile-first, com pixel próprio embutido.
3. **Publicação** — hospedagem da página via GitHub + Cloudflare Pages (automatizada por API quando houver credenciais; guia manual e exportação ZIP como alternativa).
4. **Campanhas** — criação de campanhas Google Ads (Search), Meta Ads e TikTok Ads com estruturas, palavras-chave, negativas e criativos validados.
5. **Orgânico** — pins do Pinterest criados e agendados.
6. **Tracking & Otimização** — pixel próprio com captura de GCLID, webhook de vendas, upload de conversões offline, métricas (ROAS, CPA, CTR, CPV) e árvore de decisão para pausar, otimizar ou escalar.
7. **Notificações** — push de vendas e conclusões via Telegram/Discord/e-mail (apprise).

Público-alvo: empreendedores digitais, produtores e afiliados.

### 1.1 Identidade do produto — fluxo em 4 etapas

O ProdMaker se apresenta sempre com as 4 etapas (presentes na tela de login):

**Adicione o produto → Crie a Presell → Crie a Campanha → Receba Vendas**

### 1.2 Diferenças em relação ao Thunderbolt

| Aspecto | Thunderbolt | ProdMaker |
|---|---|---|
| Domínio | Vídeos faceless (MoneyPrinterTurbo) | Infoprodutos low-ticket + anúncios |
| UI | Streamlit | **React + Vite + Tailwind (Streamlit é PROIBIDO)** |
| Backend | App Python/Streamlit | FastAPI servindo API + frontend estático |
| Distribuição | npm `@danhachuel/thunderbolt` | npm `@danhachuel/prodmaker` (mesmo padrão npx) |
| LLM | Pools multi-provider | Pools NVIDIA NIM + Google Gemini (mesma filosofia) |
| Navegador | — | **Nunca abre automaticamente (REGRA ZERO)** |

### 1.3 Não negociáveis (decisões já tomadas)

1. O repositório **já existe** em https://github.com/DanHachuel/ProdMaker. Não criar repositório novo, não usar `git init` isolado: clonar o repositório existente para `C:\Users\danha\Documents\REPOSITORIO\ProdMaker` e desenvolver nele, no branch `main`.
2. UI em **React + Vite + Tailwind CSS**. Streamlit proibido.
3. **Sem Docker e sem Ollama.** LLMs exclusivamente via API (NVIDIA NIM e/ou Google Gemini).
4. Aplicativo **local**, instalado/executado via `npx`, dados persistidos na pasta `C:\Users\danha\Documents\REPOSITORIO` (fora do cache npm).
5. Porta padrão **8188** (`http://localhost:8188`).
6. **REGRA ZERO:** nunca abrir o navegador automaticamente.
7. **Nenhuma trava de pré-registo interno:** credenciais externas (API keys) são validadas apenas no momento da ação que realmente precisa delas; nunca bloquear navegação ou criação por falta de credencial configurada.
8. Publicação NPM **sempre via GitHub Actions** (workflow `publish-npm` adaptado — seção 12); nunca `npm publish` local.
9. Versionamento visual `MAJOR.MINOR.PATCH` com **patch de dois dígitos** (regras completas na seção 11).
10. **Push imediato** após commits; **CHANGELOG** atualizado antes de publicar.
11. A UI **nunca inventa dados** quando um serviço externo ou credencial não está disponível: mostra estado vazio/aviso com o campo em falta.

---

## 2. ARQUITETURA GERAL

### 2.1 Camadas

| Camada | Tecnologia | Função |
|---|---|---|
| Launcher/CLI | Node.js (`scripts/cli.mjs`) | Instalação assistida, execução, diagnóstico; distribuído via npm |
| Backend/API | FastAPI (Python 3.10+) | Serve o frontend buildado, expõe `/api/*`, orquestra LLM e integrações |
| Frontend | React + Vite + Tailwind CSS | UI no padrão LeadMaster/login premium; build estático (`frontend/dist`) servido pelo FastAPI |
| Banco de dados | SQLite (SQLAlchemy) — `storage/state/prodmaker.db` | Produtos, páginas, campanhas, vendas, lançamentos, logs, notificações |
| Configurações | JSON — `storage/state/settings.json` | API keys, preferências, pools LLM |
| Storage local | Arquivos em `PRODMAKER_HOME/storage` | Páginas geradas, PDFs, artefatos, downloads, logs |
| Filas/Cache | Redis (OPCIONAL) | Anti-fraude (Cuckoo Filter + Sorted Set) e cache; com fallback local SQLite quando ausente |
| LLM | NVIDIA NIM (compatível OpenAI) + Google Gemini | Geração de produto, páginas, keywords, criativos, pins, análises |
| Páginas geradas | HTML/CSS/JS single-file | Pré-visualizadas localmente em `/pages/{id}` e exportáveis para GitHub/Cloudflare |
| Notificações | apprise | Telegram, Discord, e-mail etc. |

### 2.2 Fluxo de execução

1. `npx --yes @danhachuel/prodmaker install` (uma vez) — cria a pasta de dados, estrutura de storage, instala dependências Python.
2. `npx --yes @danhachuel/prodmaker` — sobe o FastAPI na porta 8188 (se ocupada, tenta 8189–8199) e **imprime a URL no terminal (não abre navegador)**.
3. O usuário abre `http://localhost:8188` manualmente → tela de login (e-mail + código de ativação).
4. Após entrar, o Painel (estilo LeadMaster) dá acesso às funcionalidades e ao Assistente de Lançamento.

### 2.3 Estrutura do repositório (monorepo)

```
ProdMaker/
├── .github/workflows/publish-npm.yml   # workflow de publicação (seção 12)
├── app/                                # backend FastAPI
│   ├── main.py                         # app, rotas estáticas (frontend/dist, /pages), lifespan
│   ├── api/                            # routers: auth, produtos, paginas, campanhas,
│   │                                   # tracking, pinterest, settings, logs, notificacoes, llm
│   ├── services/
│   │   ├── llm.py                      # cliente unificado NVIDIA/Gemini + pool prioridade/failover
│   │   ├── pdf.py                      # Markdown -> HTML -> PDF
│   │   ├── pages.py                    # geração landing/pre-sell (pipeline inspirado no pyfun-ai)
│   │   ├── clone.py                    # clonagem + higienização (everpage + BeautifulSoup/Playwright)
│   │   ├── publish.py                  # GitHub API + Cloudflare Pages API
│   │   ├── ads/                        # google.py, meta.py, tiktok.py, keywords.py, criativos.py
│   │   ├── tracking.py                 # pixel próprio, GCLID, webhook vendas, conversões offline
│   │   ├── fraude.py                   # IP blacklist + click spam (padrão Redis, fallback SQLite)
│   │   ├── pinterest.py                # py3-pinterest
│   │   └── notify.py                   # apprise + central local
│   ├── db.py                           # SQLAlchemy + SQLite
│   └── schemas.py                      # modelos Pydantic
├── frontend/                           # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/                 # Sidebar, Header, MetricCard, Chart, WizardSteps, ApiKeyCard...
│   │   ├── pages/                      # Login, Dashboard, Produtos, Paginas, Campanhas, Tracking,
│   │   │                               # Pinterest, Configuracoes, Logs, Documentacao...
│   │   ├── i18n/                       # pt-BR, en, es (JSON)
│   │   ├── App.jsx / main.jsx / router.jsx
│   ├── dist/                           # BUILD COMMITADO — servido pelo backend (nunca gitignored)
│   ├── package.json, vite.config.js, tailwind.config.js, index.html
├── scripts/cli.mjs                      # launcher npx: install | run | doctor
├── seed/                               # sementes versionadas (viajam no pacote npm)
│   ├── prompts/                        # produto.md, pagina-vendas.md, pre-sell.md, criativos.md,
│   │                                   # keywords.md, pins.md
│   ├── negatives/google-words.txt      # negativas padrão do Google Ads
│   ├── campaign-defaults/               # google.json, meta.json, tiktok.json, pinterest.json
│   ├── decision-rules/otimizacao.json  # árvore de decisão ROAS/CPA/CTR/CPV
│   ├── checklists/lancamento.md        # checklist final de lançamento
│   └── references/                     # guias: github-cloudflare, oauth-google-ads, webhooks...
├── storage/                            # DADOS LOCAIS — gitignored + npmignored
│   ├── state/                          # settings.json, prodmaker.db, license.json, secret.key
│   ├── pages/ produtos/ artifacts/ downloads/ logs/
├── AGENTS.md  CHANGELOG.md  README.md  MANUAL-INSTALACAO.md  THIRD-PARTY-NOTICES.md
├── package.json  requirements.txt  pyproject.toml  .gitignore  .npmignore
└── LICENSE (já existe)
```

### 2.4 PRODMAKER_HOME e storage persistente

O launcher resolve a pasta raiz de dados (`PRODMAKER_HOME`) nesta ordem:

1. Variável de ambiente `PRODMAKER_HOME` (usada pelo CI/smoke test);
2. `C:\Users\danha\Documents\REPOSITORIO\ProdMaker` (pasta local designada do usuário);
3. Fallback: `%USERPROFILE%\ProdMaker` (outras máquinas).

Dentro dela ficam `storage/` e o venv Python. Regras herdadas do Thunderbolt:

- O pacote npm distribui apenas `seed/`; `storage/` nunca vai para o npm nem para o GitHub (`.gitignore` + `.npmignore`).
- Atualizações preservam o storage; fusões de dados por ID em vez de substituição.
- Se um JSON de estado ficar corrompido, preservar a cópia danificada e interromper a leitura protegida — nunca sobrescrever dados existentes com uma lista vazia.
- O comando `install` cria o skeleton: `storage/{state,pages,produtos,artifacts,downloads,logs}` + `storage/state/settings.json` com defaults (porta 8188, idioma pt-BR, tema claro, pools vazios). Este arquivo é o alvo do smoke test do workflow.

### 2.5 Build do frontend

- `frontend/dist` é **commitado** no repositório e incluído no tarball npm (o usuário final não roda build).
- Sempre que a UI mudar: `npm install && npm run build` dentro de `frontend/` e commit do `dist`.
- O workflow de publicação valida que `frontend/dist/index.html` existe antes de publicar.
- Rotas da UI em português (`/produtos`, `/paginas`, `/campanhas`...); páginas geradas pré-visualizadas em `/pages/{id}` (fora do SPA); API em `/api/*`.

---

## 3. UI/UX — ESPECIFICAÇÃO VISUAL

Anexos de referência 1:1: **página de login.html** (porta de entrada) e **LeadMaster v1.0.html** (painel). Este documento consolida as especificações; os HTMLs servem de referência visual direta.

### 3.0 Sistema de design unificado

- **Paleta:** violeta `#7C3AED` primário, `#8B5CF6` claro, `#6D28D9` hover; rosa `#EC4899` acento (setas/detalhes); painel: sidebar `#1e1b4b`, ativo `#818cf8`, CTA gradiente `indigo-500 → purple-500`; fundos `gray-100`/white; sucesso verde, erro vermelho.
- **Fontes:** Inter (UI) + Poppins (display/login), via Google Fonts com fallback de sistema.
- **Ícones:** Material Symbols Outlined (login) + Font Awesome 6 (painel), conforme as bases.
- **Raio de cantos:** cards `0.75rem–1.25rem`; botão Entrar `1.25rem`; inputs `4px`.
- **Um único CTA primário por tela** (gradiente violeta/rosa) contra superfície neutra; demais botões neutros.

### 3.1 Tela de Login (base: página de login.html — recriar 1:1 em React)

Rota pública `/login`. Layout split-screen:

**Lado esquerdo (escuro `#0A0A0A`):**
- Título: "Tudo o que o afiliado precisa **para vender** em um só lugar" (destaque "para vender" em `#8b5cf6`); permitido ajustar "afiliado" para "produtor e afiliado".
- Subtítulo: "Menos configuração, mais vendas!"
- Grid com 4 etapas numeradas (cards `rgba(124,58,237,0.08)`, borda `rgba(124,58,237,0.22)`, ícones Material Symbols `rgba(139,92,246,0.75)` tamanho 3rem, setas rosa entre cards):
  1. `inventory_2` — Adicione o produto
  2. `web` — Crie a Presell
  3. `campaign` — Crie a Campanha
  4. `trending_up` — Receba Vendas
- Fundo animado: orbs desfocados violeta/rosa flutuando + partículas subindo (cores `#8b3fbf`/`#ee476f`), radial central sutil; animações de entrada sequenciais (0.3s–0.75s).

**Lado direito (claro `#f8fafc`):**
- Toggle de idioma no topo direito (Português / English / Español; item ativo `#ede9fe`).
- Título "Bem-vindo de volta!" + subtítulo "Insira seu e-mail e código de ativação".
- Campo **E-mail** com ícone `mail` à esquerda (`padding-left: 2.5rem`).
- Campo **Código de Ativação** tipo password com ícone `lock` e botão olho para mostrar/ocultar.
- Botão **Entrar**: `#7C3AED`, hover `#6D28D9` + `translateY(-2px)`, largura total, radius `1.25rem`.
- Links: "Esqueceu o código de ativação? Clique aqui" e "Problemas com a ativação? Use o chat de suporte abaixo" (em v1 apontam para a Documentação local).
- Rodapé: Termos de Serviço | Política de Privacidade (páginas locais simples servidas pelo backend) + "© 2026. Todos os direitos reservados."
- Responsivo: abaixo de 1024px o lado esquerdo é ocultado.

### 3.2 Painel (base: LeadMaster v1.0 — recriar 1:1 em React)

**Sidebar esquerda fixa `w-64` fundo `#1e1b4b`, texto branco:**
- Logo "ProdMaker" (`p-6 text-2xl font-bold tracking-tight`), divisor `border-b border-gray-700`.
- Grupos com header `px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider`.
- Links `flex items-center px-6 py-2.5 text-sm`, ícones Font Awesome `w-5 text-gray-400`, label `ml-3`.
- Link ativo: `bg-white/10` + `border-left: 3px solid #818cf8`; hover: `bg-white/5`.
- Rodapé da sidebar: botão full-width gradiente `from-indigo-500 to-purple-500 rounded-lg py-2.5` — **Sair** (volta ao login).

**Header branco `shadow-sm px-8 py-4`:**
- Título da página (`text-lg font-semibold text-gray-800`).
- À direita: botão "Ver tutorial" (`text-indigo-600`), avatar circular `w-8 h-8 bg-indigo-100 text-indigo-600` com inicial, nome do usuário (e-mail), badge da versão (ex.: `v0.1.00`) e status "Licença ativa • expira em 31/12/2099".

**Conteúdo (`bg-gray-100 p-8`):**
- Saudação: "Olá, [nome] 👋 bem-vindo ao seu painel".
- Grid de 4 cards de métricas (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`), cards `bg-white rounded-xl shadow-sm p-5 border border-gray-100`: label `text-sm text-gray-500`, valor `text-2xl font-bold`, sub `text-xs text-gray-400`. Painel inicial: Produtos criados, Páginas publicadas, Campanhas ativas, Vendas rastreadas.
- CTA primário "Novo Lançamento" (abre o Assistente — seção 3.5).
- Gráficos em containers `h-64` com Chart.js via `react-chartjs-2`: barras horizontais (funil/etapas) + doughnut cutout 70% com legenda custom embaixo.
- Rodapé: `text-xs text-gray-400 pt-4 border-t border-gray-200` — "© 2026 ProdMaker. Todos os direitos reservados."

### 3.3 Navegação (sidebar completa)

- **Painel**
- **PRODUTOS:** Produtos (biblioteca) · Gerar Produto
- **PÁGINAS:** Gerar Página de Vendas · Gerar Pre-Sell · Clonar Página · Minhas Páginas · Publicação
- **CAMPANHAS:** Google Ads · Meta Ads · TikTok Ads · Palavras-chave & Negativas · Criativos
- **TRACKING:** Métricas · Webhooks de Venda · Conversões (GCLID) · Anti-Fraude
- **ORGÂNICO:** Pinterest
- **SISTEMA:** Notificações · Configurações · Logs · Documentação
- Rodapé: **Sair**

### 3.4 As 7 leis da usabilidade — aplicação obrigatória

1. **Lei de Fitts** — botões primários grandes (h-12, px-6, alvo ≥ 44px); cards inteiros clicáveis; imagens clicáveis com área ampla.
2. **Lei de Hick** — menu agrupado com headers; formulários longos divididos em etapas; revelação progressiva (accordions); máximo 4 métricas por linha no Painel.
3. **Efeito Zeigarnik** — barra de progresso do Assistente de Lançamento; checklists pendentes visíveis no Painel; badge de etapas restantes.
4. **Lei de Jakob** — layout convencional (sidebar esquerda, header no topo), formulários, tabelas e padrões que o usuário já conhece de outros SaaS.
5. **Gradiente de Meta** — "faltam X passos para publicar"; progresso sempre visível; tela final de conclusão com o Relatório de Lançamento.
6. **Efeito von Restorff** — um único botão vibrante por tela (gradiente) contra superfície neutra; hierarquia visual clara.
7. **Lei de Miller** — chunking: API keys agrupadas por categoria, formulários por etapas, números formatados (moeda/datas), listas curtas com scroll.

### 3.5 Assistente de Lançamento ("Novo Lançamento")

Wizard com etapas e progresso persistido no banco (retomável — Zeigarnik + Gradiente de Meta):

1. **Produto** — nicho, dor, avatar, formato, resultado; gera conteúdo + nome + preço + bump/upsell.
2. **Página** — escolhe página de vendas ou pre-sell; gera, pré-visualiza, edita.
3. **Publicar** — GitHub + Cloudflare (automático com credenciais; guia manual sem elas); entrega a URL final.
4. **Campanhas** — monta Google/Meta/TikTok com defaults e keywords; revisão antes de criar.
5. **Tracking** — pixel embutido, webhook/GCLID, Pinterest agendado.
6. **Conclusão** — checklist final + Relatório de Lançamento + próximos passos.

### 3.6 Idiomas e temas

- PT-BR completo no lançamento; estrutura i18n (JSON por idioma) desde a Fase 0; EN/ES progressivos (login primeiro, painel depois). Chaves técnicas, URLs e dados do usuário nunca são traduzidos.
- Tema claro padrão; tema escuro opcional na Fase 6. Preferências persistidas.

---

## 4. ACESSO E AUTENTICAÇÃO (LOCAL)

- **Porta de entrada:** e-mail + código de ativação (tela de login). Em v1 a validação é **local e simulada** (qualquer e-mail válido + código de ≥ 4 caracteres); a primeira entrada cria a licença local `storage/state/license.json` (e-mail, criado_em, expira 31/12/2099), exibida no painel como no LeadMaster. Estrutura pronta para validação remota no futuro SaaS em nuvem.
- **Sessão:** JWT HS256 assinado com secret local (`storage/state/secret.key`, gerado na primeira execução), cookie httpOnly `prodmaker_session`, expiração 30 dias. Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`. Guard no frontend: sem sessão → `/login`.
- **Sair:** botão na sidebar → logout → volta ao login.
- **Sem travas internas:** a tela de login é a ÚNICA barreira. Dentro do painel, nenhuma funcionalidade exige credencial externa antes do momento da ação (ex.: gerar página não exige Google Ads; publicar no Cloudflare só pede credenciais na hora de publicar).

---

## 5. REGRAS DE NEGÓCIO — O CÉREBRO DO PRODMAKER (seed/)

Estas regras são implementadas como templates de prompt + defaults + regras de decisão versionados em `seed/`. O ProdMaker aplica — não inventa.

### 5.1 Produto

- Problema: específico, recorrente, resolvível em 48h (nunca "emagrecer"; sim "cardápio de 7 dias para secar sem passar fome").
- Formatos e preços: e-book R$29,90–49,90 · templates/planilhas R$17–47 · mini-curso R$67–97 · desafio R$37–57 · workshop R$57–97. Regra: se a criação não couber em 2h focadas, o escopo é grande demais.
- Nome: fórmula `[RESULTADO] + [FORMATO] + [ESPECIFICIDADE]`, máximo 6 palavras.
- Order bump: +R$21,90 (conversão esperada 25–45%). Upsell pós-compra: +R$197 com desconto (5–15%).
- Estrutura do e-book: capa, diagnóstico (5 motivos), solução passo a passo (5–7 passos), 3 exemplos práticos, checklist de implementação, 1 bônus. Gerado em Markdown → PDF.

### 5.2 Página de vendas — 12 seções obrigatórias

1. Promessa principal ([RESULTADO] em [TEMPO] sem [DOR]) · 2. Prova social (grid 2x2) · 3. Apertar na dor (vozes da cabeça, 1ª pessoa) · 4. Diagnóstico (5 motivos) · 5. Modo de preparo (4 passos) · 6. Entregáveis · 7. Para quem é · 8. Ancoragem de valor (consultoria R$500 vs R$47) · 9. Preço + garantia + CTA · 10. Carta aberta · 11. Autoridade · 12. FAQ (5–8 perguntas + CTA repetido). Mobile-first, carregamento < 3s, arquivo único HTML/CSS/JS, placeholders de imagem.

### 5.3 Pre-sell (afiliado)

Título "O que você precisa saber sobre [PRODUTO]"; 3–5 benefícios com ícones; prova social; tabela comparativa; FAQ de objeções; CTA para o link de afiliado; elemento de urgência.

### 5.4 Publicação (GitHub + Cloudflare Pages)

Com credenciais (GitHub PAT + Cloudflare API token + Account ID): criar/atualizar repositório de páginas via API, commit dos arquivos, criar/ler projeto Cloudflare Pages e devolver a URL pública. Sem credenciais: exportação ZIP + guia passo a passo. Nunca bloquear o fluxo por falta de credencial.

### 5.5 Google Ads (fundo de funil)

Tipo Vendas; rede Pesquisa; lances CPA alvo = 60–80% da comissão; orçamento inicial R$100–120/dia; localização "presença"; correspondência de frase; negativas padrão (seed/negatives/google-words.txt): gratis, download, torrent, "como fazer", affiliate, refund, return, youtube, scams. Anúncio: T1 "[PRODUTO] – Site Oficial", T2 "Compre Agora com Desconto", T3 "Oferta por Tempo Limitado" + sitelinks/callouts.

### 5.6 Meta Ads

1 campanha → 1 conjunto → 5–20 criativos; objetivo Vendas; público aberto + Advantage+; budget = nº de criativos × ½ ticket. Criativo: gancho 3s + promessa + prova + CTA. CPV > R$2,70 → trocar criativo.

### 5.7 TikTok Ads

Vídeo 9:16, 15–30s, estilo UGC; público 18–45 (EUA/UK/CA/AU); teste US$10–20/dia por criativo; escala US$50–100/dia no vencedor.

### 5.8 Pinterest (orgânico)

Pins 1000x1500 ou 1000x1000 com texto grande; temas: review, benefícios, comparação, dica; SEO no título/descrição/arquivo; boards temáticos; mínimo 5 pins por lançamento.

### 5.9 Árvore de decisão (otimização)

- ROAS > 2,0 → escalar budget +20% (7 dias seguidos → campanha de escala).
- ROAS 1,5–2,0 → manter e observar.
- ROAS < 1,5 → pausar/otimizar (trocar criativos, ajustar keywords, revisar página).
- CTR < 1% (Google) → melhorar título/hook. CPA > ½ ticket → pausar.
- Keyword/criativo sem conversão em 7 dias → substituir.

### 5.10 Checklist final de lançamento

**Produto:** problema específica · formato · nome ≤ 6 palavras · preço · conteúdo ≤ 48h · bump · upsell.
**Página:** 12 seções · mobile-first · < 3s · hospedada.
**Tráfego:** conta ads pronta · pixel próprio/UTMify · criativos 5–20 · keywords validadas · links de afiliado · orçamento · ≥ 5 pins agendados.

---

## 6. CAMADA LLM — NVIDIA NIM + GOOGLE GEMINI

- **NVIDIA NIM:** SDK `openai` com `base_url="https://integrate.api.nvidia.com/v1"`, chave `nvapi-...` (build.nvidia.com); modelos consultáveis em `/v1/models` (ex.: nemotron, e derivados).
- **Google Gemini:** SDK `google-genai` (ou REST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...`); modelos `gemini-2.5-flash`, `gemini-2.5-pro`.
- **UI (Configurações → API Keys):** cartões por provider com API key, Base URL (editável), Modelo, **Prioridade** (1 = primeiro), Ativo e botão "Testar chamada" (read-only, não altera estado).
- **Pool com failover:** em erro transitório (quota, timeout, transporte, HTTP 429/5xx) o router tenta a prioridade seguinte; erro de credencial, endpoint/modelo inexistente ou payload inválido fica registrado sem máscara, com attribution clara (provider, serviço, rota, campo em falta).
- **Limite opcional 40 RPM** para cartões NVIDIA (janela configurável), padrão desligado (herdado do Thunderbolt).
- Chaves guardadas apenas no storage local; nunca no GitHub; logs mascaram segredos.

---

## 7. FUNCIONALIDADES ↔ REPOSITÓRIOS OPEN SOURCE

Nenhum repositório é o produto final: o ProdMaker orquestra as peças dentro do FastAPI, com UI própria. MCP servers podem ser invocados como subprocesso ou biblioteca; a UI nunca expõe detalhes internos de MCP.

| # | Funcionalidade | Base open source | Uso no ProdMaker |
|---|---|---|---|
| 1 | Geração de páginas (vendas/pre-sell) | **pyfun-ai** (PyPI) — pipeline multi-etapas; CCUX como referência | Adaptar o pipeline para chamar o cliente LLM unificado (NVIDIA/Gemini) em vez do Claude; gerar HTML single-file |
| 2 | Clonagem de páginas | **everpage** (PyPI) / zebbern/website-clone + BeautifulSoup + Playwright | Baixar página completa, higienizar (remover scripts/pixels do concorrente), editar e guardar na biblioteca |
| 3 | Google Ads (campanhas + negativas) | **google-ads-mcp-rw** (PyPI) — MCP server com write | Criar campanhas Search, ad groups, keywords, negativas, pausar/ativar |
| 4 | Meta Ads | **faborsky/meta-ads-app** (CLI, Marketing API v25) ou meta-ads-mcp-python | Campanhas Facebook/Instagram |
| 5 | TikTok Ads | **AdsMCP/tiktok-ads-mcp-server** | Campanhas TikTok Business |
| 6 | Conversões offline (GCLID) | **google-ads-python** — exemplo oficial `upload_offline_conversion.py` | Postback de vendas ao Google Ads |
| 7 | Pixel próprio + anti-fraude | **redis-developer/redis-datasets** (fraud detection: Cuckoo Filter + Sorted Set) | Blacklist de IPs e click spam; Redis opcional com fallback SQLite local |
| 8 | Pinterest orgânico | **py3-pinterest** (GitHub marcosfelt) ; Pinterest_Growth_Agent_core como referência | Criar/agendar pins, boards, histórico |
| 9 | Notificações push | **apprise** (GitHub caronc) | Telegram/Discord/e-mail na venda e conclusões |
| 10 | Base SaaS (futuro nuvem) | **fastapi-saas-starter** (GitHub mahmoudsamy7729) | Apenas referência estrutural para o futuro SaaS multiusuário (auth social, OTP, billing Stripe) — não usado no v1 local |
| 11 | E-mail marketing (backlog) | **emareach** (GitHub ritik-prog) | Backlog futuro |
| 12 | Geração de PDF | **xhtml2pdf** ou **fpdf2** (Markdown → HTML → PDF) | E-books/planilhas; evitar dependências de sistema (sem WeasyPrint com GTK) |

**requirements.txt (base):** fastapi, uvicorn[standard], sqlalchemy, pydantic, python-multipart, openai, google-genai, httpx, beautifulsoup4, playwright, markdown, xhtml2pdf, apprise, py3-pinterest, google-ads — e quando a fase exigir: google-ads-mcp-rw, meta-ads-mcp-python, tiktok-ads-mcp-server.

**Frontend (package.json):** react, react-dom, react-router-dom, vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer, chart.js, react-chartjs-2, @fortawesome/fontawesome-free (Material Symbols e fontes via Google Fonts com fallback).

---

## 8. FASES DE IMPLEMENTAÇÃO

Cada fase termina com: CHANGELOG → commit/push → publicação npm via workflow → relatório. Patches (0.2.01, 0.2.02...) para correções intermediárias.

### Fase 0 — Fundação do repositório (versão 0.1.00)

**Objetivo:** monorepo funcionando, installável via npx, com login + painel navegável e publicação npm operante.

**Entregáveis:**
1. Clonar `https://github.com/DanHachuel/ProdMaker` para `C:\Users\danha\Documents\REPOSITORIO\ProdMaker` (trabalhar no branch `main`).
2. Estrutura do monorepo (seção 2.3), `.gitignore` (storage/, node_modules, __pycache__, venv, .env) e `.npmignore`.
3. `package.json`: name `@danhachuel/prodmaker`, version `0.1.0`, bin `prodmaker`, `files` incluindo scripts/, seed/, app/, frontend/dist; engines node >= 20.
4. `scripts/cli.mjs`: comandos `install` (cria PRODMAKER_HOME, skeleton, settings default, venv + deps Python; flag `--skip-python-deps` para CI), `run` (default: sobe FastAPI, porta 8188 com auto-incremento, **imprime URL sem abrir navegador**), `doctor` (versões Node/Python, deps, storage, porta).
5. `app/`: FastAPI servindo `frontend/dist` em `/`, SPA fallback, `/api/health`, `/api/version`, auth JWT/cookie (seção 4), settings CRUD.
6. `frontend/`: React + Vite + Tailwind com **tela de login 1:1** (seção 3.1), **Painel 1:1** (seção 3.2) com navegação completa e páginas internas em estado vazio/"demo", router com guard, i18n básico pt-BR; build commitado.
7. `seed/`: estrutura completa com os arquivos base das seções 5.x (prompts, negativas, defaults, regras, checklist).
8. `.github/workflows/publish-npm.yml` (seção 12).
9. `AGENTS.md` (seção 13), `README.md`, `MANUAL-INSTALACAO.md`, `CHANGELOG.md` (entrada 0.1.00), `THIRD-PARTY-NOTICES.md`, `requirements.txt`, `pyproject.toml`.

**Critérios de aceite (bloqueantes):**
- `npx --yes @danhachuel/prodmaker install` e `npx --yes @danhachuel/prodmaker` funcionam.
- Iniciar a aplicação **não abre navegador**; a URL é impressa no terminal.
- Login aceita e-mail + código (modo local simulado); sessão persiste; Sair volta ao login.
- Painel renderiza com o layout LeadMaster e a navegação completa.
- Workflow publica `0.1.00` (registry `0.1.0`) e o tarball é verificável.

### Fase 1 — Núcleo local (0.2.00)

Configurações persistentes; página Configurações com cartões de API Keys (LLM NVIDIA, LLM Google, GitHub, Cloudflare, Google Ads, Meta, TikTok, Pinterest, Telegram/apprise) com "Testar chamada" read-only; pool LLM com prioridade/failover funcionando; Logs (Operação, Estado, Data/Hora, Origem, Detalhes, attribution de provider); Central de Notificações local (histórico + toasts); Painel com métricas reais do banco e gráficos Chart.js; `doctor` completo.

### Fase 2 — Produtos & Páginas (0.3.00)

- **Gerar Produto:** formulário (formato, nicho, dor, avatar, resultado) → LLM → Markdown → PDF em `storage/produtos/{id}/`; biblioteca com listagem, pré-visualização, download, regenerar; sugestões de nome/preço/bump/upsell (regras 5.1).
- **Gerar Página de Vendas:** inputs do produto + link de checkout → LLM com prompt das 12 seções → HTML single-file mobile-first com pixel próprio embutido → `storage/pages/{id}/` → pré-visualização em `/pages/{id}`, edição, download.
- **Pre-Sell:** estrutura 5.3 com link de afiliado.
- **Clonar Página:** URL → everpage/website-clone + higienização (scripts/pixels do original removidos) → biblioteca.
- **Publicação:** GitHub API + Cloudflare Pages API (com credenciais) ou ZIP + guia manual (sem); histórico de publicações em Logs.
- **Assistente:** etapas 1–3 funcionais com progresso persistido.

### Fase 3 — Campanhas (0.4.00)

- **Google Ads:** OAuth/developer token em Configurações; criar campanha Search completa com defaults 5.5 (ad groups, keywords frase, negativas do seed, anúncios, extensões) via google-ads-mcp-rw.
- **Meta Ads** (5.6) e **TikTok Ads** (5.7) com os mesmos padrões.
- **Palavras-chave & Negativas:** gerador LLM (principal + review/funciona + negativas automáticas), listas editáveis, exportação.
- **Criativos:** gerador de scripts (gancho 3s + promessa + prova + CTA), variações, exportação.
- OAuth por plataforma validado apenas no momento da ação.
- **Assistente:** etapa 4 funcional.

### Fase 4 — Tracking & Anti-fraude (0.5.00)

- **Pixel próprio** embutido em toda página gerada: pageview, tempo, clique CTA, captura de gclid/utm/fbp/IP/UA → endpoint `/track` → SQLite.
- **Webhook de vendas:** `POST /api/webhook/sale/{fonte}` (hotmart|clickbank|digistore24|kiify|cakto) + entrada manual + importação CSV; matching com cliques por gclid/utm. Para webhooks externos em local: túnel opcional (cloudflared/ngrok) documentado.
- **Conversões offline:** upload GCLID → Google Ads (google-ads-python) com histórico.
- **Anti-fraude:** blacklist de IPs (manual + regras), detecção de click spam (padrão Redis; fallback SQLite sem Redis), painel de IPs bloqueados; conversões de IPs bloqueados não contam.
- **Métricas:** página Tracking com ROAS, CPA, CTR, CPV por campanha/produto/página + gráficos.
- **Assistente:** etapa 5 funcional.

### Fase 5 — Orgânico & Notificações (0.6.00)

- **Pinterest:** credenciais em Configurações; gerador de ideias de pins (LLM, regra 5.8), criar/agendar via py3-pinterest, boards, histórico.
- **Notificações push:** apprise (Telegram/Discord/e-mail) nos eventos: venda recebida, campanha criada, página publicada, produto gerado, etapas do assistente; configuração por evento.

### Fase 6 — Assistente completo, Otimização & Polimento (0.7.00)

- **Assistente de Lançamento completo** (etapas 1–6) com Relatório de Lançamento (produto, página, URLs, campanhas, checklist).
- **Motor de recomendações:** aplica a árvore 5.9 sobre as métricas e sugere pausar/escalar/trocar com um clique — nunca executa mudanças sem confirmação.
- Tema escuro/claro; estados vazios ilustrados; microcopy consistente; acessibilidade (contraste, foco); MANUAL-INSTALACAO atualizado; testes básicos (pytest backend, smoke CLI).

---

## 9. VERSIONAMENTO E RELEASES NPM (REGRAS PERMANENTES)

1. **Convenção visual:** `MAJOR.MINOR.PATCH` com **dois dígitos no PATCH**. Ao atingir patch `99`, incrementa MINOR e PATCH reinicia em `00`; MINOR em `9` avança MAJOR e reinicia `00`. Exemplos: depois de `0.3.99` vem **`0.4.00`**; depois de `0.9.99` vem **`1.0.00`** (nunca `0.10.00`). Nunca exibir patch acima de 99 nem minor acima de 9.
2. **Versão canônica no registry:** o NPM normaliza zeros à esquerda — `npm version 0.1.00` escreve e publica `0.1.0`; `0.2.05` → `0.2.5` (comportamento verificado). Antes de cada publicação, confirmar a versão em `package.json`, no workflow e no registry. Nos **comandos** Windows/MobaXterm usar a versão canônica literal do registry; na **interface e comunicação** usar a etiqueta visual com patch de dois dígitos.
3. **Push obrigatório:** sempre que uma sessão criar commits, enviar de imediato para origin (`main`) — nunca deixar trabalho apenas commitado no disco. Fazer sempre, sem perguntar.
4. **Publicação imediata:** sempre que algo for atualizado no repositório, push + publicação imediata de nova versão no NPM.
5. **Sempre via GitHub Actions:** bump duplo (package.json + versão exibida na UI) → commit/push → dispatch manual com dist-tag `next` → push da tag `vX.Y.ZZ` (ex.: `v0.1.00`), que verifica o tarball e promove a `latest`. Nunca `npm publish` local.
6. **Transparência:** após criar/publicar versão, relatar explicitamente a versão e as áreas/arquivos alterados.
7. **UX:** nunca criar travas de pré-registo interno; validação de credenciais apenas no momento da ação que realmente precisa delas. **Nunca abrir o navegador (REGRA ZERO).**
8. **Comandos de instalação** (após cada versão, no formato obrigatório):
   - CMD/MobaXterm: `npx.cmd --yes --prefer-online @danhachuel/prodmaker@<VERSAO> install` e `npx.cmd --yes --prefer-online @danhachuel/prodmaker@<VERSAO>`
   - Normal: `npx --yes @danhachuel/prodmaker@<VERSAO> install` e `npx --yes @danhachuel/prodmaker@<VERSAO>`
9. **CHANGELOG obrigatório:** toda alteração com push entra no `CHANGELOG.md` antes de publicar; nenhuma versão sai sem registro. Ao integrar trabalho de outra sessão sem entrada, documentar retroativamente.
10. **Sessões simultâneas:** antes de qualquer commit/push, verificar o remoto (`git fetch origin` + comparar) e fazer rebase se `main` avançou. Em colisão de versão, a já publicada vence e a sessão renumera para o patch seguinte (confirmar no registry antes de publicar).
11. **Storage é sagrado:** atualizações preservam `storage/`; nunca apagar dados do usuário sem confirmação explícita.

---

## 10. FLUXO DE RELEASE (PASSO A PASSO)

1. Editar `package.json` (`npm version <nova-versão-visual> --no-git-tag-version`) e a versão exibida na UI (badge do header).
2. Escrever a entrada no `CHANGELOG.md`.
3. `git fetch origin` → rebase se `main` avançou → commit → `git push origin main`.
4. GitHub → Actions → **Publish npm package** → *Run workflow* → preencher `version` (ex.: `0.1.00`) e `dist_tag=next` → executar. O workflow valida, faz smoke test e publica como `next`.
5. Criar e enviar a tag: `git tag v0.1.00 && git push origin v0.1.00` → o workflow verifica o tarball e promove a `latest`.
6. Confirmar no registry (`npm view @danhachuel/prodmaker version`) e entregar o relatório (seção 14).

---

## 11. SEGREDO NECESSÁRIO NO REPOSITÓRIO

- `NPM_TOKEN` (token de automação do npm) configurado em Settings → Secrets and variables → Actions. Sem ele o workflow não publica.

---

## 12. WORKFLOW PUBLISH-NPM (ADAPTADO AO PRODMAKER)

Criar `.github/workflows/publish-npm.yml` com este conteúdo integral:

```yaml
name: Publish npm package

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Versão a publicar; deixe vazio para usar a versão do package.json"
        required: false
        type: string
      dist_tag:
        description: "NPM dist-tag para execuções manuais (staging)"
        required: false
        default: next
        type: choice
        options:
          - next
  push:
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org

      - name: Apply requested version
        if: ${{ inputs.version != '' }}
        env:
          REQUESTED_VERSION: ${{ inputs.version }}
        run: |
          CURRENT_VERSION=$(node -p "require('./package.json').version")
          node -e 'const v = process.env.REQUESTED_VERSION; if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.[0-9]{2}$/.test(v || "")) { console.error("Invalid version; expected MAJOR.MINOR.PATCH with a two-digit PATCH"); process.exit(1); }'
          if [ "$CURRENT_VERSION" != "$REQUESTED_VERSION" ]; then
            npm version "$REQUESTED_VERSION" --no-git-tag-version
          else
            echo "Version $CURRENT_VERSION already selected; no change needed."
          fi

      - name: Validate package metadata
        run: |
          node --check scripts/cli.mjs
          node -e "const p=require('./package.json'); if (!p.name.startsWith('@danhachuel/')) process.exit(1); if (!p.bin || !p.bin['prodmaker']) process.exit(1); console.log(p.name + '@' + p.version)"
          test -f frontend/dist/index.html
          npm pack --dry-run

      - name: Smoke test launcher install
        run: |
          TEST_ROOT="${RUNNER_TEMP}/prodmaker-install-smoke"
          PRODMAKER_HOME="$TEST_ROOT" node scripts/cli.mjs install --skip-python-deps
          test -f "$TEST_ROOT/storage/state/settings.json"

      - name: Publish to npm
        if: ${{ github.event_name == 'workflow_dispatch' }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          REQUESTED_DIST_TAG: ${{ inputs.dist_tag }}
        run: |
          PACKAGE="@danhachuel/prodmaker"
          VERSION=$(node -p "require('./package.json').version")
          DIST_TAG="${REQUESTED_DIST_TAG:-next}"
          case "$DIST_TAG" in
            next) ;;
            *) echo "Unsupported npm dist-tag: $DIST_TAG" >&2; exit 1 ;;
          esac
          if npm view "${PACKAGE}@${VERSION}" version >/dev/null 2>&1; then
            echo "${PACKAGE}@${VERSION} already exists; assigning dist-tag ${DIST_TAG}."
            npm dist-tag add "${PACKAGE}@${VERSION}" "$DIST_TAG"
          else
            npm publish --access public --tag "$DIST_TAG"
          fi

      - name: Verify published tarball is downloadable
        run: |
          PACKAGE="@danhachuel/prodmaker"
          VERSION=$(node -p "require('./package.json').version")
          MAX_ATTEMPTS=18
          DELAY=10
          TARBALL=""
          for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
            TARBALL=$(npm view --prefer-online "${PACKAGE}@${VERSION}" dist.tarball 2>/dev/null || true)
            if [ -n "$TARBALL" ]; then
              break
            fi
            if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
              echo "Published metadata not available yet (attempt ${attempt}/${MAX_ATTEMPTS}); waiting ${DELAY}s..."
              sleep "$DELAY"
              if [ "$DELAY" -lt 60 ]; then
                DELAY=$((DELAY * 2))
                if [ "$DELAY" -gt 60 ]; then DELAY=60; fi
              fi
            fi
          done
          if [ -z "$TARBALL" ]; then
            echo "Published metadata was not available for ${PACKAGE}@${VERSION}"
            exit 1
          fi
          DELAY=10
          for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
            if curl --fail --location --silent --show-error --output /dev/null "$TARBALL"; then
              echo "Published tarball is available: $TARBALL"
              exit 0
            fi
            if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
              echo "Tarball not available yet (attempt ${attempt}/${MAX_ATTEMPTS}); waiting ${DELAY}s..."
              sleep "$DELAY"
              if [ "$DELAY" -lt 60 ]; then DELAY=60; fi
            fi
          done
          echo "Published tarball was not downloadable: $TARBALL"
          exit 1

      - name: Promote verified release to npm latest
        if: ${{ github.event_name == 'push' }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          PACKAGE="@danhachuel/prodmaker"
          VERSION=$(node -p "require('./package.json').version")
          if ! npm view --prefer-online "${PACKAGE}@${VERSION}" version >/dev/null 2>&1; then
            echo "Refusing to promote ${PACKAGE}@${VERSION}: no published package to verify." >&2
            exit 1
          fi
          npm dist-tag add "${PACKAGE}@${VERSION}" latest
```

---

## 13. AGENTS.md — CONTEÚDO INTEGRAL A CRIAR NO REPOSITÓRIO

```markdown
# Instruções do Repositório ProdMaker

## Nunca abrir o navegador (REGRA ZERO)
Ao iniciar, reiniciar ou atualizar a aplicação, é proibido abrir janela ou aba do
navegador por qualquer meio (Node, Python ou sistema). O launcher apenas imprime
a URL local (http://localhost:8188) no terminal; o usuário abre manualmente.
Violação = bug crítico, corrigir antes de qualquer publicação.

## Versionamento NPM
O ProdMaker usa a convenção visual de lançamento MAJOR.MINOR.PATCH, com dois
dígitos no PATCH. Ao atingir o patch 99, a próxima publicação incrementa o MINOR
e reinicia o PATCH em 00; quando o MINOR está em 9, o MAJOR avança e MINOR/PATCH
reiniciam em 00. Exemplos obrigatórios: depois de 0.3.99, a etiqueta apresentada
é 0.4.00; depois de 0.9.99, é 1.0.00 (nunca 0.10.00). Nunca apresentar patch
acima de 99 nem minor acima de 9.

O NPM aplica SemVer e normaliza zeros à esquerda: a etiqueta visual 0.4.00 é
publicada no registry como a versão canônica 0.4.0. Antes de cada publicação,
confirmar a versão em package.json, no workflow NPM e no registry. Nos comandos
Windows/MobaXterm, usar a versão canônica literal confirmada no registry; na
interface e comunicação de lançamento, usar a etiqueta visual de dois dígitos.

## Push obrigatório
Sempre que uma sessão criar commits, o branch deve ser enviado de imediato para
origin (main). Nunca deixar trabalho apenas commitado no disco local. Não
perguntar ao usuário se deve fazer push: fazer sempre, automaticamente.

## Regras de release (permanentes)
1. Publicação imediata — sempre que algo for atualizado no repositório, push e
   publicação imediata da nova versão no NPM.
2. Publicar sempre via GitHub Actions (workflow Publish npm package), nunca por
   npm publish local. Sequência: bump duplo (package.json + versão na UI) →
   commit/push → dispatch manual com dist-tag next → push da tag vX.Y.ZZ, que
   verifica o tarball e promove a versão a latest.
3. Transparência — depois de criar ou publicar uma versão, relatar explicitamente
   a versão e as áreas ou arquivos alterados.
4. UX sem travas de pré-registo interno — validações de credenciais apenas no
   momento da ação que realmente precisa delas; nunca bloquear navegação/criação.
5. Comandos de instalação — após cada versão, entregar sempre os comandos no
   formato: CMD/MobaXterm: npx.cmd --yes --prefer-online @danhachuel/prodmaker@<VERSAO>
   install e npx.cmd --yes --prefer-online @danhachuel/prodmaker@<VERSAO>;
   instalação normal: npx --yes @danhachuel/prodmaker@<VERSAO> install e
   npx --yes @danhachuel/prodmaker@<VERSAO>.
6. CHANGELOG obrigatório — toda alteração com push entra no CHANGELOG.md antes
   de publicar; nenhuma versão sai sem registro. Documentar retroativamente
   trabalho de outra sessão sem entrada.
7. Sessões simultâneas — antes de qualquer commit/push, verificar o main remoto
   (git fetch origin + comparar) e fazer rebase sempre que o main tiver avançado.
   Em colisão de versão, a versão já publicada vence e a sessão renumera para o
   patch seguinte (confirmar no registry antes de publicar).
8. A UI nunca inventa dados quando um serviço externo ou credencial não está
   disponível — mostrar estado vazio/aviso com o campo em falta.
9. O storage do usuário (PRODMAKER_HOME/storage) é preservado em toda
   atualização; nunca apagar dados sem confirmação explícita.
```

---

## 14. RELATÓRIO PÓS-VERSÃO (FORMATO OBRIGATÓRIO)

Após cada publicação, entregar:

```
VERSÃO: 0.1.00 (registry: 0.1.0)
ALTERADO: [áreas/arquivos alterados, resumo por área]
INSTALAÇÃO:
  CMD/MobaXterm: npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.0 install
                 npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.0
  Normal:        npx --yes @danhachuel/prodmaker@0.1.0 install
                 npx --yes @danhachuel/prodmaker@0.1.0
ACESSO: rodar o launcher, abrir http://localhost:8188 MANUALMENTE no navegador,
fazer login e conferir o Painel.
```

---

## 15. O QUE O AGENTE DEVE FAZER AGORA (PRIMEIRA EXECUÇÃO)

1. Confirmar pré-requisitos: Node 20+, Python 3.10+, git com acesso ao GitHub.
2. Clonar `https://github.com/DanHachuel/ProdMaker` em `C:\Users\danha\Documents\REPOSITORIO\ProdMaker` (repositório já existe com LICENSE; não criar outro).
3. Executar a **Fase 0** completa (seção 8): monorepo, package.json, `scripts/cli.mjs`, FastAPI, React+Vite+Tailwind com login (página de login.html 1:1) e Painel (LeadMaster 1:1), `seed/`, workflow publish-npm (seção 12), AGENTS.md (seção 13), README, MANUAL-INSTALACAO, CHANGELOG, THIRD-PARTY-NOTICES.
4. Testar localmente: build do frontend; `node scripts/cli.mjs install --skip-python-deps`; iniciar; validar **REGRA ZERO** (nenhum navegador aberto); login; painel; navegação.
5. Commit + push imediato para `origin main`.
6. Publicar **0.1.00**: dispatch do workflow (version `0.1.00`, dist-tag `next`) → tag `v0.1.00` → confirmação de `latest`.
7. Entregar o relatório no formato da seção 14.

---

## 16. BACKLOG FUTURO (FORA DO ESCOPO INICIAL)

- SaaS em nuvem multiusuário (base fastapi-saas-starter: social login, OTP, billing Stripe) — o v1 é local, um usuário, sem autenticação de nuvem.
- E-mail marketing self-hosted (emareach).
- Blog/SEO em massa, TikTok orgânico e YouTube Shorts.
- Aplicativo mobile.

---

**Este é o planejamento fundador do ProdMaker. Siga as fases na ordem, respeite a REGRA ZERO e as regras de release, e publique cada versão com CHANGELOG e relatório. Boa construção!**
