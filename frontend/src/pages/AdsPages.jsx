import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const IDIOMAS = ["Português", "Inglês", "Espanhol"];

const TIPOS = [
  { value: "presell", label: "🛡️ Pre-Sell (afiliado)" },
  { value: "vendas", label: "💸 Página de Vendas (12 seções — produto próprio)" },
  { value: "clone", label: "🧬 Clonar página (higienizada)" },
];

const EMPTY = {
  tipo: "presell",
  produto_id: "",
  titulo: "",
  idioma: "Português",
  afiliado_link: "",
  checkout_link: "",
  avatar: "",
  resultado: "",
  tempo: "",
  dor: "",
  prompt: "",
  clone_url: "",
};

export default function AdsPages() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [editor, setEditor] = useState(null); // { id, titulo }
  const [editorHtml, setEditorHtml] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);

  const loadProdutos = useCallback(async () => {
    try {
      setProdutos(await api.produtos());
    } catch {}
  }, []);

  useEffect(() => {
    loadProdutos();
  }, [loadProdutos]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const onProdutoChange = (event) => {
    const produtoId = event.target.value;
    const produto = produtos.find((p) => String(p.id) === String(produtoId));
    setForm({
      ...form,
      produto_id: produtoId,
      titulo: produto && !form.titulo ? `Presell — ${produto.nome}` : form.titulo,
      afiliado_link: produto?.link_afiliado || form.afiliado_link,
      dor: produto?.nicho || form.dor,
    });
  };

  const criar = async (event) => {
    event.preventDefault();
    setError("");
    setGenerating(true);
    setResult(null);
    try {
      const payload = { ...form, produto_id: form.produto_id ? Number(form.produto_id) : null };
      const record = await api.createPagina(payload);
      setResult(record);
      toast(`Página "${record.titulo}" criada!`);
    } catch (err) {
      setError(err.message || "Falha ao criar a página.");
    } finally {
      setGenerating(false);
    }
  };

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
    } catch (err) {
      toast(err.message || "Falha ao salvar o HTML.");
    } finally {
      setEditorSaving(false);
    }
  };

  const isClone = form.tipo === "clone";

  return (
    <section>
      <h1>🛡️ AdsPages</h1>
      <p className="subtitle">Crie e hospede presells nativas e páginas de vendas — HTML único, mobile-first, com pixel embutido.</p>

      <div className="form-card">
        <form onSubmit={criar}>
          <div className="form-row">
            <div className="form-group">
              <label>Tipo de página</label>
              <select value={form.tipo} onChange={set("tipo")}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Idioma</label>
              <select value={form.idioma} onChange={set("idioma")}>
                {IDIOMAS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          {!isClone && (
            <div className="form-row">
              <div className="form-group">
                <label>Produto (preenche automaticamente)</label>
                <select value={form.produto_id} onChange={onProdutoChange}>
                  <option value="">— sem produto vinculado —</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Título da página</label>
                <input required value={form.titulo} onChange={set("titulo")} placeholder="Ex.: Prodentim — Vale a pena?" />
              </div>
            </div>
          )}

          {isClone && (
            <div className="form-group">
              <label>URL para clonar</label>
              <input required type="url" value={form.clone_url} onChange={set("clone_url")} placeholder="https://concorrente.com/oferta" />
              <p className="placeholder-note" style={{ marginTop: "6px" }}>
                O clone remove scripts, iframes e pixels do original antes de salvar.
              </p>
            </div>
          )}

          {!isClone && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Link de afiliado (CTA)</label>
                  <input value={form.afiliado_link} onChange={set("afiliado_link")} placeholder="https://hop.clickbank.net/..." />
                </div>
                <div className="form-group">
                  <label>Link de checkout (se diferente)</label>
                  <input value={form.checkout_link} onChange={set("checkout_link")} placeholder="https://checkout..." />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Avatar</label>
                  <input value={form.avatar} onChange={set("avatar")} placeholder="Ex.: homens 40+ com dor nas costas" />
                </div>
                <div className="form-group">
                  <label>Resultado prometido</label>
                  <input value={form.resultado} onChange={set("resultado")} placeholder="Ex.: alívio em 7 dias" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tempo (para a promessa)</label>
                  <input value={form.tempo} onChange={set("tempo")} placeholder="Ex.: 7 dias" />
                </div>
                <div className="form-group">
                  <label>Dor principal</label>
                  <input value={form.dor} onChange={set("dor")} placeholder="Ex.: passar fome" />
                </div>
              </div>
              <div className="form-group">
                <label>Instruções adicionais (prompt)</label>
                <textarea rows={3} value={form.prompt} onChange={set("prompt")} placeholder="Tom, cores, urgência, bônus..." />
              </div>
            </>
          )}

          {error && (
            <div className="login-error">
              {error}
              {/Chaves de API|provedor/i.test(error) && (
                <> — configure em <a href="/api-keys" onClick={(e) => { e.preventDefault(); navigate("/api-keys"); }}>Chaves de API</a>.</>
              )}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={generating} style={{ width: "100%", marginTop: "10px" }}>
            {generating ? (isClone ? "🧬 Clonando e higienizando…" : "✨ Gerando página com IA…") : isClone ? "🧬 Clonar página" : "✨ Criar página"}
          </button>
        </form>

        {result && (
          <div className="form-card" style={{ marginTop: "20px", border: "1px solid var(--primary)", background: "var(--primary-light)" }}>
            <h3 style={{ marginBottom: "6px" }}>✅ Página pronta!</h3>
            <p style={{ fontSize: "14px", marginBottom: "12px" }}>
              <strong>{result.titulo}</strong> · {result.tipo} {result.provider ? `· gerada por ${result.provider}` : ""}
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <a className="btn-primary" style={{ textDecoration: "none" }} href={result.preview_url} target="_blank" rel="noreferrer">👁️ Pré-visualizar</a>
              <a className="btn-outline" style={{ textDecoration: "none" }} href={`/api/paginas/${result.id}/download`}>⬇️ Download</a>
              <button className="btn-outline" onClick={() => abrirEditor(result)}>✏️ Editar HTML</button>
              <button className="btn-outline" onClick={() => navigate("/hosting/paginas")}>📚 Ver todas</button>
            </div>
          </div>
        )}
      </div>

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
    </section>
  );
}
