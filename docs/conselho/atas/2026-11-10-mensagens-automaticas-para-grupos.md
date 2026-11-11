# Ata do Conselho Geek: mensagens automáticas de oferta para grupos (vender até a Black Friday)

- **Data:** 2026-11-10 (Black Friday em 2026-11-27: faltam 17 dias)
- **Porte:** médio-grande. SOMENTE LEITURA E PLANEJAMENTO: nenhum código, banco, Vercel ou commit foi alterado; nenhuma mensagem real foi enviada; as ferramentas do Chrome não foram usadas. Foi criado e apagado um script temporário de SELECT (`scripts/_x.ts`).
- **Presidente:** geek-lead
- **Convocados (pareceres independentes, em paralelo):** estrategista-mercado, especialista-precos, gamer-veterano, editor-noticias, integrador-apis, engenheiro-backend, seguranca-db, qa-verificador. Conselho consultivo; decisão de negócio é do dono.

## Briefing
Decisão do dono (2026-11-10): "O foco nesse momento será VENDER e criar as MENSAGENS AUTOMATIZADAS para enviar nos GRUPOS". O dono ainda não disse quais grupos existem (WhatsApp e/ou Telegram). Pergunta a decidir: o que o código envia sozinho, o que é copiar-e-colar assistido, quais as regras de gatilho e os limites anti-spam, quais os modelos de texto, como medir, e o que dá para entregar até 14/11.

Regras inegociáveis em jogo: zero dado fake (todo preço, média, desconto e "menor preço" vem do banco, com a consulta de origem); o "de/por" do marketplace NÃO vale como desconto; comparar com a média única do produto por oferta-dia (ADR 0004) e com o menor preço de `price_min_events`; cliente nunca vê "afiliado"; preço da Amazon sempre com data e hora; só games público enquanto os nichos não estão liberados; Black Friday só Mercado Livre e Shopee (ata de 10/11 de manhã); nada destrutivo sem autorização.

Convenção: **[D]** dado medido hoje (SELECT de leitura, 10/11 ~22h30 local, 01h24 UTC de 11/11), **[C]** visto no código, **[H]** hipótese, **[R]** recomendação.

## Estado verificado hoje

### O que existe no código [C]
- `src/server/notifications/` é **por usuário**: `detect-price-drops.ts` lê `affiliate_price_watches` e usa a base legada de `product-price-stats.ts` (ADR 0001, cotação bruta, limiar de 12% sobre a média); `send-daily-digest.ts` manda e-mail e Telegram a quem monitora; `send-telegram.ts` faz `sendMessage` por `chat_id` com `parse_mode: 'HTML'` sem escapar o texto; `send-whatsapp.ts` é Cloud API 1 a 1 com template. Nenhum deles serve a grupos, e a base de preço do detector **não é** a da ADR 0004. O texto atual do Telegram usa `/ofertas/<slug>` (página), não `/go`.
- `src/lib/affiliate/message-template.ts` + `src/components/affiliate/whatsapp-message-drawer.tsx` (botão "Gerar mensagem WhatsApp" em `/admin/ofertas/[id]`) já fazem o **copiar-e-colar assistido** e gravam em `affiliate_messages` (`recordMessageCopied`). **Viola regras de hoje:** monta "De ~X~ por Y (N% OFF)" com `listPriceCents` manual ou `avgPriceCents`, e afirma "MENOR PREÇO JÁ REGISTRADO em todas as lojas" sem janela. Precisa ser corrigido antes de qualquer uso em massa.
- `/go/[slug]/route.ts` redireciona para `affiliate_url` do banco (302), grava `affiliate_click` com `referer`/`userAgent` e **ignora a query string**. Filtra `vertical = 'games'`. Não bloqueia `affiliate_link_pending` (ata de estado de 10/11).
- `src/lib/auth/cron-auth.ts` falha fechado (bom), mas aceita `?key=` na URL (aparece em log).
- `vercel.json` já tem crons de 5 em 5 minutos (coleta), logo o plano comporta cron de 15 min [H: o arquivo indica, não prova o plano].

### O que há no banco [D]
- Canais em produção: nenhum bot nem número configurado (informado pelo dono da tarefa); `notification_deliveries` exige `user_id` (não serve a grupo).
- Perfis 8; monitoramentos ativos 16 (2 usuários). Cliques no `/go`: 1.052 desde 16/07, **154 em 30 dias**, **977 de 1.052 (93%) sem referer** (apps de mensagem não enviam). Ou seja, hoje o canal de saída quase não tem tráfego, e o referer não mede nada.
- Ofertas ativas games fora de quarentena por rede: Mercado Livre 9.901, Shopee 1.150, Amazon 261 (a ata de 10/11 media 138; a coleta assistida cresceu). `last_price_confirmed_at` nos últimos 2 h: 11.318 de 11.325 ativas games. Para gatilho, o frescor deve usar **`last_price_confirmed_at`** (a API devolveu preço), não `last_checked_at` (carimbado em grupo).
- `price_min_events`: 621 eventos nas últimas 24 h, 227 deles quedas do menor preço (`min_cents < prev_min_cents`), todos `live`. A série de eventos só é confiável **desde 31/10** (primeiro evento dos produtos examinados: 31/10), embora os snapshots comecem em 13/07.
- Funil de candidatos em 24 h (uma queda por produto, oferta ainda é a mais barata, confirmada em < 2 h, ativa, fora de quarentena, porteiro diferente de review/rejected, título sem open box/usado, `product_type = game`; equivalência aproximada de `eligibleOfferSql`, a implementação real deve usar a função):

| Filtro (cumulativo) | Produtos |
|---|---|
| Queda do menor preço em 24 h com oferta vigente e fresca | 104 (Amazon 50, Mercado Livre 39, Shopee 15) |
| >= 2 lojas | 94 |
| >= 3 lojas | 86 |
| + média elegível (>= 3 ofertas, >= 5 oferta-dias, >= 14 dias) | 22 |
| + fora Amazon + >= 10% abaixo da média | **5** (todos Mercado Livre) |
| + >= 15% abaixo da média | 4 |
| + queda >= 8% sobre o menor anterior (gatilho "menor preço registrado") | 1 (Tomba!); com 5%: 2 |

  A Amazon domina o topo com "descontos" de 40% a 63% contra a média (ex.: NBA 2K25 PS5 a R$ 83,99 contra média de R$ 226,69). [H] erro de variante/vendedor; ver teto de revisão humana. Medi só eventos de 24 h; **não medi** o estoque de ofertas hoje 15% abaixo da média sem evento recente (o gatilho "abaixo da média" vê esse estoque).
- Dois achados de identidade que um robô cometeria: (1) a oferta Shopee "Super Mario 3D World + Fury World ... (Original japonês)" está no master nacional e produziu uma falsa queda de 35,7% (R$ 209,90 contra R$ 326,69 no ML); 1 de 25 quedas Shopee em 24 h tem termo de região/importado no título; (2) as séries de console oscilam no mesmo dia (PS5 Slim Digital: R$ 3.099,00 a R$ 3.500,00 em 2 h, quando o vendedor sai), então um evento de queda isolado não é sinal estável.
- Demanda: não há ranking de demanda confiável (cliques por produto: máximo 6 em 90 dias). Para "produto com demanda" usar proxy medido: nº de ofertas ativas (>= 3), monitoramentos ativos e cliques; nunca inventar popularidade.
- Nichos novos: 52 masters nas 4 verticais, todos `catalogGate = review`, 0 visíveis. Ofertas ativas: tecnologia 106, livros 135, eletroeletrônicos 28, eletrodomésticos 13. `/go` filtra games.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estrategista-mercado | Favorável, cadência baixa, filtro rígido | 1 oferta por mensagem; 2 por dia no normal, até 5 na semana da BF (24 a 27/11); silêncio 22h-8h; Telegram primeiro; segmentar o grupo por plataforma | Quais grupos existem e tamanho; taxa de saída tolerada |
| especialista-precos | Só envia o que passa em todos os filtros; na dúvida, revisão humana | >= 15% abaixo da média; menor registrado só com a janela dita ("desde 31/10/2026"); preço confirmado em 2 coletas >= 15 min; desconto > 40% vai a revisão humana; revalidar < 30 min antes de enviar; Amazon sem carimbo não sai; região no título bloqueia | Distribuição final pós-filtro (medida abaixo) |
| gamer-veterano | Curto, verificável, sem adjetivo | Primeira linha com título + plataforma + mídia; menor preço com data; tom de colega que avisa; poucas mensagens por dia | Frequência tolerada pelo grupo |
| editor-noticias | Até 5 linhas e 60 palavras, 1 emoji, negrito só em produto e preço | Toda linha vem de variável (variável vazia some a linha); fecha com "Conferido às HHhMM"; identificação de publicidade mínima em 3 opções | Revisão jurídica da frase de publicidade |
| integrador-apis | Apoio com ressalvas (não verificou fontes oficiais nesta rodada) | Telegram Bot API primeiro; WhatsApp só assistido; NÃO usar automação não oficial | Quais grupos; reverificar política atual do WhatsApp |
| engenheiro-backend | Viável | Detector SQL + outbox com UNIQUE + entregas + dry-run + kill-switch + revalidação + `?s=&m=` no `/go` + cron de 15 min | Plano Vercel real |
| seguranca-db | Apoio com 6 exigências | Token e chat id só em env; escape HTML; Bearer apenas nos crons novos; tabela com RLS e REVOKE; filtrar bots de preview no `/go`; whitelist de utm | Nenhum |
| qa-verificador | Veto a qualquer dado não rastreável | Dry-run de 7 dias e 0 divergência em 50 mensagens conferidas; checklist por mensagem; 11 vetos | Não abriu os arquivos; plano por contrato |

Ressalva honesta: estrategista, gamer e editor opinaram sem ler o banco; preços, integrador e QA declararam que não verificaram fontes ou arquivos. O que é número nesta ata é meu (medição de hoje).

## Divergências e réplica (rodada 2)
1. **Cadência:** estrategista pede 2 por dia (5 na BF); o backend sugere teto de 3 por hora e 15 por dia. **Resolução:** o teto do backend vira apenas trava de segurança global (kill); a cadência de negócio é a do estrategista, sobre o que de fato passa no filtro (hoje ~5 candidatos por 24 h, então 2 a 3 por dia já é o teto natural).
2. **Dedup:** preços pede 24 h por produto; estrategista, 48 h salvo novo menor preço. **Resolução:** 48 h por produto; um novo menor preço registrado, pelo menos 5% abaixo do preço enviado e depois de 6 h, rompe a janela.
3. **Confirmação em duas coletas:** preços exige; o backend cobre com revalidação. **Resolução:** as duas (a segunda coleta como filtro de oscilação, a releitura como trava final). O caso do console que sobe e desce em 2 h justifica.
4. **Shopee:** preços exige loja oficial ou Preferred; o banco não guarda esse atributo e a série de oferta-dia da Shopee tem 7 a 11 dias. **Resolução:** Shopee só entra por **aprovação humana** (fila) até a série passar de 14 dias e o atributo de loja existir; hoje ela não dispara sozinha.
5. **Frase de publicidade:** editor ranqueia três opções; decisão é do dono (risco abaixo).

## Decisão (proposta ao dono)

### 1. Arquitetura e canais
| Canal | Papel | Como |
|---|---|---|
| **Telegram (grupo ou canal)** | **O código envia sozinho** (depois do dry-run e da liberação), Bot API oficial | `sendMessage` com `parse_mode: HTML`, `link_preview_options`, tratamento de 429 com `retry_after`. Webhook atual não conflita (só trata `/start`). Limites a respeitar [conhecimento prévio, reverificar em core.telegram.org]: ~1 mensagem/s por chat, ~20/min por grupo |
| **WhatsApp (grupo, comunidade ou canal)** | **Copiar-e-colar assistido** | Fila no admin com a mensagem pronta, botão copiar e botão "abrir no WhatsApp" (`wa.me`), reaproveitando o drawer, com horário e destino registrados. O dono (ou quem ele indicar) cola |
| WhatsApp Cloud API | **Fica de fora** para grupos | Cloud API só envia 1 a 1 com template e opt-in [conhecimento prévio; NÃO CONFIRMADO nesta rodada]. NÃO CONFIRMADO: a Meta anunciou em 2025 uma Groups API para a plataforma de negócios, com limite pequeno de participantes; reverificar antes de descartar de vez |
| Canal do WhatsApp (Channels) | Opção a decidir pelo dono: postagem manual pelo app | NÃO CONFIRMADO que exista API de postagem. É o melhor lugar para audiência grande (não expõe números). Lista de transmissão só chega a quem salvou o número |
| Automação não oficial (Baileys, whatsapp-web.js etc.) | **FORA. Recomendação de não implementar** | Viola os termos; risco de banimento permanente do número do dono (perde contatos e atendimento). É contornar bloqueio |
| E-mail / resumo por usuário | Já existe, não muda | Fora do escopo desta ata |

**O que o código faz sozinho:** detectar gatilhos, validar, montar texto, enfileirar, revalidar o preço, respeitar limites e (Telegram, em modo `send`) postar. **O que é assistido:** WhatsApp inteiro e qualquer oferta Shopee. **O que fica de fora:** Amazon (ver abaixo), Magalu, AliExpress, usados/Open Box, console retrô, qualquer oferta sem `last_price_confirmed_at` recente.

**Amazon:** por padrão **desligada** nas mensagens. Razões: a ata de 10/11 define Black Friday só ML e Shopee; a licença de PI da Amazon proíbe alerta de preço sem aprovação escrita (6(y)) e limita cache de preço a 24 h; a conta não está aprovada na Creators API; e os 50 "descontos" de 40% a 63% são suspeitos. Se o dono mandar ligar, o formato é fixo: "Preço na Amazon em 10/11 às 21h47, sujeito a alteração", usando `last_price_confirmed_at` como carimbo, sem comparar com a média de outras lojas (6(z)).

**Desenho técnico** (nomes propostos, nada criado):
- `src/server/publisher/detect-triggers.ts`: SQL sobre `price_min_events`, `price_daily_offer`/`price_daily_state` e `affiliate_offers` com `eligibleOfferSql('o')` e o filtro de região/identidade.
- Tabelas novas (migration aditiva, RLS ligada, `REVOKE` de anon/authenticated, sem FK, `.rollback.sql`, padrão 0024): `group_publish_queue` (`id`, `trigger`, `offer_id`, `master_product_id`, `window_key`, `price_cents_detected`, `avg_cents`, `message_text`, `status` pending/claimed/sent/skipped/failed/dry, `skip_reason`, `scheduled_for`, `attempts`, `created_at`; `UNIQUE (offer_id, trigger, window_key)`) e `group_publish_deliveries` (`queue_id`, `channel`, `dest_key`, `price_sent_cents`, `provider_message_id`, `http_status`, `sent_at`; `UNIQUE (queue_id, channel, dest_key)`). Guardar **referência** ao destino (chave lógica), nunca o chat id em log ou ata. Retenção de 90 dias.
- `/api/cron/publish-groups`: `rejectUnlessCronAuthorized` (aceitar só Bearer; o `?key=` fica no legado), `maxDuration 60`, registro via `collector-runs.ts` (job novo `publish-groups`; hoje só grava com `COLLECTOR_RUNS=1`), claim atômico `FOR UPDATE SKIP LOCKED`, itens `claimed` há mais de 10 min voltam a `pending`, gravar a entrega como `sending` antes de chamar a API.
- **Kill-switch por env, falha fechada:** `GROUP_PUBLISHER_ENABLED` (ausente = desligado) e `GROUP_PUBLISHER_MODE = dry | queue | send` (padrão `dry`). `dry` grava o texto que enviaria; `queue` enfileira para aprovação no admin; `send` posta no Telegram. Teto global duro: 12 mensagens/dia e 2/hora por destino; parar após 3 falhas seguidas.
- **Revalidação no envio:** reler a oferta; exigir `status='active'`, fora de quarentena/porteiro, `last_price_confirmed_at` < 30 min, preço dentro de 2% do detectado; se falhar, `skipped` com motivo. A mensagem usa o preço relido.
- **Agendamento:** `vercel.json` ganha `/api/cron/publish-groups` a cada 15 min (`*/15 * * * *`); o envio só ocorre nas janelas de publicação (abaixo), o resto do tempo o cron só detecta e enfileira.
- Texto: função pura `buildGroupMessage(trigger, data, channel)` + `escapeHtml` (título vem de marketplace) + limite de 4.096 caracteres; só link do próprio `/go`.

### 2. Regras de gatilho (medidas no banco)
Comuns a todos os gatilhos (todas obrigatórias): oferta `active`, fora de quarentena, `eligibleOfferSql`, porteiro do catálogo diferente de review/rejected, `affiliate_link_pending = false`, `product_type = game` (enquanto os nichos não estão públicos), plataforma diferente de `unknown`, condição Nova (sem Open Box/usado/vitrine), **sem termo de região/importado no título** (japon*, importad*, JP, US, EUR, NTSC, PAL, asia, chinês) e master sem flag de cross-gen em dúvida, `last_price_confirmed_at` < 2 h na detecção e < 30 min no envio, preço confirmado em 2 coletas seguidas com pelo menos 15 min entre elas.

| # | Gatilho | Condição (todas) | Medido hoje (24 h) |
|---|---|---|---|
| G1 | Menor preço registrado | Evento `live` de queda; preço <= menor anterior de `price_min_events`; queda >= 8% sobre o menor anterior (5% é aceitável após a janela de dry-run); >= 15% abaixo da média do período; >= 3 lojas | 1 produto (Tomba!) |
| G2 | Bem abaixo da média | Média do período por oferta-dia elegível (>= 3 ofertas, >= 5 oferta-dias, >= 14 dias); preço >= 15% abaixo; **teto 40%** (acima disso vai para revisão humana, nunca automático); >= 3 lojas | 4 (Tomba!, Biomutant, Capcom Fighting Collection, Visions of Mana) |
| G3 | Mesma mídia mais barata em outra loja | Mesmo master, >= 2 redes com preço confirmado < 2 h, diferença >= 15% entre a melhor oferta de cada rede; a rede mais barata precisa de vendedor aceitável | Existem (ex.: Switch Sports Shopee x ML, 28%); Shopee só com aprovação |
| G4 | Resumo do dia | Até 3 itens que passaram em G1 ou G2 nas últimas 24 h e ainda valem; 1 por dia; se houver menos de 2 itens, não envia | 4 elegíveis |
| G5 | Foto de preço pré-Black Friday | Produto de alta procura (>= 20 ofertas ativas, console ou jogo de linha); só fatos de hoje: menor preço, 2º e 3º preços, mediana das ofertas ativas, menor registrado com data. **Não afirma desconto.** Série de 24/11 a 27/11 compara com a foto de hoje | Switch 2 Nacional e PS5 Slim Digital têm >= 62 ofertas |
| G6 | Por departamento | Mesmo G1/G2/G5, dentro do departamento (a queda é calculada dentro da vertical); só sai quando o departamento estiver liberado no `/go` e no porteiro | Bloqueado hoje (todos em `review`) |

Regras de vendedor (hipótese a calibrar na fase de dry-run): Mercado Livre exige `reputation_level` em `5_green` ou `4_light_green` e `total_sales` mínimo (proposta: 50); `reputation_level` nulo (caso do vendedor de Visions of Mana) manda para revisão humana. Shopee: sempre revisão humana, até haver 14 dias de série e atributo de loja. Teto de revisão humana: desconto > 40% contra a média, queda > 45% sobre o preço anterior, preço < 0,5x a mediana das ofertas ativas.

**Redação honesta de "menor preço":** "o menor preço que registramos desde 31/10" (a janela vem de `min(at)` de `price_min_events` do produto). Nunca "menor da história", "menor do ano" nem "menor da internet".

Pendências de dado para os gatilhos: a média do período lida de `price_daily_offer` deve passar pela elegibilidade na leitura (sem isso, consoles saem com média absurda: consulta sem filtro deu R$ 10.044 para o Switch 2 Nacional); a regra de 14 dias hoje elimina a Shopee (7 a 11 dias).

### 3. Limites anti-spam
| Item | Regra |
|---|---|
| Mensagens por dia por destino | Normal: até 3 (1 resumo às 12h + até 2 avulsas). 24 a 27/11: até 6 |
| Por hora por destino | 1 |
| Janela de silêncio | 22h às 8h (America/Sao_Paulo); o que surgir fica `pending` e sai às 8h se ainda valer |
| Janelas de publicação | 12h, 17h30, 20h (normal); na semana da BF, a cada 3 a 4 h entre 9h e 21h |
| Dedup por produto | 48 h por produto (todas as ofertas do master); um novo menor preço >= 5% abaixo do enviado e passadas 6 h rompe |
| Dedup por oferta/janela | `UNIQUE (offer_id, trigger, window_key)` (janela de 6 h, fuso de São Paulo) |
| Sem oferta qualificada | Não envia nada (melhor silêncio que lixo) |
| Trava global | 12 por dia e 2 por hora por destino; kill-switch por env |
| Rodízio | Não repetir loja nem plataforma em duas mensagens seguidas, quando houver alternativa |
| Fora | Oferta já enviada cujo preço subiu: não reenviar; corrigir com mensagem só se o erro foi nosso (aprovação manual) |

### 4. Modelos de mensagem
Regras de redação (editor): até 5 linhas e 60 palavras (resumo e foto de preço podem ter mais, ver abaixo); no máximo 1 emoji, no começo; negrito só em produto e preço (WhatsApp `*x*`, Telegram `<b>x</b>`); cada número vem de uma variável e variável vazia remove a linha; sempre "Conferido em DD/MM às HHhMM" (hora de `last_price_confirmed_at`, fuso de São Paulo); proibido: "imperdível", "corre", "últimas unidades", "promoção relâmpago", "o menor preço da internet", "afiliado", "de/por".

**Identificação de publicidade (risco a decidir pelo dono):** mensagem de venda com link comissionado é publicidade (CDC art. 36 e guia do CONAR). O dono dispensou o aviso no site; no grupo recomendo a forma mínima, sem a palavra "afiliado": (a) **"#publicidade" junto do link** em toda mensagem (uma palavra, mesma linha); (b) mensagem fixada/descrição do grupo com a frase completa "Os links podem render comissão ao Espaço Geek 86 sem custo extra para você"; (c) "#publi" no fim, a mais fraca. Risco: sem nenhuma identificação há exposição ao CONAR e, para a Amazon, à suspensão do programa; a recomendação é (a)+(b). Não é parecer jurídico; a validade da frase precisa de revisão do responsável.

Os links usam `https://www.egeek86.com/go/<slug>?s=<canal>&m=<id da fila>`. **`s` e `m` ainda não existem no `/go`** (ver plano). Exemplos abaixo usam um `m` ilustrativo (`m=000`) porque nenhuma fila foi criada.

Todos os exemplos usam dados lidos agora no banco (slugs reais). Fuso: hora local de São Paulo.

**M1. Menor preço registrado (G1), Telegram**
Fonte: `price_min_events` (evento `live` de 10/11, `min_cents` 29.199, `prev_min_cents` 34.990, primeiro evento do produto 31/10); média do período: `price_daily_offer` (3 ofertas, 43 oferta-dias, 17 dias, média 43.008); oferta `tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894`, Mercado Livre, vendedor `5_green`, confirmada 00h41 UTC.
```
<b>Tomba! Edição Especial (Switch, mídia física)</b>
<b>R$ 291,99</b> no Mercado Livre. Menor preço que registramos desde 31/10; o anterior era R$ 349,90.
32% abaixo da média de R$ 430,08 (3 lojas).
Conferido em 10/11 às 21h41.
<a href="https://www.egeek86.com/go/tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894?s=tg&m=000">Ver a oferta</a> #publicidade
```
Versão WhatsApp (mesmos dados): negrito com `*`, link em texto puro na última linha, sem `<a>`.

**M2. Bem abaixo da média (G2), WhatsApp**
Fonte: média do período R$ 330,03 (4 ofertas, 31 oferta-dias, 18 dias, desde 24/10); menor anterior R$ 229,00 (`price_min_events`); oferta `jogo-biomutant-nintendo-switch-midia-fisica-281736848`, Mercado Livre, vendedor `5_green`, confirmada 00h06 UTC (21h06 local).
```
*Biomutant (Switch, mídia física)*
*R$ 227,00* no Mercado Livre, 31% abaixo da média de R$ 330,03 (4 lojas).
Conferido em 10/11 às 21h06.
https://www.egeek86.com/go/jogo-biomutant-nintendo-switch-midia-fisica-281736848?s=wa&m=000 #publicidade
```
Observação do QA: o produto não bateu o recorde (queda de 0,9% sobre R$ 229,00), por isso não é M1; a linha de recorde só aparece quando G1 passa.

**M3. Mesma mídia mais barata em outra loja (G3), Telegram. Shopee: só com aprovação humana**
Fonte: Shopee R$ 229,99 (`jogo-nintendo-switch-sports-midia-fisica-shopee-e3a58b`, confirmada 00h54 UTC); Mercado Livre: 6 ofertas de R$ 320,00 a R$ 526,00 (melhor: `nintendo-switch-sports-fisico-3003300345`, vendedor `5_green`, confirmada 00h30 UTC); média do período R$ 367,05 (9 ofertas, 91 oferta-dias, 18 dias). Diferença entre as melhores ofertas de cada rede: R$ 90,01 (28%).
```
<b>Nintendo Switch Sports (mídia física)</b>
Mesma mídia, preços diferentes hoje: <b>R$ 229,99</b> na Shopee e R$ 320,00 no Mercado Livre (melhor de 6 ofertas lá, que vão até R$ 526,00).
A Shopee está R$ 90,01 abaixo e 37% abaixo da média do período de R$ 367,05.
Conferido em 10/11 às 21h54.
<a href="https://www.egeek86.com/go/jogo-nintendo-switch-sports-midia-fisica-shopee-e3a58b?s=tg&m=000">Ver na Shopee</a> · <a href="https://www.egeek86.com/go/nintendo-switch-sports-fisico-3003300345?s=tg&m=000">Ver no Mercado Livre</a> #publicidade
```
Observação: o título da Shopee ("JOGO NINTENDO SWITCH SPORTS MIDIA FISICA") não traz sinal de região; ainda assim 37% abaixo da média está perto do teto de 40% e a Shopee não tem atributo de loja: por isso passa por aprovação humana.

**M4. Resumo do dia (G4), WhatsApp (3 itens, 1 vez por dia, 12h)**
Fonte: os três gatilhos de G2 do Mercado Livre com vendedor `5_green`, ordenados pela maior queda; médias do período: Tomba! R$ 430,08, Biomutant R$ 330,03, Capcom Fighting Collection R$ 347,15 (7 ofertas, 63 oferta-dias, 17 dias); oferta Capcom `capcom-fighting-collection-para-nintendo-switch-fisico-3003664742` confirmada 00h05 UTC.
```
*3 jogos de Switch abaixo da média hoje* (Mercado Livre)
1. Tomba! Edição Especial: *R$ 291,99* (32% abaixo da média)
https://www.egeek86.com/go/tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894?s=wa&m=000
2. Biomutant: *R$ 227,00* (31% abaixo)
https://www.egeek86.com/go/jogo-biomutant-nintendo-switch-midia-fisica-281736848?s=wa&m=000
3. Capcom Fighting Collection: *R$ 243,40* (30% abaixo)
https://www.egeek86.com/go/capcom-fighting-collection-para-nintendo-switch-fisico-3003664742?s=wa&m=000
Preços conferidos entre 21h06 e 21h41 de 10/11. #publicidade
```

**M5. Foto de preço pré-Black Friday (G5), Telegram**
Fonte: Console Nintendo Switch 2, Modelo Nacional de Tomada (`master_product` `c8366787-...`). 62 ofertas ativas confirmadas em < 2 h (Mercado Livre e Shopee), mediana R$ 4.399,00; três menores: R$ 3.157,54 (`console-nintendo-switch-2-modelo-nacional-de-tomada-3246949086`, vendedor `5_green`, 826 vendas), R$ 3.231,44 e R$ 3.270,95 (também `5_green`); menor preço do evento de 31/10: R$ 2.906,32 (`price_min_events`, é o mínimo registrado). Não afirma desconto.
```
<b>Foto de preço, 10/11: Nintendo Switch 2 (modelo nacional)</b>
Menor preço hoje: <b>R$ 3.157,54</b> no Mercado Livre. Os três menores: R$ 3.157,54, R$ 3.231,44 e R$ 3.270,95. Mediana de 62 ofertas: R$ 4.399,00.
Menor preço que registramos desde 31/10: R$ 2.906,32.
Guardamos este registro para comparar com a Black Friday (27/11).
Conferido em 10/11 às 22h21.
<a href="https://www.egeek86.com/go/console-nintendo-switch-2-modelo-nacional-de-tomada-3246949086?s=tg&m=000">Ver a oferta</a> #publicidade
```
O mesmo modelo repete em 24/11 e 27/11 com o rótulo "comparado com a foto de 10/11", usando a foto gravada e o preço relido.

**M6. Por departamento (G6), modelo com rótulo, BLOQUEADO hoje**
Fonte: SSD Kingston NV3 1 TB M.2 NVMe, `vertical = tecnologia`, pelo menos 5 ofertas ativas; menor preço lido R$ 1.049,00 (`ssd-kingston-nv3-1-tb-m-2-nvme-pcie-4-0-x4-para-pc-e-ps5-3336424216`, confirmada 01h02 UTC), os demais de R$ 1.068,96 a R$ 1.577,98. O porteiro marca o produto `review` e `/go` só serve games, então **não pode ser enviado hoje**; o exemplo mostra o formato sem média (histórico ainda curto, a linha some, nada é preenchido).
```
[Tecnologia] SSD Kingston NV3 1 TB (M.2 NVMe)
Menor preço hoje entre as ofertas que acompanhamos: R$ 1.049,00 (outras de R$ 1.068,96 a R$ 1.577,98).
Conferido em 10/11 às 22h02.
https://www.egeek86.com/go/ssd-kingston-nv3-1-tb-m-2-nvme-pcie-4-0-x4-para-pc-e-ps5-3336424216?s=wa&m=000 #publicidade
```
O gerador recebe `vertical` como parâmetro (rótulo, regras de média calculadas dentro do departamento, link por `/go`). Para publicar os nichos: aprovar os masters no porteiro (hoje 52 em `review`), liberar o filtro `vertical` do `/go` por allow-list (ADR 0008) e rever links ML pendentes (62 em tecnologia). Esse é o pré-requisito, separado desta ata.

**Variante Amazon (desligada por padrão):** rodapé "Preço na Amazon em 10/11 às 21h47, sujeito a alteração" (exemplo real: Mario 3D World + Bowser's Fury, R$ 329,99, `last_price_confirmed_at` 00h47 UTC), sem média de outras lojas.

### 5. Medição
- **Clique por mensagem:** o `/go` passa a aceitar `?s=` (canal, lista fixa: `tg`, `wa`) e `?m=` (uuid da fila), validar por whitelist/regex e gravar em `analytics_events.properties` (`source`, `msgId`); o destino continua vindo só do banco (sem redirecionamento aberto). Sem isso, 93% dos cliques seguem sem origem (apps de mensagem não enviam referer).
- **Filtrar prévias:** WhatsApp, Telegram e Facebook buscam o link ao postar. Marcar como `preview` (sem contar) os user-agents `TelegramBot`, `WhatsApp`, `facebookexternalhit`, e aceitar HEAD sem registrar; o cálculo de `validClicks` de `affiliate-clicks.ts` já descarta bots genéricos.
- **Denominador:** membros do destino (`getChatMemberCount` no Telegram, dado real; no WhatsApp, número informado pelo dono). Métricas: cliques válidos por mensagem, por gatilho e por destino; CTR (clique válido / membros); saídas por semana; mensagens `skipped` por motivo. Metas iniciais do estrategista (hipótese): CTR > 5% e saída < 2% por semana. Linha de base: 154 cliques/30 dias.
- **Conversão:** não há cruzamento por mensagem. Shopee: relatório de conversão por API ainda não validado (`/api/cron/import-shopee-conversions`, nunca executado; `subIds` voltam como `utmContent` se os links forem gerados com subId por canal, o que exige gerar um link por canal). Mercado Livre: painel do dono (exportação CSV não confirmada; etiqueta por canal não confirmada). Logo: atribuir conversão por **rede e janela** (cliques do período x vendas do painel), indicativa, nunca causal. Amazon fora.
- **Impacto de usar `/go` em vez do link direto:** a comissão não muda (o destino é o mesmo `affiliate_url`); o clique passa a ser medido e o link muda sem republicar mensagens; custo: um salto de 302 e dependência do site no ar (monitorar). Nas prévias de link, o WhatsApp/Telegram seguem o redirecionamento e mostram a loja de destino (não controlamos o cartão); no Telegram, `link_preview_options` pode desligar a prévia. O link curto do ML (`meli.la`) e o da Shopee (`s.shopee.com.br`) seguem como destino do `/go`; não usar link de loja direto nas mensagens. Medido hoje: 99% das ofertas ML ainda saem com `matt_tool` (não `meli.la`); o `/go` aceita qualquer forma.

### 6. Plano de implementação (ordem, esforço em dias de trabalho, e o que cabe até 14/11)
| # | Item | Esforço | Quando | Depende |
|---|---|---|---|---|
| 0 | Decisões do dono (seção 7) | 0 | 11/11 | dono |
| 1 | Corrigir `message-template.ts` (remover "De/por" e "% OFF"; usar média única e menor registrado com janela; "Conferido em"; `#publicidade`) | 0,5 | 11/11 | dono (frase) |
| 2 | Funções puras: `buildGroupMessage` (6 gatilhos, WhatsApp e Telegram), `escapeHtml`, regras de gatilho e dedup, com testes | 1 | 11 a 12/11 | 1 |
| 3 | `/go`: `?s=&m=` por whitelist, filtro de prévia/HEAD, teste de redirecionamento 302 | 0,5 | 12/11 | nenhuma |
| 4 | Migration `group_publish_queue` e `group_publish_deliveries` (RLS, REVOKE, rollback), com backup antes | 0,5 | 12/11 | autorização do dono para aplicar |
| 5 | Detector SQL (`detect-triggers.ts`) com `eligibleOfferSql`, região, vendedor; cron `publish-groups` em `dry` (grava o que enviaria) | 1,5 | 12 a 13/11 | 2, 4 |
| 6 | Tela admin "Mensagens para grupos": fila pronta, aprovar/pular, copiar, abrir `wa.me`, registrar envio (reaproveita o drawer e `affiliate_messages`) | 1 | 13 a 14/11 | 5 |
| 7 | `sendTelegramGroupMessage` (429, `retry_after`, preview, sem logar URL com token) e modo `queue`/`send` | 0,5 | 14/11 | bot e chat id do dono |
| 8 | Dry-run: 7 dias gerando sem enviar; revisão manual de 50 mensagens; liberar envio quando 0 divergência | 7 dias corridos | 13 a 20/11 | 5 |
| 9 | Envio real no Telegram com aprovação (`queue`) e depois automático (`send`); WhatsApp assistido já na tela | 0,5 | 20/11 | 8 |
| 10 | Modo Black Friday: cadência de 6/dia, foto de preço M5, resumo às 22h | 0,5 | 23/11 | 9 |

**Até 14/11 é possível entregar:** itens 1, 2, 3, 4, 5 (em `dry`), 6 e 7 (código pronto, sem token); isto dá ao dono, já em 14/11, o fluxo **assistido** de WhatsApp e Telegram com texto correto e medição por mensagem. Total ~6 dias úteis de engenharia, em 4 dias corridos; é apertado e depende de a migration ser autorizada em 12/11. **Não é possível** enviar automático sem aprovação antes de 20/11 sem violar o veto do QA (dry-run de 7 dias com 0 divergência em 50 mensagens). Se o dono preferir risco maior, a fase de aprovação humana em `queue` a partir de 15/11 cobre a lacuna sem dispensar a conferência.

### 7. O que depende do dono (lista curta)
1. Criar o bot no @BotFather e criar o grupo ou canal do Telegram.
2. Adicionar o bot como administrador do canal (com permissão de postar) ou ao grupo.
3. Me passar o **chat id** (ou o @ do canal público). **Nunca** o token do bot; o token entra direto como `TELEGRAM_BOT_TOKEN` na Vercel (projeto egeek86) e nunca vai a ata, commit ou chat.
4. Dizer quais grupos de WhatsApp existem (e se são dele) e decidir: **canal do WhatsApp** (recomendado para audiência grande), **lista de transmissão** ou **envio assistido** em grupos (o código nunca envia ao WhatsApp).
5. Decidir a forma de identificar publicidade: recomendação "#publicidade" junto do link + frase fixada no grupo (sem a palavra "afiliado"); aceitar ou rejeitar o risco de não identificar.
6. Autorizar a migration das duas tabelas novas (com backup e rollback) e confirmar que os crons novos podem entrar no `vercel.json`.
7. Decidir: Amazon fora das mensagens (recomendado) e Shopee só com aprovação até a série passar de 14 dias.
8. Liberar os nichos novos no porteiro e no `/go` (separado desta ata; sem isso o gerador por vertical fica pronto e travado).

## Métrica de sucesso
- Até 14/11: 6 modelos gerando texto a partir do banco, 0 mensagem com número não rastreável; `?s=&m=` no `/go`; fluxo assistido de WhatsApp e Telegram.
- Até 20/11: dry-run concluído com 0 divergência em 50 mensagens; 0 mensagem com "afiliado" ou "de/por".
- Até 27/11: >= 2 grupos recebendo mensagens; CTR e saídas medidos por destino; relatório de cliques por mensagem; comissão do período atribuída por rede (indicativa).
- Conferir toda semana: taxa de `skipped` por motivo, saídas do grupo, cliques válidos por mensagem.

## Execução e verificação
- Executores previstos: engenheiro-backend (detector, fila, cron, `/go`), engenheiro-frontend (tela admin), editor-noticias (revisão dos textos), integrador-apis (Telegram), dba-postgres (migration).
- QA: veto do `qa-verificador` a envio real sem dry-run de 7 dias; vetos por dado não rastreável, preço divergente, `/go` sem 302, item em quarentena ou Open Box, média diferente da usada no selo, Amazon sem carimbo, termo "afiliado" e falta de log de auditoria. Verificação desta ata: os números acima são SELECTs de hoje; **não foi rodado** build, teste nem navegador (somente leitura). As consultas aproximam `eligibleOfferSql` (porteiro, título de open box, tipo); a implementação deve usar a função e conferir equivalência.
- Segurança: token e chat id só em env; Bearer apenas nos crons novos; RLS e REVOKE nas tabelas; `escapeHtml` obrigatório; whitelist de utm; filtro de prévia; kill-switch e teto global.

## Retrospectiva
Pendente (preencher após a primeira semana no ar).
