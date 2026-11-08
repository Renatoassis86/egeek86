# Linha de base gamer (2026-11-08)

Congelada ANTES das verticais (migração 0027), por `scripts/congelar-linha-base-gamer.ts`. Somente leitura (transação READ ONLY). Arquivo: `docs/linha-base-gamer-2026-11-08.json`. O JSON não tem horário de coleta de propósito (a geração é determinística: duas execuções seguidas produziram diff vazio).

## Como recomparar depois da migração
```
npx tsx --conditions=react-server --env-file=.env.local scripts/congelar-linha-base-gamer.ts <depois>.json
diff docs/linha-base-gamer-2026-11-08.json <depois>.json
```
(ou `npm run baseline:gamer`, que grava por cima do padrão; passe um caminho novo para não sobrescrever a base). Leia o diff pela etiqueta `estabilidade` de cada campo:

| Etiqueta | Regra | Campos |
|---|---|---|
| `estavel` | Deve ser IDÊNTICO (diferença zero). Só muda se alguém cadastrar master novo; nesse caso explicar. | masters por `product_type` e por veredito do porteiro, mesclados, masters visíveis pelo porteiro, URLs fixas e de notícia, `dia_min`, eventos `reconstructed` |
| `append` | Só cresce (histórico append-only). Comparar como piso: depois >= antes. | cotações plausíveis, `price_daily_state` (linhas, fechadas, `dia_max`), `price_min_events` (total/live), histórico e menor histórico da amostra |
| `volatil` | Muda sozinho com a coleta ao vivo. Comparar por ordem de grandeza/tolerância, nunca por igualdade. | ofertas por rede e status, `public_offers`, URLs de oferta do sitemap, somas do `price_daily_state`, preço do momento (mínimo e média) da amostra |

## O que É comparável (igualdade exata)
- Contagem de masters por `product_type` (accessory 2021, console 471, game 4060) e por veredito do porteiro. Obs.: a ata registrou game 4059; o cadastro ao vivo já criou 1 master. Se o total gamer diferir, confira se houve cadastro novo antes de culpar a migração.
- Hash dos dias FECHADOS do `price_daily_state`: dias fechados são congelados, mas o hash completo só coincide se nenhum dia novo fechou. Para recomparar, recalcule o mesmo hash restrito a `day <= dia_max_fechado` (2026-11-07) desta base; esse recorte deve ser igual.
- Os 20 ids da amostra devem continuar existindo e visíveis; histórico (cotações, menor histórico) de cada um não pode diminuir.

## O que NÃO é comparável por igualdade (seja honesto no QA)
- Mínimo e média do momento dos 20 masters, ofertas ativas, `public_offers` (7.852 ofertas / 1.664 masters na base): variam a cada ciclo de coleta. Use como ordem de grandeza (ex.: variação > 5 % em `public_offers` logo após a migração merece investigação) e, para prova forte, congele a base e a pós-migração em janela curta com a coleta pausada, ou compare o SQL textual das CTEs (`test:vertical`).
- A seleção dos 20 masters pode trocar se uma oferta expirar (critério: `ORDER BY id`, >= 3 ofertas ativas, porteiro visível).
- Sitemap: o número gravado é o de masters/ofertas elegíveis pela MESMA query do `src/app/sitemap.ts`, SEM o `LIMIT 5000` e SEM o filtro em TypeScript `getDimensionOverrides().hidden` (não reproduzível sem rodar a aplicação). Não é a contagem exata de URLs servidas.
- `master_products` não tem coluna `status`; o "status" usado é o veredito do porteiro (`attributes.catalogGate.verdict`).

## Testes relacionados
`npm run test:gate`, `npm run test:dimensions` (verdes), `npm run test:vertical` (estado final; falha até a allow-list existir).
