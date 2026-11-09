"""Teste de CI — arquitetura de RUNTIME PERMANENTE (fim do EBUSY do npx).

O servidor NUNCA pode rodar do cache do npx (.npm/_npx/...): com processos
rodando de lá, os arquivos ficam travados e qualquer atualização falha com
EBUSY. Regra (AGENTS.md):

- `install` copia o código para `PRODMAKER_HOME/.runtime` e NÃO roda servidor;
- `run` executa SEMPRE do `.runtime` (spawn com cwd no runtime);
- `storage/` (banco, logs, chaves) continua na RAIZ do PRODMAKER_HOME.

Roda sozinho:  python tests/test_runtime_architecture.py
Roda no pytest: pytest tests/test_runtime_architecture.py
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAUNCHER = os.path.join(RAIZ, "scripts", "cli.mjs")


def _conteudo() -> str:
    with open(LAUNCHER, "r", encoding="utf-8") as handle:
        return handle.read()


def test_runtime_dir_definido():
    """A pasta fixa do runtime é PRODMAKER_HOME/.runtime."""
    content = _conteudo()
    assert '".runtime"' in content, "Diretorio .runtime removido!"
    assert "runtimeDir(" in content, "Helper runtimeDir() removido!"


def test_install_copia_sem_rodar():
    """install = cópia (idempotente) + encerra; nunca sobe o servidor."""
    content = _conteudo()
    assert "prepararRuntime" in content, "Funcao de copia do runtime removida!"
    assert "cpSync" in content, "Copia recursiva (fs.cpSync) removida!"
    assert "matarProcessosDoRuntime" in content, "Kill preventivo (EBUSY) removido!"
    # o install NAO chama commandRun/startPython
    trecho_install = content.split("async function commandInstall")[1].split("async function commandRun")[0]
    assert "startPython" not in trecho_install, "install voltou a rodar o servidor!"
    assert "prepararRuntime(rt)" in trecho_install, "install nao prepara o runtime!"


def test_run_executa_do_runtime():
    """run spawna o Python com cwd no .runtime (nunca no cache do npx)."""
    content = _conteudo()
    assert "cwd: rt" in content, "Spawn do servidor nao usa o runtime como cwd!"
    assert 'path.join(rt, "app", "main.py")' in content, "run nao valida o backend no runtime!"
    assert "fetchMasterCode(python, home, rt)" in content, "fetchMasterCode nao le do runtime!"


def test_runtime_sobrescreve_pacote_npx():
    """A lista de itens copiados cobre o que o app precisa para rodar."""
    content = _conteudo()
    for item in ('"app"', '"frontend/dist"', '"requirements.txt"', '"package.json"'):
        assert item in content, f"Item do runtime removido: {item}"


def test_storage_fora_do_runtime():
    """O storage continua na RAIZ do PRODMAKER_HOME (dados sobrevivem a updates)."""
    content = _conteudo()
    assert 'path.join(home, ".runtime")' in content or 'path.join(home || resolveHome(), ".runtime")' in content, \
        "runtime nao esta dentro de home (nao pode ser path absoluto aleatorio)"
    assert "storagePath(home" in content, "storage do usuario removido do home!"


if __name__ == "__main__":
    testes = [
        test_runtime_dir_definido,
        test_install_copia_sem_rodar,
        test_run_executa_do_runtime,
        test_runtime_sobrescreve_pacote_npx,
        test_storage_fora_do_runtime,
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
