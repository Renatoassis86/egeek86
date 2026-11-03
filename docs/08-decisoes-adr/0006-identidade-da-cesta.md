# ADR 0006: Identidade da cesta (separar tudo, juntar só o idêntico)

Data: 2026-11-03. Status: código da etapa 1 pronto, sem dado alterado; etapa 2 (gravar) aguarda aprovação do dono.

## Contexto
A auditoria de pureza (2026-11-03) achou 20% de masters suspeitos e 10 contaminados. Região, capacidade, Series S/X, Open Box e cross-gen não separavam; numeral/ano/romano eram tratados diferente no dedup e no relink; a oferta não era rechecada depois de ligada ao master.

## Decisão
1. Identidade = marcadores + numeral unificado + geração + capacidade + variante + código de modelo, em `compareIdentity`; `isSameProduct`, `findExistingMasterProduct`, `analyzeDuplicates` e o relink usam o mesmo motor.
2. Cor comum junta; edição limitada, região, relançamento, geração, condição separam. Cross-gen: um produto por geração; anúncio com duas gerações = revisão.
3. Oferta em revisão (Open Box, usado, cross-gen, divergente) sai de todos os indicadores (SQL `offerIdentityVisibleSql`).
4. Coleta ML lê o título original do anúncio (API oficial) e liga como `draft` quando diverge.

## Proposta de migration (NÃO aplicada)
```sql
ALTER TABLE affiliate_offers
  ADD COLUMN seller_title text,
  ADD COLUMN identity_state text NOT NULL DEFAULT 'ok' CHECK (identity_state IN ('ok','review','open_box','used')),
  ADD COLUMN identity_reason text,
  ADD COLUMN identity_checked_at timestamptz;
CREATE INDEX affiliate_offers_identity_review_idx ON affiliate_offers (identity_state) WHERE identity_state <> 'ok';
-- Reversão
DROP INDEX IF EXISTS affiliate_offers_identity_review_idx;
ALTER TABLE affiliate_offers DROP COLUMN identity_checked_at, DROP COLUMN identity_reason, DROP COLUMN identity_state, DROP COLUMN seller_title;
```
Com a coluna, `offerIdentityVisibleSql` passa a ler `identity_state` (sem regex) e a coleta grava o título original e o estado, em vez de usar `draft`.

## Etapa 2 (só com aprovação): backup NDJSON de offers/masters afetados em backup/dados, log reversível (offer_id, status e master antigos), gravar veredito `catalogGate` em masters cross-gen, mover ofertas com destino único idêntico, fundir duplicatas idênticas (merge-duplicate-masters), desfazer pelo log.

## Consequências
- Cestas menores e mais puras; masters cross-gen e com Remake omitido somem da vitrine até triagem.
- Quebra de série em médias de masters afetados (mediana muda >10% em poucos).

## Emenda de 2026-11-03: Remake (decisão adotada por delegação, reversível)
- Regra §11 mantida: Remake/Remaster separa do original **quando o original existe na MESMA plataforma** (RE4 Remake x RE4 de PS4/PS5, Final Fantasy VII Remake x original continuam separados).
- Exceção explícita e curta (`CANONICAL_REMAKE_CORES` em `dedup.ts`): Resident Evil 2 e 3 em PS4/PS5. O original é de PS1; em PS4/PS5 o único RE2/RE3 vendido é o remake, com ou sem a palavra no anúncio. Separar criaria dois masters para o mesmo produto físico e violaria "um jogo, uma média".
- Aplicação ao RE3 PS5: as 12 ofertas de RE3 que a etapa 2 deixou ativas (11 ativas e 1 expirada) já estavam no master certo `6813e83f` ("Resident Evil 3 Ps5 Midia Fisica"); as 2 restantes das 14 do CSV são de outros jogos. Com o motor corrigido as 37 ofertas ativas desse master passam na identidade (0 divergentes), portanto **nenhuma oferta precisou ser movida**. O master duplicado vazio `d0c7e9ee` ("Resident evil 3 Remake Em português Ps5") foi fundido ao canônico (log abaixo).
- Ruído do motor corrigido: "formato" entra no ruído comercial ("em formato físico"); typo "thewild" vira "the wild".
- Fusão do Zelda BOTW legado: 4 masters (3ff650a6, a66ab30f, 82ccba58, c6d29ace) arquivados em `7929b6eb`; 23 ofertas reapontadas com cotações. Nenhum DELETE.
- Logs: `backup/dados/merge-log-2026-11-03T15-43-44-556Z.json`. Reverter: `npx tsx --conditions=react-server --env-file=.env.local scripts/revert-merge-masters.ts <log>`.

## Emenda de 2026-11-03: formato do jogo (mídia física x digital) é eixo de identidade (decisão do dono)
- Jogo digital e jogo físico (mesmo título, plataforma e edição) são produtos diferentes: master e média próprios. Console e acessório não têm formato.
- `NormalizedTitle.format` (`physical | digital | unknown | na`) vem de `deriveGameFormat` (prova no título) e, sem prova, do `game_format` gravado (`NormalizeOptions.gameFormat`). `compareIdentity` ganha a divergência dura `formato`; `isSameProduct`, `findExistingMasterProduct` (opção `gameFormat`), `analyzeDuplicates` (classe de formato = a efetiva, não só o marcador "digital") e `evaluateOfferIdentity` (razão nova `formato_desconhecido`) herdam. O marcador "digital" deixa de existir para jogo (continua em console: modelo).
- Formato desconhecido não se mistura com nenhum: master de jogo sem formato provado fica fora das médias. Espelho SQL: `offerExcludedTitleSql(..., masterFormatCol)` exclui (a) oferta de master `game_format = unknown`, (b) título que prova digital em master físico, (c) título que prova físico em master digital. Sem migration: usa a coluna `game_format` que já existia.
- Coleta e cadastro (ML, Magalu, Shopee, admin) gravam `game_format = resolveGameFormat(título, atributo)` e passam o formato à checagem de duplicata.
- Porteiro (ADR 0005) reconciliado: o digital já era rejeitado do escopo público (decisão D1, 2026-10-31); isso NÃO muda. `classifyCatalogItem` passa a usar a mesma prova de formato (eShop, download, key, licença além de "(Digital)", código e PSN). O master digital é criado separado e nasce com `catalogGate` rejeitado (invisível), de modo que o digital nunca contamina o físico mesmo fora da vitrine.
- Dados: `scripts/separar-formato-digital-fisico.ts` (dry-run, `--apply`, backup <= 12 h, log) e `scripts/enriquecer-formato-ml.ts` (atributo FORMAT da API oficial); reversão `scripts/revert-separar-formato.ts <log> [--dry-run]`.
- Testes: `scripts/test-identity.ts` (seção F), `scripts/test-dimensions.ts`, `scripts/test-gate.ts`.

## Emenda de 2026-11-03: capacidade não separa o console PS5 (decisão do dono)
- Para o console PS5, 825GB, 1TB (e demais capacidades) são o MESMO produto. Continuam separando: modelo (Slim/Standard/Pro), Digital x com disco, bundle, região e edição limitada.
- Xbox, Switch, PS4 e acessórios (SSD, cartão) mantêm a capacidade como eixo de identidade.
- Código: `normalizeTitle` em `src/lib/affiliate/dedup.ts` zera `capacityGb` quando `kind === 'console'` e `platform === 'ps5'`; `compareIdentity`, `isSameProduct`, a chave de `analyzeDuplicates` e `offer-identity.ts` herdam isso. `offer-identity-sql.ts` não tinha eixo de capacidade (nada a mudar). `cleanTitle` do console PS5 deixa de conter a capacidade.
- Testes: `scripts/test-identity.ts` (PS5 825GB = 1TB; Slim x Pro; Digital x disco; PS4 500GB x 1TB; SSD 1TB x 2TB continuam separados).
- Dados: ver ata e log de fusão dos masters de console PS5 (reversível por `scripts/revert-merge-masters.ts`).
