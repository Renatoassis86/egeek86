# Descoberta automática: religamento conservador (2026-11-03)

Ata: `docs/conselho/atas/2026-11-03-religar-descoberta.md`. Código: `src/server/collector/discover-products.ts`, `src/server/collector/discover-policy.ts`, rota `src/app/api/cron/discover-products/route.ts`.

## O que roda
`vercel.json`: `/api/cron/discover-products?source=meli&maxNew=10&terms=4&probes=25`, `17 * * * *`. Só Mercado Livre (API oficial de catálogo). Por execução: 4 termos da rotação (123 termos, cursor em `system_config.discover_products_cursor`; volta completa em cerca de 31 h), até 25 sondas de preço por termo, no máximo 10 masters novos, 90 s de orçamento. Nasce em `review` (invisível) tudo com dúvida; ver a ata.

Parâmetros da URL (todos com teto duro em `discover-policy.ts`): `maxNew` (máx. 50), `terms` (máx. 10), `probes` (máx. 60), `dry=1` (simula, não grava; devolve `preview` e amostras de descarte), `source=meli|shopee|all`.
Variável de ambiente opcional: `DISCOVER_MODE=review_all` força TODO master novo a nascer em review (recomendado nas primeiras 24 h se o dono quiser zero exposição).

## Como desligar
1. Remover de `vercel.json` a entrada `/api/cron/discover-products...` e fazer deploy (a rota continua existindo, protegida por `CRON_SECRET`).
2. Enquanto o deploy não sai: `DISCOVER_MODE=review_all` deixa tudo novo invisível.
3. Rollback de código: cópias em `backup/discover-products.ts.2026-11-03.bak`, `backup/discover-route.ts.2026-11-03.bak`, `backup/vercel.json.2026-11-03.bak`.

## Como auditar o que o cron criou
Cada master novo traz `attributes.discovery = {source, at, doubts[], bornAs}`; o resumo da última execução fica em `system_config` chave `discover_products_last_run`; o console da Vercel tem 1 linha JSON `event: "discover-products"` por execução.

```sql
-- masters criados pela descoberta nas últimas 24 h
SELECT m.id, m.name, m.product_type, m.game_platform_gen, m.created_at,
       m.attributes->'discovery'->>'bornAs' AS nasceu_como,
       m.attributes->'catalogGate'->>'reason' AS motivo,
       (SELECT count(*) FROM affiliate_offers o WHERE o.master_product_id = m.id) AS ofertas
FROM master_products m
WHERE m.created_at > now() - interval '24 hours' AND m.attributes ? 'discovery'
ORDER BY m.created_at DESC;

-- visíveis ao público (approved) criados pela descoberta: conferir um a um
SELECT id, name, created_at FROM master_products
WHERE attributes ? 'discovery' AND attributes->'discovery'->>'bornAs' = 'approved' ORDER BY created_at DESC;

-- ofertas placeholder criadas pela rotina (mesmo intervalo)
SELECT o.id, o.title, o.current_price_cents, o.created_at FROM affiliate_offers o
WHERE o.created_at > now() - interval '24 hours' AND o.external_ref LIKE 'MLB%' AND o.seller_id IS NULL;

-- última execução
SELECT value, updated_at FROM system_config WHERE key = 'discover_products_last_run';
```

Reverter um master criado por engano (nunca apagar): marcar rejeitado.
```sql
UPDATE master_products
SET attributes = jsonb_set(attributes, '{catalogGate}', '{"verdict":"rejected","category":"owner_decision","reason":"rejeitado_manualmente","matched":null,"version":1,"manual":"rejected"}'::jsonb, true)
WHERE id IN ('<id>');
```

## O que monitorar
- Proporção approved/review (cerca de 25/75 no dry-run) e `skipReasons` por execução; `stoppedReason` diferente de null (429, tempo, teto).
- 429 do Mercado Livre (1 em 123 buscas no dry-run) e `elapsedMs` perto de 90 s.
- Cada `approved` nas primeiras 48 h: título, plataforma, formato, preço frente ao mercado.
- Masters novos duplicando existentes (auditar com `scripts/dry-run-dup-report.ts`).
- Fila de `review` crescendo sem triagem.
