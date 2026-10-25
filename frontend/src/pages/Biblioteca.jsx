import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

function formatDate(value) {
  if (!value) return "—";
  const [date] = value.split(" ");
  const [year, month, day] = date.split("-");
  return year ? `${day}/${month}/${year.slice(2)}` : value;
}

export default function Biblioteca() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null); // { titulo, markdown }
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.infoprodutos());
    } catch (err) {
      toast(err.message || "Falha ao carregar a biblioteca.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openPreview = async (item) => {
    setPreviewLoading(true);
    setPreview({ titulo: item.titulo, markdown: "" });
    try {
      const data = await api.infoprodutoMarkdown(item.id);
      setPreview({ titulo: item.titulo, markdown: data.markdown });
    } catch (err) {
      setPreview(null);
      toast(err.message || "Markdown indisponível para este item.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const remover = async (item) => {
    if (!window.confirm(`Excluir o infoproduto "${item.titulo}"?`)) return;
    try {
      await api.deleteInfoproduto(item.id);
      toast("Infoproduto excluído.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao excluir.");
    }
  };

  return (
    <section>
      <h1>📚 Biblioteca de Infoprodutos</h1>
      <p className="subtitle">Seus infoprodutos gerados — download do PDF e visualização do conteúdo.</p>

      <table>
        <thead>
          <tr>
            <th>Criado</th>
            <th>Título</th>
            <th>Formato</th>
            <th>Modo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="empty-row"><td colSpan={5}>Carregando…</td></tr>
          ) : items.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={5}>Nenhum infoproduto ainda. Gere o primeiro em “Criar Infoproduto”.</td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{formatDate(item.created_at)}</td>
                <td>{item.titulo}{item.nicho ? <span style={{ color: "var(--text-muted)" }}> · {item.nicho}</span> : null}</td>
                <td>{item.formato}</td>
                <td>{item.modo === "gamma" ? "🎨 Premium" : "⚡ Rápido"}</td>
                <td className="action-icons">
                  <a href={`/api/infoprodutos/${item.id}/download`} title="Baixar PDF" style={{ color: "inherit", textDecoration: "none" }}>⬇️ PDF</a>
                  {item.md_path && <span title="Ver conteúdo" onClick={() => openPreview(item)}>👁️</span>}
                  <span title="Excluir" onClick={() => remover(item)}>🗑️</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Modal open={Boolean(preview)} title={`Conteúdo — ${preview?.titulo || ""}`} onClose={() => setPreview(null)}>
        {previewLoading ? (
          <p className="placeholder-note">Carregando…</p>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "14px", lineHeight: 1.6, color: "var(--text-main)" }}>
            {preview?.markdown}
          </pre>
        )}
      </Modal>
    </section>
  );
}
