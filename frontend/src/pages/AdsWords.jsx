import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function AdsWords() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState([]);
  const [produtoId, setProdutoId] = useState("");
  const [dados, setDados] = useState({ positivas: [], negativas: [] });
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [manual, setManual] = useState({ tipo: "positiva", texto: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, palavras] = await Promise.all([api.produtos(), api.adswords(produtoId ? Number(produtoId) : undefined)]);
      setProdutos(lista);
      setDados(palavras);
    } catch (err) {
      toast(err.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [toast, produtoId]);

  useEffect(() => {
    load();
  }, [load]);

  const gerar = async () => {
    setGerando(true);
    try {
      await api.adswordsGerar(produtoId ? Number(produtoId) : null);
      toast("Palavras-chave geradas com IA!");
      await load();
    } catch (err) {
      toast(err.message || "Falha na geração.");
    } finally {
      setGerando(false);
    }
  };

  const adicionar = async (event) => {
    event.preventDefault();
    if (!manual.texto.trim()) return;
    try {
      await api.adswordsAdicionar({
        produto_id: produtoId ? Number(produtoId) : null,
        tipo: manual.tipo,
        texto: manual.texto.trim(),
      });
      setManual({ ...manual, texto: "" });
      toast("Palavra adicionada!");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao adicionar.");
    }
  };

  const remover = async (item) => {
    try {
      await api.adswordsRemover(item.id);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao remover.");
    }
  };

  const copiarLista = async (items, label) => {
    const texto = items.map((item) => item.texto).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${label} copiada (${items.length})!`);
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  const positivas = dados.positivas || [];
  const negativas = dados.negativas || [];

  return (
    <section>
      <h1>✈️ AdsWords</h1>
      <p className="subtitle">Palavras-chave e negativas para Google Ads (correspondência de frase) — geradas por IA ou manuais.</p>

      <div className="form-card">
        <div className="form-row">
          <div className="form-group">
            <label>Produto</label>
            <select
              value={produtoId}
              onChange={(event) => setProdutoId(event.target.value)}
            >
              <option value="">— sem produto vinculado —</option>
              {produtos.map((produto) => (
                <option key={produto.id} value={produto.id}>{produto.nome}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn-primary" onClick={gerar} disabled={gerando} style={{ width: "100%" }}>
              {gerando ? "✨ Gerando com IA…" : "✨ Gerar palavras-chave com IA"}
            </button>
          </div>
        </div>

        <form onSubmit={adicionar} style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
          <select value={manual.tipo} onChange={(e) => setManual({ ...manual, tipo: e.target.value })} style={{ maxWidth: "140px" }}>
            <option value="positiva">Positiva</option>
            <option value="negativa">Negativa</option>
          </select>
          <input style={{ flex: 1 }} placeholder="Adicionar palavra manualmente…" value={manual.texto} onChange={(e) => setManual({ ...manual, texto: e.target.value })} />
          <button className="btn-outline" type="submit">+ Adicionar</button>
        </form>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="chart-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>✅ Positivas ({positivas.length})</h3>
            <button className="btn-outline" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => copiarLista(positivas, "Positivas")} disabled={positivas.length === 0}>
              📋 Copiar
            </button>
          </div>
          {loading ? (
            <p className="placeholder-note">Carregando…</p>
          ) : positivas.length === 0 ? (
            <p className="placeholder-note">Nenhuma positiva ainda — gere com IA (precisa de LLM configurado em Chaves de API) ou adicione manualmente.</p>
          ) : (
            <table style={{ marginTop: "6px" }}>
              <thead>
                <tr><th>Palavra</th><th>Corresp.</th><th>Origem</th><th></th></tr>
              </thead>
              <tbody>
                {positivas.map((item) => (
                  <tr key={item.id}>
                    <td>{item.texto}</td>
                    <td>{item.correspondencia}</td>
                    <td>{item.origem === "ia" ? "IA" : "manual"}</td>
                    <td className="action-icons"><span title="Remover" onClick={() => remover(item)}>🗑️</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="chart-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>🚫 Negativas ({negativas.length})</h3>
            <button className="btn-outline" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => copiarLista(negativas, "Negativas")} disabled={negativas.length === 0}>
              📋 Copiar
            </button>
          </div>
          {loading ? (
            <p className="placeholder-note">Carregando…</p>
          ) : negativas.length === 0 ? (
            <p className="placeholder-note">Nenhuma negativa ainda. As negativas padrão do seed entram automaticamente na geração por IA.</p>
          ) : (
            <table style={{ marginTop: "6px" }}>
              <thead>
                <tr><th>Palavra</th><th>Origem</th><th></th></tr>
              </thead>
              <tbody>
                {negativas.map((item) => (
                  <tr key={item.id}>
                    <td>{item.texto}</td>
                    <td>{item.origem === "ia" ? "IA" : "manual"}</td>
                    <td className="action-icons"><span title="Remover" onClick={() => remover(item)}>🗑️</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="placeholder-note">
        Pronto? Use as palavras no <a href="/adscreator" onClick={(e) => { e.preventDefault(); navigate("/adscreator"); }}>AdsCreator</a> ao montar a campanha.
      </p>
    </section>
  );
}
