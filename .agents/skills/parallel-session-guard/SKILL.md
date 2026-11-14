# Skill: Parallel Session Guard (sessões de IA no mesmo repo)

**Propósito:** evitar que múltiplas sessões (humano ou agente) sobrescrevam o
trabalho uma da outra — no projeto irmão (Thunderbolt) esse foi o modo de falha
principal: duas sessões "consertando" o mesmo launcher, uma publicando por cima
da outra, working trees sujas sendo commitadas junto.

**Leia antes de:** qualquer commit, push, bump de versão ou dispatch de publish.

---

## Git Hygiene (antes de codar)

```bash
git status                  # working tree suja? commite ou stash ANTES de começar
git log --oneline -5        # o que já mudou recentemente?
```

Se a árvore estiver suja com trabalho que não é seu, **não commite por cima**:
stash (`git stash push -m ...`) ou pergunte. Sessão que encontra trabalho
meio-feito de outra não deve "adoptá-lo" silenciosamente.

## Versionamento (nunca assuma que a versão é sua)

```bash
npm view @danhachuel/prodmaker version     # o registry é a verdade
npm view @danhachuel/prodmaker dist-tags --json
```

- Se outra sessão publicou enquanto você trabalhava, **faça rebase** e bump para
  o **próximo patch** (ex: registry em `0.1.54` → seu release é `0.1.55`).
  A versão já publicada **vence**; a sessão atrasada renumera.
- O bump é sempre duplo e canônico: `package.json`, `APP_VERSION` + `canonical`
  em `app/main.py`, `const APP_VERSION` em `scripts/cli.mjs` — com patch de dois
  dígitos (`0.1.55`, nunca `0.1.5`).

## Proibições

- **Nunca** rode duas sessões de agente no mesmo repositório ao mesmo tempo sem
  branches separadas. Se inevitável, cada uma trabalha em branch própria e o
  merge é explícito.
- **Nunca** commite working tree de outra sessão "junto" com a sua sem revisar
  o diff (`git diff --stat` antes do `git add -A`).
- **Nunca** faça `npm publish` local — só via workflow (`workflow_dispatch`
  com `dist_tag=next`, depois push da tag `vX.Y.ZZ` promovendo a `latest`).

## Rebase obrigatório antes do push

```bash
git fetch origin
git rebase origin/main        # ou merge --ff-only se não houver commits locais
git push origin main
```

## Ao encontrar trabalho alheio no disco

Se aparecerem modificações não commitadas que você não fez (ex.: a sessão
concorrente commitou por cima), **não reverta**: verifique `git log`, compare
com o registry, e só então decida (rebase/renumera). O histórico do ProdMaker
tem vários casos de sessões que publicaram o trabalho umas das outras
(0.1.44→0.1.52) — o procedimento correto sempre foi: sincronizar, testar,
renumerar, publicar.