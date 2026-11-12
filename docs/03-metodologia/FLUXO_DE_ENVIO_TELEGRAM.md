# Fluxo de envio ao Telegram (lojas Plus): como está no papel

- **Criado em:** 2026-11-12, a pedido do dono ("documentar como está no papel hoje esse funcionamento e essa estrutura de decisão").
- **Fonte dos parâmetros:** leitura direta do código em 2026-11-12 (`src/lib/messaging/group-rules.ts`, `fase-formacao.ts`, `pool-diversidade.ts`, `src/server/messaging/group-offers.ts`, `group-auto.ts`, `group-queue.ts`, `src/lib/messaging/group-messages.ts`, `src/lib/catalog/tipos-produto.ts`).
- **Medições:** `scripts/medir-funil-plus.ts`, `scripts/medir-funil-plus-tipo.ts`, `scripts/medir-links-plus.ts`, `scripts/simular-plano-diversidade.ts` (todos somente leitura).
- **Ata da decisão:** `docs/conselho/atas/2026-11-12-diversidade-fluxo-plus.md`.
- **Lojas Plus** = livros, casa (`eletrodomesticos`), eletroeletrônicos, esporte, tecnologia e impressão 3D. Games segue a mesma cadeia, com cota própria, e não foi alterado.

Convenção das seções 2 a 7: **ANTES** = o que valia até a manhã de 2026-11-12 (é "o papel" que o dono pediu para documentar); **AGORA** = o que ficou depois da execução desta data. Cada portão traz valor, motivo e quanto barra, com a medição de 2026-11-12 (1.120 masters aprovados das lojas Plus com oferta confirmada nas últimas 3 h).

## 1. A cadeia em uma página

```
cron /api/cron/group-messages (vercel.json: todo minuto; maxDuration 60 s)
  -> runGroupMessagesCycle (group-auto.ts)
       1 expira propostas velhas; vigia da Amazon; contagem de inscritos e freio
       2 detectGroupCandidates (group-offers.ts)  [somente leitura]
            a pickProductIds      -> POOL de produtos a avaliar (cotas, razão de entrada, rodízio)
            b loadFacts           -> fatos reais (ofertas frescas, média, série, tipo)
            c evaluateProductV2   -> JUÍZO por produto (gatilhos + portões) -> candidatos e bloqueados
            d applyLimits         -> PLANO (dedup, espaçamento, cotas, diversidade)
       3 persistProposals         -> grava as decisões em group_messages (proposta_auto)
       4 laço de envio (até 60 voltas / 38 s por execução)
            applyLimits sobre a fila -> sendQueuedTelegram -> revalidateCandidate (reconferência AO VIVO + nova detecção) -> sendMessage/sendPhoto
       5 runRechecks (reconferência 30 min depois)
```

Estados da automação (`feature_flags: group_messages_auto`): `off` (só propostas manuais), `shadow` (decide e registra, não envia), `on` (envia sozinho o que é `auto`; o que exige aprovação humana fica parado). Travas de ambiente: `GROUP_MESSAGES_ENABLED`, `GROUP_MESSAGES_MODE=send`, token e chat id. Freio por queda de inscritos (padrão 5%).

## 2. Etapa A: seleção dos produtos candidatos (o POOL)

Função: `pickProductIds` (`group-offers.ts`) + `selecionarPool` (`pool-diversidade.ts`). Só entra no pool o produto com oferta **viva** (ativa, fora de quarentena, link de afiliado não pendente, preço > 0, confirmada na janela de detecção), elegível (`eligibleOfferSql`: novo, sem Open Box/usado, porteiro aprovado), dentro da média (`inAverageSql`) e no escopo (`masterNoEscopoSql`).

| Portão | ANTES | AGORA | Motivo | Quanto barra |
|---|---|---|---|---|
| Frescor da oferta no pool | `DETECT_MAX_AGE_MIN` = 180 min | igual | preço velho não é preço | quase nada: 1.119 de 1.120 masters tinham oferta fresca |
| Razão de entrada | exigida: queda de menor preço nas últimas 24 h (`ev`), movimento da série (`mv`), preço <= média do estado diário (`below`), >= 3 ofertas com o menor abaixo da média simples (`liveavg`), 2 redes com 15% de diferença (`nets`), >= 20 ofertas (`bigp`) | igual, mais o grupo **ACHADO** (produto vivo sem razão de entrada, sem envio nas últimas 24 h) | evitar avaliar o catálogo todo a cada minuto | produto de 1 vendedor **nunca** entrava: 418 de 1.120 (37%) |
| Cota por loja Plus | 60 produtos por loja, ordenados por razão e hash horário | 75 por loja por rodízio de TIPO (até 30 vêm direto de eventos de queda) + 30 extras de Achado por rodízio de TIPO | uma loja não pode consumir o lote inteiro | pool total antes: 360 de 1.120 (32%); agora: 629 |
| Rodízio | hash do produto + hora (`md5(mid + hora)`), sem olhar o tipo: 123 air fryers ocupavam o pool | rodada por TIPO (cada tipo da loja ganha um turno por rodada; abre a rodada o tipo MENOS enviado em 24 h); dentro do tipo, menor razão e hash horário | variedade | air fryer 28 de 60 vagas na casa antes |
| Games | 220 | 220 | sem mudança | |
| Teto do ciclo | `maxProducts` 600 | 900 | tempo de execução (detecção leva ~37 s a partir da máquina local; na Vercel é menor) | |

## 3. Etapa B: fatos reais (`loadFacts`)

Lê ofertas, vendedor, preço confirmado, série diária (`price_daily_offer`/`price_daily_state`, qualidade complete/partial), eventos de menor preço e a média única (a mesma do selo, `computePeriodMetrics`, janela de 30 dias, cada oferta vale 1 por dia). Na **fase de formação** (lojas fora de games, até 2026-11-29) a média sai das ofertas vivas (média simples). **AGORA** acrescenta: `tipo` do produto (`classificarTipo`, derivado do título, nunca gravado) e a **mediana do menor preço por master do mesmo tipo** (ofertas vivas, elegíveis, sem Amazon; cache de 10 min). O envio relê tudo com `SEND_MAX_AGE_MIN` = 30 min.

## 4. Etapa C: juízo por oferta (`judgeOffer`)

| Portão | Valor | Motivo | Quanto barra hoje (cabeça da oferta mais barata do produto) |
|---|---|---|---|
| Rede | só Mercado Livre e Shopee (Amazon só por regra própria; `other` fora) | API oficial | |
| Quarentena / fora da média | bloqueia | dado suspeito | |
| **Link de afiliado pendente** | ML só passa com link `https://meli.la/...` | o link é gerado pelo dono na aba logada (rota `ingest/ml-links`), um por vez | **313 produtos** (28%) têm a oferta mais barata sem link e eram descartados inteiros. Cobertura medida: ML sem link oficial = 1.229 de 1.727 ofertas na casa, 751 de 966 em eletroeletrônicos, 761 de 1.159 no esporte, 914 de 1.535 na impressão 3D, 1.820 de 2.422 em livros, 407 de 670 em tecnologia. Masters com ao menos uma oferta ML com link: casa 105/285, eletrônicos 52/162, esporte 132/336, impressão 3D 31/116, livros 90/243, tecnologia 59/140 |
| Frescor do preço | 180 min na detecção, 30 min no envio (Amazon 60/40) | preço confirmado, não gravado | |
| Reconfirmação | o preço precisa ter sido visto em 2 coletas separadas por >= 15 min (`CONFIRM_GAP_MIN`), salvo reconferência ao vivo | evita o preço que acabou de aparecer | 2 produtos |
| Identidade | `titleIdentityBlock`: região, edição, cross-gen, Open Box, usado | uma mídia, uma média; só produto novo | residual |
| Reputação ML | `5_green` ou `4_light_green`; < 10 vendas ou sem reputação = exige aprovação humana; amarelo ou pior = bloqueia | risco de vendedor oportunista | 12 produtos (amarelo) |
| Shopee | exige aprovação humana, salvo queda <= 20% com reconferência ao vivo | risco de ágio | |

## 5. Etapa D: juízo por produto (`evaluateProductV2`)

Escopo (`scopeBlock`): fora de linha/retrô (games), tipo fora do escopo, porteiro `review`/`rejected`, plataforma desconhecida (games). Depois, por oferta mais barata de cada grupo (ML+Shopee; Amazon à parte):

| Portão | Valor | Motivo | Quanto barra hoje |
|---|---|---|---|
| A oferta mais barata precisa passar nos filtros | se a mais barata é bloqueada (link, reputação...), o produto INTEIRO é descartado (G2/movimento) | não anunciar preço que o leitor não pode comprar | os 313 acima |
| Mínimo de lojas distintas (rede + vendedor) | formação: 2 (`FORMACAO.MIN_LOJAS`); depois de 2026-11-30: 3 (`RULES.MIN_STORES`) | comparar exige mais de uma loja | produtos de 1 vendedor: 418 (37%) |
| Mínimo de ofertas na média | 3 (`MED_MIN_OFFERS`, formação `MIN_OFERTAS_MEDIA`) e >= 1 dia de série (depois da corte: >= 3 ofertas, >= 5 oferta-dias, >= 14 dias) | média de 1 ou 2 ofertas não existe | **230 produtos** (21%) sem movimento nem média |
| Plausibilidade da média | ofertas fora de 0,35x a 3x a mediana saem da média simples | preço sentinela/ágio não decide média | residual |
| Régua "% abaixo da média" | formação: qualquer % > 0,1 (preço <= média); depois da corte: **>= 10%** (`MIN_BELOW_AVG_PCT`) | só avisar quando é bom | 30 candidatos retidos pela régua/revisão/retido |
| Texto com percentual | só com **>= 5 ofertas** na média (`MIN_AVG_OFFERS_CLAIM`); com menos, mostra a média simples "amostra pequena" sem % nem "abaixo" | caso PS5 (média de 3 anúncios enganou) | |
| Faixas de risco | desconto > 30% ou queda > 30%: aprovação humana; > 45%, preço < 0,35x ou > 3x a mediana: retido | erro de coleta/ágio | |
| Palavras proibidas | `afiliado`, `% OFF`, `de/por`, `imperdível`, `corre`, previsões etc. (`BANNED`) | regra do dono | trava final do texto |

Gatilhos (`Trigger`) e sua classe: **G2** "na média ou abaixo" (insight; é o ÚNICO que saiu nas últimas 24 h nas lojas Plus: 150 de 150 mensagens), **OK1** novo menor preço >= 5% abaixo do anterior (alerta; série >= 7 dias), **OK2** queda >= 5% ontem para hoje (>= 8% alerta; 5 a 8% radar), **T1** caiu 2 dias seguidos >= 3% (radar, série >= 4 dias), **T2** a até 4% acima do mínimo registrado (radar), **G3** diferença >= 15% entre redes, **G5** >= 20 ofertas, **G4** resumo do dia, **CUPOM**, **RADAR** composto (desligado: `RADAR_COMPOSITE_ENABLED = false`), **P1..P5** plataforma (1 a cada 6 mensagens de preço). **AC (novo)**: ver seção 8.

## 6. Etapa E: plano de limites (`applyLimits`)

Ordem das checagens por candidato (`auto`, enviável, não retido), todas em `group-rules.ts`:

| Checagem | Valor | Motivo |
|---|---|---|
| Teto diário, horário, por classe, noturno | `NO_CAP` (sem teto; decisão do dono 2026-11-11) | canal movimentado |
| Intervalo mínimo da classe | alerta/insight 0; radar 45 min composto; plataforma 20 min | |
| **Espaçamento por chat** | 3 s entre mensagens do mesmo chat (loja) e 20 por minuto (`chatSpacingBlock`) | limite do Telegram; uma loja não bloqueia a outra |
| **Dedup do produto** | G2/demais: 1 h (`PRODUCT_GAP_MIN`); novo mínimo (OK1) com preço menor repete em 30 min; **AC: 24 h** | anti-saturação |
| Cota do Achado por loja (novo) | max(3, 25%) das mensagens da loja em 24 h; 2 por hora | o Achado nunca vira a maioria |
| **Cota de tipo (novo)** | nenhum tipo passa de 30% das mensagens da loja em 24 h, **só se houver alternativa de outro tipo** e depois de 6 envios na loja; alerta de queda real não é freado | variedade sem parar o canal |
| Fila | 1 envio por volta; ordem: classe (alerta > resumo > insight > radar > plataforma > cupom); dentro de insight/radar, o **Achado só depois de insight com comparação real (novo)**, depois o **tipo menos enviado hoje na loja (novo)**, depois maior movimento; desempate por loja/plataforma da última enviada | |
| Som | só alerta e resumo, de dia, até 20 por dia (`SOUND_CAP`); o resto silencioso | |

## 7. Etapa F: envio e reconferência

`sendQueuedTelegram`: reivindica a linha de forma atômica (`proposta_auto` -> `enviando`), roda `revalidateCandidate` (reconferência AO VIVO na API oficial do marketplace, depois nova detecção só desse produto com frescor de 30 min; o gatilho original precisa continuar valendo e o preço não pode ter mudado mais de 2%), aplica os limites sem a própria linha, monta o cupom (só verificado, visto há <= 2 h) e o cartão (não vale para AC e radar), envia (`sendMessage`/`sendPhoto`, botão com o link), grava `message_id`, texto e hora. Proposta com mais de 6 h expira. Erro 429: respeita `retry_after`; falha definitiva (401/403) leva a automação a `off`. Reconferência de 30 min depois do envio (`runRechecks`). Orçamento por execução: 38 s e 60 voltas (`SEND_BUDGET_MS`, `MAX_SENDS_PER_RUN`).

## 8. O que mudou em 2026-11-12 (decisão do conselho)

1. **Gatilho AC "Achado"** (`evaluateProductV2`, modelo `achado` em `group-messages.ts`): anuncia o **preço atual confirmado** de produto que não gerou G2/movimento (1 vendedor, sem média). Texto: loja, preço, horário e "única oferta ativa que acompanhamos agora" (1 oferta) ou "menor preço entre as N ofertas ativas que acompanhamos agora" (só quando a citada é a menor) ou "preço atual confirmado, entre N ofertas" (quando a mais barata real não tem link e a citada está até 3% acima). **Sem %, sem "abaixo", sem "média", sem "desconto", sem "afiliado".** Portões: oferta válida com link oficial, identidade, reputação; preço entre 0,5x e 2,5x da mediana do tipo (amostra >= 5 masters; tipo "outros" não vale); com >= 3 dias de série própria, preço <= 1,10x e >= 0,5x a mediana dela; plausibilidade 0,35x a 3x das ofertas; dedup 24 h; cota por loja; só `auto` (vendedor com poucas vendas vira revisão). Não vale para games nem Amazon.
2. **Fallback de link:** se a oferta mais barata não tem link oficial e a seguinte COM link está até 3% acima, o Achado cita a seguinte (sem dizer "menor preço").
3. **Pool por rodízio de tipo** (`pool-diversidade.ts`): 75 por loja + 30 de Achado, tipos menos enviados primeiro, determinístico por hora.
4. **Cota de tipo 30% e rodízio no plano** (`applyLimits`), suave.
5. **Histórico com tipo** (`loadSentHistory`: `candidate.tipo`, ou derivado do nome nas linhas antigas) e `candidate.tipo` gravado nos novos candidatos.
6. **Migration 0032** (`drizzle/migrations/0046_group_messages_achado.sql`, NÃO aplicada): amplia o CHECK de gatilho para aceitar `AC`. Enquanto não for aplicada, `groupMessagesAchadoReady()` devolve falso e o Achado fica desligado (nada muda em produção). Kill-switch: `GROUP_ACHADO=off`.
7. **Não mudou** (vetos do conselho): `MED_MIN_OFFERS` (3), mínimo de 2 lojas na formação, régua de 10% depois da corte, 5 ofertas para afirmar %, dedup de 1 h do G2, espaçamento por chat, tetos, frescor de 30 min no envio, reconferência ao vivo.

## 9. Funil medido (2026-11-12, antes e depois)

Por loja (masters aprovados com oferta fresca / só 1 vendedor / no pool / com candidato enviável / sem nenhum gatilho):

| Loja | Frescos | 1 vendedor | Pool antes -> agora | Enviáveis antes -> agora | dos quais Achado | Sem gatilho antes -> agora |
|---|---|---|---|---|---|---|
| Eletroeletrônicos | 128 | 48 | 60 -> 105 | 14 -> 29 | 14 | 71 -> 0 |
| Casa | 262 | 89 | 60 -> 105 | 24 -> 72 | 48 | 138 -> 2 |
| Livros | 217 | 58 | 60 -> 105 | 22 -> 47 | 25 | 122 -> 11 |
| Esporte | 280 | 151 | 60 -> 105 | 19 -> 79 | 60 | 199 -> 2 |
| Tecnologia | 129 | 48 | 60 -> 105 | 24 -> 48 | 24 | 75 -> 9 |
| Impressão 3D | 104 | 24 | 60 -> 104 | 11 -> 22 | 10 | 43 -> 3 |
| **Total** | **1.120** | **418** | **360 -> 629** | **114 (10%) -> 297 (27%)** | **181** | **648 -> 27** |

Mensagens enviadas nas últimas 24 h (antes): casa 22 (11 produtos, 6 tipos, air fryer 11); eletroeletrônicos 28 (16 produtos, 9 tipos, soundbar 13, Smart TV 1); esporte 8 (6, 5); impressão 3D 37 (15, 2 tipos: filamento 20 e impressora 17); livros 19 (10, 4, RPG 16); tecnologia 36 (21, 5, placa de vídeo 25). **Todas** pelo G2.

Motivos de bloqueio, em ordem (total das 6 lojas, antes): 1 vendedor sem gatilho 418; link pendente na mais barata 313; sem movimento nem média 230; candidato retido/revisão/régua 30; reputação amarela 12; reconfirmação < 15 min 2; lojas abaixo do mínimo 1.

Remanescente depois (produtos em que o Achado foi avaliado e bloqueado, em ordem): nenhuma oferta válida com link 682 (link pendente 668, reputação amarela 9, reconfirmação 5), preço fora da faixa do tipo 56 (anti-ágio e anti-kit), mais barata sem link mais de 3% abaixo 17, tipo não classificado 10, amostra do tipo < 5 masters 7.

### Smart TV e geladeira (resposta ao dono)

- **Smart TV:** 19 masters aprovados em eletroeletrônicos, **11 com um único vendedor** (o dono viu mediana 1). Antes: 1 mensagem em 24 h. Por quê: (i) **nenhum** produto de 1 vendedor entra no pool, porque todas as razões de entrada exigem média, movimento ou 2 redes (portão "razão de entrada") e o G2 ainda exigiria >= 3 ofertas e >= 2 lojas; (ii) só 8 das 19 TVs entraram no pool; destas, 3 foram descartadas por "a oferta mais barata não passa nos filtros: link_pendente" e 5 não tinham gatilho; (iii) **15 das 19 TVs têm ao menos uma oferta do Mercado Livre sem link meli.la; em 9 das 11 de 1 vendedor o único anúncio está sem link**, portanto nem o Achado pode citá-las; (iv) 4 TVs têm 2 ofertas (sem média: mínimo de 3) e 1 gerou G2 (LG 55", 4 ofertas). Depois: as 19 entram no pool (Achado); 2 viram mensagem (1 por Achado). O resto só sai quando houver link.
- **Geladeira/freezer:** 26 masters (13 de 1 vendedor), antes 1 mensagem em 24 h; 7 bloqueadas por link pendente na mais barata, 18 sem gatilho. Depois: pool de 5 para 10, 5 enviáveis (4 Achados).
- **Conclusão:** o maior gargalo de variedade em TV, geladeira e quase todo item caro não é a régua de preço: é a **cobertura de link oficial** (65% a 75% das ofertas ML das lojas Plus sem meli.la). O Achado só abre o que tem link. Ver pendência P1.

## 10. Métricas de sucesso (conferir em 7 e 14 dias)

Por loja Plus e por dia: **produtos distintos**, **tipos distintos** (meta >= 5 onde houver candidato; hoje 2 a 9), **participação do tipo líder** (meta <= 30%; hoje: livros 84%, tecnologia 69%, impressão 3D 54%, casa 50%, eletroeletrônicos 46%), **HHI de tipos** (meta < 0,25), **repetição do mesmo produto por dia** (meta < 10%), **share de mensagens por loja**, **share do Achado** (meta <= 25% da loja), **cobertura**: % dos masters elegíveis enviados em 7 dias (meta >= 50%). Guarda-chuvas: saídas do grupo sem alta, zero reclamação de preço divergente, retirada de ofertas (<= 5%). Medição: `npx tsx --conditions=react-server --env-file=.env.local scripts/medir-funil-plus.ts` (funil e envios de 24 h) e `scripts/simular-plano-diversidade.ts` (plano com histórico real).

## 11. Pendências e riscos

- **P1 (dono):** priorizar a geração de links meli.la pelos tipos ausentes (TV, geladeira, esporte, tipos com 0 envio em 24 h). A fila de links é manual (aba logada).
- **P2 (dono):** aplicar a migration 0032 (com backup) para ligar o Achado; antes, rodar 24 h em `shadow`.
- **P3 (risco):** em 2026-11-30 a fase de formação termina (3 lojas, média oferta-dia, régua de 10%): o G2 das lojas Plus cai muito; o Achado e a cota de tipo foram feitos para segurar o volume, mas o cenário precisa ser remedido na véspera.
- **P4 (risco):** Achado de produto de 1 vendedor depende da mediana do tipo; tipos com preço muito disperso (bicicleta, esteira) bloqueiam mais.
- **P5 (técnico):** a detecção leva ~37 s a partir da máquina local; conferir o tempo real na Vercel antes de elevar mais o pool.
- Fora desta rodada: tipo "Cadeiras" (cadeira gamer) não existe em `tipos-produto.ts` (gamer-veterano); foto/cartão para o Achado.
