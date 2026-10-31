import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

const PASSOS = [
  { numero: 1, nome: "Mineração e Parceria", emoji: "📦" },
  { numero: 2, nome: "Estrutura e Precificação", emoji: "🧱" },
  { numero: 3, nome: "Exportação e Landing Page", emoji: "📄" },
  { numero: 4, nome: "Tráfego e Publicação", emoji: "📣" },
];

const FORMATOS = ["E-book", "Planilha", "Mini-curso", "Desafio", "Workshop"];

export default function Builder() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [passo, setPasso] = useState(1);

  // Passo 1
  const [nicho, setNicho] = useState("");
  const [avatar, setAvatar] = useState("");
  const [ofertas, setOfertas] = useState([]);
  const [ofertaSel, setOfertaSel] = useState(null);
  const [parceiro, setParceiro] = useState("");

  // Passo 2
  const [formato, setFormato] = useState("E-book");
  const [estrutura, setEstrutura] = useState(null);
  const [assets, setAssets] = useState(null);
  const [preco, setPreco] = useState(47);

  // Passo 3
  const [produtoMd, setProdutoMd] = useState("");
  const [record, setRecord] = useState(null);
  const [landing, setLanding] = useState(null);
  const [mdAberto, setMdAberto] = useState(false);

  // Passo 4
  const [anuncios, setAnuncios] = useState([]);
  const [pins, setPins] = useState([]);
  const [aba, setAba] = useState("anuncios");
  const [abaAnuncio, setAbaAnuncio] = useState("todos");
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [salvo, setSalvo] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const completa = ofertaSel && estrutura && assets && preco >= 27 && preco <= 97;

  const chamar = async (fn, msg) => {
    setLoading(true);
    setErro("");
    try {
      const result = await fn();
      if (msg) toast(msg);
      return result;
    } catch (err) {
      setErro(err.message || "Falha na geração.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Passo 1 ----------------
  const gerarOfertas = () =>
    chamar(async () => {
      const result = await api.builderOfertas({ nicho, avatar });
      setOfertas(result.ofertas);
      setOfertaSel(null);
      setEstrutura(null);
      setAssets(null);
      setAnuncios([]);
      setPins([]);
      setSalvo(null);
      return `${result.ofertas.length} ofertas por ${result.provider}!`;
    });

  // ---------------- Passo 2 ----------------
  const gerarEstrutura = () =>
    chamar(async () => {
      const result = await api.builderEstrutura({ oferta: ofertaSel });
      setEstrutura(result.estrutura);
      if (ofertaSel?.preco_sugerido) setPreco(Math.round(ofertaSel.preco_sugerido));
      return "Estrutura gerada!";
    });

  const gerarAssets = () =>
    chamar(async () => {
      const result = await api.builderAssets({ oferta: ofertaSel, preco });
      setAssets(result);
      return "3 Order Bumps + Quiz gerados!";
    });

  // ---------------- Passo 3 ----------------
  const gerarProduto = () =>
    chamar(async () => {
      const result = await api.builderProduto({ oferta: ofertaSel, estrutura, formato });
      setProdutoMd(result.markdown);
      setMdAberto(true);
      return `Conteúdo completo gerado por ${result.provider}! (${result.markdown.length} caracteres)`;
    });

  const gerarPdf = () =>
    chamar(async () => {
      const result = await api.builderPdf({ oferta: ofertaSel, estrutura, preco, parceiro, modo: "rapido", produto_md: produtoMd });
      setRecord(result);
      if (result.erro_pdf) toast(result.erro_pdf);
      return result.erro_pdf ? "Markdown salvo (PDF com aviso)." : "PDF gerado!";
    });

  const gerarLanding = () =>
    chamar(async () => {
      const result = await api.builderLanding({ oferta: { ...ofertaSel, checkout_link: ofertaSel?.checkout_link || "" }, estrutura, produto_md: produtoMd });
      setLanding(result);
      return "Landing page (12 seções) gerada!";
    });

  // ---------------- Passo 4 ----------------
  const gerarAnuncios = () =>
    chamar(async () => {
      const result = await api.builderAnuncios({ produto: ofertaSel?.nome || "Produto", promessa: ofertaSel?.promessa || "", nicho, link: "" });
      setAnuncios(result.anuncios);
      setPins(result.pins);
      return `${result.anuncios.length} anúncios e ${result.pins.length} pins gerados!`;
    });

  const publicar = () =>
    chamar(async () => {
      if (!landing) throw new Error("Gere a landing page no Passo 3 antes de publicar.");
      setPublicando(true);
      try {
        const result = await api.publicarPagina(landing.id);
        setLanding(result);
        return "Página publicada no GitHub (deploy automático no Cloudflare Pages)!";
      } finally {
        setPublicando(false);
      }
    });

  const salvar = () =>
    chamar(async () => {
      setSalvando(true);
      try {
        let id = record?.id;
        if (!id) {
          const r = await api.builderPdf({ oferta: ofertaSel, estrutura, preco, parceiro, modo: "rapido", produto_md: produtoMd });
          id = r.id;
          setRecord(r);
        }
        const saved = await api.builderSalvar(id, anuncios, pins);
        setSalvo(saved);
        return `Produto salvo! (infoproduto #${saved.id} · produto #${saved.produto?.produto_id})`;
      } finally {
        setSalvando(false);
      }
    });

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast("Copiado!");
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  const anunciosFiltrados = abaAnuncio === "todos" ? anuncios : anuncios.filter((a) => a.categoria === abaAnuncio);
  const erroLLM = erro && /Chaves de API|provedor/i.test(erro);

  return (
    <section>
      <h1>🧠 Product Builder — Wizard de Ofertas</h1>
      <p className="subtitle">Crie a oferta completa em 4 passos: 5 ofertas → estrutura + quiz + 3 order bumps → produto (PDF) + landing page → 12 anúncios, 10 pins e publicação.</p>

      <div className="form-card">
        <div className="flex-between" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <strong>{PASSOS.map((p) => `${p.emoji} ${p.numero}. ${p.nome}`).join("  →  ")}</strong>
          <span style={{ fontSize: "13px", color: "var(--primary)", fontWeight: 700 }}>Passo {passo} de 4</span>
        </div>
        <div className="funnel-step-bar" style={{ height: "12px" }}>
          <div style={{ width: `${(passo / 4) * 100}%`, background: "var(--primary)", height: "100%", borderRadius: "4px" }} />
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

      {/* ================= PASSO 1 ================= */}
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

      {/* ================= PASSO 2 ================= */}
      {passo === 2 && (
        <div className="form-card">
          <p style={{ fontSize: "14px", marginBottom: "12px" }}>
            Oferta: <strong>{ofertaSel?.nome}</strong> — "{ofertaSel?.promessa}"
          </p>
          <div className="form-row">
            <div className="form-group">
              <label>Formato do produto</label>
              <select value={formato} onChange={(e) => setFormato(e.target.value)}>
                {FORMATOS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: "260px" }}>
              <label>Preço (R$27 a R$97)</label>
              <input type="number" min="27" max="97" value={preco} onChange={(e) => setPreco(Number(e.target.value))} />
              {preco < 27 || preco > 97 ? (
                <p className="placeholder-note" style={{ color: "var(--warning)" }}>Mantenha entre R$27 e R$97.</p>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={gerarEstrutura} disabled={loading || !ofertaSel}>
              {loading ? "✨ …" : "🧱 Gerar estrutura (módulos)"}
            </button>
            <button className="btn-outline" onClick={gerarAssets} disabled={loading || !ofertaSel}>
              {loading ? "✨ …" : "💎 Gerar 3 Order Bumps + Quiz"}
            </button>
          </div>

          {estrutura && (
            <>
              <h3 style={{ fontSize: "15px", margin: "16px 0 8px" }}>Módulos</h3>
              {estrutura.modulos.map((modulo, index) => (
                <div key={index} style={{ marginBottom: "10px" }}>
                  <strong style={{ fontSize: "14px" }}>{modulo.titulo}</strong>
                  <ul className="placeholder-list">
                    {(modulo.aulas || []).map((aula, i) => <li key={i}>{aula}</li>)}
                  </ul>
                </div>
              ))}
              {(estrutura.ebooks?.length > 0 || estrutura.ferramentas?.length > 0) && (
                <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  {estrutura.ebooks?.length ? `E-books: ${estrutura.ebooks.join(" · ")}. ` : ""}
                  {estrutura.ferramentas?.length ? `Ferramentas: ${estrutura.ferramentas.join(" · ")}.` : ""}
                </p>
              )}
            </>
          )}

          {assets && (
            <>
              <h3 style={{ fontSize: "15px", margin: "18px 0 8px" }}>💎 3 Order Bumps</h3>
              <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {assets.order_bumps.map((bump, index) => (
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
              {assets.quiz?.perguntas?.length > 0 && (
                <>
                  <h3 style={{ fontSize: "15px", margin: "16px 0 8px" }}>🧩 Quiz ({assets.quiz.perguntas.length} perguntas)</h3>
                  <ol className="placeholder-list">
                    {assets.quiz.perguntas.map((p, i) => <li key={i}>{p.pergunta}</li>)}
                  </ol>
                </>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button className="btn-outline" onClick={() => setPasso(1)}>← Voltar</button>
            <button className="btn-primary" onClick={() => setPasso(3)} disabled={!completa} style={{ flex: 1 }}>
              Avançar para Exportação →
            </button>
          </div>
        </div>
      )}

      {/* ================= PASSO 3 ================= */}
      {passo === 3 && completa && (
        <>
          <div className="form-card">
            <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>📄 Produto e PDF</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={gerarProduto} disabled={loading}>
                {loading ? "✨ Gerando…" : "📝 Gerar conteúdo completo"}
              </button>
              <button className="btn-outline" onClick={gerarPdf} disabled={loading || !produtoMd}>
                📄 Gerar PDF
              </button>
            </div>
            {produtoMd && (
              <>
                <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
                  <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => setMdAberto(true)}>
                    👁️ Ver conteúdo ({produtoMd.length} caracteres)
                  </button>
                  <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => copiar(produtoMd)}>
                    📋 Copiar Markdown
                  </button>
                  {record?.pdf_path && (
                    <a className="btn-outline" style={{ textDecoration: "none", fontSize: "12px", padding: "6px 12px" }} href={`/api/infoprodutos/${record.id}/download`}>
                      ⬇️ Baixar PDF
                    </a>
                  )}
                </div>
                {record?.erro_pdf && <p className="placeholder-note" style={{ color: "var(--danger)" }}>{record.erro_pdf}</p>}
              </>
            )}
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
          </div>

          <div className="form-card">
            <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>🛡️ Landing Page (12 seções)</h3>
            <button className="btn-primary" onClick={gerarLanding} disabled={loading}>
              {loading ? "✨ Gerando…" : "🛡️ Gerar Landing Page de vendas"}
            </button>
            {landing && (
              <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <a className="btn-outline" style={{ textDecoration: "none" }} href={landing.preview_url} target="_blank" rel="noreferrer">
                  👁️ Pré-visualizar
                </a>
                <a className="btn-outline" style={{ textDecoration: "none" }} href={`/api/paginas/${landing.id}/download`}>
                  ⬇️ Download HTML
                </a>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", alignSelf: "center" }}>
                  {landing.plataforma || "vendas"} · gerada por {landing.provider}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn-outline" onClick={() => setPasso(2)}>← Voltar</button>
            <button className="btn-primary" onClick={() => setPasso(4)} style={{ flex: 1 }}>
              Avançar para Tráfego →
            </button>
          </div>
        </>
      )}

      {/* ================= PASSO 4 ================= */}
      {passo === 4 && completa && (
        <>
          <div className="form-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "15px" }}>📣 Tráfego pronto</h3>
              <button className="btn-primary" onClick={gerarAnuncios} disabled={loading}>
                {loading ? "✨ Gerando…" : anuncios.length ? "🔄 Regerar" : "✨ Gerar 12 anúncios + 10 pins"}
              </button>
            </div>
            <div className="tabs">
              <div className={`tab ${aba === "anuncios" ? "active" : ""}`} onClick={() => setAba("anuncios")}>Anúncios ({anuncios.length})</div>
              <div className={`tab ${aba === "pins" ? "active" : ""}`} onClick={() => setAba("pins")}>Pins ({pins.length})</div>
            </div>

            {aba === "anuncios" && anuncios.length > 0 && (
              <>
                <div className="tabs" style={{ marginTop: "8px" }}>
                  {["todos", "prova", "desafio", "comparacao"].map((cat) => (
                    <div key={cat} className={`tab ${abaAnuncio === cat ? "active" : ""}`} onClick={() => setAbaAnuncio(cat)}>
                      {cat === "todos" ? `Todos (${anuncios.length})` : `${cat[0].toUpperCase()}${cat.slice(1)} (${anuncios.filter((a) => a.categoria === cat).length})`}
                    </div>
                  ))}
                </div>
                <div className="visitor-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  {anunciosFiltrados.map((anuncio, index) => (
                    <div className="visitor-card" key={index} style={{ cursor: "default" }}>
                      <div className="visitor-card-header">
                        <div className="visitor-ip" style={{ fontSize: "12px" }}>{anuncio.categoria} / {anuncio.subtipo || "—"}</div>
                        <span className="visitor-card-link" onClick={() => copiar(`${anuncio.texto}\n${anuncio.cta}`)}>📋 Copiar</span>
                      </div>
                      <p style={{ fontSize: "13px" }}>{anuncio.texto}</p>
                      <p style={{ fontSize: "12px", color: "var(--primary)", fontWeight: 600 }}>CTA: {anuncio.cta}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {aba === "pins" && (
              pins.length > 0 ? (
                <table style={{ marginTop: "8px" }}>
                  <thead>
                    <tr><th>Título</th><th>Texto na imagem</th><th></th></tr>
                  </thead>
                  <tbody>
                    {pins.map((pin, index) => (
                      <tr key={index}>
                        <td>{pin.titulo_pin}<div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{pin.descricao}</div></td>
                        <td>{pin.texto_na_imagem}</td>
                        <td className="action-icons"><span title="Copiar" onClick={() => copiar(`${pin.titulo_pin}\n${pin.descricao}\n${pin.texto_na_imagem}`)}>📋</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="placeholder-note">Gere os anúncios para receber também as 10 ideias de pins.</p>
              )
            )}
          </div>

          <div className="form-card" style={{ border: "1px solid var(--primary)" }}>
            <h3 style={{ fontSize: "15px", marginBottom: "10px" }}>🚀 Publicação e salvamento</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={publicar} disabled={loading || !landing}>
                {publicando ? "Publicando…" : "🚀 Publicar no GitHub + Cloudflare"}
              </button>
              <button className="btn-outline" onClick={salvar} disabled={loading || !completa}>
                {salvando ? "Salvando…" : "💾 Salvar produto completo"}
              </button>
            </div>
            {!landing && <p className="placeholder-note" style={{ marginTop: "8px" }}>Gere a landing page no Passo 3 para publicar.</p>}
            {landing?.published_url && (
              <p style={{ fontSize: "13px", marginTop: "10px" }}>
                ✅ Publicada: <a href={landing.published_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{landing.published_url}</a>
              </p>
            )}
            {salvo && (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "13px", color: "var(--success)", fontWeight: 600 }}>
                  💾 "{salvo.oferta?.nome || salvo.titulo}" salvo (infoproduto #{salvo.id} · produto #{salvo.produto?.produto_id} — já disponível no AdsPages/AdsCreator).
                </p>
                <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                  <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => navigate("/studio/biblioteca")}>📚 Biblioteca</button>
                  <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => navigate("/adspages")}>🛡️ AdsPages</button>
                  <button className="btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => navigate("/adscreator")}>🎯 AdsCreator</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn-outline" onClick={() => setPasso(3)}>← Voltar</button>
          </div>
        </>
      )}

      <Modal open={mdAberto} title="Conteúdo do produto (Markdown)" onClose={() => setMdAberto(false)}>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px", lineHeight: 1.6, color: "var(--text-main)", maxHeight: "60vh", overflow: "auto" }}>
          {produtoMd}
        </pre>
      </Modal>
    </section>
  );
}
