# Ciclo 02: base de preços (C01, C05, C06, C26)

Método: `price_daily_state` (13.126 dias `complete` desde 15/10) recomputado a partir de `members`; `affiliate_offers` x último snapshot; idade das confirmações; `scripts/auditoria-informacao/ciclo02a.ts` e `ciclo02b.ts`.

## Passou
- `current_price_cents` = último snapshot em 100% das 33.531 ofertas ativas; nenhum preço zero.
- `n_offers` = nº de `members` e `avg_cents` = média de `members` (0 divergências em 13.126 dias). Nenhum dia `complete` com menos de 3 ofertas.
- ML: 268 de 26.346 ofertas ativas com confirmação > 24 h; Shopee 11 de 4.291.

## Achados

| Id | Sev. | Achado | Evidência | Afetados |
|---|---|---|---|---|
| AUD-10 | ALTA | **O gatilho de isca (R-61) não julga Shopee nem Amazon**: o critério usa `seller_id` e 100% das ofertas Shopee (4.291) e Amazon (2.894) têm `seller_id` nulo (ML: 4.373 de 26.356). Sem 3 vendedores de referência, não julga. Há 33 ofertas Amazon/Shopee, ativas e fora de quarentena, abaixo de 0,50 x a mediana dos outros anúncios (>= 3 outros): Amazon 22, Shopee 11. Algumas são "Menor preço agora" no site. Ex.: GodFall PS5 Amazon R$ 49,97 (76e7d42c; mediana outros R$ 135, "Menor preço agora" em /monitoramento/comparar/fcdbb149...), Soundbar Wave One Pacific Ocean Amazon R$ 839,61 contra R$ 2.299 (b8088fb1, a mesma soundbar do caso "Cupom encerrado"), Call of Duty AW PS4 Shopee R$ 89,90 (c1f94177). Nem todas são isca (pode ser promoção real): precisam de leitura da página. | SQL no fim | 33 ofertas |
| AUD-11 | ALTA | **Dias FECHADOS de `price_daily_state` guardam mínimo de oferta isca ou de vendedor fraco** (limite já conhecido no R-61, mas o mínimo é lido por `regua.ts`/`noMenorRegistrado` e pelo estado). Em 15 dias: 24 masters / 128 dias com `min_cents` < menor `members` e a oferta-mínima em quarentena de isca (ex.: Knack PS4 R$ 100,00 por 14 dias contra R$ 240; MediEvil PS4 R$ 39,90; Cyberpunk PS4 R$ 90). Ainda: em 1.565 de 13.126 dias (12%) `min_cents` < menor valor entre os `members` porque `min_cents` inclui ofertas fora da média por "vendedor-fraco" (1.288) ou isca (129+). Ou seja, a média e o mínimo vêm de conjuntos diferentes. A mensagem pública P3 de 13/11 ("menor registrado R$ 100,00", Cyberpunk PS4) e 4 outras citam mínimos desse tipo. | `ciclo02a.ts`; SQL no fim | 24 masters; 4 mensagens com isca; ~1.500 dias de estado |
| AUD-12 | MÉDIA | **Amazon sem frescor**: 2.482 de 2.894 ofertas Amazon ativas (86%) com confirmação > 24 h e 989 > 48 h; 170 ofertas ativas sem nenhuma confirmação. O site mostra o preço com "Vendedor alterou o preço há 3 dias" e o chama de "Menor preço agora". R-21 limita a Amazon a 24 h para média e menor preço. (Dívida conhecida #81, aqui medida.) | SQL | 2.482 ofertas |
| AUD-13 | BAIXA | `price_daily_state` do dia 14/11 do GodFall tem 3 ofertas contra 5 em 13/11 e 15/11 (a Amazon some e volta): o "menor" sobe de R$ 49,97 para R$ 130 e desce de novo. Composição instável gera falsa "alta/queda" no gráfico (`composition_flag` existe, mas a mensagem P1 não o usa). | SQL | amostra 1; classe geral |

## Invariantes propostos (ciclo 02)
- **I-06** `min_cents` do dia e a média do dia vêm do MESMO conjunto de ofertas (ou o mínimo declara a base: "menor preço de qualquer vendedor").
- **I-07** Toda oferta ativa e visível tem preço >= 0,50 x mediana dos outros anúncios, ou está em quarentena, ou tem prova de promoção; independente de `seller_id` (usar loja/rede como "vendedor" quando faltar).
- **I-08** Nenhuma oferta Amazon aparece em "Menor preço agora" com confirmação > 24 h.
- **I-09** Dias fechados com isca marcada são reprocessados por script reversível (backup NDJSON), nunca em silêncio.

## SQL (AUD-10)
```sql
WITH a AS (SELECT o.id, n.slug, o.current_price_cents p,
  (SELECT percentile_cont(.5) WITHIN GROUP (ORDER BY x.current_price_cents) FROM affiliate_offers x WHERE x.master_product_id=o.master_product_id AND x.id<>o.id AND x.status='active' AND x.quarantined_at IS NULL) med,
  (SELECT count(*) FROM affiliate_offers x WHERE x.master_product_id=o.master_product_id AND x.id<>o.id AND x.status='active' AND x.quarantined_at IS NULL) k
 FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id WHERE o.status='active' AND o.quarantined_at IS NULL)
SELECT slug, count(*) FROM a WHERE k>=3 AND p<0.5*med GROUP BY 1;
```
## SQL (AUD-11)
```sql
SELECT count(distinct s.master_product_id), count(*) FROM price_daily_state s JOIN affiliate_offers o ON o.id=s.min_offer_id
WHERE s.day>=current_date-15 AND s.quality='complete' AND o.quarantine_reason LIKE 'preco_isca%'
AND s.min_cents < (SELECT min(value::numeric) FROM jsonb_each_text(s.members));
```
