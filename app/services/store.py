"""Storage e settings locais (compartilhados entre rotas e serviços)."""
import json
import os
from pathlib import Path

from fastapi import HTTPException

PRODMAKER_HOME = Path(os.environ.get("PRODMAKER_HOME", str(Path.home() / "ProdMaker")))
STORAGE = PRODMAKER_HOME / "storage"
STATE = STORAGE / "state"

DEFAULT_SETTINGS = {
    "schema": 1,
    "port": 8188,
    "language": "pt-BR",
    "theme": "light",
    "api_keys": {},
    "llm": {"providers": []},
}


def ensure_state_dir() -> None:
    STATE.mkdir(parents=True, exist_ok=True)


def get_master_code() -> str:
    """Código de Ativação Mestre — aceito com qualquer e-mail no login local.

    Pode ser sobrescrito pela variável de ambiente PRODMAKER_MASTER_CODE.
    O alias literal 'admin' também é sempre aceito (ver app.main.is_master_code).
    """
    code = (os.environ.get("PRODMAKER_MASTER_CODE") or "").strip()
    return code or "1234"


def get_settings() -> dict:
    settings_path = STATE / "settings.json"
    if not settings_path.exists():
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
        merged = json.loads(json.dumps(DEFAULT_SETTINGS))
        merged.update(data)
        if not isinstance(merged.get("llm"), dict):
            merged["llm"] = {"providers": []}
        if not isinstance(merged.get("api_keys"), dict):
            merged["api_keys"] = {}
        return merged
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="settings.json corrompido — leitura protegida. Restaure o arquivo manualmente.",
        )


def save_settings(data: dict) -> dict:
    ensure_state_dir()
    settings_path = STATE / "settings.json"
    if settings_path.exists():
        try:
            json.loads(settings_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            backup = STATE / "settings.corrupt.json"
            backup.write_text(settings_path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
            raise HTTPException(
                status_code=500,
                detail="settings.json corrompido — cópia preservada em settings.corrupt.json.",
            )
    settings_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
