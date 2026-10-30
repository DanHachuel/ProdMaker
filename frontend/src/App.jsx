import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ToastProvider from "./components/Toast";
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
import * as Pages from "./pages/placeholders";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

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
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const refreshSession = useCallback(async () => {
    try {
      setSession(await api.session());
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
      <AppCtx.Provider value={{ session, loading, version, login, logout, theme, toggleTheme }}>
        <Login />
      </AppCtx.Provider>
    );
  }

  if (loading) return <div className="loading-screen">Carregando…</div>;

  if (!authenticated) return <Navigate to="/login" replace />;

  return (
    <AppCtx.Provider value={{ session, loading, version, login, logout, theme, toggleTheme }}>
      <ToastProvider>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <TopBar />
            <div className="content-wrapper">
              <Routes>
                <Route path="/" element={<Produtos />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/hosting/dominios" element={<Dominios />} />
                <Route path="/hosting/paginas" element={<PaginasCriadas />} />
                <Route path="/studio" element={<Studio />} />
                <Route path="/studio/biblioteca" element={<Biblioteca />} />
                <Route path="/adspages" element={<AdsPages />} />
                <Route path="/adswords" element={<Pages.AdsWords />} />
                <Route path="/adscreator" element={<Pages.AdsCreator />} />
                <Route path="/tracking/visitas" element={<Visitas />} />
                <Route path="/tracking/vendas" element={<Vendas />} />
                <Route path="/tracking/gclid" element={<Gclid />} />
                <Route path="/adsbot" element={<Pages.AdsBot />} />
                <Route path="/pinterest" element={<Pages.Pinterest />} />
                <Route path="/contas-google" element={<Pages.ContasGoogle />} />
                <Route path="/api-keys" element={<ApiKeys />} />
                <Route path="/notificacoes" element={<Pages.Notificacoes />} />
                <Route path="/logs" element={<Pages.Logs />} />
                <Route path="/faq" element={<Pages.Faq />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </ToastProvider>
    </AppCtx.Provider>
  );
}
