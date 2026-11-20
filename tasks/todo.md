# Plano — HOTFIX 0.1.58: fim do "encerra sozinho" (ignorando o npx)

Data: 2026-11-20 · Base: 0.1.57 (d81b948)

## Contexto
O app volta ao `PS C:\...>` logo após imprimir "UI servida por este launcher...".
 com `http.listen` ativo e sem `process.exit()` no fluxo de sucesso (auditado
 na 0.1.57). Hipótese do usuário: o `npx` (script Node) encerra e leva a árvore
 inteira. Solução: eliminar o npx do dia a dia + cinto de segurança extra.

## Itens verificáveis
- [ ] 1. `install` copia `scripts/cli.mjs` para o `.runtime` (RUNTIME_ITENS)
- [ ] 2. `install` gera `PRODMAKER_HOME/prodmaker.cmd` chamando
      `node "%~dp0.runtime\scripts\cli.mjs" %*` (bypass do npx)
- [ ] 3. `doctor` reporta o caminho do `prodmaker.cmd`
- [ ] 4. Referência global do keep-alive: `global.meuKeepAlive = setInterval(...)` sem `.unref()`
- [ ] 5. `server.on('close')` no servidor de UI: loga alerta, NUNCA dá exit
- [ ] 6. Absorção de sinais (SIGINT/SIGHUP/SIGTERM, só log) movida para o TOPO do arquivo
- [ ] 7. Zero `process.exit()` no fluxo de sucesso do `run` (auditoria final)
- [ ] 8. Testes de CI ampliados (travar 1,2,4,5,6) — suíte verde
- [ ] 9. Teste funcional: install gera o .cmd; `prodmaker.cmd run` sobe e
      sobrevive 60s; `prodmaker.cmd stop` encerra; npx continua funcionando
- [ ] 10. Bump 0.1.58 + CHANGELOG + commit + push + publish (workflow) + tag
- [ ] 11. Registro em tasks/lessons.md

## Comandos de release
```
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.58 install
# novo (sem npx):
C:\Users\danha\Documents\REPOSITORIO\ProdMaker\prodmaker.cmd run
C:\Users\danha\Documents\REPOSITORIO\ProdMaker\prodmaker.cmd stop
```