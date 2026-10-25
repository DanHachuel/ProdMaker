import React from "react";

export default function Dashboard() {
  return (
    <section>
      <h1>AdsDashboard</h1>
      <p className="subtitle">Tenha uma visão completa da sua operação.</p>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Conversões</h3>
          <div className="value">0</div>
        </div>
        <div className="metric-card">
          <h3>Lucro Líquido</h3>
          <div className="value green">R$ 0,00</div>
        </div>
        <div className="metric-card">
          <h3>ROAS</h3>
          <div className="value green">—</div>
        </div>
        <div className="metric-card">
          <h3>Investimento</h3>
          <div className="value purple">R$ 0,00</div>
        </div>
      </div>
      <p className="metrics-note">
        As métricas reais aparecem aqui conforme campanhas (AdsCreator) e tracking (AdsTracking) forem ativados.
        O ProdMaker nunca inventa dados — enquanto não houver eventos, os valores ficam zerados.
      </p>
    </section>
  );
}
