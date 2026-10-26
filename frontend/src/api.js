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
};
