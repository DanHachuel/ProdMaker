import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

const STATUS_LABEL = {
  ideia: "💡 Ideia",
  pronto: "📝 Pronto (imagem criada)",
  agendado: "📅 Agendado",
  publicado: "✅ Publicado",
};

export default function Pinterest() {
  const { toast } = useToast();
  const [produtos, setProdutos] = useState([]);
  const [pins, setPins] = useState([]);
  const [produtoId, setProdutoId] = useState("");
  const [board, setBoard] = useState("");
  const [link, setLink] = useState("");
  const [quantidade, setQuantidade] = useState(10);
  const [gerando, setGerando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, dados] = await Promise.all([api.produtos(), api.pins(produtoId ? Number(produtoId) : undefined)]);
      setProdutos(lista);
      setPins(dados);
    } catch (err) {
      toast(err.message || "Falha ao carregar pins.");
    } finally {
      setLoading(false);
    }
  }, [toast, produtoId]);

  useEffect(() => {
    load();
  }, [load]);

  const gerar = async (event) => {
    event.preventDefault();
    setGerando(true);
    try {
      const result = await api.pinsGerar({ produto_id: produtoId ? Number(produtoId) : null, board, link, quantidade });
      toast(`${result.gerados} ideias de pin geradas por ${result.provider}!`);
      await load();
    } catch (err) {
      toast(err.message || "Falha na geração de pins.");
    } finally {
      setGerando(false);
    }
  };

  const toggle = (pinId) => {
    setSelecionados((prev) => (prev.includes(pinId) ? prev.filter((item) => item !== pinId) : [...prev, pinId]));
  };

  const marcar = async (pin, status) => {
    try {
      await api.pinStatus(pin.id, status);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao atualizar.");
    }
  };

  const exportar = async (pinIds) => {
    try {
      const result = await api.pinsExport(pinIds);
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "prodmaker-pins.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast("CSV exportado!");
    } catch (err) {
      toast(err.message || "Falha ao exportar.");
    }
  };

  const remover = async (pin) => {
    try {
      await api.pinRemover(pin.id);
      setSelecionados((prev) => prev.filter((item) => item !== pin.id));
      await load();
    } catch (err) {
      toast(err.message || "Falha ao remover.");
    }
  };

  return (
    <section>
      <h1>📌 Pinterest — Orgânico</h1>
      <p className="subtitle">Pins com SEO apontando para suas presells. Gere ideias por IA, crie as imagens (1000x1500) no Canva/IA e exporte o CSV.</p>

      <div className="form-card">
        <form onSubmit={gerar}>
          <div className="form-row">
            <div className="form-group">
              <label>Produto</label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">— sem produto —</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>{produto.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Board</label>
              <input value={board} onChange={(e) => setBoard(e.target.value)} placeholder="Ex.: Saúde e Bem-estar" />
            </div>
            <div className="form-group">
              <label>Link do pin (presell)</label>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
            </div>
            <div className="form-group" style={{ maxWidth: "120px" }}>
              <label>Quantidade</label>
              <input type="number" min="1" max="20" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={gerando} style={{ width: "100%" }}>
            {gerando ? "✨ Gerando ideias…" : "✨ Gerar ideias de pins com IA"}
          </button>
        </form>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 8px" }}>
        <h3 style={{ fontSize: "16px" }}>Pins ({pins.length})</h3>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => exportar(selecionados)} disabled={selecionados.length === 0}>
            📥 Exportar selecionados ({selecionados.length})
          </button>
          <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => exportar(pins.map((p) => p.id))} disabled={pins.length === 0}>
            📥 Exportar todos
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Título</th>
            <th>Texto na imagem</th>
            <th>Board</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={6}>Carregando…</td></tr>
          ) : pins.length === 0 ? (
            <tr className="empty-row"><td colSpan={6}>Nenhum pin ainda. Gere ideias com IA (precisa de LLM em Chaves de API).</td></tr>
          ) : (
            pins.map((pin) => (
              <tr key={pin.id}>
                <td>
                  <input type="checkbox" checked={selecionados.includes(pin.id)} onChange={() => toggle(pin.id)} style={{ width: "auto" }} />
                </td>
                <td style={{ maxWidth: "220px" }}>
                  {pin.titulo}
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", maxHeight: "34px", overflow: "hidden" }}>{pin.descricao}</div>
                </td>
                <td title={pin.sugestao_imagem}>{pin.texto_imagem}</td>
                <td>{pin.board || "—"}</td>
                <td style={{ fontSize: "12px", fontWeight: 600 }}>{STATUS_LABEL[pin.status] || pin.status}</td>
                <td className="action-icons">
                  {pin.status === "ideia" && <span title="Marcar como pronto (imagem criada)" onClick={() => marcar(pin, "pronto")}>📝</span>}
                  {pin.status === "pronto" && <span title="Marcar como agendado" onClick={() => marcar(pin, "agendado")}>📅</span>}
                  <span title="Excluir" onClick={() => remover(pin)}>🗑️</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="placeholder-note" style={{ marginTop: "16px" }}>
        💡 1 pin = 1 imagem vertical 1000x1500 (ou 1000x1000) com o texto em destaque — crie no Canva ou com IA.
        Mínimo de 5 pins por lançamento (padrão do seed). Agendamento automático via API do Pinterest exige
        credenciais em Chaves de API (card Pinterest) e pode exigir validação manual por conta.
      </p>
    </section>
  );
}
