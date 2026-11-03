"""Logging persistente — terminal + arquivo (storage/logs/app.log).

- Qualquer entry (uvicorn CLI ou `python -m app.main`) instala o handler de arquivo.
- Exceções não tratadas (sys.excepthook) são gravadas no arquivo — se o servidor
  cair, a prova do motivo fica registrada para a próxima execução.
"""
import logging
import os
import sys
import traceback
from pathlib import Path

_CONFIGURED = False
LOG_PATH = None


def _log_path() -> Path:
    global LOG_PATH
    if LOG_PATH is None:
        home = Path(os.environ.get("PRODMAKER_HOME", str(Path.home() / "ProdMaker")))
        log_dir = home / "storage" / "logs"
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
        LOG_PATH = log_dir / "app.log"
    return LOG_PATH


def _file_formatter() -> logging.Formatter:
    return logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", "%Y-%m-%d %H:%M:%S")


def configure() -> str:
    """Anexa handler de arquivo ao root e aos loggers do uvicorn. Idempotente."""
    global _CONFIGURED
    path = _log_path()
    if not _CONFIGURED:
        try:
            handler = logging.FileHandler(path, encoding="utf-8")
            handler.setFormatter(_file_formatter())
            handler.setLevel(logging.INFO)
            root = logging.getLogger()
            root.setLevel(logging.INFO)
            if not any(isinstance(h, logging.FileHandler) for h in root.handlers):
                root.addHandler(handler)
            for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "app"):
                logger = logging.getLogger(name)
                if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
                    logger.addHandler(handler)
            _excepthook(path)
        except OSError:
            pass
        _CONFIGURED = True
    return str(path)


def _excepthook(path: Path) -> None:
    original = sys.excepthook

    def hook(exc_type, exc_value, exc_tb):
        try:
            with open(path, "a", encoding="utf-8") as handle:
                handle.write("=== UNHANDLED EXCEPTION ===\n")
                handle.write("".join(traceback.format_exception(exc_type, exc_value, exc_tb)))
        except Exception:  # noqa: BLE001 — logging nunca pode quebrar o processo
            pass
        original(exc_type, exc_value, exc_tb)

    sys.excepthook = hook


def uvicorn_log_config() -> dict:
    """dictConfig para uvicorn.run — console + arquivo."""
    log_path = str(_log_path()).replace("\\", "/")
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {"format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s", "datefmt": "%Y-%m-%d %H:%M:%S"},
            "access": {"format": '%(asctime)s [%(levelname)s] %(client_addr)s - "%(request_line)s" %(status_code)s'},
        },
        "handlers": {
            "default": {"class": "logging.StreamHandler", "formatter": "default", "stream": "ext://sys.stderr"},
            "access": {"class": "logging.StreamHandler", "formatter": "access", "stream": "ext://sys.stdout"},
            "file": {"class": "logging.FileHandler", "formatter": "default", "filename": log_path, "encoding": "utf-8"},
        },
        "loggers": {
            "uvicorn": {"handlers": ["default", "file"], "level": "INFO", "propagate": False},
            "uvicorn.error": {"handlers": ["default", "file"], "level": "INFO", "propagate": False},
            "uvicorn.access": {"handlers": ["access", "file"], "level": "INFO", "propagate": False},
            "app": {"handlers": ["default", "file"], "level": "INFO", "propagate": False},
        },
    }
