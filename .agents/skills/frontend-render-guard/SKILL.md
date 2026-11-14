# Skill: Frontend Render Guard (anti "tela preta")

**Propósito:** impedir a tela preta no React causada por crashes de renderização
— o bug que derrubou a aba Chaves de API por 10 versões porque um import
faltante (`useApp`) **compila normalmente** no Vite e só estoura no navegador.

**Leia antes de:** qualquer alteração em `frontend/src/`, no build, ou ao
adicionar uma página nova.

---

## A Sonda SSR é obrigatória

Toda página em `frontend/src/pages/` **DEVE** ser renderizada com sucesso pelo
`frontend/scripts/render-smoke.mjs`, que usa `react-dom/server` em Node (sem
navegador — REGRA ZERO preservada) dentro do contexto real do app
(`AppCtx` + `ToastProvider` + `MemoryRouter`), nos **dois perfis**: `admin` e
`user`. A descoberta das páginas é dinâmica (`src/pages/*.jsx`) — página nova
entra no teste sozinha.

```bash
cd frontend && npm test        # ou npm run build (o teste roda antes)
```

O `build` do frontend é `node scripts/render-smoke.mjs && vite build`: se
qualquer página crashar, **o build aborta**. O workflow de publish também roda
o teste — regressão não chega ao npm.

## ErrorBoundary

O componente `ErrorBoundary` (classe, com `getDerivedStateFromError`) existe em
`frontend/src/components/ErrorBoundary.jsx` e é instalado em **dois lugares**:

1. na raiz (`frontend/src/main.jsx`, envolvendo `<App/>`);
2. em **cada rota** (`<Pagina>` no `App.jsx`).

Um crash em uma página mostra a tela amigável ("Algo deu errado nesta tela") com
o erro e os botões *Tentar novamente / Recarregar / Voltar ao Painel* — nunca
mais a página vazia. O boundary é testado pela sonda
(`getDerivedStateFromError` + render do estado de erro).

## Optional chaining e dados da API

- Use `?.` em **todos** os acessos a dados de API: `settings?.api_keys`,
  `result?.repo_url`, `publishInfo?.result?.path`. Campo ausente não pode
  quebrar a renderização.
- Toda chamada de API em página tem estado de `loading` e `try/catch`
  distinguindo **401** (sessão expirada → aviso + "Sair e entrar novamente"),
  **403** (RBAC → "Acesso restrito ao Super Admin") e falha de rede
  (retry + dica de log). `api.js` anexa `err.status` ao `Error` das respostas
  não-OK justamente para isso.

## Rotas

Rotas admin (`/api-keys`, `/configuracoes/plano`) são mapeadas para os
componentes corretos **dentro** do guard de RBAC (`role !== "admin"` no
`App.jsx`). A sonda valida o mapeamento dessas rotas.

## Proibido

- Não criar página sem passar pela sonda (rodar `npm test` antes do commit).
- Não remover o `ErrorBoundary` da raiz nem do wrapper de rotas.
- Não acessar `window`/`document` no corpo do módulo (só dentro de handlers) —
  a sonda roda em Node, onde esses objetos não existem (a sonda injeta stubs,
  mas código de render não deve depender deles).