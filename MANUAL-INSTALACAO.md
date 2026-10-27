# Manual de Instalação — ProdMaker

## Pré-requisitos

- **Node.js 20 ou superior** — https://nodejs.org
- **Python 3.10 ou superior** — https://python.org (marcar "Add to PATH" no Windows)
- Internet para download do pacote npm e das dependências

## Instalar

Abra o terminal (CMD, PowerShell, MobaXterm ou outro) e execute:

```bash
# Windows (CMD/MobaXterm)
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.1 install

# Linux/macOS
npx --yes @danhachuel/prodmaker@0.1.1 install
```

O que o `install` faz:

1. Cria a pasta de dados **PRODMAKER_HOME** (ordem de resolução: variável `PRODMAKER_HOME` → `C:\Users\danha\Documents\REPOSITORIO\ProdMaker` → `%USERPROFILE%\ProdMaker`).
2. Cria o storage local: `storage/{state,pages,produtos,artifacts,downloads,logs}` + `settings.json`.
3. Cria um ambiente virtual Python (`venv`) dentro do PRODMAKER_HOME e instala o `requirements.txt`.

## Executar

```bash
# Windows (CMD/MobaXterm)
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.1

# Linux/macOS
npx --yes @danhachuel/prodmaker@0.1.1
```

O terminal imprimirá:

```
┌─────────────────────────────────────────────┐
│  ProdMaker rodando em:                      │
│  >>>  http://localhost:8188  <<<            │
│  Abra esta URL MANUALMENTE no navegador.    │
└─────────────────────────────────────────────┘
```

**Abra a URL manualmente.** O ProdMaker nunca abre o navegador sozinho (REGRA ZERO).
O box de inicialização também imprime o **Código de Ativação Mestre** (default: `1234`) —
no login, use qualquer e-mail + esse código (ou digite `admin` como código).
Código customizado: variável de ambiente `PRODMAKER_MASTER_CODE`.
Se a porta 8188 estiver ocupada, o launcher usará automaticamente 8189–8199 e informará.

- Login: informe qualquer e-mail e o **Código de Ativação Mestre** impresso no terminal ao iniciar (default: `1234`; ou digite `admin`).
- Para encerrar: `Ctrl+C` no terminal.

## Diagnóstico

```bash
npx.cmd --yes @danhachuel/prodmaker@0.1.0 doctor
```

Verifica Node, Python, venv, dependências, storage, backend e porta.

## Solução de problemas

| Problema | Solução |
|---|---|
| "Python não encontrado" | Instale o Python 3.10+ e rode `prodmaker install` novamente. |
| Porta 8188 ocupada | O launcher migra para 8189–8199 automaticamente; confira a URL impressa. |
| `settings.json corrompido` | O sistema preserva a cópia em `storage/state/settings.corrupt.json` e não sobrescreve. Restaure manualmente. |
| Erro no Windows sobre scripts desabilitados | Use `npx.cmd` (CMD/MobaXterm) em vez do `npx` do PowerShell. |
| `'prodmaker' não é reconhecido` ao rodar o npx | Execute os comandos npx **fora da pasta do repositório** (ex.: `%USERPROFILE%`). Dentro da pasta do projeto, o npx prioriza o pacote local (que não tem `node_modules/.bin`). Para desenvolvimento local use `node scripts\cli.mjs` na raiz do repositório. |

## Importante

- **Nunca rode os comandos npx dentro de `C:\Users\danha\Documents\REPOSITORIO\ProdMaker`** — o npx entende que você quer executar o projeto local. Use qualquer outra pasta.
- O ProdMaker **nunca abre o navegador** (REGRA ZERO): após iniciar, abra manualmente a URL impressa no terminal.
