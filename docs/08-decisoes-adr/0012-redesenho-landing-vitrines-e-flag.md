# ADR 0012: Redesenho da landing por vitrines, atrás de flag

- **Status:** proposto (aguarda decisão do dono, 2026-11-13)
- **Contexto:** ata `docs/conselho/atas/2026-11-13-reorganizacao-front.md`; proposta em `docs/redesenho-site/PROPOSTA_NOVA_VERSAO.md`.

## Decisão proposta
1. A landing passa de 14 para 9 sessões, com um único componente `VitrineOfertas` e loaders de snapshot persistido com teto de tempo (R-49). Vitrine com menos de 4 itens elegíveis desaparece; nunca se preenche com item fraco.
2. Elegibilidade pública única: produto novo e em linha; piso de 5 ofertas e 14 dias para qualquer posição contra a média; queda acima de 50% fora de vitrine; oferta "acima do normal" nunca complementa vitrine; sem acessório com nome de jogo.
3. Plus sem selo nem média até 27/11 (R-36); só menor preço, loja e horário.
4. O redesenho entra atrás da flag `REDESENHO_HOME` (percentual), com a home atual como fallback e rollback sem deploy; congelamento de 25 a 28/11.
5. Gráfico: `price-chart-v2` (SVG próprio) é o único componente alvo, com troca condicionada à paridade da fila #14; `lightweight-charts` sai depois.

## Consequências
Mais consultas de vitrine (mitigadas por snapshot); a leitura pública da média continua por cotação até a migração para oferta-dia (decisão D3 e emenda do AGENTS.md); novos testes `test:front-regras`.
