-- Campanhas oficiais da Shopee (2026-11-11). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0033).
-- Fonte: API oficial de afiliados (shopeeOfferV2): offerName, offerType, offerLink (s.shopee.com.br), commissionRate, periodo.
-- ADITIVA: 1 tabela nova, sem FK e sem tocar em nenhuma tabela existente. Rollback: 0034_shopee_campaigns.rollback.sql.
-- A campanha so serve para a mensagem dizer ONDE resgatar cupons/ofertas; nenhum valor de cupom e gravado ou prometido.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS shopee_campaigns (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_link          text        NOT NULL,                        -- link oficial de afiliado da campanha (https)
  offer_name          text        NOT NULL,                        -- ex.: 'Gaming & Consoles'
  offer_type          integer,                                     -- offerType da API (campanha/colecao), como veio
  category_id         text,                                        -- categoryId da API, se a API devolver
  collection_id       text,                                        -- collectionId da API, se a API devolver
  commission_rate_raw text,                                        -- commissionRate como veio (nao convertido)
  period_start        timestamptz,
  period_end          timestamptz,                                 -- sem fim lido, a campanha NAO entra em mensagem
  active              boolean     NOT NULL DEFAULT true,           -- false quando some de uma leitura completa
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopee_campaigns_link_chk CHECK (offer_link ~ '^https://'),
  CONSTRAINT shopee_campaigns_link_uq  UNIQUE (offer_link)
);
CREATE INDEX IF NOT EXISTS shopee_campaigns_active_idx ON shopee_campaigns (active, period_end);

-- Mesmo padrao de seguranca da 0029: RLS ligado e sem acesso para anon/authenticated (so o servidor, via DATABASE_URL).
ALTER TABLE shopee_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE shopee_campaigns FROM anon, authenticated;
