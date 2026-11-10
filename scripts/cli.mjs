#!/usr/bin/env node
/* ProdMaker launcher — install | run | doctor
 * REGRA ZERO: este launcher NUNCA abre o navegador. Apenas imprime a URL.
 */
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import { createRequire } from "node:module";
import { createServer, request as httpRequest } from "node:http";
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
const APP_VERSION = "0.1.52";
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
  const home = path.dirname(rt); // rt = home/.runtime
  // 0) LOCK GLOBAL (launcher + daemon): são eles que seguram o .runtime aberto.
  try {
    const lock = lerPidGlobal(home);
    if (lock) {
      for (const pid of [lock.launcher, lock.backend]) {
        if (pid && pid !== process.pid) matarArvore(pid);
      }
    }
  } catch {}
  matarPidLegados(home);
  // 1) PID file do launcher (evita que o supervisor reerga o servidor).
  try {
    const pidFile = path.join(home, "storage", "state", "launcher.pid");
    const pid = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, "utf8").trim() : "";
    if (pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", windowsHide: true });
      } else {
        try { process.kill(Number(pid), "SIGKILL"); } catch {}
      }
    }
  } catch {}
  // 2) Portas do servidor — o daemon Python escuta na porta da API e o launcher
  //    na da UI: as DUAS faixas são varridas (silencioso, windowsHide).
  try {
    const settingsPath = path.join(home, "storage", "state", "settings.json");
    let preferred = DEFAULT_PORT;
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (Number.isInteger(settings.port)) preferred = settings.port;
    } catch {}
    const apiBase = preferred === API_PORT_DEFAULT ? API_PORT_DEFAULT + PORT_SCAN : API_PORT_DEFAULT;
    for (const base of [preferred, apiBase]) {
      for (let port = base; port < base + PORT_SCAN; port += 1) {
        killPortProcess(port);
      }
    }
  } catch {}
  // 3) Varredura por linha de comando (pega processos que perderam a porta):
  //    o caminho do .runtime OU o entry point do servidor (-m app.main).
  if (process.platform === "win32") {
    try {
      spawnSync(
        "powershell",
        ["-NoProfile", "-Command",
          `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%${rt}%' OR CommandLine LIKE '%-m app.main%'" | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }`],
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

// beforeExit = o event loop ESVASIOU (não deve acontecer com o listen da UI no
// ar). Registro SILENCIOSO (só arquivo) p/ não poluir install/doctor/stop.
process.on("beforeExit", (code) => {
  launcherDbg(`[NODE] beforeExit (event loop vazio) code=${code}`);
});
process.on("exit", (code) => {
  // O terminal NUNCA fecha sem imprimir o motivo. Modelo PandaNews: launcher e
  // servidor têm vidas SEPARADAS — a saída do Node NÃO derruba o daemon.
  const m = controlledStop
    ? "[LAUNCHER] Encerrado - o servidor (daemon) foi finalizado junto."
    : `[LAUNCHER] Launcher encerrado (codigo ${code}) - o servidor DAEMON segue no ar. Para parar: prodmaker stop`;
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


// Um processo está vivo? (usado pelo doctor para reportar o daemon).
function pidVivo(pid) {
  if (!pid) return false;
  try {
    if (process.platform === "win32") {
      const r = spawnSync("powershell", ["-NoProfile", "-Command", `if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { "vivo" }`], { encoding: "utf8", windowsHide: true });
      return (r.stdout || "").includes("vivo");
    }
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------


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
// ---------------------------------------------------------------------------
// ARQUITETURA PandaNews (portada) — DAEMON isolado + UI servida pelo Node.
//
// 1) O Python sobe como DAEMON: grupo de processos próprio (detached +
//    CREATE_NEW_PROCESS_GROUP), sem console (windowsHide), stdio em
//    storage/logs/app.log e unref — a morte do launcher não o derruba e
//    vice-versa. Fechar/minimizar/perder o foco do MobaXterm não mata nada.
// 2) O launcher (Node) NÃO é segurado por setInterval/Promise/readline (todos
//    falharam no PTY do MobaXterm): ele fica no ar porque tem um socket HTTP
//    REAL em listen — o servidor de UI (.runtime/frontend/dist + proxy /api).
// 3) Windows: binário BASE do venv + PYTHONPATH do venv — evita o redirector
//    do venv, cujo processo neto abria um console novo (a janela preta de CMD).
// 4) Lock global storage/prodmaker.pid: `stop` e o kill preventivo do `run`
//    matam o launcher e o daemon registrados (taskkill /PID /F /T silencioso).
// ---------------------------------------------------------------------------

const API_PORT_DEFAULT = 8189; // porta do daemon Python (a UI encaminha /api pra cá)
const PORT_SCAN = 12; // faixa de fallback de portas (UI e API)
const CREATE_NEW_PROCESS_GROUP = 0x00000200; // flag Win32 — filhos NAO herdam os sinais do terminal
const PROXY_PREFIXES = ["/api", "/legal", "/pages", "/track"]; // rotas que pertencem ao backend
const FALHAS_PARA_REINICIAR = 3; // leituras ruins CONSECUTIVAS antes de reiniciar o daemon
const MAX_REINICIOS = 3; // teto de reinícios: sem ele, backend que não sobe = loop infinito

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

// Site-packages do venv (Windows: venv/Lib/site-packages; Unix: lib/pythonX.Y/...).
function venvSitePackagesDir(home) {
  if (process.platform === "win32") {
    const direct = path.join(home, "venv", "Lib", "site-packages");
    return fs.existsSync(direct) ? direct : null;
  }
  const lib = path.join(home, "venv", "lib");
  try {
    for (const entry of fs.readdirSync(lib)) {
      const candidate = path.join(lib, entry, "site-packages");
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}
  return null;
}

// Binário BASE do venv, lido do pyvenv.cfg (home/executable). No Windows o
// `venv/Scripts/python.exe` é um REDIRECIONADOR: ele re-executa o interpretador
// real e o processo NETO nasce SEM as flags de ocultação do pai — o Windows
// aloca um console NOVO (a janela preta). Subindo o base com o site-packages no
// PYTHONPATH: um único processo, nenhum console novo, mesmas dependências.
// No Unix o `venv/bin/python` é symlink do base (sem redirector): usa-se o venv.
function pythonBaseBin(home) {
  if (process.platform !== "win32") return null;
  try {
    const cfg = path.join(home, "venv", "pyvenv.cfg");
    if (!fs.existsSync(cfg)) return null;
    const texto = fs.readFileSync(cfg, "utf8");
    const m = texto.match(/^\s*(?:home|executable|base_executable)\s*=\s*(.+)$/im);
    if (!m) return null;
    const raw = m[1].trim().replace(/^["']|["']$/g, "");
    const dir = /python\.exe$/i.test(raw) ? path.dirname(raw) : raw;
    const candidate = path.join(dir, "python.exe");
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

// Binário Python do servidor: BASE (Windows, dependências via PYTHONPATH) ou o
// próprio venv (Unix). Fallback: python do sistema.
function pythonBin(home) {
  const base = pythonBaseBin(home);
  if (base) return base;
  return venvPython(home) || findSystemPython();
}

// Ambiente do Python: home, porta da API e unbuffered. Quando o binário NÃO é
// o do venv (base ou sistema), o site-packages do venv entra no PYTHONPATH.
function pythonEnv(home, port) {
  const env = { ...process.env, PRODMAKER_HOME: home, PRODMAKER_UNBUFFERED: "1" };
  if (port) env.PRODMAKER_PORT = String(port);
  const venv = venvPython(home);
  const bin = pythonBin(home);
  if (venv && (!bin || path.resolve(bin) !== path.resolve(venv))) {
    const site = venvSitePackagesDir(home);
    if (site) env.PYTHONPATH = env.PYTHONPATH ? site + path.delimiter + env.PYTHONPATH : site;
  }
  return env;
}

// Argumentos do entry point (app.main). O launcher `py` do Windows precisa do -3.
function pythonArgsFor(python) {
  return process.platform === "win32" && python === "py" ? ["-3", "-m", "app.main"] : ["-m", "app.main"];
}

// ---------------------------------------------------------------------------
// LOCK GLOBAL — PRODMAKER_HOME/storage/prodmaker.pid (modelo PandaNews).
// O servidor é daemon: sobrevive ao terminal e à própria sessão do launcher. Sem
// um registro de quem está vivo, cada `run` empilhava outra instância (porta
// presa, PID apontando para o processo errado). O lock guarda o launcher E o
// backend: `stop` e o kill preventivo do `run` precisam dos dois. Lock
// corrompido NUNCA pode impedir o arranque.
// ---------------------------------------------------------------------------
function pidGlobalPath(home) {
  return storagePath(home, "prodmaker.pid");
}

function lerPidGlobal(home) {
  try {
    const dados = JSON.parse(fs.readFileSync(pidGlobalPath(home), "utf8"));
    if (!dados || typeof dados !== "object") return null;
    return {
      launcher: Number.isInteger(dados.launcher) ? dados.launcher : null,
      backend: Number.isInteger(dados.backend) ? dados.backend : null,
      port: Number.isInteger(dados.port) ? dados.port : null,
      apiPort: Number.isInteger(dados.apiPort) ? dados.apiPort : null,
    };
  } catch {
    return null;
  }
}

function escreverPidGlobal(home, launcher, backend, uiPort, apiPort) {
  try {
    fs.writeFileSync(
      pidGlobalPath(home),
      JSON.stringify({ launcher, backend, port: uiPort, apiPort, criado: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch {
    /* melhor esforço — o lock nunca deve derrubar o arranque */
  }
}

function limparPidGlobal(home) {
  try {
    fs.unlinkSync(pidGlobalPath(home));
  } catch {
    /* melhor esforço */
  }
}

// PID files de versões anteriores (compatibilidade): daemon-exit e readline.
function matarPidLegados(home) {
  for (const arquivo of [storagePath(home, "state", "python.pid"), storagePath(home, "state", "launcher.pid")]) {
    try {
      if (!fs.existsSync(arquivo)) continue;
      const pid = Number(fs.readFileSync(arquivo, "utf8").trim());
      if (pid && pid !== process.pid) matarArvore(pid);
      fs.unlinkSync(arquivo);
    } catch {}
  }
}

// Mata a árvore de processos por PID, SEMPRE em silêncio (windowsHide + stdio
// ignore + detached): um taskkill que piscasse uma janela de console negaria a
// REGRA ZERO do terminal. No Windows `taskkill /PID /F /T` derruba o processo e
// os filhos; no Unix o sinal negativo mata o grupo inteiro.
function matarArvore(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { windowsHide: true, detached: true, stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    /* processo já não existia */
  }
}

// PID dono de uma porta em LISTEN (Windows, netstat silencioso; Unix: null).
function pidDaPorta(port) {
  if (process.platform !== "win32") return null;
  try {
    const res = spawnSync("cmd", ["/c", "netstat -ano | findstr :" + port + " | findstr LISTENING"], { encoding: "utf8", windowsHide: true });
    for (const linha of (res.stdout || "").split(/\r?\n/)) {
      const m = linha.match(/(\d+)\s*$/);
      if (m && Number(m[1]) > 0) return Number(m[1]);
    }
  } catch {}
  return null;
}

// Duas redes de segurança antes de subir uma nova instância: os PIDs do lock
// global (e dos PID files legados) e quem estiver dono das portas candidatas
// (UI e API) — o netstat apanha o zombie que o arquivo perdeu. NUNCA mata o
// próprio processo: dois launchers a arrancar não podem suicidar-se mutuamente.
async function matarInstanciasAntigas(home, uiBase, apiBase) {
  let mortos = 0;
  const lock = lerPidGlobal(home);
  if (lock) {
    for (const pid of [lock.launcher, lock.backend]) {
      if (pid && pid !== process.pid) {
        matarArvore(pid);
        mortos += 1;
      }
    }
  }
  for (const arquivo of [storagePath(home, "state", "python.pid"), storagePath(home, "state", "launcher.pid")]) {
    try {
      if (!fs.existsSync(arquivo)) continue;
      const pid = Number(fs.readFileSync(arquivo, "utf8").trim());
      if (pid && pid !== process.pid) {
        matarArvore(pid);
        mortos += 1;
      }
      fs.unlinkSync(arquivo);
    } catch {}
  }
  for (const base of [uiBase, apiBase]) {
    for (let port = base; port < base + PORT_SCAN; port += 1) {
      const dono = pidDaPorta(port);
      if (dono && dono !== process.pid) {
        matarArvore(dono);
        mortos += 1;
      }
    }
  }
  limparPidGlobal(home);
  if (mortos > 0) {
    console.log(`Encerrando instância anterior (${mortos} processo(s)) antes de iniciar...`);
    // 1s para o SO liberar as portas e os arquivos do .runtime — sem isto o
    // bind seguinte pode falhar com EADDRINUSE.
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// Um daemon já vivo (lido do LOCK GLOBAL) — o watchdog reaproveita em vez de
// empilhar outra instância (backend duplicado fazia a porta "morrer" pro proxy).
async function backendJaRodando(home) {
  const lock = lerPidGlobal(home);
  if (!lock || !lock.backend || !pidVivo(lock.backend)) return null;
  const port = lock.apiPort;
  if (port && (await portaAberta(port))) return { pid: lock.backend, port };
  return null;
}

// A porta aceita conexão TCP? (probe real — uvicorn ouvindo.)
function portaAberta(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Encaminha a requisição para o daemon Python (API, /legal, /pages, /track).
function proxyApi(req, res, apiPort) {
  const proxied = httpRequest(
    {
      hostname: "127.0.0.1",
      port: apiPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    }
  );
  proxied.on("error", () => {
    if (res.headersSent) return;
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ detail: `Backend ProdMaker não responde em 127.0.0.1:${apiPort}` }));
  });
  req.pipe(proxied);
}

// Servidor de UI: serve o frontend buildado (.runtime/frontend/dist) e encaminha
// as rotas do backend. Sem build, TUDO vai para o daemon (que tem o placeholder
// próprio). Rota sem extensão cai no index.html (SPA/BrowserRouter); asset
// inexistente dá 404 — nunca mascarar um .js quebrado como HTML.
function criarUiServer(apiPort, distDir) {
  const temBuild = fs.existsSync(path.join(distDir, "index.html"));
  const indexHtml = path.join(distDir, "index.html");
  return createServer((req, res) => {
    const alvo = (req.url || "/").split("?")[0];
    const ehDoBackend = PROXY_PREFIXES.some((p) => alvo === p || alvo.startsWith(p + "/"));
    if (!temBuild || ehDoBackend) {
      proxyApi(req, res, apiPort);
      return;
    }
    const filePath = path.normalize(path.join(distDir, alvo === "/" ? "index.html" : alvo.slice(1)));
    // Path traversal: nada escapa do dist.
    if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    let stats = null;
    try {
      stats = fs.statSync(filePath);
    } catch {}
    if (!stats || !stats.isFile()) {
      if (path.extname(alvo) === "") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(indexHtml));
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(fs.readFileSync(filePath));
  });
}

// Coloca a UI para ouvir (com fallback de porta em EADDRINUSE). É ESTE listen
// que segura o launcher no terminal do MobaXterm — nunca timer/promise/readline.
async function listenUi(uiPort, apiPort, distDir, limite) {
  const server = criarUiServer(apiPort, distDir);
  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE" && uiPort < limite) {
        console.log(`Porta ${uiPort} ocupada - tentando ${uiPort + 1}...`);
        resolve(listenUi(uiPort + 1, apiPort, distDir, limite));
        return;
      }
      reject(err);
    });
    server.listen(uiPort, "127.0.0.1", () => resolve({ server, port: uiPort }));
  });
}

// Sobe o daemon Python (app.main) em grupo de processos PRÓPRIO: detached
// (CREATE_NEW_PROCESS_GROUP), windowsHide (sem janela preta), stdio em FD de
// arquivo (storage/logs/app.log — o terminal não o controla) e unref (o
// launcher não morre com o daemon e vice-versa). No Windows: binário BASE +
// PYTHONPATH do venv (ver pythonBin/pythonEnv).
function spawnDaemon(home, rt, apiPort) {
  const bin = pythonBin(home);
  const logPath = storagePath(home, "logs", "app.log");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `--- ${new Date().toISOString()} - iniciando ProdMaker (porta ${apiPort}) ---\n`);
  } catch {}
  // stdio por FD: spawn detached no Windows não aceita path, só descritor.
  const logFd = fs.openSync(logPath, "a");
  const filho = spawn(bin, pythonArgsFor(bin), {
    cwd: rt, // RUNTIME PERMANENTE: executa de .runtime, nunca do cache do npx
    detached: true, // grupo PRÓPRIO: imune ao CTRL_C_EVENT do console (0xC000013A)
    creationFlags: process.platform === "win32" ? CREATE_NEW_PROCESS_GROUP : 0,
    windowsHide: true, // CREATE_NO_WINDOW: nunca abre janela de CMD
    stdio: ["ignore", logFd, logFd], // saída direto no arquivo (append) - não herda console
    env: pythonEnv(home, apiPort),
    shell: false,
  });
  fs.closeSync(logFd); // o filho tem sua própria cópia herdada
  filho.unref(); // o Node pode sair sem arrastar o daemon junto
  return filho;
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
        env: pythonEnv(home),
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

  // Python do servidor: binário BASE (Windows) + PYTHONPATH do venv — ver
  // pythonBaseBin/pythonEnv. (pythonw/redirector do venv abria console novo.)
  const python = pythonBin(home);
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

  // UI (Node) na porta preferida; API (daemon Python) em porta própria — a UI
  // encaminha /api pra lá, então a URL que o usuário abre NÃO muda.
  const port = await pickPort(preferred);
  if (!port) {
    console.error(`Nenhuma porta disponível entre ${preferred} e ${preferred + 11}.`);
    process.exit(1);
  }
  if (port !== preferred) console.log(`Porta ${preferred} ocupada — UI usando ${port}.`);

  // API: porta fixa 8189 (sai da faixa se colidir com a UI).
  const apiBase = port === API_PORT_DEFAULT ? API_PORT_DEFAULT + PORT_SCAN : API_PORT_DEFAULT;
  let apiPort = await pickPort(apiBase);
  if (!apiPort) {
    console.error(`Nenhuma porta disponível para a API entre ${apiBase} e ${apiBase + 11}.`);
    process.exit(1);
  }
  if (apiPort !== apiBase) console.log(`Porta ${apiBase} ocupada — API usando ${apiPort}.`);

  // Spawn via `python -m app.main` (próprio entry point): permite log persistente
  // em storage/logs/app.log e captura de exceções fatais.
  const pythonArgs = pythonArgsFor(python);

  console.log("Iniciando ProdMaker...");
  const masterCode = await fetchMasterCode(python, home, rt); // lê o código do .runtime
  // A URL só é impressa DEPOIS de o servidor estar ouvindo (ver waitReady no
  // spawn). Imprimir a caixa de URL antes causava "Failed to fetch" e
  // ERR_CONNECTION_REFUSED no navegador durante o boot (2-5s de import do
  // FastAPI + abertura do SQLite): o usuário abria o site e nada respondia.

  // ISOLAMENTO DO GRUPO DE PROCESSOS — fix do STATUS_CONTROL_C_EXIT (0xC000013A).
  // O MobaXterm envia CTRL_C_EVENT ao grupo do console; se o Python estiver no MESMO
  // grupo, ele morre junto. Solucao (modelo PandaNews): o Python sobe em grupo
  // PROPRIO (CREATE_NEW_PROCESS_GROUP + detached + windowsHide + stdio em
  // arquivo), completamente isolado da janela do terminal, e o launcher fica no
  // ar por um socket HTTP REAL (o servidor de UI) — nunca por timer, promise ou
  // readline (todos falharam no PTY do MobaXterm). O Python tambem ignora Ctrl
  // via SetConsoleCtrlHandler (app/main.py).

  // -------------------------------------------------------------------------
  // ABSORÇÃO DE SINAIS (regra inviolável do launcher) — o app "encerrava
  // sozinho" no MobaXterm porque a janela perde o foco / é minimizada e o
  // terminal envia SIGINT/SIGHUP ESPÚRIOS: qualquer handler que trate esses
  // sinais como "encerrar" derruba a stack inteira.
  //   • Windows: SIGINT e SIGHUP são ABSORVIDOS (só log) — o launcher NÃO
  //     morre e o daemon (já isolado) também não.
  //   • Linux/macOS: CTRL+C (SIGINT) encerra o launcher E o daemon; SIGHUP
  //     (terminal fechando) NÃO derruba o daemon — ele segue no ar.
  // Nota: no modelo PandaNews, encerrar o launcher NÃO derruba o servidor — o
  // encerramento real é sempre via `prodmaker stop` (ou taskkill no PID).
  // -------------------------------------------------------------------------
  let backendPid = null; // PID do daemon que ESTA sessão iniciou (null = reaproveitado)
  if (process.platform === "win32") {
    process.on("SIGINT", () =>
      launcherDbg("[SIGNAL] SIGINT no Windows — ABSORVIDO (nao encerra; MobaXterm envia sinal espurio ao perder foco)")
    );
    process.on("SIGHUP", () =>
      launcherDbg("[SIGNAL] SIGHUP no Windows — ABSORVIDO (perda de foco/minimizar nao derruba o servidor)")
    );
    process.on("SIGTERM", () => {
      launcherDbg("[SIGNAL] SIGTERM — encerrando o launcher; o daemon segue no ar (pare com: prodmaker stop)");
      process.exit(0);
    });
  } else {
    process.on("SIGINT", () => {
      // CTRL+C EXPLÍCITO do usuário: encerra o launcher E o daemon.
      launcherDbg("[SIGNAL] SIGINT (CTRL+C) — encerrando launcher e daemon");
      controlledStop = true;
      matarArvore(backendPid);
      limparPidGlobal(home);
      process.exit(0);
    });
    process.on("SIGHUP", () => launcherDbg("[SIGNAL] SIGHUP — terminal fechando; daemon mantido no ar (use prodmaker stop)"));
    process.on("SIGTERM", () => {
      controlledStop = true;
      matarArvore(backendPid);
      limparPidGlobal(home);
      process.exit(0);
    });
  }

  // 1) MATA A INSTÂNCIA ANTERIOR antes de subir a nova (lock global + portas).
  await matarInstanciasAntigas(home, preferred, apiBase);

  // 2) DAEMON PYTHON — binário base + PYTHONPATH, detached, stdio em
  //    storage/logs/app.log, unref. Vive isolado do terminal.
  console.log("Aguardando o servidor ficar pronto...");
  const filho = spawnDaemon(home, rt, apiPort);
  backendPid = filho.pid;
  if (backendPid == null) {
    console.error("[ERRO FATAL] falha ao iniciar o Python (sem PID).");
    process.exit(1);
  }
  filho.on("error", (e) => console.error(`[ERRO FATAL] falha ao iniciar o Python: ${e.message}`));
  escreverPidGlobal(home, process.pid, backendPid, port, apiPort);
  launcherDbg(`[DAEMON] python pid=${backendPid} (porta API ${apiPort}) — lock em ${pidGlobalPath(home)}`);

  const pronto = await waitReady(apiPort);

  // 3) UI (Node) — o listen REAL deste socket é o que segura o launcher no
  //    terminal do MobaXterm (modelo PandaNews). Serve .runtime/frontend/dist e
  //    encaminha /api, /legal, /pages e /track para o daemon Python.
  const distDir = path.join(rt, "frontend", "dist");
  let ui = null;
  try {
    ui = await listenUi(port, apiPort, distDir, preferred + PORT_SCAN);
  } catch (err) {
    console.error(`[ERRO FATAL] não foi possível ouvir a porta ${port}: ${err && err.message ? err.message : err}`);
    console.error("Encerre o processo que a ocupa ou rode `prodmaker stop`.");
    matarArvore(backendPid);
    limparPidGlobal(home);
    process.exit(1);
  }

  printUrlBox(ui.port, masterCode);
  if (pronto) {
    console.log("Servidor Python (daemon) isolado do terminal — pid " + backendPid + " — porta " + apiPort + ".");
    console.log("UI servida por este launcher em http://127.0.0.1:" + ui.port + " (frontend: " + distDir + ").");
    if (process.platform === "win32") {
      console.log("Pode fechar/minimizar esta janela: o servidor continua no ar (perder o foco não o derruba).");
      console.log("Para parar: `prodmaker stop`.");
    } else {
      console.log("CTRL+C encerra o launcher e o servidor; fechar a janela (SIGHUP) mantém o daemon no ar.");
    }
    console.log("Logs persistentes: " + storagePath(home, "logs", "app.log"));
  } else {
    console.error("O servidor não respondeu em 30s. Últimas linhas de " + storagePath(home, "logs", "app.log") + ":");
    try {
      const linhas = fs
        .readFileSync(storagePath(home, "logs", "app.log"), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-8);
      for (const l of linhas) console.error("  " + l);
    } catch {
      console.error("  (app.log indisponível)");
    }
    console.error("Diagnóstico completo: npm run debug (sobe o Python direto, sem daemon).");
    matarArvore(backendPid);
    limparPidGlobal(home);
    process.exit(1);
  }

  // 4) WATCHDOG de saúde do daemon. O spawn destacado não emite eventos de exit
  //    confiáveis — a saúde é polida a cada 10s. FALHAS_PARA_REINICIAR leituras
  //    ruins consecutivas reerguem o daemon, mas no MÁXIMO MAX_REINICIOS vezes
  //    (sem teto, um backend que não sobe viraria loop infinito de spawns — e
  //    cada spawn no Windows é candidato a uma janela de console). unref: quem
  //    segura o event loop é o listen da UI, não o timer.
  let falhasSaude = 0;
  let reinicios = 0;
  const watchdog = setInterval(async () => {
    if (await waitReady(apiPort, 4000)) {
      falhasSaude = 0;
      reinicios = 0;
      return;
    }
    falhasSaude += 1;
    if (falhasSaude < FALHAS_PARA_REINICIAR) return;
    if (reinicios >= MAX_REINICIOS) {
      clearInterval(watchdog);
      console.error("");
      console.error(`O servidor não respondeu em http://127.0.0.1:${apiPort} após ${MAX_REINICIOS} tentativas de reinício.`);
      console.error("O launcher está sendo encerrado para não entrar em loop infinito.");
      console.error("Diagnóstico completo em: " + storagePath(home, "logs", "app.log"));
      console.error("Se a porta estiver ocupada por outra instância, rode `prodmaker stop`.");
      matarArvore(backendPid);
      limparPidGlobal(home);
      process.exit(1);
      return;
    }
    falhasSaude = 0;
    const existente = await backendJaRodando(home);
    if (existente) {
      console.log(`Servidor já em execução (PID ${existente.pid}) na porta ${existente.port} - reaproveitando.`);
      apiPort = existente.port;
      backendPid = existente.pid;
      escreverPidGlobal(home, process.pid, backendPid, port, apiPort);
      return;
    }
    reinicios += 1;
    console.error(`[ProdMaker] Servidor não responde - reiniciando (${reinicios}/${MAX_REINICIOS})...`);
    const novo = spawnDaemon(home, rt, apiPort);
    backendPid = novo.pid;
    escreverPidGlobal(home, process.pid, backendPid, port, apiPort);
  }, 10000);
  watchdog.unref();

  // -------------------------------------------------------------------------
  // TRAVA DE TERMINAL (readline) — o "casamento perfeito" com o listen HTTP.
  // No MobaXterm (PTY) o http.listen sozinho NÃO segura o processo: o terminal
  // encerra o Node se ele não estiver escutando o teclado ativamente. A
  // interface readline mantém o stdin ativo — com os DOIS holds (listen HTTP +
  // readline) o launcher só sai quando o terminal é realmente fechado, por
  // `prodmaker stop` ou por taskkill. NUNCA por conta própria.
  // -------------------------------------------------------------------------
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("close", () => {
    launcherDbg("[READLINE] terminal/stdin fechou");
    // Terminal REAL (MobaXterm/PowerShell/CMD — stdin.isTTY) fechado: encerra o
    // daemon Python junto e sai limpo, sem órfão segurando a porta. Em stdin
    // NÃO-tty (pipe/redirecionamento/CI) o EOF pode chegar sem o usuário fechar
    // nada — aí NÃO encerra: o launcher segue no ar (parar só com `prodmaker
    // stop`). Esse guard impede que um EOF precoce derrube o servidor.
    if (process.stdin && process.stdin.isTTY) {
      console.error("\n[LAUNCHER] Terminal fechado. Encerrando...");
      controlledStop = true;
      matarArvore(backendPid);
      limparPidGlobal(home);
      process.exit(0);
    }
    launcherDbg("[READLINE] stdin nao-tty fechou - launcher mantido (use prodmaker stop)");
  });
  launcherDbg(`[RUN] holds ativos: http.listen(${ui.port}) + readline(stdin) — daemon pid ${backendPid}`);
}

async function commandStop() {
  const home = resolveHome();
  console.log(`ProdMaker ${APP_VERSION} — stop`);
  let preferred = DEFAULT_PORT;
  try {
    const settings = JSON.parse(fs.readFileSync(storagePath(home, "state", "settings.json"), "utf8"));
    if (Number.isInteger(settings.port)) preferred = settings.port;
  } catch {}

  let mortos = 0;
  // 1) LOCK GLOBAL (storage/prodmaker.pid): mata o launcher e o daemon
  //    registrados, com taskkill /PID /F /T silencioso (windowsHide + ignore).
  const lock = lerPidGlobal(home);
  if (lock) {
    for (const [nome, pid] of [["Launcher", lock.launcher], ["Servidor", lock.backend]]) {
      if (pid && pid !== process.pid) {
        matarArvore(pid);
        mortos += 1;
        console.log(`${nome} (pid ${pid}) encerrado.`);
      }
    }
  }

  // 2) PID files de versões anteriores (daemon-exit e launcher readline).
  matarPidLegados(home);

  // 3) Varredura das portas candidatas (UI e API) — pega o zombie que o lock
  //    perdeu. Sempre silencioso: nenhuma janela de console pode piscar.
  const apiBase = preferred === API_PORT_DEFAULT ? API_PORT_DEFAULT + PORT_SCAN : API_PORT_DEFAULT;
  for (const base of [preferred, apiBase]) {
    for (let port = base; port < base + PORT_SCAN; port += 1) {
      const dono = pidDaPorta(port);
      if (dono && dono !== process.pid) {
        matarArvore(dono);
        mortos += 1;
        console.log(`Porta ${port}: processo do servidor encerrado.`);
      }
    }
  }
  limparPidGlobal(home);
  if (mortos > 0) {
    console.log("ProdMaker parado.");
  } else {
    console.log("Nenhum ProdMaker ativo encontrado.");
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
  // Status do daemon pelo LOCK GLOBAL (fallback: PID file de versão anterior).
  const lock = lerPidGlobal(home);
  if (lock && lock.backend) {
    const estado = pidVivo(lock.backend)
      ? `rodando (pid ${lock.backend}, API na porta ${lock.apiPort || "?"})`
      : `parado (pid ${lock.backend} morto)`;
    console.log(`Servidor (daemon): ${estado}`);
  } else {
    const legado = storagePath(home, "state", "python.pid");
    const pidLegado = fs.existsSync(legado) ? fs.readFileSync(legado, "utf8").trim() : "";
    console.log(
      pidLegado
        ? `Servidor (daemon legado): ${pidVivo(pidLegado) ? "rodando (pid " + pidLegado + ")" : "parado (pid morto)"}`
        : "Servidor (daemon): parado (nenhum lock)"
    );
  }
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
