#!/usr/bin/env node
/* ============================================================================
 * ProdMaker — teste de fumaça de render (sem navegador)
 * ----------------------------------------------------------------------------
 * Roda ANTES de cada build do frontend (`npm test` / `npm run build`).
 *
 * Por que existe: um import faltando (ex.: `useApp` no ApiKeys em 0.1.32) ou
 * uma expressão JSX inválida (ex.: `{produto}` solto em texto) derruba a
 * árvore inteira do React no navegador — o usuário vê a "tela preta". Esse
 * tipo de bug COMPILA normalmente no Vite e só aparece na tela.
 *
 * O que faz: renderiza TODAS as páginas em Node (react-dom/server) dentro do
 * mesmo contexto do app (AppCtx + ToastProvider + MemoryRouter), nos dois
 * perfis (admin e usuário comum), além de validar o ErrorBoundary, o mapeamento
 * das rotas e a guarda de RBAC. Qualquer falha ABORTA o build — a regressão
 * não chega ao npm.
 *
 * Não abre navegador (REGRA ZERO): renderização server-side em Node.
 * ==========================================================================*/
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(AQUI, "..");
const SRC = path.join(FRONTEND, "src");
const CACHE = path.join(FRONTEND, "node_modules", ".cache");
const BUNDLE = path.join(CACHE, "render-smoke.cjs");

const VERDE = "\x1b[32m";
const VERMELHO = "\x1b[31m";
const AMARELO = "\x1b[33m";
const RESET = "\x1b[0m";

// ---------------------------------------------------------------------------
// 1. Descobre as páginas dinamicamente (páginas novas entram no teste sozinhas)
// ---------------------------------------------------------------------------
const paginasDir = path.join(SRC, "pages");
if (!fs.existsSync(paginasDir)) {
  console.error("Pasta src/pages nao encontrada.");
  process.exit(1);
}
const arquivos = fs.readdirSync(paginasDir).filter((f) => f.endsWith(".jsx")).sort();

const importLinhas = arquivos.map((f, i) => `import * as NS${i} from "./src/pages/${f}";`);
const modulosLinha = `export const modulos = [${arquivos.map((f, i) => `["${f}", NS${i}]`).join(", ")}];`;

const entradaVirtual = [
  `export { AppCtx } from "./src/App";`,
  `export { default as ErrorBoundary } from "./src/components/ErrorBoundary";`,
  `export { default as ToastProvider } from "./src/components/Toast";`,
  `export { default as React } from "react";`,
  `export { renderToString } from "react-dom/server";`,
  `export { MemoryRouter } from "react-router-dom";`,
  ...importLinhas,
  modulosLinha,
  "",
].join("\n");

// ---------------------------------------------------------------------------
// 2. Bundla com esbuild (Node, CJS) — mesmo JSX automático do Vite
// ---------------------------------------------------------------------------
fs.mkdirSync(CACHE, { recursive: true });
try {
  await build({
    stdin: { contents: entradaVirtual, resolveDir: FRONTEND, loader: "jsx", sourcefile: "render-smoke-entry.jsx" },
    bundle: true,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    loader: { ".css": "empty" },
    outfile: BUNDLE,
    logLevel: "error",
  });
} catch (erro) {
  console.error(`${VERMELHO}[FALHOU]${RESET} nao foi possivel bundlar o app para o teste: ${erro.message}`);
  process.exit(1);
}

const { modulos, AppCtx, ErrorBoundary, ToastProvider, React, renderToString, MemoryRouter } = require(BUNDLE);

// Stubs mínimos de browser (o teste roda em Node; as páginas usam window e
// document apenas dentro de handlers, que não executam no SSR).
if (!globalThis.window) {
  globalThis.window = { location: { origin: "http://localhost:8188", href: "/", reload() {} }, confirm: () => true };
}
if (!globalThis.document) {
  globalThis.document = { documentElement: { setAttribute() {}, getAttribute: () => null } };
}
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

function ctx(role) {
  return {
    session: { authenticated: true, email: role === "admin" ? "dan.hachuel@gmail.com" : "cliente@exemplo.com", role },
    loading: false,
    version: "test",
    login: async () => {},
    logout: async () => {},
    theme: "light",
    toggleTheme: () => {},
    role,
  };
}

function renderPagina(Comp, role) {
  return renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        AppCtx.Provider,
        { value: ctx(role) },
        React.createElement(ToastProvider, null, React.createElement(Comp))
      )
    )
  );
}

// ---------------------------------------------------------------------------
// 3. Renderiza todas as páginas nos dois perfis (admin e usuario comum)
// ---------------------------------------------------------------------------
let falhas = 0;
let renders = 0;
const linhas = [];

for (const [arquivo, ns] of modulos) {
  const nome = arquivo.replace(/\.jsx$/, "");
  const alvos = [];
  if (typeof ns.default === "function") alvos.push(["default", ns.default]);
  for (const [chave, valor] of Object.entries(ns)) {
    if (chave !== "default" && typeof valor === "function" && /^[A-Z]/.test(chave)) alvos.push([chave, valor]);
  }
  if (alvos.length === 0) {
    linhas.push(`${AMARELO}SKIP${RESET}    ${nome} (sem componente renderizavel)`);
    continue;
  }
  for (const [rotulo, Comp] of alvos) {
    for (const role of ["admin", "user"]) {
      renders += 1;
      try {
        const html = renderPagina(Comp, role);
        if (html.length < 40) {
          falhas += 1;
          linhas.push(`${VERMELHO}FALHOU${RESET}  ${nome}/${rotulo} [${role}] — render quase vazio (${html.length} chars)`);
        } else {
          linhas.push(`${VERDE}OK${RESET}      ${nome}/${rotulo} [${role}] (${html.length} chars)`);
        }
      } catch (erro) {
        falhas += 1;
        const local = (erro.stack || "").split("\n").find((l) => l.includes(`at ${Comp.name || rotulo}`)) || "";
        linhas.push(
          `${VERMELHO}FALHOU${RESET}  ${nome}/${rotulo} [${role}] — ${erro.message}${local ? `\n          ${local.trim()}` : ""}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Rede de segurança: o ErrorBoundary precisa capturar e exibir a tela amigável
//    (renderToString não aciona boundaries — limitação do SSR legado; por isso
//    testamos o mecanismo: getDerivedStateFromError + render do estado de erro,
//    que é exatamente o que o React faz no cliente ao capturar um crash.)
// ---------------------------------------------------------------------------
renders += 1;
const erroProposital = new Error("falha proposital do teste");
const capturado = ErrorBoundary.getDerivedStateFromError(erroProposital);
if (capturado && capturado.erro === erroProposital) {
  linhas.push(`${VERDE}OK${RESET}      ErrorBoundary captura o crash (getDerivedStateFromError)`);
} else {
  falhas += 1;
  linhas.push(`${VERMELHO}FALHOU${RESET}  ErrorBoundary NAO capturou o crash`);
}
renders += 1;
try {
  const forcado = new ErrorBoundary({});
  forcado.state = { erro: erroProposital };
  const html = renderToString(forcado.render());
  if (html.includes("Algo deu errado nesta tela") && html.includes("Tentar novamente") && html.includes("Voltar ao Painel")) {
    linhas.push(`${VERDE}OK${RESET}      tela amigavel do ErrorBoundary renderiza (${html.length} chars)`);
  } else {
    falhas += 1;
    linhas.push(`${VERMELHO}FALHOU${RESET}  tela amigavel do ErrorBoundary incompleta (${html.length} chars)`);
  }
} catch (erro) {
  falhas += 1;
  linhas.push(`${VERMELHO}FALHOU${RESET}  tela amigavel do ErrorBoundary quebrou — ${erro.message}`);
}

// ---------------------------------------------------------------------------
// 5. Trava de regressão de roteamento (mapeamento + guarda RBAC)
// ---------------------------------------------------------------------------
const appSrc = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");
const mainSrc = fs.readFileSync(path.join(SRC, "main.jsx"), "utf8");
const ROTAS = [
  ["/", "Produtos"],
  ["/api-keys", "ApiKeys"],
  ["/configuracoes/plano", "Plano"],
  ["/tracking/vendas", "Vendas"],
  ["/hosting/paginas", "PaginasCriadas"],
];
for (const [rota, componente] of ROTAS) {
  const linha = appSrc.split("\n").find((l) => l.includes(`path="${rota}"`) && l.includes(`<${componente}`));
  if (linha) {
    linhas.push(`${VERDE}OK${RESET}      rota ${rota} -> ${componente}`);
  } else {
    falhas += 1;
    linhas.push(`${VERMELHO}FALHOU${RESET}  rota ${rota} nao mapeada para ${componente}`);
  }
}
if (appSrc.includes('role !== "admin"')) {
  linhas.push(`${VERDE}OK${RESET}      guarda RBAC (role !== "admin") presente no App.jsx`);
} else {
  falhas += 1;
  linhas.push(`${VERMELHO}FALHOU${RESET}  guarda RBAC ausente no App.jsx`);
}
if (mainSrc.includes("ErrorBoundary")) {
  linhas.push(`${VERDE}OK${RESET}      ErrorBoundary instalado na raiz (main.jsx)`);
} else {
  falhas += 1;
  linhas.push(`${VERMELHO}FALHOU${RESET}  ErrorBoundary ausente na raiz (main.jsx)`);
}

// ---------------------------------------------------------------------------
// 6. Resultado
// ---------------------------------------------------------------------------
const total = renders + ROTAS.length + 2;
console.log("");
console.log("ProdMaker — teste de fumaca de render (sem navegador)");
console.log("-".repeat(68));
for (const l of linhas) console.log("  " + l);
console.log("-".repeat(68));
console.log(`  ${total} verificacoes · ${falhas === 0 ? VERDE + "TODAS PASSARAM" + RESET : VERMELHO + falhas + " FALHARAM" + RESET}`);
console.log("");
if (falhas > 0) {
  console.error("  Um crash de render reproduz a 'tela preta' no navegador — build abortado.");
  process.exit(1);
}
