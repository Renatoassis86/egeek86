-- 0064: candidatos de cupom de PLATAFORMA vindos de pistas da comunidade (R-79). Aditiva; nada existente e tocado.
-- Pista nunca e fonte de verdade: o candidato so vira cupom divulgavel depois de validado na loja (aba logada) e de passar pelo cofre (R-64).
-- Nao guarda texto do post, foto nem link de afiliado alheio: so codigo, valor, minimo, limite, loja e quais fontes (handle) viram o codigo.
CREATE TABLE IF NOT EXISTS cupom_candidato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rede text NOT NULL,
  codigo text NOT NULL,
  valor_tipo text CHECK (valor_tipo IN ('reais','percentual')),
  valor_num numeric,
  minimo_cents bigint,
  limite_cents bigint,
  escopo_dito text,                 -- todo_o_site | categoria | selecionados | produto | desconhecido (o que o POST disse; nao prova nada)
  validade_dita timestamptz,        -- so se a fonte disse; a que vale e a lida na loja
  fontes text[] NOT NULL DEFAULT '{}',
  contagem_fontes int NOT NULL DEFAULT 1,
  primeira_vez_visto timestamptz NOT NULL DEFAULT now(),
  ultima_vez_visto timestamptz NOT NULL DEFAULT now(),
  esgotado_visto_em timestamptz,
  estado text NOT NULL DEFAULT 'candidato' CHECK (estado IN ('candidato','em_conferencia','validado','invalido','expirado','descartado')),
  motivo_estado text,
  tentativas int NOT NULL DEFAULT 0,
  conferido_em timestamptz,
  prova_tipo text,                  -- lista_oficial_de_cupons | simulacao_de_checkout | modal_oficial_do_item
  lido_na_loja jsonb,               -- o que a LOJA mostrou (nome, valor, minimo, limite, validade, escopo): vale este, nunca o do post
  coupon_item_id uuid,              -- vinculo ao coupon_items quando entrou no pipeline
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rede, codigo)
);
CREATE INDEX IF NOT EXISTS cupom_candidato_estado_idx ON cupom_candidato (estado, ultima_vez_visto DESC);

-- Controle de gentileza: uma linha por canal/pagina; a coleta so roda se ultimo_acesso_em tem >= 10 min.
CREATE TABLE IF NOT EXISTS cupom_pista_fonte (
  fonte text PRIMARY KEY,
  ultimo_acesso_em timestamptz,
  ultimo_status int,
  pausada_ate timestamptz,
  falhas_seguidas int NOT NULL DEFAULT 0,
  posts_lidos int NOT NULL DEFAULT 0,
  codigos_extraidos int NOT NULL DEFAULT 0
);
