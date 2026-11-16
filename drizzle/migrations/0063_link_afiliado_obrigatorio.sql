-- 0063: LINK DE AFILIADO OBRIGATORIO (dono, 2026-11-16; Fluxo Mestre R-70). ADITIVA: 2 tabelas, 3 funcoes e 1 trigger; nenhuma coluna existente muda.
-- Camada L2 (gravacao): toda escrita em affiliate_offers.affiliate_url/network_id/affiliate_link_pending passa pelo trigger, que
--   (1) na Amazon reescreve para a tag do dono quando falta/errada (so amazon.com.br);
--   (2) deriva affiliate_link_pending = NOT link_valido (estado 'pendente_de_link': NAO publicavel; o /go, as mensagens e as listas publicas ja o respeitam).
-- NUNCA rejeita (sem RAISE): a ingestao nao quebra com as ~1.200 ofertas ML de URL crua; elas ficam pendentes ate o loop ml-links gerar o meli.la
-- (a rota /api/ingest/ml-links grava meli.la => link valido => pendente deixa de valer sozinho).
-- Config na tabela affiliate_link_config (tag Amazon, matt_tool do ML, chave trigger_ativo): o medidor falha se divergir do ambiente (src/lib/affiliate/link-afiliado.ts).
-- Desligar sem rollback: UPDATE affiliate_link_config SET valor = '0' WHERE chave = 'trigger_ativo'. Rollback: 0063_link_afiliado_obrigatorio.rollback.sql.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS affiliate_link_config (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO affiliate_link_config (chave, valor) VALUES
  ('amazon_tag', 'manusmonteiro-20'),
  ('ml_matt_tool', '23952458'),
  ('trigger_ativo', '1')
ON CONFLICT (chave) DO NOTHING;

-- Trilha de bloqueios do porteiro de envio (L4) e do /go (L5): uma linha por mensagem/clique barrado.
CREATE TABLE IF NOT EXISTS link_afiliado_bloqueios (
  id bigserial PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL,              -- 'telegram_grupo' | 'telegram_privado' | 'painel' | 'go' | ...
  motivo text NOT NULL,
  detalhe text,                      -- resumo SEM a URL completa (host e motivo)
  url text,                          -- a URL barrada (auditoria)
  group_message_id uuid,
  offer_id uuid,
  alertado_em timestamptz
);
CREATE INDEX IF NOT EXISTS link_afiliado_bloqueios_criado_idx ON link_afiliado_bloqueios (criado_em DESC);

CREATE OR REPLACE FUNCTION affiliate_link_cfg(p_chave text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT valor FROM affiliate_link_config WHERE chave = p_chave $$;

-- Espelha ehLinkAfiliadoValido (TS). p_slug = slug da rede.
CREATE OR REPLACE FUNCTION affiliate_link_valido(p_url text, p_slug text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    CASE p_slug
      WHEN 'amazon' THEN
        p_url ~* '^https://(www[.])?amazon[.]com[.]br/'
        AND p_url ~* ('[?&]tag=' || affiliate_link_cfg('amazon_tag') || '(&|#|$)')
        AND p_url !~* ('[?&]tag=(?!' || affiliate_link_cfg('amazon_tag') || '(&|#|$))')
      WHEN 'mercado-livre' THEN
        p_url ~ '^https://meli[.]la/[A-Za-z0-9]{3,}/?$'
        OR (p_url ~* '^https://([a-z0-9-]+[.])*mercadolivre[.]com[.]br/'
            AND p_url ~* ('[?&]matt_tool=' || affiliate_link_cfg('ml_matt_tool') || '(&|#|$)')
            AND p_url !~* ('[?&]matt_tool=(?!' || affiliate_link_cfg('ml_matt_tool') || '(&|#|$))'))
      WHEN 'shopee' THEN
        p_url ~ '^https://s[.]shopee[.]com[.]br/[A-Za-z0-9]{3,}/?$'
      ELSE false
    END, false)
$$;

-- Amazon: remove qualquer tag e poe a do dono (so amazon.com.br). Outras redes: devolve a URL como veio.
CREATE OR REPLACE FUNCTION affiliate_link_normalizar(p_url text, p_slug text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE b text; f text;
BEGIN
  IF p_slug <> 'amazon' OR p_url IS NULL OR p_url !~* '^https://(www[.])?amazon[.]com[.]br/' THEN RETURN p_url; END IF;
  b := split_part(p_url, '#', 1);
  f := substr(p_url, length(b) + 1);
  b := regexp_replace(b, '[?&]tag=[^&]*', '', 'gi');
  IF position('?' IN b) = 0 AND position('&' IN b) > 0 THEN b := regexp_replace(b, '&', '?'); END IF;
  b := b || CASE WHEN position('?' IN b) > 0 THEN '&' ELSE '?' END || 'tag=' || affiliate_link_cfg('amazon_tag');
  RETURN b || f;
END $$;

CREATE OR REPLACE FUNCTION affiliate_offers_link_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE slug text; n text;
BEGIN
  IF COALESCE(affiliate_link_cfg('trigger_ativo'), '1') <> '1' THEN RETURN NEW; END IF;
  SELECT nw.slug INTO slug FROM affiliate_networks nw WHERE nw.id = NEW.network_id;
  IF slug = 'amazon' AND NOT affiliate_link_valido(NEW.affiliate_url, slug) THEN
    n := affiliate_link_normalizar(NEW.affiliate_url, slug);
    IF affiliate_link_valido(n, slug) THEN NEW.affiliate_url := n; END IF;
  END IF;
  -- Estado derivado: so e publicavel o que casa com o padrao do dono. Rede sem padrao => sempre pendente (padrao negado).
  NEW.affiliate_link_pending := NOT affiliate_link_valido(NEW.affiliate_url, COALESCE(slug, ''));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS affiliate_offers_link_trg ON affiliate_offers;
CREATE TRIGGER affiliate_offers_link_trg
  BEFORE INSERT OR UPDATE OF affiliate_url, network_id, affiliate_link_pending ON affiliate_offers
  FOR EACH ROW EXECUTE FUNCTION affiliate_offers_link_trg();
