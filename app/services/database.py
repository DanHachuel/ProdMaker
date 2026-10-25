"""Banco SQLite local (stdlib) — helpers compartilhados."""
import sqlite3
import time
from pathlib import Path

from .store import STATE

DB_PATH = STATE / "prodmaker.db"


def get_db():
    STATE.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS produtos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                plataforma TEXT NOT NULL DEFAULT 'Outro',
                link_afiliado TEXT NOT NULL DEFAULT '',
                comissao REAL NOT NULL DEFAULT 0,
                preco REAL NOT NULL DEFAULT 0,
                nicho TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'em_analise',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS infoprodutos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                formato TEXT NOT NULL DEFAULT 'E-book',
                nicho TEXT NOT NULL DEFAULT '',
                modo TEXT NOT NULL DEFAULT 'rapido',
                provider TEXT NOT NULL DEFAULT '',
                pdf_path TEXT NOT NULL DEFAULT '',
                md_path TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        columns = [row["name"] for row in conn.execute("PRAGMA table_info(produtos)")]
        if "analysis" not in columns:
            conn.execute("ALTER TABLE produtos ADD COLUMN analysis TEXT NOT NULL DEFAULT ''")


def now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def row_to_dict(row) -> dict:
    return {key: row[key] for key in row.keys()}
