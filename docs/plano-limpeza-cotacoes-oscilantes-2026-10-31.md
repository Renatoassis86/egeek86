# Oscilação de cotações: causa, correção e plano de limpeza (2026-10-31)

Status: correção de gravação aplicada no código (sem deploy). Limpeza do histórico NÃO aplicada; depende de aprovação do dono (decisão D8 do plano de expansão).

## 1. Causa confirmada [dado real]

- `affiliate_offers` não tem coluna de item id: a identidade é (produto, rede, vendedor). O Mercado Livre devolve, em `/products/{id}/items`, 2 ou 3 anúncios do MESMO vendedor para o mesmo catálogo (preços diferentes). `applySnapshotsToGroup` achava a mesma oferta para todos e gravava cada preço em sequência na mesma oferta.
- Evidência (SELECTs, 10 ofertas): padrão A,B,(C),A,B,(C) com 0,2 a 1,6 s entre os preços de uma mesma coleta e ~5 min entre coletas. Ex.: oferta 65fe6ba5 alterna 306203/309304/315533 (16 preços distintos em 7 dias); ae5e4d59 alterna 469900/489900. Todas com `status=active`, mesmo `seller_id` por oferta, `external_ref` MLB49200061 ou MLB58623212.
- `recordPriceSnapshot` comparava com o último snapshot, então cada alternância virava linha nova.
- Agravante: execuções do cron sobrepostas (ticks de 5 min, coleta de ~1 min) liam o mesmo último snapshot e podiam gravar em paralelo.
- Não é buy box alternando, nem reexecução isolada do cron como causa principal. Há 270 triplas (produto, rede, vendedor) duplicadas em `affiliate_offers` (investigar à parte).

Medidas (somente leitura): 7 dias = 209.530 snapshots; 186.014 são trocas A-B-A (89%); 483 ofertas com A-B-A. Janela de 30 dias, ofertas com >= 50 padrões A-B-A: 555 ofertas guardam 2.543.569 de 3.226.773 snapshots (79%) e 207.278 de 209.530 dos últimos 7 dias (99%). Ofertas ativas: 2.295.

## 2. Correção no código

- `src/server/collector/collect-prices.ts`: `collapseBySeller` reduz os resultados a um por vendedor (anúncio mais barato; desempate por item id) antes de gravar. Determinístico: a oferta só muda de preço quando o preço do vendedor muda de fato.
- `src/server/collector/record-price-snapshot.ts`: grava snapshot só se o preço difere do ÚLTIMO snapshot (não do cache), com batimento a cada 24 h (mesmo preço) para provar a coleta; `pg_advisory_xact_lock` por oferta serializa escritas concorrentes.
- `src/server/collector/sources/mercado-livre.ts`: removida a chamada morta a `/sites/MLB/search` (403 sempre); fica só `/products/{id}/items`.
- Não alterado: `discover-products.ts` ainda usa `/sites/MLB/search` (linhas ~403 e ~839) na descoberta; remover desativa a descoberta por termo/categoria, então depende de decisão do dono (substituir por `/highlights` e `/products/search`).

Redução estimada: de ~30 mil para ~3 a 4 mil snapshots/dia (cerca de 90%): ~2,25 mil/7 dias fora das oscilantes + até 2,3 mil/dia de batimento (teto, 2.295 ativas) + mudanças reais. O batimento domina o volume novo; se o dono preferir, passar para 48 h ou 7 dias.

## 3. Plano de limpeza (NÃO aplicado)

Princípio: histórico intocável. Marcar, não apagar. Exige migração (coluna nova) fora do escopo desta tarefa, por isso é proposta.

1. Dry-run (SELECT, sem escrita): classificar como espúrio o snapshot de oferta oscilante que repete um preço já visto na mesma coleta (janela de 60 s) e não é o menor preço do vendedor naquela coleta. Contagem por oferta e por mês; amostra de 20 ofertas para revisão humana.
   ```sql
   -- ofertas oscilantes
   WITH s AS (SELECT id, offer_id, price_cents, collected_at,
     lag(price_cents) OVER w p1, lag(price_cents,2) OVER w p2
     FROM affiliate_price_snapshots WINDOW w AS (PARTITION BY offer_id ORDER BY collected_at, id))
   SELECT offer_id, count(*) FROM s WHERE p2 = price_cents AND p1 <> price_cents
   GROUP BY offer_id HAVING count(*) >= 50;
   ```
2. Regra de marcação: dentro de cada rajada (snapshots da oferta com menos de 60 s entre si), manter o de menor preço (preço do vendedor) e marcar os demais.
3. Marcação reversível: nova coluna `affiliate_price_snapshots.spurious_at timestamptz NULL` (migração), UPDATE em lotes de 10 mil com contagem antes e depois, relatório por oferta. Nenhum DELETE.
4. Consumidores: `product-price-stats.ts`, gráficos e média passam a filtrar `spurious_at IS NULL`. Medir o impacto na média dos jogos antes (ela muda: hoje é puxada pelas ofertas oscilantes, 79% das linhas).
5. Retenção/agregado (D4) só depois, sobre dados já marcados.

## 4. Depende do dono

- Aprovar a marcação (D8), a migração da coluna e o impacto na média dos jogos.
- Frequência do batimento (24 h proposto).
- Destino da descoberta que usa `/sites/MLB/search`.
- Investigar as 270 triplas duplicadas de `affiliate_offers`.
- Alternativa estrutural: coluna de item id em `affiliate_offers` (uma oferta por anúncio), em vez de um anúncio por vendedor. Mudaria a contagem de cotações.
