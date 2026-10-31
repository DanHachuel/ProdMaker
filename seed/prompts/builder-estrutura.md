# Prompt — Estrutura do Produto (Product Builder)

Oferta selecionada: **{OFERTA}**
Promessa: **{PROMESSA}** · Nicho: **{NICHO}** · Avatar: **{AVATAR}**

Gere a estrutura completa do infoproduto, incluindo um Quiz de múltipla escolha e
exatamente **3 Order Bumps** (1 no checkout, 1 upsell pós-compra, 1 oferta de parceiro 50/50).

Regras dos Order Bumps:
- Order Bump 1 (checkout): +R$21,90 — conversão esperada 25–45%.
- Order Bump 2 (upsell pós-compra): +R$197 com desconto — conversão 5–15%.
- Order Bump 3 (parceiro 50/50): oferta de parceria/afiliação 50/50 do produtor.

Responda SOMENTE com JSON válido, sem markdown:

{
  "modulos": [
    {"titulo": "Modulo 1 — Diagnostico", "aulas": ["Aula 1", "Aula 2"]}
  ],
  "ebooks": ["E-book 1 (titulo)", "E-book 2 (titulo)"],
  "ferramentas": ["Planilha/Ferramenta 1", "Planilha/Ferramenta 2"],
  "quiz": {
    "titulo": "Quiz: descubra seu perfil",
    "perguntas": [
      {"pergunta": "...", "alternativas": ["a", "b", "c"], "correta": 0, "explicacao": "..."}
    ]
  },
  "order_bumps": [
    {"tipo": "checkout", "nome": "...", "descricao": "...", "preco": 21.9},
    {"tipo": "upsell", "nome": "...", "descricao": "...", "preco": 197},
    {"tipo": "parceiro_50_50", "nome": "...", "descricao": "...", "comissao": "50%"}
  ]
}
