import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function AntiFraude() {
  const { toast } = useToast();
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [motivo, setMotivo] = useState("drenagem de orçamento");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResumo(await api.fraudeResumo());
    } catch (err) {
      toast(err.message || "Falha ao carregar a anti-fraude.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const bloquear = async (event) => {
    event.preventDefault();
    if (!ip.trim()) return;
    try {
      await api.fraudeBloquear({ ip: ip.trim(), motivo });
      setIp("");
      toast("IP bloqueado!");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao bloquear.");
    }
  };

  const desbloquear = async (item) => {
    try {
      await api.fraudeDesbloquear(item.ip);
      toast("IP desbloqueado.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao desbloquear.");
    }
  };

  const copiar = async () => {
    const lista = (resumo?.ips_bloqueados || []).map((item) => item.ip).join("\n");
    try {
      await navigator.clipboard.writeText(lista);
      toast(`Lista de ${resumo.ips_bloqueados.length} IPs copiada!`);
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  return (
    <section>
      <div className="pixel-header">
        <div className="pixel-icon">🛡️</div>
        <div>
          <h1>Anti-Fraude (AdsPixel)</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            Bloqueio de IPs (padrão Cuckoo Filter do redis-datasets/fraud-detection) e detecção de click spamming.
          </p>
        </div>
      </div>

      <div className="pixel-top-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <strong>Motor: {resumo?.redis_ativo ? "Redis (Cuckoo Filter + Sorted Set)" : "SQLite local (fallback)"}</strong>
          <span className="pixel-tag">{resumo?.total_bloqueados ?? 0} IPs bloqueados</span>
          <span className="pixel-tag" style={{ background: "transparent", border: "1px solid var(--border)" }}>
            Janela {resumo?.janela_segundos ?? 60}s · limite {resumo?.limite_cliques ?? 10} cliques
          </span>
        </div>
        <button className="btn-outline" style={{ fontSize: "12px", padding: "5px 10px" }} onClick={load}>🔄 Atualizar</button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>IPs bloqueados</h3>
          <div className="value">{resumo?.total_bloqueados ?? 0}</div>
        </div>
        <div className="metric-card">
          <h3>Spam detectado (24h)</h3>
          <div className="value" style={resumo?.spam_ultimas_24h > 0 ? { color: "var(--warning)" } : {}}>{resumo?.spam_ultimas_24h ?? 0}</div>
        </div>
        <div className="metric-card">
          <h3>Redis</h3>
          <div className="value" style={{ fontSize: "18px", color: resumo?.redis_ativo ? "var(--success)" : "var(--text-muted)" }}>
            {resumo?.redis_ativo ? "Ativo" : "Fallback SQLite"}
          </div>
        </div>
        <div className="metric-card">
          <h3>Drenagem</h3>
          <div className="value" style={{ fontSize: "18px" }}>—</div>
        </div>
      </div>

      <div className="form-card">
        <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>🚫 Bloquear IP</h3>
        <form onSubmit={bloquear} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: "180px" }}>
            <label>IP</label>
            <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="Ex.: 152.250.161.220" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: "200px" }}>
            <label>Motivo</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit">Bloquear</button>
        </form>
        <p className="placeholder-note" style={{ marginTop: "8px" }}>
          IPs bloqueados param de entrar no tracking do pixel. Sem Redis configurado (variável REDIS_URL ou card Redis em
          Chaves de API), o bloqueio funciona via SQLite local — o foco é não perder dinheiro com cliques repetidos.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 8px" }}>
        <h3 style={{ fontSize: "16px" }}>IPs bloqueados</h3>
        <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={copiar} disabled={!resumo?.ips_bloqueados?.length}>
          📋 Copiar todos ({resumo?.total_bloqueados ?? 0})
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>IP</th>
            <th>Motivo</th>
            <th>Origem</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={4}>Carregando…</td></tr>
          ) : !resumo?.ips_bloqueados?.length ? (
            <tr className="empty-row"><td colSpan={4}>Nenhum IP bloqueado — clique em “Copiar todos” no alerta de drenagem (Minhas Visitas) e cole acima.</td></tr>
          ) : (
            resumo.ips_bloqueados.map((item) => (
              <tr key={item.ip}>
                <td style={{ fontWeight: 600 }}>{item.ip}</td>
                <td>{item.motivo}</td>
                <td>{item.origem}</td>
                <td className="action-icons"><span title="Desbloquear" onClick={() => desbloquear(item)}>🗑️</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
