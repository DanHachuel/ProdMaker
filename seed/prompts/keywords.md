# Prompt — Palavras-chave & Negativas (Google Ads)

Para o produto **{NOME_DO_PRODUTO}** (busca ativa no nicho {NICHO}):

1. Liste a palavra principal (nome do produto).
2. Liste variações de intenção de compra: "review", "funciona", "vale a pena", "onde comprar", "site oficial", "desconto".
3. Use correspondência de frase ("palavra") por padrão.
4. Negativas: aplique a lista padrão de seed/negatives/google-words.txt e acrescente negativas específicas do nicho.

Formato de saída (JSON):
{ "principais": [{"palavra": "", "correspondencia": "frase"}],
  "negativas": [{"palavra": ""}] }
