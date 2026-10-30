import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

function brl(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Gclid() {
  const { toast } = useToast();
  const [vendas, setVendas] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enviandoId, setEnviandoId] = useState(null);
  const [uploadLote, setUploadLote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, resumoData] = await Promise.all([api.vendas(), api.vendasResumo()]);
      setVendas(lista);
      setResumo(resumoData);
    } catch (err) {
      toast(err.message || "Falha ao carregar conversões.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const comGclid = vendas.filter((v) => v.gclid);
  const pendentes = comGclid.filter((v) => v.conversao_status !== "enviada" && v.status === "aprovada");

  const enviarConversao = async (venda) => {
    setEnviandoId(venda.id);
    try {
      await api.uploadConversao(venda.id);
      toast(`Conversão #${venda.id} enviada!`);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao enviar.");
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

  const statusBadge = {
    pendente: "⏳ Pendente",
    enviada: "✅ Enviada",
    erro: "❌ Erro",
  };

  return (
    <section>
      <h1>📤 Conversões Offline (GCLID)</h1>
      <p className="subtitle">
        Envie as vendas do Google Ads de volta como conversões offline usando o GCLID rastreado pelo AdsPixel.
      </p>

      <div className="form-card">
        <h3 style={{ fontSize: "15px", marginBottom: "10px" }}>Status da fila</h3>
        <div className="metrics-grid" style={{ marginBottom: "10px" }}>
          <div className="metric-card">
            <h3>Com GCLID</h3>
            <div className="value">{comGclid.length}</div>
          </div>
          <div className="metric-card">
            <h3>Pendentes</h3>
            <div className="value">{pendentes.length}</div>
          </div>
          <div className="metric-card">
            <h3>Enviadas</h3>
            <div className="value green">{resumo?.conversoes?.enviadas ?? 0}</div>
          </div>
          <div className="metric-card">
            <h3>Erros</h3>
            <div className="value" style={{ color: (resumo?.conversoes?.erros || 0) > 0 ? "var(--danger)" : undefined }}>{resumo?.conversoes?.erros ?? 0}</div>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={enviarLote}
          disabled={uploadLote || pendentes.length === 0}
          style={{ width: "100%" }}
        >
          {uploadLote ? "Enviando…" : `📤 Enviar todas as pendentes (${pendentes.length})`}
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Venda</th>
            <th>Data</th>
            <th>Valor</th>
            <th>GCLID</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={6}>Carregando…</td></tr>
          ) : comGclid.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={6}>
                Nenhuma venda com GCLID ainda. Vendas vindas de cliques do Google Ads (com gclid capturado
                pelo AdsPixel ou informado no webhook) aparecem aqui automaticamente.
              </td>
            </tr>
          ) : (
            comGclid.map((venda) => (
              <tr key={venda.id}>
                <td>{venda.produto_nome || `#${venda.id}`}</td>
                <td>{venda.created_at}</td>
                <td>{brl(venda.valor)}</td>
                <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{venda.gclid.slice(0, 14)}…</td>
                <td style={{ fontWeight: 600, fontSize: "12px", color: venda.conversao_status === "erro" ? "var(--danger)" : venda.conversao_status === "enviada" ? "var(--success)" : "var(--text-muted)" }}>
                  {statusBadge[venda.conversao_status] || venda.conversao_status}
                  {venda.conversao_erro && <div style={{ fontWeight: 400, fontSize: "10px", maxWidth: "220px", wordBreak: "break-word" }}>{venda.conversao_erro.slice(0, 100)}</div>}
                </td>
                <td className="action-icons">
                  {venda.conversao_status !== "enviada" && venda.status === "aprovada" && (
                    <span title="Enviar conversão" onClick={() => enviarConversao(venda)}>
                      {enviandoId === venda.id ? "⏳" : "📤"}
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="placeholder-note" style={{ marginTop: "16px" }}>
        🔧 Requer Google Ads configurado em Chaves de API (developer token, client_id, client_secret,
        refresh_token, customer_id e conversion_action). Erros da API são exibidos com attribution.
      </p>
    </section>
  );
}
