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
    assert "await new Promise(() => {})" not in content, "Trava promise infinita reintroduzida!"
    assert "keepAliveTimer" not in content, "Timer keep-alive como trava reintroduzido!"
    assert "setInterval(() => {}, 1000)" not in content, "Timer vazio de 1s como trava reintroduzido!"


def test_trava_global_setinterval_sem_unref():
    """TRAVA GLOBAL INQUEBRÁVEL: setInterval no topo do arquivo (escopo global,
    fora de funções), NUNCA com .unref() — o Event Loop não esvazia de jeito
    nenhum (PTY do MobaXterm, EOF espúrio, stdin fechado)."""
    content = _conteudo()
    assert "setInterval(() => {}, 60000)" in content, "Trava global de 60s removida!"
    # a LINHA da trava global não pode chamar .unref() (só o código, não o comentário)
    linha = next((l for l in content.split("\n") if "setInterval(() => {}, 60000)" in l), "")
    codigo = linha.split("//")[0]
    assert ".unref()" not in codigo, "A trava global NÃO pode levar .unref()!"
    # precisa estar no ESCOPO GLOBAL: antes da primeira função declarada
    pos = content.find("setInterval(() => {}, 60000)")
    primeira_funcao = content.find("function ")
    assert 0 < pos < primeira_funcao, "A trava global deve estar no topo do arquivo, fora de funções!"


def test_readline_removido():
    """O readline causava FALSO EOF no PTY do MobaXterm (isTTY=true) e matava o
    launcher no meio da execução — foi removido de propósito."""
    content = _conteudo()
    assert "readline.createInterface" not in content, "readline reintroduzido (FALSO EOF derruba o launcher)!"
    assert 'import readline' not in content, "Import do readline reintroduzido!"
    assert "Terminal fechado. Encerrando" not in content, "Handler de close do readline reintroduzido!"


def test_sinais_nunca_chamam_exit():
    """NENHUM handler de sinal chama process.exit — absorção total (o MobaXterm
    envia sinais espúrios; qualquer exit derruba a stack)."""
    content = _conteudo()
    # os handlers devem ser de absorção pura (apenas registram)
    assert "ABSORVIDO" in content, "Absorção de sinais (log-only) removida!"
    # entre o registro do SIGINT e o fim do bloco de handlers não pode haver exit
    import re

    for sinal in ("SIGINT", "SIGHUP", "SIGTERM"):
        m = re.search(rf'process\.on\("{sinal}"[^\n]*\n(?:[^\n]*\n){{0,4}}?', content)
        assert m, f"Handler de {sinal} removido!"
        bloco = m.group(0)
        assert "process.exit" not in bloco, f"Handler de {sinal} voltou a chamar process.exit — sinal espúrio mataria o launcher!"


def test_comandos_terminais_encerram_explicito():
    """Com o timer global no ar, install/doctor/stop PRECISAM encerrar com
    process.exit(0) explícito — senão ficariam pendurados para sempre."""
    content = _conteudo()
    for cmd in ("commandInstall", "commandDoctor", "commandStop"):
        i = content.find(f"async function {cmd}")
        assert i > 0, f"{cmd} removido!"
        bloco = content[i : content.find("\n}\n", i)]
        assert "process.exit(0)" in bloco, f"{cmd} não encerra explicitamente — penduraria com o timer global!"


def test_interceptor_de_saida_crash_log():
    """A prova de quem matou o processo: código + stack em storage/logs/crash.log."""
    content = _conteudo()
    assert "crash.log" in content, "Interceptor de saída (crash.log) removido!"
    assert "rastro de saida" in content, "Stack da saída não está sendo gravado!"


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
    assert "ABSORVIDO" in content, "Absorção de sinais (log-only) removida!"
    for sinal in ("SIGINT", "SIGHUP", "SIGTERM"):
        assert f'process.on("{sinal}"' in content, f"Absorção do {sinal} removida!"


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
        test_trava_global_setinterval_sem_unref,
        test_readline_removido,
        test_sinais_nunca_chamam_exit,
        test_comandos_terminais_encerram_explicito,
        test_interceptor_de_saida_crash_log,
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
