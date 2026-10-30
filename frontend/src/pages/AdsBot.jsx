import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const STEP_HINTS = {
  1: {
    rota: "/",
    texto: "Adicione ou aprove um produto. Na aprovação (com LLM ativo) o plano de ataque é gerado automaticamente.",
    cta: "Ir para Seus Produtos",
  },
  2: {
    rota: "/adspages",
    texto: "Gere a pre-sell ou a página de vendas (12 seções) no AdsPages. O pixel é embutido automaticamente.",
    cta: "Ir para AdsPages",
  },
  3: {
    rota: "/hosting/paginas",
    texto: "Publique a página no GitHub (Cloudflare Pages conectado faz o deploy). Copie a URL pública.",
    cta: "Ir para Páginas Criadas",
  },
  4: {
    rota: "/adscreator",
    texto: "Monte as campanhas (Google/Meta/TikTok) com CPA alvo e palavras do AdsWords. Publique PAUSADA e revise.",
    cta: "Ir para AdsCreator",
  },
  5: {
    rota: "/tracking/visitas",
    texto: "Configure a URL pública do /track (túnel) e acompanhe visitas, cliques e drenagem em tempo real.",
    cta: "Ir para Minhas Visitas",
  },
  6: { rota: null, texto: "Revise e gere o Relatório de Lançamento com o checklist final.", cta: null },
};

export default function AdsBot() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [lancamento, setLancamento] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [relatorio, setRelatorio] = useState(null);
  const [relOpen, setRelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let atual = await api.lancamentoAtual();
      if (!atual) atual = await api.iniciarLancamento(null);
      setLancamento(atual);
      setEtapas(await api.lancamentoEtapas());
    } catch (err) {
      toast(err.message || "Falha ao carregar o lançamento.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const avancar = async (etapa) => {
    try {
      const updated = await api.salvarEtapaLancamento(lancamento.id, etapa, { [`etapa_${etapa}_ok`]: true });
      setLancamento(updated);
      toast(`Etapa ${etapa} registrada!`);
    } catch (err) {
      toast(err.message || "Falha ao salvar a etapa.");
    }
  };

  const concluir = async () => {
    try {
      const rel = await api.concluirLancamento(lancamento.id);
      setRelatorio(rel);
      setRelOpen(true);
      toast("Lançamento concluído! Relatório gerado.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao concluir.");
    }
  };

  const abrirRelatorio = async () => {
    try {
      const rel = await api.relatorioLancamento(lancamento.id);
      setRelatorio(rel);
      setRelOpen(true);
    } catch (err) {
      toast(err.message || "Falha ao abrir o relatório.");
    }
  };

  const progresso = lancamento
    ? lancamento.status === "concluido"
      ? 100
      : Math.round(((lancamento.etapa_atual - 1) / (etapas.length || 6)) * 100)
    : 0;
  const faltam = lancamento?.status === "concluido" ? 0 : (etapas.length || 6) - (lancamento?.etapa_atual || 1) + 1;

  if (loading && !lancamento) return <div className="loading-screen">Carregando AdsBot…</div>;

  return (
    <section>
      <h1>🤖 AdsBot — Lançamento Assistido</h1>
      <p className="subtitle">Conduza seu lançamento passo a passo — o progresso fica salvo e você pode parar e voltar quando quiser.</p>

      {lancamento && (
        <div className="form-card">
          <div className="flex-between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <strong>
              {lancamento.status === "concluido"
                ? "✅ Lançamento concluído"
                : `Etapa ${lancamento.etapa_atual} de ${etapas.length} — faltam ${faltam} passo(s)`}
            </strong>
            <span style={{ fontSize: "13px", color: "var(--primary)", fontWeight: 700 }}>{progresso}%</span>
          </div>
          <div className="funnel-step-bar" style={{ height: "12px" }}>
            <div style={{ width: `${progresso}%`, background: "var(--primary)", height: "100%", borderRadius: "4px" }} />
          </div>
        </div>
      )}

      <div className="visitor-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {(etapas.length ? etapas : Array.from({ length: 6 }, (_, i) => ({ numero: i + 1 }))).map((etapa) => {
          const numero = etapa.numero;
          const hint = STEP_HINTS[numero] || {};
          const concluida = lancamento?.dados?.[`etapa_${numero}_ok`] || (lancamento?.etapa_atual || 1) > numero || lancamento?.status === "concluido";
          const atualEtapa = lancamento?.etapa_atual === numero && lancamento?.status !== "concluido";
          return (
            <div
              className="visitor-card"
              key={numero}
              style={atualEtapa ? { border: "2px solid var(--primary)" } : {}}
            >
              <div className="visitor-card-header">
                <div className="visitor-ip">
                  {concluida ? "✅" : "⬜"} {etapa.emoji || "📋"} {numero}. {etapa.nome || `Etapa ${numero}`}
                </div>
                {atualEtapa && <span className="visitor-badge" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>atual</span>}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>{hint.texto || ""}</div>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                {hint.rota && (
                  <button className="btn-outline" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={() => navigate(hint.rota)}>
                    {hint.cta}
                  </button>
                )}
                {numero === 6 ? (
                  <>
                    <button className="btn-primary" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={abrirRelatorio}>
                      📄 Ver relatório
                    </button>
                    {lancamento?.status !== "concluido" && (
                      <button className="btn-outline" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={concluir}>
                        ✅ Concluir lançamento
                      </button>
                    )}
                  </>
                ) : (
                  !concluida && (
                    <button className="btn-primary" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={() => avancar(numero)}>
                      ✓ Marcar como feito
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={relOpen} title="📄 Relatório de Lançamento" onClose={() => setRelOpen(false)}>
        {!relatorio ? (
          <p className="placeholder-note">Carregando…</p>
        ) : (
          <>
            <h4 style={{ fontSize: "14px", marginBottom: "8px" }}>🛍️ Produto</h4>
            <p style={{ fontSize: "14px" }}>
              {relatorio.produto?.nome || "—"} · {relatorio.produto?.plataforma || ""} · nicho {relatorio.produto?.nicho || "—"}
            </p>
            {relatorio.analysis?.analise?.resumo && (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                <strong>Resumo IA:</strong> {relatorio.analysis.analise.resumo}
              </p>
            )}

            <h4 style={{ fontSize: "14px", margin: "16px 0 8px" }}>🛡️ Páginas ({relatorio.paginas.length})</h4>
            {relatorio.paginas.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Nenhuma página vinculada.</p>
            ) : (
              <ul className="placeholder-list">
                {relatorio.paginas.map((p) => (
                  <li key={p.id}>
                    {p.titulo} ({p.tipo}) — {p.status}
                    {p.published_url ? <> · <a href={p.published_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{p.published_url}</a></> : ""}
                  </li>
                ))}
              </ul>
            )}

            <h4 style={{ fontSize: "14px", margin: "16px 0 8px" }}>🎯 Campanhas ({relatorio.campanhas.length})</h4>
            {relatorio.campanhas.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Nenhuma campanha vinculada.</p>
            ) : (
              <ul className="placeholder-list">
                {relatorio.campanhas.map((c) => (
                  <li key={c.id}>
                    {c.nome} — {c.plataforma} · {c.status} · CPA R$ {c.cpa_alvo?.toFixed?.(2) ?? c.cpa_alvo} · R$ {c.orcamento_diario?.toFixed?.(2) ?? c.orcamento_diario}/dia
                  </li>
                ))}
              </ul>
            )}

            <h4 style={{ fontSize: "14px", margin: "16px 0 8px" }}>✅ Checklist final</h4>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", color: "var(--text-muted)", fontFamily: "inherit" }}>
              {relatorio.checklist || "Checklist do seed indisponível."}
            </pre>
          </>
        )}
      </Modal>
    </section>
  );
}
