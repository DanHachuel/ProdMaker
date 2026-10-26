import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function Dominios() {
  const { toast } = useToast();
  const [dominios, setDominios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState(null);
  const [tagsModal, setTagsModal] = useState(null); // dominio
  const [tagsTexto, setTagsTexto] = useState("");
  const [copiado, setCopiado] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDominios(await api.dominios());
    } catch (err) {
      toast(err.message || "Falha ao carregar domínios.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const adicionar = async (event) => {
    event.preventDefault();
    setSalvando(true);
    try {
      const record = await api.createDominio({ nome: novoNome });
      toast(`Domínio "${record.nome}" adicionado!`);
      setNovoNome("");
      setAddOpen(false);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao adicionar domínio.");
    } finally {
      setSalvando(false);
    }
  };

  const verificar = async (dominio, tipo = "ns") => {
    setVerificando(`${dominio.id}-${tipo}`);
    try {
      const updated = await api.verificarDominio(dominio.id);
      const v = updated.verificacao || {};
      if (updated.status === "online") {
        toast(`✅ ${dominio.nome}: online na Cloudflare!`);
      } else if (tipo === "ns") {
        toast(`⏳ ${dominio.nome}: NS ainda não apontado (${(v.ns || []).join(", ") || "sem resposta DNS"}).`);
      } else {
        toast(`📋 ${dominio.nome}: registros A = ${(v.a || []).join(", ") || "nenhum"}.`);
      }
      await load();
    } catch (err) {
      toast(err.message || "Falha na verificação.");
    } finally {
      setVerificando(null);
    }
  };

  const abrirTags = (dominio) => {
    setTagsTexto(dominio.tags || "");
    setTagsModal(dominio);
  };

  const salvarTags = async () => {
    try {
      await api.updateDominioTags(tagsModal.id, tagsTexto);
      toast("Tags/Pixels/Scripts salvos neste domínio.");
      setTagsModal(null);
      await load();
    } catch (err) {
      toast(err.message || "Falha ao salvar.");
    }
  };

  const remover = async (dominio) => {
    if (!window.confirm(`Remover o domínio "${dominio.nome}"?`)) return;
    try {
      await api.deleteDominio(dominio.id);
      toast("Domínio removido.");
      await load();
    } catch (err) {
      toast(err.message || "Falha ao remover.");
    }
  };

  const copiar = async (valor) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(valor);
      toast("Copiado: " + valor);
    } catch {
      toast("Não foi possível copiar — selecione manualmente.");
    }
  };

  return (
    <section>
      <h1>🌐 AdsHosting — Domínios</h1>
      <p className="subtitle">Gerencie seus domínios e publique presells com SSL, DNS e antibot. Configure a Cloudflare em Chaves de API para verificação automática.</p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h3 style={{ fontSize: "16px" }}>🌐 Domínios <span style={{ fontSize: "14px", color: "var(--text-muted)", fontWeight: "normal" }}>{dominios.length}</span></h3>
          <p style={{ fontSize: "13px", color: "var(--primary)", cursor: "pointer", marginTop: "5px" }} onClick={() => window.open("https://dash.cloudflare.com", "_blank")}>
            Aponte os name servers no seu registrador ↗
          </p>
        </div>
      </div>

      <button className="btn-primary" style={{ width: "100%", padding: "12px", marginBottom: "20px" }} onClick={() => setAddOpen(true)}>
        + Adicionar Domínio
      </button>

      {loading ? (
        <p className="placeholder-note">Carregando…</p>
      ) : dominios.length === 0 ? (
        <div className="form-card" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>Nenhum domínio cadastrado. Adicione o primeiro para começar a hospedar presells.</p>
        </div>
      ) : (
        <div className="domain-grid">
          {dominios.map((dominio) => {
            const nsData = parseJson(dominio.ns_data, {});
            const aData = parseJson(dominio.a_data, {});
            const online = dominio.status === "online";
            const nameServers = (nsData.cf_name_servers && nsData.cf_name_servers.length ? nsData.cf_name_servers : (nsData.ns || [])).slice(0, 2);
            return (
              <div className="domain-card" key={dominio.id}>
                <div>
                  <div className="domain-title">{dominio.nome}</div>
                  {online ? (
                    <div className="status-tag online">✅ Domínio online e disponível na criação de presell.</div>
                  ) : (
                    <div className="status-tag pending">⏳ O domínio ainda não está apto para receber anúncios</div>
                  )}

                  {online ? (
                    <ul className="domain-list">
                      <li>🔒 SSL: {nsData.ns?.length ? "Ativo" : "—"}</li>
                      <li>🌐 DNS: {online ? "Configurado" : "—"}</li>
                      <li>🛡️ Antibot: via pixel do ProdMaker</li>
                    </ul>
                  ) : (
                    <>
                      <p style={{ fontSize: "13px", fontWeight: "bold", color: "var(--primary)", textAlign: "center", margin: "15px 0" }}>Name Servers detectados</p>
                      {nameServers.length === 0 ? (
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", marginBottom: "15px" }}>
                          Nenhum NS detectado ainda — clique em “Verificar NS” após apontar no registrador.
                        </p>
                      ) : (
                        nameServers.map((ns) => (
                          <div className="input-group" key={ns} onClick={() => copiar(ns)} style={{ cursor: "pointer" }} title="Clique para copiar">
                            <input type="text" value={ns} readOnly />
                            <button type="button">📋</button>
                          </div>
                        ))
                      )}
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "15px" }}>
                        No registrador, aponte os name servers da Cloudflare e aguarde (30 min a 48 h). Depois clique em Verificar.
                      </p>
                    </>
                  )}

                  {online && aData.a && aData.a.length > 0 && (
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "10px" }}>Registros A: {aData.a.join(", ")}</p>
                  )}
                </div>
                <div className="domain-card-bottom">
                  <div className="domain-actions">
                    <button className="btn-outline" onClick={() => verificar(dominio, "a")} disabled={verificando === `${dominio.id}-a`}>
                      {verificando === `${dominio.id}-a` ? "…" : "Verificar A"}
                    </button>
                    <button className="btn-outline" onClick={() => verificar(dominio, "ns")} disabled={verificando === `${dominio.id}-ns`}>
                      {verificando === `${dominio.id}-ns` ? "…" : "Verificar NS"}
                    </button>
                    <button className="btn-outline" style={{ flex: "0.25" }} onClick={() => remover(dominio)}>🗑️</button>
                  </div>
                  <button className="btn-outline" style={{ width: "100%", display: "flex", justifyContent: "space-between" }} onClick={() => abrirTags(dominio)}>
                    + Tags, Pixels and Scripts (Opcional) <span>📋</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} title="Adicionar Domínio" onClose={() => setAddOpen(false)}>
        <form onSubmit={adicionar}>
          <div className="form-group">
            <label>Domínio (sem https://)</label>
            <input required value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="ex.: minhapresell.com" />
          </div>
          <p className="placeholder-note" style={{ marginBottom: "12px" }}>
            O domínio precisa estar cadastrado na sua conta Cloudflare (o ProdMaker verifica NS e status via API/DNS).
          </p>
          <button className="btn-primary" type="submit" disabled={salvando} style={{ width: "100%" }}>
            {salvando ? "Adicionando…" : "Adicionar"}
          </button>
        </form>
      </Modal>

      <Modal open={Boolean(tagsModal)} title={`Tags, Pixels e Scripts — ${tagsModal?.nome || ""}`} onClose={() => setTagsModal(null)}>
        <div className="form-group">
          <label>Scripts adicionais (inseridos nas páginas publicadas neste domínio — futuro deploy)</label>
          <textarea rows={8} value={tagsTexto} onChange={(e) => setTagsTexto(e.target.value)} placeholder="<!-- ex.: Google Tag Manager, Meta Pixel --><![CDATA[ ... ]]>" style={{ fontFamily: "monospace", fontSize: "12px" }} />
        </div>
        <button className="btn-primary" onClick={salvarTags} style={{ width: "100%" }}>Salvar</button>
      </Modal>
    </section>
  );
}
