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
