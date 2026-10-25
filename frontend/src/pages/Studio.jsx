import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";

const FORMATOS = ["E-book", "Planilha", "Mini-curso", "Desafio", "Workshop"];

const EMPTY = {
  titulo: "",
  prompt: "",
  formato: "E-book",
  nicho: "",
  dor: "",
  avatar: "",
  resultado: "",
  modo: "rapido",
};

export default function Studio() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const gerar = async (event) => {
    event.preventDefault();
    setError("");
    setGenerating(true);
    setResult(null);
    try {
      const record = await api.createInfoproduto(form);
      setResult(record);
      toast(`Infoproduto "${record.titulo}" gerado!`);
    } catch (err) {
      setError(err.message || "Falha ao gerar o infoproduto.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section>
      <h1>📖 Criar Infoproduto</h1>
      <p className="subtitle">
        Gere e-books, planilhas e mini-cursos em PDF com IA — Modo Rápido (LLM + PDF local) ou Premium (Gamma AI).
      </p>

      <div className="form-card">
        <form onSubmit={gerar}>
          <div className="form-row">
            <div className="form-group">
              <label>Modo</label>
              <select value={form.modo} onChange={set("modo")}>
                <option value="rapido">⚡ Modo Rápido (open source — LLM + PDF local)</option>
                <option value="gamma">🎨 Modo Premium (Gamma AI)</option>
                <option value="canva" disabled>🖼️ Modo Canva (MCP — em breve)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Formato</label>
              <select value={form.formato} onChange={set("formato")}>
                {FORMATOS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Título desejado (máx. 6 palavras)</label>
            <input required value={form.titulo} onChange={set("titulo")} placeholder="Ex.: Cardápio 7 Dias: Receitas para Secar" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Nicho</label>
              <input value={form.nicho} onChange={set("nicho")} placeholder="Ex.: emagrecimento" />
            </div>
            <div className="form-group">
              <label>Dor específica</label>
              <input value={form.dor} onChange={set("dor")} placeholder="Ex.: passar fome para emagrecer" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Avatar (público-alvo)</label>
              <input value={form.avatar} onChange={set("avatar")} placeholder="Ex.: mulheres 30-50 que trabalham fora" />
            </div>
            <div className="form-group">
              <label>Resultado prometido</label>
              <input value={form.resultado} onChange={set("resultado")} placeholder="Ex.: secar em 7 dias sem passar fome" />
            </div>
          </div>

          <div className="form-group">
            <label>Prompt / instruções adicionais</label>
            <textarea rows={4} value={form.prompt} onChange={set("prompt")} placeholder="Descreva o conteúdo desejado, tom, quantidade de páginas, bônus..." />
          </div>

          {error && (
            <div className="login-error">
              {error}
              {/Chaves de API|provedor/i.test(error) && (
                <> — configure em <a href="/api-keys" onClick={(e) => { e.preventDefault(); navigate("/api-keys"); }}>Chaves de API</a>.</>
              )}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={generating} style={{ width: "100%", marginTop: "10px" }}>
            {generating ? (form.modo === "gamma" ? "🎨 Gerando na Gamma AI…" : "✨ Gerando com IA…") : "✨ Gerar Infoproduto"}
          </button>
        </form>

        {generating && (
          <p className="placeholder-note" style={{ marginTop: "12px" }}>
            ⏳ A geração usa o pool de LLM configurado e pode levar de 30 segundos a alguns minutos. Aguarde…
          </p>
        )}

        {result && (
          <div className="form-card" style={{ marginTop: "20px", border: "1px solid var(--primary)", background: "var(--primary-light)" }}>
            <h3 style={{ marginBottom: "6px" }}>✅ Infoproduto pronto!</h3>
            <p style={{ fontSize: "14px", marginBottom: "12px" }}>
              <strong>{result.titulo}</strong> · {result.formato} · provedor: {result.provider}
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <a className="btn-primary" style={{ textDecoration: "none" }} href={`/api/infoprodutos/${result.id}/download`}>
                ⬇️ Baixar PDF
              </a>
              <button className="btn-outline" onClick={() => navigate("/studio/biblioteca")}>Abrir Biblioteca</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
