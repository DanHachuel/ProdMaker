# Prompt — Assets: Order Bumps, Upsell e Quiz (Product Builder)

Produto: **{OFERTA}** · Promessa: **{PROMESSA}** · Preço: R$ **{PRECO}**

Gere em JSON válido:

1. **Três Order Bumps:**
   - Bump 1 (no checkout, +R$21,90): conversão esperada 25–45%;
   - Bump 2 (upsell pós-compra, +R$197 com desconto): conversão 5–15%;
   - Bump 3 (parceria 50/50): oferta de afiliação/parceria com 50% de comissão.
2. **Quiz com IA:** 5 perguntas de múltipla escolha (3 alternativas cada, índice da correta,
   explicação curta) para engajar o lead antes da compra.

Responda SOMENTE com JSON válido, sem markdown:

{
  "order_bumps": [
    {"tipo": "checkout", "nome": "", "descricao": "", "preco": 21.9},
    {"tipo": "upsell", "nome": "", "descricao": "", "preco": 197},
    {"tipo": "parceiro_50_50", "nome": "", "descricao": "", "comissao": "50%"}
  ],
  "quiz": {"titulo": "", "perguntas": [{"pergunta": "", "alternativas": ["", "", ""], "correta": 0, "explicacao": ""}]}
}
