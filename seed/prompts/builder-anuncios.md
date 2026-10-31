# Prompt — 12 Anúncios + 10 Pins (Product Builder)

Produto: **{PRODUTO}** · Promessa: **{PROMESSA}** · Link: **{LINK}**

Gere exatamente **12 anúncios** de texto (max 125 caracteres + CTA curto), divididos:
- **Prova (4):** subtipos social, material, lógica (+1 social extra) — indique o subtipo;
- **Desafio (4):** garantia/desafio (ex.: "resultado em 7 dias ou devolvemos");
- **Comparação (4):** isso vs aquilo (produto vs alternativa cara/genérica).

Gere também **10 ideias de Pins para Pinterest**: título ≤100 caracteres, descrição ≤500
com palavras-chave SEO, texto grande para a imagem e sugestão de imagem (formato 1000x1500).
Temas dos pins: review ("Vale a pena?"), benefícios, comparação e dica.

Responda SOMENTE com JSON válido, sem markdown:

{
  "anuncios": [
    {"categoria": "prova", "subtipo": "social", "texto": "...", "cta": "..."},
    {"categoria": "desafio", "subtipo": "garantia", "texto": "...", "cta": "..."},
    {"categoria": "comparacao", "subtipo": "isso_vs_aquilo", "texto": "...", "cta": "..."}
  ],
  "pins": [
    {"titulo_pin": "ate 100 caracteres", "descricao": "ate 500 caracteres", "texto_na_imagem": "destaque", "sugestao_imagem": "antes/depois, review..."}
  ]
}
