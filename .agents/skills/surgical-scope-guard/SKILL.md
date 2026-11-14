# Skill: Surgical Scope Guard (escopo cirúrgico)

**Propósito:** impedir refatorações não solicitadas e alterações em infraestrutura
crítica. No Thunderbolt, a maioria das regressões graves veio de sessões que
"aproveitaram" para renomear variáveis, limpar imports ou reformatar arquivos
inteiros enquanto corrigiam um bug pequeno — e quebraram outra coisa.

**Leia antes de:** qualquer tarefa, especialmente hotfix ("só muda duas linhas").

---

## A Regra do Menor Arquivo Possível

- Tarefa de **UI** → mexa só em `frontend/src/**`. Não toque em backend, no
  launcher ou no `package.json`.
- Tarefa de **backend** → mexa só em `app/**`. Não toque no launcher.
- Tarefa de **launcher** → mexa só em `scripts/cli.mjs` (e nos testes dele).
- Documentação/config → só os arquivos docs/ afetados.

## Proibição de Refatoração

- **Não** renomeie variáveis/funções que não são a causa do bug.
- **Não** limpe imports "não usados" de arquivos que você está corrigindo
  (import morto Some vezes é rede de segurança de próxima mudança).
- **Não** reformate arquivos inteiros (mudar quebra de linha, indentação,
  ordenar chaves de JSON) — o diff vira ruído e a revisão impossível.
- Altere **apenas as linhas estritamente necessárias** à tarefa. Se você quer
  melhorar código adjacente, é outra tarefa (outro commit, outra versão).

## Arquivos Sensíveis (não alterar sem autorização explícita)

| Arquivo | Por que |
|---|---|
| `scripts/cli.mjs` | Arquitetura do launcher (sinais, daemon, portas, lock) — ver skill `launcher-architecture-guard` |
| `package.json` | Versão/bin/scripts — mexe nele só em bump de release |
| `vite.config.js` / `frontend/package.json` | Build do frontend |
| `frontend/scripts/render-smoke.mjs` | A sonda anti-tela-preta |
| `app/main.py` | Entry point: shutdown lock, lifespan, telemetria, versão |
| `.github/workflows/publish-npm.yml` | Esteira de publicação |
| `app/core/shutdown.py` | Trava global de shutdown |
| `app/services/database.py` | Schema/migrações do SQLite |
| `tests/test_launcher_keepalive.py` | Trava de regressão do launcher |
| `.agents/skills/**` | Estas regras |

## Como proceder

1. Leia o arquivo **inteiro** antes de editar (ou a seção inteira afetada).
2. Faça o diff mínimo: `git diff` revisado antes do commit.
3. Se a tarefa *exigir* mudar arquivo sensível, deixe isso **explícito** no
   commit e no relatório ("ALTERADO: scripts/cli.mjs — absorção de sinais").
4. Nunca apague arquivo de teste ou de diagnóstico para "limpar".

## Verificação

```bash
git diff --stat        # esperado: poucos arquivos, poucas linhas
git diff               # leia TUDO antes de commitar
```