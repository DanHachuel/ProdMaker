import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../App";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const LLM_DEFAULTS = {
  nvidia: { kind: "openai", base_url: "https://integrate.api.nvidia.com/v1", model: "" },
  gemini: { kind: "gemini", base_url: "", model: "gemini-2.5-flash" },
};

const ADMIN_ONLY_CARDS = ["github", "cloudflare", "supabase", "stripe", "redis"];

const KEY_CARDS = [
  { id: "tracking", emoji: "🎯", name: "Pixel de Rastreamento", fields: [{ key: "pixel_url", label: "URL pública do /track (túnel ou domínio)", placeholder: "https://meu-tunel.exemplo.com/track" }] },
  { id: "gamma", emoji: "🎨", name: "Gamma AI", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "base_url", label: "Base URL", placeholder: "https://api.app.gamma" }] },
  { id: "github", emoji: "🐙", name: "GitHub", adminOnly: true, fields: [{ key: "token", label: "Token (PAT)", secret: true }, { key: "repo", label: "Repositório de páginas (opcional)", placeholder: "usuario/prodmaker-pages" }] },
  { id: "cloudflare", emoji: "☁️", name: "Cloudflare", adminOnly: true, fields: [{ key: "api_token", label: "API Token", secret: true }, { key: "account_id", label: "Account ID" }] },
  { id: "telegram", emoji: "✈️", name: "Telegram", fields: [{ key: "bot_token", label: "Bot Token", secret: true }, { key: "chat_id", label: "Chat ID" }] },
  { id: "pinterest", emoji: "📌", name: "Pinterest", fields: [{ key: "email", label: "E-mail" }, { key: "password", label: "Senha", secret: true }, { key: "board", label: "Board padrão" }] },
  { id: "google-ads", emoji: "🎯", name: "Google Ads", fields: [{ key: "developer_token", label: "Developer Token", secret: true }, { key: "client_id", label: "OAuth Client ID" }, { key: "client_secret", label: "OAuth Client Secret", secret: true }, { key: "refresh_token", label: "Refresh Token", secret: true }, { key: "customer_id", label: "Customer ID (XXX-XXX-XXXX)" }, { key: "conversion_action", label: "Conversion Action (recurso)", placeholder: "customers/123/conversionActions/456" }, { key: "api_version", label: "Versão da API", placeholder: "v22" }] },
  { id: "meta", emoji: "👥", name: "Meta Ads", fields: [{ key: "app_id", label: "App ID" }, { key: "app_secret", label: "App Secret", secret: true }, { key: "access_token", label: "Access Token (sistema)", secret: true }, { key: "ad_account_id", label: "Ad Account ID (act_...)" }] },
  { id: "tiktok", emoji: "🎵", name: "TikTok Ads", fields: [{ key: "app_id", label: "App ID" }, { key: "app_secret", label: "App Secret", secret: true }, { key: "auth_code", label: "Auth Code (portal TikTok)", secret: true }, { key: "advertiser_id", label: "Advertiser ID" }] },
  { id: "supabase", emoji: "🟩", name: "Supabase", adminOnly: true, fields: [{ key: "url", label: "SUPABASE_URL", placeholder: "https://xxxx.supabase.co" }, { key: "anon_key", label: "SUPABASE_ANON_KEY", secret: true }] },
  { id: "stripe", emoji: "💳", name: "Stripe", adminOnly: true, fields: [{ key: "secret_key", label: "STRIPE_SECRET_KEY", secret: true }, { key: "webhook_secret", label: "Webhook Secret", secret: true }] },
  { id: "canva", emoji: "🖼️", name: "Canva (MCP)", soon: true },
];

function maskKey(value) {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
}

export default function ApiKeys() {
  const { toast } = useToast();
  const { role, logout } = useApp();
  const [providers, setProviders] = useState([]);
  const [apiKeys, setApiKeys] = useState({});
  const [openCard, setOpenCard] = useState(null); // "nvidia" | "gemini" | {id from KEY_CARDS}
  const [draft, setDraft] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [falha, setFalha] = useState(null); // { status, message }

  const load = useCallback(async () => {
    setLoading(true);
    setFalha(null);
    try {
      const [providerList, settings] = await Promise.all([api.llmProviders(), api.settings()]);
      setProviders(providerList || []);
      setApiKeys(settings?.api_keys || {});
    } catch (err) {
      // 401 = sessão expirada; 403 = RBAC barrou (não-admin) — em ambos os casos
      // mostramos uma tela explicativa em vez de quebrar a renderização.
      const status = err?.status;
      if (status === 401 || status === 403) {
        setFalha({ status, message: err.message || (status === 403 ? "Acesso restrito ao Super Admin." : "Sessão expirada.") });
      } else {
        setFalha({ status: status || 0, message: err?.message || "Falha ao carregar configurações." });
      }
      toast(err?.message || "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const providerById = (id) => providers.find((p) => p.id === id);

  const openLlmCard = (id) => {
    const existing = providerById(id) || { id, ...LLM_DEFAULTS[id], api_key: "", priority: id === "nvidia" ? 1 : 2, active: false };
    setDraft({ ...existing });
    setTestResult(null);
    setOpenCard(id);
  };

  const openKeyCard = (card) => {
    setDraft({ ...(apiKeys[card.id] || {}) });
    setTestResult(null);
    setOpenCard(card);
  };

  const saveLlmCard = async () => {
    setSaving(true);
    try {
      const next = providers.filter((p) => p.id !== draft.id);
      next.push({ id: draft.id, kind: draft.kind, api_key: (draft.api_key || "").trim(), base_url: (draft.base_url || "").trim(), model: (draft.model || "").trim(), priority: Number(draft.priority) || 99, active: Boolean(draft.active) });
      next.sort((a, b) => (a.priority || 99) - (b.priority || 99));
      const saved = await api.llmProviders ? null : null;
      await requestProviders(next);
      toast(`Cartão ${draft.id} salvo!`);
      setOpenCard(null);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const requestProviders = async (list) => {
    await fetch("/api/llm/providers", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: list }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Erro ${res.status}`);
      }
    });
  };

  const saveKeyCard = async (card) => {
    setSaving(true);
    try {
      const settings = await api.settings();
      settings.api_keys = { ...(settings?.api_keys || {}), [card.id]: draft };
      await api.saveSettings(settings);
      toast(`Cartão ${card.name} salvo!`);
      setOpenCard(null);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.llmTest(draft.id);
      setTestResult({ ok: true, text: `OK — ${result.model || "modelo"} respondeu em ${result.latency_ms} ms` });
    } catch (err) {
      setTestResult({ ok: false, text: err.message || "Falha no teste." });
    } finally {
      setTesting(false);
    }
  };

  const llmConfigured = (id) => {
    const p = providerById(id);
    return Boolean(p && p.active && p.api_key);
  };

  const keyConfigured = (id, fields) => {
    const data = apiKeys[id] || {};
    return fields.some((f) => (data[f.key] || "").trim());
  };

  if (loading) {
    return (
      <section>
        <h1>🔌 Chaves de API</h1>
        <p className="subtitle">Carregando configurações…</p>
        <div className="api-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="api-card" key={i} style={{ opacity: 0.4 }}>
              <div className="api-logo">…</div>
              <div className="api-status">carregando</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (falha) {
    const negado = falha.status === 401 || falha.status === 403;
    return (
      <section>
        <h1>🔌 Chaves de API</h1>
        <p className="subtitle">
          {negado ? "Não foi possível carregar suas chaves." : "Falha ao carregar as configurações."}
        </p>
        <div className="login-error" style={{ maxWidth: "560px", marginBottom: "14px", fontWeight: 600 }}>
          {negado ? "🔒" : "⚠️"} {falha.message}
        </div>
        <p className="placeholder-note" style={{ maxWidth: "560px", marginBottom: "14px" }}>
          {falha.status === 403
            ? "Esta tela é restrita ao Super Admin. Se você acredita que deveria ter acesso, fale com o administrador do sistema."
            : falha.status === 401
              ? "Sua sessão expirou. Faça login novamente para continuar."
              : "Verifique se o servidor está rodando e tente novamente. Detalhes ficam em storage/logs/app.log."}
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-primary" onClick={() => load()}>
            Tentar novamente
          </button>
          {falha.status === 401 && (
            <button className="btn-outline" onClick={() => logout()}>
              Sair e entrar novamente
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>🔌 Chaves de API</h1>
      <p className="subtitle">
        Integrações do ProdMaker. As chaves ficam apenas no seu storage local — nunca no GitHub.
      </p>

      <h3 style={{ fontSize: "15px", margin: "24px 0 8px" }}>🤖 Provedores LLM (pool com prioridade e failover)</h3>
      <div className="api-grid">
        {[{ id: "nvidia", emoji: "🤖", name: "NVIDIA NIM" }, { id: "gemini", emoji: "✨", name: "Gemini" }].map((card) => (
          <div className="api-card" key={card.id} onClick={() => openLlmCard(card.id)}>
            <div className="api-logo">{card.emoji} {card.name}</div>
            <div className="api-status" style={{ color: llmConfigured(card.id) ? "var(--success)" : "var(--text-muted)" }}>
              {llmConfigured(card.id) ? "Configurado" : "Não configurado"}
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: "15px", margin: "28px 0 8px" }}>🔌 Demais integrações</h3>
      {role !== "admin" && (
        <p className="placeholder-note" style={{ marginBottom: "12px" }}>
          🔒 Você vê apenas as chaves de trabalho (LLM, anúncios, notificações). Configurações de
          infraestrutura (Supabase, Stripe, GitHub, Cloudflare, Redis) são exclusivas do Super Admin.
        </p>
      )}
      <div className="api-grid">
        {KEY_CARDS.filter((card) => role === "admin" || !card.adminOnly).map((card) => (
          <div
            className="api-card"
            key={card.id}
            style={card.soon ? { opacity: 0.55, cursor: "default" } : {}}
            onClick={() => !card.soon && openKeyCard(card)}
            title={card.soon ? "Em breve" : "Configurar"}
          >
            <div className="api-logo">{card.emoji} {card.name}</div>
            <div className="api-status" style={{ color: keyConfigured(card.id, card.fields || []) ? "var(--success)" : "var(--text-muted)" }}>
              {card.soon ? "Em breve" : keyConfigured(card.id, card.fields) ? "Configurado" : "Não configurado"}
            </div>
          </div>
        ))}
      </div>

      {/* Modal LLM */}
      <Modal open={openCard === "nvidia" || openCard === "gemini"} title={`Provedor LLM — ${openCard}`} onClose={() => setOpenCard(null)}>
        {["nvidia", "gemini"].includes(openCard) && (
          <>
            <div className="form-group">
              <label>API Key</label>
              <input type="password" value={draft.api_key || ""} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} placeholder={openCard === "nvidia" ? "nvapi-..." : "AIza..."} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Modelo</label>
                <input value={draft.model || ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder={openCard === "nvidia" ? "ex.: nvidia/nemotron-..." : "gemini-2.5-flash"} />
              </div>
              <div className="form-group">
                <label>Prioridade (1 = primeiro)</label>
                <input type="number" min="1" value={draft.priority ?? 2} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
              </div>
            </div>
            {openCard === "nvidia" && (
              <div className="form-group">
                <label>Base URL (compatível OpenAI)</label>
                <input value={draft.base_url || ""} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} placeholder="https://integrate.api.nvidia.com/v1" />
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>
              <input type="checkbox" checked={Boolean(draft.active)} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} style={{ width: "auto" }} />
              Ativo (participa do pool)
            </label>
            {testResult && (
              <div className={testResult.ok ? "api-status" : "login-error"} style={{ marginBottom: "12px", fontWeight: 600 }}>
                {testResult.ok ? "✅" : "❌"} {testResult.text}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="btn-outline" onClick={runTest} disabled={testing || !(draft.api_key || "").trim()}>
                {testing ? "Testando…" : "Testar chamada"}
              </button>
              <button className="btn-primary" onClick={saveLlmCard} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal integrações */}
      <Modal
        open={Boolean(openCard && openCard.fields)}
        title={`${openCard?.emoji || ""} ${openCard?.name || ""}`}
        onClose={() => setOpenCard(null)}
      >
        {openCard?.fields && (
          <>
            {openCard.fields.map((field) => (
              <div className="form-group" key={field.key}>
                <label>{field.label}</label>
                <input
                  type={field.secret ? "password" : "text"}
                  value={draft[field.key] || ""}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                  placeholder={field.placeholder || ""}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="btn-primary" onClick={() => saveKeyCard(openCard)} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
              {openCard?.id === "tiktok" && role === "admin" && (
                <button
                  className="btn-outline"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    try {
                      const r = await api.tiktokToken();
                      setTestResult({ ok: true, text: `Token obtido! advertiser ${r.advertiser_id || "—"}` });
                      await load();
                    } catch (err) {
                      setTestResult({ ok: false, text: err.message || "Falha ao obter token." });
                    } finally {
                      setTesting(false);
                    }
                  }}
                >
                  {testing ? "Trocando…" : "🔑 Trocar auth_code por token"}
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
