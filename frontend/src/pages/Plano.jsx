import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

function moeda(value, codigo = "BRL") {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: codigo });
}

export default function Plano() {
  const { toast } = useToast();
  const [dados, setDados] = useState(null);
  const [assinatura, setAssinatura] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [email, setEmail] = useState("");
  const [assinandoId, setAssinandoId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planos, ass, hist] = await Promise.all([api.billingPlanos(), api.billingAssinatura(), api.billingHistorico()]);
      setDados(planos);
      setAssinatura(ass);
      setHistorico(hist);
    } catch (err) {
      toast(err.message || "Falha ao carregar planos.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const assinar = async (plano) => {
    if (!email.trim()) {
      toast("Informe o e-mail da conta.");
      return;
    }
    setAssinandoId(plano.id);
    try {
      const result = await api.billingCheckout({ plano_id: plano.id, email: email.trim() });
      if (result.checkout_url) {
        window.open(result.checkout_url, "_blank", "noopener");
        toast("Checkout do Stripe aberto — conclua o pagamento para ativar.");
      }
    } catch (err) {
      toast(err.message || "Falha ao criar o checkout.");
    } finally {
      setAssinandoId(null);
    }
  };

  const planos = dados?.planos || [];

  return (
    <section>
      <h1>💳 Plano & Assinatura</h1>
      <p className="subtitle">
        {assinatura?.modo === "local"
          ? "Modo local: todos os recursos liberados na sua máquina. Assinatura só é necessária na nuvem (multi-dispositivo)."
          : "Gerencie sua assinatura do ProdMaker Cloud."}
      </p>

      {assinatura?.assinatura && (
        <div className="form-card" style={{ border: "1px solid var(--success)" }}>
          <h3 style={{ fontSize: "15px", marginBottom: "6px" }}>
            ✅ Assinatura {assinatura.assinatura.status === "ativa" ? "ativa" : "em checkout"} — plano {assinatura.assinatura.plano}
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            {assinatura.assinatura.email} · referência Stripe {assinatura.assinatura.stripe_ref || "—"}
            {assinatura.assinatura.current_period_end ? ` · válida até ${assinatura.assinatura.current_period_end.slice(0, 10)}` : ""}
          </p>
        </div>
      )}

      <div className="form-group" style={{ maxWidth: "420px", marginBottom: "20px" }}>
        <label>E-mail da conta (para o checkout)</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
      </div>

      <div className="visitor-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {planos.map((plano) => (
          <div className="domain-card" key={plano.id} style={{ minHeight: "auto", border: plano.destaque ? "2px solid var(--primary)" : undefined }}>
            <div>
              <div className="domain-title">{plano.nome} {plano.destaque && <span style={{ color: "var(--primary)", fontSize: "12px" }}>★ popular</span>}</div>
              <div style={{ fontSize: "24px", fontWeight: 700, margin: "8px 0" }}>
                {plano.preco === 0 ? "Grátis" : moeda(plano.preco, plano.moeda)}{" "}
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 400 }}>
                  {plano.intervalo === "eterno" ? "para sempre" : `/${plano.intervalo}`}
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>{plano.descricao}</p>
              <ul className="domain-list">
                {(plano.recursos || []).map((recurso, index) => (
                  <li key={index}>✅ {recurso}</li>
                ))}
              </ul>
            </div>
            <div className="domain-card-bottom">
              {plano.preco === 0 ? (
                <button className="btn-outline" style={{ width: "100%" }} disabled>
                  Plano atual (local)
                </button>
              ) : (
                <button
                  className="btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => assinar(plano)}
                  disabled={assinandoId === plano.id || !assinatura?.stripe_configurado}
                  title={assinatura?.stripe_configurado ? "Abrir checkout Stripe" : "Configure stripe_secret_key em Chaves de API"}
                >
                  {assinandoId === plano.id ? "Abrindo…" : "Assinar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!assinatura?.stripe_configurado && (
        <p className="placeholder-note" style={{ marginTop: "16px" }}>
          🔧 Para ativar as assinaturas: Chaves de API → Stripe (secret_key + webhook_secret) e preencha os
          <code> stripe_price_id</code> dos planos em <code>seed/planos.json</code>. O app local continua sem travas.
        </p>
      )}

      {historico.length > 0 && (
        <table style={{ marginTop: "24px" }}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Referência</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((item) => (
              <tr key={item.id}>
                <td>{item.created_at}</td>
                <td>{item.plano || "—"}</td>
                <td style={{ fontWeight: 600, color: item.status === "ativa" ? "var(--success)" : "var(--text-muted)" }}>{item.status}</td>
                <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{item.stripe_ref || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loading && <p className="placeholder-note">Carregando…</p>}
    </section>
  );
}
