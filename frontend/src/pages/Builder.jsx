import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const PASSOS = [
  { numero: 1, nome: "Oferta e Parceria", emoji: "📦" },
  { numero: 2, nome: "Estrutura e Precificação", emoji: "🧱" },
  { numero: 3, nome: "Design e Tráfego", emoji: "🎨" },
];

function ChaveValor({ label, valor }) {
  return valor ? (
    <p style={{ fontSize: "13px", marginBottom: "6px" }}>
      <strong style={{ color: "var(--text-muted)" }}>{label}:</strong> {valor}
    </p>
  ) : null;
}

export default function Builder() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [passo, setPasso] = useState(1);
  const [nicho, setNicho] = useState("");
  const [avatar, setAvatar] = useState("");
  const [ofertas, setOfertas] = useState([]);
  const [ofertaSel, setOfertaSel] = useState(null);
  const [parceiro, setParceiro] = useState("");
  const [estrutura, setEstrutura] = useState(null);
  const [preco, setPreco] = useState(47);
  const [anuncios, setAnuncios] = useState([]);
  const [abaAnuncio, setAbaAnuncio] = useState("todos");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [record, setRecord] = useState(null);
  const [previewMd, setPreviewMd] = useState(null);

  const completa = ofertaSel && estrutura && (preco >= 27 && preco <= 97);

  const chamar = async (fn, msgs) => {
    setLoading(true);
    setErro("");
    try {
      return await fn();
    } catch (err) {
      setErro(err.message || "Falha na geração.");
      if (msgs) toast(err.message || "Falha na geração.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const gerarOfertas = () =>
    chamar(
      async () => {
        const result = await api.builderOfertas({ nicho, avatar });
        setOfertas(result.ofertas);
        setOfertaSel(null);
        setEstrutura(null);
        setAnuncios([]);
        toast(`${result.ofertas.length} ofertas geradas por ${result.provider}!`);
      },
      true
    );

  const gerarEstrutura = () =>
    chamar(
      async () => {
        const result = await api.builderEstrutura({ oferta: ofertaSel });
        setEstrutura(result.estrutura);
        if (ofertaSel?.preco_sugerido) setPreco(Math.round(ofertaSel.preco_sugerido));
        toast("Estrutura + quiz + 3 order bumps gerados!");
      },
      true
    );

  const gerarAnuncios = () =>
    chamar(
      async () => {
        const result = await api.builderAnuncios({
          produto: ofertaSel?.nome || "Produto",
          promessa: ofertaSel?.promessa || "",
          nicho,
          link: "",
        });
        setAnuncios(result.anuncios);
        toast(`${result.anuncios.length} anúncios gerados!`);
      },
      true
    );

  const exportarPdf = () =>
    chamar(
      async () => {
        const result = await api.builderPdf({
          oferta: ofertaSel,
          estrutura,
          preco,
          parceiro,
          modo: "rapido",
        });
        setRecord(result);
        setPreviewMd(result.markdown);
        if (result.erro_pdf) toast(result.erro_pdf);
        else toast("PDF gerado!");
      },
      true
    );

  const salvar = () =>
    chamar(
      async () => {
        let id = record?.id;
        if (!id) {
          const result = await api.builderPdf({ oferta: ofertaSel, estrutura, preco, parceiro, modo: "rapido" });
          id = result.id;
        }
        const saved = await api.builderSalvar(id, anuncios);
        setRecord(saved);
        toast("Produto salvo! AdsPages e AdsCreator já podem consumir.");
      },
      true
    );

  const anunciosFiltrados =
    abaAnuncio === "todos" ? anuncios : anuncios.filter((item) => item.categoria === abaAnuncio);

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast("Copiado!");
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  const erroLLM = erro && /Chaves de API|provedor/i.test(erro);

  return (
    <section>
      <h1>🧠 Product Builder — Wizard de Ofertas</h1>
      <p className="subtitle">Crie a oferta completa em 3 passos: 5 ofertas validadas → estrutura + quiz + 3 order bumps → PDF e 12 anúncios.</p>

      <div className="form-card">
        <div className="flex-between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <strong>{PASSOS.map((p) => `${p.emoji} ${p.numero}. ${p.nome}`).join("   →   ")}</strong>
          <span style={{ fontSize: "13px", color: "var(--primary)", fontWeight: 700 }}>Passo {passo} de 3</span>
        </div>
        <div className="funnel-step-bar" style={{ height: "12px" }}>
          <div style={{ width: `${(passo / 3) * 100}%`, background: "var(--primary)", height: "100%", borderRadius: "4px" }} />
        </div>
      </div>

      {erro && (
        <div className="login-error" style={{ marginBottom: "16px" }}>
          {erro}
          {erroLLM && (
            <> — configure em <a href="/api-keys" onClick={(e) => { e.preventDefault(); navigate("/api-keys"); }}>Chaves de API</a>.</>
          )}
        </div>
      )}

      {/* ---------- PASSO 1 ---------- */}
      {passo === 1 && (
        <div className="form-card">
          <div className="form-row">
            <div className="form-group">
              <label>Nicho</label>
              <input value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="Ex.: emagrecimento, finanças, pets..." />
            </div>
            <div className="form-group">
              <label>Avatar (opcional)</label>
              <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="Ex.: mulheres 30-50 que trabalham fora" />
            </div>
          </div>
          <button className="btn-primary" onClick={gerarOfertas} disabled={loading || !nicho.trim()} style={{ width: "100%" }}>
            {loading ? "✨ Minerando ofertas…" : "⛏️ Gerar 5 ofertas validadas"}
          </button>

          {ofertas.length > 0 && (
            <div className="visitor-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: "18px" }}>
              {ofertas.map((oferta, index) => (
                <div
                  className="visitor-card"
                  key={index}
                  style={ofertaSel === oferta ? { border: "2px solid var(--primary)" } : {}}
                  onClick={() => setOfertaSel(oferta)}
                >
                  <div className="visitor-card-header">
                    <div className="visitor-ip">{ofertaSel === oferta ? "✅" : `#${index + 1}`} {oferta.nome}</div>
                    <span className="visitor-badge">R$ {oferta.preco_sugerido}</span>
                  </div>
                  <p style={{ fontSize: "13px", fontWeight: 600, margin: "4px 0" }}>{oferta.promessa}</p>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    <div>Entregáveis: {(oferta.entregaveis || []).slice(0, 2).join(" · ")}</div>
                    <div>Formato: {oferta.formato}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ofertaSel && (
            <>
              <div className="form-group" style={{ marginTop: "16px" }}>
                <label>Parceiro 50/50 (nome/contato — opcional)</label>
                <input value={parceiro} onChange={(e) => setParceiro(e.target.value)} placeholder="Ex.: João Silva — joao@email.com" />
              </div>
              <button className="btn-primary" onClick={() => setPasso(2)} style={{ width: "100%" }}>
                Avançar para Estrutura →
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------- PASSO 2 ---------- */}
      {passo === 2 && (
        <div className="form-card">
          {!estrutura ? (
            <>
              <p style={{ fontSize: "14px", marginBottom: "12px" }}>
                Oferta selecionada: <strong>{ofertaSel?.nome}</strong> — "{ofertaSel?.promessa}"
              </p>
              <button className="btn-primary" onClick={gerarEstrutura} disabled={loading || !ofertaSel} style={{ width: "100%" }}>
                {loading ? "✨ Gerando estrutura…" : "🧱 Gerar estrutura + Quiz + 3 Order Bumps"}
              </button>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: "15px", marginBottom: "10px" }}>Módulos</h3>
              {(estrutura.modulos || []).map((modulo, index) => (
                <div key={index} style={{ marginBottom: "10px" }}>
                  <strong style={{ fontSize: "14px" }}>{modulo.titulo}</strong>
                  <ul className="placeholder-list">
                    {(modulo.aulas || []).map((aula, i) => (
                      <li key={i}>{aula}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {estrutura.ebooks?.length > 0 && (
                <>
                  <h3 style={{ fontSize: "15px", margin: "14px 0 8px" }}>E-books</h3>
                  <ul className="placeholder-list">{estrutura.ebooks.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </>
              )}
              {estrutura.ferramentas?.length > 0 && (
                <>
                  <h3 style={{ fontSize: "15px", margin: "14px 0 8px" }}>Ferramentas / Planilhas</h3>
                  <ul className="placeholder-list">{estrutura.ferramentas.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </>
              )}
              {estrutura.quiz?.perguntas?.length > 0 && (
                <>
                  <h3 style={{ fontSize: "15px", margin: "14px 0 8px" }}>🧩 Quiz ({estrutura.quiz.perguntas.length} perguntas)</h3>
                  <ol className="placeholder-list">
                    {estrutura.quiz.perguntas.map((pergunta, i) => (
                      <li key={i}>{pergunta.pergunta}</li>
                    ))}
                  </ol>
                </>
              )}
              <h3 style={{ fontSize: "15px", margin: "16px 0 8px" }}>3 Order Bumps</h3>
              <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {(estrutura.order_bumps || []).map((bump, index) => (
                  <div className="metric-card" key={index}>
                    <h3>{bump.tipo}</h3>
                    <div style={{ fontSize: "13px", fontWeight: 600, margin: "6px 0" }}>{bump.nome}</div>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>{bump.descricao}</p>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--primary)", marginTop: "6px" }}>
                      {bump.preco ? `+R$ ${bump.preco}` : bump.comissao || ""}
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-group" style={{ marginTop: "16px", maxWidth: "280px" }}>
                <label>Preço do produto (R$27 a R$97)</label>
                <input
                  type="number"
                  min="27"
                  max="97"
                  value={preco}
                  onChange={(e) => setPreco(Number(e.target.value))}
                />
                {preco < 27 || preco > 97 ? (
                  <p className="placeholder-note" style={{ color: "var(--warning)" }}>Mantenha o preço entre R$27 e R$97 (faixa low-ticket validada).</p>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="btn-outline" onClick={() => setPasso(1)}>← Voltar</button>
                <button className="btn-primary" onClick={() => setPasso(3)} disabled={!completa} style={{ flex: 1 }}>
                  Avançar para Design e Tráfego →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- PASSO 3 ---------- */}
      {passo === 3 && completa && (
        <>
          <div className="form-card">
            <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>🎨 Design e PDF</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={exportarPdf} disabled={loading}>
                {loading ? "✨ Gerando PDF…" : "📄 Exportar PDF do produto"}
              </button>
              {record?.pdf_path && (
                <a className="btn-outline" style={{ textDecoration: "none" }} href={`/api/infoprodutos/${record.id}/download`}>
                  ⬇️ Baixar PDF
                </a>
              )}
              {previewMd && (
                <button className="btn-outline" onClick={() => copiar(previewMd)}>📋 Copiar Markdown</button>
              )}
            </div>
            {record?.imagem_prompts?.length > 0 && (
              <>
                <h4 style={{ fontSize: "14px", margin: "16px 0 8px" }}>🖼️ Prompts de imagem (Gamma / Canva)</h4>
                <ul className="placeholder-list">
                  {record.imagem_prompts.map((prompt, index) => (
                    <li key={index}>
                      {prompt} <span style={{ cursor: "pointer" }} onClick={() => copiar(prompt)} title="Copiar">📋</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {record?.erro_pdf && <p className="placeholder-note" style={{ color: "var(--danger)" }}>{record.erro_pdf}</p>}
          </div>

          <div className="form-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "15px" }}>📣 12 Anúncios prontos</h3>
              <button className="btn-primary" onClick={gerarAnuncios} disabled={loading}>
                {loading ? "✨ Gerando…" : anuncios.length ? "🔄 Regerar" : "✨ Gerar 12 anúncios"}
              </button>
            </div>
            {anuncios.length > 0 && (
              <>
                <div className="tabs">
                  {["todos", "prova", "desafio", "comparacao"].map((aba) => (
                    <div key={aba} className={`tab ${abaAnuncio === aba ? "active" : ""}`} onClick={() => setAbaAnuncio(aba)}>
                      {aba === "todos" ? `Todos (${anuncios.length})` : `${aba[0].toUpperCase()}${aba.slice(1)} (${anuncios.filter((a) => a.categoria === aba).length})`}
                    </div>
                  ))}
                </div>
                <div className="visitor-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  {anunciosFiltrados.map((anuncio, index) => (
                    <div className="visitor-card" key={index} style={{ cursor: "default" }}>
                      <div className="visitor-card-header">
                        <div className="visitor-ip" style={{ fontSize: "12px" }}>
                          {anuncio.categoria} / {anuncio.subtipo || "—"}
                        </div>
                        <span className="visitor-card-link" onClick={() => copiar(`${anuncio.texto}\n${anuncio.cta}`)}>📋 Copiar</span>
                      </div>
                      <p style={{ fontSize: "13px" }}>{anuncio.texto}</p>
                      <p style={{ fontSize: "12px", color: "var(--primary)", fontWeight: 600 }}>CTA: {anuncio.cta}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="form-card" style={{ border: "1px solid var(--primary)" }}>
            <h3 style={{ fontSize: "15px", marginBottom: "10px" }}>💾 Salvar produto completo</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
              Salva a oferta, estrutura, order bumps, preço, parceiro e os 12 anúncios em <code>infoprodutos</code> —
              as abas <strong>AdsPages</strong> e <strong>AdsCreator</strong> passam a consumir esses dados.
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={salvar} disabled={loading || !completa}>
                💾 Salvar produto
              </button>
              {record && (
                <>
                  <button className="btn-outline" onClick={() => navigate("/adspages")}>🛡️ Criar página (AdsPages)</button>
                  <button className="btn-outline" onClick={() => navigate("/adscreator")}>🎯 Criar campanha (AdsCreator)</button>
                </>
              )}
            </div>
            {record?.oferta && (
              <p className="placeholder-note" style={{ marginTop: "10px", color: "var(--success)" }}>
                ✅ "{record.oferta.nome}" salvo (infoproduto #{record.id}).
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
