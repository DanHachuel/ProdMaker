/**
 * Teste de CI — Frontend Render Guard (anti "tela preta").
 *
 * Regra (ver `.agents/skills/frontend-render-guard/SKILL.md`): toda página em
 * `frontend/src/pages/` DEVE renderizar sem crash nos perfis admin e usuário,
 * com ErrorBoundary na raiz e em cada rota.
 *
 * A verificação REAL vive em `frontend/scripts/render-smoke.mjs` (sonda SSR com
 * react-dom/server, sem navegador — REGRA ZERO preservada) e roda obrigatória
 * antes de cada build do frontend. Este arquivo é o ponto de entrada em Node
 * para quem chega pela pasta tests/:
 *
 *     node tests/test_frontend_render.js      # equivale a: cd frontend && npm test
 *
 * O CI (workflow publish-npm.yml) roda a sonda no passo "Frontend render smoke
 * test (anti-tela-preta)" — se alguma página crashar, o npm NÃO é publicado.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(AQUI, "..", "frontend");

const resultado = spawnSync(process.execPath, [path.join(FRONTEND, "scripts", "render-smoke.mjs")], {
  stdio: "inherit",
  cwd: FRONTEND,
});

if (resultado.status === 0) {
  console.log("\n[tests] render-smoke: TODAS AS PÁGINAS renderizam (admin + usuário).");
  process.exit(0);
}
console.error("\n[tests] render-smoke FALHOU — uma página crasha no render (risco de tela preta).");
process.exit(resultado.status ?? 1);