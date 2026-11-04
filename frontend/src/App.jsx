import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ToastProvider from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Produtos from "./pages/Produtos";
import Dashboard from "./pages/Dashboard";
import ApiKeys from "./pages/ApiKeys";
import Studio from "./pages/Studio";
import Biblioteca from "./pages/Biblioteca";
import AdsPages from "./pages/AdsPages";
import PaginasCriadas from "./pages/PaginasCriadas";
import Dominios from "./pages/Dominios";
import Visitas from "./pages/Visitas";
import Vendas from "./pages/Vendas";
import Gclid from "./pages/Gclid";
import AdsWords from "./pages/AdsWords";
import AdsCreator from "./pages/AdsCreator";
import AdsBot from "./pages/AdsBot";
import Notificacoes from "./pages/Notificacoes";
import Pinterest from "./pages/Pinterest";
import Logs from "./pages/Logs";
import Faq from "./pages/Faq";
import ContasGoogle from "./pages/ContasGoogle";
import Builder from "./pages/Builder";
import AntiFraude from "./pages/AntiFraude";
import Plano from "./pages/Plano";
import EmailMkt from "./pages/EmailMkt";
import * as Pages from "./pages/placeholders";

const AppCtx = createContext(null);
export { AppCtx };
export const useApp = () => useContext(AppCtx);

// Envolve cada página: uma tela que quebrar mostra o ErrorBoundary dela,
// sem apagar o resto da aplicação (fim da "tela preta" global).
function Pagina({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("prodmaker_theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("prodmaker_theme", theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  return { theme, toggleTheme };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState("");
  const [role, setRole] = useState("user");
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const refreshSession = useCallback(async () => {
    try {
      const s = await api.session();
      setSession(s);
      if (s?.role) setRole(s.role);
    } catch {
      setSession({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    api.version().then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  const login = useCallback(
    async (email, code) => {
      const result = await api.login(email, code);
      await refreshSession();
      return result;
    },
    [refreshSession]
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    await refreshSession();
  }, [refreshSession]);

  const onLogin = location.pathname === "/login";
  const authenticated = session?.authenticated;

  if (onLogin) {
    return (
      <AppCtx.Provider value={{ session, loading, version, login, logout, theme, toggleTheme, role }}>
        <Login />
      </AppCtx.Provider>
    );
  }

  if (loading) return <div className="loading-screen">Carregando…</div>;

  if (!authenticated) return <Navigate to="/login" replace />;

  // Guard de rotas admin (RBAC): usuário comum é redirecionado ao Painel
  const rotasAdmin = ["/api-keys", "/configuracoes/plano"];
  if (rotasAdmin.includes(location.pathname) && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <AppCtx.Provider value={{ session, loading, version, login, logout, theme, toggleTheme, role }}>
      <ToastProvider>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <TopBar />
            <div className="content-wrapper">
              <Routes>
                <Route path="/" element={<Pagina><Produtos /></Pagina>} />
                <Route path="/dashboard" element={<Pagina><Dashboard /></Pagina>} />
                <Route path="/hosting/dominios" element={<Pagina><Dominios /></Pagina>} />
                <Route path="/hosting/paginas" element={<Pagina><PaginasCriadas /></Pagina>} />
                <Route path="/studio" element={<Pagina><Builder /></Pagina>} />
                <Route path="/studio/biblioteca" element={<Pagina><Biblioteca /></Pagina>} />
                <Route path="/adspages" element={<Pagina><AdsPages /></Pagina>} />
                <Route path="/adswords" element={<Pagina><AdsWords /></Pagina>} />
                <Route path="/adscreator" element={<Pagina><AdsCreator /></Pagina>} />
                <Route path="/tracking/visitas" element={<Pagina><Visitas /></Pagina>} />
                <Route path="/tracking/vendas" element={<Pagina><Vendas /></Pagina>} />
                <Route path="/tracking/gclid" element={<Pagina><Gclid /></Pagina>} />
                <Route path="/tracking/fraude" element={<Pagina><AntiFraude /></Pagina>} />
                <Route path="/configuracoes/plano" element={<Pagina><Plano /></Pagina>} />
                <Route path="/configuracoes/email" element={<Pagina><EmailMkt /></Pagina>} />
                <Route path="/adsbot" element={<Pagina><AdsBot /></Pagina>} />
                <Route path="/pinterest" element={<Pagina><Pinterest /></Pagina>} />
                <Route path="/contas-google" element={<Pagina><ContasGoogle /></Pagina>} />
                <Route path="/api-keys" element={<Pagina><ApiKeys /></Pagina>} />
                <Route path="/notificacoes" element={<Pagina><Notificacoes /></Pagina>} />
                <Route path="/logs" element={<Pagina><Logs /></Pagina>} />
                <Route path="/faq" element={<Pagina><Faq /></Pagina>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </ToastProvider>
    </AppCtx.Provider>
  );
}
