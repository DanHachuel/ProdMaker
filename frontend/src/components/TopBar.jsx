import React from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App";

export default function TopBar() {
  const { session, theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  const email = session?.email || "";
  const name = email.split("@")[0] || "usuário";

  return (
    <header className="top-bar">
      <div className="promo-banner" onClick={() => navigate("/adsbot")} title="Abrir o AdsBot">
        🚀 Novo Lançamento — conduza seu lançamento passo a passo no AdsBot →
      </div>
      <div className="user-profile">
        Olá, {name}
        <span className="avatar">{name.charAt(0)}</span>
        <button className="theme-toggle" onClick={toggleTheme} title="Alternar Tema">
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>
    </header>
  );
}
