import React from "react";

/**
 * ErrorBoundary — rede de segurança contra a "tela preta".
 *
 * Um erro de render em qualquer componente (import faltando, dado inesperado,
 * bug de JSX) derruba a árvore inteira do React e deixa a página vazia. Com
 * este boundary, a falha fica contida: a área afetada mostra uma mensagem
 * amigável com o erro, botão de recarregar e caminho de voltar — e o erro
 * completo vai para o console do navegador (F12).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    // Registro para diagnóstico (F12 → Console); nunca quebra a UI.
    try {
      console.error("[ProdMaker] Erro de render capturado:", erro, info);
    } catch {}
  }

  render() {
    if (this.state.erro) {
      const mensagem =
        (this.state.erro && this.state.erro.message) || String(this.state.erro || "erro desconhecido");
      return (
        <section className="error-boundary" role="alert">
          <h1>Algo deu errado nesta tela</h1>
          <p className="subtitle">
            O componente não pôde ser carregado. O erro foi registrado no console do navegador (F12) — a
            falha nesta tela não afeta o restante do sistema.
          </p>
          <div className="login-error" style={{ maxWidth: "640px", marginBottom: "14px", fontWeight: 600 }}>
            ⚠️ {mensagem}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => this.setState({ erro: null })}>
              Tentar novamente
            </button>
            <button className="btn-outline" onClick={() => window.location.reload()}>
              Recarregar a página
            </button>
            <button className="btn-outline" onClick={() => { window.location.href = "/"; }}>
              Voltar ao Painel
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
