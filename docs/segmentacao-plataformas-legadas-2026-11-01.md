# Plataformas legadas fora do enum (F-16)

Data: 2026-11-01. Origem: `docs/auditoria-cowork-2026-11-01.md` (F-16) e parecer do guardião do catálogo. Nada aqui foi aplicado no banco.

## O que já foi feito na leitura (sem migration)

- `src/lib/catalog/platform.ts` (`readPlatform`): plataforma do banco manda; se for `unknown`, deriva do título (`derivePlatformFromTitle` mais "Xbox X|S" sem "One"); se ainda for `unknown` e o título cita plataforma legada, devolve só um rótulo de exibição (Wii, Wii U, 3DS, DS, PS1, PS2, PS3, PSP, PS Vita, SNES, NES, N64, GameCube, Game Boy, Mega Drive, Dreamcast).
- A busca e o autocomplete (`src/server/queries/search-products.ts`) usam essa leitura. O card mostra o rótulo legado no lugar de "Produto". Nada é gravado.
- Limite: o rótulo legado NÃO filtra. Os filtros e facets de plataforma trabalham com o enum, então esses jogos continuam fora de qualquer chip de plataforma.

## O que exigiria migration

O enum `game_platform_gen` (`src/db/schema/_enums.ts`) tem `switch_1`, `switch_2`, `ps4`, `ps5`, `xbox_one`, `xbox_series`, `xbox_360` e `unknown`. Faltam, para filtrar e agrupar:

| Plataforma | Valor sugerido |
|---|---|
| Wii | `wii` |
| Wii U | `wii_u` |
| Nintendo DS | `ds` |
| Nintendo 3DS | `3ds` |
| PlayStation 2 | `ps2` |
| PlayStation 3 | `ps3` |
| PSP | `psp` |
| PS Vita | `vita` |
| SNES | `snes` |
| N64 | `n64` |
| Game Boy Advance | `gba` |

Passos que a migration pediria (nenhum foi criado):

1. `ALTER TYPE game_platform_gen ADD VALUE ...` para cada valor. É irreversível e o Drizzle precisa do enum atualizado em `_enums.ts`.
2. Atualizar os mapas e listas que assumem o enum fechado: `GAME_PLATFORM_GEN_LABELS` (`src/lib/affiliate/labels.ts`), `PLATFORM_VALUES` e `extractPlatforms` da busca, `PLATFORM_SHORT` (`src/components/search/platform-short.ts`), filtros da tabela de preços e `derivePlatformFromTitle` (`src/lib/affiliate/game-classification.ts`).
3. UPDATE dos masters `unknown` cuja plataforma o título resolve (parecer do guardião: 51 a 57 masters). Dry-run primeiro, transação única, log por id. A aba Consoles também tem consoles retrô gravados com plataforma errada (PS2, PS3, PSP e Vita como `ps4`; NES Classic como `switch_2`): entram no mesmo UPDATE.
4. Alternativa sem alterar o enum: guardar `attributes.legacyPlatform` no master. Serve para exibir e filtrar por texto, mas não entra em índice nem em chip tipado.

## Decisão pendente do responsável

A cartela inclui plataformas retrô? Hoje o acessório exige plataforma de console no título e o filtro público da tabela só lista as gerações atuais. Sem essa decisão a migration não deve sair. A regra "só item novo" (2026-07-24) pode esvaziar a categoria, porque quase toda oferta retrô é usada.
