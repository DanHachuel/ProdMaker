import React from "react";
import PlaceholderPage from "../components/PlaceholderPage";

export const Dominios = () => (
  <PlaceholderPage
    emoji="🌐"
    title="AdsHosting — Domínios"
    subtitle="Gerencie seus domínios no Cloudflare e publique presells com SSL, DNS e antibot."
    items={[
      "Adicionar domínio e apontar name servers (verificação NS e registro A)",
      "Status por domínio: pendente ou online (SSL, DNS, Antibot)",
      "Tags, Pixels e Scripts opcionais por domínio",
      "Publicação das páginas geradas direto no domínio via Cloudflare Pages",
    ]}
  />
);

export const PaginasCriadas = () => (
  <PlaceholderPage
    emoji="📄"
    title="AdsHosting — Páginas Criadas"
    subtitle="Todas as presells e páginas de vendas hospedadas, com visitas e status."
    items={[
      "Tabela de páginas: nome, domínio, produto, visitas e status",
      "Ações: ver online, editar, excluir e abrir estatísticas",
    ]}
  />
);

export const Studio = () => (
  <PlaceholderPage
    emoji="📖"
    title="Infoprodutos — Criar Infoproduto"
    subtitle="Gere e-books, planilhas e mini-cursos em PDF com IA (3 modos)."
    items={[
      "Modo Rápido: LLM gera Markdown → HTML A4 → PDF (WeasyPrint)",
      "Modo Premium: Gamma AI API com exportação em PDF",
      "Modo Canva: conector MCP para criação manual",
      "Nome, preço, order bump (+R$21,90) e upsell (+R$197) sugeridos pelas regras",
    ]}
  />
);

export const Biblioteca = () => (
  <PlaceholderPage
    emoji="📚"
    title="Infoprodutos — Biblioteca"
    subtitle="Seus infoprodutos gerados, com pré-visualização e download."
    items={["Listagem com pré-visualização", "Download do PDF", "Regenerar a partir do prompt"]}
  />
);

export const AdsPages = () => (
  <PlaceholderPage
    emoji="🛡️"
    title="AdsPages"
    subtitle="Crie e hospede presells nativas e páginas de vendas (12 seções) com pixel embutido."
    items={[
      "Pre-sell de afiliado com link de afiliado no CTA",
      "Página de vendas própria com as 12 seções validadas",
      "Clonagem e higienização de páginas (remoção de scripts/pixels do original)",
      "Escolha do domínio (Cloudflare) e publicação com um clique",
    ]}
  />
);

export const AdsWords = () => (
  <PlaceholderPage
    emoji="✈️"
    title="AdsWords"
    subtitle="Palavras-chave e negativas para Google Ads (correspondência de frase)."
    items={[
      "Gerador de palavras-chave com variações (review, funciona, onde comprar…)",
      "Negativas padrão do seed (gratis, download, torrent, refund…)",
      "Listas editáveis por produto e exportação",
    ]}
  />
);

export const AdsCreator = () => (
  <PlaceholderPage
    emoji="🎯"
    title="AdsCreator"
    subtitle="Crie anúncios de alta conversão no Google, Meta e TikTok."
    items={[
      "Google Ads: Search com CPA 60–80% da comissão e orçamento R$100–120/dia",
      "Meta Ads: 1 campanha → 1 conjunto → 5–20 criativos (público aberto + Advantage+)",
      "TikTok Ads: vídeo 9:16 estilo UGC, teste US$10–20/dia",
      "Gerador de criativos: gancho 3s + promessa + prova + CTA",
    ]}
  />
);

export const Visitas = () => (
  <PlaceholderPage
    emoji="🔄"
    title="AdsTracking — Minhas Visitas (AdsPixel)"
    subtitle="Captura dados de cada visitante das suas presells, sem scripts de terceiros."
    items={[
      "Cards de visitantes com IP, região, dispositivo e cliques repetidos",
      "Alerta de drenagem de orçamento com cópia da lista de IPs",
      "Funil: Visitas → Cliques de oferta → Checkouts → Vendas",
      "Donuts de origem de tráfego, dispositivos e sistemas operacionais",
    ]}
  />
);

export const Vendas = () => (
  <PlaceholderPage
    emoji="💸"
    title="AdsTracking — Minhas Vendas"
    subtitle="Vendas rastreadas por webhooks (Hotmart, ClickBank, Digistore24, Kiify, Cakto), entrada manual ou CSV."
    items={["Tabela de vendas com produto, valor, comissão e origem", "Configuração de webhooks", "Importação CSV e lançamento manual"]}
  />
);

export const Gclid = () => (
  <PlaceholderPage
    emoji="📤"
    title="AdsTracking — Conversões GCLID"
    subtitle="Envie conversões offline (GCLID) de volta ao Google Ads."
    items={["Upload de conversões via google-ads-python", "Histórico e status de cada conversão enviada"]}
  />
);

export const AdsBot = () => (
  <PlaceholderPage
    emoji="🤖"
    title="AdsBot — Lançamento Assistido"
    subtitle="Conduza um lançamento completo passo a passo: Produto → Página → Publicar → Campanhas → Tracking."
    items={[
      "Wizard com progresso persistido e retomável",
      "Checklist final e Relatório de Lançamento",
      "Fila de ações automáticas por etapa",
    ]}
  />
);

export const Pinterest = () => (
  <PlaceholderPage
    emoji="📌"
    title="Pinterest — Orgânico"
    subtitle="Crie e agende pins (1000x1500) com SEO, apontando para suas presells."
    items={["Gerador de ideias de pins por IA", "Criação e agendamento via py3-pinterest", "Boards temáticos e histórico"]}
  />
);

export const ContasGoogle = () => (
  <PlaceholderPage
    emoji="🔑"
    title="Contas do Google"
    subtitle="Contas Google Ads conectadas (OAuth + developer token + customer IDs)."
    items={["Cards por conta com conectar/testar", "Vinculação de subcontas MCC"]}
  />
);

export const ApiKeys = () => (
  <PlaceholderPage
    emoji="🔌"
    title="Chaves de API"
    subtitle="Gerencie as integrações: Gemini, NVIDIA NIM, GitHub, Cloudflare, Telegram, Pinterest, Google Ads, Meta, TikTok, Gamma AI e Canva."
    items={["Cards por integração com status Conectado/Desconectado", "Teste de chamada read-only por card", "Prioridade e failover do pool de LLM"]}
  />
);

export const Notificacoes = () => (
  <PlaceholderPage
    emoji="🔔"
    title="Notificações (AdsNotify)"
    subtitle="Push de vendas e conclusões via Telegram/Discord/e-mail (apprise)."
    items={["Toggles por evento (venda, campanha criada, página publicada…)", "Histórico local e toasts em tempo real"]}
  />
);

export const Logs = () => (
  <PlaceholderPage
    emoji="📋"
    title="Logs"
    subtitle="Histórico unificado de operações com attribution de provider."
    items={["Tabela: Operação, Estado, Data/Hora, Origem, Detalhes", "Filtros por operação e estado"]}
  />
);

export const Faq = () => (
  <PlaceholderPage
    emoji="❓"
    title="FAQ & Documentação"
    subtitle="Perguntas frequentes e guias (hospedagem, Google Ads OAuth, webhooks, Gamma)."
    items={["FAQ em accordion", "Guias de referência do seed/references", "Termos e Privacidade (/legal)"]}
  />
);
