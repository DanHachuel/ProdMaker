# Skill: Launcher Architecture Guard (Windows/MobaXterm)

**Propósito:** impedir o encerramento silencioso do app, janelas de CMD e
processos órfãos no Windows/MobaXterm. Esta skill existe porque cada um desses
bugs já derrubou o ProdMaker em produção e foi corrigido com suor — as
correções abaixo são **arquiteturais**, não cosméticas.

**Leia antes de:** qualquer alteração em `scripts/cli.mjs`, `app/main.py`
(spawn/sinais/telemetria), no workflow de publish ou em qualquer coisa que
suba processo filho.

---

## A Tríade do Launcher

1. **O Node.js DEVE ter um `http.createServer().listen()` ativo** (o servidor
   de UI). Esse socket real é um handle do Event Loop que o SO mantém sozinho.
   **Nunca** dependa de `setInterval`, `Promise` infinita ou `readline` como
   única trava: os três falharam no PTY do MobaXterm (o terminal desanexa/mata
   o Node mesmo com o loop "vivo"). Além do listen, existe o **`setInterval`
   global inquebrável** no topo do `cli.mjs` (sem `.unref()`) — os dois juntos
   são a rede de segurança.

2. **O daemon Python DEVE usar o binário BASE (`python.exe` + `PYTHONPATH` do
   venv)**, NUNCA o `venv/Scripts/python.exe` diretamente. O executável do venv
   é um **redirecionador**: o processo neto nasce sem as flags de ocultação e o
   Windows aloca um console novo — a janela preta de CMD. A base é lida do
   `venv/pyven.cfg` (`pythonBaseBin`).

3. **O `spawn` do Python DEVE usar:** `detached: true` (grupo próprio — imune
   ao `CTRL_C_EVENT` do console), `windowsHide: true` (CREATE_NO_WINDOW),
   `creationFlags: CREATE_NEW_PROCESS_GROUP (0x00000200)` e
   `stdio: ["ignore", logFd, logFd]` (logs direto em `storage/logs/app.log`).
   E `child.unref()` — launcher e daemon têm vidas separadas.

## Sinais

`SIGINT`, `SIGHUP` e `SIGTERM` devem ser **absorvidos** (apenas registrar) em
todas as plataformas. O MobaXterm envia sinais **espúrios** quando a janela
perde o foco ou é minimizada — qualquer handler que trate isso como "encerrar"
derruba a stack inteira. **Nenhum handler de sinal chama `process.exit`.**
O encerramento real é sempre via `prodmaker stop` (taskkill silencioso nos
PIDs do lock) ou taskkill manual.

## Runtime Permanente (fim do EBUSY)

O servidor **nunca** deve rodar do cache do `npx` (`.npm/_npx/...`) — com o
Node e o Python executando de lá, os arquivos do cache ficam travados e qualquer
atualização falha com `EBUSY`. O comando `install` copia o código para
`PRODMAKER_HOME/.runtime` e **não** roda o servidor; o comando `run` executa
**sempre** de `.runtime` (spawn com `cwd` no runtime, frontend servido de
`.runtime/frontend/dist`). O `storage/` (banco, logs, chaves) continua na
**raiz** do `PRODMAKER_HOME` — dados do usuário nunca vivem dentro do
`.runtime` (que é limpo no install).

## Lock global

`storage/prodmaker.pid` (JSON: launcher, backend, port, apiPort) mora no
**home**, nunca no pacote nem no `.runtime`. O `run` mata instâncias antigas
(PIDs do lock + donos das portas via netstat) antes de subir a nova; o `stop`
mata a árvore inteira em silêncio. Um watchdog reergue o daemon em quedas
silenciosas com teto de `MAX_REINICIOS`.

## Portas: UI ≠ API

`pickPort()` **testa** mas **não reserva** — duas chamadas seguidas podem
devolver a mesma porta livre. A API é alocada **primeiro** e a UI varre a faixa
**pulando** a porta da API (`pickPort(preferred, [apiPort])`). Nunca reverta
essa ordem.

## Comandos terminais

Com o `setInterval` global no ar, `install`, `doctor` e `stop` **precisam**
encerrar com `process.exit(0)` explícito no fim do trabalho (senão penduram
para sempre). Só o `run` fica no ar.

## Verificação obrigatória

```bash
python tests/test_launcher_keepalive.py    # 15 verificações da arquitetura
python tests/test_runtime_architecture.py  # separação install=copia / run=runtime
node --check scripts/cli.mjs               # sintaxe
```

O workflow `Publish npm package` roda os dois testes antes do publish: se
falharem, **o npm não publica**. Falha local = falha no CI.