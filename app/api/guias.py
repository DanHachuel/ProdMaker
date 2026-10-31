"""Guias de referência (seed/references) — servidos para a página FAQ/Documentação."""
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/guias", tags=["guias"])

REFERENCES_DIR = Path(__file__).resolve().parent.parent.parent / "seed" / "references"


@router.get("")
def listar():
    guias = []
    if REFERENCES_DIR.exists():
        for path in sorted(REFERENCES_DIR.glob("*.md")):
            try:
                titulo = ""
                linhas = path.read_text(encoding="utf-8").splitlines()
                if linhas and linhas[0].startswith("#"):
                    titulo = linhas[0].lstrip("#").strip()
                guias.append({"arquivo": path.name, "titulo": titulo or path.stem, "chars": len(path.read_text(encoding="utf-8"))})
            except Exception:  # noqa: BLE001
                continue
    return guias


@router.get("/{arquivo}")
def ler(arquivo: str):
    if "/" in arquivo or ".." in arquivo or not arquivo.endswith(".md"):
        raise HTTPException(status_code=400, detail="Arquivo inválido.")
    path = (REFERENCES_DIR / arquivo).resolve()
    if not path.is_file() or REFERENCES_DIR.resolve() not in path.parents:
        raise HTTPException(status_code=404, detail="Guia não encontrado.")
    return {"arquivo": path.name, "conteudo": path.read_text(encoding="utf-8")}
