#!/usr/bin/env node
/* ProdMaker launcher — install | run | doctor
 * REGRA ZERO: este launcher NUNCA abre o navegador. Apenas imprime a URL.
 */
import { spawn, spawnSync } from "node:child_process";
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
const APP_VERSION = "0.1.13";
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

function runCommand(cmd, args, options = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
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
    const python = venvPython(home);
    console.log("Instalando dependências Python (requirements.txt)...");
    const code = await runCommand(python, ["-m", "pip", "install", "--upgrade", "pip"]);
    const code2 = await runCommand(python, ["-m", "pip", "install", "-r", REQUIREMENTS]);
    if (code2 !== 0) {
      console.error("Falha ao instalar dependências Python.");
      process.exit(1);
    }
  }

  console.log("");
  console.log("Instalação concluída. Para iniciar:");
  console.log("  npx --yes @danhachuel/prodmaker");
  console.log("Depois abra http://localhost:8188 MANUALMENTE no navegador (o sistema nunca abre o navegador).");
}

async function fetchMasterCode(python, home) {
  if (python) {
    try {
      const result = spawnSync(python, ["-c", "from app.services.store import get_master_code; print(get_master_code())"], {
        cwd: PKG_ROOT,
        encoding: "utf8",
        env: { ...process.env, PRODMAKER_HOME: home },
      });
      const value = (result.stdout || "").trim().split(/\r?\n/).pop() || "";
      if (result.status === 0 && value) return value;
    } catch {}
  }
  return (process.env.PRODMAKER_MASTER_CODE || "").trim() || "1234";
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
    console.error("Nenhuma porta disponível entre " + preferred + " e " + (preferred + 11) + ".");
    process.exit(1);
  }
  if (port !== preferred) console.log(`Porta ${preferred} ocupada — usando ${port}.`);

  const pythonCmd = venvPython(home) ? python : python;
  const pythonArgs = venvPython(home)
    ? ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)]
    : process.platform === "win32" && python === "py"
      ? ["-3", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)]
      : ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)];

  console.log("Iniciando ProdMaker...");
  const masterCode = await fetchMasterCode(pythonCmd, home);
  printUrlBox(port, masterCode);

  const env = { ...process.env, PRODMAKER_HOME: home, PRODMAKER_PORT: String(port) };
  const child = spawn(pythonCmd, pythonArgs, {
    cwd: PKG_ROOT,
    stdio: "inherit",
    env,
    shell: false,
  });
  const stop = () => {
    child.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("close", (code) => {
    console.log(`ProdMaker encerrou (código ${code ?? 0}).`);
    process.exit(code ?? 0);
  });
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
    const check = spawnSync(venv, ["-c", "import fastapi, uvicorn"], { encoding: "utf8" });
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
