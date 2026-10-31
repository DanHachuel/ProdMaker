import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

const OPERACOES = ["campanha", "pagina", "infoproduto", "venda", "notificacao", "visita"];
const ESTADOS = ["rascunho", "publicada", "erro", "gerado", "aprovada", "pendente", "enviada", "ok"];

export default function Logs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroOperacao, setFiltroOperacao] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await api.logs());
    } catch (err) {
      toast(err.message || "Falha ao carregar logs.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return logs.filter(
      (item) =>
        (!filtroOperacao || item.operacao === filtroOperacao) &&
        (!filtroEstado || item.estado === filtroEstado) &&
        (!termo || (item.detalhe || "").toLowerCase().includes(termo) || (item.origem || "").toLowerCase().includes(termo))
    );
  }, [logs, filtroOperacao, filtroEstado, busca]);

  const copiar = async (item) => {
    try {
      await navigator.clipboard.writeText(`${item.data} | ${item.operacao} | ${item.estado} | ${item.origem} | ${item.detalhe}`);
      toast("Linha copiada!");
    } catch {
      toast("Não foi possível copiar.");
    }
  };

  return (
    <section>
      <h1>📋 Logs</h1>
      <p className="subtitle">Histórico unificado de operações — campanhas, páginas, vendas, notificações e visitas.</p>

      <div className="form-card" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: "150px" }}>
          <label>Operação</label>
          <select value={filtroOperacao} onChange={(e) => setFiltroOperacao(e.target.value)}>
            <option value="">Todas</option>
            {OPERACOES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: "130px" }}>
          <label>Estado</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: "180px" }}>
          <label>Busca livre</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="produto, IP, erro..." />
        </div>
        <button className="btn-outline" onClick={load} style={{ marginBottom: "0" }}>🔄 Atualizar</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Operação</th>
            <th>Estado</th>
            <th>Origem</th>
            <th>Detalhes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={6}>Carregando…</td></tr>
          ) : filtrados.length === 0 ? (
            <tr className="empty-row"><td colSpan={6}>Nenhum registro com os filtros atuais.</td></tr>
          ) : (
            filtrados.slice(0, 200).map((item, index) => (
              <tr key={`${item.data}-${index}`}>
                <td style={{ whiteSpace: "nowrap" }}>{item.data}</td>
                <td>{item.operacao}</td>
                <td style={{
                  fontWeight: 600, fontSize: "12px",
                  color: item.estado === "erro" ? "var(--danger)" : item.estado === "publicada" || item.estado === "enviada" || item.estado === "agendado" ? "var(--success)" : "var(--text-muted)",
                }}>
                  {item.estado}
                </td>
                <td>{item.origem}</td>
                <td style={{ maxWidth: "340px" }}>{item.detalhe}</td>
                <td className="action-icons"><span title="Copiar" onClick={() => copiar(item)}>📋</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="placeholder-note" style={{ marginTop: "12px" }}>
        Exibindo {Math.min(filtrados.length, 200)} de {filtrados.length} registro(s) (limite de 200 por tela).
      </p>
    </section>
  );
}
