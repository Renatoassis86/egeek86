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
