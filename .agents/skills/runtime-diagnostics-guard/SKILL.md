# Skill: Runtime Diagnostics Guard (nada morre em silêncio)

**Propósito:** garantir que, se algo falhar no futuro, a causa exata esteja
registrada em arquivo — não em mortes silenciosas. Cada bug de "app morreu sem
explicação" já custou horas; estes logs são a rede de segurança.

**Leia antes de:** debugar qualquer problema de "o app morreu", "não subiu",
"tela preta" ou "janela apareceu".

---

## Onde está a prova

| Arquivo | O que contém | Quem escreve |
|---|---|---|
| `storage/logs/crash.log` | **Código de saída + stack** de cada saída do launcher Node (`process.on('exit')`) | `scripts/cli.mjs` |
| `storage/logs/launcher-debug.log` | Eventos do launcher: início, spawn do daemon, sinais recebidos, ABSORVIDO, kills, holds ativos, watchdog (sobrescrito a cada start) | `scripts/cli.mjs` |
| `storage/logs/launcher_console.log` | Espelho de tudo que foi ao terminal (sobrevive a EPIPE) | `guardConsoleStream` |
| `storage/logs/app.log` | Logs do backend Python: startup, **erros reais** (ERROR), exceções não tratadas (excepthook) | FastAPI/uvicorn |

Todos ficam na **raiz** do `PRODMAKER_HOME/storage/logs/` — nunca em `.runtime`.

## Regras permanentes

1. **Crash log:** o launcher DEVE gravar código de saída e `new Error().stack`
   em `crash.log` se `process.exit()` for chamado — mesmo que o terminal já
   tenha morrido (por isso escreve no **arquivo**, não no console).
2. **App log:** o FastAPI grava em `app.log` com `access_log=False` no uvicorn
   (navegar não polui o terminal) — o ciclo de vida e os **erros reais**
   continuam saindo. A ausência de ruído de acesso é intencional.
3. **Sinais do Python:** o `app/main.py` DEVE ter `SetConsoleCtrlHandler`
   configurado para ignorar `CTRL_C_EVENT` no Windows (função
   `_ignorar_ctrl_windows`) — sinal fantasma do MobaXterm não pode matar o
   servidor.
4. **Timeout em spawnSync:** qualquer `spawnSync` do launcher (ex.:
   `fetchMasterCode`) tem `timeout` — spawn sem limite pendura o launcher.

## Procedimento de diagnóstico (antes de qualquer chute)

```bash
# 1. quem matou o processo?
tail -20 storage/logs/crash.log

# 2. o que o launcher viu? (sinais, daemon, portas)
cat storage/logs/launcher-debug.log

# 3. o backend falhou como?
tail -30 storage/logs/app.log

# 4. estado atual dos processos
node scripts/cli.mjs doctor
```

## Regra de ouro

**Nunca** debugue "app morreu" sem antes ler o fim de `crash.log` e
`launcher-debug.log`. Se eles não explicam, o próximo passo é **adicionar log**,
não adivinhar. E nenhuma correção de "morreu" é considerada pronta sem um teste
em `tests/test_launcher_keepalive.py` que a trave.