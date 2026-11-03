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

