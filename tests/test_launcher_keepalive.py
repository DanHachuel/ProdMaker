"""Teste de CI — regra inviolável da arquitetura do launcher (Windows/MobaXterm).

Lê o `scripts/cli.mjs` e falha se qualquer proteção contra o "app encerra
sozinho" for removida:

1. Trava DEFINITIVA (readline): `readline.createInterface({ input: process.stdin,
   output: process.stdout })` é o que segura o Node no terminal — o MobaXterm
   (pseudo-terminal) encerra o Node se ele NÃO estiver escutando ativamente o
   stdin. No `rl.on('close')` (terminal fechado) o launcher mata o Python e sai.
2. Absorção de sinais: SIGINT/SIGHUP são ABSORVIDOS no Windows (sinal espúrio do
   MobaXterm ao perder foco/minimizar não pode derrubar o launcher).
3. Guarda da consola: `guardConsoleStream` absorve EPIPE (terminal fechado) e
   espelha os logs em arquivo.
4. Isolamento de workers: filhos sobem com CREATE_NEW_PROCESS_GROUP (0x00000200) —
   não herdam os sinais do terminal.

Roda sozinho:  python tests/test_launcher_keepalive.py
Roda no pytest: pytest tests/test_launcher_keepalive.py
"""
import os
import sys

LAUNCHER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "cli.mjs")


def _conteudo() -> str:
    with open(LAUNCHER, "r", encoding="utf-8") as handle:
        return handle.read()


def test_trava_readline_e_isolation():
    content = _conteudo()

    # (1) Trava definitiva: readline ouvindo o terminal (stdin/stdout).
    assert "readline.createInterface" in content, "Trava readline (leitura do terminal) removida!"
    assert "input: process.stdin" in content, "Readline nao escuta o stdin!"
    assert "output: process.stdout" in content, "Readline nao escreve no terminal!"
    assert "rl.on(\"close\"" in content, "Handler de fechamento do readline (terminal fechou) removido!"
    # (2) Isolamento do worker (grupo proprio - imune ao CTRL_C do console).
    assert "0x00000200" in content or "CREATE_NEW_PROCESS_GROUP" in content, "Isolamento removido!"
    # (3) Guarda da consola (EPIPE).
    assert "guardConsoleStream(process.stdout)" in content, "Guarda do stdout removida!"
    assert "guardConsoleStream(process.stderr)" in content, "Guarda do stderr removida!"


def test_close_do_readline_encerra_o_servidor():
    """Terminal fechado (readline close) DEVE encerrar o Python e sair (sem orfao)."""
    content = _conteudo()
    assert "Terminal fechado. Encerrando" in content, "Mensagem de encerramento no close removida!"
    assert "killChild()" in content, "killChild (matar o Python) nao usado no close!"
    assert "process.exit(0)" in content, "Saida limpa no close do readline removida!"


def test_sinais_absorvidos_no_windows():
    """No Windows, SIGINT e SIGHUP NAO podem encerrar o launcher (sinal espurio)."""
    content = _conteudo()
    assert "ABSORVIDO" in content, "Absorcao de sinais (Windows) removida!"
    assert "SIGINT no Windows" in content, "Absorcao do SIGINT no Windows removida!"
    assert "SIGHUP no Windows" in content, "Absorcao do SIGHUP no Windows removida!"


def test_comando_stop_disponivel():
    """O encerramento real no Windows vem de `prodmaker stop`/taskkill."""
    content = _conteudo()
    assert "commandStop" in content, "Comando stop removido!"
    assert '"stop"' in content or "'stop'" in content, "Comando stop nao registrado no dispatcher!"


if __name__ == "__main__":
    testes = [
        test_trava_readline_e_isolation,
        test_close_do_readline_encerra_o_servidor,
        test_sinais_absorvidos_no_windows,
        test_comando_stop_disponivel,
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
