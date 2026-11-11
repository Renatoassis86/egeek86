# Ata do Conselho Geek: mensagens 24 h, cupons, storytelling de preço e cobertura dos nichos

- **Data:** 2026-11-10 (noite; medições feitas entre 22h30 de 10/11 e 00h00 de 11/11, horário de Brasília). Black Friday em 2026-11-27: faltam 17 dias.
- **Porte:** grande. SOMENTE LEITURA E PLANEJAMENTO: nenhum código, banco, Vercel ou commit foi alterado; nenhuma mensagem foi enviada ao canal t.me/egeek86; as ferramentas do Chrome não foram usadas. Foram criados e apagados scripts temporários de SELECT em `scripts/` (`_x.ts`, `_y.ts`, `_z.ts`), todos com transação somente leitura. Foram consultadas documentações públicas (Mercado Livre Developers, Telegram Bots FAQ).
- **Presidente:** geek-lead
- **Mesa convocada (pareceres por competência, consolidados pelo presidente):** estrategista-mercado, especialista-precos, estatistico-senior, matematico-aplicado, cientista-dados-tempo-real, integrador-apis, engenheiro-coleta, engenheiro-backend, arquiteto-next, designer-marca, bi-dataviz, engenheiro-frontend, editor-noticias, gamer-veterano, guardiao-catalogo, dba-postgres, cientista-dados, qa-verificador, seguranca-db. O conselho é consultivo; decisão de negócio é do dono.
- **Honestidade sobre o método:** as posições abaixo são o parecer de cada competência aplicado por mim (presidente) sobre o código e os dados lidos nesta sessão; nenhum subagente independente foi disparado, então não há "independência" real entre elas. Onde a posição depende de um fato que **não verifiquei**, está marcado **[H]** (hipótese) ou **NÃO CONFIRMADO**. **[D]** = dado medido por SELECT hoje; **[C]** = visto no código; **[R]** = recomendação.

## Briefing

Diretrizes do dono (10/11, noite): o sistema de mensagens está "muito rígido". Quer (1) aquecer o grupo toda hora com várias promoções e informações com insights de compra; (2) mensagem sempre que houver promoção com indicadores ok; (3) avisar também preços que estão tendendo a ficar bons; (4) cupons de desconto buscados nas plataformas e nos portais das lojas, testados quanto à validade, com motivo, condições e cashback, e toda promoção vindo com algum cupom; (5) mensagens 24 horas; (6) storytelling com série histórica por gráfico/cartão mesmo sem preço novo; (7) conferir a extração dos outros produtos (nichos), cuja amostra parece pequena.

Decisões novas do dono recebidas durante a reunião, **já incorporadas**:
- **(A) Amazon entra nas mensagens por conta e risco do dono** (revoga a exclusão anterior). Risco contratual **aceito pelo dono**: a Licença de PI da Amazon proíbe alerta de preço e cache de preço acima de 24 h. Preço da Amazon sempre com carimbo "em dd/mm às hh:mm". O laço da aba passará a reconsultar de forma contínua só os masters que já têm oferta Amazon (ciclo de 25 a 35 min), com descoberta de novos masters em rodízio menor.
- **(B) O Telegram deve sair por mensagem automática, sem o dono clicar na tela**: envio automático via cron para classes seguras; aprovação humana só nas classes de risco; 24 h por dia. O WhatsApp continua assistido (copia e cola quando o dono quiser): a tela de aprovação **não** pode ser pré-requisito do Telegram.

Regras inegociáveis em jogo (todas mantidas): zero dado fake (nenhum cupom, motivo, condição, tendência ou preço inventado); "afiliado" nunca ao cliente; "de/por" do marketplace não é desconto; comparar com a média única por oferta-dia (ADR 0004) e com o menor registrado; "tendência" só descritiva e medida, nunca previsão; #publicidade (configurável) permanece; uma imagem um lugar só (imagens de mensagem são geradas em memória, não são arquivos de `public/images/`).

## Estado verificado hoje

### Mensagens (o que existe) [C]
- `src/lib/messaging/group-rules.ts` já tem os gatilhos G1 a G6, `RULES` (3/dia, 6 de 20 a 27/11; 1/hora; silêncio 22h-8h; dedup 48 h; G1 >= 8% de queda; >= 15% abaixo da média; teto de revisão 40%), `applyLimits` (um envio por vez) e `judgeOffer`, que **bloqueia a Amazon** (`amazon_desligada`) e manda a Shopee para revisão humana.
- `src/app/api/cron/group-messages/route.ts` existe, **não está no `vercel.json`**, e só envia proposta já **aprovada** por humano (`sendApprovedTelegram`), uma por execução. É este fluxo que precisa ganhar um ramo automático.
- `group_messages` (migration 0028) tem os campos `message_key, trigger, channel, status, candidate, text_body, dedup_key, claimed_at, sent_at, provider_message_id, error`. Está **vazia** [D]: nenhuma proposta foi gravada em produção ainda (só o teste de 10/11 foi enviado fora da fila).
- Kill-switch hoje é só por variável de ambiente (`GROUP_MESSAGES_ENABLED`, `GROUP_MESSAGES_MODE`). Na Vercel uma variável alterada só vale em novo deploy [conhecimento prévio; reverificar]: **não é desligamento instantâneo**. Ver kill-switch por linha de banco abaixo.
- Cupons: existem as tabelas `coupons` (cupom da casa, `pricing.ts`) e `affiliate_coupons` (cupom por rede, `affiliate_pricing.ts`), mais a coluna `affiliate_price_snapshots.coupon_code`. **Todas vazias [D]:** `affiliate_coupons` 0 linhas, `coupons` 0 linhas, `coupon_code` preenchido em 0 de 3.368.151 snapshots. A página da oferta (`offer-page-data.ts`, `loadCoupons`) lê `affiliate_coupons` filtrando só `status = 'active'` por rede, **sem checar `valid_until`** [C]: se um dia houver linha manual vencida, ela aparece. Correção entra na onda 1.

### Dados [D]
- Série do site: `price_daily_state` tem dias de 13/07 a 10/11, mas só de **31/10 em diante** com qualidade `complete/partial` (antes disso, `legacy`): **11 dias de série**. `price_daily_offer` (base da média por oferta-dia) começa em **24/10: 18 dias**. `price_min_events`: eventos `live` desde 05/11 (1.854 no total), `reconstructed` desde 31/10.
- Ofertas ativas fora de quarentena (todas com preço confirmado nas últimas 6 h): games ML 9.888, Shopee 1.150, Amazon 319 (201 masters, **todos os 201 também têm oferta em outra rede**); nichos: tecnologia 106, livros 135, eletroeletrônicos 28, eletrodomésticos 11, todos ML.
- Amazon, idade do preço das 319 ofertas ativas: **103 com menos de 30 min, 19 entre 30 e 60 min, 192 entre 60 e 120 min, 5 entre 2 e 4 h**; nenhuma com mais de 4 h; `consecutive_miss_count = 0` em todas (a coleta assistida ainda não registrou ausência).

## Pareceres (rodada 1)

| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estrategista-mercado | Favorável a mais volume, com freio de fadiga | Trocar "1 oferta/hora" por 5 classes com orçamento de **som** (8 mensagens/dia com notificação) e o resto **silencioso**; radar horário em UMA mensagem; freio automático por saída de inscritos | Meta de saída tolerada; hoje o canal é novo e sem linha de base |
| especialista-precos | Favorável, com ressalva | "Abaixo da média" sozinho NÃO discrimina (a oferta mais barata quase sempre está abaixo da média das ofertas); o gatilho deve ser **movimento** (novo mínimo, queda de dia, queda sustentada) e a média entra como contexto | Série longa (só 11 dias) |
| estatistico-senior | Favorável, descritivo | Com 7 a 13 dias de série só valem afirmações do tipo "menor valor da série desde 31/10" e "caiu N dias seguidos"; com >= 14 dias entra a média como referência; nada de previsão, nem intervalo, nem "vai cair" | Mais semanas |
| matematico-aplicado | Favorável | Definições de gatilho como desigualdades sobre a série diária do produto (abaixo), monotônicas e testáveis; faixas de risco por razão preço/média e preço/mínimo | Nenhum |
| cientista-dados-tempo-real | Favorável | Frescor por `last_price_confirmed_at`; Amazon com limites próprios (60 min na detecção, 40 min no envio) e pausa automática se o laço parar; pós-checagem 30 min depois do envio para medir divergência | Estabilidade do laço da aba Amazon |
| integrador-apis | Apoio, com bloqueio parcial | ML e Shopee **não expõem cupom de comprador por API** (ver §3); cupom só pelos portais logados; Telegram `sendMessage`/`sendPhoto` com `disable_notification` | Campos extras da Shopee Open API (consulta de esquema não feita) |
| engenheiro-coleta | Apoio, com ressalva | Varredura de cupons nos moldes dos laços de Amazon, leitura somente, ritmo baixo; **conta secundária** só de comprador para o Mercado Livre | Aceite do dono (exceção ao "só API") |
| engenheiro-backend / arquiteto-next | Viável | Ramo automático no cron já existente, atribuição atômica, `UNIQUE` em `dedup_key`, flag de pausa em linha de banco, cron de 5 em 5 min | Autorização de migration e `vercel.json` |
| designer-marca / bi-dataviz / engenheiro-frontend | Favorável | Cartão 1200x675, escuro, cantos quadrados, linha em degrau (preço se mantém até mudar), lacuna fica lacuna; gerar com `next/og` em memória e enviar por upload (sem armazenar, sem URL pública) | Validar fonte e renderização |
| editor-noticias / gamer-veterano | Favorável | Estrutura "o que está acontecendo, por que importa, o que fazer", sem adjetivo, sem urgência fabricada, sem "vai"; seis modelos (abaixo) | Revisão jurídica da frase de publicidade |
| guardiao-catalogo / dba-postgres / cientista-dados | Apoio | A amostra dos nichos é pequena por seis causas medidas (§6); a maior é a rodada manual de 40 chamadas com `offset 0` e 404 "sem vendedor" | Cota real do ML (não há cabeçalho de limite) |
| qa-verificador / seguranca-db | **Vetos condicionais** | Ver §8: nenhum cupom sem linha de evidência; nenhum envio automático antes de 24 h de decisão sem envio comparada com o banco; nenhuma Amazon fora do limite de frescor; freio por saída de inscritos obrigatório; token de ingestão separado | Nenhum |

## Divergências e réplica (rodada 2)

1. **Volume x fadiga.** O dono pede "toda hora"; o estrategista teme saída de inscritos. **Resolução:** "toda hora" vira **uma mensagem de radar por hora, silenciosa**, só se houver pelo menos 2 itens com mudança desde o último radar; o orçamento de mensagens **com som** é de 8 por dia. O freio é automático e medido (§1.4).
2. **Janela de testes.** A ata de hoje cedo exigia 7 dias de simulação; o dono já havia escolhido "enviar agora com aprovação" e agora pede automático. **Resolução:** reduzir para **24 h de decisão sem envio (`auto-dry`) com 30 mensagens conferidas contra o banco e 0 divergência** antes do primeiro envio automático, **só da classe A de Mercado Livre**; as demais classes entram em degraus (§7). O QA aceita a redução com a condição de pós-checagem automática e do freio.
3. **Gatilho "abaixo da média".** Preços e estatístico mostram que ele quase não discrimina (§2.2). **Resolução:** a média vira contexto e modificador de faixa de risco; o gatilho é movimento. Isto é o principal ganho de "menos rígido" sem perder rigor.
4. **Comparar a Amazon com a média das outras lojas.** O dono aceitou o risco do alerta de preço e do cache; a cláusula de não comparação de preço entre lojas (6(z) na ata anterior) **não foi mencionada**. **Resolução:** texto da Amazon sem comparação com outras lojas; só contra o histórico da própria Amazon. Custo zero, risco menor. Vira pergunta ao dono (§9).
5. **Cupons por raspagem.** O dono pediu varredura "nos portais"; a decisão de 28/10 é "só API oficial", com exceção aberta em 10/11 só para a Amazon. **Resolução:** o conselho recomenda a exceção **somente leitura**, com conta secundária; não decidimos pelo dono (§9).

## Decisão (proposta ao dono)

### 1. Política de frequência nova (números), automação e 24 h

#### 1.1 Cinco classes de mensagem

| Classe | O que é | Som | Teto/dia (normal; 20 a 27/11) | Janela | Intervalo mínimo | Automática? |
|---|---|---|---|---|---|---|
| **A. Alerta imediato** | Movimento forte medido em item elegível (novo mínimo >= 5% sobre o mínimo anterior, ou queda de dia >= 8% com >= 3 lojas), com a linha de cupom só se verificado | Sim | 6; 10 | 24 h | 15 min entre alertas | Sim (ML sem ressalva; Amazon com limites próprios) |
| **B. Radar horário** | UMA mensagem com 3 a 5 itens que mudaram: novos mínimos pequenos, "a até 4% do menor registrado", "caiu 2 dias seguidos". Sem juízo de compra | Não (silenciosa) | 16; 20 | 7h às 23h, na hora cheia | 60 min | Sim, itens ML |
| **C. Insight de tendência (cartão)** | UM item com texto de storytelling + **cartão de histórico (imagem)**; vale também sem preço novo | Não | 4; 6 | 9h às 21h | 120 min | Sim, itens ML; Shopee e Amazon só com aprovação até o dia 20/11 |
| **D. Resumo** | 8h: "o que mudou enquanto você dormia" (fila da madrugada); 20h: "o dia em preços" (até 5 itens) | Sim | 2; 3 (inclui a Black Friday às 22h) | 8h, 20h | n/a | Sim |
| **E. Cupons verificados** | Lista curta de cupons lidos e verificados (ver §3) | Não | 3; 5 | 9h às 21h | 3 h | Sim, só após a onda de cupons (20/11) |

- **Teto global duro:** 30 mensagens por dia (40 de 20 a 27/11). Antes: 3 (6). **Som:** no máximo 8 por dia (classes A e D). Isto é o orçamento de atenção; o radar e os insights chegam sem notificar.
- **Os tetos são tetos, não metas.** Não se envia enchimento: o radar só sai com >= 2 itens com mudança de estado; o insight só sai se o item tem >= 7 dias de série e uma afirmação descritiva verdadeira para contar.
- **Dedup:** chave `produto + classe + janela`; um produto não repete em A por 48 h salvo novo mínimo >= 5% abaixo do enviado depois de 6 h (regra atual); em B/C um produto aparece no máximo uma vez por 24 h salvo mudança de estado >= 2% do preço; o cartão de um mesmo item no máximo 1 vez a cada 7 dias. Unicidade garantida por índice `UNIQUE` em `(channel, dedup_key)`.
- **Rodízio:** não repetir a mesma loja em duas mensagens seguidas da classe A quando houver alternativa (regra atual).

#### 1.2 Funcionamento 24 h
- **O silêncio 22h-8h deixa de ser silêncio e vira "silencioso":** durante a noite as classes A e B saem **sem notificação** (`disable_notification`). Noite = no máximo 3 alertas A e nenhuma classe C, D, E. Às 8h sai o resumo da madrugada. Isto atende à observação do dono ("muitas ofertas aparecem de madrugada") sem acordar ninguém [R].
- Cron a cada 5 min (como os demais crons do projeto), no máximo **um envio por execução**; o radar usa a execução da hora cheia.

#### 1.3 O que é automático e o que exige aprovação (resposta à decisão B)

| Situação | Decisão do cron |
|---|---|
| ML, vendedor `5_green` ou `4_light_green` com >= 50 vendas, >= 3 lojas, preço reconfirmado, sem sinal de região/importado, desconto contra a média <= 25% e queda sobre o preço anterior <= 30% | **Automático** |
| ML nas mesmas condições, mas desconto 25% a 40% | **Aprovação humana** (expira em 60 min; se ninguém aprovar, morre; nada fica pendurado) |
| Qualquer desconto > 40% contra a média ou queda > 45%, preço < 0,5x a mediana | **Retido**, só aparece no admin, nunca sai sozinho |
| ML com vendedor sem reputação ou com poucas vendas | Aprovação humana |
| **Shopee** | Aprovação humana até a série da Shopee passar de 14 dias e existir atributo de loja (hoje 7 a 11 dias) |
| **Amazon** | Automático **só** com: preço confirmado há <= 40 min no envio e <= 60 min na detecção; duas observações consecutivas separadas por >= 15 min; variação <= 30% sobre a mínima diária anterior da própria Amazon. Fora disso, aprovação humana |
| Nichos novos (livros, tecnologia, eletro) | **Bloqueado** até o dono liberar o departamento no porteiro e no `/go` (§9); depois, aprovação humana nas primeiras 20 mensagens por departamento e então automático |
| Cada classe nova | As primeiras **20 mensagens** da classe vão por aprovação ou ficam em `auto-dry`, conforme o degrau da onda (§7) |

**Recomendação sobre "nenhuma aprovação humana" (opção que o dono pediu para eu apresentar com custo):** possível tecnicamente, **não recomendada** para Shopee e para desconto > 25%. Custo do risco: a Shopee tem hoje um caso real de falso desconto de 35,7% por variante de região (ata de hoje cedo) e a Amazon mostra "descontos" de 40% a 63% contra a média (NBA 2K25 PS5 a R$ 83,99 contra média de R$ 226,69), prováveis erros de variante. Uma mensagem errada pública fere a confiança de um canal novo, expõe a exposição legal (CDC, informação errada de preço) e **não se apaga das notificações já entregues**. Em compensação, nas classes seguras a aprovação humana não reduz risco de forma mensurável e é o que faz o canal ficar "rígido". Por isso: sem aprovação nas classes seguras, com aprovação onde há evidência medida de erro.

**Como o cron decide, registra, evita duplicar e respeita o kill-switch (a cada execução, nesta ordem):**
1. **Pausa.** Lê a linha `system_config` chave `group_messages_control` (`{paused, mode, classes_enabled, tier}`) **e** o env `GROUP_MESSAGES_ENABLED`. Qualquer um desligado: encerra sem ler mais nada. A linha de banco muda **na hora**, sem deploy; o env fica como segunda trava. Modos: `off | auto-dry | review-only | auto`.
2. **Detecta** candidatos por classe (função pura nova `evaluateProductV2`, mesmo `eligibleOfferSql`, mesmos filtros de identidade, região, vendedor e quarentena).
3. **Grava** cada candidato em `group_messages` com `status = 'auto_pendente'` (classe segura) ou `'pendente'` (aprovação) ou `'retido'`, `ON CONFLICT (channel, dedup_key) DO NOTHING`. Colunas novas (migration aditiva 0029, com `.rollback.sql`): `class`, `auto boolean`, `silent boolean`, `card_hash`, `coupon_ids jsonb`, `postcheck_price_cents`, `postcheck_at`, `skip_reason`.
4. **Escolhe** o próximo por prioridade (A, depois D, depois B/C/E) respeitando os orçamentos por classe, de som, global, horário e dedup (`applyLimitsV2`).
5. **Reivindica** com `UPDATE ... SET claimed_at = now() WHERE status='auto_pendente' AND claimed_at IS NULL RETURNING` (uma só execução vence; duas instâncias simultâneas não duplicam). Registro `claimed_at` expirado há > 10 min volta ao estado anterior.
6. **Revalida** com preço fresco (<= 30 min; Amazon <= 40 min), gatilho ainda verdadeiro, preço dentro de 2% do detectado; senão `expirada` com motivo.
7. **Envia** (texto ou foto), grava `sent_at`, `provider_message_id`, o texto exato e o preço enviado. Falha definitiva (403, chat inexistente, 401) → `erro` e **pausa automática**; falha temporária → tentativa na próxima execução, no máximo 3.
8. **Pós-checagem** 30 min depois: relê o preço da oferta e grava `postcheck_*`. Se duas mensagens automáticas em 24 h tiverem divergência > 2% **por erro nosso** (preço enviado diferente do que a loja mostrava no carimbo), o cron passa sozinho o modo para `review-only` e avisa o dono (o aviso vai ao canal privado do dono, não ao público).
9. Todo o ciclo grava `collector_runs` (job `group-messages`).

#### 1.4 Freios automáticos (anti-banimento e anti-saída)
- `getChatMemberCount` a cada hora, gravado. Se a perda for >= 1% em 24 h ou >= 2,5% em 7 dias [limiares: hipótese a calibrar], o cron cai um degrau (A <= 3, B desligado, C <= 2) e avisa o dono. Metas de acompanhamento: saída < 2% por semana; clique válido por mensagem medido pelo `/go?s=tg&m=...`.
- Limites técnicos do Telegram (FAQ oficial, lido hoje): 1 mensagem por segundo por chat, 20 por minuto em grupo, cerca de 30 por segundo em difusão. O teto de 30 por dia fica ordens de grandeza abaixo; o risco de bloqueio do bot vem de **denúncia de spam**, não de taxa. Por isso o orçamento de som e a identificação de publicidade.
- Kill-switch: linha de banco (instantâneo), env (segunda trava), botão "Pausar" no admin (escreve a linha) e pausa automática em erro definitivo ou 3 falhas seguidas.

### 2. Gatilhos "ok para compra" e "tendendo a bom"

#### 2.1 Definições (todas descritivas, sobre a série do próprio produto)

Notação: `m(d)` é o menor preço do produto no dia `d` (`price_daily_state.min_cents`, ML/Shopee, Amazon só pela regra da Amazon); `R(d)` é o menor valor do produto antes de `d` (`price_min_events`/série); `N` é o número de dias de série. Filtros comuns, inalterados: oferta ativa, fora de quarentena, elegível, sem região no título, porteiro diferente de review/rejected, `>= 3 lojas`, preço reconfirmado.

| Código | Rótulo ao cliente | Condição | Validade pela extensão da série |
|---|---|---|---|
| **OK1** | "Menor preço que registramos desde 31/10" | `m(hoje) < R` e queda >= 5% sobre `R` (era 8%) | `N >= 7` |
| **OK2** | "Caiu X% de ontem para hoje" | `m(hoje) < m(ontem) * 0,95` com >= 3 lojas | `N >= 7` |
| **OK3** | "Abaixo da média dos N dias" (só contexto, não dispara) | preço <= média por oferta-dia * 0,85 | `N >= 14` (média elegível) |
| **T1** | "Caiu 2 dias seguidos" | `m(d) < m(d-1) < m(d-2)`, queda acumulada >= 3% | `N >= 4`, texto só afirma o que a série mostra |
| **T2** | "A X% do menor valor registrado" | `R < m(hoje) <= R * 1,04` | `N >= 7` |
| **T3** | "Tocou o mínimo duas vezes na semana" | 2 toques separados por pelo menos um dia acima de `R * 1,02` | `N >= 7`; **não medido** hoje (ver 2.2) |

- **Com 3 a 6 dias de série:** nenhum gatilho de juízo. Só vale um "foto de preço" (modelo S6) e o cartão sem rótulo de oportunidade.
- **Com 7 a 13 dias (o caso de quase todo o catálogo hoje: 205 produtos com 10 dias e 341 com 11 [D]):** OK1, OK2, T1, T2. O texto sempre diz a janela ("desde 31/10", "em 10 dias de série").
- **Com >= 14 dias (a partir de 14/11 para os produtos de 31/10):** entra OK3 como contexto, com a média por oferta-dia.
- **Faixas de risco (para decidir automático x aprovação):** verde = desconto contra a média <= 25% e queda <= 30%; amarela = 25% a 40%; vermelha = acima de 40% ou queda > 45% ou preço < 0,5x a mediana (retido).
- **Proibido:** "vai cair", "deve cair", "tende a", "previsão", "é hora de comprar", "garantido", qualquer probabilidade. A palavra "tendência" fica restrita ao nome interno da classe; ao cliente aparece o fato ("caiu dois dias seguidos").

#### 2.2 Contagem real (consulta de origem abaixo)

Base: produtos de games, não rejeitados/em revisão, com >= 3 lojas e >= 7 dias de série, cujo menor preço do dia não é da Amazon: **539 produtos em 10/11 e 616 em algum dia dos últimos 7**. Contagem de produtos distintos que cumprem a definição (SQL sobre `price_daily_state`; "24 h" = dia 10/11, "7 dias" = 04 a 10/11):

| Gatilho | 24 h | 7 dias |
|---|---|---|
| OK1 novo mínimo (qualquer queda sobre o mínimo anterior) | 25 | 82 |
| OK1 com queda >= 5% sobre o mínimo (regra proposta) | **16** | **52** |
| OK2 queda de dia >= 5% | 24 | 86 |
| T1 caiu 2 dias seguidos | 7 | 20 |
| T1 caiu 3 dias seguidos | n/m | 2 |
| T2 a até 4% do menor registrado (sem bater) | 54 | 87 |

Leitura (e atenção: o detector real, com as regras de hoje, achou 0 G1/G2 em 24 h; a coluna abaixo é o **teto de oferta** da série, antes de vendedor, reconfirmação, identidade e limites): o gatilho forte (OK1 >= 5%) produz **cerca de 16 candidatos por dia antes dos filtros de vendedor, reconfirmação, identidade e limites** (o detector real corta mais, ver o segundo achado abaixo). Isto sustenta a classe A (até 6 por dia) e o radar com folga, e **não** sustenta "mensagem a toda hora" só com alertas de compra, o que valida o desenho do radar horário.

Três achados que o conselho considera decisivos:
- **O gatilho "abaixo da média" é fraco por construção.** Em 10/11, o menor preço do dia estava >= 10% abaixo da média das ofertas em **434 de 517** produtos com série elegível (84%) e >= 15% em 361. Como o menor preço de um mercado com muitos vendedores quase sempre fica abaixo da média das ofertas, esse critério não separa "promoção" de "preço normal da loja mais barata" (cálculo aproximado: média das médias diárias contra o menor do dia; a implementação real usa `computePeriodMetrics`). Daí a decisão de usar **movimento** como gatilho.
- **O que torna o sistema "rígido" hoje (detector real `detectGroupCandidates`, leitura, 320 produtos de maior prioridade, ~00h de 11/11):** na janela de 24 h saíram **27 candidatos, nenhum G1 nem G2** (9 G5 automáticos, 15 G5 em revisão, 3 G3 da Shopee em revisão); na janela de 7 dias, 16 candidatos, também **nenhum G1/G2**. Isto é a "rigidez" medida: o sistema atual não produziu **nenhum alerta de compra** nessa leitura (às 22h30 a ata da manhã tinha achado 5 G2; o número oscila com o horário e o estoque de vendedores). Dos 463 bloqueios de 24 h: **125 "G2 sem média elegível"** (< 3 ofertas, < 5 oferta-dias ou < 14 dias), 23 "G1 a oferta mais barata não passa nos filtros", 23 `amazon_desligada`, 18 "G2 tipo de produto fora do escopo", **18 "G1 queda abaixo de 8%"** (38 na janela de 7 dias), 8 "G1 sem média elegível", 5 plataforma desconhecida, 6 por Shopee/rede mais cara exigir aprovação. Ou seja: a rigidez vem principalmente da **exigência de média elegível** e dos filtros de oferta, e em segundo lugar do limiar de 8%. A mudança proposta: OK1/OK2/T1/T2 **não exigem média**; a média só é exigida para OK3; o limiar cai de 8% para 5%; a Amazon deixa de ser bloqueada (decisão A).
- **A contagem T3 (tocou o mínimo duas vezes) não é confiável nesta rodada:** a primeira versão contou séries paradas como "toque" (383 em 24 h), o que é absurdo. Exige a definição com "dia acima de R*1,02 entre os toques"; **não medida**, não entra no plano de entrega até ser medida (onda 2).

**Consulta de origem (resumo; script `_z.ts` apagado):** `price_daily_state` com `day >= '2026-10-31'` e `quality in ('complete','partial')`, produtos `vertical='games'`, sem `mergedInto`, porteiro fora de `rejected/review`, `n_stores >= 3`, `net <> 'amazon'` (rede da oferta `min_offer_id`), janela `count(*) over (partition by master_product_id order by day) >= 7`, `rec_prev = min(min_cents) over (... rows between unbounded preceding and 1 preceding)`, `lag(min_cents, 1..3)`. Limitações: usa o mínimo **diário** (não a oferta viva) e não aplica vendedor, região no título nem reconfirmação; é um teto de oferta, não uma previsão do que será enviado.

### 3. Arquitetura de cupons

#### 3.1 O que é possível por API e o que depende dos portais

| Fonte | O que entrega | Veredito |
|---|---|---|
| **Mercado Livre, API oficial** | `GET /seller-promotions/...` com `SELLER_COUPON_CAMPAIGN` serve ao **vendedor** gerenciar os cupons da própria conta (Developers, página "Cupons do vendedor"; subtipos `FIXED_PERCENTAGE` e `FIXED_AMOUNT`, prazo máximo 31 dias, um cupom por venda). **Não encontrei endpoint para ler cupons de comprador** de outras lojas | **Por API: não.** Só vale para ofertas da nossa própria conta, que não existem |
| ML, preço promocional do item | Os itens que já coletamos trazem preço e `original_price`; "de/por" do marketplace **não vale como desconto** | Já coletado; não é cupom |
| **ML, portal** | Página pública de cupons (mercadolivre.com.br/l/cupons-todos-os-dias, que orienta uso no app), cupons do usuário logado, cupom exibido na página do item, cashback/benefícios de assinatura | **Só varredura assistida** na aba logada |
| **Shopee Open API** | O adaptador atual lê apenas `itemId, shopId, shopName, productName, priceMin, priceMax, sales, imageUrl, productLink, offerLink, ratingStar, priceDiscountRate` [C]; **nenhum campo de voucher**. `priceDiscountRate` é o desconto da própria Shopee ("de/por") e **não vale como desconto** | **NÃO CONFIRMADO** se a API expõe campanhas/vouchers (ex.: `shopeeOfferV2`); proposta: **uma única consulta GraphQL de esquema (introspecção) de leitura**, 1 chamada, para listar os campos; se vier, ganha-se uma fonte oficial |
| **Shopee, portal** | Páginas de vouchers/cupons e voucher exibido na página do produto | **Só varredura assistida** |
| **Amazon, portal** | Texto de cupom/"clip" na página do produto, lido pelo mesmo laço que já lê o preço | Varredura assistida (mesmo laço), risco já aceito |

Conclusão franca: **cupons de comprador de ML e Shopee só existem hoje nos portais logados.** Sem a varredura assistida a resposta é zero cupons.

#### 3.2 Esquema de dados (migration aditiva 0029; nada criado)
Reutilizar `affiliate_coupons` (estado atual do cupom, por rede) e **acrescentar**: `source_url text not null`, `source_kind text` (`portal_listagem | pagina_do_item | api`), `first_seen_at`, `last_seen_at`, `verified_at`, `valid_until_source text` (como o prazo foi lido: `texto_da_pagina | contagem_regressiva | ausente`), `conditions_text text` (**texto literal** lido), `conditions jsonb` (campos estruturados lidos: valor mínimo do pedido, teto do desconto, categorias, vendedores, requer ativar/"coletar", público, uso único), `cashback jsonb` (percentual, teto, crédito em conta/meio de pagamento, condição, **literal lido**), `applies_to jsonb` (`offer_ids`, `seller_ids`, `category`), `evidence_hash text` (hash do trecho da página), `status` ampliado com `nao_verificado`. Tabela nova **`coupon_observations`** (append-only, uma linha por leitura: `coupon_id`, `at`, `source_url`, `evidence_hash`, `state_seen`, `page_price_with_coupon_cents` quando a página exibe), retenção 90 dias, RLS ligada e `REVOKE` de anon/authenticated (padrão 0024). `valid_until` NULL é permitido, mas então `valid_until_source = 'ausente'` e a mensagem não pode dizer "válido até".

#### 3.3 Vigência e teste de validade (estados)
- `nao_verificado` -> `verificado`: visto em **duas varreduras separadas por >= 30 min** **ou** visto na página do item com o preço com cupom exibido pela própria loja.
- `verificado` -> `vencido`: `valid_until < agora`, **ou** não visto em 2 varreduras seguidas (ausência não é prova de validade).
- **Teste, em termos honestos:** "testar" = reabrir a página (nunca finalizar compra, nunca clicar em "Ativar"/"Coletar" em nome do cliente) e ler se o cupom segue listado e qual preço a loja mostra com ele. Não se promete que o cupom funcione no carrinho de cada pessoa (elegibilidade é por conta). O texto sempre carrega o carimbo "visto em dd/mm às hh:mm".
- Uso na mensagem: a linha do cupom só entra se o cupom está `verificado`, visto há <= 2 h (ML/Shopee) e o escopo casa com a oferta (vendedor, categoria, valor mínimo <= preço). Caso contrário **a linha é omitida e a mensagem sai sem cupom ou não sai**.

#### 3.4 Rotina de varredura assistida (nos moldes dos laços de Amazon e ML links)
- Laço novo na aba logada do dono, `POST /api/ingest/cupons` com `COUPON_INGEST_TOKEN` próprio (Sensitive na Vercel; **não** reaproveitar o da Amazon). O servidor valida domínio de origem permitido, tamanho, parse de datas/valores e grava observações; **o servidor, não o laço, decide o estado do cupom.**
- Ritmo: listagens de cupons a cada 2 h; página de item só para os **candidatos das classes A e C** (até 40 itens por ciclo), uma página a cada 20 s. Somente leitura.
- Riscos: (a) ToS do ML e da Shopee sobre acesso automatizado fora da API; (b) a conta do dono no ML é a conta do programa de afiliados, então um bloqueio custa receita. **Recomendação:** usar uma conta secundária de comprador só para a varredura do ML, ritmo baixo e interromper ao primeiro captcha ou aviso (vira alarme, nunca contorno). Isto exige decisão explícita do dono (§9), porque contraria a regra "só API oficial" de 28/10.

#### 3.5 Como entram no texto
Bloco opcional de duas linhas, só com dado lido:
```
Cupom: <CÓDIGO ou "ativar na página">, <valor> (mínimo R$ <x>, teto R$ <y>, <categoria/vendedor>). Válido até <dd/mm hhHmm> segundo a loja.
Cashback: <x%> <forma>, <condição lida>. Visto em <dd/mm às hhHmm>; pode variar por conta.
```
Sem cupom verificado, o bloco **desaparece** (linha vazia some). Cashback só com percentual e condição lidos, nunca "cashback garantido".

#### 3.6 Meta honesta sobre "toda promoção com cupom"
- **Hoje: 0 cupons no banco.** A fração de mensagens com cupom começa em 0% e **depende do que as lojas efetivamente oferecem** e de a varredura ser autorizada. Nenhum cupom será criado para "completar" a mensagem.
- **Prioridade e destaque (a diretriz do dono):** (1) item com cupom verificado ganha +1 posição de prioridade na fila e a linha do cupom em destaque no texto; (2) a classe E publica os cupons verificados por si só; (3) o painel mede a **fração de alertas com cupom** e a lista de alertas que saíram sem (para o dono ver onde falta cobertura); (4) promoção sem cupom verificado sai **sem cupom** ou não sai, por regra, e a ata diz isso sem rodeio.
- **O que NÃO será prometido:** que o cupom funciona para cada pessoa; que o desconto "com cupom" aparece no carrinho; cashback creditado; estoque; que "toda promoção tem cupom"; qualquer previsão de que um cupom "vai voltar".

### 4. Cartão de histórico de preço

- **Entrega:** PNG 1200x675 gerado em memória no servidor (`ImageResponse` de `next/og` ou `satori` + `resvg`; confirmar na doc do Next 16 em `node_modules/next/dist/docs/` antes de codar), enviado por **`sendPhoto` com upload multipart** (sem URL pública, sem arquivo guardado, sem endpoint aberto a abuso). Legenda curta: limite de 1.024 caracteres no Telegram; o texto longo, quando houver, vai em mensagem própria. Para o WhatsApp: rota **autenticada** no admin que mostra o cartão e copia a imagem para a área de transferência junto do texto.
- **Dados (nunca inventados):** série diária `price_daily_state.min_cents` do produto desde 31/10 (qualidade `complete/partial`), a média por oferta-dia do período (`computePeriodMetrics`), o menor registrado (`price_min_events`) e o preço atual com o `last_price_confirmed_at`. Linha **em degrau** (o preço vale até mudar), **lacuna fica lacuna**, nada interpolado. Ponto de dia com qualidade `partial` sai vazado (círculo oco) e a legenda explica. Menos de 5 dias de série: não gera cartão.
- **Visual** (skill `padrao-visual-egeek`): fundo escuro premium, cantos quadrados, 1 cor de acento, linha de 2 px, grade discreta; eixo Y com início explícito e rotulado (gráfico de linha, não de barras, então a base não precisa ser zero, mas o início é escrito), eixo X com datas reais; três marcações: **mínimo registrado**, **média do período**, **atual** (com valor); título do produto, plataforma e mídia; faixa inferior "Dados do Espaço Geek 86 · série de 31/10 a 10/11 (11 dias) · conferido 10/11 às 21h41"; discreto "#publicidade" fora da imagem, na legenda. Nada de "afiliado", sem emoji, sem seta de previsão.
- **Custo e limites:** geração estimada em centenas de milissegundos [H, não medido]; PNG típico de 60 a 120 KB [H]; limite do Telegram para foto de 10 MB; fonte carregada no servidor (verificar licença e peso). Orçamento: <= 4 cartões por dia, cabe no teto de 60 s do cron com folga. Teste de aceitação: os números lidos do cartão (OCR manual do QA) batem com a consulta SQL do dia.
- **Regra "uma imagem, um lugar":** o cartão não é arquivo de `public/images/`, não repete entre mensagens (cada um tem série e carimbo diferentes) e não é armazenado.

### 5. Storytelling: estrutura e seis modelos com exemplos reais

**Estrutura fixa (editor + gamer):** 1) **O que está acontecendo** (fato medido com janela), 2) **Por que importa** (comparação com o próprio histórico, nunca com o "de" da loja), 3) **O que fazer** (convite a conferir, sem urgência fabricada), 4) carimbo "Conferido em ... às ..." e link. Até 6 linhas; sem adjetivo; proibido "imperdível", "corra", "últimas unidades", "vai cair", "garantido".

Valores abaixo são **reais, lidos hoje** de `price_daily_state` (menor preço diário do produto; série de 31/10 a 10/11, às vezes com 10 dias por lacuna de coleta; rede da oferta mais barata: Mercado Livre). Onde o texto traz cupom ou cashback, o exemplo mostra **só o molde marcado como molde**: hoje não existe cupom verificado no banco e nenhum foi inventado.

**S1. "Caiu e segue caindo" (T1), Ghost of Yotei Complete Edition PS5 físico**
Série: 349,00 / 349,00 / 349,00 / 336,97 / 334,90 / 334,90 / 334,90 / 334,90 / 316,16 / 311,51; 11 lojas.
```
Ghost of Yotei Complete Edition (PS5, mídia física)
O menor preço caiu dois dias seguidos: R$ 334,90, R$ 316,16, R$ 311,51 hoje (Mercado Livre).
Está 10,7% abaixo do primeiro valor da nossa série (R$ 349,00, em 31/10) e é o menor valor que registramos desde então.
Conferido em 10/11 às HHhMM. Ver a oferta: [link] #publicidade
```
(Observação do QA: a janela "desde 31/10" é obrigatória; o cálculo 311,51/349,00 = 0,8926 e 311,51/334,90 = 0,9302, queda de 7,0% sobre o dia anterior ao primeiro degrau.)

**S2. "Degrau que se manteve" (OK1 + sustentação), Collection of Mana (Switch, físico)**
Série: 223,40 / 223,40 / 223,40 / 223,40 / 225,85 / 225,44 / 226,26 / 169,99 / 169,99 / 169,99 / 169,99; 6 lojas.
```
Collection of Mana (Switch, mídia física)
Caiu de R$ 226,26 para R$ 169,99 (23,9% a menos) e se mantém nesse valor há 4 dias de série.
É o menor preço que registramos desde 31/10. Antes disso o piso era R$ 223,40.
Conferido em 10/11 às HHhMM. Ver a oferta: [link] #publicidade
```

**S3. "Está perto do piso, mas ainda não chegou" (T2), Bleach Rebirth of Souls PS5 físico**
Série: 246,99 x3 / 199,99 x4 / 246,99 / 338,00 / 323,00 / 219,99; 10 lojas.
```
Bleach Rebirth of Souls (PS5, mídia física)
Hoje: R$ 219,99. Já esteve em R$ 199,99 por quatro dias (3 a 6 de novembro, a confirmar com as datas da série) e em R$ 338,00 há dois dias. Caiu dois dias seguidos.
Está 10,0% acima do menor valor da série.
Conferido em 10/11 às HHhMM. Ver a oferta: [link] #publicidade
```
(Texto de aviso: a oscilação grande mostra que o preço mexe; não afirmamos que voltará ao piso.)

**S4. "Sem novidade, com contexto" (cartão sem preço novo), Volante Logitech G29 (PS e PC)**
Série: 1.534,00 / 1.669,90 / 1.599,00 x5 / 1.590,00 / 1.569,00; 59 lojas.
```
Volante Logitech G29 (PS e PC): sem preço novo hoje
R$ 1.569,00, a 2,3% do menor valor da nossa série (R$ 1.534,00 em 31/10) e 6,0% abaixo do maior (R$ 1.669,90). Caiu dois dias seguidos (1.599, 1.590, 1.569).
Se você está esperando, este é o histórico: [cartão]
Conferido em 10/11 às HHhMM. #publicidade
```

**S5. "Preço novo ainda sem confirmação" (retido ou aprovação), Jogo Cronos: The New Dawn (Switch 2)**
Série: 177,34 x4 / 179,30 / 178,97 / 179,62 x3 / 176,30 / 140,00.
Queda de 20,6% em um dia (176,30 para 140,00). Pela política, **queda > 8% vira alerta só após a segunda leitura confirmando** (>= 15 min) e, como a série tem **um único dia no novo patamar**, o texto diz exatamente isso:
```
Cronos: The New Dawn (Switch 2)
Apareceu hoje a R$ 140,00; ontem o menor era R$ 176,30 (queda de 20,6%). Ainda é um dia só: vamos acompanhar se mantém.
Conferido em 10/11 às HHhMM.
```
(Esse exemplo mostra o limite honesto: com dados curtos, a mensagem relata o fato e não "recomenda compra".)

**S6. "Foto de preço pré-Black Friday" (G5), Console Nintendo Switch 2, modelo nacional**
Dado da ata de hoje cedo, lido às 22h21 de 10/11: 62 ofertas ativas, mediana R$ 4.399,00; três menores R$ 3.157,54, R$ 3.231,44, R$ 3.270,95 (vendedores `5_green`); menor valor registrado desde 31/10: R$ 2.906,32. Repete em 24/11 e 27/11 "comparado com a foto de 10/11".
```
Foto de preço, 10/11: Nintendo Switch 2 (modelo nacional)
Menor preço hoje R$ 3.157,54 no Mercado Livre; mediana de 62 ofertas, R$ 4.399,00; menor valor que registramos desde 31/10, R$ 2.906,32.
Guardamos este registro para comparar com a Black Friday (27/11).
Conferido em 10/11 às 22h21. #publicidade
```

**Molde de cupom (não é dado):** `Cupom: <CÓDIGO>, R$ <x> de desconto acima de R$ <y> (válido até <dd/mm hhHmm> segundo a loja). Visto em <dd/mm às hhHmm>.` Só entra com cupom `verificado`; senão a linha não existe.

**Molde Amazon (aceito pelo dono):** `Preço na Amazon em dd/mm às hhHmm, sujeito a alteração.` O preço usa `last_price_confirmed_at`; sem comparação com a média de outras lojas (pergunta §9). Exemplo real de ontem: Mario 3D World + Bowser's Fury, R$ 329,99, carimbo do banco.

### 5b. Amazon: frescor, disparo, envio e saída da busca (decisão A)

- **Medido [D]:** idade do preço das 319 ofertas ativas: 103 < 30 min; 19 de 30 a 60 min; 192 de 60 a 120 min; 5 de 2 a 4 h. Com o ciclo novo de 25 a 35 min nos masters que já têm Amazon (201), **a idade esperada passa a ficar abaixo de 40 min**; a descoberta em rodízio não deve passar de 2 h.
- **Limites propostos:** **disparo** (detecção): preço confirmado há <= **60 min** e duas observações consecutivas separadas por >= **15 min**; **envio**: confirmação há <= **40 min** (cabe um ciclo inteiro + folga). O carimbo da mensagem é a hora **da confirmação**, não a do envio. Se no envio a confirmação tiver > 40 min, **não envia** (adia até a próxima leitura; nunca "envia assim mesmo").
- **Saúde do laço:** se a leitura mais recente de qualquer oferta Amazon tiver mais de 90 min, o cron marca a classe Amazon como `pausada` e avisa o dono (a aba pode ter fechado ou perdido o login). Quando o laço volta, a Amazon só dispara de novo depois de uma observação nova.
- **Oferta Amazon que sai do resultado da busca:** 1ª ausência: sai imediatamente dos gatilhos e do radar (preço desconhecido), mas continua `active`; 2 ausências seguidas (cerca de 1 h): `consecutive_miss_count = 2`, não elegível; 3 ausências ou 90 min: tratamento já existente de inativação/quarentena. Ao reaparecer: precisa de **duas observações >= 15 min** antes de voltar a disparar. Mensagem já enviada **não é recolhida**; a legenda "sujeito a alteração" é o aviso; um alerta de preço sem estoque (ou que sumiu em < 30 min) conta como divergência na pós-checagem.
- **Qualidade:** metade dos "descontos" grandes de 24 h eram Amazon (50 de 104 produtos com queda; 40% a 63% contra a média). Regra: Amazon só vai a automático dentro de 30% sobre a mínima diária anterior da própria Amazon; acima disso, aprovação humana (variante/vendedor errado é a hipótese principal; **não verifiquei** vendedor "Amazon.com.br" x terceiro, que o banco talvez não guarde).
- **Risco contratual aceito pelo dono, registrado nesta ata:** a Licença de PI da Amazon proíbe alerta de preço e cache de preço acima de 24 h, e a conta de Associados não está aprovada na Creators API. O conselho registra o aceite sem julgar; o texto da Amazon nunca usa a palavra "afiliado".

### 6. Cobertura dos nichos: diagnóstico e plano

#### 6.1 Números [D] (10/11, 23h)
| Vertical | Masters | Ofertas ativas | Masters com >= 3 ofertas | Em `review` (invisíveis) |
|---|---|---|---|---|
| tecnologia | 17 | 106 | 7 | 17 |
| livros | 24 | 135 | 12 | 24 |
| eletroeletrônicos | 6 (+1 rejeitado) | 28 (todas ML) | 3 | 5 |
| eletrodomésticos | 5 | 11 | 3 | 5 |
| esporte | **0** | **0** | 0 | 0 |
| **Total nichos** | **52** | **280** | 25 | **todos** |
- 100% das ofertas dos nichos são do Mercado Livre; **Shopee nos nichos: 0**. Frente aos games (4.321+ masters liberados, 9.888 ofertas ML e 1.150 Shopee), os nichos são **1% dos masters**.
- Por segmento (8 de 13 semeados): livros 24 (135 ofertas), placa de vídeo 6 (35), SSD 5 (39), air fryer 5 (11), impressora 3 (22), impressora 3D 3 (10), soundbar 3 (24), smart TV 3 (4). **Sem nenhum master: notebook, geladeira, máquina de lavar, tênis de corrida, bola de futebol.** `esporte` e o grosso de `eletrodomésticos` não têm nada.
- Frescor: todas as ofertas dos nichos têm preço confirmado nas últimas 6 h (o recoletor `collect-vertical` funciona); **o problema é a entrada de produtos, não a atualização**. 62 de 106 ofertas de tecnologia estão com link de afiliado pendente e 24 de 135 em livros: sem link, `/go` e mensagem não saem.

#### 6.2 Por que a amostra é pequena (causas medidas nos logs de `backup/dados/semear-vertical-*`)
1. **Não há semeadura automática.** `scripts/semear-vertical.ts` é manual, uma execução por vez, **teto de 40 chamadas ao ML** (padrão `--max-calls 40`), `--limit 10`, `--offset 0`. Nenhum cron semeia (o cron `discover-products?source=meli` do `vercel.json` serve só a games). Em 10/11 foram feitas 3 rodadas de livros (39+40 chamadas e outra) e 1 de bola.
2. **Sempre a primeira página.** Todas as rodadas usam `offset 0` com 10 resultados por termo; a segunda rodada de livros já devolveu "já existe no catálogo ML": 6; a terceira, 1. A primeira página satura.
3. **Termos provisórios e poucos.** `TERMS_STATUS = 'provisorio'`; `--apply` exige `--termos-aprovados`. Um a três termos por segmento (bola: **um**, "bola de futebol campo nike"; geladeira, máquina de lavar e tênis: um).
4. **Catálogo sem vendedor (404 "No winners found").** Na rodada de livros: 22 de 110 resultados (20%); na de bola: **10 de 10** (100%); na medição de 08/11: 16 das 58 chamadas e **todos** os catálogos testados de notebook, SSD, smart TV, geladeira, máquina de lavar e tênis. É o maior desperdício: cada 404 custa uma chamada. [H] Parte dos catálogos 404 são "pais" cujas ofertas estão em filhos; isso se testa com ~10 chamadas ao `GET /products/{id}` (não feito).
5. **Filtros do porteiro e de identidade.** Livros, 110 resultados: 39 de domínio fora do segmento, **30 ISBN importado rejeitado**, 22 sem vendedor, 10 sem identidade forte, 6 já existente, **3 criados**. Tênis: GTIN 0/10 na medição: por regra, **nunca vira master** (revisão humana) e fica em zero.
6. **Rendimento baixo e decrescente:** 24 masters criados em 118 chamadas de livros (**0,20 master por chamada**), com 7, 3 e 14 por rodada.
7. **Visibilidade zero para o cliente:** todos os 52 estão com porteiro `review`, `/go` filtra games e o porteiro é manual. Para o dono, "amostra pequena" tem também esta camada: **nada dos nichos aparece nem pode ser mensagem hoje.**

#### 6.3 Plano de ampliação (ordem, esforço, 72 h)
1. **Primeiro (0,5 dia + execuções):** rodadas de semeadura com `--offset 10, 20, 30` nos livros e nos segmentos já com rendimento (placa de vídeo, SSD, impressora, soundbar, smart TV, air fryer), ampliando os termos (autor e gênero em livros; modelos nos demais) **depois que o dono aprovar a lista de termos** (§9). Teto operacional proposto: **12 rodadas por dia × 40 chamadas = 480 chamadas/dia** [H: o ML não devolveu nenhum cabeçalho de limite e 58+118+39+40+11 chamadas medidas não geraram 429/5xx; reduzir ao primeiro 429].
2. **Segundo (0,5 dia):** testar a hipótese 4 (catálogo pai/filho e a alternativa `buy_box_winner` em `/products/{id}`) com no máximo 10 chamadas; se confirmada, corrige o maior desperdício antes de gastar mais cota.
3. **Terceiro (1 dia):** semear os 5 segmentos zerados (notebook, geladeira, máquina de lavar, bola; tênis fica em revisão por regra) com 2 a 3 termos novos cada.
4. **Quarto (0,5 dia):** destravar o gargalo de link: resolver os 62 + 24 links pendentes (rodada de geração de links já existente) ou excluir esses masters do envio.
5. **Quinto (2 dias, depois de 14/11):** Shopee nos nichos **só anexando oferta a master já existente** (a Shopee não devolve GTIN: identidade só por título, risco de variante), com aprovação humana no porteiro. Sem isso a Shopee nos nichos seria massa de ruído.

**Metas até 20/11 (masters com oferta ativa / ofertas ativas; semana a semana):**
| Vertical | Hoje | Meta 14/11 | Meta 20/11 | Esforço |
|---|---|---|---|---|
| livros | 24 / 135 | 70 / 350 | 120 / 600 | baixo (rendimento comprovado) |
| tecnologia | 17 / 106 | 40 / 250 | 80 / 500 | médio (404 em notebook e SSD) |
| eletroeletrônicos | 6 / 28 | 20 / 120 | 40 / 250 | médio |
| eletrodomésticos | 5 / 11 | 20 / 80 | 40 / 200 | médio |
| esporte | 0 / 0 | 5 / 15 | 20 / 60 | alto (404 em 10/10) |
| **Total** | **52 / 280** | **155 / 815** | **300 / 1.610** | |
As metas são esforço-alvo, **não promessa**: dependem da cota do ML e do rendimento por chamada (0,20 hoje, com tendência a cair). Se o rendimento cair abaixo de 0,10 master por chamada em duas rodadas seguidas, o plano para e volta ao conselho.

### 7. Plano de implementação por onda

| Onda | Item | Esforço | Dono | Como o qa-verificador valida |
|---|---|---|---|---|
| **Até 12/11** | 7.1 `RULES v2` (5 classes, orçamentos de som e total, dedup, OK1/OK2/T1/T2, faixas de risco, limites da Amazon) em funções puras com testes | 1,0 d | engenheiro-backend | Testes unitários (cada desigualdade nos dois lados), `tsc`, 0 uso de "afiliado" |
| | 7.2 Migration 0029 (colunas de `group_messages`, `UNIQUE (channel, dedup_key)`, `system_config` de controle, cupons) com backup e `.rollback.sql` | 0,5 d | dba-postgres | Aplicar em transação, conferir rollback, RLS e `REVOKE` |
| | 7.3 Ramo automático no cron `group-messages` em modo **`auto-dry`** (decide, grava, não envia); `vercel.json` `*/5 * * * *`; flag de pausa no banco e botão "Pausar" | 1,5 d | engenheiro-backend / arquiteto-next | Rodar 2 instâncias em paralelo (sem duplicata), alternar a flag (próxima execução envia 0), 24 h de logs |
| | 7.4 Correção de `loadCoupons` (exigir `valid_until`) e do texto "de/por" do `message-template.ts` | 0,5 d | engenheiro-software-principal | Teste com cupom vencido |
| | 7.5 Amazon na decisão: `judgeOffer` com ramo Amazon, carimbo, limites 60/40 min, pausa por laço parado, tratamento de ausência | 0,5 d | engenheiro-backend / cientista-dados-tempo-real | Casos reais de idade do preço; simular ausência |
| | 7.6 Rodadas de semeadura (item 1 do §6.3) após aprovação dos termos | 0,5 d + execuções | guardiao-catalogo / engenheiro-coleta | Contagem antes/depois por vertical, 0 duplicata (`findExistingMasterProduct`) |
| **Até 14/11** | 7.7 **Primeiro envio automático: só classe A, Mercado Livre**, depois de 24 h de `auto-dry` com **30 mensagens conferidas contra o banco e 0 divergência**; pós-checagem ligada; freio de inscritos ligado | 0,5 d | engenheiro-backend | Conferência manual de 30 (preço, loja, carimbo, link, texto) |
| | 7.8 Classes B (radar) e D (resumo 8h/20h), textos S1-S4, S6 | 1,0 d | editor-noticias / engenheiro-backend | Revisão de tom, 0 verbo de previsão |
| | 7.9 Cartão de histórico + `sendPhoto` (classe C) em `auto-dry` e aprovação | 1,5 d | engenheiro-frontend / bi-dataviz / designer-marca | Números do cartão = SQL; sem interpolação; sem arquivo em `public/images/` |
| | 7.10 Amazon liga em automático (classe A) dentro dos limites; Shopee só por aprovação | 0,5 d | engenheiro-backend | 20 alertas Amazon conferidos, nenhum com carimbo > 40 min |
| | 7.11 Tabelas de cupons + `POST /api/ingest/cupons` + token novo; laço de varredura **só observando** (não entra em mensagem) | 1,5 d | engenheiro-coleta / seguranca-db | Token separado, parse de datas, 0 cupom sem `source_url` e `verified_at` |
| **Até 20/11** | 7.12 Linha de cupom/cashback e classe E, com a regra "verificado, visto <= 2 h, escopo casa" | 1,0 d | engenheiro-backend / editor-noticias | 100% das linhas de cupom com observação-fonte; cupom vencido não sai |
| | 7.13 Classe C automática para ML; Shopee e nichos por aprovação; liberação dos nichos conforme §9 | 1,0 d | engenheiro-backend | Amostra de 20 por departamento |
| | 7.14 Modo Black Friday (tetos de 20 a 27/11, resumo das 22h, fotos de 24/11 e 27/11) | 0,5 d | engenheiro-backend | Simulação da regra de data |
| | 7.15 Painel de métricas (cliques por mensagem e por classe, saída de inscritos, fração com cupom, `skipped` por motivo, divergência da pós-checagem) e a retrospectiva | 1,0 d | cientista-dados / bi-dataviz | Cada métrica reproduzível por SQL |
| | 7.16 Cobertura: metas de 20/11 do §6.3 | contínuo | guardiao-catalogo | Contagem por vertical |

Total de engenharia: cerca de **12 dias de trabalho em 10 dias corridos**; só cabe se o dono autorizar a migration e o `vercel.json` em 11/11 e se as frentes (mensagens, cartão, cupons, semeadura) correrem em paralelo. Se faltar capacidade, a ordem de corte é: cupom (7.12) -> cartão (7.9) -> classe E, nunca a pós-checagem nem o freio.

### 8. Riscos e vetos

**Vetos do qa-verificador (condicionais, valem até serem cumpridos):**
1. Nenhuma linha de cupom, cashback ou condição sem linha de observação-fonte (`source_url`, `verified_at`, valor e prazo lidos).
2. Nenhum envio automático antes de 24 h de `auto-dry` com 30 mensagens conferidas e 0 divergência.
3. Nenhuma mensagem da Amazon sem carimbo, ou com confirmação > 40 min no envio.
4. Nenhum cartão com interpolação, série < 5 dias, ou números diferentes do SQL.
5. Nenhuma frase de previsão ("vai cair", "deve", "tende a", "hora de comprar", "garantido"); nenhum "de/por" do marketplace; nenhum "afiliado".
6. Freio por saída de inscritos e pós-checagem obrigatórios antes de liberar as classes B a E.
7. Nenhum radar "de enchimento" (< 2 itens com mudança).

**Riscos:**
- **Banimento/denúncia do canal:** mais volume e mais "robô" aumentam denúncia por spam; mitigado por orçamento de som, silêncio por notificação, identificação de publicidade, freio de inscritos e pausa automática. Telegram não limita a taxa em nosso patamar (30/dia).
- **CONAR/CDC:** link comissionado é publicidade (CDC art. 36, guia do CONAR); manter `#publicidade` e a frase fixada no canal (sem "afiliado"). Cupom com prazo errado é informação enganosa (CDC art. 37): por isso só prazo **lido**, com carimbo. Não é parecer jurídico.
- **Contrato:** Amazon (risco aceito pelo dono); ML e Shopee (ToS sobre acesso automatizado fora da API ao varrer cupons; risco de bloqueio da conta de afiliado do ML: mitigação por conta secundária).
- **Dado:** série curta (11 dias) e instabilidade do menor preço do dia (caso Dualsense: 1.889 a 4.599 em um dia, quando as ofertas baratas somem). Mitigação: gatilhos exigem >= 3 lojas e reconfirmação; ponto parcial no cartão fica oco.
- **Segurança:** token do bot já passou pelo chat (sugestão de `/revoke` em aberto); novo token de ingestão separado; cron só Bearer; RLS e `REVOKE` nas tabelas novas; `escapeHtml` em todo texto de marketplace; whitelist de `s` e `m` no `/go`.
- **Vercel:** env só vale com deploy; por isso a pausa por banco. Cron de 5 em 5 min depende do plano [H: `vercel.json` já tem crons de 5 min].
- **Equilíbrio honesto:** mais mensagens aumentam o risco de saída. A política reduz o ruído (som) mas **não elimina**; só a medição das 2 primeiras semanas diz se o volume está certo.

### 9. O que depende do dono (lista curta, com recomendação)
1. **Aprovar o pacote de frequência** (5 classes, teto 30/dia, 40 de 20 a 27/11, no máximo 8 mensagens com som, noite silenciosa e não muda). Recomendação: **sim, com os freios automáticos**.
2. **Autorizar envio automático no Telegram para classes seguras a partir de 13/11, depois de 24 h de `auto-dry` e 30 mensagens conferidas** (em vez dos 7 dias da ata da manhã), com aprovação humana só em Shopee, desconto > 25% (retido acima de 40%), vendedor sem reputação e nichos novos. Recomendação: **sim**; "nenhuma aprovação" não recomendada (custo em §1.3).
3. **Amazon:** confirmar texto **sem comparar com a média de outras lojas** e os limites de frescor de 60 min (disparo) e 40 min (envio). Recomendação: **sim**.
4. **Cupons de ML e Shopee por varredura assistida** na aba logada (exceção à regra "só API", somente leitura, ritmo baixo, **conta secundária de comprador no ML**, parar ao primeiro captcha). Recomendação: **sim**, aceitando que a fração de mensagens com cupom começa em 0% e que o canal também publica cupons verificados por si só (classe E). E autorizar a **uma** consulta de esquema na Shopee Open API.
5. **Autorizar** a migration 0029 (com backup e rollback), as mudanças no `vercel.json` (cron de 5 em 5 min) e a criação do `COUPON_INGEST_TOKEN` (Sensitive). Recomendação: sim, hoje.
6. **Aprovar a lista de termos de busca dos nichos** (`TERMS_STATUS = provisorio`) e o teto de **480 chamadas/dia ao ML** para semeadura, com parada ao primeiro 429. Recomendação: sim; posso apresentar a lista ampliada ao dono em uma página.
7. **Liberar os nichos** (porteiro e `/go` por allow-list) para masters com >= 3 ofertas e link pronto, a partir de 17/11, com aprovação humana nas 20 primeiras mensagens por departamento. Recomendação: **sim**; sem isso os 52 masters atuais e os novos não podem ser mensagem.
8. **Frase de publicidade:** manter `#publicidade` junto do link e a frase fixada no canal ("Os links podem render comissão ao Espaço Geek 86 sem custo extra para você"). Recomendação: manter.
9. **Segurança do bot:** revogar e regenerar o token no @BotFather (ele passou pelo chat) e atualizar na Vercel. Recomendação: fazer antes de ligar o automático.

## Métrica de sucesso
- 14/11: cron em `auto-dry` há >= 24 h, 30 mensagens conferidas com 0 divergência; primeiro envio automático da classe A (ML); 0 mensagem com "afiliado", "de/por" ou previsão.
- 20/11: 5 classes no ar (menos cupom, se não autorizado); fração de alertas com cupom medida e reportada (mesmo que 0%); cobertura dos nichos conforme §6.3.
- 27/11: saída de inscritos < 2% por semana; clique válido por mensagem medido por classe; pós-checagem com divergência por erro nosso < 2% das mensagens; relatório de cobertura por vertical.
- Conferir toda semana: mensagens `skipped`/`expirada` por motivo, saída de inscritos, cliques por classe, divergência da pós-checagem.

## Execução e verificação
- Executores previstos: engenheiro-backend (cron, regras, Amazon), arquiteto-next/dba-postgres (migration, flags), engenheiro-coleta e integrador-apis (cupons, Shopee), engenheiro-frontend/bi-dataviz/designer-marca (cartão), editor-noticias/gamer-veterano (textos), guardiao-catalogo (semeadura), seguranca-db (tokens, RLS).
- QA: o `qa-verificador` valida cada onda como descrito na tabela do §7 e exerce os vetos do §8. **Nesta reunião não foi rodado build, teste unitário, navegador nem envio**; os números são SELECTs e uma execução somente leitura do detector real (`detectGroupCandidates`, sem histórico, sem escrever) em amostras de 320 produtos (janelas de 24 h e 7 dias) para o diagnóstico de bloqueios. Limitações das medições: mínimo diário (não oferta viva) para os gatilhos; a média de comparação por "média das médias diárias"; contagem por produtos distintos; o detector avalia no máximo 320 produtos por execução, ordenados por prioridade (evento, abaixo da média, rede, procura), então pode haver candidatos fora da amostra.
- Arquivos temporários removidos ao fim: `scripts/_x.ts`, `scripts/_y.ts`, `scripts/_z.ts`.

## Retrospectiva
Pendente (preencher após a primeira semana de envio automático).
