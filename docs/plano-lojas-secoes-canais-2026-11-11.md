# Plano técnico: lojas (seções) com canal próprio

- **Data:** 2026-11-11. **Status:** PLANO. Nenhum código, banco, Vercel, Telegram ou deploy foi alterado. Chrome não usado.
> **ATUALIZAÇÃO 2026-11-11 (tarde):** a Parte II (final deste arquivo) substitui o calendário e a recomendação de esperar a Black Friday da seção 6, por decisão do dono. Games segue na via legada até haver paridade.
- **Ata:** `docs/conselho/atas/2026-11-11-lojas-secoes-canais.md`.
- Convenção: **[C]** visto no código desta sessão, **[H]** hipótese a conferir, **[R]** recomendação.

## 0. Princípio de desenho

**Qualidade global, cadência por loja.** Tudo que protege a verdade do preço fica igual para todas as lojas (gatilhos G/OK/T, faixas de risco 30/45%, frescor 30/40 min, identidade região/edição/condição, dedup, zero dado fake, uma média por produto). Só mudam por loja: canal, estado da automação, ritmo de envio (tetos, espaçamento, rodízio), aparência, marcação de publicidade e cardápio de busca. Nada de relaxar regra de preço para "encher" um canal novo: canal quieto é aceitável, dado inventado não.

Estado atual [C]: um único canal (`TELEGRAM_GROUP_CHAT_ID`), um único estado (`feature_flags.group_messages_auto`), tetos globais em `RULES` (`DAILY_CAP` 400, `HOURLY_CAP` 60, espaçamento 1 min), histórico de envio sem corte por loja, `RELEASED_VERTICALS = ['games']`, `telegramChatFor(vertical)` por variável de ambiente `TELEGRAM_GROUP_CHAT_ID_<AREA>` (sem grupo, a linha expira; nunca cai no grupo de games), falha definitiva de envio põe a automação INTEIRA em `off`.

## 1. Modelo de dados e configuração

### 1.1 Tabelas (migração 0032, aditiva)

- `store_sections` (a loja): `id`, `slug` (único), `name`, `stage` (rascunho, aguardando_canal, canal_verificado, semeando, catalogo_em_revisao, links_prontos, shadow, ativa, pausada), `telegram_chat_id` (texto; único quando preenchido), `telegram_chat_title`, `telegram_invite_url`, `telegram_verified_at`, `telegram_bot_can_post`, `whatsapp_group_url` (opcional; envio assistido), `limits` jsonb, `search_menu` jsonb, `ad_tag` (texto curto; mesma validação do `getAdTag`, sem a palavra proibida), `brand` jsonb (rótulo, hashtag, tinta; sem imagem), `created_at`, `updated_at`, `archived_at`.
- `store_section_verticals` (`vertical` PK, `store_id` FK `ON DELETE RESTRICT`): uma vertical pertence a UMA loja. Garante no banco que um produto nunca roteia para dois canais.
- `telegram_chat_discoveries` (descoberta automática do chat id): `chat_id` PK, `title`, `type`, `username`, `bot_status`, `can_post`, `first_seen_at`, `last_seen_at`, `claimed_store_id` (nulo até o dono vincular).
- `group_messages` ganha `store_id uuid NULL` (FK) + índice `(store_id, channel, sent_at)`; preenchida por `store_section_verticals` a partir de `vertical` (backfill em lotes). `group_member_counts` já é por `chat_id` [C]: o freio de saída de inscritos passa a rodar por loja sem mudar a tabela.
- Segredos: token do bot continua em variável de ambiente (`TELEGRAM_BOT_TOKEN`); o chat id não é segredo e vai para a tabela. Variáveis `TELEGRAM_GROUP_CHAT_ID*` ficam como fallback só da loja games na transição e depois são removidas.

### 1.2 Estado da automação por loja (feature flag)

- Mestre global: `group_messages_auto` (existente, kill-switch de tudo).
- Por loja: `group_messages_auto:<slug>` (mesma tabela `feature_flags`, mesmo cache de 30 s, mesmos valores off | shadow | on).
- **Estado efetivo = o menor entre global e loja** (off < shadow < on). Loja sem linha = off. Games sem linha própria herda o global (preserva o comportamento de hoje até o dono separar).
- `stage` é só andamento do onboarding (exibição e checklist); quem manda no envio é a flag.

### 1.3 Formato de `limits` (jsonb, validado com limites duros)

```
{ "dailyCap": 60, "hourlyCap": 12, "soundCap": 10,
  "spacingDayMin": 3, "spacingNightMin": 5,
  "classCaps": { "alerta": 60, "radar": 40, "insight": 30, "resumo": 4, "cupom": 20 },
  "productGapMin": 90, "cardDailyCap": 4,
  "night": { "from": 22, "until": 8 }, "radarComposite": false,
  "diversityBy": "segment", "classes": ["alerta","insight","radar","resumo","cupom"],
  "blackFridayDailyCap": null }
```
Teto duro de validação: dia <= 400, hora <= 60, espaçamento >= 1 min. Campos ausentes herdam `DEFAULT_LIMITS`. A linha **games** é gravada com os valores de hoje (400, 60, 1 min, 1 min, classes incluindo `plataforma`) para a paridade ser comprovável. A classe `plataforma` (P1 a P5) é exclusiva de games [C: `group-platform.ts` filtra por plataforma de jogo].

### 1.4 `search_menu` (cardápio de busca/semeadura)

```
{ "status": "provisorio|aprovado", "segments": [ { "key": "...", "domain": "MLB-...", "terms": ["..."], "exclude": ["..."], "tier": 1 } ],
  "dailyCallBudget": 120 }
```
Hoje os termos moram em `src/lib/catalog/vertical/config.ts` e o `apply` exige `--termos-aprovados` (`TERMS_STATUS = provisorio`) [C]. O plano: o script `semear-vertical.ts` passa a ler o cardápio da loja (banco), mantendo o mesmo bloqueio (status provisório não aplica) e o teto compartilhado de 480 chamadas/dia de ML, repartido por `dailyCallBudget`. Domínios do ML não se inventam: são medidos pela ferramenta de descoberta já usada na semeadura [C: docs/semeadura-nichos-2026-11-10.md].

### 1.5 Migração proposta e reversão

`drizzle/migrations/0032_store_sections.sql` (PROPOSTA, não criada):

```sql
BEGIN;
CREATE TABLE store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'rascunho'
    CHECK (stage IN ('rascunho','aguardando_canal','canal_verificado','semeando','catalogo_em_revisao','links_prontos','shadow','ativa','pausada')),
  telegram_chat_id text, telegram_chat_title text, telegram_invite_url text,
  telegram_verified_at timestamptz, telegram_bot_can_post boolean NOT NULL DEFAULT false,
  whatsapp_group_url text,
  limits jsonb NOT NULL DEFAULT '{}', search_menu jsonb NOT NULL DEFAULT '{}', brand jsonb NOT NULL DEFAULT '{}',
  ad_tag text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE UNIQUE INDEX store_sections_chat_uniq ON store_sections (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE TABLE store_section_verticals (
  vertical text PRIMARY KEY CHECK (vertical IN ('games','tecnologia','eletroeletronicos','livros','eletrodomesticos','esporte')),
  store_id uuid NOT NULL REFERENCES store_sections(id) ON DELETE RESTRICT
);
CREATE TABLE telegram_chat_discoveries (
  chat_id text PRIMARY KEY, title text, type text, username text, bot_status text, can_post boolean,
  first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_store_id uuid REFERENCES store_sections(id)
);
ALTER TABLE group_messages ADD COLUMN store_id uuid NULL REFERENCES store_sections(id);
CREATE INDEX group_messages_store_idx ON group_messages (store_id, channel, sent_at);
COMMIT;
-- Depois, FORA da transação e em lotes de 5.000: UPDATE group_messages g SET store_id = v.store_id FROM store_section_verticals v WHERE g.vertical = v.vertical AND g.store_id IS NULL;
-- A linha da loja games (slug 'games', vertical 'games') e o chat id são gravados por script de seed com o valor de TELEGRAM_GROUP_CHAT_ID lido do ambiente, nunca digitado na migração.
```

`0032_store_sections.rollback.sql` (mesmo padrão do `0031_*.rollback.sql` [C]): `ALTER TABLE group_messages DROP COLUMN store_id; DROP TABLE telegram_chat_discoveries; DROP TABLE store_section_verticals; DROP TABLE store_sections;`. Sem perda de dado de negócio: `store_id` é derivado; histórico de mensagens e preços não muda. Antes de aplicar: backup lógico das tabelas tocadas em `backup/` com log (regra de aprovação ampla com backup). **A migração precisa conferir a lista do CHECK de verticais da 0027** e a regra de tabelas existentes com nome parecido [H: confirmar que `store_sections` não colide com nome já usado].

**Migração 0033 (Impressão 3D):** adiciona `impressao3d` à lista dos CHECKs `master_products_vertical_chk` e `affiliate_offers_vertical_chk` (ADD novo CHECK `NOT VALID`, `VALIDATE`, remover o antigo), `VERTICALS` em `src/lib/catalog/verticais.ts`, registro de departamentos e léxico em `scope.ts`. Reversão: restaurar a lista antiga, o que exige antes não existir linha com a vertical nova (reclassificar ou arquivar). Masters de impressora hoje em `tecnologia` [H: medir quantos] migram por UPDATE com lista revista pelo dono.

## 2. Limites por loja

Mudança cirúrgica nas funções PURAS de `group-rules.ts` [C]: elas já recebem parte da configuração por parâmetro (`spacingState(history, now, cfg, hourlyCap)`, `planDaySlots(..., caps)`), então a mudança é passar a configuração em vez de ler `RULES`.

- Novo tipo `StoreLimits` e `resolveLimits(store)` (mescla com `DEFAULT_LIMITS`, valida). `LimitOptions` ganha `limits`.
- `dailyCap(now)`, `classCap`, `soundDecision`, `minGapMinutes`, `cardAllowed`, `productGapBlock`, `isNightHour`, `platformDue` passam a receber `limits`; chamadas antigas sem `limits` usam o default = valores de hoje (paridade).
- **Histórico recortado por loja**: `loadSentHistory('tg', now, { storeId })` filtra `group_messages.store_id`. Toda conta de teto, espaçamento, som, dedup de produto e rodízio é feita sobre o histórico DA LOJA. Duas lojas nunca competem por teto nem por espaçamento.
- **Uma mensagem por execução vira uma por loja por execução.** A detecção (custosa) roda UMA vez para todas as verticais ativas; `applyLimits` roda em laço por loja. Custo extra é CPU, não consulta. Limite do cron: se N lojas estourar o tempo da função, sai o laço por ordem de loja menos servida (a que está há mais tempo sem enviar).
- **Rodízio (diversidade)**: `diversityKey` hoje usa rede + vertical + plataforma [C]; `platformLabel` só existe para games. Por loja: `diversityBy` = `platform` (games), `segment` ou `brand` (demais). Continua só como desempate (>= 70% do movimento).
- **Black Friday**: janela global 20 a 27/11 permanece; cada loja pode sobrescrever (`blackFridayDailyCap`).
- **Padrão sugerido para lojas novas [R]** (a decidir pelo dono): 60/dia, 12/hora, 3 min de dia e 5 min de noite, 10 sonoras/dia, sem radar composto, sem classe `plataforma`. Sobe por decisão do dono olhando taxa de saída de inscritos e cliques. O teto é limite superior, não meta: o volume real é limitado pelas regras de qualidade (série mínima, 3 lojas, frescor).
- **Falha de envio**: falha definitiva hoje (401, 403, chat inexistente) põe a automação global em `off` [C]. Passa a depender da causa: 403/chat inexistente/bot removido => pausa SÓ a loja (flag da loja `off`, `stage=pausada`, alerta); 401 de token => pausa global (o token é comum).
- **Freio de inscritos**: `runMemberCount` hoje lê `TELEGRAM_GROUP_CHAT_ID` [C]; passa a iterar as lojas com chat verificado e freia só a loja que perdeu inscritos.

## 3. Roteamento de mensagem e card

1. Produto -> loja: `store_section_verticals` (cache de 30 s como as flags). Sem loja ativa para a vertical => o gatilho vira "bloqueado: loja não ativa" (substitui `RELEASED_VERTICALS` e o G6 de "departamento não liberado"); em shadow, vira simulada.
2. Chat: `telegramChatFor(vertical, env)` é substituído por `chatForStore(store)` = `store.telegram_chat_id`. Sem chat verificado: linha expira (`sem_canal_da_loja_<slug>`), igual ao comportamento atual. **Nunca há fallback para o canal de games** (regra existente, mantida e testada).
3. Texto: `formatOfferMessage` continua por tópicos e destaque do menor preço registrado. Entra `brand`: rótulo da loja, hashtag, e marcação de publicidade da loja (`ad_tag` da loja, senão o global, sempre passando pelo filtro da palavra proibida). Campos específicos de produto por tipo: games (plataforma, mídia), demais (marca, modelo, voltagem, ISBN, peso/material no caso de filamento). Sem campo inventado: o que o master não tem, não aparece.
4. Card (`price-card.tsx`, `offer-card.tsx`): tipo de cartão por loja (já existe `TipoCartao` no registro de departamentos [C]); tinta secundária por CSS, **sem imagem estática nova por loja** (uma imagem, um lugar; cantos quadrados). Foto do produto vem da oferta real.
5. Link: o botão e o link levam a chave da mensagem (`m=`), e a mensagem pertence a uma loja; o clique (`affiliate_click`) passa a carregar o `store_id` pela junção com `group_messages`. Sem mudança no `/go`.
6. WhatsApp assistido: mesma fila, `channel='wa'`, por loja; o painel mostra o texto pronto e o botão copiar por loja. **Não há envio automático por WhatsApp.**
7. Admin: `/admin/mensagens` ganha seletor de loja; contadores, fila, estado e limites por loja.

## 4. Onboarding automatizado de uma nova loja

| Etapa | Quem | Como |
|---|---|---|
| 1. Criar o canal no Telegram | **Dono** (o Telegram não deixa bot criar canal) | No aplicativo: novo canal, nome e foto (a foto é arquivo fora do site ou, se for ao repositório, única) |
| 2. Adicionar o bot como administrador com permissão de postar | **Dono** | Configurações do canal, administradores |
| 3. Abrir "Nova loja" no admin: nome, slug, vertical(es) | **Dono** | Formulário curto; o sistema valida slug e unicidade de vertical |
| 4. Descobrir o chat id | **Sistema** | O Telegram envia ao webhook um aviso `my_chat_member` quando o bot vira administrador; o handler grava em `telegram_chat_discoveries`. O admin lista "canais descobertos" e vincula com um clique (vincula sozinho se houver uma só loja em `aguardando_canal` com título compatível) |
| 5. Verificar o canal | **Sistema** | Só leitura: `getChat`, `getChatMember` do bot (precisa `can_post_messages`), `getChatMemberCount`. **Nenhuma mensagem de teste é enviada**; a primeira mensagem do canal é um item real aprovado |
| 6. Registrar a loja | **Sistema** | `store_sections` + `store_section_verticals`, flag da loja em `off`, `stage=canal_verificado` |
| 7. Cardápio de busca | **Sistema propõe, dono aprova uma vez** | Gera `search_menu` provisório a partir do segmento (domínios medidos, não inventados), roda dry-run e mostra a estimativa de masters e o gasto de chamadas |
| 8. Semear produtos por ML API | **Sistema** | `semear-vertical` em lotes sob o teto diário compartilhado; masters nascem com porteiro `review`; duplicata por catálogo ML, GTIN, chave de identidade e título (regra de dedup) |
| 9. Aprovar catálogo | **Sistema + dono em bloco** | Critérios objetivos aplicados em lote (identidade completa, sem região/condição fora do padrão, >= 1 oferta ativa, foto), com backup e log reversível; sobra uma lista curta de exceções para o dono |
| 10. Gerar links oficiais | **Sistema** (e aba logada do dono onde a ADR 0009 já autoriza) | Ofertas com `affiliate_link_pending` ficam bloqueadas nos gatilhos [C: `judgeOffer`]; o checklist só passa com 0 pendências nas ofertas elegíveis |
| 11. Abrir em shadow | **Sistema** | Flag da loja `shadow`: o ciclo escolhe vencedores e grava simuladas, não envia. Relatório diário "o que teria saído" |
| 12. Ligar | **Dono** | O admin mostra o checklist de prontidão (abaixo); o botão "ligar" é do dono. Primeira semana com limites do padrão sugerido |

**Checklist de prontidão (automático, só leitura):** canal verificado e bot com permissão de postar; >= 3 dias de shadow; >= 1 vencedor simulado por dia; 0 `textProblems`; 0 ocorrência de "afiliad" nos textos (varredura); >= N masters aprovados com >= 3 lojas [N a definir pelo dono]; 0 ofertas elegíveis com link pendente; orçamento de chamadas do ML dentro do teto; limites válidos.

**Detalhe técnico do passo 4:** o webhook `/api/webhooks/telegram` já existe e valida `secret_token` [C], mas só trata `message` com `/start`. Para receber `my_chat_member` é preciso chamar `setWebhook` de novo com `allowed_updates` contendo `message` e `my_chat_member` (a chamada substitui a lista; omitir `message` quebraria o vínculo de conta por `/start`). Com webhook ativo o `getUpdates` não funciona (conflito), então a descoberta é só por webhook. **Chamar `setWebhook` é escrita em produção: só na Fase 4 e com autorização do dono.** [H a conferir: o bot dos canais e o bot do `/start` são o mesmo token?]

## 5. Cupom por anúncio no momento do envio

**Objetivo:** o cupom só entra se for lido de verdade para aquele anúncio, perto da hora do envio, e só para itens que vão à mensagem (no máximo uma leitura por mensagem enviável).

**Ordem de decisão [R]:**
1. **Primeiro conferir se há canal oficial.** Verificar se a API oficial do ML ou da Shopee expõe cupom/voucher por item ou vendedor [H: não conferido nesta sessão]. Se existir, usa-se ela e o resto desta seção é descartado.
2. **Se não houver**, leitura assistida pela aba logada do dono, como emenda à ADR 0009 (nova ADR 0011, proposta, a ser aceita pelo dono com os riscos dele). A ADR 0009 hoje cobre Amazon (coleta) e ML (links), não cupom.

**Desenho assistido (reaproveita o que existe):**
- O sistema já consome cupom verificado em até 2 h pelo `lookupVerifiedCoupon` (escopo, validade futura, sem inventar código) [C: `coupon-lookup.ts`]. Falta só a FONTE por anúncio.
- Nova tabela de pedidos `coupon_check_requests` (`offer_id`, `store_id`, `requested_at`, `status` pedido/lido/sem_cupom/falhou/expirado, `result` jsonb). Quando um candidato entra na faixa "próximos da fila" (olhar adiante de 3 a 5 mensagens, pois o envio é de 1 por minuto), o sistema cria o pedido.
- A aba logada do dono (a mesma do laço assistido) consulta os pedidos pendentes, abre o anúncio, lê SÓ o bloco de cupom (valor, unidade, condição, validade, escopo) e devolve por rota de ingestão com token dedicado (modelo de `POST /api/ingest/amazon-assistida`). Grava em `coupons` com origem `assistida-anuncio`. **Não lê nem grava preço dessa página**: preço continua vindo da API e da reconferência ao vivo.
- O envio **nunca espera**: se o pedido não voltou até a hora, a mensagem sai sem cupom (o fluxo atual já faz isso: `couponLookup` com limite de 4 s e falha tolerada [C]).
- Freios: teto diário de leituras (a definir; sugestão 150/dia), pausa de 4 a 8 s entre páginas, parada total em captcha, login ou status diferente de 200, sem contornar verificação, sem guardar HTML, nenhuma leitura em lote do catálogo, só itens enfileirados. Desligável removendo o token (rota responde 503).
- Métricas: cobertura (% das mensagens com cupom), idade do cupom no envio, taxa de pedidos sem retorno. Cupom que não casa com o escopo da oferta não aparece (regra existente).
- Riscos: depende de o computador do dono estar aberto; risco contratual/de conta nas plataformas (assumido pelo dono na ADR 0009 para os itens ali listados, e a emenda precisa dizer isto expressamente); página muda e a leitura quebra (fail-closed => sem cupom); mensagem de cupom errada é pior que sem cupom, por isso a validade lida é obrigatória.

## 6. Fases, critérios de aceite e riscos

**Restrição de calendário:** congelamento de regras, coleta e ESQUEMA em 2026-11-20 e Black Friday em 2026-11-27 [C: atas de 10/11]. Esta é a restrição que ordena as fases.

| Fase | Entrega | Critério de aceite | Riscos |
|---|---|---|---|
| **0. Preparação (sem código)** | Decisões do dono; ADR 0011 rascunhada; medições: bot único?, webhook atual, API oficial de cupom, domínios ML de impressora 3D/filamento/resina/peças, quantos masters de impressora já estão em `tecnologia` | Documento de medições com fonte; zero escrita | Medição exige chamadas ao ML (orçamento diário) |
| **1. Fundação inerte** | Migração 0032 (aditiva) + leitor `getStores()` + loja `games` semeada; NADA do caminho de envio lê ainda | Rodar migração e rollback em cópia; contagens do games idênticas; `group_messages` backfill 100% com `store_id`; typecheck e testes verdes | Mexer em esquema perto do congelamento: só até 17/11 e só se QA aprovar; senão, após 28/11 |
| **2. Limites e estado por loja** | `StoreLimits`, histórico por loja, flag por loja, estado efetivo = mínimo, pausa só da loja, freio de inscritos por loja | **Teste dourado:** com a loja games e limites iguais aos de hoje, `applyLimits` devolve exatamente o mesmo plano que o código atual para uma bateria de históricos reais anonimizados da própria tabela; duas lojas simuladas têm contadores independentes; falha 403 pausa só uma loja | Toca o caminho de envio do games na Black Friday: **recomendo após 28/11** |
| **3. Roteamento, texto e card por loja** | `chatForStore`, marca/hashtag/ad_tag por loja, tipo de cartão, `store_id` no clique | Isolamento: produto de vertical A nunca vai ao chat de B (estender `scripts/test-vertical-isolation.ts`); varredura de "afiliad" = 0; nenhuma imagem repetida; cantos quadrados; sem fallback ao canal de games | Texto de nicho sem campo de identidade => mensagem pobre; mitigar com tipo de cartão por loja |
| **4. Onboarding assistido** | Tabela de descobertas, `setWebhook` com `my_chat_member`, assistente "Nova loja", checklist de prontidão | Adicionar o bot a um canal de TESTE do dono aparece em "descobertos" em < 1 min; vínculo; verificação só leitura; `/start` continua funcionando (regressão) | `setWebhook` é escrita em produção; autorização do dono; segredo do webhook |
| **5. Impressão 3D** | Migração 0033 (vertical), léxico (impressora x filamento x resina x peça), cardápio, dry-run, apply sob aprovação, shadow | Dry-run com estimativa de masters; 0 duplicata (dedup); identidade: material, diâmetro, peso e voltagem separam; cor junta; Open Box/usado fora; porteiro `review` até aprovar; shadow 3 dias sem texto reprovado | Identidade de filamento e peça (compatibilidade com modelo de impressora) é o ponto fraco; **recomendo impressoras e filamento primeiro, peças e bicos na onda seguinte**; canal quieto no início (ver abaixo) |
| **6. Cupom por anúncio** | ADR 0011; tabela de pedidos; rota de ingestão; olhar adiante na fila | Cupom exibido sempre com validade lida e escopo casado; envio nunca espera; parada em captcha comprovada; cobertura medida | Contratual/conta; dependência do computador do dono |
| **7. Demais lojas** | Tecnologia, Livros, Eletrodomésticos, Eletroeletrônicos, Esporte, uma por vez pelo assistente; WhatsApp assistido | Cada loja passa o checklist de prontidão; abertura em ordem de volume de ofertas reais (livros e tecnologia antes; esporte só quando houver ofertas) | Ofertas ativas de ML medidas em 10/11: tecnologia 106, livros 152, eletroeletrônicos 28, eletrodomésticos 13, esporte 0 [C: ata 10/11]; canais com pouca coisa para dizer |

**Riscos transversais**
- **Canal vazio:** com as regras de qualidade intactas (série mínima, 3 lojas, frescor) uma loja nova pode ficar dias sem mensagem. Resposta: aceitar, e usar apenas conteúdo REAL já permitido (resumo do dia, radar, foto de preço), nunca preencher com dado ou com produtos de outra loja.
- **Misturar canais:** mitigado por vertical única por loja (PK), sem fallback ao games, teste de isolamento no CI.
- **Limite de envio do Telegram:** cada canal tem limite próprio de mensagens por minuto [H: ordem de 20/min por grupo; conferir na documentação do Bot API na Fase 2]; espaçamento >= 3 min nas lojas novas fica muito abaixo.
- **Orçamento de ML:** 480 chamadas/dia são compartilhadas entre semeadura de todas as lojas e o recoletor; nova loja sem teto próprio rouba da coleta de preço. Por isso `dailyCallBudget` por loja.
- **Tempo do cron:** N lojas no mesmo ciclo; medir duração em shadow.
- **Regressão no games na Black Friday:** por isso as Fases 2 e 3 só depois de 28/11, com teste dourado.

## 7. O que NÃO muda

Regras de preço e risco, média por oferta-dia (ADR 0004), identidade de catálogo, "um jogo, uma média", a regra de uma imagem em um lugar, cantos quadrados, ausência da palavra "afiliado" ao cliente, superfícies públicas só `games` (a loja é um conceito do canal e da operação; a visibilidade pública dos departamentos continua nas chaves `dept_<slug>` e na trava `MERCADO_UI`), envio do Telegram só com aprovação humana ou proposta automática segura em modo `on`.

---

# PARTE II. Plano de implementação revisado (decisão do dono, 2026-11-11, tarde)

**Substitui o calendário e a recomendação "esperar a Black Friday" da seção 6.** Decisão do dono: NÃO esperar; implementar já as lojas novas; a loja de games segue intocada no caminho de envio até haver paridade comprovada; refinar o que falta no games. As seções 0 a 5 e 7 continuam valendo. Restrições mantidas: sem escrita em produção sem autorização do dono, sem Chrome, zero dado fake.

**Fatos medidos hoje (informados pelo coordenador) [D]:** `MERCADO_UI` desligado; nenhuma linha `dept_<slug>` em `feature_flags`; 0 masters aprovados fora de games (eletrodomésticos 11, esporte 4, livros 79, tecnologia 55, eletroeletrônicos 14, todos sem `catalogGate` approved); links oficiais ML no games: 722 de 9.977. Já existe [D/C]: `telegramChatFor` por vertical em `group-queue.ts` (linha ~688, sem fallback para games), botão de compartilhar card+texto no WhatsApp, mensagem por tópicos com indicadores. Consequência direta: **hoje nenhuma loja nova consegue enviar nada**, porque o porteiro bloqueia `catalogGate` review (`scopeBlock` em `group-rules.ts`). A aprovação de catálogo é o gargalo número 1 da trilha A.

## Regra de ouro da trilha A: games não muda de caminho

1. **Duas vias no mesmo ciclo.** `runGroupMessagesCycle` continua chamando o caminho atual para `vertical='games'`. Um novo `runStoreCycles` trata as lojas NÃO games. A chave `feature_flags.store_path:games` (padrão `legacy`) só passa o games para a via por loja depois do teste de paridade e da autorização do dono.
2. **Mudanças em funções compartilhadas só com parâmetro opcional e padrão = comportamento de hoje** (`applyLimits(..., { limits? })`, `spacingState`, `dailyCap`, etc.). Sem `limits`, o resultado é idêntico; o teste dourado prova.
3. **Três acoplamentos que a leitura do código revelou e que precisam de correção neutra para o games** (sem eles, a primeira mensagem de uma loja nova mudaria o comportamento do games):
   - `loadSentHistory('tg', now)` lê TODAS as linhas enviadas [C: `group-queue.ts` linhas ~450 e ~582]. Quando outra loja enviar, teto, espaçamento e som do games passariam a contar as mensagens dela. Correção: filtrar o histórico por `vertical = 'games'` na via legada. Hoje todas as linhas são games, então o resultado atual não muda (verificável por contagem antes/depois).
   - A trava de proposta aberta por gatilho (`WHERE trigger = ... AND channel='tg' AND status IN (...)`, `group-queue.ts` linha ~157) é global: uma proposta aberta de uma loja bloquearia a mesma classe em outra. Correção: incluir a vertical (ou `store_id`) na condição.
   - Falha definitiva de envio põe a automação GLOBAL em `off` [C]. Nas lojas novas a pausa passa a ser só da loja (seção 2); o games mantém o comportamento atual.
4. **Teste de paridade (critério para o games sair da via legada):** reexecutar a detecção e o plano de envio do games nas duas vias sobre o mesmo histórico real do banco (somente leitura) e exigir plano e textos idênticos em 48 ciclos consecutivos (um dia). Qualquer diferença bloqueia. Recomendo o games trocar de via só depois da Black Friday.

## TRILHA A. Lojas novas já

### A1. Fundação aditiva (esquema)
Migrações 0032 (lojas) e 0033 (vertical `impressao3d`) como na seção 1.5. Aplicação em produção exige autorização do dono, backup lógico prévio e rollback testado em cópia. Prazo: aplicar até 13/11 (antes do congelamento de esquema de 20/11).

### A2. Cadastro de loja, canal e estado
- Seed das lojas: `games` (via legada), `tecnologia`, `livros`, `eletrodomesticos`, `eletroeletronicos`, `esporte`, `impressao-3d` (vertical `impressao3d`), todas com flag `off` e `stage=rascunho`. Sem chat id até o dono criar o canal.
- Admin "Lojas": lista, estado (off/shadow/on), canal, limites, checklist de prontidão. Assistente "Nova loja" e descoberta por `my_chat_member` (seção 4). Enquanto o webhook não for reconfigurado (autorização), plano B manual: colar o chat id.

### A3. Limites e rodízio por loja, só para lojas novas
`StoreLimits` e `resolveLimits` (seção 2), histórico por loja, laço por loja, pausa só da loja, freio de inscritos por loja. Padrão sugerido (D2): 60/dia, 12/hora, 3 min de dia, 5 min de noite, 10 sonoras/dia; rodízio `diversityBy` = `segment` (impressão 3D: impressora, filamento, resina, peça; demais: segmento do domínio ML). Classe `plataforma` fora das lojas novas.

### A4. Semeadura e aprovação em bloco do catálogo, por loja
Semeadura: `scripts/semear-vertical.ts` com o cardápio da loja (dry-run primeiro; `apply` só com termos aprovados; teto de 480 chamadas/dia compartilhado e repartido por loja; domínios medidos, nunca inventados). Aprovação em bloco: script `aprovar-catalogo-loja` que (a) lista os masters `review` da vertical, (b) aplica os critérios abaixo, (c) grava `catalogGate.verdict='approved'` com `approvedBy='bloco:<criterio>:<data>'` somente nos que passam, (d) salva backup do estado anterior em `backup/dados/` e um log que permite desfazer, (e) devolve a lista curta de exceções ao dono. Padrão "aprovação ampla com backup".

**Critérios comuns (todos devem passar):** sem duplicata (título+tipo normalizados e catálogo ML/GTIN); nenhum atributo `unknown`; pelo menos 1 oferta ativa ML ou Shopee, com preço entre 0,35x e 3x da mediana das ofertas; foto presente; vendedor ML com reputação aceita (`5_green`, `4_light_green`) e >= 50 vendas (senão fica `review`); sem usado, open box, recondicionado, vitrine, importado ou região no título; Amazon fora; sem a palavra proibida.

**Critérios por vertical (identidade):**

| Vertical | Obrigatório para aprovar | Separa em masters diferentes | Junta |
|---|---|---|---|
| Livros | ISBN-13 válido (dígito verificador conferido) | ISBN diferente; kit/box sem ISBN próprio fica fora | texto do anúncio |
| Tecnologia | marca + modelo (MPN ou GTIN quando houver); aparelho x acessório pelo léxico de `scope.ts`; recorte de nicho existente | capacidade, memória, geração, voltagem | cor |
| Eletroeletrônicos | marca + modelo + tamanho (polegadas, se TV) | polegadas, voltagem, geração | cor |
| Eletrodomésticos | marca + modelo + voltagem (110/220) + capacidade | voltagem, capacidade, kit | cor |
| Esporte | só abre quando houver ofertas ativas reais (ML tinha 0 em 10/11); os 4 masters ficam em `review` | tamanho, peso/carga | cor |
| Impressão 3D: impressoras | marca + modelo; tipo (FDM ou resina); voltagem; combo explícito | modelo, voltagem, combo com ou sem filamento | cor |
| Impressão 3D: filamento | marca + material (PLA, PETG, ABS, TPU etc.) + diâmetro (1,75 ou 2,85 mm) + massa (250 g, 500 g, 1 kg) | material, diâmetro, massa, pacote com N rolos | cor |
| Impressão 3D: resina | marca + tipo de resina + volume/massa | tipo, volume | cor |
| Impressão 3D: peças (bico, hotend, mesa, extrusora, correia) | tipo da peça + especificação + COMPATIBILIDADE escrita no título (modelo de impressora) | tipo, tamanho, modelo compatível | cor |

Qualquer produto sem o campo obrigatório no título ou no atributo estruturado fica em `review` para o dono; nunca se completa campo por suposição. Peças (tier 2) entram no cardápio mas só semeiam depois de o dry-run de impressoras, filamento e resina fechar sem duplicata nem identidade ambígua.

### A5. Links oficiais ML por loja
Reaproveita a ADR 0009 (`POST /api/ingest/ml-links`, um link por vez, pela aba logada do dono, reversível por `collector_runs.meta.trocas`). Fila de links por loja ordenada por: ofertas de masters aprovados; menor preço do master; ofertas candidatas dos gatilhos. Primeiro as lojas que vão a shadow. Ofertas com link pendente seguem bloqueadas nos gatilhos [C: `judgeOffer`], então a falta de link nunca vira mensagem sem comissão. Volume estimado [D, ata de 10/11, pode ter crescido]: ofertas ML ativas tecnologia 106, livros 152, eletroeletrônicos 28, eletrodomésticos 13, esporte 0, impressão 3D a medir. **Atenção:** a ADR 0009 registra que cada link gerado entra na lista pública "Minhas recomendações" do perfil do dono; lojas novas ampliam essa lista com outros nichos (D9).

### A6. Cupom por anúncio
Seção 5 inalterada, mais: a fila de pedidos é por loja; olhar adiante 3 a 5 mensagens; mesmos freios. Para o ML usa-se a aba logada do dono (ADR 0009 estendida). Primeiro passo, hoje: ler a documentação oficial para saber se há API de cupom (sem chamar nada em produção).

### A7. Abertura: shadow e depois on
Checklist automático da seção 4. Shadow por pelo menos 3 dias com relatório diário. `on` por loja, decisão do dono, com limites padrão. Meta realista: shadow em 17/11 e `on` das lojas que passarem em 23/11; quem não passar abre depois da Black Friday.

## TRILHA B. Front público: abrir cada loja/departamento

**Estado [D]:** o público só vê games. Para um departamento aparecer são necessárias TODAS as condições (função pura `estadoDepartamento` em `src/lib/catalog/departamentos.ts` [C]):
1. `MERCADO_UI` = `1` ou `true` (trava mestra; desligada = tudo 404 sem ler o banco);
2. linha `dept_<slug>` em `feature_flags` com `enabled=true` (não existe nenhuma hoje); `rules` com `audience: admin` abre só para administradores (janela de teste);
3. no mínimo 3 masters visíveis (`MIN_MASTERS_DEPARTAMENTO`), isto é, aprovados pelo porteiro; hoje 0 em todos, então a aprovação de catálogo (A4) destrava a trilha B.
Redes em departamento: só `mercado-livre` e `shopee` (Amazon fora); oferta clicável com última checagem <= 6 h; mediana de preço só com >= 3 vendedores distintos [C].

**Passos de abertura por loja (independentes):**
1. Aprovar catálogo (A4) para ter >= 3 masters visíveis.
2. Criar a linha `dept_<slug>` com `enabled=true` e `rules=[{"audience":"admin"}]` e `MERCADO_UI=1` em PREVIEW primeiro (nunca direto em produção). Dono e QA navegam.
3. Passou nos testes abaixo: trocar `rules` para público (`[]`); reversão por `enabled=false` vale em até 30 s.
4. Menu e sitemap entram só quando a loja está pública, pela constante única do registro (sem lista paralela).

**Pronto no layout e na responsividade antes de ligar:**
- Página do departamento: título, descrição curta do registro, grade de cartões do tipo certo (`livro`, `tecnologia`, `eletro`, `esporte`), paginação real (24 por página), filtros só com dado real da vertical (nada de plataforma de jogo), ordenação por menor preço e por queda.
- Cartão: foto da oferta com tamanho reservado (sem salto de layout), nome, menor preço atual com loja e hora da checagem, mediana com número de vendedores, botão "Ir à loja" para o link oficial; sem "de/por" feito com média própria.
- 360 px sem rolagem horizontal, alvos de toque >= 44 px, tema claro e escuro, cantos quadrados, tinta secundária por CSS (nenhuma imagem estática nova; existem 0 imagens desses nichos e a regra uma imagem, um lugar vale), foco visível e `alt` nas fotos.
- Estados vazios honestos ("ainda sem ofertas confirmadas"), nunca dado de preenchimento; `noindex` enquanto a audiência for admin.
- Sem a palavra proibida em nenhum texto visível.

**Testes antes de ligar (sem as abas do dono):** `scripts/test-vertical-isolation.ts` (games não vaza para departamento e vice-versa); novo teste de HTML público (fechado = 404 e fora de menu e sitemap; aberto = 200 e só ofertas ML/Shopee da vertical); varredura de "afiliad" no HTML; teste de imagens únicas; `tsc` e `build`; contagens e médias do games antes/depois idênticas; conferência visual em 360, 768 e 1280 px por captura headless própria do ambiente (não o Chrome do dono); peso do HTML < 400 KB e imagens com dimensões reservadas.

## TRILHA C. Refinar a loja de games (lista priorizada)

Os números 722/9.977 vêm do coordenador. O que não muda regra de preço nem de envio anda a qualquer hora; o que muda texto ou regra de envio fica atrás de flag, comparado em shadow, e só liga com autorização.

| # | Item | Por que | Critério de aceite |
|---|---|---|---|
| C1 | Links oficiais ML: 722 de 9.977 (7%) | Sem link oficial não há comissão; ofertas com link pendente já são bloqueadas nos gatilhos | Fila ordenada pelas ofertas que mais entram em mensagens e pelo menor preço do master; 100% das ofertas ML elegíveis aos gatilhos com link oficial até 19/11; cobertura geral medida por dia; reversão testada |
| C2 | Amazon: saúde do laço assistido | A classe pausa após 90 min sem lote | Alarme `amazon-assistida` ativo; lotes por dia medidos; zero mensagem Amazon sem data e hora do preço; falhas observadas documentadas |
| C3 | Cupons que não casam | O `lookupVerifiedCoupon` exige verificação em 2 h, validade futura e escopo que case [C] | Registrar o motivo de cada não-casamento (escopo, validade, idade, valor mínimo, sem cupom); relatório de 7 dias antes de ajustar; zero cupom exibido que não case com a oferta; cobertura sobe com a leitura por anúncio (A6) |
| C4 | Radar no formato antigo | Sai fora do padrão novo de tópicos com indicadores | Radar renderizado pelo mesmo `formatOfferMessage` dos alertas, atrás de flag; teste de instantâneo de texto sem `textProblems`; 3 dias de shadow; liga só com autorização (D7) |
| C5 | Limites por loja para o games | Hoje globais em `RULES` | Atrás da chave `store_path:games`; só com paridade de 48 ciclos; recomendo depois de 28/11 |
| C6 | Qualidade de imagem e catálogo | Ata de 10/11: 102 jogos e 161 acessórios em plataforma `unknown`; imagem do card depende da foto da oferta | `unknown` corrigido na origem (derivar do título; nunca padrão `unknown`); zero duplicata nova (`findExistingMasterProduct`); card sem foto, ou com foto abaixo do tamanho mínimo, usa outra foto real da oferta ou sai sem foto, nunca imagem inventada; contagens antes e depois |
| C7 | WhatsApp assistido | Há o botão de compartilhar card+texto; falta registro e fila por loja | Fila `channel='wa'` por loja; "copiar texto" e "abrir grupo"; registrar "enviado manualmente" para não repetir e contar no histórico; nenhuma automação de envio |

## Ordem de execução por dia (até 27/11)

Marcos: congelamento de regras, coleta e esquema em 20/11; Black Friday em 27/11. Cada dia termina com o `qa-verificador` e backup. Toda escrita em produção tem autorização prévia do dono.

| Dia | Entregas | Dono faz à mão |
|---|---|---|
| qua 11/11 | Fase 0 somente leitura: API oficial de cupom; bot único e webhook atual; domínios ML de impressão 3D (dentro do teto); impressoras hoje em `tecnologia`. Rascunho das ADRs 0010/0011. C3: registro de motivos de não-casamento atrás de flag | Responder D1 e D2 |
| qui 12/11 | A1: escrever 0032 e 0033 com rollback e testar em cópia; seeds das lojas; módulo de leitura de lojas. C1: fila de links por prioridade (aba do dono) | Criar o canal de Impressão 3D e adicionar o bot |
| sex 13/11 | A1: backup e aplicar 0032/0033 em produção (autorizado); lojas em `off`. Esqueleto do teste de paridade. B: registro de departamentos com `impressao3d` | Autorizar a aplicação; criar canais de Livros e Tecnologia |
| sáb 14/11 | A3: limites por loja, histórico por loja, pausa por loja, correção neutra dos 3 acoplamentos do games; testes de isolamento e dourado | nada obrigatório |
| dom 15/11 | A2: admin "Lojas" e assistente; A4: dry-run de impressão 3D (impressoras, filamento, resina) e de livros/tecnologia com termos revistos | Revisar e aprovar os termos (D4) |
| seg 16/11 | A2: `setWebhook` com `my_chat_member` e vínculo dos canais (autorizado); A4: `apply` da semeadura sob o teto e aprovação em bloco com backup e log; C4: radar novo atrás de flag | Autorizar `setWebhook` (D5); ver a lista de exceções |
| ter 17/11 | A7: lojas com canal, catálogo aprovado e links entram em shadow. A5: links ML das lojas em shadow. Último dia sensato para esquema. Paridade do games em execução | Ver o relatório do shadow |
| qua 18/11 | A6: cupom por anúncio atrás de flag (se não houver API oficial e a ADR 0011 for aceita). B: rotas e menu dos departamentos em PREVIEW atrás de `MERCADO_UI`; testes de HTML e isolamento | Decidir D6 |
| qui 19/11 | B: abertura só para administradores e conferência em 360/768/1280; C1 meta de links; C6 correções de catálogo; última janela de mudança de regra | Navegar os departamentos como administrador |
| sex 20/11 | CONGELAMENTO: só correção de defeito; shadow continua | Revisar relatório; decidir D3/D8 |
| sáb 21 e dom 22 | Observação do shadow; nenhum deploy de regra | nada |
| seg 23/11 | A7: `on` nas lojas novas que passaram o checklist (só flag); B: abrir ao público (só flag) os departamentos com >= 3 masters visíveis e teste verde | Autorizar `on` e abertura pública |
| ter 24/11 | Cupom por anúncio ligado para lojas novas (se aprovado); medir cobertura; relatório de paridade do games (informativo) | nada |
| qua 25/11 | Revisão: saída de inscritos, cliques, erros; pausa por loja se preciso | nada |
| qui 26/11 | Sem mudanças; checklist da Black Friday; confirmar backups e alarmes | nada |
| sex 27/11 | Black Friday: só monitorar; problema em loja nova = pausar a flag da loja | Acompanhar |

Depois de 28/11: games para a via por loja (C5) somente com paridade comprovada e autorização.

## O que o dono faz à mão e o que é automático
**À mão (inevitável):** criar cada canal no Telegram (bot não cria canal), adicionar o bot como administrador com permissão de postar, escolher nome, foto e endereço, autorizar escritas em produção (migrações, `setWebhook`, `on`), aprovar termos de busca e a lista curta de exceções do catálogo, navegar o front como administrador, manter a aba logada aberta (links ML, cupom por anúncio, Amazon), criar grupos de WhatsApp e colar o link.
**Automático:** descoberta e verificação do canal, registro da loja, semeadura dentro do teto, aprovação em bloco com backup e log, fila de links por prioridade, fila e leitura de cupom, shadow com relatório diário, checklist de prontidão, pausa por loja em falha, freio por queda de inscritos, limites e rodízio por loja, textos por tópicos com indicadores e bloqueio da palavra proibida.

## Riscos adicionais desta revisão
- **Prazo contra o congelamento:** esquema só até 17/11; depois, apenas flags. Se aprovação de catálogo ou links não saírem a tempo, a loja não liga antes da Black Friday (sem exceção de qualidade).
- **Acoplamento com o games:** coberto pelas três correções neutras e pelo teste de paridade; sem elas, NÃO enviar a primeira mensagem de uma loja nova.
- **Canais com pouca coisa:** nichos com poucas ofertas ativas geram poucas mensagens; aceitável.
- **Lista pública "Minhas recomendações" do ML** cresce com nichos novos (D9).
- **Contas e termos:** cupom por anúncio e links por aba logada dependem do computador do dono e carregam risco contratual que a ADR 0009 cobre só para o que ela descreve.
- **Orçamento ML:** semeadura de várias lojas disputa 480 chamadas/dia com o recoletor; `dailyCallBudget` por loja e calendário de semeadura por dia.
