# Instruções do Repositório ProdMaker

## Nunca abrir o navegador (REGRA ZERO)
Ao iniciar, reiniciar ou atualizar a aplicação, é proibido abrir janela ou aba do
navegador por qualquer meio (Node, Python ou sistema). O launcher apenas imprime
a URL local (http://localhost:8188) no terminal; o usuário abre manualmente.
Violação = bug crítico, corrigir antes de qualquer publicação.

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
