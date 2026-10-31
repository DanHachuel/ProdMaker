"""Pinterest — orgânico: ideias de pins por IA, gestão local e agendamento best-effort.

Criação de imagens é feita pelo usuário (Canva/IA) no formato 1000x1500 — o ProdMaker
entrega título/descrição/texto da imagem/sugestão. O agendamento usa py3-pinterest
(import preguiçoso) quando as credenciais estão em Chaves de API.
"""
import csv
import io
import json
from pathlib import Path

from .database import get_db, now_str, row_to_dict
from .llm import LLMError, generate
from .store import get_settings

SEED_DIR = Path(__file__).resolve().parent.parent.parent / "seed"


def _config() -> dict:
    keys = (get_settings().get("api_keys") or {}).get("pinterest") or {}
    return {
        "email": (keys.get("email") or "").strip(),
        "password": (keys.get("password") or "").strip(),
        "board": (keys.get("board") or "").strip(),
    }


def gerar_ideias(produto: dict, board: str = "", link: str = "", quantidade: int = 10) -> dict:
    template_path = SEED_DIR / "prompts" / "pins.md"
    template = template_path.read_text(encoding="utf-8") if template_path.exists() else (
        'Crie {QUANTIDADE} ideias de Pins para {NOME_DO_PRODUTO} no formato '
        '{"pins":[{"titulo_pin":"","descricao":"","texto_na_imagem":"","sugestao_imagem":""}]}'
    )
    prompt = (
        template.replace("{QUANTIDADE}", str(quantidade))
        .replace("{NOME_DO_PRODUTO}", produto.get("nome") or "")
        .replace("{DOR}", produto.get("nicho") or "")
    )
    result = generate(
        prompt,
        system="Você é um especialista em Pinterest SEO. Responda SOMENTE com JSON válido, sem markdown.",
        max_tokens=4000,
    )
    try:
        data = _clean_json(result["text"])
        parsed = json.loads(data)
    except Exception as exc:  # noqa: BLE001
        raise LLMError(f"Resposta do LLM não trouxe JSON utilizável: {exc}") from exc
    pins_raw = parsed.get("pins") or []
    timestamp = now_str()
    criados = []
    for item in pins_raw:
        if not isinstance(item, dict):
            continue
        titulo = (item.get("titulo_pin") or "").strip()
        if not titulo:
            continue
        with get_db() as conn:
            cursor = conn.execute(
                "INSERT INTO pins (produto_id, titulo, descricao, texto_imagem, sugestao_imagem, board, link, status, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ideia', ?, ?)",
                (
                    produto.get("id"),
                    titulo[:120],
                    (item.get("descricao") or "")[:500],
                    (item.get("texto_na_imagem") or "")[:200],
                    (item.get("sugestao_imagem") or "")[:200],
                    board or _config()["board"],
                    link,
                    result["provider"],
                    timestamp,
                ),
            )
            criados.append(row_to_dict(conn.execute("SELECT * FROM pins WHERE id = ?", (cursor.lastrowid,)).fetchone()))
    return {"gerados": len(criados), "provider": result["provider"]}


def _clean_json(text: str) -> str:
    import re

    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    return match.group(0) if match else cleaned


def listar(produto_id: int | None = None) -> list[dict]:
    query = "SELECT * FROM pins"
    params: tuple = ()
    if produto_id:
        query += " WHERE produto_id = ?"
        params = (produto_id,)
    query += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(row) for row in rows]


def marcar(pin_id: int, status: str) -> dict:
    validos = {"ideia", "pronto", "agendado", "publicado"}
    if status not in validos:
        raise LLMError(f"Status inválido: {status}")
    with get_db() as conn:
        cursor = conn.execute("UPDATE pins SET status = ? WHERE id = ?", (status, pin_id))
        if cursor.rowcount == 0:
            raise LLMError("Pin não encontrado.")
        row = conn.execute("SELECT * FROM pins WHERE id = ?", (pin_id,)).fetchone()
    return row_to_dict(row)


def remover(pin_id: int) -> None:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM pins WHERE id = ?", (pin_id,))
        if cursor.rowcount == 0:
            raise LLMError("Pin não encontrado.")


def exportar_csv(pin_ids: list[int]) -> str:
    with get_db() as conn:
        placeholders = ",".join("?" * len(pin_ids)) if pin_ids else "0"
        rows = conn.execute(f"SELECT * FROM pins WHERE id IN ({placeholders}) ORDER BY id", pin_ids).fetchall()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["titulo_pin", "descricao", "texto_na_imagem", "sugestao_imagem", "board", "link"])
    for row in rows:
        writer.writerow([row["titulo"], row["descricao"], row["texto_imagem"], row["sugestao_imagem"], row["board"], row["link"]])
    return buffer.getvalue()


def agendar(pin_id: int, imagem_path: str = "") -> dict:
    """Agenda um pin via py3-pinterest (best-effort). Sem imagem/credenciais: erro honesto.

    O upload da imagem depende de um arquivo local (criado no Canva/IA pelo usuário).
    """
    config = _config()
    if not config["email"] or not config["password"]:
        raise LLMError("Pinterest requer e-mail e senha em Chaves de API (card Pinterest).")
    if not imagem_path:
        raise LLMError(
            "Informe o caminho da imagem local do pin (1000x1500). "
            "Crie a imagem no Canva/IA e salve — o agendamento usa o arquivo local."
        )
    with get_db() as conn:
        row = conn.execute("SELECT * FROM pins WHERE id = ?", (pin_id,)).fetchone()
    if not row:
        raise LLMError("Pin não encontrado.")
    pin = row_to_dict(row)
    try:
        from py3_pinterest import Pinterest, PinterestLogin  # noqa: F401
    except ImportError as exc:
        raise LLMError(f"py3-pinterest ausente ({exc.name}) — rode 'prodmaker install'.") from exc
    try:
        login = PinterestLogin(config["email"], config["password"])
        login.login()
        client = Pinterest()
        setter = getattr(client, "set_session", None)
        session = getattr(login, "session", None)
        if callable(setter) and session is not None:
            setter(session)
        pin_fn = getattr(client, "pin", None)
        if not callable(pin_fn):
            raise LLMError("A versão instalada do py3-pinterest não expõe 'pin' — verifique a biblioteca.")
        board = pin["board"] or config["board"] or "ProdMaker"
        response = pin_fn(board=board, link=pin["link"], image=imagem_path, title=pin["titulo"], description=pin["descricao"])
        with get_db() as conn:
            conn.execute("UPDATE pins SET status = 'agendado', erro = '' WHERE id = ?", (pin_id,))
        return {"ok": True, "pin": pin_id, "resposta": bool(response), "board": board}
    except LLMError:
        raise
    except Exception as exc:  # noqa: BLE001 — attribute drift, login 2FA, throttling...
        with get_db() as conn:
            conn.execute("UPDATE pins SET erro = ? WHERE id = ?", (str(exc)[:500], pin_id))
        raise LLMError(
            f"py3-pinterest não conseguiu agendar ({type(exc).__name__}: {str(exc)[:150]}). "
            "Contas com 2FA/throttling exigem sessão manual — use o CSV exportado como alternativa."
        ) from exc
