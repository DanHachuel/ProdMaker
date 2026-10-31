import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function ContasGoogle() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conectando, setConectando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await api.settings());
    } catch (err) {
      toast(err.message || "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const google = settings?.api_keys?.["google-ads"] || {};
  const conectado = Boolean(google.connected_at || (google.refresh_token || "").trim());
  const temClient = Boolean((google.client_id || "").trim());

  const conectar = async () => {
    setConectando(true);
    try {
      const result = await api.googleOAuthUrl();
      const popup = window.open(result.url, "google_oauth", "width=520,height=640");
      if (!popup) {
        toast("O navegador bloqueou o popup — permita popups para o ProdMaker.");
        return;
      }
      const timer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          setConectando(false);
          await load();
          toast("Verificando conexão do Google…");
        }
      }, 800);
    } catch (err) {
      setConectando(false);
      toast(err.message || "Falha ao iniciar o OAuth.");
    }
  };

  return (
    <section>
      <h1>🔑 Contas do Google</h1>
      <p className="subtitle">Conecte sua conta do Google Ads com 1 clique — o Refresh Token é gerado e salvo automaticamente.</p>

      <div className="domain-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="domain-card" style={{ minHeight: "auto" }}>
          <div>
            <div className="domain-title">🔑 Google Ads</div>
            {conectado ? (
              <div className="status-tag online">✅ Conta conectada {google.connected_at ? `em ${google.connected_at.slice(0, 10)}` : ""}</div>
            ) : (
              <div className="status-tag pending">⏳ Conta não conectada</div>
            )}

            <ul className="domain-list">
              <li>🧾 OAuth Client ID: {temClient ? "configurado" : "— configure em Chaves de API"}</li>
              <li>🔄 Refresh Token: {conectado ? "gerado automaticamente ✅" : "— gerado ao conectar"}</li>
              <li>🧮 Developer Token / Customer ID: {(google.developer_token || "").trim() ? "configurado" : "— configure em Chaves de API"}</li>
            </ul>

            <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
              <strong>Como funciona:</strong> salve o <code>OAuth Client ID</code> e <code>Client Secret</code> do
              Google Cloud em Chaves de API (card Google Ads) e clique em conectar. No Google Cloud, autorize a
              URL de redirect <code>http://localhost:8188/api/google/callback</code> (tipo "Web" ou "Desktop app").
              O ProdMaker abre o consentimento, troca o código e salva o refresh token — sem colar nada à mão.
            </p>
          </div>
          <div className="domain-card-bottom">
            <div className="domain-actions">
              <button className="btn-primary" onClick={conectar} disabled={conectando || !temClient}>
                {conectando ? "Aguardando autorização…" : conectado ? "🔁 Reconectar conta" : "🔗 Conectar com Google (1 clique)"}
              </button>
            </div>
            {!temClient && (
              <p style={{ fontSize: "12px", color: "var(--warning)" }}>
                Configure primeiro o OAuth Client ID em Chaves de API → Google Ads.
              </p>
            )}
          </div>
        </div>
      </div>

      {loading && <p className="placeholder-note">Carregando…</p>}
    </section>
  );
}
