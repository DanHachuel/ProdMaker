import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const WEBHOOK_FONTES = [
  { id: "hotmart", label: "Hotmart" },
  { id: "clickbank", label: "ClickBank" },
  { id: "digistore24", label: "Digistore24" },
  { id: "kiify", label: "Kiify" },
  { id: "cakto", label: "Cakto" },
];

const CONVERSAO_BADGE = {
  pendente: { text: "⏳ Pendente", color: "var(--text-muted)" },
  enviada: { text: "✅ Enviada", color: "var(--success)" },
  erro: { text: "❌ Erro", color: "var(--danger)" },
};

const EMPTY = {
  produto_nome: "",
  valor: "",
  comissao: "",
  gclid: "",
  comprador_email: "",
  transacao_id: "",
};

function formatDate(value) {
  if (!value) return "—";
  const [date, time = ""] = value.split(" ");
  const [year, month, day] = date.split("-");
  return year ? `${day}/${month} ${time.slice(0, 5)}` : value;
}

function brl(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Vendas() {
  const { toast } = useToast();
  const [vendas, setVendas] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [enviandoId, setEnviandoId] = useState(null);
  const [uploadLote, setUploadLote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, resumoData] = await Promise.all([api.vendas(), api.vendasResumo()]);
      setVendas(lista);
      setResumo(resumoData);
    } catch (err) {
      toast(err.message || "Falha ao carregar vendas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const salvar = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createVenda({
        produto_nome: form.produto_nome,
        valor: Number(form.valor) || 0,
        comissao: Number(form.comissao) || 0,
        gclid: form.gclid,
        comprador_email: form.comprador_email,
        transacao_id: form.transacao_id,
      });
      toast("Venda registrada!");
      setAddOpen(false);
      setForm(EMPTY);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar a venda.");
    } finally {
      setSaving(false);
    }
  };

  const remover = async (venda) => {
    if (!window.confirm(`Excluir a venda "${venda.produto_nome || venda.id}"?`)) return;
    try {
      await api.deleteVenda(venda.id);
      toast("Venda excluída.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao excluir.");
    }
  };

  const importar = async () => {
    setImporting(true);
    try {
      const result = await api.importVendasCsv(csvText);
      toast(`Importadas: ${result.importadas}${result.erros?.length ? ` · erros: ${result.erros.length}` : ""}`);
      setCsvOpen(false);
      setCsvText("");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao importar CSV.");
    } finally {
      setImporting(false);
    }
  };

  const lerArquivo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const enviarConversao = async (venda) => {
    setEnviandoId(venda.id);
    try {
      await api.uploadConversao(venda.id);
      toast(`Conversão #${venda.id} enviada ao Google Ads!`);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao enviar conversão.");
      await load();
    } finally {
      setEnviandoId(null);
    }
  };

  const enviarLote = async () => {
    setUploadLote(true);
    try {
      const result = await api.uploadConversoesLote();
      toast(`Enviadas: ${result.enviadas.length}${result.erros?.length ? ` · erros: ${result.erros.length}` : ""}`);
      if (result.erros?.[0]) toast(result.erros[0]);
      await load();
    } catch (err) {
      toast(err.message || "Falha no upload em lote.");
    } finally {
      setUploadLote(false);
    }
  };

  const copiar = async (valor) => {
    try {
      await navigator.clipboard.writeText(valor);
      toast("URL copiada!");
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  const pendentes = useMemo(
    () => vendas.filter((v) => v.status === "aprovada" && v.gclid && v.conversao_status !== "enviada"),
    [vendas]
  );

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <h1>💸 Minhas Vendas</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-outline" onClick={() => setCsvOpen(true)}>📥 Importar CSV</button>
          <button className="btn-outline" onClick={() => setWebhookOpen(true)}>🔗 Webhooks</button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>+ Adicionar venda</button>
        </div>
      </div>
      <p className="subtitle">Vendas rastreadas via webhooks (Hotmart, ClickBank, Digistore24, Kiify, Cakto), entrada manual ou CSV.</p>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Vendas aprovadas</h3>
          <div className="value">{resumo?.vendas ?? "—"}</div>
        </div>
        <div className="metric-card">
          <h3>Receita</h3>
          <div className="value green">{resumo ? brl(resumo.receita) : "—"}</div>
        </div>
        <div className="metric-card">
          <h3>Comissão</h3>
          <div className="value purple">{resumo ? brl(resumo.comissao) : "—"}</div>
        </div>
        <div className="metric-card">
          <h3>Conversões pendentes</h3>
          <div className="value">{resumo?.conversoes?.pendentes ?? "—"}</div>
        </div>
      </div>

      {pendentes.length > 0 && (
        <div className="warning-box">
          <div className="icon">!</div>
          <div>
            <h4>📤 {pendentes.length} conversão(ões) GCLID pronta(s) para envio ao Google Ads</h4>
            <p>Vendas aprovadas com GCLID rastreado. Envie em lote ou individualmente.</p>
          </div>
          <button className="btn-dark" onClick={enviarLote} disabled={uploadLote}>
            {uploadLote ? "Enviando…" : `📤 Enviar todas (${pendentes.length})`}
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Produto</th>
            <th>Fonte</th>
            <th>Valor</th>
            <th>Comissão</th>
            <th>GCLID</th>
            <th>Conversão</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={8}>Carregando…</td></tr>
          ) : vendas.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={8}>
                Nenhuma venda registrada. Use webhooks, adição manual ou importe um CSV.
              </td>
            </tr>
          ) : (
            vendas.map((venda) => (
              <tr key={venda.id}>
                <td>{formatDate(venda.created_at)}</td>
                <td>
                  {venda.produto_nome || `#${venda.id}`}
                  {venda.transacao_id && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{venda.transacao_id}</div>}
                </td>
                <td>{venda.fonte}</td>
                <td>{brl(venda.valor)}</td>
                <td>{brl(venda.comissao)}</td>
                <td style={{ fontFamily: "monospace", fontSize: "11px" }}>
                  {venda.gclid ? (
                    <span title={venda.gclid_match ? "Rastreado até a visita de origem" : "Sem visita correspondente"}>{venda.gclid.slice(0, 12)}… {venda.gclid_match ? "🎯" : ""}</span>
                  ) : "—"}
                </td>
                <td>
                  <span style={{ color: CONVERSAO_BADGE[venda.conversao_status]?.color || "var(--text-muted)", fontWeight: 600, fontSize: "12px" }}>
                    {CONVERSAO_BADGE[venda.conversao_status]?.text || venda.conversao_status}
                  </span>
                  {venda.conversao_erro && <div style={{ fontSize: "10px", color: "var(--danger)", maxWidth: "180px", wordBreak: "break-word" }}>{venda.conversao_erro.slice(0, 80)}</div>}
                </td>
                <td className="action-icons">
                  {venda.gclid && venda.conversao_status !== "enviada" && (
                    <span title="Enviar conversão ao Google Ads" onClick={() => enviarConversao(venda)}>
                      {enviandoId === venda.id ? "⏳" : "📤"}
                    </span>
                  )}
                  <span title="Excluir" onClick={() => remover(venda)}>🗑️</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Modal open={addOpen} title="Adicionar Venda (manual)" onClose={() => setAddOpen(false)}>
        <form onSubmit={salvar}>
          <div className="form-group">
            <label>Produto</label>
            <input required value={form.produto_nome} onChange={set("produto_nome")} placeholder="Ex.: Prodentim" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Valor (R$)</label>
              <input type="number" step="0.01" min="0" required value={form.valor} onChange={set("valor")} />
            </div>
            <div className="form-group">
              <label>Comissão (R$) — vazio = 50%</label>
              <input type="number" step="0.01" min="0" value={form.comissao} onChange={set("comissao")} />
            </div>
          </div>
          <div className="form-group">
            <label>GCLID (se conhecido — vindo do Google Ads)</label>
            <input value={form.gclid} onChange={set("gclid")} placeholder="EAIaIQobChMI..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>E-mail do comprador</label>
              <input value={form.comprador_email} onChange={set("comprador_email")} />
            </div>
            <div className="form-group">
              <label>Transação</label>
              <input value={form.transacao_id} onChange={set("transacao_id")} />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%", marginTop: "10px" }}>
            {saving ? "Salvando…" : "Salvar venda"}
          </button>
        </form>
      </Modal>

      <Modal open={csvOpen} title="Importar Vendas (CSV)" onClose={() => setCsvOpen(false)}>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
          Colunas aceitas (ordem livre): produto, valor, comissao, gclid, email, transacao, utm_source, utm_medium, utm_campaign.
        </p>
        <div className="form-group">
          <label>Arquivo CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={lerArquivo} style={{ padding: "10px" }} />
        </div>
        <div className="form-group">
          <label>…ou cole o conteúdo</label>
          <textarea rows={8} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"produto,valor,comissao,gclid\nProdentim,99,49.5,EAIaIQ..."} style={{ fontFamily: "monospace", fontSize: "12px" }} />
        </div>
        <button className="btn-primary" onClick={importar} disabled={importing || !csvText.trim()} style={{ width: "100%" }}>
          {importing ? "Importando…" : "Importar"}
        </button>
      </Modal>

      <Modal open={webhookOpen} title="🔗 Webhooks de Venda" onClose={() => setWebhookOpen(false)}>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
          Configure estas URLs no painel de postback de cada plataforma. Use um túnel (cloudflared/ngrok)
          apontando para a porta do ProdMaker para que a plataforma alcance o <code>/api/webhook/sale/...</code>.
        </p>
        {WEBHOOK_FONTES.map((fonte) => {
          const url = `${window.location.origin}/api/webhook/sale/${fonte.id}`;
          return (
            <div className="form-group" key={fonte.id}>
              <label>{fonte.label}</label>
              <div className="input-group" style={{ cursor: "pointer" }} onClick={() => copiar(url)} title="Clique para copiar">
                <input readOnly value={url} />
                <button type="button">📋</button>
              </div>
            </div>
          );
        })}
      </Modal>
    </section>
  );
}
