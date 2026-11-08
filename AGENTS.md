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
(CREATE_NO_WINDOW) e, quando precisar de grupo de processos próprio,
`detached: true` + `pythonw.exe` (subsistema GUI, sem console). O launcher só
imprime no terminal já existente (MobaXterm/CMD); o usuário nunca pode ver uma
janela preta piscar ao iniciar/rodar. Violação = bug crítico, corrigir antes de
qualquer publicação.

## 🚨 REGRA INVIOLÁVEL: ARQUITETURA DO LAUNCHER (WINDOWS/MOBAXTERM)
O launcher (`scripts/cli.mjs`) NÃO pode morrer sozinho. O MobaXterm envia sinais
espúrios (SIGINT/SIGHUP) quando a janela perde o foco ou é minimizada, e escrever
em console fechado gera EPIPE — ambos já derrubaram o app sem motivo. Por isso:
1. **Keep-Alive:** o launcher DEVE usar `setInterval(() => {}, 1000)` para se
   manter vivo no MobaXterm (Event Loop nunca esvazia).
2. **Absorção de Sinais:** os sinais `SIGINT` e `SIGHUP` DEVEM ser ignorados no
   Windows (apenas logar). O encerramento real é via comando `prodmaker stop`,
   fechamento da janela ou `taskkill`. Em Linux/macOS, CTRL+C encerra normal.
3. **Guarda da Consola:** a função `guardConsoleStream` NUNCA deve ser removida
   (absorve EPIPE e espelha os logs em `storage/logs/launcher_console.log`).
4. **Isolamento de Workers:** processos filhos DEVEM ser iniciados com
   `CREATE_NEW_PROCESS_GROUP` (0x00000200) — não herdam os sinais do terminal.
5. **Trava de regressão:** `tests/test_launcher_keepalive.py` falha se qualquer
   uma das proteções acima for removida; rodar antes de publicar (CI).

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
