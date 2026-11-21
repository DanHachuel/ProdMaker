# Plano — HOTFIX 0.1.58: fim do "encerra sozinho" (ignorando o npx) — CONCLUÍDO

Data: 2026-11-20 · Base: 0.1.57 (d81b948) → Release: **0.1.58** (5f74f72, tag v0.1.58)

## Itens verificáveis — todos concluídos
- [x] 1. `install` copia `scripts/cli.mjs` para o `.runtime` (RUNTIME_ITENS)
- [x] 2. `install` gera `PRODMAKER_HOME/prodmaker.cmd` chamando
      `node "%~dp0.runtime\scripts\cli.mjs" %*` (bypass do npx)
- [x] 3. `doctor` reporta o caminho do `prodmaker.cmd`
- [x] 4. Referência global do keep-alive: `global.meuKeepAlive = setInterval(...)` sem `.unref()`
- [x] 5. `server.on('close')` no servidor de UI: loga alerta no crash.log, NUNCA dá exit
- [x] 6. Absorção de sinais (SIGINT/SIGHUP/SIGTERM, só log) movida para o TOPO do arquivo
- [x] 7. Zero `process.exit()` no fluxo de sucesso do `run` (auditoria: só exit(1) em falhas)
- [x] 8. Testes de CI ampliados — **25/25** verdes (+ runtime 5/5)
- [x] 9. Teste funcional: install gera o .cmd; `prodmaker.cmd run` sobe e
      sobrevive 25s+ **sem npx**; `prodmaker.cmd stop` encerra; doctor ok
- [x] 10. Bump 0.1.58 + CHANGELOG + commit + push + publish (workflow) + tag v0.1.58
- [x] 11. Registro em tasks/lessons.md

## Revisão (o que foi provado)
- Install copiou: `app, frontend/dist, scripts/cli.mjs, seed, legal,
  requirements.txt, package.json` e gerou o `.cmd` com o conteúdo correto.
- `prodmaker.cmd run` (via `cmd /c`, **sem npx**): launcher Node vivo com
  `.runtime\scripts\cli.mjs`, servidor servindo `{"ok":true,"version":"0.1.57"}`.
- 25s de vigília: launcher **ainda vivo** — o sintoma não ocorreu sem o npx.
- `prodmaker.cmd stop`: launcher + daemon mortos, portas 8188/8189 livres.
- Nota honesta: o health imediato (0-40s) falhou no teste porque a UI só abre o
  socket depois do waitReady do daemon (~boot do FastAPI); aos 25s já servia.
  Não é regra — é ordem do fluxo (spawn → waitReady → listen → box).

## Comandos para o usuário
```bash
# instalar uma vez (pode ser via npx)
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.58 install

# dia a dia — SEM npx, direto no atalho gerado:
C:\Users\danha\Documents\REPOSITORIO\ProdMaker\prodmaker.cmd run
C:\\Users\\danha\\Documents\\REPOSITORIO\\ProdMaker\\prodmaker.cmd stop
```