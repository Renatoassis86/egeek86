# Inventário: por que os jogos em promoção do concorrente não estavam no front nem nas mensagens (2026-11-14)

Pedido do dono: os jogos de Switch e Switch 2 que o Jogo Barato divulga (promoção "Exclusivo Prime", 25% na finalização) não apareciam nas nossas plataformas. Medido em leitura (script `scripts/inventario-jogos-promocao.ts`, só SELECT e funções puras reais). Alvos: Mega Man Star Force Legacy, Pac-Man World 2 Re-Pac (Switch e Switch 2), Octopath Traveler II (Switch 2), Sonic X Shadow Generations (Switch 2), Star Wars Outlaws (Switch 2), Octopath Traveler + II Bundle (Switch 2), mais 3 lançamentos (Granblue Fantasy Relink Endless Ragnarok, LEGO Batman Legacy of the Dark Knight e Octopath Traveler 0 em Switch 2) que nem existiam no catálogo.

## Motivos, um a um

| # | Motivo | Evidência medida | Onde corrigir | Estado |
|---|---|---|---|---|
| M1 | O leitor da promoção descarta promoção Prime (restrita a assinantes) e não lê a categoria de títulos como "Jogos de … com 25% OFF" (cai em `fora_do_departamento`) | 129 `coupon_items` inválidos por departamento; nenhuma promoção Prime virou item | `src/lib/coupons/amazon-promocoes.ts` (`catInicio`, `primeNaFinalizacao`), `src/server/coupons/amazon-promocoes.ts` | corrigido, atrás de `PROMO_PRIME_DERIVADA` (desligada) |
| M2 | Na vitrine, item Amazon sem base de preço é ordenado pela queda real e cai fora do topo 10 das faixas Switch/Switch 2 | alvos presentes no pool, mas fora das faixas `plataforma:switch_*:jogos` | `src/lib/vitrines/regras.ts` (`ordenarPorQueda`), `src/server/vitrines/pool.ts` (`carregarPromosPrime`), `cartao-vitrine.tsx` | corrigido: a queda derivada da promoção só ordena; sem selo e sem média. Mesma flag |
| M3 | Motor de mensagens: sem motivo de entrada (nenhum evento de queda, nenhuma média abaixo, nenhuma 2ª rede) o produto nem é avaliado; o teto de 800 produtos também corta | alvos com `candidatos=nenhum` mesmo forçando `productIds` | `src/lib/messaging/group-rules.ts` (gatilho CUPOM por promoção Prime) | corrigido: promoção Prime confirmada é motivo de entrada |
| M4 | Frescor de preço da Amazon (60 min, `AMAZON_DETECT_MAX_AGE_MIN`): ofertas com 11 a 25 h de idade são descartadas; a queda do Chrome agravou | ofertas dos alvos com última leitura de 11 a 25 h | loop de coleta e `confirmarItens` | mitigado: a confirmação na página do item renova `last_price_confirmed_at` sem mudar o preço. Frescor do loop segue dependendo do Chrome |
| M5 | `guardNetwork` barra toda mensagem de cupom da Amazon | 0 mensagens CUPOM da Amazon em 14 dias | `src/lib/messaging/group-messages.ts` | liberado só para `exclusivePrime`; Amazon sem a marca continua barrada (testado) |
| M6 | A agulha barra público restrito ("assinantes") | motivo `publico_restrito` | `src/lib/coupons/agulha.ts` | liberado só com `permitirPrimeNaFinalizacao` e preço final conferido contra os 25% |
| M7 | Lançamentos novos (ASIN B0H…) não existem no catálogo | Granblue Endless Ragnarok, LEGO Batman, Octopath 0: sem master | `descobrirPelaPromocao` em `src/server/collector/amazon-vitrine.ts` | corrigido, atrás de `PROMO_DESCOBERTA`; entra por revisão (master) e rascunho (oferta) |

## Regra de decisão implantada
Promoção Amazon com restrição única `prime`, mínimo de 1 item, 0 < pct ≤ 70, validade futura e categoria mapeada (games) = **promoção Prime na finalização**. O preço derivado é `preço de prateleira − pct`, só vale depois da confirmação na página do item (120 min). Daí: (1) front: item sobe pela queda derivada, mostra "Exclusivo Prime" e o preço de prateleira riscado, nunca ganha selo nem entra na média; (2) mensagem CUPOM da Amazon com "Exclusivo Prime", sem "% OFF", carimbo "sujeito a alteração", cota própria 2 por hora e 8 por dia (`GROUP_PROMO_PRIME_POR_HORA/DIA`); (3) descoberta dos lançamentos pela vitrine.

## Flags (todas desligadas em produção)
`PROMO_PRIME_DERIVADA`, `PROMO_DESCOBERTA`, `GROUP_PROMO_PRIME`. Sem elas o comportamento é idêntico ao de antes (testado).

## Testes
`npx tsx --conditions=react-server scripts/test-promo-prime.ts`: 37 de 37. `tsc` limpo.

## Dry-run da descoberta
Granblue Fantasy Relink Endless Ragnarok (B0H2NCHDPH, R$ 307,90): 1 master novo (revisão) + 1 oferta em rascunho, 0 erros, nada gravado. LEGO Batman e Octopath 0: o ASIN só chega pela leitura da promoção no Chrome (não consta no banco); o mesmo caminho os cria.

## Reinjeção de loop (necessária para ligar)
`public/loops/amazon-promocoes.js` (~linha 43) envia só o cabeçalho para títulos /seguir|prime/, então os cartões da promoção Prime não são lidos. Ajustar para ler os cartões quando o título casar `prime` e reinjetar `__promo` na aba da Amazon.
