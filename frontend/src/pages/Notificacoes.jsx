import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function Notificacoes() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [targets, setTargets] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, hist] = await Promise.all([api.notificacoesConfig(), api.notificacoesHistorico()]);
      setConfig(cfg);
      setHistorico(hist);
      setTargets((cfg.targets || []).join("\n"));
    } catch (err) {
      toast(err.message || "Falha ao carregar notificações.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (event) => {
    if (!config) return;
    setConfig({
      ...config,
      eventos: { ...config.eventos, [event]: !config.eventos[event] },
    });
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const list = targets
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const saved = await api.salvarNotificacoes(config.eventos, list);
      setConfig(saved);
      setTargets((saved.targets || []).join("\n"));
      toast("Configuração salva!");
    } catch (err) {
      toast(err.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const testar = async () => {
    setTesting(true);
    try {
      await api.testarNotificacao({ titulo: "Teste ProdMaker", mensagem: "Notificação de teste do ProdMaker." });
      toast("Notificação de teste enviada!");
      await load();
    } catch (err) {
      toast(err.message || "Falha no teste.");
      await load();
    } finally {
      setTesting(false);
    }
  };

  if (loading && !config) return <div className="loading-screen">Carregando…</div>;

  return (
    <section>
      <h1>🔔 Notificações (AdsNotify)</h1>
      <p className="subtitle">Push de vendas e conclusões via apprise (Telegram, Discord, e-mail e mais).</p>

      <div className="form-card">
        <h3 style={{ fontSize: "15px", marginBottom: "10px" }}>Eventos notificados</h3>
        {config &&
          Object.entries(config.eventos_disponiveis || {}).map(([event, label]) => (
            <label
              key={event}
              style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: 500, marginBottom: "10px", cursor: "pointer" }}
              onClick={(e) => e.preventDefault()}
            >
              <input
                type="checkbox"
                checked={Boolean(config.eventos?.[event])}
                onChange={() => toggle(event)}
                style={{ width: "auto" }}
              />
              {label} <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>({event})</span>
            </label>
          ))}

        <h3 style={{ fontSize: "15px", margin: "18px 0 8px" }}>Canais (URLs apprise — uma por linha)</h3>
        <textarea
          rows={4}
          value={targets}
          onChange={(e) => setTargets(e.target.value)}
          placeholder={"discords://WEBHOOK_ID/WEBHOOK_TOKEN\nmailtos://usuario:senha@smtp.com"}
          style={{ fontFamily: "monospace", fontSize: "12px" }}
        />
        <p className="placeholder-note" style={{ marginBottom: "12px" }}>
          {config?.canal_telegram
            ? "✅ Telegram configurado em Chaves de API — será usado automaticamente."
            : "💡 Dica: configure Bot Token + Chat ID em Chaves de API → Telegram para receber tudo no seu Telegram."}{" "}
          <a href="/api-keys" onClick={(e) => { e.preventDefault(); navigate("/api-keys"); }}>Abrir Chaves de API</a>
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-primary" onClick={salvar} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn-outline" onClick={testar} disabled={testing}>
            {testing ? "Enviando…" : "📨 Enviar teste"}
          </button>
        </div>
      </div>

      <h3 style={{ fontSize: "16px", margin: "24px 0 8px" }}>Histórico ({historico.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Evento</th>
            <th>Título</th>
            <th>Canal</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {historico.length === 0 ? (
            <tr className="empty-row"><td colSpan={5}>Nenhuma notificação enviada ainda.</td></tr>
          ) : (
            historico.map((item) => (
              <tr key={item.id}>
                <td>{item.created_at}</td>
                <td>{item.event}</td>
                <td>
                  {item.titulo}
                  {item.erro && <div style={{ fontSize: "10px", color: "var(--danger)", maxWidth: "260px", wordBreak: "break-word" }}>{item.erro.slice(0, 90)}</div>}
                </td>
                <td style={{ fontSize: "11px" }}>{item.canal || "—"}</td>
                <td style={{ fontWeight: 600, fontSize: "12px", color: item.status === "enviada" ? "var(--success)" : item.status === "erro" ? "var(--danger)" : "var(--text-muted)" }}>
                  {item.status === "enviada" ? "✅ enviada" : item.status === "erro" ? "❌ erro" : "⏳ pendente"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
