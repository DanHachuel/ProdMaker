# Pixel de Rastreamento (/track) e túneis

O ProdMaker rastreia visitas das suas páginas com um **pixel próprio** — sem scripts de terceiros.

## Como funciona

1. Ao gerar uma página (AdsPages), o pixel do ProdMaker é embutido automaticamente **quando**
   houver uma "URL pública do /track" configurada em Chaves de API → Pixel de Rastreamento.
2. O pixel envia `sendBeacon` com: evento (pageview, clique em CTA, unload), página, gclid,
   utm_source, utm_medium, utm_campaign e referrer. O backend grava na tabela `visitas`.
3. As visitas aparecem em AdsTracking → Minhas Visitas, e vendas com GCLID são cruzadas
   automaticamente com a visita de origem (matching 🎯).

## URL pública em máquina local

Como o ProdMaker roda localmente (127.0.0.1), plataformas e visitantes externos não o alcançam.
Use um túnel:

```bash
# cloudflared (recomendado)
cloudflared tunnel --url http://localhost:8188
# copie a URL gerada (ex.: https://nome-aleatorio.trycloudflare.com)
# → configure no card Pixel de Rastreamento: https://nome-aleatorio.trycloudflare.com/track
```

Alternativas: ngrok, localhost.run, serveo.

## Eventos

| Evento | Quando | Dados capturados |
|---|---|---|
| pageview | carregamento da página | gclid, utm_*, referrer |
| cta_click | clique em link/CTA | href do link |
| unload | saída da página | segundos na página |

## Drenagem de orçamento

Visitantes com 4+ cliques em CTA aparecem no alerta de POSSÍVEL DRENAGEM — use a lista
para negativar no Google Ads (critério: campanha → lista de exclusão de IPs).
