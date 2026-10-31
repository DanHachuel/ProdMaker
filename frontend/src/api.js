async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export const api = {
  health: () => request("/api/health"),
  version: () => request("/api/version"),
  session: () => request("/api/auth/session"),
  login: (email, activation_code) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, activation_code }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  settings: () => request("/api/settings"),
  saveSettings: (data) => request("/api/settings", { method: "PUT", body: JSON.stringify(data) }),

  produtos: () => request("/api/produtos"),
  createProduto: (body) => request("/api/produtos", { method: "POST", body: JSON.stringify(body) }),
  updateProduto: (id, body) => request(`/api/produtos/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduto: (id) => request(`/api/produtos/${id}`, { method: "DELETE" }),
  aprovarProduto: (id) => request(`/api/produtos/${id}/aprovar`, { method: "POST" }),
  analisarProduto: (id) => request(`/api/produtos/${id}/analisar`, { method: "POST" }),

  llmProviders: () => request("/api/llm/providers"),
  llmTest: (id) => request("/api/llm/test", { method: "POST", body: JSON.stringify({ id }) }),

  trackingDashboard: () => request("/api/tracking/dashboard"),
  visitante: (ip) => request(`/api/tracking/visitante/${ip}`),

  infoprodutos: () => request("/api/infoprodutos"),
  createInfoproduto: (body) => request("/api/infoprodutos", { method: "POST", body: JSON.stringify(body) }),
  deleteInfoproduto: (id) => request(`/api/infoprodutos/${id}`, { method: "DELETE" }),
  infoprodutoMarkdown: (id) => request(`/api/infoprodutos/${id}/markdown`),

  paginas: () => request("/api/paginas"),
  createPagina: (body) => request("/api/paginas", { method: "POST", body: JSON.stringify(body) }),
  paginaHtml: (id) => request(`/api/paginas/${id}/html`),
  updatePaginaHtml: (id, html) => request(`/api/paginas/${id}/html`, { method: "PUT", body: JSON.stringify({ html }) }),
  publicarPagina: (id) => request(`/api/paginas/${id}/publicar`, { method: "POST" }),
  deletePagina: (id) => request(`/api/paginas/${id}`, { method: "DELETE" }),

  dominios: () => request("/api/dominios"),
  createDominio: (body) => request("/api/dominios", { method: "POST", body: JSON.stringify(body) }),
  verificarDominio: (id) => request(`/api/dominios/${id}/verificar`, { method: "POST" }),
  updateDominioTags: (id, tags) => request(`/api/dominios/${id}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }),
  deleteDominio: (id) => request(`/api/dominios/${id}`, { method: "DELETE" }),

  vendas: () => request("/api/vendas"),
  vendasResumo: () => request("/api/vendas/resumo"),
  createVenda: (body) => request("/api/vendas", { method: "POST", body: JSON.stringify(body) }),
  deleteVenda: (id) => request(`/api/vendas/${id}`, { method: "DELETE" }),
  importVendasCsv: (csv) => request("/api/vendas/csv", { method: "POST", body: JSON.stringify({ csv }) }),
  uploadConversao: (id) => request(`/api/vendas/${id}/conversao`, { method: "POST" }),
  uploadConversoesLote: () => request("/api/vendas/conversoes/upload", { method: "POST" }),

  adswords: (produtoId) => request(produtoId ? `/api/adswords?produto_id=${produtoId}` : "/api/adswords"),
  adswordsGerar: (produtoId) => request("/api/adswords/gerar", { method: "POST", body: JSON.stringify({ produto_id: produtoId }) }),
  adswordsAdicionar: (body) => request("/api/adswords", { method: "POST", body: JSON.stringify(body) }),
  adswordsRemover: (id) => request(`/api/adswords/${id}`, { method: "DELETE" }),

  gerarCriativos: (body) => request("/api/criativos/gerar", { method: "POST", body: JSON.stringify(body) }),

  campanhas: () => request("/api/campanhas"),
  createCampanha: (body) => request("/api/campanhas", { method: "POST", body: JSON.stringify(body) }),
  getCampanha: (id) => request(`/api/campanhas/${id}`),
  deleteCampanha: (id) => request(`/api/campanhas/${id}`, { method: "DELETE" }),
  publicarCampanha: (id) => request(`/api/campanhas/${id}/publicar`, { method: "POST" }),

  dashboard: () => request("/api/dashboard"),

  lancamentoAtual: () => request("/api/lancamentos/atual"),
  lancamentoEtapas: () => request("/api/lancamentos/etapas"),
  iniciarLancamento: (produtoId) => request("/api/lancamentos", { method: "POST", body: JSON.stringify({ produto_id: produtoId }) }),
  salvarEtapaLancamento: (id, etapa, dados) => request(`/api/lancamentos/${id}/etapa`, { method: "POST", body: JSON.stringify({ etapa, dados }) }),
  relatorioLancamento: (id) => request(`/api/lancamentos/${id}/relatorio`),
  concluirLancamento: (id) => request(`/api/lancamentos/${id}/concluir`, { method: "POST" }),

  notificacoesConfig: () => request("/api/notificacoes"),
  salvarNotificacoes: (eventos, targets) => request("/api/notificacoes", { method: "PUT", body: JSON.stringify({ eventos, targets }) }),
  notificacoesHistorico: () => request("/api/notificacoes/historico"),
  testarNotificacao: (body) => request("/api/notificacoes/teste", { method: "POST", body: JSON.stringify(body) }),

  pins: (produtoId) => request(produtoId ? `/api/pins?produto_id=${produtoId}` : "/api/pins"),
  pinsGerar: (body) => request("/api/pins/gerar", { method: "POST", body: JSON.stringify(body) }),
  pinStatus: (id, status) => request(`/api/pins/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  pinRemover: (id) => request(`/api/pins/${id}`, { method: "DELETE" }),
  pinsExport: (pinIds) => request("/api/pins/export", { method: "POST", body: JSON.stringify({ pin_ids: pinIds }) }),

  logs: () => request("/api/logs"),

  guias: () => request("/api/guias"),
  guia: (arquivo) => request(`/api/guias/${arquivo}`),
};
