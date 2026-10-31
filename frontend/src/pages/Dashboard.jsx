import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";

function brl(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Dashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [financeiro, setFinanceiro] = useState(null);
  const [investimentos, setInvestimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [investValor, setInvestValor] = useState("");
  const [investData, setInvestData] = useState("");
  const [salvandoInvest, setSalvandoInvest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardData, investData] = await Promise.all([
        api.dashboard(),
        api.investimentos(),
      ]);
      setData(dashboardData);
      setFinanceiro(investData.resumo);
      setInvestimentos(investData.registros);
    } catch (err) {
      toast(err.message || "Falha ao carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const registrarInvestimento = async (event) => {
    event.preventDefault();
    if (!Number(investValor)) return;
    setSalvandoInvest(true);
    try {
      await api.registrarInvestimento({ valor: Number(investValor), data: investData });
      setInvestValor("");
      setInvestData("");
      toast("Investimento registrado!");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao registrar investimento.");
    } finally {
      setSalvandoInvest(false);
    }
  };

  const removerInvestimento = async (item) => {
    try {
      await api.removerInvestimento(item.id);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao remover.");
    }
  };

  if (loading && !data) return <div className="loading-screen">Carregando…</div>;
  if (!data) return null;

  return (
    <section>
      <h1>AdsDashboard</h1>
      <p className="subtitle">Tenha uma visão completa da sua operação — dados reais dos seus módulos.</p>

      {data.progresso && data.progresso.status === "em_andamento" && (
        <div className="form-card" style={{ border: "1px solid var(--primary)" }}>
          <div className="flex-between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <strong>🤖 Lançamento em andamento — etapa {data.progresso.etapa} de {data.progresso.total}</strong>
            <button className="btn-outline" style={{ fontSize: "11px", padding: "6px 12px" }} onClick={() => navigate("/adsbot")}>
              Continuar no AdsBot →
            </button>
          </div>
          <div className="funnel-step-bar" style={{ height: "12px" }}>
            <div style={{ width: `${data.progresso.percentual}%`, background: "var(--primary)", height: "100%", borderRadius: "4px" }} />
          </div>
          <p className="placeholder-note" style={{ marginTop: "8px" }}>Faltam {data.progresso.faltam} passo(s) para o Relatório de Lançamento.</p>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Conversões (vendas)</h3>
          <div className="value">{data.vendas.total}</div>
        </div>
        <div className="metric-card">
          <h3>Receita</h3>
          <div className="value green">{brl(data.vendas.receita)}</div>
        </div>
        <div className="metric-card">
          <h3>Comissão</h3>
          <div className="value purple">{brl(data.vendas.comissao)}</div>
        </div>
        <div className="metric-card">
          <h3>Visitas rastreadas</h3>
          <div className="value">{data.tracking.visitas}</div>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Investimento em tráfego</h3>
          <div className="value">{brl(financeiro?.investimento ?? 0)}</div>
        </div>
        <div className="metric-card">
          <h3>ROAS (Receita ÷ Investimento)</h3>
          <div className={financeiro?.tem_investimento ? "value green" : "value"} style={{ color: financeiro?.tem_investimento && (financeiro?.roas ?? 0) >= 2 ? undefined : financeiro?.tem_investimento && (financeiro?.roas ?? 0) < 1 ? "var(--danger)" : undefined }}>
            {financeiro?.tem_investimento ? `${financeiro.roas}x` : "—"}
          </div>
        </div>
        <div className="metric-card">
          <h3>Lucro Líquido</h3>
          <div className={(financeiro?.lucro_liquido ?? 0) >= 0 ? "value green" : "value"} style={!((financeiro?.lucro_liquido ?? 0) >= 0) ? { color: "var(--danger)" } : {}}>
            {brl(financeiro?.lucro_liquido ?? 0)}
          </div>
        </div>
        <div className="metric-card">
          <h3>Lance diário (média)</h3>
          <div className="value">—</div>
        </div>
      </div>

      <div className="form-card">
        <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>📥 Registrar investimento em tráfego (gasto do dia)</h3>
        <form onSubmit={registrarInvestimento} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0, width: "160px" }}>
            <label>Valor gasto (R$)</label>
            <input type="number" step="0.01" min="0" required value={investValor} onChange={(e) => setInvestValor(e.target.value)} placeholder="Ex.: 120.00" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, width: "160px" }}>
            <label>Data (opcional)</label>
            <input type="date" value={investData} onChange={(e) => setInvestData(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit" disabled={salvandoInvest}>
            {salvandoInvest ? "Salvando…" : "Registrar"}
          </button>
        </form>
        {investimentos.length > 0 && (
          <table style={{ marginTop: "16px" }}>
            <thead>
              <tr><th>Data</th><th>Valor</th><th></th></tr>
            </thead>
            <tbody>
              {investimentos.slice(0, 8).map((item) => (
                <tr key={item.id}>
                  <td>{item.data || item.created_at?.slice(0, 10)}</td>
                  <td>{brl(item.valor)}</td>
                  <td className="action-icons"><span title="Remover" onClick={() => removerInvestimento(item)}>🗑️</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="placeholder-note" style={{ marginTop: "10px" }}>
          ROAS = Receita ÷ Investimento · Lucro Líquido = Receita − Investimento.
          {financeiro?.comissao ? ` Comissão acumulada: ${brl(financeiro.comissao)}.` : ""}
        </p>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Produtos</h3>
          <div className="value">{data.produtos.total}</div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>{data.produtos.aprovados} aprovados · {data.produtos.em_analise} em análise</p>
        </div>
        <div className="metric-card">
          <h3>Páginas</h3>
          <div className="value">{data.paginas.total}</div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>{data.paginas.publicadas} publicadas · {data.paginas.rascunho} rascunho</p>
        </div>
        <div className="metric-card">
          <h3>Campanhas</h3>
          <div className="value">{data.campanhas.total}</div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>{data.campanhas.publicadas} publicadas · {data.campanhas.erro} com erro</p>
        </div>
        <div className="metric-card">
          <h3>Infoprodutos</h3>
          <div className="value">{data.infoprodutos.total}</div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>{data.tracking.conversoes_pendentes} conversão(ões) GCLID pendente(s)</p>
        </div>
      </div>

      <div className="bottom-grid">
        <div className="traffic-flow-card">
          <h3>💸 Últimas vendas</h3>
          {data.ultimas_vendas.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "12px" }}>Nenhuma venda registrada ainda.</p>
          ) : (
            <table style={{ marginTop: "12px" }}>
              <thead>
                <tr><th>Data</th><th>Produto</th><th>Fonte</th><th>Valor</th></tr>
              </thead>
              <tbody>
                {data.ultimas_vendas.map((venda) => (
                  <tr key={venda.id}>
                    <td>{venda.created_at?.slice(0, 10)}</td>
                    <td>{venda.produto_nome || `#${venda.id}`}</td>
                    <td>{venda.fonte}</td>
                    <td>{brl(venda.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="funnel-card">
          <h3>📄 Últimas páginas</h3>
          {data.ultimas_paginas.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "12px" }}>Nenhuma página criada ainda.</p>
          ) : (
            <ul className="placeholder-list" style={{ marginTop: "12px" }}>
              {data.ultimas_paginas.map((pagina) => (
                <li key={pagina.id}>
                  {pagina.titulo} — {pagina.status === "publicada" ? "✅ publicada" : "📝 rascunho"}
                </li>
              ))}
            </ul>
          )}
          <button className="btn-primary" style={{ width: "100%", marginTop: "16px" }} onClick={() => navigate("/adsbot")}>
            🤖 Novo Lançamento (AdsBot)
          </button>
        </div>
      </div>
    </section>
  );
}
