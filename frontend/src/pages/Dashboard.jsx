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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.dashboard());
    } catch (err) {
      toast(err.message || "Falha ao carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

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
      <p className="metrics-note">
        ROAS aparece quando houver investimento registrado nas campanhas (integração de gastos — parte futura).
        O ProdMaker nunca inventa métricas.
      </p>

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
