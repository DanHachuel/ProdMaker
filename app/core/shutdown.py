"""Trava global de encerramento (shutdown lock).

Problema que resolve: ao pressionar Ctrl+C, o terminal mostrava tracebacks de
KeyboardInterrupt / asyncio.CancelledError antes do prompt voltar.

Mecanismo:
- `sys.excepthook` e `threading.excepthook` globais: KeyboardInterrupt e
  asyncio.CancelledError nunca sobem como traceback — o processo encerra na hora
  com `os._exit(0)`.
- O `uvicorn.run()` no entry point é protegido pelo mesmo `try/except`, então a
  trava continua valendo mesmo que outros módulos (ou rotas novas) mudem o
  comportamento.
- Telemetria do FastAPI desligada por variável de ambiente.

Instalar chamando `instalar()` — importado por `app/main.py` no load.
"""
import asyncio
import os
import sys
import threading

BLOQUEADOS = (KeyboardInterrupt, asyncio.CancelledError)


def _hook_anterior(atual) -> object:
    return getattr(atual, "__original__", None)


def _instalar_excepthooks() -> None:
    original_sys = sys.excepthook
    original_thread = threading.excepthook

    def sistema(exc_type, exc_value, exc_tb):
        if exc_type is not None and issubclass(exc_type, BLOQUEADOS):
            encerrar(0)
        original_sys(exc_type, exc_value, exc_tb)

    def thread(args):
        if args.exc_type is not None and issubclass(args.exc_type, BLOQUEADOS):
            encerrar(0)
        original_thread(args)

    sistema.__original__ = original_sys
    thread.__original__ = original_thread
    sys.excepthook = sistema
    threading.excepthook = thread


def desligar_telemetria() -> None:
    # FastAPI lê a variável em runtime; desligar banners/telemetria padrão.
    os.environ["FASTAPI_TELEMETRY"] = "false"
    os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")


def instalar() -> None:
    _instalar_excepthooks()
    desligar_telemetria()


def encerrar(codigo: int = 0) -> None:
    """Encerramento imediato e silencioso (sem flush de tracebacks)."""
    try:
        sys.stdout.flush()
    except Exception:  # noqa: BLE001
        pass
    os._exit(codigo)
