# ADR 0005: Porteiro do catÃ¡logo (somente originais, somente jogo/console/acessÃ³rio)

Data: 2026-11-02. Status: proposta aplicada em cÃ³digo e dado; aguarda confirmaÃ§Ã£o do dono nas decisÃµes listadas na ata `docs/conselho/atas/2026-11-02-somente-originais-e-escopo-gamer.md`. Complementa os ADR 0001 e 0002.

## Contexto
- O dono sÃ³ trabalha com itens originais e sÃ³ com jogo, console e acessÃ³rio de game. Prints mostraram PS2 fÃ­sico novo a R$ 19,90-22 (suspeita de cÃ³pia) e Lego, mantinha, playset, caderno e guias tipados como jogo.
- `classifyCatalogItem` (por tÃ­tulo) jÃ¡ escondia merchandising, peÃ§a e clones de controle, mas tratava qualquer "jogo" sem sinal contrÃ¡rio como jogo e nÃ£o tinha conceito de "original" nem de "em revisÃ£o".
- VÃ¡rios preÃ§os baixos iguais deslocam a mediana e anulam o piso de 35% do ADR 0002.

## DecisÃ£o
1. Uma funÃ§Ã£o pura, `evaluateCatalogGate` (`src/lib/catalog/gate.ts`), decide `approved | review | rejected` com categoria e motivo. Ã‰ a Ãºnica fonte, usada nas entradas (coleta, descoberta, cadastro) e nas saÃ­das (vitrine, busca, monitorar, sitemap, indicadores).
2. RejeiÃ§Ã£o sÃ³ por **identidade** (lÃ©xico de nÃ£o original e de fora do escopo; evidÃªncia positiva para jogo). **PreÃ§o nunca rejeita**: sÃ³ envia Ã  revisÃ£o.
3. Estado em `master_products.attributes.catalogGate` (sem migration), com `manual` para decisÃ£o humana. Quarentena no master; ofertas, cotaÃ§Ãµes e histÃ³rico nunca sÃ£o apagados nem alterados.
4. SaÃ­das em SQL via `NOT IN (subconsulta)` (o JOIN foi medido 10x mais lento). Item `review`/`rejected` fica fora de mÃ©dia, mediana e mÃ­nimo; a mediana de plausibilidade passa a ser calculada sem eles.
5. AplicaÃ§Ã£o ao dado por `scripts/apply-catalog-gate.ts` (dry-run padrÃ£o, backup, transaÃ§Ã£o, log reversÃ­vel).

## ConsequÃªncias
- Quebra de sÃ©rie em mÃ©dias/medianas histÃ³ricas (documentada em `docs/modelo-indicadores.md`, seÃ§Ã£o 10).
- Marca por master: oferta legÃ­tima em master com cÃ³pias fica escondida junto. EvoluÃ§Ã£o: quarentena por oferta (exige migration) e tela admin de revisÃ£o.
- CÃ³pia com tÃ­tulo limpo e preÃ§o alto nÃ£o Ã© detectÃ¡vel por texto; depende de revisÃ£o humana e de atributos do marketplace.

## Emenda de 2026-11-03: decisões 1 a 7 adotadas por delegação do dono (reversíveis)
Cada decisão foi confrontada com o código; o que faltava foi implementado em `src/lib/catalog/gate.ts` e testado em `scripts/test-gate.ts` (99 casos).
1. Usado original: **fora** (já era: `classifyCatalogItem` rejeita `usado`, coletor ML só `condition=new`). Corrigida a lacuna da condição em INGLÊS ("Used & Tested", "Pre-Owned", "Second Hand") que deixava passar o Super Mario Bros. Wonder japonês usado; cobre dimensão, identidade (`dedup.ts`) e o espelho SQL (`offer-identity-sql.ts`).
2. Bundle de console: **aba Consoles com selo Bundle e média separada** (já era: flag `bundle` e marcador `bundle` na identidade de console; testes de bundle em `test-gate.ts` e `test-dimensions.ts`).
3. Amiibo e colecionável licenciado: **fora** (já era: `action_figure`/`amiibo` em `dimensions.ts`; teste novo com Amiibo).
4. Acessório sem plataforma no título: **marca legítima conhecida vai à revisão, não à rejeição** (antes só headset). Agora qualquer acessório com fabricante conhecido (`ACCESSORY_MAKER` ou Sony/Microsoft/Nintendo) sem plataforma vai a `review` (`acessorio_marca_sem_plataforma`); marca desconhecida ou "genérico" continua rejeitada.
5. Porta-cartão: **aceito só com plataforma E fabricante de acessório conhecido** (PowerA, Hori, PDP, Nacon...); só plataforma = revisão; sem plataforma = rejeitado. Anbernic, Retroid, Powkiddy, Miyoo e similares: **rejeitados** (`hardware_emulacao_marca`; antes ficavam em revisão). Clone Tectoy continua em revisão.
6. Piso de preço: **R$ 60** para mídia física nova de plataforma legada (R$ 30 em qualquer plataforma), já em `LEGACY_PHYSICAL_PRICE_FLOOR_CENTS`; só envia à revisão, nunca rejeita.
7. Tela de revisão no admin: **construída**, somente leitura, `/admin/catalogo-revisao` (padrão visual, cantos retos). Aprovar/rejeitar segue por `attributes.catalogGate.manual` (script) até a próxima rodada.
Dado: veredito regravado em 59 masters e tipo/plataforma de 2 masters ("Saco de Armazenamento" Zelda, game para accessory); backup e log `catalog-gate-*-2026-11-03T15-46-55-820Z`. Reverter: `apply-catalog-gate.ts --revert <log>`.
Também nesta rodada (QA P2): "saco de armazenamento", "N slots de cartão" e "caixa protetora" são acessório mesmo com "Jogo"/"Console" no começo; "suporte/base vertical" e "vertical stand" sem a palavra console são acessório.
