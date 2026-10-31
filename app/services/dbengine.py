"""Camada de abstração de banco — SQLite (padrão) + PostgreSQL/Supabase (DATABASE_URL).

Objetivo (radar Supabase): o sistema aceita `DATABASE_URL` apontando para o PostgreSQL
do Supabase SEM quebrar a compatibilidade local com SQLite. Todos os serviços continuam
usando `get_db()` com a mesma API (execute/fetchall/fetchone, context manager, rows
acessíveis por nome de coluna). Para PostgreSQL os placeholders `?` são traduzidos para
`%s` e as linhas viram dicts (mesmo acesso por nome).

Multi-tenant (preparado, NÃO implementado): todas as tabelas têm `user_id TEXT DEFAULT ''`.
Quando o Supabase Auth entrar, basta filtrar por `current_user_id()` (hoje retorna '').
"""
import os
import sqlite3
import time
import uuid
from pathlib import Path

from .store import STATE


def now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def row_to_dict(row) -> dict:
    if row is None:
        return {}
    if isinstance(row, dict):
        return dict(row)
    return {key: row[key] for key in row.keys()}


def dsn() -> str | None:
    return (os.environ.get("DATABASE_URL") or "").strip() or None


def is_postgres() -> bool:
    value = dsn()
    return bool(value and value.startswith(("postgres://", "postgresql://")))


def engine_name() -> str:
    return "postgres" if is_postgres() else "sqlite"


def current_user_id() -> str:
    """Placeholder multi-tenant: vazio enquanto não houver Supabase Auth."""
    return (os.environ.get("PRODMAKER_USER_ID") or "").strip()


def new_user_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# PostgreSQL — wrapper mínimo (imports preguiçosos de psycopg)
# ---------------------------------------------------------------------------


def _translate(sql: str) -> str:
    return sql.replace("?", "%s")


class _PgRow(dict):
    """Acesso por nome (row["col"]) como sqlite3.Row."""


class _PgResult:
    def __init__(self, cursor):
        self._cursor = cursor
        self._description = cursor.description
        self._rows = None

    def _materialize(self):
        if self._rows is None:
            columns = [col.name for col in self._description] if self._description else []
            self._rows = [_PgRow(zip(columns, values)) for values in (self._cursor.fetchall() if self._description else [])]

    def fetchall(self):
        self._materialize()
        return list(self._rows)

    def fetchone(self):
        self._materialize()
        return self._rows[0] if self._rows else None

    @property
    def lastrowid(self):
        # PostgreSQL: capturamos o id via RETURNING nas inserções específicas
        self._materialize()
        row = self._rows[0] if self._rows else None
        return row.get("id") if row else None

    def __iter__(self):
        self._materialize()
        return iter(self._rows)


class _PgConn:
    def __init__(self, connection):
        self._conn = connection

    def execute(self, sql: str, params=()):
        cursor = self._conn.cursor()
        cursor.execute(_translate(sql), tuple(params or ()))
        return _PgResult(cursor)

    def executescript(self, sql: str):
        cursor = self._conn.cursor()
        cursor.execute(sql)
        return _PgResult(cursor)

    def commit(self):
        self._conn.commit()

    def close(self):
        try:
            self._conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self.close()


# ---------------------------------------------------------------------------
# Conexão
# ---------------------------------------------------------------------------


def _sqlite_path():
    STATE.mkdir(parents=True, exist_ok=True)
    return STATE / "prodmaker.db"


def connect():
    """Conexão do engine ativo (sqlite padrão; postgres quando DATABASE_URL definido)."""
    if is_postgres():
        try:
            import psycopg
        except ImportError as exc:
            raise RuntimeError(
                "DATABASE_URL definido, mas o driver psycopg não está instalado — "
                "rode 'pip install psycopg[binary]' (ou 'prodmaker install' com o requirements atualizado)."
            ) from exc
        try:
            connection = psycopg.connect(dsn(), connect_timeout=10)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Falha ao conectar no PostgreSQL (DATABASE_URL): {exc}. "
                "Confira a connection string do Supabase ou desdefina DATABASE_URL para voltar ao SQLite local."
            ) from exc
        return _PgConn(connection)
    conn = sqlite3.connect(_sqlite_path())
    conn.row_factory = sqlite3.Row
    return conn


# Compatibilidade com o nome antigo usado pelos serviços
def get_db():
    return connect()


# ---------------------------------------------------------------------------
# Introspecção / migração (dialect-aware)
# ---------------------------------------------------------------------------


def table_columns(conn, table: str) -> list[str]:
    if is_postgres():
        rows = (
            conn.execute(
                "SELECT column_name AS name FROM information_schema.columns WHERE table_name = %s",
                (table,),
            )
            .fetchall()
        )
        return [row["name"] for row in rows]
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [row["name"] for row in rows]


def add_column_if_missing(conn, table: str, column_ddl: str, column_name: str) -> bool:
    if column_name not in table_columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_ddl}")
        return True
    return False
