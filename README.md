# ProdMaker

🚀 **SaaS local para criação de infoprodutos low-ticket, landing pages, campanhas de tráfego e tracking** — baseado no sistema AdsX, executado no seu computador via `npx` e acessado manualmente no navegador.

> ⚠️ **REGRA ZERO:** o ProdMaker **nunca abre o navegador**. Ao iniciar, ele apenas imprime a URL (`http://localhost:8188`) no terminal — você abre manualmente.

## Instalação

```bash
# CMD/MobaXterm (Windows)
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.1 install
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.1

# Linux/macOS/PowerShell
npx --yes @danhachuel/prodmaker@0.1.1 install
npx --yes @danhachuel/prodmaker@0.1.1
```

1. `install` cria a pasta de dados (`PRODMAKER_HOME`), o storage local e instala as dependências Python.
2. O segundo comando inicia o servidor em `http://localhost:8188` e imprime a URL no terminal.
3. **Abra a URL manualmente no navegador**, faça login (e-mail + código de ativação) e acesse o painel.

## O que está incluído (0.1.01 — Parte 2: Frontend)

| Área | Estado |
|---|---|
| Launcher npm (`install` / `run` / `doctor`) | ✅ |
| Backend FastAPI (auth local, settings, health) | ✅ |
| Storage persistente local (fora do cache npm) | ✅ |
| Seeds de negócio (prompts, negativas, defaults, decisão, checklist) | ✅ |
| `/legal` (index, privacidade LGPD, termos) | ✅ |
| Workflow de publicação NPM via GitHub Actions | ✅ |
| Frontend React + Vite + Tailwind (login + painel AdsX) | ✅ |
| Seus Produtos (CRUD real: análise → aprovação) | ✅ |
| Tema claro/escuro | ✅ |

## Estrutura

Consulte o [Planejamento Único](./PRODMAKER%20—%20PLANEJAMENTO%20ÚNICO%20E%20COMPLETO.md) para a visão completa (arquitetura, UI AdsX, módulos, fases e regras), o [Manual de Instalação](./MANUAL-INSTALACAO.md) e as [Regras do Repositório](./AGENTS.md).

## Licença

MIT — ver [LICENSE](./LICENSE) e [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES.md).
