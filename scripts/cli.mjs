#!/usr/bin/env node
/* ProdMaker launcher — install | run | doctor
 * REGRA ZERO: este launcher NUNCA abre o navegador. Apenas imprime a URL.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(PKG_ROOT, "app");
const REQUIREMENTS = path.join(PKG_ROOT, "requirements.txt");
const APP_VERSION = "0.1.30";
const DEFAULT_PORT = 8188;

const STORAGE_FOLDERS = ["state", "pages", "produtos", "artifacts", "downloads", "logs"];
const DESIGNATED_HOME = "C:\\Users\\danha\\Documents\\REPOSITORIO\\ProdMaker";

const DEFAULT_SETTINGS = {
  schema: 1,
  port: DEFAULT_PORT,
  language: "pt-BR",
  theme: "light",
  api_keys: {},
  llm: { providers: [] },
};

function resolveHome() {
  if (process.env.PRODMAKER_HOME) return path.resolve(process.env.PRODMAKER_HOME);
  try {
    if (fs.existsSync(DESIGNATED_HOME)) return path.resolve(DESIGNATED_HOME);
  } catch {}
  return path.join(os.homedir(), "ProdMaker");
}

function storagePath(home, ...parts) {
  return path.join(home, "storage", ...parts);
}

function ensureInstallSkeleton(home) {
  fs.mkdirSync(home, { recursive: true });
  for (const folder of STORAGE_FOLDERS) {
    fs.mkdirSync(storagePath(home, folder), { recursive: true });
  }
  const settingsPath = storagePath(home, "state", "settings.json");
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
  }
  return settingsPath;
}

function findSystemPython() {
  const candidates =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, process.platform === "win32" && candidate === "py" ? ["-3", "--version"] : ["--version"], {
        encoding: "utf8",
        shell: process.platform === "win32",
        windowsHide: true,
      });
      if (result.status === 0) return candidate;
    } catch {}
  }
  return null;
}

function venvPython(home) {
  const exe = process.platform === "win32" ? "Scripts\\python.exe" : "bin/python";
  const candidate = path.join(home, "venv", ...exe.split(/[\\/]/));
  return fs.existsSync(candidate) ? candidate : null;
}

function printUrlBox(port, masterCode) {
  const url = `http://localhost:${port}`;
  const line = (text) => `|  ${text}${" ".repeat(Math.max(0, 43 - text.length))}|`;
  console.log("");
  console.log("+" + "-".repeat(45) + "+");
  console.log(line("ProdMaker rodando em:"));
  console.log(line(`>>>  ${url}`));
  console.log(line("Abra esta URL MANUALMENTE no navegador."));
  console.log(line(""));
  console.log(line(`CODIGO DE ATIVACAO: ${masterCode}`));
  console.log(line("Login: qualquer e-mail + este codigo"));
  console.log(line('(ou digite "admin" como codigo)'));
  console.log("+" + "-".repeat(45) + "+");
  console.log("");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort(preferred) {
  for (let port = preferred; port <= preferred + 11; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

// Espera o servidor realmente OUVIR antes de mostrar a URL: sem isso o usuário
// abria http://localhost:8188 durante o boot do Python e via "Failed to fetch"
// (ou ERR_CONNECTION_REFUSED em rota SPA como /api-keys).
async function waitReady(port, timeoutMs = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function runCommand(cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    // windowsHide: pip/venv nunca devem pular uma janela de CMD no Windows.
    windowsHide: true,
    ...options,
  });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}

async function fetchMasterCode(python, home) {
  if (python) {
    try {
      const result = spawnSync(python, ["-c", "from app.services.store import get_master_code; print(get_master_code())"], {
        cwd: PKG_ROOT,
        encoding: "utf8",
        env: { ...process.env, PRODMAKER_HOME: home },
        windowsHide: true,
      });
      const value = (result.stdout || "").trim().split(/\r?\n/).pop() || "";
      if (result.status === 0 && value) return value;
    } catch {}
  }
  return (process.env.PRODMAKER_MASTER_CODE || "").trim() || "1234";
}

// ---------------------------------------------------------------------------
// Verificação inteligente de dependências
// ---------------------------------------------------------------------------

function normalizeName(name) {
  return name.toLowerCase().replace(/[_.]+/g, "-");
}

function parseRequirements() {
  if (!fs.existsSync(REQUIREMENTS)) return [];
  const text = fs.readFileSync(REQUIREMENTS, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*((==|>=|<=|!=|>|<|~=)\s*([0-9][0-9A-Za-z.\-+]*))?\s*$/);
      if (!match) return null;
      return {
        name: normalizeName(match[1]),
        raw: line,
        comparator: match[3] === "~=" ? ">=" : match[3] || null,
        version: match[5] || null,
      };
    })
    .filter(Boolean);
}

function pipFreeze(python) {
  const result = spawnSync(python, ["-m", "pip", "list", "--format=freeze", "--disable-pip-version-check"], {
    encoding: "utf8",
  });
  const installed = new Map();
  for (const line of (result.stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("-")) continue;
    const match = trimmed.match(/^(.+?)==(.+)$/);
    if (match) installed.set(normalizeName(match[1].split("[")[0]), match[2]);
  }
  return installed;
}

function cmpVersions(a, b) {
  const pa = String(a).split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function satisfies(installed, comparator, version) {
  const c = cmpVersions(installed, version);
  switch (comparator) {
    case "==": return c === 0;
    case ">=": return c >= 0;
    case "<=": return c <= 0;
    case ">": return c > 0;
    case "<": return c < 0;
    case "!=": return c !== 0;
    default: return true;
  }
}

function venvSitePackages(venvDir) {
  const direct = path.join(venvDir, "Lib", "site-packages");
  if (fs.existsSync(direct)) return direct;
  if (fs.existsSync(venvDir)) {
    const libDir = path.join(venvDir, "lib");
    if (fs.existsSync(libDir)) {
      try {
        const entry = fs.readdirSync(libDir, { withFileTypes: true }).find((d) => d.isDirectory() && d.name.startsWith("python"));
        if (entry) {
          const candidate = path.join(libDir, entry.name, "site-packages");
          if (fs.existsSync(candidate)) return candidate;
        }
      } catch {}
    }
  }
  return null;
}

function countDistInfo(venvDir) {
  const site = venvSitePackages(venvDir);
  if (!site) return -1;
  try {
    return fs.readdirSync(site).filter((entry) => entry.endsWith(".dist-info")).length;
  } catch {
    return -1;
  }
}

function hashRequirements() {
  if (!fs.existsSync(REQUIREMENTS)) return "none";
  return crypto.createHash("sha256").update(fs.readFileSync(REQUIREMENTS)).digest("hex");
}

function readEnvState(home) {
  try {
    const statePath = storagePath(home, "venv_state.json");
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function writeEnvState(home, reqHash, distCount) {
  try {
    const statePath = storagePath(home, "venv_state.json");
    fs.writeFileSync(statePath, JSON.stringify({ reqHash, distCount, checkedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {}
}

async function ensurePythonDeps(home, python) {
  const reqs = parseRequirements();
  if (reqs.length === 0) {
    console.log("(requirements.txt ausente ou vazio — nada a instalar)");
    return;
  }
  const reqHash = hashRequirements();
  const distCount = countDistInfo(path.join(home, "venv"));
  const state = readEnvState(home);

  // Cache: requirements inalterado E número de pacotes no venv inalterado
  if (state && state.reqHash === reqHash && state.distCount === distCount) {
    console.log("[✓] Dependências já instaladas e atualizadas. Ignorando pip install.");
    return;
  }

  const installed = pipFreeze(python);
  const missing = reqs.filter((req) => {
    const version = installed.get(req.name);
    if (!version) return true;
    return req.comparator ? !satisfies(version, req.comparator, req.version) : false;
  });

  if (missing.length === 0) {
    writeEnvState(home, reqHash, distCount);
    console.log("[✓] Dependências já instaladas e atualizadas. Ignorando pip install.");
    return;
  }

  console.log(`Instalando apenas o que falta (${missing.length}): ${missing.map((m) => m.name).join(", ")}...`);
  const targets = missing.map((m) => m.raw);
  let code = await runCommand(python, ["-m", "pip", "install", ...targets, "-q", "--no-input", "--disable-pip-version-check"]);
  if (code !== 0) {
    console.log("Retentando após atualizar o pip...");
    await runCommand(python, ["-m", "pip", "install", "--upgrade", "pip", "-q"]);
    code = await runCommand(python, ["-m", "pip", "install", ...targets, "-q", "--no-input", "--disable-pip-version-check"]);
  }
  if (code !== 0) {
    console.error("Falha ao instalar dependências Python.");
    process.exit(1);
  }
  writeEnvState(home, reqHash, countDistInfo(path.join(home, "venv")));
  console.log("[✓] Dependências instaladas.");
}

async function commandInstall(flags) {
  const home = resolveHome();
  console.log(`ProdMaker ${APP_VERSION} — install`);
  console.log(`Pasta de dados (PRODMAKER_HOME): ${home}`);
  const settingsPath = ensureInstallSkeleton(home);
  console.log(`Storage pronto. Settings: ${settingsPath}`);

  if (flags.skipPythonDeps) {
    console.log(" (--skip-python-deps) Dependências Python ignoradas.");
  } else {
    const base = findSystemPython();
    if (!base) {
      console.error("Python 3.10+ não encontrado. Instale o Python e rode 'prodmaker install' novamente.");
      process.exit(1);
    }
    const venvDir = path.join(home, "venv");
    if (!venvPython(home)) {
      console.log("Criando ambiente virtual Python...");
      const venvArgs = process.platform === "win32" && base === "py" ? ["-3", "-m", "venv", venvDir] : ["-m", "venv", venvDir];
      const code = await runCommand(base, venvArgs);
      if (code !== 0) {
        console.error("Falha ao criar o venv.");
        process.exit(1);
      }
    }
    await ensurePythonDeps(home, venvPython(home));
  }

  console.log("");
  console.log("Instalação concluída. Para iniciar:");
  console.log("  npx --yes @danhachuel/prodmaker");
  console.log("Depois abra http://localhost:8188 MANUALMENTE no navegador (o sistema nunca abre o navegador).");
}

async function commandRun() {
  const home = resolveHome();
  const settingsPath = storagePath(home, "state", "settings.json");
  if (!fs.existsSync(settingsPath)) {
    console.error("ProdMaker ainda não está instalado. Rode primeiro: prodmaker install");
    process.exit(1);
  }
  let preferred = DEFAULT_PORT;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (Number.isInteger(settings.port)) preferred = settings.port;
  } catch {}

  const python = venvPython(home) || findSystemPython();
  if (!python) {
    console.error("Python não encontrado. Rode: prodmaker install");
    process.exit(1);
  }
  if (!fs.existsSync(path.join(APP_DIR, "main.py"))) {
    console.error("Backend não encontrado (app/main.py).");
    process.exit(1);
  }

  const port = await pickPort(preferred);
  if (!port) {
    console.error(`Nenhuma porta disponível entre ${preferred} e ${preferred + 11}.`);
    process.exit(1);
  }
  if (port !== preferred) console.log(`Porta ${preferred} ocupada — usando ${port}.`);

  // Spawn via `python -m app.main` (próprio entry point): permite log persistente
  // em storage/logs/app.log e captura de exceções fatais.
  const pythonArgs =
    venvPython(home)
      ? ["-m", "app.main"]
      : process.platform === "win32" && python === "py"
        ? ["-3", "-m", "app.main"]
        : ["-m", "app.main"];

  console.log("Iniciando ProdMaker...");
  const masterCode = await fetchMasterCode(python, home);
  // A URL só é impressa DEPOIS de o servidor estar ouvindo (ver waitReady no
  // spawn). Imprimir a caixa de URL antes causava "Failed to fetch" e
  // ERR_CONNECTION_REFUSED no navegador durante o boot (2-5s de import do
  // FastAPI + abertura do SQLite): o usuário abria o site e nada respondia.

  // PYTHONUNBUFFERED: com stdio em pipe o Python faria buffer de bloco em stdout,
  // atrasando os logs no proxy/MobaXterm. unbuffered = logs em tempo real.
  const env = { ...process.env, PRODMAKER_HOME: home, PRODMAKER_PORT: String(port), PYTHONUNBUFFERED: "1" };

  // SUPERVISOR: se o processo do servidor morrer (sinal do terminal, quirk de
  // MobaXterm/Cygwin, crash), o launcher reinicia — até 3 tentativas com
  // backoff de 2s. Se morrer 3 vezes seguidas, sai com diagnóstico.
  const MAX_RESTARTS = 3;
  let restarts = 0;
  let currentChild = null;
  let stopping = false;
  let lastStart = Date.now();

  // PARADA FORÇADA (trava de Ctrl+C): mata o processo Python sem dar tempo dele
  // de imprimir traceback (KeyboardInterrupt/CancelledError) — o terminal volta
  // ao prompt instantaneamente.
  const matarAgora = (code) => {
    stopping = true;
    try {
      if (currentChild?.pid && process.platform === "win32") {
        spawn("taskkill", ["/F", "/T", "/PID", String(currentChild.pid)], { stdio: "ignore", shell: false, windowsHide: true });
      } else if (currentChild?.pid) {
        currentChild.kill("SIGKILL");
      }
    } catch {}
    process.exit(code ?? 0);
  };

  process.on("SIGINT", () => matarAgora(0));
  process.on("SIGTERM", () => matarAgora(0));
  // SIGHUP (terminal que fecha/detacha no Windows/MobaXterm): NÃO matar o servidor —
  // ignorar o sinal e seguir supervisionando.
  process.on("SIGHUP", () => {});

  // Sem heartbeat no terminal: após subir, o terminal fica ESTÁTICO (nenhuma
  // mensagem periódica). O monitoramento de vida já existe — silencioso — em
  // storage/logs/app.log (uvicorn registra cada requisição e o ciclo de vida
  // do servidor) e o supervisor reinicia o processo em quedas reais.

  const startServer = () =>
    new Promise((resolve) => {
      lastStart = Date.now();
      currentChild = spawn(python, pythonArgs, {
        cwd: PKG_ROOT,
        stdio: ["inherit", "pipe", "pipe"],
        env,
        shell: false,
        windowsHide: true,
      });

      // Proxy de logs: o Python NÃO imprime mais direto no terminal (stdio em pipe).
      // Sem handles de console de saída herdados, o Windows NÃO aloca a janela preta
      // de CMD (causa raiz no MobaXterm, que não herda console corretamente com
      // stdio:'inherit'). O Node repassa stdout/stderr do filho para o terminal atual.
      // Durante o encerramento (stopping) os chunks continuam sendo DRENADOS, mas não
      // são repassados — garante Ctrl+C 100% silencioso.
      currentChild.stdout?.on("data", (chunk) => {
        if (!stopping) process.stdout.write(chunk);
      });
      currentChild.stderr?.on("data", (chunk) => {
        if (!stopping) process.stderr.write(chunk);
      });

      currentChild.on("error", (error) => {
        console.error(`Falha ao iniciar o Python (${error.message}).`);
        resolve({ code: 1 });
      });

      // Saída EXPLÍCITA do filho (além do 'close'): código + sinal + caminho do
      // log. Um retorno misterioso ao prompt do PowerShell fica com causa
      // registrada em vez de silencioso.
      currentChild.on("exit", (code, signal) => {
        if (stopping) return;
        console.error(
          `[ProdMaker] Processo do servidor saiu (código ${code ?? "null"}, sinal ${signal ?? "null"}). ` +
            `Detalhes: ${path.join(home, "storage", "logs", "app.log")}`
        );
      });

      currentChild.on("close", (code) => {
        if (stopping) {
          resolve({ code: code ?? 0 });
          return;
        }
        const vivoMs = Date.now() - lastStart;
        console.error(`[ProdMaker] O processo do servidor encerrou (código ${code ?? 0}, ${Math.round(vivoMs / 1000)}s ativo).`);
        if (restarts < MAX_RESTARTS) {
          restarts += 1;
          console.error(`[ProdMaker] Reiniciando automaticamente (tentativa ${restarts} de ${MAX_RESTARTS})...`);
          setTimeout(() => startServer().then(resolve), 2000);
          return;
        }
        resolve({ code: code ?? 1 });
      });
    });

  // Sobe o servidor primeiro; a caixa de URL só aparece quando ele está ouvindo.
  const encerramento = startServer();
  // console.log (não process.stdout.write): a mensagem PRECISA terminar com \n,
  // senão o banner do Python ("[ProdMaker] Iniciando em...") — que chega pelo
  // proxy de stdout — nasce colado nela ("...pronto[ProdMaker] Iniciando em...").
  console.log("Aguardando o servidor ficar pronto...");
  const pronto = await waitReady(port);
  console.log(pronto ? "Servidor pronto." : "Servidor demorou para responder (30s).");
  printUrlBox(port, masterCode);
  if (pronto) {
    console.log("O servidor está rodando. Mantenha esta janela aberta. Pressione CTRL+C para encerrar.");
  } else {
    console.error("O servidor não respondeu em 30s. Ele pode estar reiniciando — rode 'npm run debug' para ver o traceback ou confira storage/logs/app.log.");
  }
  console.log("Se o servidor cair, o launcher tenta reiniciar sozinho (até 3 vezes).");
  console.log("");

  const resultado = await encerramento;
  if (resultado.code !== 0) {
    console.error("");
    console.error("O servidor não se manteve no ar. Para ver o traceback completo, rode manualmente (dentro da pasta do ProdMaker):");
    console.error(`  cd ${PKG_ROOT} && .\\venv\\Scripts\\python.exe -m app.main  (ou: npm run debug)`);
    console.error(`  (ou .\\venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port ${port})`);
    process.exit(resultado.code ?? 1);
  }
  console.log(`ProdMaker encerrou (código ${resultado.code}).`);
  process.exit(0);
}

async function commandDoctor() {
  console.log(`ProdMaker ${APP_VERSION} — doctor`);
  console.log(`Node: ${process.version}`);
  const home = resolveHome();
  console.log(`PRODMAKER_HOME: ${home}`);
  console.log(`Storage instalado: ${fs.existsSync(storagePath(home, "state", "settings.json")) ? "OK" : "FALTA (rode install)"}`);
  const venv = venvPython(home);
  console.log(`Venv: ${venv || "ausente"}`);
  if (venv) {
    const check = spawnSync(venv, ["-c", "import fastapi, uvicorn"], { encoding: "utf8", windowsHide: true });
    console.log(`Dependências Python (fastapi/uvicorn): ${check.status === 0 ? "OK" : "FALTANDO (rode install)"}`);
  } else {
    const base = findSystemPython();
    console.log(`Python do sistema: ${base || "não encontrado"}`);
  }
  console.log(`Backend (app/main.py): ${fs.existsSync(path.join(APP_DIR, "main.py")) ? "OK" : "FALTANDO"}`);
  const dist = path.join(PKG_ROOT, "frontend", "dist", "index.html");
  console.log(`Frontend build (frontend/dist): ${fs.existsSync(dist) ? "OK" : "pendente (Parte 2)"}`);
  const port = await pickPort(DEFAULT_PORT);
  console.log(`Porta ${DEFAULT_PORT}: ${port === DEFAULT_PORT ? "livre" : "ocupada"}`);
}

async function main() {
  const command = process.argv[2] || "run";
  const flags = {
    skipPythonDeps: process.argv.includes("--skip-python-deps"),
  };
  if (command === "install") return commandInstall(flags);
  if (command === "doctor") return commandDoctor();
  if (command === "run" || command === "start") return commandRun();
  console.log("Uso: prodmaker [install|run|doctor] [--skip-python-deps]");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
