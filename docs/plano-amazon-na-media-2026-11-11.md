# Plano: Amazon na média única oferta-dia

Data: 2026-11-11. Ata: `docs/conselho/atas/2026-11-11-amazon-na-media-unica.md`. ADR proposto: `docs/08-decisoes-adr/0010-amazon-na-media-unica.md`. **Nada foi executado.** Convenção: [C] código, [M] medido (SELECT em 11/11), [H] hipótese, [R] recomendação.

## 1. Onde a exclusão acontece hoje [C][M]
| Camada | Arquivo | Amazon? |
|---|---|---|
| Agregação oferta-dia | `src/server/pricing/price-daily.ts` (`upsertOfferDays`) | Entra (sem filtro de rede) |
| Elegibilidade | `src/server/pricing/eligibility-sql.ts` | Entra (quarentena, identidade, porteiro) |
| Estado do dia | `src/lib/pricing/daily-state.ts` (`computeDayState`, `resolveOffers`) | Entra; é membro de 215 estados em 11/11 |
| Gancho/job | `shadow-hook.ts`, `refresh-price-daily.ts` | Entra |
| Cartão de preço | `src/server/messaging/price-card.tsx` (`loadNonAmazonOffers`, `n.slug <> 'amazon'`) | **Fora** |
| Modelo do cartão | `src/lib/pricing/offer-card-model.ts` (`isAmazon`: sem recorde, sem "abaixo da média", sem "perto do menor") | **Fora** |
| Mensagens | `group-offers.ts` (`loadSeries` separa `amazon`), `group-rules.ts` (`amazonSeries`, `avg` sem Amazon, "não entra em na média"), `live-recheck.ts` | **Fora** |
| Vitrine | `departamento.ts` (oferta clicável só ML/Shopee) | Fora |
| Loja do produto | `product-stores-table.tsx` | Mostra com carimbo |

Consequência: o briefing diz "o estado exclui a Amazon", mas o estado **já inclui** (desde 10/11). O defeito real é a **inconsistência entre camadas** (média do estado com Amazon, média das mensagens sem) e o **vazamento por frescor** (item 3.3). Se `PRICE_METRICS_V2` estiver ligada na Vercel [H], o selo/gráfico públicos já misturam a Amazon hoje, antes de qualquer decisão: conferir hoje.

## 2. Medições [M]
- Ofertas Amazon: 351 ativas, todas `games`, nenhuma em quarentena.
- 221 masters com Amazon: **221 têm 3+ ofertas de ML/Shopee**; Amazon-only = 0; com 1-2 outras = 0.
- Ofertas Amazon por produto (estado 11/11): 95 com 1 ASIN, 112 com 2, 8 com 3.
- Impacto na média (11/11, aberto): 211 produtos; variação média 4,3%, máxima 21,8%; 134 > 2%, 66 > 5%; Amazon é o menor em 83; >= 10% abaixo da menor outra: 50; >= 10% abaixo da média sem Amazon: 136; com Amazon: 134.
- Frescor: `last_checked_at` mediana 20 min, p90 32 min, 30 ofertas (8,5%) > 2 h, nenhuma > 24 h. Snapshots: 290 de 351 ofertas têm 1 só; último snapshot ~15 h (grava só se o preço muda).
- Verticais sem nenhuma oferta Amazon: esporte 165, eletrodomésticos 145, tecnologia 141, livros 139, impressão 3D 117, eletroeletrônicos 75 (masters ativos).
- Limitação: um dia, estado aberto; auditoria de identidade e Buy Box não feitas.

## 3. Desenho técnico

### 3.1 Uma função, um parâmetro de rede
Hoje há dois caminhos (estado com todas as redes; cartão/mensagens sem Amazon). Unificar: `loadOffers(exec, ids, fromDay, { networks })` e `computeDayState(day, now, offers, { amazon: 'include'|'exclude' })`. `loadNonAmazonOffers` vira `loadOffers(..., { amazon: 'exclude' })` enquanto a flag estiver em `shadow`/`off`. Peso 1 por oferta-dia fica como está (ADR 0004): o preço da oferta no dia = mediana das cotações do dia.

### 3.2 Flag de três modos
`PRICE_AMAZON_MODE` = `off` | `shadow` | `on` (padrão `off`).
- `off`: todo consumidor (selo, gráfico, cabeçalho, mensagens, cartão) exclui a Amazon na leitura (filtro por rede sobre `members`/ofertas). Isso também **corrige hoje** a inconsistência acima sem apagar dado.
- `shadow`: o público lê `off`; um job grava/compara a versão `on` (tabela de comparação ou CSV em `docs/`).
- `on`: todos incluem, com a regra de frescor 3.3 e identidade 3.4.
Kill-switch rápido: voltar a `off` é imediato (nenhum dado é apagado). `COLLECT_AMAZON`/token de ingestão continuam como ADR 0009.

### 3.3 Frescor e batimento (sem sair da média sem sair da loja)
Problema [C][M]: "fresca" = última **cotação** <= 48 h, e a Amazon só grava cotação quando o preço muda. Sem correção, a partir de 12-13/11 as ofertas de preço estável saem da média.
Regra proposta para a Amazon (e válida para qualquer rede sem batimento):
1. Oferta entra na média do dia se `status = 'active'`, `consecutive_miss_count = 0` e **confirmada** (`last_price_confirmed_at`, atualizado a cada leitura em `ingestAmazonRows`) há no máximo **24 h** do instante de referência (alinha ao teto de cache da Licença de PI e a `OFFER_CARD_MAX_AGE_AMAZON_MS`). Para ML/Shopee nada muda.
2. Para dia fechado, a confirmação precisa existir **no histórico**: migration aditiva (`price_daily_offer.last_confirmed_at timestamptz NULL`) e linha oferta-dia criada pelo gancho a cada confirmação, com o último preço, `n_collected = 0`. Sem isso o carry-forward de dias fechados não distingue "sem mudança" de "sem leitura".
3. Sem leitura por > 24 h: a oferta sai **da média** (estado "sem leitura recente", contado em `stale_offers`), continua visível na loja do produto com o carimbo e o aviso de preço desatualizado, e **só sai da loja** após 3 ausências seguidas na busca (já existe `consecutive_miss_count`) ou status diferente de ativo. Quando voltar, reentra na média na primeira confirmação.
4. Se o laço da aba logada parar (> 90 min sem lote), mensagens da Amazon pausam (já existe); a média pública só perde a Amazon após 24 h.
Mínimo de leituras: 2 leituras separadas por >= 15 min antes de a oferta nova entrar na média (já usado nas mensagens, `AMAZON_OBS_GAP_MIN`).

### 3.4 Identidade cross-loja (Amazon x ML/Shopee)
Hoje [C]: casamento por cobertura de tokens + plataforma + edição + cor; só games; sem GTIN (a busca da Amazon não devolve; o GTIN exigiria abrir a página do ASIN, que não é feito).
Proposta em camadas:
1. **Chave forte (auto):** GTIN/EAN igual quando existir nos dois lados (ML tem `gtin` no catálogo; Amazon só se a leitura da página for adicionada: [H] fora do prazo).
2. **Atributos extraídos do título** por vertical (módulo `src/lib/affiliate/identity-attrs.ts`, novo): marca (tabela `brands`), linha/série, **código de modelo** (token alfanumérico, ex.: `UN50DU7700`, `50UT8050`), tamanho/capacidade (polegadas, GB/TB, litros), plataforma, edição, voltagem (110/127/220/bivolt), região, condição (novo), cor.
3. **Portões duros** (todos exigidos; "ausente em um lado" só passa se o outro lado também não informa): marca, código de modelo quando os dois têm, tamanho/capacidade, plataforma, edição, região, voltagem, condição nova. Regras de ADR 0006: região/cross-gen/edição limitada separam; cor junta; Open Box fora.
4. **Similaridade** só depois dos portões: cobertura de tokens do master >= 0,80 e do candidato >= 0,50 (limiares atuais), mais preço dentro da faixa plausível (`isImplausiblyLow/High`).
5. **Decisão:** todos os portões + (código de modelo igual **ou** GTIN igual **ou** cobertura >= 0,85/0,60 em games) = **auto**. Portões passam mas falta modelo em um lado ou cobertura entre os limiares e 0,05 abaixo = **revisão**. Qualquer portão falha = **rejeita**.
6. **Revisão = fora da média:** a oferta nasce `status = 'draft'` (mecanismo existente: "Rascunho = identidade duvidosa", excluída de todo indicador por `eligibleOfferSql`) e aparece na fila do admin; promover para `active` a coloca na média. Nunca `platform = 'unknown'`; antes de criar master: `findExistingMasterProduct` (título+plataforma normalizados).
7. **Auditoria obrigatória antes de ligar:** 40 pares (Amazon x master), 2 revisores, taxa de erro de identidade <= 2%; se maior, a flag fica em `shadow`.
8. **Preço:** só Buy Box novo; registrar vendedor 1P/3P quando legível; cupom de página da Amazon nunca é subtraído.

### 3.5 Amazon-only
- Criação do master a partir da Amazon exige descoberta nova (hoje inexistente): busca por vertical, cadastro via porteiro do catálogo (ADR 0005) e `findExistingMasterProduct`. Para Smart TV 50": marca, série, código de modelo e polegadas iguais definem o master; variação de cor/pés/ano separa.
- **Média só com 3+ ofertas** (ADR 0004). Na prática um modelo costuma ter 1 ASIN: então não há média, só **menor preço** e **mediana do próprio histórico**.
- Rótulos [R]: "Só na Amazon", "Menor preço na Amazon agora: R$ X (preço na Amazon em dd/mm às hh:mm)"; a "média" só aparece com 3+ ASIN do mesmo produto, rotulada "média na Amazon (N ofertas)"; nunca "média das lojas". Veredito e selo de "abaixo da média" não existem com 1 oferta.
- Régua de mensagens para Amazon-only [R]: 10% abaixo da **mediana oferta-dia dos últimos 14 dias do próprio ASIN** (mínimo 7 dias de série), rotulado "histórico na Amazon"; é o análogo da régua sem inventar média.

### 3.6 Teste de paridade e reprocessamento
1. **Paridade A (sem Amazon):** `scripts/test-amazon-parity.ts` (novo, só SELECT): para os 2.162 produtos sem Amazon e para todos com a flag `off`, média, mínimo, n, selo e eventos de menor preço iguais ao baseline congelado de hoje (centavo a centavo).
2. **Paridade B (com Amazon):** para os 211 produtos, tabela antes/depois (média, mínimo, n, selo, veredito, % de variação, quem é o menor); relatório em `docs/` com os que mudam > 5% para revisão humana.
3. **Frescor:** simular oferta de preço estável por 30 h e 50 h: em 24 h entra; em 26 h sai da média e continua na loja; reentra na leitura.
4. **Reprocessamento:** só existem 10 e 11/11 com Amazon. Script idempotente reescreve esses dois dias fechados sob a regra final (o UPSERT atual nunca reescreve linha fechada; autorizar uma passagem explícita com backup e log, conforme memória "aprovação ampla com backup"). Se D1 for "não", o mesmo script retira a Amazon de 10 e 11/11. `price_min_events`: reconstruir os dois dias.
5. **Quebra de série:** marcar 11/11 como "Amazon passou a compor a média" no gráfico/BI usando `matched_change_pct` e `composition_flag` (ADR 0004), para a queda de média por composição não parecer queda de preço.

## 4. Impacto
**Mensagens (c):**
- Régua de 10% (`belowAvgPct >= MIN_BELOW_AVG_PCT`) passa a usar a média única **com** Amazon para a Amazon; para ML/Shopee também (uma média só). Conferir viés: o candidato já está em `members`; com n baixo exigir 4 ofertas (3 outras).
- Gatilhos próprios da Amazon (série própria, queda <= 30% automático, frescor 60/40 min, pausa 90 min, 2 leituras >= 15 min) permanecem; "na média" deixa de excluir a Amazon.
- Carimbo "Preço na Amazon em dd/mm às hh:mm, sujeito a alteração." obrigatório em toda menção (já em `product-stores-table.tsx`; auditar `group-messages.ts`).
- Mensagem de uma oferta Amazon não cita preço/link de outra loja (6(z)): diz "X% abaixo da média do mercado" sem nomear lojas; botão e link só `amazon.com.br/dp/ASIN?tag=...`, sem encurtar nem alterar (6(v),(w)).
- Cupons: nenhum cupom é aplicado ao preço da Amazon; só se o agente de cupons ler a fonte da Amazon; fora disso, nada.
- "Afiliado" não aparece ao cliente; o aviso de remuneração exigido pela Amazon usa a frase do contrato ("Como participante do Programa de Associados da Amazon, sou remunerado pelas compras qualificadas efetuadas"), ver D6.
**Site (c):** cabeçalho/selo/gráfico leem a mesma média com a Amazon; tabela de lojas já mostra carimbo; vitrine "oferta clicável" hoje exclui Amazon (decidir junto: sem isso a Amazon entra na média mas não é clicável pela vitrine).
**BI (c):** camada "por loja" no cartão-pai (plano parecer+BI): Amazon como série de loja com carimbo; sem série pública própria longa da Amazon (ver riscos).

## 5. Riscos jurídicos e contratuais (d)
| Cláusula | Risco com a mudança | Já aceito (ADR 0009)? |
|---|---|---|
| 1(h) cache de preço 24 h | Histórico oferta-dia da Amazon > 24 h | Sim (explícito) |
| Coleta por robô/aba logada | Violação da licença de PI | Sim |
| 1(c)-(e) agregar/analisar | A média é agregação e análise do preço da Amazon | Parcial (histórico sim; média não citada) |
| **6(z)** exibir conteúdo para anunciar produto de outros sites | Média única mistura lojas; mensagem da Amazon comparada com outras lojas | **Não** |
| **6(y)** rastreamento/alerta de preço | Mensagens de queda de preço e vigia | **Não** |
| 2(b) preço exibido | Só de link/API; carimbo; menor preço novo | Parcial (coleta assistida não é link/API) |
| 6(c) remover o que a Amazon retirar | Dependência de reconhecer saída (`consecutive_miss_count`) | Não |
| 5 aviso de remuneração | Dono dispensou em 10/11 | Dispensado pelo dono; contrato exige |
Consequências possíveis: suspensão da conta de Associados, retenção de comissões, rescisão com 7 dias; a conta tem 0 vendas, então a perda financeira direta hoje é pequena, mas a Amazon também é destino de links na BF. **Recomendação:** aceitar (decisão do dono) com mitigação: (i) manter só `games`; (ii) mensagens da Amazon sem citar outras lojas; (iii) retenção do bruto da Amazon curta (snapshots brutos > 30 dias podem ser apagados; fica a oferta-dia derivada) e **sem gráfico público de série longa só da Amazon**; (iv) pedir aprovação escrita à Amazon pelo Fale Conosco do programa (hoje, sem prazo); (v) interruptor `PRICE_AMAZON_MODE=off` documentado; (vi) reavaliar o aviso de remuneração só nas páginas/mensagens da Amazon (D6). Não é aconselhamento jurídico; vale consultar advogado antes de ligar.

## 6. Fases, critérios de aceite e calendário (e)
Feriado 15/11 (domingo) e 20/11 (sexta, congelamento). Datas de 2026.
| Fase | Datas | Entrega | Aceite |
|---|---|---|---|
| F0 Decisões e proteção | 11-12/11 | D1 a D4 respondidas; `PRICE_AMAZON_MODE` (`off`) lendo `members`; conferir `PRICE_METRICS_V2` na Vercel; correção do frescor por confirmação (`last_price_confirmed_at`) em modo leitura | Selo/mensagens com a mesma média por flag; Amazon não sai da média em 12-13/11 |
| F1 Esquema | até 14/11 (**antes do congelamento**) | Migration aditiva `last_confirmed_at`; gancho grava linha de confirmação; idempotente; RLS mantida | Rollback documentado; nenhuma linha reescrita |
| F2 Identidade | 12-17/11 | `identity-attrs.ts` (games primeiro), portões duros, faixa de revisão = `draft`; auditoria de 40 pares | Erro de identidade <= 2%; fila de revisão no admin |
| F3 Sombra e paridade | 14-18/11 | Paridade A e B; relatório antes/depois; reprocesso de 10-11/11 | A: diferença zero; B: lista revisada |
| **Ponto de decisão 17/11** | 17/11 | Resultado da auditoria e da paridade ao dono | Liga ou não |
| F4 Mensagens | 17-19/11 | Régua de 10% com média única em dry-run; carimbo e 6(z) auditados | 0 mensagem Amazon sem carimbo; 0 citando outra loja |
| F5 Ligar games | 19/11 | `PRICE_AMAZON_MODE=on` só games, monitorado | qa-verificador aprova (typecheck, build, SELECT, tela) |
| Congelamento | **20/11** | Sem esquema/regra nova; só correção de bug | — |
| Observação | 21-26/11 | Medir frescor, estados, eventos | Sem regressão; rollback pronto |
| Black Friday | 27/11 | — | — |
Fora do prazo (depois da BF): Amazon-only com descoberta própria, verticais não-games, leitura de GTIN pela página do ASIN.

## 7. O que não vai à BF sem decisão
Amazon-only e outras verticais; leitura de GTIN; exibição em app/site "projetado para celular" (Licença de PI (d), conferir).

## 8. Itens de código a rever na execução
`price-card.tsx` (`loadNonAmazonOffers`), `offer-card-model.ts` (flags `isAmazon`), `group-offers.ts` (`loadSeries`), `group-rules.ts` (`avg`, `amazonSeries`, "na média"), `live-recheck.ts`, `departamento.ts`, `daily-state.ts` (`resolveOffers` frescor), `amazon-assisted.ts` (identidade, vendedor, condição), `docs/inventario-lojas/amazon.md` (atualizar: já há 351 ofertas), `AGENTS.md` (emenda do texto "TODAS as lojas" para incluir Amazon-only).

## 9. Decisões do dono, uma por vez
- **D1. Incluir a Amazon na média única pública (selo, gráfico, cabeçalho), aceitando 6(z), 1(c)-(e) e 6(y) além do que o ADR 0009 já cobre?** Recomendo **sim, só games, com as mitigações da seção 5** e pedido de aprovação à Amazon em paralelo. Alternativa mais conservadora: a Amazon entra só no gatilho interno de mensagens e não no selo público (quebra "uma média só").
- D2. Limite de frescor da Amazon na média: **24 h** (recomendo, alinhado ao contrato e ao cartão) ou 48 h.
- D3. Amazon-only: média só com 3+ ASIN; com menos, "menor preço" e régua de 10% sobre o histórico próprio de 14 dias. Recomendo sim.
- D4. Identidade em dúvida fica **fora** da média (`draft`) até revisão. Recomendo sim.
- D5. Verticais: games agora; demais após a BF. Recomendo.
- D6. Aviso de remuneração só onde aparece a Amazon (frase do contrato). Recomendo reconsiderar, por ser "descumprimento material".

## 10. Emenda 2026-11-12: flexibilização da aprovação (aprovada pelo dono; implementada, não aplicada)
Código: `src/lib/affiliate/amazon-identity.ts` (objeto `FLEX`, opção `{ flex }`, kill-switch `AMAZON_ID_FLEX=off`), `src/server/collector/amazon-assisted.ts`, `src/server/collector/amazon-fila.ts`, `src/server/identity-queue/queue.ts` (origem `amazon_cobertura`). Scripts: `simular-flexibilizacao-amazon.ts` (SELECT), `aplicar-revisao-amazon-rascunhos.ts` (simula; `--apply`/`--rollback` só o dono). Testes: `npm run test:amazon`.
- **Portões duros não mudam** (condição nova, pacote/kit/acessório, plataforma, edição, região, voltagem, tamanho/capacidade, variante, modelo diferente, retrô/fora de linha). Entram numeral romano de sequência/edição anual como portão (`Player XXIII` x `XXV`, `God of War III` x `God of War`).
- **Cobertura baixa:** marca + código de modelo (inclui código hifenizado `AFON-12L`, casamento fraco que aceita só sufixo de letras) aceitam a partir de cobertura do master 0,30; de 0,15 a 0,30 vira rascunho de FRONTEIRA + pergunta na fila (eixo `identidade`, fonte `amazon` gravada em `understood`, porque o CHECK de `identity_review_items.source` não aceita o valor e não se altera esquema antes do congelamento); abaixo de 0,15 recusa. Sem código de modelo só fronteira, nunca aceite automático. Jogos: plataforma + edição iguais e todos os tokens do master presentes aceitam; fronteira calibrada na simulação.
- **Patrocinado:** o card nunca fornece preço. O servidor devolve `stats.paginas_pendentes` (`[{id, a}]`) com os patrocinados que seriam aceitos; a aba logada abre `/dp/ASIN`, lê o preço da página e reenvia o candidato com `s:1, pg:1, p:<preço da página>`. Só então é aceito (ASIN já ativo no master dispensa cobertura de título). **Requer a mudança correspondente no script da aba logada (fora do repositório).**
- **Fila:** todo rascunho da Amazon (novo ou existente) gera pergunta em `identity_review_items`; "sim" ativa a oferta (e entra na média), "não é este" mantém fora, desfazer devolve a rascunho. Reversível por `identity_decisions`.
- **Observabilidade:** `collector_runs.meta.stats` ganha `fronteira`, `fila_criados`, `paginas_pendentes` e `amostra_recusados` (30 por chamada, sem preço) para simular regras futuras sobre dado real.
