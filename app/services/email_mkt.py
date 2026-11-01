"""E-mail Marketing / AdsAcademy — sequências transacionais via apprise.

Emareach (plataforma completa self-hosted) fica como backlog da nuvem; aqui o
motor honesto é o apprise já integrado: sequências com gatilho (venda recebida,
produto salvo, manual), variáveis {{nome}}, {{produto}}, {{valor}}, {{link}} e
histórico de envios. Sem canais configurados: erro claro, nunca silencioso.
"""
import re

from .database import get_db, now_str, row_to_dict
from .llm import LLMError


def _render(texto: str, variaveis: dict) -> str:
    for chave, valor in (variaveis or {}).items():
        texto = texto.replace("{{" + chave + "}}", str(valor or ""))
    return texto


def listar(gatilho: str = "") -> list[dict]:
    query = "SELECT * FROM email_sequencias"
    params: tuple = ()
    if gatilho:
        query += " WHERE gatilho = ?"
        params = (gatilho,)
    query += " ORDER BY id DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(row) for row in rows]


def salvar(nome: str, gatilho: str, assunto: str, corpo: str, ativo: bool = True, sequencia_id: int | None = None) -> dict:
    if not nome.strip() or not assunto.strip() or not corpo.strip():
        raise LLMError("Informe nome, assunto e corpo da sequência.")
    if gatilho not in ("venda_recebida", "produto_salvo", "manual"):
        raise LLMError("Gatilho inválido: use venda_recebida, produto_salvo ou manual.")
    with get_db() as conn:
        if sequencia_id:
            cursor = conn.execute(
                "UPDATE email_sequencias SET nome = ?, gatilho = ?, assunto = ?, corpo = ?, ativo = ? WHERE id = ?",
                (nome.strip(), gatilho, assunto.strip(), corpo, bool(ativo), sequencia_id),
            )
            if cursor.rowcount == 0:
                raise LLMError("Sequência não encontrada.")
        else:
            cursor = conn.execute(
                "INSERT INTO email_sequencias (nome, gatilho, assunto, corpo, ativo, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (nome.strip(), gatilho, assunto.strip(), corpo, bool(ativo), now_str()),
            )
            sequencia_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM email_sequencias WHERE id = ?", (sequencia_id,)).fetchone()
    return row_to_dict(row)


def remover(sequencia_id: int) -> None:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM email_sequencias WHERE id = ?", (sequencia_id,))
        if cursor.rowcount == 0:
            raise LLMError("Sequência não encontrada.")


def _variaveis_padrao() -> dict:
    settings_nome = "cliente"
    return {"nome": settings_nome, "produto": "seu produto", "valor": "", "link": ""}


def aplicar_gatilho(gatilho: str, variaveis: dict, destinos: list[str] | None = None) -> dict:
    """Dispara as sequências ativas do gatilho (usado pelos hooks de venda/produto)."""
    enviados = []
    erros = []
    for sequencia in listar(gatilho):
        if not sequencia["ativo"]:
            continue
        assunto = _render(sequencia["assunto"], variaveis)
        corpo = _render(sequencia["corpo"], variaveis)
        try:
            _enviar(sequencia, destinos or [], assunto, corpo)
            enviados.append(sequencia["id"])
        except LLMError as exc:
            _registrar_envio(sequencia["id"], "", assunto, "erro", str(exc))
            erros.append(str(exc))
    return {"enviados": enviados, "erros": erros}


def enviar_manual(sequencia_id: int, destinos: list[str], variaveis: dict) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM email_sequencias WHERE id = ?", (sequencia_id,)).fetchone()
    if not row:
        raise LLMError("Sequência não encontrada.")
    sequencia = row_to_dict(row)
    if not destinos:
        raise LLMError("Informe ao menos um destino (URL apprise, ex.: mailtos://user:senha@smtp.com).")
    assunto = _render(sequencia["assunto"], {**_variaveis_padrao(), **(variaveis or {})})
    corpo = _render(sequencia["corpo"], {**_variaveis_padrao(), **(variaveis or {})})
    _enviar(sequencia, destinos, assunto, corpo)
    return {"ok": True, "assunto": assunto}


def _enviar(sequencia: dict, destinos: list, assunto: str, corpo: str) -> None:
    from . import notify

    alvos = [str(item).strip() for item in (destinos or []) if str(item).strip()]
    if not alvos:
        config = notify.listar_config()
        alvos = [item for item in (config.get("targets") or [])]
    if not alvos:
        erro = "Nenhum canal apprise configurado (settings.notifications.targets)."
        _registrar_envio(sequencia["id"], "", assunto, "erro", erro)
        raise LLMError(erro)
    telegram = notify._telegram_target()
    if telegram and telegram not in alvos:
        alvos.insert(0, telegram)
    try:
        import apprise

        apobj = apprise.Apprise()
        validos = [alvo for alvo in alvos if apobj.add(alvo)]
        if not validos:
            erro = "Nenhum canal apprise válido."
            _registrar_envio(sequencia["id"], ",".join(alvos), assunto, "erro", erro)
            raise LLMError(erro)
        if apobj.notify(title=assunto, body=corpo):
            _registrar_envio(sequencia["id"], ",".join(validos), assunto, "enviada")
        else:
            erro = "apprise não conseguiu entregar."
            _registrar_envio(sequencia["id"], ",".join(validos), assunto, "erro", erro)
            raise LLMError(erro)
    except ImportError as exc:
        erro = f"apprise ausente ({exc.name}) — rode 'prodmaker install'."
        _registrar_envio(sequencia["id"], "", assunto, "erro", erro)
        raise LLMError(erro)


def _registrar_envio(sequencia_id: int, destino: str, assunto: str, status: str, erro: str = "") -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO email_envios (sequencia_id, destino, assunto, status, erro, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (sequencia_id, destino, assunto[:180], status, erro[:500], now_str()),
        )


def historico(limit: int = 50) -> dict:
    with get_db() as conn:
        envios = [row_to_dict(row) for row in conn.execute("SELECT * FROM email_envios ORDER BY id DESC LIMIT ?", (limit,))]
        totais = {row["status"]: row["n"] for row in conn.execute("SELECT status, COUNT(*) AS n FROM email_envios GROUP BY status")}
    return {"envios": envios, "totais": totais}
