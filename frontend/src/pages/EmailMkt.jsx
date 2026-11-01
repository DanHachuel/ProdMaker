import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const GATILHOS = [
  { value: "venda_recebida", label: "Venda recebida (webhook)" },
  { value: "produto_salvo", label: "Produto salvo (builder)" },
  { value: "manual", label: "Envio manual" },
];

const EMPTY = { nome: "", gatilho: "venda_recebida", assunto: "", corpo: "", ativo: true };

export default function EmailMkt() {
  const { toast } = useToast();
  const [sequencias, setSequencias] = useState([]);
  const [historico, setHistorico] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enviarModal, setEnviarModal] = useState(null);
  const [destinos, setDestinos] = useState("");

  const load = useCallback(async () => {
    try {
      const [seqs, hist] = await Promise.all([api.emailSequencias(), api.emailHistorico()]);
      setSequencias(seqs);
      setHistorico(hist);
    } catch (err) {
      toast(err.message || "Falha ao carregar e-mail marketing.");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const salvar = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api.emailAtualizar(editId, form);
        toast("Sequência atualizada!");
      } else {
        await api.emailCriar(form);
        toast("Sequência criada!");
      }
      setModalOpen(false);
      setForm(EMPTY);
      setEditId(null);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remover = async (seq) => {
    if (!window.confirm(`Excluir a sequência "${seq.nome}"?`)) return;
    try {
      await api.emailRemover(seq.id);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao remover.");
    }
  };

  const enviar = async () => {
    if (!destinos.trim()) {
      toast("Informe ao menos um destino (URL apprise).");
      return;
    }
    try {
      await api.emailEnviar({
        sequencia_id: enviarModal.id,
        destinos: destinos.split("\n").map((item) => item.trim()).filter(Boolean),
        variaveis: { nome: "cliente", produto: "ProdMaker", valor: "" },
      });
      toast("E-mail enviado!");
      setEnviarModal(null);
      setDestinos("");
      await load();
    } catch (err) {
      toast(err.message || "Falha no envio.");
    }
  };

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div>
          <h1>📧 E-mail Marketing (AdsAcademy)</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            Sequências transacionais com gatilho automático (venda, produto salvo) — entrega pelo apprise já integrado.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setModalOpen(true); }}>
          + Nova sequência
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Sequências</h3>
          <div className="value">{sequencias.length}</div>
        </div>
        <div className="metric-card">
          <h3>Ativas</h3>
          <div className="value green">{sequencias.filter((s) => s.ativo).length}</div>
        </div>
        <div className="metric-card">
          <h3>Enviados</h3>
          <div className="value">{historico?.totais?.enviada ?? 0}</div>
        </div>
        <div className="metric-card">
          <h3>Erros</h3>
          <div className="value" style={(historico?.totais?.erro ?? 0) > 0 ? { color: "var(--danger)" } : {}}>{historico?.totais?.erro ?? 0}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Gatilho</th>
            <th>Assunto</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {sequencias.length === 0 ? (
            <tr className="empty-row"><td colSpan={5}>Nenhuma sequência. Crie a primeira para entregar o produto automaticamente na venda.</td></tr>
          ) : (
            sequencias.map((seq) => (
              <tr key={seq.id}>
                <td>{seq.nome}</td>
                <td>{GATILHOS.find((g) => g.value === seq.gatilho)?.label || seq.gatilho}</td>
                <td style={{ maxWidth: "260px" }}>{seq.assunto}</td>
                <td style={{ fontWeight: 600, fontSize: "12px", color: seq.ativo ? "var(--success)" : "var(--text-muted)" }}>
                  {seq.ativo ? "✅ ativa" : "⏸️ pausada"}
                </td>
                <td className="action-icons">
                  <span title="Enviar agora" onClick={() => { setEnviarModal(seq); setDestinos(""); }}>📤</span>
                  <span title="Editar" onClick={() => { setForm(seq); setEditId(seq.id); setModalOpen(true); }}>✏️</span>
                  <span title="Excluir" onClick={() => remover(seq)}>🗑️</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3 style={{ fontSize: "16px", margin: "24px 0 8px" }}>Histórico de envios</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Assunto</th>
            <th>Destino</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {!historico?.envios?.length ? (
            <tr className="empty-row"><td colSpan={4}>Nenhum envio ainda.</td></tr>
          ) : (
            historico.envios.slice(0, 20).map((envio) => (
              <tr key={envio.id}>
                <td>{envio.created_at}</td>
                <td>{envio.assunto}{envio.erro && <div style={{ fontSize: "10px", color: "var(--danger)", maxWidth: "260px", wordBreak: "break-word" }}>{envio.erro.slice(0, 80)}</div>}</td>
                <td style={{ fontSize: "11px", maxWidth: "200px", wordBreak: "break-all" }}>{envio.destino || "—"}</td>
                <td style={{ fontWeight: 600, fontSize: "12px", color: envio.status === "enviada" ? "var(--success)" : envio.status === "erro" ? "var(--danger)" : "var(--text-muted)" }}>
                  {envio.status}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="placeholder-note" style={{ marginTop: "14px" }}>
        📌 Canais: os destinos apprise (ex.: <code>mailtos://user:senha@smtp.com</code>) são lidos de
        Notificações quando não informados no envio. Gatilho "Venda recebida" dispara automaticamente
        a cada webhook de venda. Variáveis: <code>{"{{nome}}"}</code>, <code>{"{{produto}}"}</code>, <code>{"{{valor}}"}</code>, <code>{"{{link}}"}</code>.
        A plataforma completa de e-mail (emareach) fica como backlog da nuvem.
      </p>

      <Modal open={modalOpen} title={editId ? "Editar sequência" : "Nova sequência"} onClose={() => setModalOpen(false)}>
        <form onSubmit={salvar}>
          <div className="form-group">
            <label>Nome</label>
            <input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Entrega do produto" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Gatilho</label>
              <select value={form.gatilho} onChange={(e) => setForm({ ...form, gatilho: e.target.value })}>
                {GATILHOS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: "140px" }}>
              <label>Status</label>
              <select value={form.ativo ? "1" : "0"} onChange={(e) => setForm({ ...form, ativo: e.target.value === "1" })}>
                <option value="1">Ativa</option>
                <option value="0">Pausada</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Assunto</label>
            <input required value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} placeholder="Ex.: Seu acesso ao {{produto}}" />
          </div>
          <div className="form-group">
            <label>Corpo (HTML ou texto)</label>
            <textarea rows={8} required value={form.corpo} onChange={(e) => setForm({ ...form, corpo: e.target.value })} placeholder={"Olá {{nome}}! Aqui está seu acesso ao {{produto}}..."} style={{ fontFamily: "monospace", fontSize: "12px" }} />
          </div>
          <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%" }}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </Modal>

      <Modal open={Boolean(enviarModal)} title={`Enviar — ${enviarModal?.nome || ""}`} onClose={() => setEnviarModal(null)}>
        <div className="form-group">
          <label>Destinos (um por linha — URLs apprise)</label>
          <textarea rows={5} value={destinos} onChange={(e) => setDestinos(e.target.value)} placeholder={"mailtos://user:senha@smtp.com\ntgram://TOKEN/CHAT"} style={{ fontFamily: "monospace", fontSize: "12px" }} />
          <p className="placeholder-note" style={{ marginTop: "6px" }}>Vazio = usa os canais configurados em Notificações.</p>
        </div>
        <button className="btn-primary" onClick={enviar} style={{ width: "100%" }}>📤 Enviar agora</button>
      </Modal>
    </section>
  );
}
