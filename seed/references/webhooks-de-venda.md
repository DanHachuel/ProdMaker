# Webhooks de Venda (plataformas de afiliados)

O ProdMaker recebe vendas por webhook público e registra em Minhas Vendas.

## URLs de postback

Configure no painel de cada plataforma (**AdsTracking → Minhas Vendas → 🔗 Webhooks**
tem as URLs prontas para copiar):

```
POST https://SEU-TUNEL-OU-DOMINIO/api/webhook/sale/hotmart
POST https://SEU-TUNEL-OU-DOMINIO/api/webhook/sale/clickbank
POST https://SEU-TUNEL-OU-DOMINIO/api/webhook/sale/digistore24
POST https://SEU-TUNEL-OU-DOMINIO/api/webhook/sale/kiify
POST https://SEU-TUNEL-OU-DOMINIO/api/webhook/sale/cakto
```

Como o ProdMaker é local, use um túnel (cloudflared/ngrok) apontando para a porta 8188.
Alternativa sem túnel: adição manual de vendas ou importação de CSV.

## Formato aceito

- **JSON** (Hotmart, Digistore24, Kiify, Cakto): qualquer formato — o parser é tolerante e
  procura valor, comissão, e-mail, transação, produto, status e **gclid** em qualquer nível do JSON.
- **Form-urlencoded** (ClickBank Instant Notification): pares `chave=valor`.

## Dica para capturar GCLID

No link de afiliado/checkout, mantenha os parâmetros da campanha (`gclid`, `utm_*`) até a
página de obrigado. No postback da plataforma, envie o `gclid` (parâmetro de rastreamento).
O ProdMaker cruza o GCLID com a visita correspondente e habilita o upload de conversão
offline ao Google Ads (se configurado em Chaves de API).

## Status

- `PURCHASE_APPROVED`/`approved`/`complete` → aprovada
- `PURCHASE_REFUNDED`/`refunded`/`chargeback` → reembolsada
- demais (ex.: `billet_printed`, `pending`) → pendente
