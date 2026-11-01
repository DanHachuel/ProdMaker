# ProdMaker

???? **SaaS local para cria????o de infoprodutos low-ticket, landing pages, campanhas de tr??fego e tracking** ??? baseado no sistema AdsX, executado no seu computador via `npx` e acessado manualmente no navegador.

> ?????? **REGRA ZERO:** o ProdMaker **nunca abre o navegador**. Ao iniciar, ele apenas imprime a URL (`http://localhost:8188`) no terminal ??? voc?? abre manualmente.

## Instala????o

```bash
# CMD/MobaXterm (Windows) ??? fora da pasta do reposit??rio
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.17 install
npx.cmd --yes --prefer-online @danhachuel/prodmaker@0.1.17

# Linux/macOS/PowerShell
npx --yes @danhachuel/prodmaker@0.1.17 install
npx --yes @danhachuel/prodmaker@0.1.17
```

1. `install` cria a pasta de dados (`PRODMAKER_HOME`), o storage local e instala as depend??ncias Python.
2. O segundo comando inicia o servidor em `http://localhost:8188` e imprime a URL no terminal.
3. **Abra a URL manualmente no navegador**, fa??a login (qualquer e-mail + o **C??digo de Ativa????o Mestre** impresso no terminal ??? default `1234` ??? ou `admin`) e acesse o painel.

## Se o servidor fechar sozinho no Windows

Se o terminal voltar para o prompt sem manter o servidor (ou travar), rode manualmente
para ver o traceback completo:

```bash
# dentro da pasta do ProdMaker (PRODMAKER_HOME)
.\venv\Scripts\python.exe -m app.main
```

O comando acima sobe o servidor na porta 8188 com o log completo no terminal. O launcher
tamb??m passou a diagnosticar encerramento imediato (menos de 3 segundos) imprimindo essa
mesma instru????o. Se o banco local estiver corrompido, o sistema faz backup autom??tico
(`prodmaker.db.corrupt-*`) e recria ??? o servidor n??o cai mais na inicializa????o.

## O que est?? inclu??do (0.1.01 ??? Parte 2: Frontend)

| ??rea | Estado |
|---|---|
| Launcher npm (`install` / `run` / `doctor`) | ??? |
| Backend FastAPI (auth local, settings, health) | ??? |
| Storage persistente local (fora do cache npm) | ??? |
| Seeds de neg??cio (prompts, negativas, defaults, decis??o, checklist) | ??? |
| `/legal` (index, privacidade LGPD, termos) | ??? |
| Workflow de publica????o NPM via GitHub Actions | ??? |
| Frontend React + Vite + Tailwind (login + painel AdsX) | ??? |
| Seus Produtos (CRUD real: an??lise ??? aprova????o) | ??? |
| Tema claro/escuro | ??? |

## Estrutura

Consulte o [Planejamento ??nico](./PRODMAKER%20???%20PLANEJAMENTO%20??NICO%20E%20COMPLETO.md) para a vis??o completa (arquitetura, UI AdsX, m??dulos, fases e regras), o [Manual de Instala????o](./MANUAL-INSTALACAO.md) e as [Regras do Reposit??rio](./AGENTS.md).

## Licen??a

MIT ??? ver [LICENSE](./LICENSE) e [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES.md).

