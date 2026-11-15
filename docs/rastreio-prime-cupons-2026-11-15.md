# Rastreio ponta a ponta: promoção Prime 25% (Jogo Barato) e cupons da Amazon (2026-11-15)

Item 1 do `docs/checklist-mestre-2026-11-15.md` (fila #66, #82, #37). Medido por SELECT, leitura de código, curl e testes. Painel somente leitura que repete tudo: `npx tsx --conditions=react-server --env-file=.env.local scripts/verificar-prime-cupons.ts`.

## Tabela dos elos

| # | Elo | Verificação | Resultado | Correção |
|---|---|---|---|---|
| 1a | Loop no ar = repositório | curl `/loops/amazon-promocoes.js` x arquivo (md5 sem CR) | Iguais na v1.1.0 (antes desta correção) | v1.2.0 no repositório; vale após o deploy e a reinjeção |
| 1b | Endpoints do loop | leitura de código | `GET/POST /api/ingest/amazon-promocoes` (Bearer; GET `?pendentes=N`, POST página e `confirmacoes`), `POST /api/ingest/cupons-heartbeat?rede=amazon`, leitura de `/blackfriday` e `/blackfriday/2/` | nenhuma |
| 1c | Configuração | `validarCfg` | exige `api` https, `token` (>= 32), `enviar === true` (qualquer outra coisa = só simula), opcionais `extras`, `maxPaginas` (60), `maxItens` (20), `cicloMin` (30), `pausaMs` | nenhuma |
| 1d | Roda sem enviar? | batimento + banco | NÃO: há 16 execuções gravadas em 24 h com `origem amazon-promocoes` e confirmações; `enviar:true` está efetivo. A prova direta é `__promo.status().enviar` | nenhuma |
| 1e | Extras não varridos | leitura de código | BUG: `extras` entravam no fim da lista e `slice(0, maxPaginas)` os cortava com 60+ promoções descobertas | CORRIGIDO: `PURO.idsParaVarrer` (extras primeiro, sem repetir); teste novo; versão 1.2.0 |
| 2a | Rota recebe e valida | leitura de código | `couponGuard` (origem Amazon + token), corpo <= 150 KB, `lidos_em` ISO com fuso, 503 `banco_instavel` com retry em erro transitório | nenhuma |
| 2b | Onde grava | schema real + código | `coupon_items` (colunas: `network_slug`, `scope_kind`, `scope` jsonb com `item_ids`/`offer_ids`, `audience`, `conditions` jsonb com `promo_id`, `prime_checkout`, `validade_desconhecida`, `state`, `verified_at`; NÃO existe coluna `network`), `offer_coupon_reads` (`offer_id`, `campaign_id`, `status`, `label`, `price_with_coupon_cents`, `source`, `read_at`) | nenhuma |
| 2c | Por que `collector_runs` não tem `amazon-promocoes` | SELECT | O job real é **`cupons-assistida`** (`network amazon`, `meta.origem = amazon-promocoes`), gravado por `recordCouponRun` só quando há cupom casado; o heartbeat é `cupons-batimento` (`network amazon`, versão `promocoes-*`) | Não era falha: auditoria procurou o nome errado. Verificador usa os nomes certos |
| 2d | Heartbeat medido | SELECT | `promocoes-1.1.0 ok/em_andamento` há 0 min; reinício às 12:22 UTC (`iniciado`); 733 batimentos ok do job `cupons-batimento` | nenhuma |
| 3a | Promoção A2B9F6KRH7YF1H no banco | SELECT | **0** `coupon_items`, 0 leituras, 0 menção em `collector_runs.meta`; 0 Prime no banco inteiro (a simulação offline de 14/11 dá certo: Games 95% de 58 casados, 4 ASINs do concorrente ativos, 127,42 e 119,92 conferem) | Falta o DADO DE ENTRADA: o que a aba leu desta página (ver "O que falta ler na aba") |
| 3b | Regra de decisão | testes + simulação | 37/37 `test-promo-prime`, 72/72 `test-amazon-promocoes`; `categoriaPelosItens` (>= 5 casados, >= 80%), `departamentoCompativel`, `precoCasa` (15%), `primeNaFinalizacao`, preço derivado correto | nenhuma |
| 4a | Gatilho CUPOM e a Amazon | SELECT em `group_messages` | **0 mensagens CUPOM da Amazon em toda a história** (201 enviadas do ML em 7 dias, nenhuma da Amazon) | ver 4b |
| 4b | Ponte confirmação -> mensagem | leitura de código | BUG REAL: `confirmarItens` grava a leitura positiva em `source = 'amazon-item-confirmado'` (desde d6fc3a0), mas `coupon-item-lookup`, `coupon-offers`, `group-offers` e `guardiao-cupons` só chamavam de "promoção" a fonte `amazon-promocoes`. A leitura caía como "item": sem checar estado `verificado`, sem validade, e `primeOk` (Prime na finalização) nunca ligava | CORRIGIDO: `FONTES_PROMO` (as duas fontes) em lookup, pool, `offersWithPositiveRead` e guardião |
| 4c | Validade desconhecida (Prime sem prazo) | leitura de código | `if (!r.pc_valid) 'validade_nao_lida'` barrava toda promoção sem prazo lido (R2-15 diz que vale pela confirmação na página do item) | CORRIGIDO: aceita quando `conditions.validade_desconhecida = true`; a agulha de item já aceita validade nula |
| 4d | Dry-run do pool/gate | `simular-gatilho-cupom.ts` e `simular-promocao-prime-games.ts` | Hoje só há cupom do ML no pool; para a Prime, mensagem de teste correta (R$ 119,92 Pac-Man, "Exclusivo Prime", cota 2/h e 8/dia). Não há dry-run honesto com dados reais porque não existe `coupon_item` A2B9 (gravar um falso seria fabricar leitura) | Depende do 3a |
| 5 | Front | consulta da vitrine (pool.ts) + curl `/games` | 0 ofertas elegíveis, 0 "Prime" no HTML (esperado: sem cupom verificado). Código do cartão ("Prime · confira o prazo") testado em `test-promo-prime` | Depende do 3a |
| 6 | Admin: comissão e quarentena | leitura de código | `admin-comissao` e a quarentena usam o preço de prateleira (`current_price_cents`); o preço derivado Prime nunca é gravado em `affiliate_offers`, só calculado na exibição. Logo a quarentena não é afetada; a comissão prevista usa prateleira (pode superestimar até 25% numa venda Prime, pois a Amazon paga sobre o valor efetivo) | Sem mudança; pendência menor registrada (não é barreira de extração) |
| 7 | Flags | `vercel env ls production` | `PROMO_PRIME_DERIVADA`, `PROMO_DESCOBERTA`, `GROUP_PROMO_PRIME` existem (Sensitive, 16 h); valores ocultos | Só provável por efeito (linhas 3, 4 e 5 do verificador) |

## O que falta ler na aba (pedido ao orquestrador)

O loop v1.1.0 está rodando; o dado que falta é o que ele leu de `A2B9F6KRH7YF1H`. Comando de leitura (só leitura, na aba da Amazon), logo depois de uma varredura:

```js
JSON.stringify((window.__promo.status().linhas||[]).filter(l=>l.promo==='A2B9F6KRH7YF1H'||l.descartado))
```

Interpretação: `descartado: sem_cabecalho / nao_renderizou / redirecionada` = a página não renderizou como esperado; `itens: 0` com `restrito: false` = os cards não estão em `#productInfoList` (corrigir o seletor); `casados: 0, motivo: 'sem_itens_lidos'` idem; `motivo: restrita_*` = flag desligada ou título lido como "seguir/compre N"; linha ausente = a promoção ficou fora das 60 páginas (corrigido na 1.2.0). Também: `window.__promo.status().enviar` (deve ser `true`) e `.promocoes` (quantas páginas por ciclo).

## Reinjeção (após o deploy deste commit estar Ready)

Mesma sequência usada hoje, com o arquivo novo: injetar `window.__PROMO_CFG = { api: 'https://www.egeek86.com', token: '<token de cupons da aba>', enviar: true, extras: ['A2B9F6KRH7YF1H'] }` e depois o conteúdo de `public/loops/amazon-promocoes.js` (versão `promocoes-1.2.0`). Reinjetar substitui o loop vivo. Não ligar nada novo: nenhuma flag nova foi alterada.

## O que ainda precisa de tempo/ciclo

- Próxima varredura do `__promo` (ciclo de 30 min mais ~8 min de páginas): grava `coupon_items` `nao_verificado` da A2B9 (se a leitura trouxer >= 5 cards casados com games).
- Passo 2 do mesmo ciclo (`?pendentes=20`): lê a página de cada ASIN e confirma; só então vira `verificado`, com `amazon-item-confirmado` fresco (120 min).
- Agulha/mensagem: o gerador de mensagens (cron `group-messages`) enxerga o item no ciclo seguinte; sujeito a cota Prime (2/h, 8/dia), frescor Amazon, preço confirmado e janela. Esperado: primeira mensagem CUPOM Prime em até ~1 h depois da primeira confirmação.
- Front: cache de 5 min depois da confirmação.

## Critério de fechamento (cadeia de implantação)

Fecha quando `verificar-prime-cupons.ts` mostrar OK em 3 (A2B9 com `prime_checkout`), 4 (confirmação fresca e >= 1 mensagem CUPOM da Amazon proposta ou enviada) e 5 (>= 1 oferta elegível e "Prime" no HTML de `/games`), com data registrada em `docs/decisoes-dono-2026-11-15.md`.
