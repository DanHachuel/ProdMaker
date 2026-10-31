import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";

const FAQ = [
  {
    pergunta: "O que é o ProdMaker?",
    resposta:
      "Aplicativo local (SaaS na sua máquina) para criar infoprodutos, landing pages, campanhas de tráfego e tracking — tudo em um painel, acessado pelo navegador em http://localhost:8188.",
  },
  {
    pergunta: "Como faço login?",
    resposta:
      "Use qualquer e-mail + o Código de Ativação Mestre impresso no terminal ao iniciar (padrão: 1234). O alias 'admin' também funciona. Para um código próprio, defina a variável PRODMAKER_MASTER_CODE antes de iniciar.",
  },
  {
    pergunta: "O ProdMaker abre o navegador sozinho?",
    resposta:
      "Nunca (REGRA ZERO). Ao iniciar, o launcher apenas imprime a URL no terminal — você abre manualmente.",
  },
  {
    pergunta: "Preciso de chaves de API?",
    resposta:
      "Para IA (NVIDIA NIM ou Google Gemini) sim — configure em Chaves de API. Sem chave, o app funciona mas a geração de conteúdo/páginas/criativos fica indisponível (mensagem clara informa). Para tracking local não precisa de nada.",
  },
  {
    pergunta: "Como publico minhas páginas?",
    resposta:
      "Configure GitHub (PAT + repositório) em Chaves de API e publique em Páginas Criadas. Se o repositório estiver conectado a um projeto no Cloudflare Pages, o deploy acontece automaticamente.",
  },
  {
    pergunta: "Como configuro o rastreamento?",
    resposta:
      "Em Chaves de API → Pixel de Rastreamento, informe a URL pública do /track (use um túnel cloudflared/ngrok apontando para localhost:8188). O pixel é embutido automaticamente nas páginas geradas.",
  },
  {
    pergunta: "Como recebo notificações de vendas?",
    resposta:
      "Configure Bot Token + Chat ID do Telegram em Chaves de API (ou URLs apprise de Discord/e-mail em Notificações) e ligue os eventos desejados.",
  },
  {
    pergunta: "Onde ficam meus dados?",
    resposta:
      "Na pasta PRODMAKER_HOME (padrão: C:\\Users\\<usuário>\\Documents\\REPOSITORIO\\ProdMaker ou seu ～\\ProdMaker) — nada sai da sua máquina, exceto o que as integrações configuradas enviam às plataformas.",
  },
];

export default function Faq() {
  const { toast } = useToast();
  const [guias, setGuias] = useState([]);
  const [guiaAberto, setGuiaAberto] = useState(null);
  const [aberto, setAberto] = useState(null);

  const load = useCallback(async () => {
    try {
      setGuias(await api.guias());
    } catch (err) {
      toast(err.message || "Falha ao carregar guias.");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const abrirGuia = async (arquivo) => {
    try {
      setGuiaAberto(await api.guia(arquivo));
    } catch (err) {
      toast(err.message || "Falha ao abrir guia.");
    }
  };

  return (
    <section>
      <h1>❓ FAQ & Documentação</h1>
      <p className="subtitle">Perguntas frequentes, guias de configuração e documentos legais.</p>

      <div className="faq-container">
        {FAQ.map((item, index) => (
          <div className={`faq-item ${aberto === index ? "active" : ""}`} key={index}>
            <button className="faq-question" onClick={() => setAberto(aberto === index ? null : index)}>
              {item.pergunta} <span>{aberto === index ? "▲" : "▼"}</span>
            </button>
            <div className="faq-answer">
              <p>{item.resposta}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: "16px", margin: "28px 0 10px" }}>📚 Guias de referência</h3>
      <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {guias.length === 0 ? (
          <div className="metric-card">
            <h3>Sem guias</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nenhum guia em seed/references.</p>
          </div>
        ) : (
          guias.map((guia) => (
            <div className="metric-card" key={guia.arquivo} style={{ cursor: "pointer" }} onClick={() => abrirGuia(guia.arquivo)}>
              <h3>{guia.titulo}</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>{guia.arquivo}</p>
            </div>
          ))
        )}
        <div className="metric-card" style={{ cursor: "pointer" }} onClick={() => window.open("/legal/index.html", "_blank")}>
          <h3>⚖️ Verificação de aplicação</h3>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>/legal — index, privacidade (LGPD), termos</p>
        </div>
      </div>

      {guiaAberto && (
        <div className="form-card" style={{ marginTop: "20px" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>{guiaAberto.arquivo}</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "13px", lineHeight: 1.6, color: "var(--text-main)" }}>
            {guiaAberto.conteudo}
          </pre>
        </div>
      )}
    </section>
  );
}
