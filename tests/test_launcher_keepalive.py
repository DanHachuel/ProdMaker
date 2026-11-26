"""Teste de CI — regra inviolável da arquitetura do launcher (Windows/MobaXterm).

Lê o `scripts/cli.mjs` e falha se qualquer proteção contra o "app encerra
sozinho" / "janela preta de CMD" for removida. **Réplica do PandaNews
(`scripts/start.js`, hotfix 0.6.01/0.6.02):**

1. ÂNCORA DO LAUNCHER (`manterLauncherVivo`): timer com o MAIOR valor que o
   Node aceita (`2147483647` ≈ 24,8 dias — handle ativo que nunca dispara) em
   variável de módulo, mais `stdin.resume()` (mantém o TTY ligado, mas NÃO é a
   âncora). Com handle ativo o Event Loop não drena.
2. PORTA PÚBLICA ÚNICA: o daemon Python serve a UI (frontend/dist com SPA) E a
   API na MESMA porta — quem serve é o app, não um proxy Node. Se o launcher
   morrer, o SERVIDOR CONTINUA RESPONDENDO.
3. SINAIS (réplica do PandaNews): SIGINT/SIGTERM caem em `encerrarSessao`
   (daemon pela árvore /PID /T, lock limpo, saída limpa). SIGHUP (perda de foco
   do MobaXterm) é ABSORVIDO — não derruba nada.
4. DAEMON ISOLADO: `detached: true` + `windowsHide: true` +
   `creationFlags: CREATE_NEW_PROCESS_GROUP (0x00000200)` +
   `stdio: ['ignore', logFd, logFd]` (storage/logs/app.log) + `child.unref()`.
5. BINÁRIO BASE + PYTHONPATH (Windows): o `venv/Scripts/python.exe` é um
   redirecionador cujo processo NETO nasce sem as flags de ocultação e abre um
   console novo (a janela preta). Sobe-se o interpretador base (lido do
   `venv/pyvenv.cfg`) com o site-packages do venv no `PYTHONPATH`.
6. LOCK GLOBAL `storage/prodmaker.pid` + kill silencioso (`taskkill /PID /F /T`
   com windowsHide + stdio ignore).
7. CRASH.LOG: código + stack em toda saída — a prova de quem matou o processo.

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
# 1) ÂNCORA DO LAUNCHER — réplica exata do manterLauncherVivo do PandaNews
# ---------------------------------------------------------------------------

def test_ancora_keepalive_timer_maximo():
    """A âncora é um timer com o MAIOR valor aceito pelo Node (~24.8 dias):
    handle ativo que nunca dispara — o Event Loop não pode drenar."""
    content = _conteudo()
    assert "KEEPALIVE_INTERVAL_MS = 2147483647" in content, "Âncora com o timer máximo removida!"
    assert "manterLauncherVivo" in content, "Função da âncora removida!"
    # a chamada da âncora tem de estar no ESCOPO DO MÓDULO (topo do arquivo) —
    # antes de qualquer função de comando (install/run/stop/doctor)
    pos_chamada = content.find("manterLauncherVivo();")
    pos_primeiro_comando = min(
        i for i in (
            content.find("async function commandInstall"),
            content.find("async function commandRun"),
            content.find("async function commandStop"),
            content.find("async function commandDoctor"),
        ) if i > 0
    )
    assert 0 < pos_chamada < pos_primeiro_comando, "A âncora não está sendo chamada no topo do arquivo (escopo do módulo)!"


def test_ancora_nao_usa_unref():
    """A âncora NUNCA leva .unref() — handle desreferenciado não segura o loop."""
    content = _conteudo()
    linha = next((l for l in content.split("\n") if "setInterval(() => {}, KEEPALIVE_INTERVAL_MS)" in l), "")
    assert linha.strip(), "Linha da âncora não encontrada!"
    assert ".unref()" not in linha, "A âncora levou .unref() — o Event Loop pode drenar!"


def test_stdin_resume_nao_e_ancora():
    """Réplica do PandaNews: stdin.resume() mantém o TTY ligado (ajuda o Ctrl+C
    em terminais remotos), mas a âncora é o TIMER — não o stdin."""
    content = _conteudo()
    assert 'process.stdin.resume()' in content, "stdin.resume() removido (réplica do PandaNews)!"
    # e NÃO pode existir readline (o falso EOF do PTY já matou o launcher antes)
    assert "readline.createInterface" not in content, "readline reintroduzido (FALSO EOF no PTY)!"


def test_sinais_encerramento_limpo():
    """Réplica do PandaNews: SIGINT/SIGTERM caem em `encerrarSessao` (daemon pela
    árvore, lock limpo, saída limpa) — NUNCA process.exit solto no handler.
    SIGHUP (perda de foco do MobaXterm) é ABSORVIDO: não derruba nada."""
    content = _conteudo()
    assert "encerrarSessao" in content, "Encerramento gracioso (réplica PandaNews) removido!"
    assert 'process.on("SIGINT", () => encerrarSessao' in content, "SIGINT não passa pelo encerrarSessao!"
    assert 'process.on("SIGTERM", () => encerrarSessao' in content, "SIGTERM não passa pelo encerrarSessao!"
    # SIGHUP absorvido (só log)
    assert 'process.on("SIGHUP"' in content, "Handler de SIGHUP removido!"
    assert "ABSORVIDO" in content, "SIGHUP deixou de ser absorvido!"
    # o handler de sinal NUNCA chama exit direto
    import re
    for sinal in ("SIGINT", "SIGTERM"):
        m = re.search(rf'process\.on\("{sinal}"[^\n]*\n(?:[^\n]*\n){{0,3}}?', content)
        assert m, f"Handler de {sinal} removido!"
        assert "process.exit" not in m.group(0), f"Handler de {sinal} voltou a chamar process.exit — sinal espúrio mataria o launcher!"


def test_porta_publica_unica():
    """O daemon serve UI+API na MESMA porta (o app serve o dist): se o launcher
    Node morrer, o SERVIDOR CONTINUA RESPONDENDO na porta."""
    content = _conteudo()
    assert "spawnDaemon(home, rt, port)" in content, "O daemon não está subindo na porta pública!"
    assert "waitReady(port)" in content, "A espera de prontidão não usa a porta pública!"
    # o run não pode mais criar o proxy de UI (caminho que morria com o Node)
    run = content.split("async function commandRun")[1].split("async function commandStop")[0]
    assert "listenUi(" not in run, "O run voltou a usar o proxy Node de UI (porta morre com o launcher)!"


def test_atalho_direto_sem_npx():
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


def test_heartbeat_datavel():
    """Morte por kill externo (sem handler de exit) tem que ficar datável:
    heartbeat gravado a cada 10s e lido pelo doctor."""
    content = _conteudo()
    assert "launcher-heartbeat" in content, "Heartbeat removido — morte por kill externo vira mistério!"
    assert "setInterval(bater, 10000)" in content, "Heartbeat não está sendo gravado periodicamente!"


def test_sem_cross_spawn_no_caminho_critico():
    """O daemon sobe com spawn NATIVO: o cross-spawn embrulha em cmd.exe no
    Windows e pode rasgar detached/windowsHide/creationFlags/stdio (a tríade)."""
    content = _conteudo()
    assert "nodeSpawn(bin" in content, "Daemon voltou a usar cross-spawn (wrapper cmd.exe)!"
    # o filtro que matava o entry point de QUALQUER projeto não pode voltar
    assert "LIKE '%-m app.main%'" not in content, "Varredura CIM genérica (cross-fire entre projetos) reintroduzida!"


def test_matar_tem_travas_anti_auto_sabotagem():
    """Nenhum taskkill pode pegar o próprio launcher, seus ancestrais ou
    processo sem prova de posse (foi a hipótese central do 'encerra sozinho')."""
    content = _conteudo()
    assert "pidsAncestrais" in content, "Proteção de ancestrais removida!"
    assert "processoEhNosso" in content, "Prova de posse antes de matar removida!"
    assert "KILL-BLOQUEADO" in content, "Log de kill bloqueado removido!"
    # toda morte nossa tem motivo registrado
    assert content.count('motivo: "') >= 6, "Kills sem motivo registrado (forense impossível)!"


def test_sem_dependencia_de_teclado_exceto_ttv():
    """Sem readline/listeners de dados: só o `stdin.resume()` do PandaNews
    (mantém o TTY ligado, não é âncora)."""
    content = _conteudo()
    assert "readline.createInterface" not in content, "readline reintroduzido (FALSO EOF no PTY)!"
    assert "process.stdin.on(" not in content, "Listener de dados no stdin reintroduzido!"
    assert 'process.stdin.resume()' in content, "stdin.resume() (réplica PandaNews) removido!"


def test_atalho_direto_sem_npx():
    """O install gera `prodmaker.cmd` no home chamando o Node no launcher que
    está DENTRO do .runtime — o npx sai da execução do dia a dia."""
    content = _conteudo()
    assert "gerarAtalhoCmd" in content, "Gerador do prodmaker.cmd removido!"
    assert "prodmaker.cmd" in content, "Atalho prodmaker.cmd removido!"
    assert "scripts/cli.mjs" in content, "Launcher não está sendo copiado para o .runtime!"
    assert 'node "${launcher}" %*' in content, "O .cmd não chama o Node diretamente!"


def test_servidor_ui_alerta_de_fechamento():
    """Se o socket da UI fechar, registramos no crash.log — NUNCA damos exit."""
    content = _conteudo()
    assert 'server.on("close"' in content, "Alerta de fechamento do servidor de UI removido!"
    assert "ALERTA: o servidor HTTP da UI foi fechado" in content, "Mensagem de alerta removida!"


def test_pid_da_porta_match_exato():
    """:8188 não pode casar com :81880/:18188 — match frouxo matava inocentes."""
    content = _conteudo()
    assert '":" + port + "\\\\s"' in content or '":" + port + "\\s"' in content, "pidDaPorto voltou ao match frouxo (findstr)!"
    assert 'findstr :" + port' not in content, "Varredura de porta por substring (findstr) reintroduzida!"


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
    # DECLARAÇÃO, não apenas uso: sem o `const`, o caminho de falha do watchdog
    # estourava ReferenceError silencioso e o daemon NUNCA era reerguido
    # (hotfix 0.1.61 — a string deuso existia, a constante não).
    assert "const MAX_REINICIOS = " in content, "Declaração do teto de reinícios removida!"
    assert "const FALHAS_PARA_REINICIAR = " in content, "Declaração do gatilho de falhas removida!"
    assert "[WATCHDOG] falha" in content, "Log de batida do watchdog removido (falha indebugável)!"


def test_espelho_de_logs_do_daemon():
    """O terminal ACOMPANHA o Python: linhas novas de app.log são ecoadas com o
    prefixo [daemon]. Proibido usar stdio 'pipe' para isso — pipe fechado na
    morte do launcher derrubaria o daemon com BrokenPipe."""
    content = _conteudo()
    assert "espelharLogsDoDaemon" in content, "Espelho do log do daemon removido — terminal cego!"
    assert "[daemon] " in content, "Prefixo [daemon] do espelho removido!"
    assert 'stdio: ["ignore", logFd, logFd]' in content, "Stdio do daemon mudou — só pode ser FD de arquivo!"


def test_alarme_quando_daemon_morre():
    """Morte do daemon NÃO passa em silêncio: [ERRO FATAL] imediato + últimas
    linhas do app.log (também no daemon reerguido pelo watchdog)."""
    content = _conteudo()
    assert "[ERRO FATAL] O servidor Python morreu" in content, "Alarme de morte do daemon removido!"
    assert 'filhoAtual.on("exit"' in content or 'filho.on("exit"' in content, "Vigia do exit do daemon removida!"
    assert "vigiarDaemon(novo)" in content, "Daemon reerguido pelo watchdog ficou sem vigia!"


def test_debug_log_append_nao_sobrescreve():
    """launcher-debug.log é APPEND com rotação por tamanho — a prova do que
    aconteceu entre sessões (morte silenciosa) vivia no rodapé do log anterior."""
    content = _conteudo()
    assert "appendFileSync(LAUNCHER_DEBUG_LOG" in content, "Debug log voltou a sobrescrever!"
    assert "1024 * 1024" in content, "Rotação por tamanho do debug log removida!"


MAIN_PY = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "main.py")


def test_app_registra_prova_de_boot():
    """O FastAPI grava uma linha de boot no app.log (versão/porta/frontend): sem
    ela, a morte silenciosa do daemon não deixa rasto algum."""
    with open(MAIN_PY, "r", encoding="utf-8") as handle:
        content = handle.read()
    assert "ouvindo em http://127.0.0.1" in content, "Prova de boot no app.log removida!"
    assert "app.log" in content, "Escrita da prova de boot no app.log removida!"


if __name__ == "__main__":
    testes = [
        test_ancora_keepalive_timer_maximo,
        test_ancora_nao_usa_unref,
        test_stdin_resume_nao_e_ancora,
        test_sem_dependencia_de_teclado_exceto_ttv,
        test_sinais_encerramento_limpo,
        test_porta_publica_unica,
        test_readline_removido,
        test_sinais_nunca_chamam_exit,
        test_comandos_terminais_encerram_explicito,
        test_interceptor_de_saida_crash_log,
        test_heartbeat_datavel,
        test_sem_cross_spawn_no_caminho_critico,
        test_matar_tem_travas_anti_auto_sabotagem,
        test_pid_da_porta_match_exato,
        test_atalho_direto_sem_npx,
        test_daemon_detached_unref_stdio_arquivo,
        test_python_base_com_pythonpath,
        test_espelho_de_logs_do_daemon,
        test_alarme_quando_daemon_morre,
        test_debug_log_append_nao_sobrescreve,
        test_app_registra_prova_de_boot,
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
