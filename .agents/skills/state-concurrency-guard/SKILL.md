# Skill: State Concurrency Guard (SQLite/JSON)

**Propósito:** evitar race conditions e corrupção de estado entre o launcher
(Node), o backend (FastAPI) e sessões paralelas — o ProdMaker é um app local
com banco SQLite e arquivos JSON de estado, ambos acessíveis por processos
diferentes ao mesmo tempo.

**Leia antes de:** qualquer alteração em `app/services/database.py`,
`app/services/store.py`, no lock de PIDs, ou em qualquer código que leia/escreva
estado compartilhado.

---

## SQLite

- Sempre use `PRAGMA journal_mode=WAL;` — leituras concorrentes não bloqueiam
  e um único escritor por vez. Sem WAL, o launcher lendo enquanto o backend
  escreve provoca `database is locked`.
- Leituras e escritas passam pelo `get_db()` de `app/services/database.py`
  (context manager que faz commit/rollback). Nunca deixe uma conexão aberta
  fora de `with`.
- Toda tabela tem `user_id` com default do UUID DEV
  (`00000000-0000-0000-0000-000000000000`) e os CRUDs filtram por ele
  (multi-tenant). Migração automática converte registros antigos (`''`).

## JSON (estado compartilhado)

- **Proibido** `fs.writeFileSync(path, json)` direto em arquivo de estado
  compartilhado (settings, lock, pid files). Se dois processos escreverem ao
  mesmo tempo, o arquivo fica truncado/corrompido e o próximo leitor quebra.
- Alternativas aceitas, em ordem de preferência:
  1. **SQLite** para anything que dois processos tocam (é o que o backend usa);
  2. **escrita atômica** quando o arquivo precisa ser JSON:
     escrever em `<arquivo>.tmp` e depois `renameSync` para o destino final
     (rename é atômico no mesmo volume) — o leitor nunca vê meio arquivo;
  3. transação (`BEGIN IMMEDIATE`) quando a leitura+escrita precisa ser uma
     seção crítica.
- O lock `storage/prodmaker.pid` segue a regra: escrito pelo launcher, lido
  pelo `stop`/`run`, **nunca** dentro de `.runtime` (que é limpo no install) e
  nunca dentro do pacote npm (que o npx apaga ao atualizar).

## O que NUNCA fazer

- Não/apagar `storage/` do usuário em updates (regra permanente do AGENTS.md).
- Não escrever estado do app dentro de `.runtime` — sobreviva à atualização
  só o que está na raiz do home.
- Não assumir que o JSON está íntegro: `JSON.parse` em leitura sempre dentro
  de `try/catch` com fallback (lock corrompido nunca pode impedir o arranque).

## Verificação

A estrutura do teste vive em `tests/test_state_concurrency.py` (placeholder
documentado). Novas regras de concorrência entram lá antes de consideradas
prontas:

```bash
python tests/test_state_concurrency.py
```