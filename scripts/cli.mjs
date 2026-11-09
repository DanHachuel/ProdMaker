#!/usr/bin/env node
/* ProdMaker launcher — install | run | doctor
 * REGRA ZERO: este launcher NUNCA abre o navegador. Apenas imprime a URL.
 */
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
// cross-spawn (padrão da indústria p/ compatibilidade de processos no Windows/cmd/
// PowerShell): usado quando a dependência está instalada (publicada via npm). Fallback
// SILENCIOSO para o spawn nativo do Node se não estiver (clone local sem `npm install`,
// smoke de CI) — o launcher NUNCA quebra por causa disso.
const require = createRequire(import.meta.url);
let crossSpawn = null;
try {
  crossSpawn = require("cross-spawn");
} catch {
  crossSpawn = null;
}
const spawn = crossSpawn || nodeSpawn;
const APP_DIR = path.join(PKG_ROOT, "app");
const REQUIREMENTS = path.join(PKG_ROOT, "requirements.txt");
const APP_VERSION = "0.1.49";
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

// ---------------------------------------------------------------------------
// RUNTIME PERMANENTE (regra inviolável — ver AGENTS.md).
// O servidor NUNCA roda do cache do npx (.npm/_npx/...): com o Python e o Node
// executando de lá, os arquivos do cache ficam travados e qualquer atualização
// falha com EBUSY. O `install` copia o código para PRODMAKER_HOME/.runtime e o
// `run` executa SEMPRE de lá. O storage (banco, logs, chaves) continua na RAIZ
// do PRODMAKER_HOME — os dados do usuário sobrevivem a qualquer atualização.
// ---------------------------------------------------------------------------
function runtimeDir(home) {
  return path.join(home || resolveHome(), ".runtime");
}

// O que o app precisa para rodar fora do cache do npx.
const RUNTIME_ITENS = ["app", "frontend/dist", "seed", "legal", "requirements.txt", "package.json"];

// Mata TUDO que segura o runtime antigo (launcher registrado, servidor na porta
// e processos com o .runtime na linha de comando) — sem isso a cópia falha com
// EBUSY. Só mata processos do NOSSO caminho (nunca de outros projetos).
function matarProcessosDoRuntime(rt) {
  // 1) PID file do launcher (evita que o supervisor reerga o servidor).
  try {
    const pidFile = path.join(rt, "..", "storage", "state", "launcher.pid");
    const pid = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, "utf8").trim() : "";
    if (pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", windowsHide: true });
      } else {
        try { process.kill(Number(pid), "SIGKILL"); } catch {}
      }
    }
  } catch {}
  // 2) Porta do servidor (faixa completa do pickPort) — o Python sempre escuta.
  try {
    const home = path.dirname(rt); // rt = home/.runtime
    const settingsPath = path.join(home, "storage", "state", "settings.json");
    let preferred = DEFAULT_PORT;
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (Number.isInteger(settings.port)) preferred = settings.port;
    } catch {}
    for (let port = preferred; port <= preferred + 11; port += 1) {
      killPortProcess(port);
    }
  } catch {}
  // 3) Varredura por linha de comando (pega processos que perderam a porta).
  if (process.platform === "win32") {
    try {
      spawnSync(
        "powershell",
        ["-NoProfile", "-Command",
          `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%${rt}%'" | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }`],
        { stdio: "ignore", windowsHide: true }
      );
    } catch {}
  }
}

// Copia o código do pacote (cache do npx) para o .runtime. Idempotente.
// NUNCA encerra em silêncio: qualquer falha (EBUSY, permissão, fonte ausente)
// sobe como exceção com mensagem clara (o commandInstall transforma em
// [ERRO FATAL] e exit(1)).
function prepararRuntime(rt) {
  matarProcessosDoRuntime(rt);
  // Limpa o .runtime antigo. No Windows, arquivos abertos por um processo recém-
  // morto podem dar EBUSY: maxRetries/retryDelay esperam o handle liberar (sem
  // busy-wait, que trava o event loop).
  try {
    fs.rmSync(rt, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
  } catch (err) {
    throw new Error(`nao foi possivel limpar o .runtime antigo (${rt}): ${err && err.message ? err.message : err}`);
  }
  try {
    fs.mkdirSync(rt, { recursive: true });
  } catch (err) {
    throw new Error(`nao foi possivel criar o .runtime (${rt}): ${err && err.message ? err.message : err}`);
  }
  const copiados = [];
  try {
    for (const item of RUNTIME_ITENS) {
      const src = path.join(PKG_ROOT, item);
      if (!fs.existsSync(src)) {
        // Item obrigatório faltando no pacote: NÃO pula em silêncio (senão o
        // .runtime nasce incompleto e o `run` falha depois). Falha ALTO e claro.
        throw new Error(`fonte obrigatoria ausente no pacote: ${src}`);
      }
      fs.cpSync(src, path.join(rt, item), { recursive: true });
      copiados.push(item);
    }
  } catch (err) {
    throw new Error(`falha ao copiar arquivos para o .runtime: ${err && err.message ? err.message : err}`);
  }
  return copiados;
}

// ---------------------------------------------------------------------------
// DIAGNÓSTICO — "launcher fechando sozinho no MobaXterm".
// Grava o momento EXATO da morte do Node + eventos de sinal/filho em
// storage/logs/launcher-debug.log para descobrirmos a causa raiz sem adivinhar.
// O log é SOBRESCRITO a cada start (fresh) — análise de uma execução só.
// ---------------------------------------------------------------------------
const LAUNCHER_DEBUG_LOG = path.join(resolveHome(), "storage", "logs", "launcher-debug.log");
function launcherDbg(mensagem) {
  try {
    fs.mkdirSync(path.dirname(LAUNCHER_DEBUG_LOG), { recursive: true });
    fs.appendFileSync(LAUNCHER_DEBUG_LOG, `[${new Date().toISOString()}] ${mensagem}\n`);
  } catch {}
}
try {
  fs.mkdirSync(path.dirname(LAUNCHER_DEBUG_LOG), { recursive: true });
  fs.writeFileSync(LAUNCHER_DEBUG_LOG, `[${new Date().toISOString()}] [NODE] launcher iniciado (pid ${process.pid}) cmd=${process.argv[2] || "run"} spawn=${crossSpawn ? "cross-spawn" : "nativo(fallback)"}\n`);
} catch {}
// Encerramento CONTROLADO (Ctrl+C → matarAgora) seta esta flag; aí a mensagem de
// morte NÃO é impressa (Ctrl+C continua limpo). Em qualquer OUTRA saída, o MOTIVO é
// cuspido no TERMINAL — o terminal não pode fechar sem antes dizer por quê.
// ---------------------------------------------------------------------------
// GUARDA DA CONSOLA (anti-EPIPE) — NUNCA REMOVER (regra inviolável do launcher).
// Quando o terminal (MobaXterm/CMD) é fechado, escrever em stdout/stderr morto
// gera erro EPIPE: sem listener de 'error' o evento sobe como exceção não
// tratada e DERRUBA o launcher no meio da aplicação. A guarda (a) absorve o
// erro do stream e (b) espelha TUDO em storage/logs/launcher_console.log — o
// terminal pode morrer, os logs continuam.
// ---------------------------------------------------------------------------
const CONSOLE_MIRROR = path.join(resolveHome(), "storage", "logs", "launcher_console.log");
let consoleMirror = null;
try {
  fs.mkdirSync(path.dirname(CONSOLE_MIRROR), { recursive: true });
  consoleMirror = fs.createWriteStream(CONSOLE_MIRROR, { flags: "a" });
} catch {
  consoleMirror = null;
}

function guardConsoleStream(stream) {
  const nome = stream === process.stdout ? "stdout" : "stderr";
  // Sem este listener, EPIPE em console fechado = uncaughtException = morte.
  stream.on("error", (err) => {
    launcherDbg(`[CONSOLE] erro de escrita em ${nome}: ${err && err.code ? err.code : err} — absorvido (logs seguem em ${CONSOLE_MIRROR})`);
  });
  const originalWrite = stream.write.bind(stream);
  stream.write = (chunk, encoding, callback) => {
    try {
      if (consoleMirror) consoleMirror.write(chunk);
    } catch {}
    try {
      return originalWrite(chunk, encoding, callback);
    } catch {
      return true; // console morto NUNCA derruba o launcher
    }
  };
}
guardConsoleStream(process.stdout);
guardConsoleStream(process.stderr);

let controlledStop = false;

// beforeExit = o event loop ESVASIOU. No modelo daemon, `run` sai via process.exit
// (não passa por aqui); este registro é SILENCIOSO (só arquivo) p/ não poluir install/doctor/stop.
process.on("beforeExit", (code) => {
  launcherDbg(`[NODE] beforeExit (event loop vazio) code=${code}`);
});
process.on("exit", (code) => {
  // O terminal NUNCA fecha sem imprimir o motivo. Ctrl+C (matarAgora→controlledStop)
  // tem uma linha breve; qualquer OUTRA saída mostra o código (a pista da morte).
  const m = controlledStop ? "[LAUNCHER] Encerrado - servidor finalizado junto com o terminal." : `[LAUNCHER] O Node está encerrando. Código: ${code}`;
  launcherDbg(m);
  // Só no `run` a mensagem de encerramento importa (trava absoluta). install/stop/
  // doctor têm mensagens próprias — a saída natural não vira o ruído
  // "[...] Código: 0" que confundia o usuário no fim do install.
  if ((process.argv[2] || "run") === "run") console.error(`\n${m}`);
});
process.on("uncaughtException", (err) => {
  const m = `[LAUNCHER] Erro não tratado: ${err && err.stack ? err.stack : err}`;
  launcherDbg(m);
  console.error(`\n${m}`);
});
process.on("unhandledRejection", (reason) => {
  const m = `[LAUNCHER] Promise rejeitada: ${reason && reason.stack ? reason.stack : reason}`;
  launcherDbg(m);
  console.error(`\n${m}`);
});

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

// Quantos processos escutam na porta (Windows) — o `stop` usa para reportar.
function portListeners(port) {
  if (process.platform !== "win32") return 0;
  try {
    const res = spawnSync("cmd", ["/c", "netstat -ano | findstr :" + port + " | findstr LISTENING"], { encoding: "utf8", windowsHide: true });
    const pids = new Set();
    for (const line of (res.stdout || "").split(/\r?\n/)) {
      const m = line.match(/(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    return pids.size;
  } catch {
    return 0;
  }
}
// Mata qualquer processo escutando na porta (Windows) antes de subir — evita que
// um Python fantasma de execucao anterior ocupe a porta e derrube o novo.
function killPortProcess(port) {
  if (process.platform !== "win32") return;
  try {
    const res = spawnSync("cmd", ["/c", "netstat -ano | findstr :" + port + " | findstr LISTENING"], { encoding: "utf8", windowsHide: true });
    const pids = new Set();
    for (const line of (res.stdout || "").split(/\r?\n/)) {
      const m = line.match(/(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try { spawnSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore", windowsHide: true }); } catch {}
    }
  } catch {}
}
// Spawn DETACHED no Windows: use pythonw.exe (subsistema GUI) para NAO alocar
// console/janela de CMD (python.exe + detach abria janela). Fallback: python.exe.
function daemonPython(py) {
  if (process.platform === "win32" && typeof py === "string" && py.toLowerCase().endsWith("python.exe")) {
    const pyw = py.slice(0, py.length - "python.exe".length) + "pythonw.exe";
    if (fs.existsSync(pyw)) return pyw;
  }
  return py;
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

async function fetchMasterCode(python, home, cwd) {
  if (python) {
    try {
      const result = spawnSync(python, ["-c", "from app.services.store import get_master_code; print(get_master_code())"], {
        cwd: cwd || PKG_ROOT, // default: pacote (install); no run, o .runtime
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

  // RUNTIME PERMANENTE (regra inviolável): copia o código do pacote (cache do
  // npx) para PRODMAKER_HOME/.runtime. O `install` NÃO roda o servidor — só
  // prepara o ambiente e encerra, liberando o npx na hora (fim do EBUSY).
  const rt = runtimeDir(home);
  console.log(`Isolando o runtime em ${rt} ...`);
  try {
    const copiados = prepararRuntime(rt);
    console.log(`[✓] Runtime isolado com sucesso (${copiados.join(", ")}).`);
  } catch (err) {
    // NUNCA encerrar silenciosamente: imprime o erro EXATO e sai com código 1.
    console.error(`[ERRO FATAL] Falha ao copiar arquivos para o .runtime: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  console.log("");
  console.log("[✓] Instalação e isolamento do runtime concluídos com sucesso.");
  console.log("Para iniciar:");
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
  // RUNTIME PERMANENTE (regra inviolável): o servidor roda de .runtime, NUNCA
  // do cache do npx (arquivos travados = EBUSY na atualização). O storage
  // (banco, logs, chaves) continua na RAIZ do PRODMAKER_HOME — nenhum dado do
  // usuário vive dentro do .runtime.
  const rt = runtimeDir(home);
  if (!fs.existsSync(path.join(rt, "app", "main.py"))) {
    console.error("Runtime não encontrado em " + rt);
    console.error("Rode primeiro: npx --yes @danhachuel/prodmaker install");
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
  const masterCode = await fetchMasterCode(python, home, rt); // lê o código do .runtime
  // A URL só é impressa DEPOIS de o servidor estar ouvindo (ver waitReady no
  // spawn). Imprimir a caixa de URL antes causava "Failed to fetch" e
  // ERR_CONNECTION_REFUSED no navegador durante o boot (2-5s de import do
  // FastAPI + abertura do SQLite): o usuário abria o site e nada respondia.

  // PYTHONUNBUFFERED: com stdio em pipe o Python faria buffer de bloco em stdout,
  // atrasando os logs no proxy/MobaXterm. unbuffered = logs em tempo real.
  const env = { ...process.env, PRODMAKER_HOME: home, PRODMAKER_PORT: String(port), PYTHONUNBUFFERED: "1" };

  // ISOLAMENTO DO GRUPO DE PROCESSOS — fix do STATUS_CONTROL_C_EXIT (0xC000013A).
  // O MobaXterm envia CTRL_C_EVENT ao grupo do console; se o Python estiver no MESMO
  // grupo, ele morre junto. Solucao: o Python sobe em grupo PROPRIO
  // (CREATE_NEW_PROCESS_GROUP explicito + detached + pythonw sem janela). O Node
  // (launcher) medeia: fica vivo (keep-alive 1s + readline), ABSORVE SIGINT/SIGHUP
  // no Windows (ver absorcao de sinais acima) e o Python tambem ignora Ctrl via
  // SetConsoleCtrlHandler (app/main.py).
  const CREATE_NEW_PROCESS_GROUP = 0x00000200; // flag Win32 — filhos NAO herdem os sinais do terminal
  killPortProcess(port);

  let stopping = false;
  let keepAliveTimer = null;
  let restarts = 0;
  let child = null;
  const MAX_RESTARTS = 3;

  const startPython = () => {
    child = spawn(daemonPython(python), pythonArgs, {
      cwd: rt, // RUNTIME PERMANENTE: executa de .runtime, nunca do cache do npx
      detached: true, // grupo PROPRIO: imune ao CTRL_C_EVENT do console (0xC000013A)
      creationFlags: CREATE_NEW_PROCESS_GROUP, // 0x00000200 — filhos NAO herdem sinais do terminal
      windowsHide: true, // CREATE_NO_WINDOW: nunca abre janela de CMD
      stdio: ["inherit", "pipe", "pipe"], // logs passam pelo proxy do Node pro terminal atual
      env,
      shell: false,
    });
    launcherDbg(`[RUN] spawn python(grupo proprio) pid=${child.pid} port ${port} (t=${restarts + 1})`);
    child.stdout?.on("data", (d) => { if (!stopping) process.stdout.write(d); });
    child.stderr?.on("data", (d) => { if (!stopping) process.stderr.write(d); });
    child.on("error", (e) => console.error(`[ERRO FATAL] falha ao iniciar o Python: ${e.message}`));
    child.on("exit", (code, signal) => {
      console.log(`\n[PYTHON MORREU] Codigo: ${code ?? "null"}, Sinal: ${signal ?? "null"} — ${path.join(home, "storage", "logs", "app.log")}`);
      launcherDbg(`[CHILD] exit code=${code ?? "null"} signal=${signal ?? "null"}`);
    });
    child.on("close", (code) => {
      if (stopping) return;
      if (restarts < MAX_RESTARTS) {
        restarts += 1;
        console.error(`[ProdMaker] Python caiu (codigo ${code ?? 0}). Reiniciando (${restarts}/${MAX_RESTARTS})...`);
        launcherDbg(`[RESTART] ${restarts}/${MAX_RESTARTS}`);
        setTimeout(startPython, 2000);
        return;
      }
      console.error(`[ProdMaker] Python falhou ${MAX_RESTARTS}x. Encerrando — rode npm run debug.`);
      process.exit(1);
    });
  };

  // O filho Python está rodando? (exitCode/signalCode ficam null enquanto vivo)
  const childVivo = () => Boolean(child && child.exitCode === null && child.signalCode === null);

  const killChild = () => {
    try {
      if (child && child.pid && process.platform === "win32") {
        spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", shell: false, windowsHide: true });
      } else if (child && child.pid) {
        child.kill("SIGKILL");
      }
    } catch {}
  };
  process.on("exit", killChild); // qualquer saida do Node mata o filho (sem orfao)

  const matarAgora = (code) => {
    stopping = true;
    controlledStop = true;
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    killChild();
    launcherDbg(`[STOP] matarAgora(${code ?? 0})`);
    process.exit(code ?? 0);
  };
  // -------------------------------------------------------------------------
  // ABSORÇÃO DE SINAIS (regra inviolável do launcher) — o app "encerrava
  // sozinho" no MobaXterm porque a janela perde o foco / é minimizada e o
  // terminal envia SIGINT/SIGHUP ESPÚRIOS: qualquer handler que trate esses
  // sinais como "encerrar" derruba a stack inteira.
  //   • Windows: SIGINT e SIGHUP são ABSORVIDOS (só log) — o launcher NÃO
  //     morre. O encerramento real é via `prodmaker stop`, fechamento da janela
  //     (readline close) ou taskkill.
  //   • Linux/macOS: CTRL+C (SIGINT) encerra normalmente, como esperado.
  // -------------------------------------------------------------------------
  if (process.platform === "win32") {
    process.on("SIGINT", () =>
      launcherDbg("[SIGNAL] SIGINT no Windows — ABSORVIDO (nao encerra; MobaXterm envia sinal espurio ao perder foco)")
    );
    process.on("SIGHUP", () =>
      launcherDbg("[SIGNAL] SIGHUP no Windows — ABSORVIDO (perda de foco/minimizar nao derruba o servidor)")
    );
    process.on("SIGTERM", () => {
      launcherDbg("[SIGNAL] SIGTERM — encerrando");
      matarAgora(0);
    });
  } else {
    process.on("SIGINT", () => {
      launcherDbg("[SIGNAL] SIGINT (CTRL+C) — encerrando");
      matarAgora(0);
    });
    process.on("SIGHUP", () => launcherDbg("[SIGNAL] SIGHUP — ignorado (servidor segue)"));
    process.on("SIGTERM", () => {
      launcherDbg("[SIGNAL] SIGTERM — encerrando");
      matarAgora(0);
    });
  }

  startPython();

  console.log("Aguardando o servidor ficar pronto...");
  const pronto = await waitReady(port);
  printUrlBox(port, masterCode);
  if (pronto) {
    console.log("Servidor em grupo de processos PROPRIO (imune a CTRL_C fantasma do MobaXterm).");
    console.log("Runtime permanente: " + rt + " (nunca do cache do npx)");
    if (process.platform === "win32") {
      console.log("URL: http://localhost:" + port);
      console.log("CTRL+C aqui NAO encerra (protecao anti-sinal-espurio: perder o foco nao derruba).");
      console.log("Para parar: `prodmaker stop` ou feche esta janela.");
    } else {
      console.log("URL: http://localhost:" + port + "  —  CTRL+C encerra limpo; perder o foco NAO derruba.");
    }
  } else {
    console.error("O servidor nao respondeu em 30s. Veja storage/logs/app.log.");
  }

  // -------------------------------------------------------------------------
  // TRAVA ABSOLUTA (regra inviolável) — TRÊS mecanismos independentes contra o
  // "encerra com Código: 0 logo após o box" (event loop que esvaziou):
  //   (a) timer keep-alive de 1s — o Event Loop nunca esvazia;
  //   (b) Promise que NUNCA resolve — commandRun não retorna;
  //   (c) REARME no beforeExit — se o loop esvaziar de todo (stdio do MobaXterm
  //       sumindo, handles fechando), o handler REAGENDA trabalho e o Node
  //       CONTINUA. Somados, o processo só morre por `stop`, sinal real ou
  //       hard-kill — nunca sozinho com código 0.
  // -------------------------------------------------------------------------
  keepAliveTimer = setInterval(() => {}, 1000); // Mantém o event loop vivo
  const rearme = setInterval(() => {}, 1000); // segunda trava, independente da primeira
  for (const t of [keepAliveTimer, rearme]) {
    if (t && typeof t.unref === "function") t.unref = function () { return this; };
  }
  process.on("beforeExit", (code) => {
    // Se o loop ESVASIOU (antes impossível com os timers), reagenda e segue.
    launcherDbg(
      `[NODE] beforeExit code=${code} — python ${childVivo() ? "vivo" : "morto"} restarts=${restarts} stopping=${stopping} — REARMANDO (nao encerra sozinho)`
    );
    try {
      const t = setInterval(() => {}, 1000);
      if (typeof t.unref === "function") t.unref = function () { return this; };
    } catch {}
  });
  // Watchdog SILENCIOSO (só arquivo): batimento a cada 30s no launcher-debug.log
  // para provar, numa investigação futura, que o launcher seguiu vivo.
  const watchdog = setInterval(() => {
    launcherDbg(`[WATCHDOG] launcher vivo (pid ${process.pid}) — python ${childVivo() ? "vivo" : "MORTO"} restarts=${restarts}/${MAX_RESTARTS}`);
  }, 30000);
  watchdog.unref = function () { return this; };
  // PID file: permite ao comando `prodmaker stop` encerrar ESTE launcher (e, por
  // consequência, o servidor) sem precisar adivinhar o PID do Node.
  const LAUNCHER_PID_FILE = storagePath(home, "state", "launcher.pid");
  try {
    fs.writeFileSync(LAUNCHER_PID_FILE, String(process.pid), "utf8");
  } catch {}
  process.on("exit", () => {
    try {
      fs.unlinkSync(LAUNCHER_PID_FILE);
    } catch {}
  });

  const rl = readline.createInterface({ input: process.stdin, terminal: Boolean(process.stdin && process.stdin.isTTY) });
  rl.on("close", () => {
    // STDIN fechando NAO significa fim da aplicacao: no MobaXterm o EOF pode
    // chegar por redirecionamento/perda de stdio sem o usuario fechar nada.
    // Regra: só encerra se o servidor Python TAMBÉM já morreu. Com o servidor
    // no ar, o launcher SEGUE (o usuário para com `prodmaker stop`).
    launcherDbg("[READLINE] stdin fechou — verificando servidor antes de encerrar");
    if (!(process.stdin && process.stdin.isTTY)) return;
    setTimeout(() => {
      if (childVivo()) {
        launcherDbg("[READLINE] terminal/stdin fechou, mas o servidor segue NO AR — launcher mantido (use prodmaker stop)");
        console.error("\n[ProdMaker] O terminal perdeu o stdin, mas o servidor continua no ar. Use `prodmaker stop` para parar.");
      } else {
        launcherDbg("[READLINE] terminal fechou e servidor ja morto — encerrando junto");
        matarAgora(0);
      }
    }, 3000);
  });
  await new Promise(() => {}); // trava absoluta: commandRun nunca retorna
}

async function commandStop() {
  const home = resolveHome();
  console.log(`ProdMaker ${APP_VERSION} — stop`);
  let preferred = DEFAULT_PORT;
  try {
    const settings = JSON.parse(fs.readFileSync(storagePath(home, "state", "settings.json"), "utf8"));
    if (Number.isInteger(settings.port)) preferred = settings.port;
  } catch {}

  // 1) Mata o LAUNCHER primeiro (senão o supervisor reergueria o servidor).
  const pidFile = storagePath(home, "state", "launcher.pid");
  let matouLauncher = false;
  try {
    const pid = fs.readFileSync(pidFile, "utf8").trim();
    if (pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", windowsHide: true });
      } else {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {}
      }
      matouLauncher = true;
      console.log(`Launcher (pid ${pid}) encerrado.`);
    }
  } catch {}

  // 2) Mata o servidor Python pela porta (toda a faixa possível).
  let matouServidor = 0;
  for (let port = preferred; port <= preferred + 11; port += 1) {
    const antes = portListeners(port);
    killPortProcess(port);
    if (antes > 0) {
      matouServidor += 1;
      console.log(`Porta ${port}: processo do servidor encerrado.`);
    }
  }
  if (!matouLauncher && matouServidor === 0) {
    console.log("Nenhum ProdMaker ativo encontrado (sem launcher registrado e portas livres).");
  } else {
    console.log("ProdMaker parado. Pode fechar a janela do terminal com seguranca.");
  }
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
  // RUNTIME PERMANENTE: o servidor roda de .runtime — o doctor confirma o que
  // o `run` vai usar (não o cache do npx).
  const rt = runtimeDir(home);
  console.log(`Runtime (.runtime): ${fs.existsSync(path.join(rt, "app", "main.py")) ? "OK" : "FALTA (rode install)"}`);
  const dist = path.join(rt, "frontend", "dist", "index.html");
  console.log(`Frontend build (.runtime/frontend/dist): ${fs.existsSync(dist) ? "OK" : "pendente (rode install)"}`);
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
  if (command === "stop" || command === "kill") return commandStop();
  console.log("Uso: prodmaker [install|run|stop|doctor] [--skip-python-deps]");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
