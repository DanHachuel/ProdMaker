import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App";

const STEPS = [
  { number: "1", icon: "inventory_2", title: "Adicione o produto", last: false },
  { number: "2", icon: "web", title: "Crie a Presell", last: false },
  { number: "3", icon: "campaign", title: "Crie a Campanha", last: false },
  { number: "4", icon: "trending_up", title: "Receba Vendas", last: true },
];

const LANGUAGES = [
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export default function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [language, setLanguage] = useState("pt");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, code);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Não foi possível entrar. Verifique o e-mail e o código de ativação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-left-content">
          <h1 className="login-left-title">
            <span>Tudo o que o afiliado precisa</span> <br />
            <span className="highlight-text">para vender</span> <br />
            <span>em um só lugar</span>
          </h1>
          <p className="login-left-description">Menos configuração, mais vendas!</p>

          <div className="features-grid">
            {STEPS.map((step) => (
              <div className="feature-step-item" key={step.number}>
                <div className={`feature-card feature-step ${step.last ? "feature-step-last" : ""}`}>
                  <span className="feature-step-number" aria-hidden="true">{step.number}</span>
                  <div className="feature-step-icon">
                    <i className="material-symbols-outlined">{step.icon}</i>
                  </div>
                  {!step.last && <div className="feature-step-arrow" />}
                </div>
                <h3 className="feature-title">{step.title}</h3>
              </div>
            ))}
          </div>
        </div>

        <div className="login-blur-effect blur-effect-center" />
        <div className="login-blur-effect blur-effect-1" />
        <div className="login-blur-effect blur-effect-2" />

        <div className="login-particle" style={{ left: "8%", width: "4px", height: "4px", background: "#8b3fbf", opacity: 0.5, animationDuration: "10s", animationDelay: "0s" }} />
        <div className="login-particle" style={{ left: "22%", width: "3px", height: "3px", background: "#8b3fbf", opacity: 0.4, animationDuration: "11s", animationDelay: "1s" }} />
        <div className="login-particle" style={{ left: "38%", width: "5px", height: "5px", background: "#8b3fbf", opacity: 0.4, animationDuration: "11s", animationDelay: "1s" }} />
        <div className="login-particle" style={{ left: "55%", width: "3px", height: "3px", background: "#8b3fbf", opacity: 0.4, animationDuration: "11s", animationDelay: "1s" }} />
        <div className="login-particle" style={{ left: "70%", width: "4px", height: "4px", background: "#ee476f", opacity: 0.35, animationDuration: "14s", animationDelay: "0.5s" }} />
        <div className="login-particle" style={{ left: "82%", width: "3px", height: "3px", background: "#8b3fbf", opacity: 0.45, animationDuration: "12s", animationDelay: "1.8s" }} />
        <div className="login-particle" style={{ left: "93%", width: "4px", height: "4px", background: "#a653d4", opacity: 0.3, animationDuration: "10s", animationDelay: "3.8s" }} />
      </div>

      <div className="login-right">
        <div className="login-language-toggle">
          <div className="language-toggle-wrapper">
            <button className="language-toggle-btn" title="Alterar idioma" type="button">
              <span className="material-symbols-outlined">translate</span>
            </button>
            <div className="language-toggle-dropdown">
              {LANGUAGES.map((lang) => (
                <div
                  key={lang.code}
                  className={`language-toggle-item ${language === lang.code ? "active" : ""}`}
                  onClick={() => setLanguage(lang.code)}
                >
                  {lang.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="login-form">
          <h2>Bem-vindo de volta!</h2>
          <p className="login-subtitle">Insira seu e-mail e código de ativação</p>

          <form onSubmit={submit}>
            {error && <div className="login-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="email">E-mail:</label>
              <div className="email-input-wrapper">
                <span className="material-symbols-outlined email-icon">mail</span>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="activationCode">Código de Ativação</label>
              <div className="password-input-wrapper">
                <span className="material-symbols-outlined lock-icon">lock</span>
                <input
                  id="activationCode"
                  type={showCode ? "text" : "password"}
                  required
                  placeholder="********"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-label={showCode ? "Ocultar código" : "Mostrar código"}
                  onClick={() => setShowCode((s) => !s)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
                    <path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Z" />
                  </svg>
                </button>
              </div>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              <span>{loading ? "Entrando…" : "Entrar"}</span>
            </button>
          </form>

          <div className="support-link">
            <p>
              <span>Esqueceu o código de ativação?</span>
              <a href="/faq">Clique aqui</a>
            </p>
            <p>
              <span>Problemas com a ativação? Use o chat de suporte abaixo</span>
            </p>
          </div>
        </div>

        <div className="login-footer-bottom">
          <div style={{ marginBottom: "10px" }}>
            <a href="/legal/terms.html" target="_blank" rel="noreferrer">Termos de Serviço</a>
            <span style={{ opacity: 0.5 }}>|</span>
            <a href="/legal/privacy.html" target="_blank" rel="noreferrer">Política de Privacidade</a>
          </div>
          <div>© 2026. Todos os direitos reservados.</div>
        </div>
      </div>
    </div>
  );
}
