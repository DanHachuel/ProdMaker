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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paginas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                tipo TEXT NOT NULL,
                produto_id INTEGER,
                idioma TEXT NOT NULL DEFAULT 'Portugues',
                html_path TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'rascunho',
                published_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dominios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pendente',
                cf_zone_id TEXT NOT NULL DEFAULT '',
                ns_data TEXT NOT NULL DEFAULT '',
                a_data TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS visitas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL DEFAULT '',
                page TEXT NOT NULL DEFAULT '',
                gclid TEXT NOT NULL DEFAULT '',
                utm_source TEXT NOT NULL DEFAULT '',
                utm_medium TEXT NOT NULL DEFAULT '',
                utm_campaign TEXT NOT NULL DEFAULT '',
                ref TEXT NOT NULL DEFAULT '',
                ip TEXT NOT NULL DEFAULT '',
                user_agent TEXT NOT NULL DEFAULT '',
                extra TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vendas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fonte TEXT NOT NULL DEFAULT 'manual',
                produto_id INTEGER,
                produto_nome TEXT NOT NULL DEFAULT '',
                transacao_id TEXT NOT NULL DEFAULT '',
                comprador_email TEXT NOT NULL DEFAULT '',
                valor REAL NOT NULL DEFAULT 0,
                comissao REAL NOT NULL DEFAULT 0,
                gclid TEXT NOT NULL DEFAULT '',
                utm_source TEXT NOT NULL DEFAULT '',
                utm_medium TEXT NOT NULL DEFAULT '',
                utm_campaign TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'aprovada',
                conversao_status TEXT NOT NULL DEFAULT 'pendente',
                conversao_erro TEXT NOT NULL DEFAULT '',
                gclid_match TEXT NOT NULL DEFAULT '',
                raw TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vendas_gclid ON vendas (gclid)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vendas_created ON vendas (created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_visitas_gclid ON visitas (gclid)")
        columns = [row["name"] for row in conn.execute("PRAGMA table_info(produtos)")]
        if "analysis" not in columns:
            conn.execute("ALTER TABLE produtos ADD COLUMN analysis TEXT NOT NULL DEFAULT ''")


def now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def row_to_dict(row) -> dict:
    return {key: row[key] for key in row.keys()}
