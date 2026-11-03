"""Banco de dados — fachada sobre dbengine (SQLite padrao, PostgreSQL/Supabase via DATABASE_URL).

Esquema unico para os dois engines. Todas as tabelas carregam `user_id` (preparacao
multi-tenant — hoje vazio). `ensure_db()` cria o que falta e aplica ALTERs de migracao.
"""
import sqlite3
import time

from .dbengine import (
    DEV_USER_ID,
    add_column_if_missing,
    is_postgres,
    now_str,  # noqa: F401  (reexportado para os servicos)
    row_to_dict,  # noqa: F401  (reexportado para os servicos)
)

# ---------------------------------------------------------------------------
# Esquema — SQLite DDL; para PostgreSQL as mesmas definicoes sao traduzidas.
# ---------------------------------------------------------------------------

TABLES = {
    "produtos": """
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            titulo TEXT NOT NULL,
            tipo TEXT NOT NULL,
            produto_id INTEGER,
            dominio_id INTEGER,
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            data TEXT NOT NULL DEFAULT '',
            valor REAL NOT NULL DEFAULT 0,
            fonte TEXT NOT NULL DEFAULT 'manual',
            observacao TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
    "ips_bloqueados": """
        CREATE TABLE IF NOT EXISTS ips_bloqueados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            ip TEXT NOT NULL,
            motivo TEXT NOT NULL DEFAULT 'manual',
            origem TEXT NOT NULL DEFAULT 'sqlite',
            created_at TEXT NOT NULL
        )
    """,
    "fraude_eventos": """
        CREATE TABLE IF NOT EXISTS fraude_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            ip TEXT NOT NULL,
            page TEXT NOT NULL DEFAULT '',
            created_epoch REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """,
    "assinaturas": """
        CREATE TABLE IF NOT EXISTS assinaturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            plano TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            stripe_ref TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'checkout',
            current_period_end TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
    "email_sequencias": """
        CREATE TABLE IF NOT EXISTS email_sequencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            nome TEXT NOT NULL,
            gatilho TEXT NOT NULL DEFAULT 'manual',
            assunto TEXT NOT NULL,
            corpo TEXT NOT NULL,
            ativo INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
    """,
    "email_envios": """
        CREATE TABLE IF NOT EXISTS email_envios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
            sequencia_id INTEGER NOT NULL DEFAULT 0,
            destino TEXT NOT NULL DEFAULT '',
            assunto TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pendente',
            erro TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """,
    "usuarios": """
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'user',
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


def _create_tables(conn) -> list[str]:
    """Cria todas as tabelas; erros por instrução são coletados, nunca abortam."""
    erros: list[str] = []
    if is_postgres():
        for nome, ddl in TABLES.items():
            try:
                conn.execute(_pg_ddl(ddl))
            except Exception as exc:  # noqa: BLE001
                erros.append(f"{nome}: {exc}")
        return erros
    for nome, ddl in TABLES.items():
        try:
            conn.execute(ddl)
        except sqlite3.DatabaseError as exc:
            erros.append(f"{nome}: {exc}")
    # Migracao: bancos criados antes da coluna user_id / das novas tabelas
    for table in ALL_TABLES:
        try:
            add_column_if_missing(conn, table, "user_id TEXT NOT NULL DEFAULT ''", "user_id")
        except Exception as exc:  # noqa: BLE001
            erros.append(f"user_id/{table}: {exc}")
    # Migracao especifica: dominio_id em paginas (hotfix 0.1.18)
    try:
        add_column_if_missing(conn, "paginas", "dominio_id INTEGER", "dominio_id")
    except Exception as exc:  # noqa: BLE001
        erros.append(f"dominio_id/paginas: {exc}")
    # Migracao multi-tenant (Fase 13): registros antigos sem user_id assumem o
    # UUID de DEV para continuar visíveis no modo local.
    for table in ALL_TABLES:
        if not table.isidentifier():
            continue  # nomes vêm do próprio esquema; evita SQL injection
        try:
            conn.execute(f"UPDATE {table} SET user_id = ? WHERE user_id = ?", (DEV_USER_ID, ""))
        except sqlite3.Error:
            pass
    for index in ("CREATE INDEX IF NOT EXISTS idx_vendas_gclid ON vendas (gclid)", "CREATE INDEX IF NOT EXISTS idx_visitas_gclid ON visitas (gclid)"):
        try:
            conn.execute(index)
        except sqlite3.DatabaseError:
            pass
    return erros


def _sqlite_file():
    from .dbengine import _sqlite_path

    return _sqlite_path()


_CORRUPCAO_MARCADORES = ("not a database", "malformed", "encrypted", "corrupt", "database disk image")


def _parece_corrupcao(exc: Exception) -> bool:
    texto = str(exc).lower()
    return any(marcador in texto for marcador in _CORRUPCAO_MARCADORES)


def _recriar_banco() -> None:
    arquivo = _sqlite_file()
    backup = arquivo.with_name(f"prodmaker.db.corrupt-{time.strftime('%Y%m%d-%H%M%S')}")
    try:
        arquivo.rename(backup)
        print(f"[ProdMaker] Banco SQLite corrompido movido para: {backup.name} — recriando vazio.")
    except OSError:
        try:
            arquivo.unlink(missing_ok=True)
            print("[ProdMaker] Banco SQLite corrompido removido — recriando vazio.")
        except OSError:
            print("[ProdMaker] Banco SQLite corrompido e não pode ser removido.")
            return
    with get_db() as conn:
        _create_tables(conn)


def ensure_db() -> None:
    """Cria/migra o banco. Se o arquivo SQLite estiver CORROMPIDO, faz backup e recria
    (o Uvicorn nunca cai na inicialização por causa do banco)."""
    if is_postgres():
        with get_db() as conn:
            _create_tables(conn)
        return
    conn = get_db()
    try:
        try:
            _create_tables(conn)
            # Probe de integridade: leitura real detecta arquivo corrompido.
            conn.execute("SELECT COUNT(*) FROM produtos").fetchone()
            return
        except sqlite3.DatabaseError as exc:
            if not _parece_corrupcao(exc):
                # Erro de disco/permissão etc: não descarta o arquivo do usuário.
                print(f"[ProdMaker] Aviso na inicialização do banco: {exc}")
                return
            corrompido = True
    finally:
        # IMPORTANTE (Windows): o context manager do sqlite3 NÃO fecha a conexão;
        # sem close() o arquivo fica travado e o rename do recovery falha.
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
    if not corrompido:
        return
    _recriar_banco()


ensure_db()
