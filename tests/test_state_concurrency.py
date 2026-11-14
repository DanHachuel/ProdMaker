"""Teste de CI — State Concurrency Guard (estrutura preparada).

Regra (ver `.agents/skills/state-concurrency-guard/SKILL.md`):

- SQLite com `PRAGMA journal_mode=WAL` — leituras concorrentes + 1 escritor;
- JSON de estado compartilhado NUNCA com `writeFileSync` direto: escrita em
  `.tmp` + `renameSync` (atômica), transação `BEGIN IMMEDIATE` quando a
  leitura+escrita precisa de seção crítica;
- o lock global (`storage/prodmaker.pid`) mora no HOME, nunca em `.runtime`
  (limpo no install) nem no pacote npm (apagado pelo npx ao atualizar);
- leitura de lock corrompido nunca pode impedir o arranque (try/catch + null).

Este arquivo é a ESTRUTURA: os testes entram aqui antes de considerarem uma
mudança de concorrência "pronta". Roda sozinho e no CI:

    python tests/test_state_concurrency.py
    pytest tests/test_state_concurrency.py
"""
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_estrutura_preparada():
    """Placeholder documentado — as verificações reais entram nesta suite."""
    assert os.path.isdir(RAIZ), "Raiz do projeto nao encontrada!"


if __name__ == "__main__":
    testes = [test_estrutura_preparada]
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