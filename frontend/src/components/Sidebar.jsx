import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../App";

const MENU = [
  { to: "/", emoji: "📦", label: "Seus Produtos" },
  { to: "/dashboard", emoji: "📊", label: "AdsDashboard" },
  {
    emoji: "🌐", label: "AdsHosting", children: [
      { to: "/hosting/dominios", label: "Domínios" },
      { to: "/hosting/paginas", label: "Páginas Criadas" },
    ],
  },
  {
    emoji: "📖", label: "Infoprodutos", children: [
      { to: "/studio", label: "Criar Infoproduto" },
      { to: "/studio/biblioteca", label: "Biblioteca" },
    ],
  },
  { to: "/adspages", emoji: "🛡️", label: "AdsPages" },
  { to: "/adswords", emoji: "✈️", label: "AdsWords" },
  { to: "/adscreator", emoji: "🎯", label: "AdsCreator" },
  {
    emoji: "🔄", label: "AdsTracking", children: [
      { to: "/tracking/visitas", label: "Minhas Visitas" },
      { to: "/tracking/vendas", label: "Minhas Vendas" },
      { to: "/tracking/gclid", label: "Conversões GCLID" },
    ],
  },
  { to: "/adsbot", emoji: "🤖", label: "AdsBot" },
  { to: "/pinterest", emoji: "📌", label: "Pinterest" },
  "divider",
  { to: "/contas-google", emoji: "🔑", label: "Contas do Google" },
  { to: "/api-keys", emoji: "🔌", label: "Chaves de API" },
  { to: "/notificacoes", emoji: "🔔", label: "Notificações" },
  { to: "/logs", emoji: "📋", label: "Logs" },
  { to: "/faq", emoji: "❓", label: "FAQ & Documentação" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { version, logout } = useApp();
  const [expanded, setExpanded] = useState(() => {
    const initial = new Set();
    for (const item of MENU) {
      if (item.children && item.children.some((c) => c.to === location.pathname)) initial.add(item.label);
    }
    return initial;
  });

  const toggleExpand = (label) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="sidebar">
      <div className="logo-area">
        🚀 ProdMaker {version && <span className="badge">v{version}</span>}
      </div>
      <nav>
        <ul>
          {MENU.map((item, index) => {
            if (item === "divider" || item.divider) return <div key={`d${index}`} className="divider" />;
            if (item.children) {
              const hasActiveChild = item.children.some((c) => c.to === location.pathname);
              const isOpen = expanded.has(item.label) || hasActiveChild;
              return (
                <li key={item.label} className={`has-submenu ${isOpen ? "expanded" : ""}`}>
                  <div onClick={() => toggleExpand(item.label)}>
                    <span style={{ fontSize: "16px" }}>{item.emoji}</span> {item.label}
                    <span className="submenu-arrow">▼</span>
                  </div>
                  <ul>
                    {item.children.map((child) => (
                      <li
                        key={child.to}
                        className={location.pathname === child.to ? "active" : ""}
                        onClick={() => navigate(child.to)}
                      >
                        {child.label}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            }
            return (
              <li
                key={item.to}
                className={`nav-item ${location.pathname === item.to ? "active" : ""}`}
                onClick={() => navigate(item.to)}
              >
                <span style={{ fontSize: "16px" }}>{item.emoji}</span> {item.label}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        <button className="btn-logout" onClick={handleLogout}>
          🚪 Sair
        </button>
      </div>
    </aside>
  );
}
