"""Banco de dados — façade sobre dbengine (SQLite padrão, PostgreSQL/Supabase via DATABASE_URL).

Esquema único para os dois engines. Todas as tabelas carregam `user_id` (preparação
multi-tenant — hoje vazio). `ensure_db()` cria o que falta e aplica ALTERs de migração.
"""
from .dbengine import (
    add_column_if_missing,
    is_postgres,
    now_str,  # noqa: F401  (reexportado para os serviços)
    row_to_dict,  # noqa: F401  (reexportado para os serviços)
)

# ---------------------------------------------------------------------------
# Esquema — SQLite DDL; para PostgreSQL as mesmas definições são traduzidas.
# ---------------------------------------------------------------------------

TABLES = {
    "produtos": """
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            nome TEXT NOT NULL,
            plataforma TEXT NOT NULL DEFAULT 'Outro',
            link_afiliado TEXT NOT NULL DEFAULT '',
            comissao REAL NOT NULL DEFAULT 0,
            preco REAL NOT NULL DEFAULT 0,
            nicho TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'em_analise',
            analysis TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """,
    "infoprodutos": """
        CREATE TABLE IF NOT EXISTS infoprodutos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            titulo TEXT NOT NULL,
            formato TEXT NOT NULL DEFAULT 'E-book',
            nicho TEXT NOT NULL DEFAULT '',
            modo TEXT NOT NULL DEFAULT 'rapido',
            provider TEXT NOT NULL DEFAULT '',
            pdf_path TEXT NOT NULL DEFAULT '',
            md_path TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
    "paginas": """
        CREATE TABLE IF NOT EXISTS paginas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
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
    """,
    "dominios": """
        CREATE TABLE IF NOT EXISTS dominios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            nome TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pendente',
            cf_zone_id TEXT NOT NULL DEFAULT '',
            ns_data TEXT NOT NULL DEFAULT '',
            a_data TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """,
    "visitas": """
        CREATE TABLE IF NOT EXISTS visitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
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
    """,
    "vendas": """
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
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
    """,
    "palavras": """
        CREATE TABLE IF NOT EXISTS palavras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            produto_id INTEGER,
            produto_nome TEXT NOT NULL DEFAULT '',
            tipo TEXT NOT NULL DEFAULT 'positiva',
            texto TEXT NOT NULL,
            correspondencia TEXT NOT NULL DEFAULT 'frase',
            origem TEXT NOT NULL DEFAULT 'ia',
            created_at TEXT NOT NULL
        )
    """,
    "campanhas": """
        CREATE TABLE IF NOT EXISTS campanhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            produto_id INTEGER,
            plataforma TEXT NOT NULL DEFAULT 'google',
            nome TEXT NOT NULL,
            objetivo TEXT NOT NULL DEFAULT '',
            cpa_alvo REAL NOT NULL DEFAULT 0,
            orcamento_diario REAL NOT NULL DEFAULT 0,
            keywords_json TEXT NOT NULL DEFAULT '[]',
            negativas_json TEXT NOT NULL DEFAULT '[]',
            criativos_json TEXT NOT NULL DEFAULT '[]',
            plano_json TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'rascunho',
            resultado_json TEXT NOT NULL DEFAULT '',
            erro TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """,
    "lancamentos": """
        CREATE TABLE IF NOT EXISTS lancamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            produto_id INTEGER,
            etapa_atual INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'em_andamento',
            dados_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """,
    "notificacoes": """
        CREATE TABLE IF NOT EXISTS notificacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            event TEXT NOT NULL DEFAULT '',
            titulo TEXT NOT NULL DEFAULT '',
            mensagem TEXT NOT NULL DEFAULT '',
            canal TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pendente',
            erro TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
    "pins": """
        CREATE TABLE IF NOT EXISTS pins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            produto_id INTEGER,
            titulo TEXT NOT NULL,
            descricao TEXT NOT NULL DEFAULT '',
            texto_imagem TEXT NOT NULL DEFAULT '',
            sugestao_imagem TEXT NOT NULL DEFAULT '',
            board TEXT NOT NULL DEFAULT '',
            link TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'ideia',
            provider TEXT NOT NULL DEFAULT '',
            erro TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
    "investimentos": """
        CREATE TABLE IF NOT EXISTS investimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '',
            data TEXT NOT NULL DEFAULT '',
            valor REAL NOT NULL DEFAULT 0,
            fonte TEXT NOT NULL DEFAULT 'manual',
            observacao TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
}

ALL_TABLES = list(TABLES.keys())


def _pg_ddl(sqlite_ddl: str) -> str:
    """Traduz o DDL SQLite para PostgreSQL."""
    return sqlite_ddl.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY")


def get_db():
    from .dbengine import connect

    return connect()


def ensure_db() -> None:
    with get_db() as conn:
        if is_postgres():
            for ddl in TABLES.values():
                conn.execute(_pg_ddl(ddl))
        else:
            for ddl in TABLES.values():
                conn.execute(ddl)
            # Migração: bancos criados antes da coluna user_id / da tabela investimentos
            for table in ALL_TABLES:
                add_column_if_missing(conn, table, "user_id TEXT NOT NULL DEFAULT ''", "user_id")
            if "investimentos" not in [row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]:
                conn.execute(TABLES["investimentos"])
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vendas_gclid ON vendas (gclid)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_visitas_gclid ON visitas (gclid)")


ensure_db()
