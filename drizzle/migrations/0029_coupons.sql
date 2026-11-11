-- Sistema de cupons lidos nos portais (2026-11-10). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0028). Aplicar so com aprovacao do dono, com backup antes (as tabelas sao novas; backup so do que ja existir).
-- Ata: docs/conselho/atas/2026-11-10-mensagens-24h-cupons-storytelling-cobertura.md (secao 3). Doc: docs/cupons-2026-11-10.md.
-- ADITIVA: 2 tabelas novas com prefixo coupon_. NAO toca em `coupons` (cupom da casa), `affiliate_coupons` (usada por
-- src/server/queries/offer-page-data.ts) nem em nenhuma oferta/cotacao/produto. Sem FK para tabelas existentes de proposito
-- (nao trava fusao/arquivamento de masters/ofertas). Rollback: 0029_coupons.rollback.sql.
-- Regra de ouro: nada aqui e inventado. Cada cupom nasce de uma LEITURA (coupon_reads) com URL, texto bruto e data/hora.

SET LOCAL lock_timeout = '5s';

-- 1) O cupom (estado atual). Quem decide o estado e o SERVIDOR (rotina de ingestao), nunca o laço da aba.
CREATE TABLE IF NOT EXISTS coupon_items (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  network_slug             text        NOT NULL,                       -- 'mercado-livre' | 'shopee' | 'amazon'
  code                     text,                                       -- NULL = cupom sem codigo (ativar na pagina / automatico)
  kind                     text        NOT NULL,                       -- percentual | valor_fixo | frete | cashback | vale
  value_num                numeric(12,2),                              -- numero LIDO (10 = 10 % ou R$ 10,00, conforme value_unit); NULL se a pagina nao traz
  value_unit               text,                                       -- 'percentual' | 'reais' | NULL
  min_order_cents          bigint,                                     -- minimo de compra lido
  max_discount_cents       bigint,                                     -- teto de desconto/cashback lido
  conditions_raw           text        NOT NULL,                       -- TEXTO BRUTO da condicao, como a pagina mostra
  conditions               jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- campos estruturados lidos (so o que a pagina traz)
  audience                 text        NOT NULL DEFAULT 'todos',       -- todos | assinantes | primeira_compra | cartao | conta | outro
  audience_text            text,                                       -- texto literal do publico (ex.: "assinantes Meli+")
  eligible_on_read_account boolean,                                    -- na leitura, o cupom aparecia como aplicavel a conta lida? NULL = nao informado
  read_account             text,                                       -- rotulo curto da conta usada na leitura ('principal' | 'secundaria'); nunca dado pessoal
  scope_kind               text        NOT NULL,                       -- loja_inteira | categoria | produto | lista_itens
  scope                    jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {categorias:[], vendedores:[], item_ids:[], urls:[], offer_ids:[], master_product_ids:[]}
  source_url               text        NOT NULL,                       -- URL da pagina onde foi lido
  source_kind              text        NOT NULL,                       -- portal_listagem | pagina_do_item | api
  raw_text                 text        NOT NULL,                       -- trecho/texto bruto da pagina (ate 4000 caracteres)
  valid_from               timestamptz,                                -- inicio da validade lido (NULL = a pagina nao traz)
  valid_until              timestamptz,                                -- fim da validade lido (NULL = a pagina nao traz; entao validity_source = 'ausente')
  validity_source          text        NOT NULL,                       -- texto_da_pagina | contagem_regressiva | ausente
  validity_raw             text,                                       -- texto literal do prazo
  state                    text        NOT NULL DEFAULT 'nao_verificado',
  state_reason             text,                                       -- por que o estado atual (curto)
  first_seen_at            timestamptz NOT NULL,                       -- 1a leitura do cupom
  streak_started_at        timestamptz NOT NULL,                       -- inicio da sequencia atual de leituras (reinicia se o cupom sumiu e voltou)
  last_seen_at             timestamptz NOT NULL,                       -- ultima leitura em que apareceu
  verified_at              timestamptz,                                -- ultima leitura que sustenta o estado 'verificado' (regra das 2 h usa isto)
  verified_by              text,                                       -- rotina que verificou ('cupons-assistida')
  last_page_price_cents    bigint,                                     -- preco com cupom que a PROPRIA loja exibiu, se exibiu
  dedup_hash               text        NOT NULL,                       -- sha256 do conteudo normalizado (rede+codigo+tipo+valor+minimo+teto+escopo+publico+condicao)
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_items_network_chk   CHECK (network_slug IN ('mercado-livre', 'shopee', 'amazon')),
  CONSTRAINT coupon_items_kind_chk      CHECK (kind IN ('percentual', 'valor_fixo', 'frete', 'cashback', 'vale')),
  CONSTRAINT coupon_items_unit_chk      CHECK (value_unit IS NULL OR value_unit IN ('percentual', 'reais')),
  CONSTRAINT coupon_items_audience_chk  CHECK (audience IN ('todos', 'assinantes', 'primeira_compra', 'cartao', 'conta', 'outro')),
  CONSTRAINT coupon_items_scope_chk     CHECK (scope_kind IN ('loja_inteira', 'categoria', 'produto', 'lista_itens')),
  CONSTRAINT coupon_items_srckind_chk   CHECK (source_kind IN ('portal_listagem', 'pagina_do_item', 'api')),
  CONSTRAINT coupon_items_validity_chk  CHECK (validity_source IN ('texto_da_pagina', 'contagem_regressiva', 'ausente')),
  CONSTRAINT coupon_items_state_chk     CHECK (state IN ('nao_verificado', 'verificado', 'vencido', 'invalido')),
  CONSTRAINT coupon_items_valid_src_chk CHECK ((valid_until IS NULL) = (validity_source = 'ausente')),
  CONSTRAINT coupon_items_verified_chk  CHECK (state <> 'verificado' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)),
  CONSTRAINT coupon_items_url_chk       CHECK (source_url ~ '^https://'),
  CONSTRAINT coupon_items_dedup_uq      UNIQUE (network_slug, dedup_hash)
);
CREATE INDEX IF NOT EXISTS coupon_items_net_state_idx   ON coupon_items (network_slug, state, verified_at DESC);
CREATE INDEX IF NOT EXISTS coupon_items_source_idx      ON coupon_items (network_slug, source_url) WHERE state IN ('nao_verificado', 'verificado');
CREATE INDEX IF NOT EXISTS coupon_items_valid_until_idx ON coupon_items (valid_until) WHERE state IN ('nao_verificado', 'verificado');

-- 2) Evidencia: UMA linha por leitura (append-only). Prova a vigencia: sem leitura recente, o cupom nao entra em mensagem.
CREATE TABLE IF NOT EXISTS coupon_reads (
  id                      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coupon_id               uuid        NOT NULL REFERENCES coupon_items(id) ON DELETE CASCADE,
  read_at                 timestamptz NOT NULL,                        -- quando a aba leu (lidos_em), nao quando o servidor recebeu
  received_at             timestamptz NOT NULL DEFAULT now(),
  source_url              text        NOT NULL,
  state_seen              text        NOT NULL,                        -- 'visto' | 'ausente' (releitura completa em que o cupom nao apareceu)
  evidence_hash           text        NOT NULL,                        -- sha256 do texto bruto lido
  page_price_cents        bigint,                                      -- preco com cupom exibido pela loja, quando exibiu
  state_after             text        NOT NULL,                        -- estado do cupom depois desta leitura
  CONSTRAINT coupon_reads_seen_chk  CHECK (state_seen IN ('visto', 'ausente')),
  CONSTRAINT coupon_reads_state_chk CHECK (state_after IN ('nao_verificado', 'verificado', 'vencido', 'invalido'))
);
CREATE INDEX IF NOT EXISTS coupon_reads_coupon_idx ON coupon_reads (coupon_id, read_at DESC);
CREATE INDEX IF NOT EXISTS coupon_reads_read_at_idx ON coupon_reads (read_at);   -- retencao de 90 dias (limpeza futura, nao automatica aqui)

-- Mesmo padrao de seguranca da 0019/0022/0024/0025/0028: RLS ligado e sem acesso para anon/authenticated (so o servidor, via DATABASE_URL).
ALTER TABLE coupon_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE coupon_items FROM anon, authenticated;
ALTER TABLE coupon_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE coupon_reads FROM anon, authenticated;
