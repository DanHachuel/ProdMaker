# Instruções do Repositório ProdMaker

## Nunca abrir o navegador (REGRA ZERO)
Ao iniciar, reiniciar ou atualizar a aplicação, é proibido abrir janela ou aba do
navegador por qualquer meio (Node, Python ou sistema). O launcher apenas imprime
a URL local (http://localhost:8188) no terminal; o usuário abre manualmente.
Violação = bug crítico, corrigir antes de qualquer publicação.

## Nunca abrir telas/janelas de CMD (REGRA ZERO — TERMINAL)
É PROIBIDO criar/publicar versões que abram qualquer janela/tela nativa de CMD
(cmd.exe/console) no computador do usuário. Todo processo filho (Python/worker)
deve subir sem alocar console novo: no Windows use `windowsHide: true`
(CREATE_NO_WINDOW) e, para o servidor, `detached: true` + o **binário base do
venv com o `site-packages` no `PYTHONPATH`** — o `venv/Scripts/python.exe` é um
redirecionador cujo processo neto nasce sem as flags de ocultação e abriria um
console novo (a janela preta). O launcher só
imprime no terminal já existente (MobaXterm/CMD); o usuário nunca pode ver uma
janela preta piscar ao iniciar/rodar. Violação = bug crítico, corrigir antes de
qualquer publicação.

## 🚨 REGRA INVIOLÁVEL: ARQUITETURA DO LAUNCHER (WINDOWS/MOBAXTERM)
O launcher (`scripts/cli.mjs`) NÃO pode morrer sozinho. O MobaXterm envia sinais
espúrios (SIGINT/SIGHUP) quando a janela perde o foco ou é minimizada, e escrever
em console fechado gera EPIPE — ambos já derrubaram o app sem motivo. Por isso:
1. **Arquitetura PandaNews (definitiva):** o `run` NÃO tenta "segurar" o
   terminal com `setInterval`/`Promise`/`readline` — todos falham no PTY do
   MobaXterm, que desanexa ou mata o Node. Em vez disso:
   - o Python sobe como **daemon isolado**: binário **base** do venv +
     `PYTHONPATH` do venv (Windows), `spawn` com `detached: true`,
     `windowsHide: true`, `stdio: ['ignore', logFd, logFd]` (logs em
     `storage/logs/app.log`), `creationFlags: CREATE_NEW_PROCESS_GROUP` e
     `child.unref()` — fechar/minimizar/perder o foco **não** derruba nada;
   - o launcher fica no ar porque tem um **socket HTTP real**:
     `http.createServer().listen(8188)` serve `.runtime/frontend/dist` (com SPA
     fallback) e encaminha `/api`, `/legal`, `/pages` e `/track` para o daemon
     Python (porta 8189). O listen é a única trava do terminal;
   - o lock global `storage/prodmaker.pid` (JSON: launcher + backend + portas)
     permite ao `stop` encerrar tudo com `taskkill /PID /F /T` **silencioso**, e
     ao `run` matar instâncias antigas (PIDs do lock + donos das portas via
     netstat) antes de subir a nova. Watchdog reergue o daemon em quedas
     silenciosas, com teto de `MAX_REINICIOS`.
2. **Absorção de Sinais:** os sinais `SIGINT` e `SIGHUP` DEVEM ser ignorados no
   Windows (apenas logar). O encerramento real é via comando `prodmaker stop`,
   fechamento da janela ou `taskkill`. Em Linux/macOS, CTRL+C encerra normal.
3. **Guarda da Consola:** a função `guardConsoleStream` NUNCA deve ser removida
   (absorve EPIPE e espelha os logs em `storage/logs/launcher_console.log`).
4. **Isolamento de Workers:** processos filhos DEVEM ser iniciados com
   `CREATE_NEW_PROCESS_GROUP` (0x00000200) — não herdam os sinais do terminal.
5. **Trava de regressão:** `tests/test_launcher_keepalive.py` falha se qualquer
   uma das proteções acima for removida (listen HTTP como trava do terminal,
   daemon detached/unref/stdio-em-arquivo, binário base + PYTHONPATH, lock
   `prodmaker.pid` + taskkill silencioso, kill de instâncias antigas, watchdog
   com teto); rodar antes de publicar (CI).

## 🚨 REGRA INVIOLÁVEL: RUNTIME PERMANENTE (fim do EBUSY)
O servidor **nunca** deve rodar do cache do `npx` (`.npm/_npx/...`). Com o Node e
o Python executando de lá, os arquivos do cache ficam travados e qualquer
atualização falha com `EBUSY`.
1. O diretório fixo de execução é `PRODMAKER_HOME/.runtime` — criado antes de
   qualquer execução.
2. O comando `install` **apenas copia** (`app/`, `frontend/dist/`, `seed/`,
   `legal/`, `requirements.txt`, `package.json`) para o `.runtime` — matando
   antes os processos antigos para evitar EBUSY — e **não** roda o servidor.
3. O comando `run` **sempre** lê/executa do `.runtime` (spawn do Python com
   `cwd` no runtime; frontend servido de `.runtime/frontend/dist`).
4. O `storage/` (banco, logs, chaves) continua na **RAIZ** do `PRODMAKER_HOME` —
   dados do usuário nunca vivem dentro do `.runtime` (sobrevivem a updates).
5. **Trava de regressão:** `tests/test_runtime_architecture.py` falha se a
   separação install=cópia / run=execução-do-runtime for quebrada; roda no CI.

## Versionamento NPM
Convenção visual MAJOR.MINOR.PATCH com dois dígitos no PATCH. Patch 99 → MINOR+1
e PATCH 00; MINOR 9 → MAJOR+1. Exemplos: 0.3.99 → 0.4.00; 0.9.99 → 1.0.00 (nunca
0.10.00). Nunca patch acima de 99 nem minor acima de 9.

O NPM normaliza zeros à esquerda: 0.4.00 é publicada no registry como 0.4.0.
Antes de publicar, confirmar a versão em package.json, no workflow e no registry.
Comandos Windows/MobaXterm usam a versão canônica do registry; interface e
comunicação usam a etiqueta visual de dois dígitos.

## Push obrigatório
Sempre que uma sessão criar commits, enviar de imediato para origin (main). Nunca
deixar trabalho apenas commitado no disco. Não perguntar: fazer sempre.

## Regras de release (permanentes)
1. Publicação imediata — toda atualização do repositório gera push + nova versão.
2. Publicar sempre via GitHub Actions (workflow Publish npm package), nunca npm
   publish local. Sequência: bump duplo (package.json + versão na UI) →
   commit/push → dispatch com dist-tag next → push da tag vX.Y.ZZ, que verifica o
   tarball e promove a latest.
3. Transparência — relatar explicitamente a versão e as áreas/arquivos alterados.
4. UX sem travas de pré-registo interno — credenciais validadas apenas no momento
   da ação que as exige; nunca bloquear navegação/criação.
5. Comandos de instalação — após cada versão: CMD/MobaXterm
   npx.cmd --yes --prefer-online @danhachuel/prodmaker@<VERSAO> install e
   npx.cmd --yes --prefer-online @danhachuel/prodmaker@<VERSAO>; normal:
   npx --yes @danhachuel/prodmaker@<VERSAO> install e
   npx --yes @danhachuel/prodmaker@<VERSAO>.
6. CHANGELOG obrigatório — toda alteração com push entra no CHANGELOG.md antes de
   publicar; nenhuma versão sai sem registro; documentar retroativamente trabalho
   de outra sessão sem entrada.
7. Sessões simultâneas — antes de commit/push, verificar o main remoto
   (git fetch origin + comparar) e rebase se avançou. Em colisão, a versão já
   publicada vence e a sessão renumera para o patch seguinte (confirmar registry).
8. A UI nunca inventa dados quando serviço/credencial não está disponível —
   mostrar estado vazio/aviso com o campo em falta.
9. O storage do usuário (PRODMAKER_HOME/storage) é preservado em toda
   atualização; nunca apagar dados sem confirmação explícita.
