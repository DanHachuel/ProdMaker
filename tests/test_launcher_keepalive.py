"""Teste de CI — regra inviolável da arquitetura do launcher (Windows/MobaXterm).

Lê o `scripts/cli.mjs` e falha se qualquer proteção contra o "app encerra
sozinho" / "janela preta de CMD" for removida. Modelo PandaNews (portado):

1. TRAVA DO LAUNCHER = DOIS holds reais, juntos: `http.createServer().listen(8188)`
   servindo `.runtime/frontend/dist` (proxy `/api`, `/legal`, `/pages`, `/track`
   para o daemon) **E** `readline.createInterface` escutando o `stdin` — no PTY
   do MobaXterm nenhum dos dois sozinho segura o Node. NÃO vale `setInterval`/
   `await new Promise(() => {})` (todos falharam).
2. READLINE RESILIENTE: fechamento de terminal REAL (`stdin.isTTY`) encerra o
   daemon Python junto e sai limpo; stdin NÃO-tty (pipe/CI) NÃO derruba nada.
2. DAEMON ISOLADO: o Python sobe com `detached: true` +
   `creationFlags: CREATE_NEW_PROCESS_GROUP (0x00000200)` + `windowsHide: true` +
   `stdio: ['ignore', logFd, logFd]` (storage/logs/app.log) + `child.unref()` —
   fechar/minimizar/perder o foco do terminal não derruba o servidor.
3. BINÁRIO BASE + PYTHONPATH (Windows): o `venv/Scripts/python.exe` é um
   redirecionador cujo processo NETO nasce sem as flags de ocultação e abre um
   console novo (a janela preta). Sobe-se o interpretador base (lido do
   `venv/pyvenv.cfg`) com o site-packages do venv no `PYTHONPATH`.
4. LOCK GLOBAL `storage/prodmaker.pid`: o `run` mata instâncias antigas (PIDs do
   lock + donos das portas via netstat) antes de subir a nova; o `stop` mata
   launcher e daemon com `taskkill /PID /F /T` SILENCIOSO (windowsHide + ignore).
5. ABSORÇÃO DE SINAIS: SIGINT/SIGHUP absorvidos no Windows (sinal espúrio do
   MobaXterm ao perder foco/minimizar não pode derrubar nada).
6. GUARDA DA CONSOLA: `guardConsoleStream` absorve EPIPE (console fechado).
7. WATCHDOG COM TETO: reergue o daemon em quedas silenciosas, no máximo
   MAX_REINICIOS vezes (sem loop infinito de spawns).

Roda sozinho:  python tests/test_launcher_keepalive.py
Roda no pytest: pytest tests/test_launcher_keepalive.py
"""
import os
import sys

LAUNCHER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "cli.mjs")


def _conteudo() -> str:
    with open(LAUNCHER, "r", encoding="utf-8") as handle:
        return handle.read()


# ---------------------------------------------------------------------------
# 1) A trava do launcher são DOIS holds reais: socket HTTP (listen) + readline
#    (stdin do teclado). Nenhum dos dois sozinho segura o PTY do MobaXterm.
# ---------------------------------------------------------------------------

def test_trava_e_http_listen_real():
    content = _conteudo()
    assert "createServer" in content, "Servidor HTTP do launcher removido!"
    assert ".listen(" in content, "listen do socket HTTP removido — o terminal volta ao prompt!"
    # as travas que falharam no PTY do MobaXterm NÃO podem voltar
    assert "await new Promise(() => {})" not in content, "Trava promise infininta reintroduzida!"
    assert "keepAliveTimer" not in content, "Timer keep-alive como trava reintroduzido!"
    assert "setInterval(() => {}, 1000)" not in content, "Timer vazio como trava reintroduzido!"


def test_trava_readline_escuta_o_teclado():
    """O MobaXterm (PTY) encerra o Node se ele não escuta o stdin: o readline é
    o segundo hold, inseparável do listen HTTP ("casamento perfeito")."""
    content = _conteudo()
    assert "readline.createInterface" in content, "Trava readline (leitura do teclado) removida!"
    assert "input: process.stdin" in content, "Readline nao escuta o stdin!"
    assert "output: process.stdout" in content, "Readline nao escreve no terminal!"
    assert 'rl.on("close"' in content, "Handler de fechamento do readline (terminal fechou) removido!"


def test_readline_close_resiliente():
    """Terminal REAL fechado (stdin.isTTY) encerra o daemon e sai limpo; stdin
    NÃO-tty (pipe/redirecionamento/CI) NÃO pode derrubar o launcher — um EOF
    precoce mataria o servidor sem o usuário fechar nada."""
    content = _conteudo()
    assert "Terminal fechado. Encerrando" in content, "Mensagem de encerramento no close removida!"
    assert "process.stdin.isTTY" in content, "Guard isTTY removido — EOF de pipe derrubaria o launcher!"
    assert "matarArvore(backendPid)" in content, "Close do terminal não mata o daemon (órfão na porta)!"
    assert "launcher mantido" in content, "Ramo nao-tty (EOF precoce nao encerra) removido!"


def test_ui_serve_dist_e_proxyia_api():
    """A UI (Node) serve o frontend buildado e encaminha as rotas do backend."""
    content = _conteudo()
    assert "httpRequest" in content, "Proxy HTTP para o daemon Python removido!"
    assert '"/api"' in content, "Proxy de /api removido!"
    assert '"/legal"' in content, "Proxy de /legal removido!"
    assert '"/pages"' in content, "Proxy de /pages removido!"
    assert '"/track"' in content, "Proxy de /track (pixel) removido!"
    assert "index.html" in content, "SPA fallback (index.html) removido — rotas do React Router quebrariam!"
    assert "frontend" in content and "dist" in content, "Servidor do frontend/dist removido!"
    assert "API_PORT_DEFAULT" in content, "Porta da API (daemon Python) removida!"


# ---------------------------------------------------------------------------
# 2) Daemon Python isolado do terminal
# ---------------------------------------------------------------------------

def test_daemon_detached_unref_stdio_arquivo():
    content = _conteudo()
    assert "detached: true" in content, "detached removido — o Python morreria com o terminal!"
    assert "windowsHide: true" in content, "windowsHide removido — voltam as janelas de CMD!"
    assert 'stdio: ["ignore", logFd, logFd]' in content, "stdio em arquivo (app.log) removido!"
    assert ".unref()" in content, "unremovido — o launcher e o daemon morreriam juntos!"
    assert "cwd: rt" in content, "Daemon não executa do .runtime!"


def test_python_base_com_pythonpath():
    """Windows: binário BASE (pyvenv.cfg) + site-packages no PYTHONPATH."""
    content = _conteudo()
    assert "pyvenv.cfg" in content, "Leitura do Python base (pyvenv.cfg) removida!"
    assert "PYTHONPATH" in content, "PYTHONPATH do venv removido — o base não acha as dependências!"
    assert "pythonBaseBin" in content, "Função do binário base removida!"


# ---------------------------------------------------------------------------
# 3) Lock global + kill silencioso
# ---------------------------------------------------------------------------

def test_lock_global_prodmaker_pid():
    content = _conteudo()
    assert "prodmaker.pid" in content, "Lock global storage/prodmaker.pid removido!"
    assert "escreverPidGlobal" in content, "Escrita do lock removida!"
    assert "lerPidGlobal" in content, "Leitura do lock removida!"


def test_stop_mata_com_taskkill_silencioso():
    content = _conteudo()
    assert "taskkill" in content, "taskkill removido do stop!"
    assert '["/PID", String(pid), "/F", "/T"]' in content, "taskkill /PID /F /T removido!"
    assert "commandStop" in content, "Comando stop removido!"


def test_run_mata_instancias_antigas():
    content = _conteudo()
    assert "matarInstanciasAntigas" in content, "Kill preventivo de instâncias antigas removido!"
    assert "pidDaPorta" in content, "Varredura de portas (netstat) removida!"


# ---------------------------------------------------------------------------
# 4) Proteções invioláveis originais
# ---------------------------------------------------------------------------

def test_sinais_absorvidos_no_windows():
    content = _conteudo()
    assert "SIGINT no Windows" in content, "Absorção do SIGINT no Windows removida!"
    assert "SIGHUP no Windows" in content, "Absorção do SIGHUP no Windows removida!"


def test_guarda_da_consola_e_isolamento():
    content = _conteudo()
    assert "guardConsoleStream(process.stdout)" in content, "Guarda do stdout removida!"
    assert "guardConsoleStream(process.stderr)" in content, "Guarda do stderr removida!"
    assert "0x00000200" in content or "CREATE_NEW_PROCESS_GROUP" in content, "Isolamento de processos removido!"


def test_watchdog_com_teto():
    content = _conteudo()
    assert "MAX_REINICIOS" in content, "Teto de reinícios do watchdog removido (loop infinito de spawns)!"


if __name__ == "__main__":
    testes = [
        test_trava_e_http_listen_real,
        test_trava_readline_escuta_o_teclado,
        test_readline_close_resiliente,
        test_ui_serve_dist_e_proxyia_api,
        test_daemon_detached_unref_stdio_arquivo,
        test_python_base_com_pythonpath,
        test_lock_global_prodmaker_pid,
        test_stop_mata_com_taskkill_silencioso,
        test_run_mata_instancias_antigas,
        test_sinais_absorvidos_no_windows,
        test_guarda_da_consola_e_isolamento,
        test_watchdog_com_teto,
    ]
    falhas = 0
    for teste in testes:
        try:
            teste()
            print(f"[OK] {teste.__name__}")
        except AssertionError as exc:
            falhas += 1
            print(f"[FALHOU] {teste.__name__}: {exc}")
    print(f"\n{len(testes) - falhas}/{len(testes)} verificacoes passaram")
    sys.exit(1 if falhas else 0)
