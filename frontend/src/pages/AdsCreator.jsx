import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const PLATAFORMAS = [
  { id: "google", emoji: "🎯", label: "Google Ads", desc: "Search com CPA 60–80% da comissão + negativas" },
  { id: "meta", emoji: "👥", label: "Meta Ads", desc: "1 campanha → 1 conjunto → N criativos (Advantage+)" },
  { id: "tiktok", emoji: "🎵", label: "TikTok Ads", desc: "Vídeo 9:16 UGC, teste US$10–20/dia" },
];

const STATUS_BADGE = {
  rascunho: { text: "📝 Rascunho", color: "var(--text-muted)" },
  publicada: { text: "✅ Publicada", color: "var(--success)" },
  erro: { text: "❌ Erro", color: "var(--danger)" },
};

function brl(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdsCreator() {
  const { toast } = useToast();
  const [produtos, setProdutos] = useState([]);
  const [campanhas, setCampanhas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plataforma, setPlataforma] = useState("google");
  const [produtoId, setProdutoId] = useState("");
  const [nome, setNome] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [quantidadeCriativos, setQuantidadeCriativos] = useState(5);
  const [palavras, setPalavras] = useState({ positivas: [], negativas: [] });
  const [criativos, setCriativos] = useState([]);
  const [gerandoCriativos, setGerandoCriativos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plano, setPlano] = useState(null);
  const [publicando, setPublicando] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, camps] = await Promise.all([api.produtos(), api.campanhas()]);
      setProdutos(lista);
      setCampanhas(camps);
    } catch (err) {
      toast(err.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const carregarPalavras = useCallback(async (id) => {
    try {
      const dados = await api.adswords(id ? Number(id) : undefined);
      setPalavras(dados);
    } catch {}
  }, []);

  useEffect(() => {
    if (produtoId) carregarPalavras(produtoId);
    else setPalavras({ positivas: [], negativas: [] });
  }, [produtoId, carregarPalavras]);

  const gerarCriativos = async () => {
    setGerandoCriativos(true);
    try {
      const result = await api.gerarCriativos({ produto_id: produtoId ? Number(produtoId) : null, quantidade: 3 });
      setCriativos(result.criativos);
      toast(`${result.criativos.length} criativo(s) gerado(s) por ${result.provider}!`);
    } catch (err) {
      toast(err.message || "Falha na geração de criativos.");
    } finally {
      setGerandoCriativos(false);
    }
  };

  const salvar = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        produto_id: produtoId ? Number(produtoId) : null,
        plataforma,
        nome,
        keywords: palavras.positivas.map((p) => ({ texto: p.texto, correspondencia: p.correspondencia })),
        negativas: palavras.negativas.map((n) => ({ texto: n.texto })),
        criativos,
      };
      if (orcamento) body.orcamento_diario = Number(orcamento);
      if (plataforma === "meta") body.quantidade_criativos = quantidadeCriativos;
      const saved = await api.createCampanha(body);
      toast(`Campanha "${saved.nome}" salva como rascunho!`);
      setNome("");
      setOrcamento("");
      setCriativos([]);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar a campanha.");
    } finally {
      setSaving(false);
    }
  };

  const abrirPlano = async (campanha) => {
    try {
      const full = await api.getCampanha(campanha.id);
      setPlano(full);
    } catch (err) {
      toast(err.message || "Falha ao abrir a campanha.");
    }
  };

  const publicar = async (campanha) => {
    setPublicando(campanha.id);
    try {
      await api.publicarCampanha(campanha.id);
      toast(`Campanha "${campanha.nome}" publicada (PAUSADA para revisão)!`);
      await load();
    } catch (err) {
      toast(err.message || "Falha na publicação.");
      await load();
    } finally {
      setPublicando(null);
    }
  };

  const remover = async (campanha) => {
    if (!window.confirm(`Excluir a campanha "${campanha.nome}"?`)) return;
    try {
      await api.deleteCampanha(campanha.id);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao excluir.");
    }
  };

  return (
    <section>
      <h1>🎯 AdsCreator</h1>
      <p className="subtitle">Crie anúncios de alta conversão — Google, Meta e TikTok com os defaults validados.</p>

      <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {PLATAFORMAS.map((item) => (
          <div
            className="metric-card"
            key={item.id}
            style={{
              cursor: "pointer",
              border: plataforma === item.id ? "2px solid var(--primary)" : "1px solid var(--border)",
            }}
            onClick={() => setPlataforma(item.id)}
          >
            <h3>{item.emoji} {item.label}{plataforma === item.id ? " ✓" : ""}</h3>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{item.desc}</div>
          </div>
        ))}
      </div>

      <div className="form-card">
        <form onSubmit={salvar}>
          <div className="form-row">
            <div className="form-group">
              <label>Produto (preenche comissão/preço)</label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">— sem produto —</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>{produto.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Nome da campanha (opcional)</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: ProdX — Search US" />
            </div>
          </div>

          <div className="form-row">
            {plataforma === "meta" ? (
              <div className="form-group">
                <label>Quantidade de criativos (mín. 5)</label>
                <input type="number" min="5" max="20" value={quantidadeCriativos} onChange={(e) => setQuantidadeCriativos(Number(e.target.value))} />
              </div>
            ) : null}
            <div className="form-group">
              <label>
                Orçamento diário ({plataforma === "tiktok" ? "US$" : "R$"})
                {plataforma === "meta" ? " — vazio = regra criativos × ½ ticket" : plataforma === "google" ? " — vazio = R$110" : " — vazio = US$15"}
              </label>
              <input type="number" step="0.01" min="0" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} />
            </div>
            <div className="form-group" style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn-outline" type="button" onClick={gerarCriativos} disabled={gerandoCriativos} style={{ width: "100%" }}>
                {gerandoCriativos ? "✨ Gerando…" : "✨ Gerar criativos com IA"}
              </button>
            </div>
          </div>

          {criativos.length > 0 && (
            <div className="placeholder-list">
              {criativos.map((item, index) => (
                <li key={index}>
                  <strong>[{index + 1}]</strong> {item.gancho_3s || item.roteiro || "(sem gancho)"}
                </li>
              ))}
            </div>
          )}

          <p className="placeholder-note" style={{ marginBottom: "12px" }}>
            Palavras do AdsWords serão usadas: {palavras.positivas?.length || 0} positiva(s) · {palavras.negativas?.length || 0} negativa(s)
            {produtoId ? "" : " — selecione um produto para usar as palavras já geradas."}
          </p>

          <button className="btn-primary" type="submit" disabled={saving} style={{ width: "100%" }}>
            {saving ? "Salvando…" : "💾 Salvar campanha como rascunho"}
          </button>
        </form>
      </div>

      <h3 style={{ fontSize: "16px", margin: "24px 0 8px" }}>Campanhas ({campanhas.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Criada</th>
            <th>Campanha</th>
            <th>Plataforma</th>
            <th>CPA alvo</th>
            <th>Orçamento/dia</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={7}>Carregando…</td></tr>
          ) : campanhas.length === 0 ? (
            <tr className="empty-row"><td colSpan={7}>Nenhuma campanha ainda. Monte a primeira acima.</td></tr>
          ) : (
            campanhas.map((campanha) => (
              <tr key={campanha.id}>
                <td>{campanha.created_at?.slice(0, 10) || "—"}</td>
                <td>{campanha.nome}</td>
                <td>{campanha.plataforma}</td>
                <td>{campanha.plataforma === "google" && campanha.cpa_alvo ? brl(campanha.cpa_alvo) : "—"}</td>
                <td>{brl(campanha.orcamento_diario)}</td>
                <td style={{ color: STATUS_BADGE[campanha.status]?.color, fontWeight: 600, fontSize: "12px" }}>
                  {STATUS_BADGE[campanha.status]?.text || campanha.status}
                  {campanha.erro && <div style={{ fontSize: "10px", color: "var(--danger)", maxWidth: "180px", wordBreak: "break-word" }}>{campanha.erro.slice(0, 90)}</div>}
                </td>
                <td className="action-icons">
                  <span title="Ver plano" onClick={() => abrirPlano(campanha)}>👁️</span>
                  <span
                    title={campanha.plataforma === "tiktok" ? "Publicar marca como manual (TikTok)" : "Publicar via API (PAUSADA)"}
                    onClick={() => publicar(campanha)}
                  >
                    {publicando === campanha.id ? "⏳" : "🚀"}
                  </span>
                  <span title="Excluir" onClick={() => remover(campanha)}>🗑️</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Modal open={Boolean(plano)} title={`Campanha — ${plano?.nome || ""}`} onClose={() => setPlano(null)}>
        {plano && (
          <>
            <h4 style={{ fontSize: "14px", marginBottom: "8px" }}>Plano (defaults validados)</h4>
            <div className="json-box" style={{ marginBottom: "16px" }}>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: "220px", overflow: "auto" }}>{JSON.stringify(plano.plano, null, 2)}</pre>
            </div>
            <h4 style={{ fontSize: "14px", marginBottom: "8px" }}>Palavras-chave positivas</h4>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>{(plano.keywords || []).map((k) => k.texto).join(" · ") || "—"}</p>
            <h4 style={{ fontSize: "14px", margin: "12px 0 8px" }}>Negativas</h4>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>{(plano.negativas || []).map((n) => n.texto).join(" · ") || "—"}</p>
            {plano.resultado && (
              <>
                <h4 style={{ fontSize: "14px", margin: "12px 0 8px" }}>Resultado da publicação</h4>
                <div className="json-box">
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: "200px", overflow: "auto" }}>{JSON.stringify(plano.resultado, null, 2)}</pre>
                </div>
              </>
            )}
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: "16px" }}
              disabled={publicando === plano.id}
              onClick={() => { const id = plano.id; setPlano(null); publicar({ id, nome, plataforma }); }}
            >
              🚀 Publicar agora (cria PAUSADA para revisão)
            </button>
          </>
        )}
      </Modal>
    </section>
  );
}
