"""Teste de CI — regra inviolável da arquitetura do launcher (Windows/MobaXterm).

Lê o `scripts/cli.mjs` e falha se qualquer uma das 4 proteções contra o
"app encerra sozinho" for removida:

1. Keep-alive: `setInterval(() => {}, 1000)` mantém o Event Loop do Node vivo.
2. Absorção de sinais: SIGINT/SIGHUP são ABSORVIDOS no Windows (sinal espúrio
   do MobaXterm ao perder foco/minimizar não pode derrubar o launcher).
3. Guarda da consola: `guardConsoleStream` absorve EPIPE (terminal fechado) e
   espelha os logs em arquivo.
4. Isolamento de workers: filhos sobem com CREATE_NEW_PROCESS_GROUP (0x00000200)
   — não herdam os sinais do terminal.

Roda sozinho:  python tests/test_launcher_keepalive.py
Roda no pytest: pytest tests/test_launcher_keepalive.py
"""
import os
import sys

LAUNCHER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts", "cli.mjs")


def _conteudo() -> str:
    with open(LAUNCHER, "r", encoding="utf-8") as handle:
        return handle.read()


def test_launcher_keepalive_and_isolation():
    with open(LAUNCHER, "r", encoding="utf-8") as handle:
        content = handle.read()

    assert "setInterval(() => {}, 1000)" in content, "Keep-Alive removido!"
    assert "0x00000200" in content or "CREATE_NEW_PROCESS_GROUP" in content, "Isolamento removido!"
    assert "guardConsoleStream" in content, "Guarda de consola removida!"
    assert "guardConsoleStream(process.stdout)" in content, "Guarda do stdout removida!"
    assert "guardConsoleStream(process.stderr)" in content, "Guarda do stderr removida!"


def test_sinais_absorvidos_no_windows():
    """No Windows, SIGINT e SIGHUP NAO podem encerrar o launcher (sinal espúrio)."""
    content = _conteudo()
    # O bloco de absorção existe e registra os dois sinais como ABSORVIDOS.
    assert "ABSORVIDO" in content, "Absorcao de sinais (Windows) removida!"
    assert "SIGINT no Windows" in content, "Absorcao do SIGINT no Windows removida!"
    assert "SIGHUP no Windows" in content, "Absorcao do SIGHUP no Windows removida!"


def test_comando_stop_disponivel():
    """O encerramento real no Windows vem de `prodmaker stop`."""
    content = _conteudo()
    assert "commandStop" in content, "Comando stop removido!"
    assert '"stop"' in content or "'stop'" in content, "Comando stop nao registrado no dispatcher!"


if __name__ == "__main__":
    testes = [
        test_launcher_keepalive_and_isolation,
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
