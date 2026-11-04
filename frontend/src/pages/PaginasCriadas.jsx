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
  const [dominios, setDominios] = useState([]);
  const [pubModal, setPubModal] = useState(null); // página a publicar
  const [dominioEscolhido, setDominioEscolhido] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, dominiosData] = await Promise.all([api.paginas(), api.dominios().catch(() => [])]);
      setPaginas(lista);
      setDominios(dominiosData);
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

  const abrirPublicar = (page) => {
    const online = dominios.filter((d) => d.status === "online");
    if (online.length === 0) {
      toast("Nenhum domínio online. Cadastre e verifique um domínio em AdsHosting → Domínios.");
      return;
    }
    setDominioEscolhido(page.dominio_id ? String(page.dominio_id) : String(online[0].id));
    setPubModal(page);
  };

  const confirmarPublicar = async () => {
    const page = pubModal;
    if (!page || !dominioEscolhido) return;
    setPublicando(page.id);
    try {
      const updated = await api.publicarPagina(page.id, Number(dominioEscolhido));
      toast(`"${page.titulo}" publicada!`);
      setPubModal(null);
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
                    title={publicando === page.id ? "Publicando via GitHub…" : "Publicar em um domínio (GitHub)"}
                    onClick={() => abrirPublicar(page)}
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
        💡 Publicação: cada domínio tem seu **próprio repositório no GitHub** e cada produto
        tem sua **própria pasta** (<code>{`{produto}/index.html`}</code>) — o link final fica
        <code>{`https://{dominio}/{produto}/`}</code>. Configure o token GitHub em Chaves de API.
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

      <Modal open={Boolean(pubModal)} title={`🚀 Publicar — ${pubModal?.titulo || ""}`} onClose={() => setPubModal(null)}>
        <div className="form-group">
          <label>Domínio cadastrado</label>
          <select value={dominioEscolhido} onChange={(e) => setDominioEscolhido(e.target.value)}>
            {dominios.map((dominio) => (
              <option key={dominio.id} value={dominio.id} disabled={dominio.status !== "online"}>
                {dominio.nome} {dominio.status === "online" ? "(online)" : "(pendente — não pode publicar)"}
              </option>
            ))}
          </select>
        </div>
        <p className="placeholder-note" style={{ marginBottom: "14px" }}>
          ⚠️ Se o repositório para este domínio ainda não existir, ele será criado automaticamente no seu GitHub
          (público). A página entra na pasta do produto: <code>{`{produto}/index.html`}</code>.
        </p>
        <button className="btn-primary" onClick={confirmarPublicar} disabled={publicando || !dominioEscolhido} style={{ width: "100%" }}>
          {publicando ? "Publicando…" : "🚀 Publicar agora"}
        </button>
      </Modal>

      <Modal open={Boolean(publishInfo)} title={`🚀 Publicada — ${publishInfo?.titulo || ""}`} onClose={() => setPublishInfo(null)}>
        <p style={{ fontSize: "14px", marginBottom: "10px" }}>
          <strong>Arquivo:</strong> {publishInfo?.result?.path} no repositório{" "}
          <a href={publishInfo?.result?.repo_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{publishInfo?.result?.repo}</a>
          {publishInfo?.result?.repo_criado && <span style={{ color: "var(--success)" }}> (criado automaticamente ✅)</span>}
        </p>
        <p style={{ marginBottom: "6px" }}><a href={publishInfo?.result?.commit_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Commit no GitHub ↗</a></p>
        <p style={{ marginBottom: "12px", fontSize: "15px", fontWeight: 600 }}>
          🔗 Link final: <a href={publishInfo?.result?.pages_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{publishInfo?.result?.pages_url}</a>
        </p>
        <p className="placeholder-note">{publishInfo?.result?.aviso}</p>
      </Modal>
    </section>
  );
}
