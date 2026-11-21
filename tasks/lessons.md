# Lições (auto-correção) — ProdMaker

Registro de padrões após correções do usuário. Revisar no início de cada sessão.

## 2026-11-20 — "encerra sozinho": a causa era o npx, não o código
- **Sintoma:** terminal voltava ao `PS C:\...>` com `http.listen` ativo e sem
  `process.exit()` no código. 6 versões de "travas" (setInterval/Promise/
  readline/sinais/keepalive global) não resolviam.
- **Lição:** quando o processo está tecnicamente correto e ainda morre, o
  assassino está **fora** do processo. O `npx` é um wrapper Node: quando ele
  decide encerrar, leva a árvore. Auditoria de dentro não acha culpado de fora.
- **Regra para mim:** antes de adicionar outra "trava", verificar a árvore do
  processo (`Get-CimInstance Win32_Process` + ParentProcessId) e o que o wrapper
  (npx/pm2/serviço) faz com o filho.
- **Solução que funcionou:** sair do wrapper — `prodmaker.cmd` chamando o Node
  direto no launcher copiado dentro do `.runtime`.

## 2026-11-20 — matar por substring de porta/netstat
- **Erro:** `findstr :8188` casa com `:81880`, `:18188`, `:81889` — matei
  processos inocentes de outros projetos (a máquina roda PandaNews e
  Thunderbolt).
- **Regra:** match de porta sempre com fronteira de campo (`:8188\s`), e só
  matar processo com **prova de posse** (linha de comando com nosso
  home/.runtime/pacote) — nunca um entry point genérico (`-m app.main`).

## 2026-11-20 — mojibake em edições
- O repo tem arquivos com UTF-8 duplo-codificado em comentários; `edit` falha
  silenciosamente no match.
- **Regra:** quando o `edit` falhar duas vezes, trocar o trecho por PowerShell
  (`ReadAllLines`/`WriteAllLines` com UTF8) ou usar um `oldString` sem acentos.

## 2026-11-20 — testes com `$home`/`$pid` no PowerShell
- `$home`, `$pid`, `$PID` são variáveis **somente-leitura** do PowerShell; a
  atribuição falha silenciosamente e o teste roda contra o valor automático
  (`C:\Users\danha`). Perdi 2 depurações com isso.
- **Regra:** nos scripts de teste usar `$testHome`, `$procId`.