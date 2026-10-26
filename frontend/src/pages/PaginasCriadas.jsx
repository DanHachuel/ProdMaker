import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

function formatDate(value) {
  if (!value) return "—";
  const [date] = value.split(" ");
  const [year, month, day] = date.split("-");
  return year ? `${day}/${month}/${year.slice(2)}` : value;
}

const TIPO_LABEL = { presell: "🛡️ Pre-sell", vendas: "💸 Vendas", clone: "🧬 Clone" };

export default function PaginasCriadas() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [paginas, setPaginas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [editorHtml, setEditorHtml] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [publicando, setPublicando] = useState(null);
  const [publishInfo, setPublishInfo] = useState(null); // { titulo, result }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPaginas(await api.paginas());
    } catch (err) {
      toast(err.message || "Falha ao carregar páginas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const abrirEditor = async (page) => {
    try {
      const data = await api.paginaHtml(page.id);
      setEditorHtml(data.html);
      setEditor({ id: page.id, titulo: page.titulo });
    } catch (err) {
      toast(err.message || "HTML não encontrado.");
    }
  };

  const salvarEditor = async () => {
    setEditorSaving(true);
    try {
      await api.updatePaginaHtml(editor.id, editorHtml);
      toast("HTML atualizado!");
      setEditor(null);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar.");
    } finally {
      setEditorSaving(false);
    }
  };

  const publicar = async (page) => {
    setPublicando(page.id);
    try {
      const updated = await api.publicarPagina(page.id);
      toast(`"${page.titulo}" publicada no GitHub!`);
      setPublishInfo({ titulo: page.titulo, result: updated.publish_result });
      await load();
    } catch (err) {
      toast(err.message || "Falha ao publicar.");
    } finally {
      setPublicando(null);
    }
  };

  const remover = async (page) => {
    if (!window.confirm(`Excluir a página "${page.titulo}"?`)) return;
    try {
      await api.deletePagina(page.id);
      toast("Página excluída.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao excluir.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <h1>📄 Páginas Criadas</h1>
        <button className="btn-primary" onClick={() => navigate("/adspages")}>+ Criar página</button>
      </div>
      <p className="subtitle">Todas as presells e páginas de vendas — pré-visualize, edite, publique e acompanhe.</p>

      <table>
        <thead>
          <tr>
            <th>Atualizada</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={5}>Carregando…</td></tr>
          ) : paginas.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={5}>Nenhuma página criada ainda. Use o AdsPages para gerar a primeira.</td>
            </tr>
          ) : (
            paginas.map((page) => (
              <tr key={page.id}>
                <td>{formatDate(page.updated_at)}</td>
                <td>{page.titulo}</td>
                <td>{TIPO_LABEL[page.tipo] || page.tipo}</td>
                <td>
                  {page.status === "publicada" ? (
                    <span style={{ color: "var(--success)", fontWeight: 600 }}>✅ Publicada</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>📝 Rascunho</span>
                  )}
                  {page.published_url && (
                    <div style={{ fontSize: "11px" }}>
                      <a href={page.published_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{page.published_url}</a>
                    </div>
                  )}
                </td>
                <td className="action-icons">
                  <a href={page.preview_url} target="_blank" rel="noreferrer" title="Pré-visualizar" style={{ color: "inherit", textDecoration: "none" }}>👁️</a>
                  <a href={`/api/paginas/${page.id}/download`} title="Download HTML" style={{ color: "inherit", textDecoration: "none" }}>⬇️</a>
                  <span title="Editar HTML" onClick={() => abrirEditor(page)}>✏️</span>
                  <span
                    title={publicando === page.id ? "Publicando via GitHub…" : "Publicar (GitHub → Cloudflare Pages)"}
                    onClick={() => publicar(page)}
                  >
                    {publicando === page.id ? "⏳" : "🚀"}
                  </span>
                  <span title="Excluir" onClick={() => remover(page)}>🗑️</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="placeholder-note" style={{ marginTop: "16px" }}>
        💡 Publicação: o HTML é enviado ao repositório GitHub configurado em Chaves de API.
        Se o repositório estiver conectado a um projeto no Cloudflare Pages, o deploy é automático.
      </p>

      <Modal open={Boolean(editor)} title={`Editar HTML — ${editor?.titulo || ""}`} onClose={() => setEditor(null)}>
        <textarea
          value={editorHtml}
          onChange={(e) => setEditorHtml(e.target.value)}
          rows={18}
          style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", padding: "10px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text-main)", outline: "none" }}
        />
        <button className="btn-primary" onClick={salvarEditor} disabled={editorSaving} style={{ marginTop: "12px", width: "100%" }}>
          {editorSaving ? "Salvando…" : "Salvar HTML"}
        </button>
      </Modal>

      <Modal open={Boolean(publishInfo)} title={`🚀 Publicada — ${publishInfo?.titulo || ""}`} onClose={() => setPublishInfo(null)}>
        <p style={{ fontSize: "14px", marginBottom: "10px" }}><strong>Arquivo:</strong> {publishInfo?.result?.path}</p>
        <p style={{ marginBottom: "6px" }}><a href={publishInfo?.result?.commit_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Commit no GitHub ↗</a></p>
        <p style={{ marginBottom: "12px" }}><a href={publishInfo?.result?.pages_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Página pública (GitHub Pages) ↗</a></p>
        <p className="placeholder-note">{publishInfo?.result?.aviso}</p>
      </Modal>
    </section>
  );
}
