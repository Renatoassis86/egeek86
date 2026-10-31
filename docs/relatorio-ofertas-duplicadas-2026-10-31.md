# Relatório: ofertas duplicadas por (master_product, network, seller) em affiliate_offers

Data: 2026-10-31. Escopo: somente leitura (apenas SELECT, sessão em `default_transaction_read_only`). Nada foi alterado no banco. Todos os números abaixo são medições reais do banco de produção.

## 1. Resumo

- 270 combinações (master_product_id, network_id, seller_id) com seller não nulo têm exatamente 2 ofertas cada (540 linhas). Todas na rede mercado-livre, em 131 master_products distintos.
- Se incluir `seller_id IS NULL` o SQL "ingênuo" acusa 963 grupos / 2.814 linhas, mas isso é ruído: os placeholders de catálogo (seller nulo) são protegidos por índice parcial e o grupo (network, external_ref) com seller nulo não tem duplicata (0). Os placeholders de ofertas diferentes do mesmo master compartilham o par master/network legitimamente.
- Nenhum grupo tem 2 ofertas ativas: 156 grupos são `active + expired`; 114 são `expired + expired`. Logo, hoje o preço público, o "menor preço" e a contagem de ofertas ativas NÃO são afetados (2.171 ofertas ativas com preço > 0 = 2.171 combinações distintas).
- O dano real está nas estatísticas de produto: `product-price-stats.ts` usa snapshots de ofertas de qualquer status, então a oferta duplicada (expirada) conta em dobro no preço médio e nas cotações. 261.206 de 3.240.630 snapshots (8,1%) estão nas cópias perdedoras, em 131 produtos.
- Falta uma constraint única para o par com seller (ver seção 5).

## 2. Contagens

| Medida | Valor |
|---|---|
| Ofertas por status | active 2.325, expired 8.075, archived 2 |
| Grupos duplicados (seller não nulo) | 270 (todos de tamanho 2) |
| Composição | 156 active+expired, 114 expired+expired, 0 active+active |
| Rede | mercado-livre 270 |
| Master_products afetados | 131 |
| Mesma `affiliate_url` | 252 grupos |
| `affiliate_url` distinta (itens diferentes do mesmo vendedor) | 18 grupos |
| `external_ref` (catalog_product_id) distinto | 7 grupos |
| Criadas com diferença < 5 s entre si | 262 de 270 (266 em < 1 h; 4 com > 1 dia) |
| Período de criação | 2026-07-14 a 2026-10-29 (ainda ocorrendo) |
| Preço igual entre as 2 | 241 grupos; difere em 29 (dif. máxima R$ 200,00) |
| Duplicatas sem snapshot | 0 (as 540 têm histórico) |
| Em carrinho (affiliate_cart_items) / mensagens | 0 / 0 |
| Snapshots nas 270 cópias perdedoras | 261.206 (keepers: 296.883; total tabela: 3.240.630) |

Observação: na comparação de preço entre as duas ofertas, a divergência vem de cópias onde uma está expirada com preço antigo; entre ofertas ativas a diferença é inexistente (nenhum grupo tem 2 ativas).

## 3. Causa provável

Dois tipos, em proporções muito diferentes:

1. Corrida de concorrência (252 grupos, mesma URL e mesmo item; 262 criadas em < 5 s). `applySnapshotsToGroup` em `src/server/collector/collect-prices.ts` faz `SELECT ... WHERE master/network/seller LIMIT 1` e, se não achar, `INSERT`. Sem índice único, duas execuções simultâneas do coletor (cron + manual, ou dois lotes sobrepostos) passam pelo SELECT antes de qualquer commit e inserem as duas. É o mesmo padrão já corrigido em `discover-products.ts` com `onConflictDoNothing` + índice parcial, mas ainda sem equivalente para ofertas com seller.
2. Vários anúncios por vendedor (18 grupos, URLs de itens `MLB-...` distintos, 7 com `external_ref` distinto). O mesmo vendedor tem anúncios diferentes para o mesmo produto/catálogo; `collapseBySeller` colapsa dentro de uma execução, mas em execuções diferentes o item escolhido pode mudar (buy box) e, quando a primeira oferta já não é achada (ex.: filtro por `external_ref` do grupo), nasce outra. São itens realmente distintos, mas o modelo do negócio é uma oferta por vendedor.

Em ambos os casos o campo `last_checked_at`/`consecutive_miss_count` mostra as cópias sendo mantidas em paralelo (ex.: amostra Mario vs. Donkey Kong, as duas com milhares de snapshots, 19.423 e 4.040).

Nota: em `collect-prices.ts` (linha ~406), uma oferta `expired` que reaparece volta para `active`. Isso é relevante para o índice parcial (seção 5).

## 4. Amostra (5 grupos aleatórios)

| Produto | Status | Preço (cents) | Item ML | Criada | Snapshots |
|---|---|---|---|---|---|
| Jogo Ps5 Visions Of Mana (mesmo vendedor) | active | 37799 | MLB-5031199921 | 2026-08-10 14:20:41 | 1 |
| idem | expired | 37799 | MLB-5031199921 (mesma) | 2026-08-10 14:20:41 | 1 |
| Mario vs. Donkey Kong Switch | expired | 43700 | MLB-6676929656 | 2026-07-30 18:15:04 | 19.423 |
| idem | expired | 43700 | mesma | 2026-07-30 18:15:04 | 4.040 |
| Halo Infinite Xbox One | expired | 11000 | MLB-7218251460 | 2026-07-30 18:26:28 | 2 |
| idem | expired | 11000 | mesma | 2026-07-30 18:26:28 | 2 |
| Elden Ring Nightreign PS5 | expired | 27999 | MLB-5379375146 | 2026-07-30 18:16:45 | 904 |
| idem | expired | 29999 | mesma | 2026-07-30 18:16:45 | 1.961 |
| Console Switch 2 | expired | 402500 | MLB-7287233320 | 2026-07-30 18:30:52 | 1 |
| idem | expired | 402500 | mesma | 2026-07-30 18:30:52 | 1 |

Exemplos de itens distintos do mesmo vendedor: Resident Evil 3 PS5 (active 22990 + expired 22990, URLs 886428520 / 886428616), Radiant Tale Switch (active 34224 + expired 32468, URLs distintas).

## 5. Impacto

- Preço público / menor preço: sem impacto hoje (nenhum grupo com 2 ativas; listagens filtram `status = 'active'`).
- Contagem de ofertas ativas: sem impacto.
- Preço médio e número de cotações por produto: impacto em 131 produtos. `product-price-stats.ts` (comentário nas linhas 18-19) usa snapshots de ofertas de qualquer status, portanto as cópias perdedoras (261.206 snapshots) contam duas vezes a mesma loja, violando "um jogo, uma média" ponderada por loja real. Séries de `price-history.ts` usam só ofertas ativas e ficam fora.
- Risco futuro: se a cópia expirada reaparecer, vira `active` (reativação em collect-prices) e passa a haver 2 ativas do mesmo vendedor, aí afetando contagem e "melhor oferta".

## 6. Constraint única

Hoje só existem: `affiliate_offers_slug_uq`, `affiliate_offers_network_external_ref_uq` (parcial, `seller_id IS NULL`). Para ofertas com seller não há nenhuma, é o que permitiu os 270 grupos.

Um índice único total em (master_product_id, network_id, seller_id) NÃO é viável, mesmo após a limpeza, porque as cópias retiradas continuariam existindo (nunca deletar) e colidiriam. Opção viável:

```sql
CREATE UNIQUE INDEX CONCURRENTLY affiliate_offers_master_network_seller_live_uq
  ON affiliate_offers (master_product_id, network_id, seller_id)
  WHERE seller_id IS NOT NULL AND status NOT IN ('expired', 'archived');
```

Isso exige:
- Que ao reativar (`expired -> active`, collect-prices ~linha 406) o código verifique se já existe uma oferta viva do mesmo trio; senão a reativação viola o índice. Alternativa: sempre reaproveitar a oferta mais recente do trio.
- Trocar o `INSERT` por `INSERT ... ON CONFLICT DO NOTHING` (com o mesmo predicado) e re-SELECT, como já feito em discover-products.
- Verificar os valores do enum `affiliate_offer_status` antes (conhecidos: draft, active, expired, archived; se existir `paused`, decidir se entra no predicado).
- Hoje o banco já cumpre o predicado (0 grupos com 2 não-expiradas), então o índice pode ser criado logo, antes mesmo da limpeza, e já impede novas duplicatas vivas. A limpeza de legado só é necessária para os efeitos nas estatísticas.

## 7. Plano de correção proposto (NÃO executado)

Passo 0: migration do índice parcial acima (seguro agora, 0 violações) e ajuste no coletor (ON CONFLICT + reativação segura). Corrige a origem.

Passo 1: escolher a oferta a manter em cada um dos 270 grupos, em ordem:
1. a que estiver `active` (os 156 grupos active+expired mantêm a ativa; hoje nenhuma perdedora é ativa);
2. senão (114 grupos expired+expired), a com mais snapshots; empate: a mais recentemente verificada (`last_checked_at`), depois a mais antiga (`created_at`, `id`) para estabilidade;
3. em grupos de URL distinta, preferir a que tem `affiliate_link_pending = false` e URL do item vigente.

Passo 2: nas 270 perdedoras (todas já `expired`, nenhuma em carrinho ou mensagem) marcar `status = 'archived'` (nunca DELETE) para distinguir "duplicata aposentada" de "expirada legítima". Isso é um UPDATE de 270 linhas, em transação, com backup da lista de ids antes. Os 2 `archived` existentes devem ser verificados quanto ao motivo.

Passo 3: tratar as estatísticas. Marcar `archived` não basta: `product-price-stats.ts` conta qualquer status. Duas opções, escolher uma:
- (a) mudar a query para excluir `archived` (os 261.206 snapshots ficam preservados, só deixam de contar); ou
- (b) mover os snapshots da perdedora para a mantida (UPDATE `offer_id`), o que preserva o histórico mas altera atribuição e pode gerar linhas coincidentes. Recomendado (a), por não reescrever histórico.

Passo 4: reexecutar este SELECT de verificação (esperado 0 grupos com 2 não-expiradas; 270 arquivadas; médias dos 131 produtos recalculadas com 1 oferta por vendedor), validar um produto afetado na tela e acionar `qa-verificador`.

## 8. Pendências e riscos

- Descobrir por que 4 grupos foram criados com mais de 1 dia de intervalo (provável caso de anúncios distintos).
- Confirmar o motivo dos 2 `archived` já existentes.
- Conferir se o cron e a execução manual do coletor podem rodar sobrepostos (origem da corrida); considerar advisory lock.
- Reativação `expired -> active` no coletor pode ressuscitar duplicatas se o índice não for implantado antes.
- Recomenda-se que o passo 3 (a) e o índice sejam feitos antes do UPDATE de arquivamento.
