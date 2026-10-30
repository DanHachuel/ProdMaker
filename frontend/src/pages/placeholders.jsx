import React from "react";
import PlaceholderPage from "../components/PlaceholderPage";

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
