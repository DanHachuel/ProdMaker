import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";
import Modal from "../components/Modal";

const PLATAFORMAS = ["Clickbank", "Hotmart", "Digistore24", "Kiify", "Cakto", "Outro"];

const EMPTY_FORM = {
  nome: "",
  plataforma: "Clickbank",
  link_afiliado: "",
  comissao: "",
  preco: "",
  nicho: "",
};

function formatDate(value) {
  if (!value) return "—";
  const [date] = value.split(" ");
  const [year, month, day] = date.split("-");
  return year ? `${day}/${month}/${year.slice(2)}` : value;
}

function parseAnalysis(produto) {
  if (!produto?.analysis) return null;
  if (typeof produto.analysis === "string") {
    try {
      return JSON.parse(produto.analysis);
    } catch {
      return null;
    }
  }
  return produto.analysis;
}

function AnalysisModal({ produto, onClose }) {
  const data = parseAnalysis(produto);
  if (!data) return null;
  const analise = data.analise || data;
  return (
    <Modal open title={`🧠 Análise — ${produto.nome}`} onClose={onClose}>
      {analise.resumo && <p style={{ fontSize: "14px", marginBottom: "14px" }}><strong>Resumo:</strong> {analise.resumo}</p>}
      {Array.isArray(analise.angulos_copy) && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "13px" }}>Ângulos de copy</strong>
          <ul className="placeholder-list">{analise.angulos_copy.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>
      )}
      {Array.isArray(analise.palavras_chave) && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "13px" }}>Palavras-chave sugeridas</strong>
          <ul className="placeholder-list">{analise.palavras_chave.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>
      )}
      {Array.isArray(analise.negativas_sugeridas) && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "13px" }}>Negativas sugeridas</strong>
          <ul className="placeholder-list">{analise.negativas_sugeridas.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>
      )}
      {analise.brief_presell && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "13px" }}>Brief da presell</strong>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "6px" }}>{analise.brief_presell}</p>
        </div>
      )}
      {analise.publico && (
        <div>
          <strong style={{ fontSize: "13px" }}>Público</strong>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "6px" }}>{analise.publico}</p>
        </div>
      )}
      <p className="placeholder-note">Análise gerada por: {data.provider || "IA"}</p>
    </Modal>
  );
}

export default function Produtos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("em_analise");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [analysisProduto, setAnalysisProduto] = useState(null);
  const [analisando, setAnalisando] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProdutos(await api.produtos());
    } catch (err) {
      setError(err.message || "Falha ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return produtos.filter(
      (p) =>
        p.status === tab &&
        (!term || p.nome.toLowerCase().includes(term) || (p.nicho || "").toLowerCase().includes(term))
    );
  }, [produtos, tab, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (produto) => {
    setEditing(produto);
    setForm({
      nome: produto.nome || "",
      plataforma: produto.plataforma || "Outro",
      link_afiliado: produto.link_afiliado || "",
      comissao: produto.comissao ?? "",
      preco: produto.preco ?? "",
      nicho: produto.nicho || "",
    });
    setModalOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        nome: form.nome,
        plataforma: form.plataforma,
        link_afiliado: form.link_afiliado,
        comissao: Number(form.comissao) || 0,
        preco: Number(form.preco) || 0,
        nicho: form.nicho,
      };
      if (editing) {
        await api.updateProduto(editing.id, body);
        toast("Produto atualizado!");
      } else {
        await api.createProduto(body);
        toast("Produto adicionado — em análise!");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar o produto.");
    } finally {
      setSaving(false);
    }
  };

  const aprovar = async (produto) => {
    setAnalisando(produto.id);
    try {
      const updated = await api.aprovarProduto(produto.id);
      toast(`"${produto.nome}" aprovado!`);
      await load();
      if (updated.analysis) {
        setAnalysisProduto(updated);
      } else if (updated.analysis_error) {
        toast(`Análise IA indisponível: ${updated.analysis_error}`);
      }
    } catch (err) {
      toast(err.message || "Falha ao aprovar.");
    } finally {
      setAnalisando(null);
    }
  };

  const analisar = async (produto) => {
    setAnalisando(produto.id);
    try {
      const updated = await api.analisarProduto(produto.id);
      toast("Análise gerada!");
      await load();
      setAnalysisProduto(updated);
    } catch (err) {
      toast(err.message || "Falha na análise.");
    } finally {
      setAnalisando(null);
    }
  };

  const remover = async (produto) => {
    if (!window.confirm(`Excluir o produto "${produto.nome}"?`)) return;
    try {
      await api.deleteProduto(produto.id);
      toast("Produto excluído.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao excluir.");
    }
  };

  return (
    <section>
      <h1>Seus Produtos</h1>
      <p className="subtitle">Analise, aprove e anuncie seus produtos.</p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "10px", width: "300px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--input-bg)", color: "var(--text-main)", outline: "none" }}
        />
        <button className="btn-primary" onClick={openAdd}>+ Adicionar produto</button>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === "em_analise" ? "active" : ""}`} onClick={() => setTab("em_analise")}>🔍 Em Análise</div>
        <div className={`tab ${tab === "aprovado" ? "active" : ""}`} onClick={() => setTab("aprovado")}>✓ Aprovados</div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Atualizado</th>
            <th>Produto</th>
            <th>Plataforma</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={4}>Carregando…</td></tr>
          ) : filtered.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={4}>
                {tab === "em_analise"
                  ? "Nenhum produto em análise. Clique em “+ Adicionar produto” para começar."
                  : "Nenhum produto aprovado ainda. Aprove um produto na aba “Em Análise”."}
              </td>
            </tr>
          ) : (
            filtered.map((produto) => (
              <tr key={produto.id}>
                <td>{formatDate(produto.updated_at)}</td>
                <td>{produto.nome}{produto.nicho ? <span style={{ color: "var(--text-muted)" }}> · {produto.nicho}</span> : null}</td>
                <td>{produto.plataforma}</td>
                <td className="action-icons">
                  {produto.status === "em_analise" ? (
                    <>
                      <span title="Editar" onClick={() => openEdit(produto)}>✏️</span>
                      <span title="AdsWords (palavras-chave)" onClick={() => navigate("/adswords")}>✈️ AdsWord</span>
                      <span
                        title={analisando === produto.id ? "Aprovando (análise IA se LLM ativo)…" : "Aprovar"}
                        onClick={() => aprovar(produto)}
                      >
                        {analisando === produto.id ? "⏳" : "✓ Aprovar"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span title="AdsPages (criar presell)" onClick={() => navigate("/adspages")}>🛡️ AdsPages</span>
                      <span title="AdsCreator (criar campanha)" onClick={() => navigate("/adscreator")}>🎯 AdsCreator</span>
                      <span title="AdsWords (palavras-chave)" onClick={() => navigate("/adswords")}>✈️ AdsWord</span>
                      {parseAnalysis(produto) ? (
                        <span title="Ver análise IA" onClick={() => setAnalysisProduto(produto)}>🧠</span>
                      ) : (
                        <span
                          title={analisando === produto.id ? "Analisando com IA…" : "Gerar análise IA"}
                          onClick={() => analisar(produto)}
                        >
                          {analisando === produto.id ? "⏳" : "🔬"}
                        </span>
                      )}
                      <span title="Excluir" onClick={() => remover(produto)}>🗑️</span>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Modal open={modalOpen} title={editing ? "Editar Produto" : "Adicionar Produto"} onClose={() => setModalOpen(false)}>
        <form onSubmit={save}>
          <div className="form-group">
            <label>Nome do produto</label>
            <input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Prodentim" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Plataforma</label>
              <select value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })}>
                {PLATAFORMAS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Nicho</label>
              <input value={form.nicho} onChange={(e) => setForm({ ...form, nicho: e.target.value })} placeholder="Ex.: saúde" />
            </div>
          </div>
          <div className="form-group">
            <label>Link de afiliado / checkout</label>
            <input value={form.link_afiliado} onChange={(e) => setForm({ ...form, link_afiliado: e.target.value })} placeholder="https://..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Comissão (R$)</label>
              <input type="number" step="0.01" min="0" value={form.comissao} onChange={(e) => setForm({ ...form, comissao: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Preço (R$)</label>
              <input type="number" step="0.01" min="0" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%", marginTop: "10px" }}>
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Salvar"}
          </button>
        </form>
      </Modal>

      <AnalysisModal produto={analysisProduto} onClose={() => setAnalysisProduto(null)} />
    </section>
  );
}
