import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const DONUT_COLORS = ["var(--primary)", "#3b82f6", "#db2777", "#f59e0b", "#10b981", "#64748b"];

function Donut({ data }) {
  const total = data.reduce((sum, item) => sum + item[1], 0) || 1;
  let acc = 0;
  const segments = data.map((item, index) => {
    const start = (acc / total) * 100;
    acc += item[1];
    const end = (acc / total) * 100;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${end}%`;
  });
  return (
    <>
      <div className="donut-chart" style={{ background: `conic-gradient(${segments.join(", ")})` }}>
        <div className="donut-inner" />
      </div>
      <div className="chart-legend">
        {data.map((item, index) => (
          <div className="legend-item" key={item[0]}>
            <span className="legend-color" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />{" "}
            {item[0]} ({item[1]})
          </div>
        ))}
      </div>
    </>
  );
}

function FluxoChart({ fluxo }) {
  if (!fluxo || fluxo.length === 0) {
    return (
      <div className="traffic-flow-visual" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "12px" }}>
        Aguardando visitas rastreadas…
      </div>
    );
  }
  const max = Math.max(...fluxo.map((f) => f.visitas), 1);
  const points = fluxo.map((f, index) => {
    const x = fluxo.length === 1 ? 500 : (index / (fluxo.length - 1)) * 1000;
    const y = 200 - (f.visitas / max) * 180;
    return `${x},${y}`;
  });
  if (points.length === 1) points.push(`1000,${points[0].split(",")[1]}`);
  const line = `M${points.join(" L")}`;
  const area = `${line} L1000,200 L0,200 Z`;
  return (
    <div className="traffic-flow-visual">
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none">
        <path d={area} fill="var(--primary-light)" opacity="0.5" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="3" />
      </svg>
    </div>
  );
}

const FUNIL_STEPS = [
  { key: "visitas", label: "1. Visitas", emoji: "👥" },
  { key: "cliques", label: "2. Cliques de Oferta", emoji: "🖱️", color: "#3b82f6", badgeColor: "#e0f2fe", badgeText: "#0284c7" },
  { key: "checkouts", label: "3. Checkouts", emoji: "🛒", color: "#db2777", badgeColor: "#fce7f3", badgeText: "#db2777" },
  { key: "vendas", label: "4. Conversões (Vendas)", emoji: "💸", color: "var(--success)", badgeColor: "#dcfce7", badgeText: "#16a34a" },
];

export default function Visitas() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visitorIp, setVisitorIp] = useState(null);
  const [visitor, setVisitor] = useState(null);
  const [visitorTab, setVisitorTab] = useState("json");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.trackingDashboard());
    } catch (err) {
      toast(err.message || "Falha ao carregar o tracking.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const abrirVisitante = async (ip) => {
    setVisitorIp(ip);
    setVisitorTab("json");
    setVisitor(null);
    try {
      setVisitor(await api.visitante(ip));
    } catch (err) {
      toast(err.message || "Falha ao carregar o visitante.");
    }
  };

  const copiarIPs = async () => {
    const ips = (data?.drenagem || []).map((item) => item.ip).join("\n");
    try {
      await navigator.clipboard.writeText(ips);
      toast(`Lista de ${data.drenagem.length} IPs copiada!`);
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  const copiarJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(visitor?.payload || {}, null, 2));
      toast("JSON copiado!");
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  if (loading && !data) return <div className="loading-screen">Carregando AdsPixel…</div>;
  if (!data) return null;

  const { resumo, drenagem, visitantes, origem, dispositivos, sistemas, funil, fluxo } = data;

  return (
    <section>
      <div className="pixel-header">
        <div className="pixel-icon">🎯</div>
        <div>
          <h1>AdsPixel</h1>
          <p className="subtitle" style={{ margin: 0 }}>Captura dados de cada visitante das suas páginas de presell — sem scripts de terceiros.</p>
        </div>
      </div>

      {resumo.visitas === 0 && (
        <div className="form-card" style={{ border: "1px solid var(--warning-border)", background: "var(--warning-bg)" }}>
          <h3 style={{ fontSize: "15px", marginBottom: "8px" }}>Nenhuma visita rastreada ainda</h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Para começar a rastrear: 1) configure a URL pública do <code>/track</code> no card
            {" "}<strong>Pixel de Rastreamento</strong> em{" "}
            <a href="/api-keys" onClick={(e) => { e.preventDefault(); navigate("/api-keys"); }}>Chaves de API</a>{" "}
            (use um túnel como cloudflared apontando para http://localhost:8188/track);
            2) gere e publique páginas no AdsPages — o pixel é embutido automaticamente.
          </p>
        </div>
      )}

      <div className="pixel-top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <strong>Visitas em todas as páginas de Presell</strong>
          <span className="pixel-tag">{resumo.dias} dias</span>
          <span className="pixel-tag" style={{ background: "transparent", border: "1px solid var(--border)" }}>
            {resumo.visitas} visitas · {resumo.visitantes_unicos} visitantes únicos
          </span>
        </div>
        <button className="btn-outline" style={{ fontSize: "12px", padding: "5px 10px" }} onClick={load}>
          🔄 Atualizar dados
        </button>
      </div>

      {drenagem.length > 0 && (
        <div className="warning-box">
          <div className="icon">!</div>
          <div>
            <h4>POSSÍVEL DRENAGEM DE ORÇAMENTO • {drenagem.length} Visitantes com Cliques Repetidos</h4>
            <p>
              Detector de Cliques Repetidos: visitantes que clicaram em anúncios/CTAs mais de uma vez sem converter
              podem estar consumindo seu orçamento sem gerar retorno.
            </p>
          </div>
          <button className="btn-dark" onClick={copiarIPs}>📋 Copiar Todos ({drenagem.length} IPs)</button>
        </div>
      )}

      {visitantes.length > 0 && (
        <div className="visitor-grid">
          {visitantes.map((visitante) => (
            <div className="visitor-card" key={visitante.ip} onClick={() => abrirVisitante(visitante.ip)} title="Ver detalhes">
              <div className="visitor-card-header">
                <div className="visitor-ip"><span>🛡️</span> {visitante.ip}</div>
                <span className="visitor-badge">{visitante.cliques} cliques</span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                ID {visitante.visitor_id} · {visitante.os} • {visitante.browser}
              </div>
              <div className="visitor-card-details">
                <span>Último: {visitante.ultimo?.slice(0, 16)}</span>
                <span className="visitor-card-link">Ver detalhes ></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Visitas Humanas</h3>
          <div className="value">{resumo.visitas}</div>
        </div>
        <div className="metric-card">
          <h3>Cliques / CTR</h3>
          <div className="value">{resumo.ctr}%</div>
        </div>
        <div className="metric-card">
          <h3>Checkouts</h3>
          <div className="value">{resumo.checkouts}</div>
        </div>
        <div className="metric-card">
          <h3>Vendas</h3>
          <div className="value">{resumo.vendas}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Origem do Tráfego</h3>
          <p>De onde vêm os cliques rastreados</p>
          <Donut data={origem} />
        </div>
        <div className="chart-card">
          <h3>Dispositivos</h3>
          <p>Smartphone, computador ou tablet</p>
          <Donut data={dispositivos} />
        </div>
        <div className="chart-card">
          <h3>Sistemas Operacionais</h3>
          <p>Sistema operacional dos visitantes</p>
          <Donut data={sistemas} />
        </div>
      </div>

      <div className="bottom-grid">
        <div className="traffic-flow-card">
          <h3>📈 Fluxo de Tráfego e Conversão ao Vivo</h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Visitas rastreadas por hora do dia</p>
          <FluxoChart fluxo={fluxo} />
        </div>
        <div className="funnel-card">
          <h3>⚡ Funil de Conversão do AdsPixel</h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "15px" }}>Passagem de tráfego até a venda final</p>
          {FUNIL_STEPS.map((step, index) => {
            const value = funil[step.key] || 0;
            const taxa = index === 0 ? 100 : (funil.taxas?.[step.key] ?? 0);
            return (
              <div className="funnel-step" key={step.key}>
                <div className="funnel-step-header">
                  <span>{step.emoji} {step.label}</span>
                  <span>
                    {value}{" "}
                    <span style={{ background: step.badgeColor || "var(--primary-light)", padding: "2px 6px", borderRadius: "4px", color: step.badgeText || "var(--primary)" }}>
                      {taxa}%
                    </span>
                  </span>
                </div>
                <div className="funnel-step-bar">
                  <div style={{ width: `${Math.max(taxa, value > 0 ? 2 : 0)}%`, background: step.color || "var(--primary)" }} />
                </div>
              </div>
            );
          })}
          <p className="placeholder-note" style={{ marginTop: "12px" }}>
            Checkouts e vendas ativam com os webhooks de venda (próxima parte).
          </p>
        </div>
      </div>

      <Modal open={Boolean(visitorIp)} title={`Visitante — ${visitorIp || ""}`} onClose={() => setVisitorIp(null)}>
        {!visitor ? (
          <p className="placeholder-note">Carregando…</p>
        ) : (
          <>
            <div className="visitor-modal-header">
              <span className="badge-human">Humano</span>
            </div>
            <div className="visitor-details-grid">
              <div className="detail-box">
                <div className="label">📡 IP & ID</div>
                <div className="main-val">{visitor.ip}</div>
                <div className="sub-val">ID {visitor.visitor_id}</div>
              </div>
              <div className="detail-box">
                <div className="label">🕒 ÚLTIMO ACESSO</div>
                <div className="main-val">{visitor.ultimo?.split(" ")[1] || "—"}</div>
                <div className="sub-val">{visitor.ultimo?.split(" ")[0] || "—"}</div>
              </div>
              <div className="detail-box">
                <div className="label">💻 DISPOSITIVO</div>
                <div className="main-val">{visitor.payload?.device} • {visitor.payload?.os}</div>
                <div className="sub-val">{visitor.payload?.browser}</div>
              </div>
              <div className="detail-box">
                <div className="label">📢 ORIGEM</div>
                <span className="badge-origin">{visitor.payload?.utm_source || visitor.payload?.ref || "Acesso direto"}</span>
              </div>
            </div>
            <div className="modal-tabs">
              <div className={`modal-tab ${visitorTab === "ids" ? "active" : ""}`} onClick={() => setVisitorTab("ids")}>IDs de Rastreamento</div>
              <div className={`modal-tab ${visitorTab === "json" ? "active" : ""}`} onClick={() => setVisitorTab("json")}>Payload JSON</div>
            </div>
            {visitorTab === "ids" ? (
              <div>
                <div className="tracking-id-box">
                  <div className="label"># VISITOR_ID</div>
                  <div className="val">{visitor.visitor_id}</div>
                </div>
                {visitor.payload?.gclid && (
                  <div className="tracking-id-box">
                    <div className="label"># GCLID</div>
                    <div className="val">{visitor.payload.gclid}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="json-box">
                <button className="json-copy-btn" onClick={copiarJSON}>📋 Copiar</button>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(visitor.payload, null, 2)}</pre>
              </div>
            )}
            <h4 style={{ fontSize: "13px", margin: "18px 0 8px" }}>Últimos eventos ({visitor.eventos.length})</h4>
            <table style={{ marginTop: 0 }}>
              <thead>
                <tr><th>Quando</th><th>Evento</th><th>Página</th></tr>
              </thead>
              <tbody>
                {visitor.eventos.slice(0, 10).map((evento, index) => (
                  <tr key={index}>
                    <td>{evento.created_at}</td>
                    <td>{evento.event}</td>
                    <td>{evento.page || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>
    </section>
  );
}
