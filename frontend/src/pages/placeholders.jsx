import React from "react";
import PlaceholderPage from "../components/PlaceholderPage";

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
