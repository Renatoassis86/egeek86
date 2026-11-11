# Mensagens automáticas para grupos (construído em 2026-11-10; motor v2 onda 1 e onda 2 em 2026-11-11)

Atas: `docs/conselho/atas/2026-11-10-mensagens-automaticas-para-grupos.md` (base) e `docs/conselho/atas/2026-11-10-mensagens-24h-cupons-storytelling-cobertura.md` (motor v2: §1 frequência e automação, §2 gatilhos, §5 storytelling, §5b Amazon, §8 vetos). Tudo nasce **DESLIGADO**. Nada foi commitado, publicado, aplicado no banco nem enviado ao Telegram.

## ONDA 2 (2026-11-11): fila com distribuição, reconferência ao vivo, volume e plataforma

Decisões do dono no mesmo dia, em ordem (a última vale): "pode enviar já, faça uma fila, cuidado para não mandar muito perto" -> "pode sair de minuto em minuto" -> "eu quero o canal movimentado". Código só escrito e testado: NADA foi aplicado no banco, commitado, publicado ou enviado. O motor segue atrás dos mesmos kill-switches (`GROUP_MESSAGES_ENABLED`, `GROUP_MESSAGES_MODE=send` e a linha `group_messages_auto`); a linha já está em `on` em produção com o motor da onda 1 e a onda 2 só passa a valer depois do deploy.

### Antes e depois

| Regra | Onda 1 | Onda 2 (vale agora no código) |
|---|---|---|
| Tetos | 30/dia (40 de 20 a 27/11), 8 sonoras, tetos por classe (6 alertas, 16 radares...) | 400/dia e 60/hora, sonoras <= 20/dia (o resto silenciosa), sem teto por classe |
| Intervalo entre mensagens | 15 min entre alertas, 60 entre radares, 120 entre insights | 1 min entre quaisquer mensagens, dia e noite iguais, sem jitter (a função de jitter por dia+hora existe e é testada, mas a amplitude vale 0) |
| Mesmo produto | 48 h (alerta) ou 24 h (radar/insight) | 90 min; novo mínimo (OK1/G1) com preço menor que o último envio repete após 30 min |
| Janelas de horário | insight 9h-21h, cupom 9h-21h, resumo 8h/20h, radar nos minutos 0 a 14 de 7h-23h | nenhuma: tudo 24 h; de 22h às 8h sai silenciosa. G5 (foto de preço) também 24 h |
| Radar | UMA mensagem com 3 a 6 itens por hora | uma mensagem POR ITEM; o radar composto é opcional (`RULES.RADAR_COMPOSITE_ENABLED`, desligado) e, se ligado, 1 a cada 45 min com os itens contados depois da reconferência ao vivo |
| Escolha da próxima | classe, depois gatilho | alerta > insight > radar; dentro da classe o maior movimento; diversidade (loja + departamento + plataforma) só como DESEMPATE entre candidatas de movimento >= 70% da primeira |
| Fila | até 3 tentativas por execução | no máximo 1 mensagem por execução; só depois do intervalo mínimo; proposta com mais de 6 h expira (era 3 h) |
| Frescor na detecção | 2 h | 3 h |
| Reconferência no envio | preço gravado com mais de 30 min expirava a mensagem | preço velho é consultado AO VIVO na API oficial (ML itens; Shopee lookup; Amazon não consulta), grava o snapshot, segue só dentro de 2% do detectado e com item ativo e estoque; limite de 8 s; falha de rede, sem estoque ou divergência expiram |
| Faixa verde (automático) | desconto <= 25% sobre a média, queda <= 30% | desconto <= 30%, queda <= 30%; 30 a 45% pede aprovação; > 45% retida |
| Faixa de plausibilidade | preço < 0,5x a mediana retido | fora de 0,35x a 3x a mediana = retido |
| Shopee | sempre aprovação humana | automática SE a reconferência ao vivo passar e a queda for <= 20% (a reconferência é obrigatória nas automáticas, mesmo com preço fresco) |
| Região/edição | só barrava região no título quando o master NÃO tinha a palavra | barra também pelo NOME DO MASTER e pelo título: Europeu/Europeia, Japonês/Japonesa, Importado/Import, USA, Americano, Asiático, Versão Internacional, Região (caso Hokko Life Europeu) |
| Gatilho "na média" | G2 exigia 15% abaixo da média (e média elegível de 14 dias) | G2 = preço atual (menor oferta viva reconferida) <= média única oferta-dia, com >= 3 ofertas e >= 1 dia de série; OK1 e OK2 têm prioridade; Amazon fica de fora (só histórico próprio e só alerta) |
| Texto | frases soltas | UMA oferta por mensagem com layout e história do preço (ver abaixo) |
| Classe PLATAFORMA (P1 a P5) | não existia | existe (ver abaixo) |

O que NÃO foi flexibilizado (são checagens de correção): reconferência ao vivo, bloqueio de região/edição/importado, faixa de plausibilidade, oferta sem estoque/inativa, link pendente, Amazon só com carimbo, `#publicidade`, nunca "afiliado", "De/por" ou "% OFF", zero previsão.

### Fila e plano do dia

- `applyLimits` (puro, `group-rules.ts`) devolve no máximo UM `next` por execução. Só passa se: o intervalo mínimo desde a última mensagem de QUALQUER classe passou (`spacingState`), o teto por hora (60) e por dia (400) não estourou, o produto não repete dentro de 90 min (30 min no novo mínimo) e, para plataforma, a cota está devida. O envio manual ("Enviar agora") ignora só o intervalo de 1 min; os tetos e a duplicata do produto continuam.
- `planDaySlots(now, sentToday, caps)` (puro e testado) calcula quantos slots restam e em que faixas (madrugada, manhã, tarde, início da noite, noite), respeitando intervalo e teto por hora. Em modo sombra, `simulada` ganha `planned_at` (migration 0031).
- `/admin/mensagens` mostra "Fila e distribuição do envio": fila ordenada com motivo, horário estimado de saída (pelo plano), o que foi enviado hoje, o intervalo vigente e quando sai a próxima. O botão de pausar (muda a flag para `off`) continua no painel de estado.

### Reconferência ao vivo (`src/lib/messaging/live-recheck.ts`, ligada em `group-queue.ts`)

1. Antes de gastar consulta, os limites já são checados (se adiam, a linha volta à fila). 2. Ofertas do candidato e concorrentes mais baratas com preço velho (até 4 por produto) são consultadas em paralelo, 8 s cada. 3. ML: `GET /items?ids=<MLB>&attributes=id,price,available_quantity,status,condition,seller_id` com o token da coleta (`mercado-livre-auth`); o id do anúncio vem da URL da oferta (oferta que só tem URL de catálogo não tem como reconferir e expira). Shopee: `lookupShopeeItem`. 4. Consulta OK grava o snapshot como o coletor (`recordPriceSnapshot`, source `api`, e `last_price_confirmed_at`). 5. Divergência > 2% sobre o detectado, item inativo, sem estoque, vendedor diferente, falha de rede ou limite estourado expiram a mensagem; concorrente sem estoque deixa de ser concorrência; concorrente com erro de rede expira (não dá para afirmar "menor preço"). 6. Só então re-detecta o produto com frescor de envio; o preço conferido ao vivo dispensa o intervalo de 15 min entre coletas.

### Mensagem de oferta (`formatOfferMessage`, `group-messages.ts`)

Telegram (HTML): 1) `<b>Título</b> <i>Switch · mídia física</i>`; 2) `<b>R$ 94,00</b> no Mercado Livre`; 3) variações em `<b>` (queda vs ontem, R$ abaixo da média com a média entre parênteses, distância do menor registrado), com 📉 só quando houve queda; 4) história do preço em `<blockquote>` (2 a 3 frases: o que aconteceu, por que importa, o que o dado permite concluir; nunca previsão; série pequena diz "Série de N dias, desde dd/mm" e não afirma tendência com menos de 3 dias); 5) cupom verificado, quando houver, com 🎟️ e `<code>` logo antes do link; 6) `<a>Ver a oferta</a>` com `?s=tg&m=<id>`; 7) `<i>Conferido em dd/mm às hh:mm (Brasília). #publicidade</i>`. No máximo 2 emojis, nenhum no título. WhatsApp: `*negrito*`, `_itálico_` e `> ` na citação. Todo texto de marketplace é escapado; a barreira reprova acima de 4096 caracteres e a legenda de foto cabe em 1024 (senão cai em texto).

### Classe PLATAFORMA (P1 a P5)

Mensagens curtas que vendem as funcionalidades do site com dado real do banco no momento do envio (`src/lib/messaging/group-platform.ts`, textos em `formatPlatformMessage`). Todas apontam para a página que existe hoje: `/monitoramento/comparar/<masterProductId>` (histórico, comparação entre lojas e ofertas do produto), com `?s=tg&m=<id>`.

| Código | Modelo | Dado real usado |
|---|---|---|
| P1 | Histórico | menor valor e a data, média, hoje, série de N dias desde dd/mm; leva o cartão de histórico (`renderCard`) |
| P2 | Comparar lojas | mesmo produto, ML x Shopee, diferença >= R$ 20, as duas ofertas reconferidas ao vivo |
| P3 | Monitorar | produto em destaque do dia (mais ofertas ativas), hoje e menor registrado; não promete aviso que o site não faz |
| P4 | Média única | "cada oferta vale 1 por dia" com ofertas, oferta-dias, dias e média do produto |
| P5 | Black Friday | dias até 27/11 e a variação medida desde 31/10 (só fato) |

Proporção (`platformDue`, `applyLimits`): pelo menos 1 plataforma a cada 6 mensagens de preço, no máximo 1 a cada 20 min, e também quando o canal fica sem preço há mais de 30 min; devida, ela passa na frente do preço; sai sempre silenciosa; rotaciona P1 a P5 sem repetir o modelo seguido e sem repetir o produto no mesmo dia; NÃO conta nos tetos de preço (mas respeita o intervalo de 1 min). Só é gerada com a migration 0031 aplicada (os CHECKs de gatilho e classe precisam aceitar P1..P5).

### Cartões

`cardFor` (injetável, ligado na rota do cron): card de oferta (`loadOfferCardInput` + `renderOfferCard`) para alerta/insight de preço e cartão de histórico (`renderHistoryCard`) para P1 e G5; este último segue o limite de 4 por dia e 1 por produto a cada 7 dias. Sem `cardFor`, vale o `renderCard` antigo. Falha ou 8 s sem resposta = mensagem em texto.

### Migration 0031 (escrita, NÃO aplicada)

`drizzle/migrations/0031_group_messages_onda2.sql` e `.rollback.sql`: 4 colunas nuláveis em `group_messages` (`planned_at`, `live_checked_at`, `live_price_cents`, `live_note`) e CHECKs ampliados (gatilhos P1..P5, classe `plataforma`). Sem ela o código funciona (a fila do admin é calculada em memória); só não grava o horário planejado, o resultado da reconferência e não gera plataforma.

### Arquivos da onda 2

Criados: `src/lib/messaging/live-recheck.ts`, `src/lib/messaging/group-platform.ts`, `src/server/messaging/live-recheck.ts`, `src/server/messaging/group-plan.ts`, `src/components/admin/group-send-plan.tsx`, `scripts/test-mensagens-onda2.ts` (`npm run test:mensagens-onda2`), migration 0031. Alterados: `group-rules.ts`, `group-messages.ts`, `group-offers.ts`, `group-queue.ts`, `group-auto.ts`, a rota do cron, `/admin/mensagens`, os rótulos do painel e os testes `test-mensagens-grupo.ts` e `test-mensagens-motor-v2.ts`.

## Resumo do motor v2 (onda 1; os números de tetos, janelas, intervalos e faixas abaixo foram SUBSTITUÍDOS pela onda 2 acima)

| Tema | Como ficou |
|---|---|
| Frequência | 30 mensagens por dia (40 de 20 a 27/11), no máximo 8 com notificação sonora, as demais com `disable_notification`. **24 horas, sem silêncio noturno**: de 22h às 8h tudo sai sem som, só alerta (no máximo 3 na noite) e radar. |
| Classes | A alerta imediato (6/dia; 10 na BF; 15 min entre alertas), B radar horário (16/dia; 20; 60 min; 7h-23h na hora cheia), C insight (4/dia; 6; 120 min; 9h-21h), D resumo (2/dia; 3; 8h e 20h, 22h na BF), E cupom verificado (3/dia; 5; 180 min; 9h-21h). Som só em A e D. Intervalo mínimo de 15 min entre sons (a segunda sai silenciosa). |
| Gatilhos (movimento na série diária) | OK1 novo mínimo >= 5% sobre o menor anterior; OK2 queda de ontem para hoje >= 5% (>= 8% = alerta, 5 a 8% = radar); T1 caiu 2 dias seguidos (acumulado >= 3%); T2 a até 4% acima do menor registrado. Não exigem média. Séries curtas: 7 dias para OK1/OK2/T2, 4 dias para T1. A média (mesma do selo) entra só como contexto e como faixa de risco. |
| Decisão por faixa | Verde (ML, vendedor 5_green/4_light_green com >= 50 vendas, >= 3 lojas, preço reconfirmado, desconto <= 25% e queda <= 30%) = automático. Shopee, desconto > 25%, queda > 30%, vendedor sem reputação/poucas vendas, nicho novo = aprovação humana. Desconto > 40%, queda > 45% ou preço < 0,5x a mediana = **retida** (só aparece no admin). |
| Amazon | Entra por conta e risco do dono. Só em alerta (OK1, OK2 >= 8%), nunca no radar. Preço pode disparar com confirmação <= 60 min e só é **enviado** com confirmação <= 40 min. Compara só com o histórico da própria Amazon (nunca com a média das outras lojas). Carimbo obrigatório: "Preço na Amazon em dd/mm às hh:mm, sujeito a alteração." (a barreira de texto reprova menção à Amazon sem esse carimbo). Pausa se `collector_runs` job `amazon-assistida` (status ok) ficar > 90 min sem lote. Oferta que some da busca (`consecutive_miss_count > 0`) sai dos gatilhos na primeira ausência; para voltar precisa de 2 observações separadas por >= 15 min (tabela `group_offer_watch`). Queda > 30% sobre a mínima da própria Amazon = aprovação; > 45% = retida. |
| Automação | `feature_flags` chave `group_messages_auto`: `enabled` + `rules.state` = `off` \| `shadow` \| `on` (linha ausente = off; `enabled=false` vence qualquer `rules.state`; valor desconhecido = off). Cache de 30 s por instância. |
| Freio | `getChatMemberCount` a cada ~55 min, gravado em `group_member_counts`. Se a contagem cair mais que `rules.maxMemberDropPct` (padrão 5%) em relação ao **pico das últimas 24 h**, o envio automático pausa (as aprovadas à mão ainda saem). |
| Cron | `GET /api/cron/group-messages` (não agendado). Idempotente, tolera execução sobreposta, no máximo um envio por execução, reconferência do preço 30 min depois. |

## Estados da automação

- **off** (padrão): o cron só grava propostas (todas com aprovação humana) e envia as **aprovadas na tela** (se `GROUP_MESSAGES_MODE=send`). É o comportamento da 0028.
- **shadow**: o cron decide e **registra** em `group_messages` com status `simulada` e `sim_state` (`enviaria_som` ou `enviaria_silenciosa`) o que teria enviado naquela execução. **Não envia nada**, nem as aprovadas à mão. A simulação respeita os tetos (as decisões `enviaria` contam como envio no histórico) e passa pela mesma releitura de preço do envio real (frescor 30 min; Amazon 40 min). Também grava as de risco como `proposta` e as retidas como `retida`.
- **on**: grava as seguras como `proposta_auto` e envia uma por execução, na ordem alerta, resumo, radar, insight, cupom. As de risco ficam `proposta` (esperam o dono), as retidas ficam `retida`.

Kill-switch (qualquer um para o envio): linha `group_messages_auto` (vale em até 30 s, sem deploy), `GROUP_MESSAGES_ENABLED` ausente/0, `GROUP_MESSAGES_MODE` diferente de `send`, token/chat id ausentes, botão "Desligada" no admin. Falha definitiva do Telegram (401/403/chat inexistente) grava `erro` e muda a linha para `off` sozinha ("pausa automática").

## Ciclo do cron (`src/server/messaging/group-auto.ts`)

1. Estado da automação (sem a migration 0030, tudo vale como `off`). 2. `expireStale` (proposta e proposta_auto em 3 h, radar automático em 20 min, aprovada em 12 h, retida em 24 h; linha `enviando` parada há mais de 10 min vira `erro` e **nunca** é reenviada). 3. Vigia da Amazon (`group_offer_watch`). 4. Contagem de inscritos e freio. 5. Detecção (`detectGroupCandidates`, v2) e radar composto. 6. Grava as decisões. 7. Envio (só estado `on`, ambiente ok, sem freio): `applyLimits` sobre a fila, depois `sendQueuedTelegram`. 8. Reconferência de 30 min (`runRechecks`). 9. `collector_runs` job `group-messages`.

`sendQueuedTelegram` (`group-queue.ts`): trava de ambiente; **reivindicação atômica** `UPDATE ... SET status='enviando' WHERE status IN ('aprovada','proposta_auto') AND attempts < 3 RETURNING` (duas execuções nunca enviam a mesma linha); histórico sem a própria linha; **releitura do preço** (`revalidateCandidate`: re-detecta o produto com frescor 30 min / Amazon 40, o gatilho precisa continuar valendo, preço dentro de 2% do detectado e ainda na faixa segura); limites; cupom e cartão opcionais; envio; grava `provider_message_id`, texto enviado, `is_sound`, `has_card`, `recheck_due_at` (+30 min). Falha temporária volta à fila (até 3 tentativas). Mensagem enviada nunca é apagada nem editada; a reconferência só grava `recheck_price_cents`, `recheck_divergence_pct` (divergência > 2% é contada no admin) e `recheck_note`.

## Pontos de ligação (outros engenheiros; este código NÃO importa esses módulos)

- `renderCard?: (masterProductId: string) => Promise<Buffer | null>`: cartão de histórico em PNG. Se vier, alerta e insight saem por `sendPhoto` (multipart, sem URL pública) com a mesma legenda HTML (<= 1024 caracteres; maior que isso cai em `sendMessage` e o resultado traz `photoSkipped`). Respeita 4 cartões por dia e 1 por produto a cada 7 dias (`has_card`). Falha ou demora (8 s) do renderizador = mensagem em texto.
- `couponLookup?: (offerId: string) => Promise<{ code; conditions; expiresAt: string | null; verifiedAt: string } | null>`: cupom verificado. A linha "Cupom: ..." entra antes do link só se visto há <= 2 h, ainda dentro da validade lida e se o texto final passar na barreira de termos; senão a mensagem sai sem cupom.
- Onde ligar: `runGroupMessagesCycle({ renderCard, couponLookup })` em `src/app/api/cron/group-messages/route.ts` (o comentário no topo traz os imports sugeridos). O envio manual da tela ("Enviar agora") usa `sendApprovedTelegram(id, now, { renderCard, couponLookup })` com o mesmo contrato.

## Arquivos

Criados
- `src/lib/messaging/group-automation.ts`: estado da automação, `dispositionOf`, `rowStatusFor`, `canAutoSend`, freio de inscritos (puro, testado).
- `src/server/messaging/group-automation-store.ts`: leitura (cache 30 s) e gravação da linha `group_messages_auto`.
- `src/server/messaging/group-auto.ts`: ciclo do cron, vigia da Amazon, contagem de inscritos, vencedor do modo sombra.
- `src/server/messaging/group-overview.ts`: números do cabeçalho de `/admin/mensagens`.
- `drizzle/migrations/0030_group_messages_v2.sql` e `.rollback.sql` (NÃO aplicadas, NÃO no `_journal.json`) e `scripts/apply-group-messages-v2.ts` (dry-run por padrão).
- `scripts/test-mensagens-motor-v2.ts` (207 verificações; `npm run test:mensagens-motor-v2`).
- Da base de 2026-11-10: `group-config.ts`, `group-messages.ts`, `group-rules.ts`, `telegram-send.ts`, `group-offers.ts`, `group-queue.ts`, `group-view.ts`, ação, painel, cron, migration 0028, `scripts/test-mensagens-grupo.ts` (219 verificações), `scripts/telegram-teste.ts`.

Alterados no motor v2
- `group-rules.ts`: `RULES` v2, classes, `detectMovement`, `riskAssess`, `evaluateProductV2`, `composeRadar`, `applyLimits` (tetos, classes, janelas, som, noite, dedup, rodízio), `soundDecision`, `cardAllowed`, Amazon em `judgeOffer` (opcional; sem a opção a Amazon continua bloqueada nos gatilhos legados G1 a G6).
- `group-messages.ts`: modelos `movimento` e `radar`, barreira contra previsão ("vai cair", "deve cair", "tende a", "previsão", "hora de comprar", "garantido"), Amazon só com carimbo, `withCouponBlock`.
- `telegram-send.ts`: `silent`, `photo` (sendPhoto multipart), `getTelegramMemberCount`.
- `group-offers.ts`: séries diárias (ML/Shopee e Amazon separadas, de `price_daily_offer` nos dias com qualidade complete/partial desde 31/10), média só quando há movimento, histórico com classe/som/cartão/radar, `groupMessagesV2Ready`, saúde da coleta Amazon.
- `group-queue.ts`: persistência por estado, reivindicação atômica, revalidação, reconferência, expiração.
- Tela `/admin/mensagens`: cartão de estado da automação (off/shadow/on com botões), freio, Amazon, contagens e blocos "Pedem a sua aprovação", "Retidas", "Automáticas na fila", "Decisões do modo sombra". Ação `setAutomationStateAction` (exige admin, grava `feature_flags`; shadow e on são recusados se a 0030 não foi aplicada).

## Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `GROUP_MESSAGES_ENABLED` | ausente = desligado | Segunda trava. `1` ou `true` liga o cron. |
| `GROUP_MESSAGES_MODE` | `dry` | Só o valor exato `send` permite enviar. |
| `GROUP_MESSAGES_AD_TAG` | `#publicidade` | Marcação de publicidade. Vazio, `none` ou `off` = sem marcação. Texto com "afiliad..." volta ao padrão. |
| `TELEGRAM_BOT_TOKEN` | ausente | Token do bot (Sensitive na Vercel). |
| `TELEGRAM_GROUP_CHAT_ID` | ausente | Id do grupo/canal (começa com `-100`). |
| `CRON_SECRET` | já existe | Autentica o cron (Bearer). |

## Como ligar o motor v2 (passo a passo; nada disto foi executado)

1. Backup (`pg_dump -t group_messages`) e aprovação do dono. 2. `npx tsx --env-file=.env.local scripts/apply-group-messages-v2.ts` (dry-run) e depois `--apply`. 3. Dono agenda o cron no `vercel.json` (sugestão `*/5 * * * *` em `/api/cron/group-messages`; o radar só sai nos minutos 0 a 14 da hora). 4. Em `/admin/mensagens`: **Modo sombra** com `GROUP_MESSAGES_ENABLED=1` e `GROUP_MESSAGES_MODE=send` (em sombra nada é enviado). 5. Depois de 24 h de sombra, conferir 30 decisões `simulada` contra o banco (preço, loja, carimbo, link, texto) com 0 divergência (veto do QA, ata §8). 6. Botão **Ligada**. 7. Acompanhar no cabeçalho: enviadas e com som (24 h), inscritos e freio, Amazon, reconferências divergentes.

## Reversão

- Parar tudo na hora: botão **Desligada** (vale em até 30 s) ou remover `GROUP_MESSAGES_ENABLED`.
- Tirar o cron: remover a entrada do `vercel.json`.
- Banco: `scripts/apply-group-messages-v2.ts --rollback` (volta ao desenho da 0028; os CHECKs antigos voltam `NOT VALID`, nenhuma linha é apagada) e, se quiser tudo, `apply-group-messages.ts --rollback`.
- Código: remover os arquivos criados e restaurar os alterados.

## Fatos que a equipe precisa saber

- **Teste feito em leitura contra o banco (11/11, ~00h):** o detector v2 rodou sobre 400 produtos em ~14 s (sem escrever): 29 candidatos (alertas OK2, itens de radar T2/OK2, insights G3/G5) e um radar composto de 5 itens, com links `/go/<slug>?s=tg&m=<id>`. As tabelas da 0030 ainda não existem em produção, então `groupMessagesV2Ready()` é falso e o cron cai no modo da 0028.
- A série vem de `price_daily_offer` (menor preço por oferta-dia, só ofertas elegíveis) nos dias em que `price_daily_state` tem qualidade `complete/partial`, desde 31/10. É mais correta que `price_daily_state.min_cents` (que mistura a Amazon), por isso as contagens da ata (que usaram o mínimo diário misto) podem diferir um pouco.
- O preço de "hoje" nos gatilhos é o da oferta viva mais barata (a que o cliente vai ver), não o mínimo parcial do dia.
- Telegram usa `parse_mode: HTML`; todo texto de marketplace passa por `escapeTelegramHtml`; no `href` o `&` vira `&amp;` (o Telegram devolve o link correto).
- O texto, o `m` do link e a linha em `group_messages` são o mesmo identificador: se a releitura escolher outra oferta, o texto enviado mantém o `m` da linha.
- Estados da tabela: `proposta`, `aprovada`, `proposta_auto`, `simulada`, `retida`, `enviando`, `enviada`, `rejeitada`, `expirada`, `erro`.

## Pendências

- Resumo (classe D) e insight (classe C) em formato novo: G4 ainda depende de G1/G2 (que saíram da v2), então hoje o resumo não é gerado; G3/G5 seguem os modelos antigos. Cupom (classe E) só tem o ponto de ligação.
- `/go` precisa aceitar `s` e `m` (outro agente) e filtrar prévias de WhatsApp/Telegram.
- G6/nichos só saem quando liberados no porteiro e no `/go` (hoje: não enviável).
- Baseline da foto de preço (24/11 e 27/11) ainda não é lido de lugar nenhum.
- Reconferência só registra: a regra da ata de voltar sozinho para aprovação após 2 divergências em 24 h não foi implementada (os números aparecem no cabeçalho do admin).
- Falhas temporárias seguidas (3) não pausam a automação; só a falha definitiva pausa.
- Revisão jurídica da frase de publicidade. Revogar e regenerar o token do bot antes de ligar o automático (ata §9.9).
- Onda 2: páginas do site para P3 (monitorar) e P4 (média) são a mesma página do produto; conferir se o site honra `?s=tg&m=<id>` fora do `/go` (hoje só o `/go` registra origem).
- Onda 2: o mesmo produto agora pode voltar em 90 min; o rodízio por produto de um catálogo pequeno pode repetir muito. Medir no modo sombra antes de manter 400/dia.
- Onda 2: concorrente mais barata com preço velho só é conferida se estiver na janela de 3 h; se o catálogo do ML mudar de id de anúncio, a oferta sem id na URL expira em vez de ser enviada.
- Onda 2: Amazon "na média" não existe (só histórico próprio e só em alerta). Média própria da Amazon exigiria definir a base (decisão do dono).
- Onda 2: G3 (comparativo) e G5 (foto de preço) mantêm os textos antigos (já factuais); só movimento e "na média" usam o layout com história.
