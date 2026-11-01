# Segmentação do catálogo por dimensão — 2026-10-31

Camada de LEITURA aplicada no código. Nenhum UPDATE/DELETE/INSERT foi executado. Decisões de base: pedido do dono e ata do Conselho Geek (`docs/conselho/atas/2026-10-31-cartela-segmentacao-fotos.md`).

## 1. Cartela (regra única)

Fonte única: `src/lib/catalog/dimensions.ts` (`classifyCatalogItem`, `effectiveCatalogType`, `PUBLIC_PRODUCT_TYPES`, `VERTICALS`). Ponte SQL: `src/server/queries/catalog-dimensions.ts` (`catalogDimensionFilter`, `catalogHiddenFilter`).

| Dimensão | Entra na vitrine | Observação |
|---|---|---|
| game (rank 0) | sim | mídia física; edição de colecionador COM disco é jogo; lote de jogos = jogo com flag `bundle` |
| console (rank 1) | sim | o aparelho; console+jogo = aba Consoles com flag `bundle` (selo "Bundle") |
| accessory (rank 2) | sim | só uso no jogo E com plataforma de console no título |
| merchandise / part / off_catalog | não | escondidos de busca, autocomplete, chips, home, ranking, monitoramento, tabela e contadores; permanecem no banco com `reason_code` |

Precedência: fora-da-cartela > console como item principal > acessório > jogo. Classificador por título só corrige a vitrine; nunca promove acessório/console a jogo e nunca usa plataforma `unknown` como critério. Extensível: nova vertical (tecnologia, eletro) entra em `VERTICALS`/`DIMENSIONS`.

Códigos de ocultação (`reason_code`): chaveiro, action_figure, pelucia, vestuario, caneca_copo, poster_quadro, decoracao, cartas_baralho, livro_artbook, brinde_diverso, brinde_bonus, kit_sem_plataforma, volume_sem_plataforma, colecionavel_sem_midia (merchandise); reparo_reposicao, condutiva_flat, analogico, analogico_3d, botao_gatilho, embalagem_vazia, carcaca_faceplate (peça); mobiliario, periferico_pc, audio_video_foto, outros_ramos, filme_em_disco, usado, clone_generico, digital_codigo, dlc_isolado, acessorio_sem_plataforma (fora da cartela).

Superfícies cobertas: `search-products.ts` (abas, facets, didYouMean, autocomplete, índice em memória), `home-search.ts` (chips, populares, totais), `price-table.ts`, `affiliate.ts` (`listRankedOffers`, `getFeaturedOffers`, `getPlatformStats`), `price-watches.ts` (busca de monitoramento). Removido o filtro ILIKE por palavras ('zelda', 'mario'...) de `listRankedOffers` (escondia console de edição Zelda legítimo). `SearchProduct.isBundle` novo.

## 2. Contagens (SELECT somente leitura, `scripts/audit-segmentacao.ts`)

Catálogo vivo: 4845 masters (sem mesclados). Com oferta pública (ADR 0002):

| Aba | Antes (tipo do banco) | Depois (dimensão efetiva) |
|---|---|---|
| Jogos | 563 | 460 |
| Consoles | 40 | 44 |
| Acessórios | 124 | 105 |
| Fora da cartela (escondidos) | 0 | 118 (merchandise 16, peça 20, fora 82) |
| Total público | 727 | 609 (home `totals.products` 609) |

Dos 118 escondidos com oferta pública: 67 digital/código, 3 DLC/add-on, 48 demais (pôster, mangá, figura, brinde, kit fã, peça de reparo, cadeira, teclado/mouse, filme em Blu-ray, acessório sem plataforma 2, etc.). Movidos de aba (com oferta pública): 22 (game→console 5, game→acessório 10, console→acessório 4, acessório→console 3).

Catálogo inteiro (inclui sem oferta): 734 a esconder, 245 a mover (game→console 105, game→acessório 92, console→acessório 30, acessório→console 18).

Validação SQL x TS: o predicado `catalogDimensionFilter` devolve exatamente a mesma contagem que a regra em TS (game 2531, console 451, accessory 1129; qualquer aba pública 4111).

Buscas reais (código real, `searchProductsUncached`), depois:

| Termo | Jogos | Consoles | Acessórios |
|---|---|---|---|
| zelda | 2 (só jogos) | 1 (console Switch OLED) | 2 (controles) |
| switch | 256 | 14 | 19 |
| controle | 0 | 4 (console "com controle") | 77 |
| resident evil | 9 | 0 | 0 |

Nenhuma aba traz pôster, figura, peça, digital, cadeira ou teclado. Chips de plataforma da home contam só jogos (ex.: Switch 1 257, PS5 64).

## 3. Teste de tabela

`npx tsx scripts/test-dimensions.ts`: 100 títulos reais (48 ocultos, 21 movidos, 31 jogos legítimos com Kit/Bundle/Deluxe/Collector/Steelbook/Control/Poison Control/Book of Demons/Labo). Resultado atual: 0 falhas. Recall de ocultos na amostra: 100% (os casos foram escritos a partir do catálogo real; auditoria amostral n=250 independente segue pendente, passo 7 do plano da ata).

## 4. Revisão do dono (CSV)

- `docs/segmentacao-catalogo-2026-10-31-ocultos.csv`: 734 masters a esconder (id, nome, tipo atual, destino, reason_code, ofertas públicas).
- `docs/segmentacao-catalogo-2026-10-31-movidos.csv`: 245 masters que mudam de aba.
Ordenados por ofertas públicas (o que o usuário vê hoje vem primeiro).

## 5. Plano de correção de dados (NÃO executado; precisa de aprovação)

1. Backup: `CREATE TABLE backup_master_products_20261031 AS SELECT id, product_type, attributes, updated_at FROM master_products WHERE id IN (<ids dos CSVs>);` (reversível: o tipo anterior fica por id).
2. Movidos (enum já suporta): `UPDATE master_products SET product_type = <destino>, updated_at = now() WHERE id = ANY(<ids do CSV movidos>)` em transação, com contagem esperada 245. Primeiro só os 22 com oferta pública / 21 inequívocos, depois o resto.
3. Ocultos: o enum só tem game/console/accessory. Opção A (recomendada, sem migration): gravar `attributes = attributes || '{"catalogDimension":"<destino>","reasonCode":"<code>"}'`; opção B: migration `ALTER TYPE product_type ADD VALUE` ('merchandise','part','off_catalog'). Em ambas nada é apagado e o histórico de preços fica intacto.
4. Depois: rodar `scripts/dry-run-dup-report.ts` (mudar tipo pode revelar duplicata título+plataforma), `revalidateTag('affiliate-offers')`, repetir `scripts/audit-segmentacao.ts` (esperado: abas do banco = abas efetivas).
5. Auditoria amostral n=250 após publicar.

## 6. Decisões pendentes / riscos

- Bundle: o selo e a flag existem na busca (`isBundle`); a EXCLUSÃO da média/menor preço do console puro ainda não foi feita em `product-price-stats.ts` (cada bundle é um master próprio, então a média por master já os separa; confirmar se o dono quer um agregado "console puro" por modelo).
- Digital/código fica fora (67 produtos públicos, 11% do catálogo público): confirma a decisão de esconder "(Digital)" mesmo quando o usuário busca o jogo.
- Curadoria da ata: PlayStation Portal (hoje acessório), Virtual Boy (hoje acessório), amiibo/steelbook sem jogo (fora), cadeira/teclado (fora, Tecnologia futura), "Xbox ... Edição Forza Horizon" controle/headset/dock (hoje acessório).
- Acessório exige plataforma de console no título (PC/Steam não bastam): oculta 163 acessórios genéricos, 2 públicos (ex.: "Headset gamer ... inova").
- Casos ambíguos mantidos como estão: "Videogame Resident Evil 2 Console Xbox One" (jogo), "Jam pack Volume 11 PLAYSTATION 2" (tipado console, é jogo; não corrigível por título), pré-venda com bônus tipada como console (STALKER 2, Arcyon).
- Autocomplete sem aba (`/api/search`, em `src/app`, fora do meu escopo) cai em console+acessório quando não há jogo; para "controle" a preferência jogo>console>acessório põe consoles com controle antes de controles. A rota/UI deve passar `types` por aba e a busca por acessório deveria priorizar a dimensão citada (pesos W do matemático são hipótese).
- Falsos positivos possíveis do classificador: títulos de jogo com palavras como "Dock", "Controller", "Cabo" no nome sem sinal de mídia antes; o teste de tabela cobre Control/Poison Control/Book of Demons/Labo. Rodar `scripts/test-dimensions.ts` a cada mudança de regra.
