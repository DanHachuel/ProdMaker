# Prompt — 12 Anúncios (Product Builder)

Produto: **{PRODUTO}** · Promessa: **{PROMESSA}** · Link: **{LINK}**

Gere exatamente **12 anúncios** de texto (max 125 caracteres + CTA curto), divididos:

- **Prova (4):** subtipos social (prova de pessoas), material (prova concreta/números),
  lógica (raciocínio irrefutável) — distribua 4 entre eles, indicando o subtipo.
- **Desafio (4):** garantia/desafio (ex.: "resultado em 7 dias ou devolvemos").
- **Comparação (4):** isso vs aquilo (produto vs alternativa cara/genérica).

Responda SOMENTE com JSON válido, sem markdown:

{
  "anuncios": [
    {"categoria": "prova", "subtipo": "social", "texto": "...", "cta": "..."},
    {"categoria": "desafio", "subtipo": "garantia", "texto": "...", "cta": "..."},
    {"categoria": "comparacao", "subtipo": "isso_vs_aquilo", "texto": "...", "cta": "..."}
  ]
}
