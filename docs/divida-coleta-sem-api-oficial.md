# Dívida: coleta fora da API oficial (2026-10-31)

Regra: coleta somente por API oficial (decisão de 2026-10-28). Itens abaixo violam a regra e foram **desligados por flag de ambiente (padrão desligado)**, sem apagar o código.

| Item | Arquivo | Flag para religar (não recomendado) | Substituição |
|---|---|---|---|
| Busca pública Shopee (`shopee.com.br/api/v4/search_items`, User-Agent de navegador) | `src/server/collector/discover-shopee-products.ts` (`fetchViaPublicSearch`) | `SHOPEE_PUBLIC_SEARCH_ENABLED=true` | Shopee Affiliate API (GraphQL), exige `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_APP_SECRET`. Com credenciais, só o caminho oficial é usado. |
| Raspagem HTML da busca Magalu | `src/server/collector/discover-magalu-products.ts` | `MAGALU_PUBLIC_SCRAPING_ENABLED=true` | Nenhuma API de descoberta disponível (Developers API é só seller). Magalu tem 0 ofertas no banco. |
| Coleta de preço Shopee/Amazon/AliExpress | `sources/shopee.ts`, `amazon.ts`, `aliexpress.ts` | n/a | São stubs (`operational: false`); o coletor ignora essas redes até haver credenciais e implementação oficial. |

Outra dívida fora do escopo do coletor: `scrapeNewsArticle` em `src/server/actions/news.ts`.

Consequência: ofertas Shopee existentes (~3,8 mil ativas) deixam de receber novos preços e `last_checked_at` não é mais renovado para elas. Marcar `expired` e piso/frescor na leitura pública dependem de decisão do dono (EG-03).

## Atualização 2026-10-31: integração oficial da Shopee (código pronto, NÃO validado ao vivo)

- Busca pública (scraping) removida de `discover-shopee-products.ts`; descoberta agora só via `productOfferV2` (API oficial).
- Coleta de preço: `sources/shopee.ts` + `collect-shopee-prices.ts` (rota `/api/cron/collect-shopee`, cron `*/10` em `vercel.json`). Reativa ofertas `expired` só quando a API devolve preço válido.
- A integração só foi compilada (tsc/build). Nenhuma chamada real à API foi feita: as credenciais só existem na Vercel (Sensitive) e o CRON_SECRET também. Pendente: chamar o endpoint de diagnóstico (guardado fora da árvore) e conferir o schema.
