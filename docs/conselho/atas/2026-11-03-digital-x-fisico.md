# Ata curta: jogo digital x físico são produtos diferentes (2026-11-03)

- **Porte:** médio (regra de identidade + dado reversível; sem migration, sem commit/deploy). Presidente: geek-lead. Execução: guardiao-catalogo. Verificação final: qa-verificador (a acionar pelo coordenador).
- **Decisão do dono:** o mesmo jogo (título, plataforma, edição) em mídia digital e em mídia física são produtos diferentes, cada um com master e média próprios, para não contaminar preços. Console e acessório não são afetados.

## Pareceres (da ata de pureza de 2026-11-03, reaproveitados; sem reconvocação)
- gamer-veterano: separar sempre digital x físico; ambíguo vai para quarentena, não para a média.
- guardiao-catalogo (autor): formato vira eixo de identidade em todo o motor (um só lugar: `compareIdentity`); desconhecido não se mistura com nenhum dos dois.

## Reconciliação com o porteiro (ADR 0005)
- Lido `gate.ts`, `dimensions.ts` e a ata de 2026-11-02: o digital já era **rejeitado do escopo público** por decisão D1 de 2026-10-31 (a cartela de jogos é "mídia física"; ata de segmentação: "digital/código fica fora, 67 produtos públicos"; auditoria Cowork F-04 P0). A decisão de hoje diz que digital e físico são produtos distintos; **não revoga D1**.
- Resultado: o master digital passa a existir separado e com média própria (nunca mais soma no físico), **mas continua invisível ao público** (nasce com `catalogGate` rejeitado). O porteiro foi apenas alinhado ao motor de identidade (mesma prova de formato: eShop, download, key, licença além de "(Digital)", código e PSN). Digital de console/PC/key: mesma regra, fora do escopo público. **Pendente do dono:** se quiser abrir o digital de console ao público, é um ajuste no porteiro (`dimensions.ts`, regras `digital_*`) e ele já terá média própria.

## Regras implementadas
1. Formato = prova do título (físico: físico/física, mídia física, disco, cartucho, blu-ray, steelbook, lacrado; digital: digital, mídia digital, código, key, PSN, eShop, download, chave de ativação, gift card, licença) ou, sem prova, `game_format` gravado (FORMAT do catálogo ML pela API oficial). Contraditório ou ausente = desconhecido; **nunca vira físico por padrão**. Bônus digital em jogo físico não conta; "Polyphony Digital", "Digital Devil", "Disco Elysium" são nomes, não formato.
2. Desconhecido não se mistura com físico nem digital (dedup, relink, fusão, checagem da oferta). Oferta sem prova no título herda o formato do master; oferta que prova o oposto fica em revisão; master de jogo sem formato provado fica **fora das médias** (camada SQL por `game_format`) e é listado.
3. Cadastro (ML, Magalu, Shopee, admin) grava o formato provado e o passa à checagem de duplicata.

## Dados (reversível; detalhes e números no relatório da execução)
Backup `backup-pre-fusao.mjs` antes de cada gravação; dry-run em `docs/separacao-formato-dryrun-2026-11-03.csv`; aplicado em `docs/separacao-formato-aplicado-2026-11-03.csv`; lista de formato não provado em `docs/formato-nao-provado-review-2026-11-03.csv`; logs em `backup/dados/separar-formato-log-*.json` e `enriquecer-formato-log-*.json`; reverter com `scripts/revert-separar-formato.ts <log> [--dry-run]`. Nenhuma oferta, cotação ou master apagado.

## Riscos e pendências
- Quebra de série nas médias dos masters que perdem ofertas de outro formato ou cujo formato não é provado (ver números no relatório).
- Masters de jogo sem prova de formato saem das médias até alguém provar (nome, API ou conferência); 21 têm um possível gêmeo de formato conhecido (candidatos a conferência/fusão manual).
- A API oficial do ML traz FORMAT só em parte dos catálogos (ver relatório); o título do vendedor não é legível pela API (403), então a prova por oferta é rara.

## Emenda (QA rodada 8, decisão do coordenador, reversível): físico ASSUMIDO sem marcador digital
- **Problema (P1 do QA):** o eixo de formato escondeu da busca 175 masters de jogo aprovados pelo porteiro, com `game_format='unknown'` e nenhum título provando físico nem digital (Mario Kart World, Mario Kart 8 Deluxe, Zelda TOTK Switch 2, Pokémon, EA FC, Until Dawn PS5...).
- **Regra:** como o escopo público já exclui digital (ADR 0005, D1) e título digital real traz marcador, master de jogo APROVADO pelo porteiro, vivo, com oferta ativa, `unknown`, sem marcador digital em NENHUM título (master e todas as ofertas, inclusive mistos) vira `game_format='physical'` com `attributes.formatEvidence='assumed_no_digital_marker'` (evidência FRACA, distinta de formato provado, que não tem esse atributo). Não vale para masters criados hoje (descoberta/separação), console/acessório (inclusive tipado "game") nem masters fora do porteiro.
- **Não abre a porta ao digital:** para o motor o master é físico; oferta com marcador digital (digital, código, key, PSN, eShop, download, gift card, licença) num master assumido-físico continua divergente e fora das médias (testes F4). `hasDigitalMarker` e `FORMAT_EVIDENCE_ASSUMED` em `game-classification.ts`.
- **Antes, prova real:** `enriquecer-formato-ml.ts --ids-file` nos 175: dos 21 com catálogo ML, nenhum trouxe FORMAT (0 físico, 0 digital, 0 erro); os 154 sem catálogo ML não têm de onde consultar.
- **Dados:** `scripts/assumir-fisico-sem-marcador-digital.ts` (dry-run com CSV, backup <= 12 h, REPEATABLE READ, log). Reverter: `scripts/revert-separar-formato.ts <log> [--dry-run]` (devolve `unknown` e remove `formatEvidence`).
- **Ainda fora da rotina:** Mario Kart World (Switch 2), master com ofertas que trazem marcador digital: fica `unknown` (misto), candidato a separação manual.
- **Console tipado "game":** 10 masters com oferta ativa (c2f08e2b e outros) reclassificados por `apply-catalog-gate.ts --reclass --reclass-type-ids` (as duas regras de título concordam); 3 com duplicata e o "Super Mario Party com Joy-Con" não foram trocados.
