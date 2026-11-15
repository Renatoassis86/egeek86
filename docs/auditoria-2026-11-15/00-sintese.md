# Auditoria geral 2026-11-15: síntese executiva (Conselho Geek, fila #64)

Presidente: geek-lead. Insumos: os quatro painéis desta pasta (`01-pedidos-atendidos.md`, `02-vulnerabilidades.md`, `03-modelo-negocio-efetividade.md`, `04-eficiencia-tecnica.md`). Esta síntese não traz medida nova: todo número abaixo foi copiado de um dos quatro painéis (instantâneos de 2026-11-15, 04:40 a 08:00 BRT; mudam a cada ciclo). Onde os painéis divergem, a divergência está na seção 6. Ata: `docs/conselho/atas/2026-11-15-auditoria-geral.md`. Plano executável: `docs/fila-de-execucao.md` (#69 em diante).

## Síntese em uma página

1. **O que o negócio é hoje.** Um hub de inteligência de preços gamer/tech, não um marketplace de drops. Coleta ofertas em Mercado Livre (API), Shopee (API de afiliados) e Amazon (aba logada do dono), mantém um catálogo de masters com regras de identidade, calcula a média por oferta/dia, envia cerca de 1.440 mensagens/dia ao Telegram com preço reconferido e ganha comissão por clique rastreado. Magalu está em estudo e pausada pelo dono.
2. **A máquina de dados é forte.** 31,3 mil ofertas ativas; 0 de 2.865 mensagens divergiram mais de 2% na reconferência (máximo 0,89%); RLS ligada em 102 de 102 tabelas e `anon` sem nenhum acesso; `tsc` com 0 erros; páginas com TTFB de 0,3 a 0,6 s com cache quente.
3. **O negócio está sem audiência e sem receita medida.** O único chat contado tem 5 membros (estável de 10/11 a 15/11). `affiliate_conversions` tem 0 linhas e nenhum importador está agendado. Dos 1.356 cliques desde 15/07, 980 (72%) são bots; humanos: 14 nas últimas 24 h. Receita real: SEM DADO.
4. **Os maiores riscos não são de hacker.** São, em ordem: perder a conta de afiliado (Amazon: raspagem em aba logada e falta de declaração visível), publicar preço ou produto errado (51 ofertas acima de R$ 30.000, 12 abaixo de R$ 5, 112 títulos de risco ativos), a coleta ou os alertas pararem sem aviso (alertas em dry-run; Chrome como ponto único de falha) e perder o banco (backup único de 884 MB no mesmo PC, sem PITR confirmado).
5. **O gargalo técnico é a coleta, não a web.** 96% das execuções do `collect-shopee` e 58% a 85% das verticais terminam por orçamento de tempo; a fila de coleta nunca zera (eletroeletrônicos com 29,5 h de atraso). 104 linhas `running` presas e um segundo disparador do `collect-prices` (573 execuções em 24 h contra 288 esperadas).
6. **Pedidos do dono:** de 22, 10 atendidos, 8 parciais, 2 em andamento, 2 não atendidos (um deles pausado por ordem do dono). O pedido central de 14/11 (Prime 25% na finalização) tem código no ar e zero itens no front ou nas mensagens.
7. **Documentação:** README e Blueprint descreviam um marketplace de drops (julho); `CLAUDE.md` dizia "somente API oficial" e contradizia a coleta assistida; não havia ata desde 13/11 apesar de 102 commits. Corrigidos nesta rodada (ver seção 5 e as notas "Atualizado em 2026-11-15" em cada guia).
8. **O que fazer até a Black Friday (27/11).** 18 itens P0 até 19/11, dos quais 14 dependem do dono (credencial, painel, flag ou decisão). Os três de maior retorno por esforço: tornar o repositório privado (S), ligar alertas e sonda externa (S), achar o segundo disparador e fechar a porta `?key=` (S a M).

## (a) Placar dos pedidos do dono (painel 1, 22 pedidos)

| Status | Qtde | Pedidos (numeração do painel 1) |
|---|---|---|
| ATENDIDO | 10 | 1 imagem do Observatório e Sobre; 2 console só em linha e novo (resíduo: 2 jogos tipados console, 1 "Fonte Ps2", 7 consoles sem veredito); 5 impressoras 3D Kobra e Bambu; 6 preço da mensagem igual ao do site; 9 rodapé sem aviso de comissão, cartões clicáveis, cache de 5 min; 10 Bambu A1/P1S/P2S; 12 cards v2 (código; flag NÃO VERIFICADA); 13 cupom encerrado com nome; 15 consolidação Switch 2 + Mario Kart (7 masters duplicados restantes); 16 comissão prevista só no admin |
| PARCIAL | 8 | 3 foto com mão por oferta (sem automação, sem motivo da quarentena gravado); 4 checklist C1 a C15 e R2-1 a R2-17 (29 de 34 ações vistas; C7, C13, C15, R2-9, R2-10, R2-12 parciais); 7 Prime 25% (código sem efeito visível); 8 política "só usado/retrô barra" (275 masters de semeadura em `review`); 14 auditoria de cobertura por produto; 19 rollout da home nova (sem agendador); 21 regras R2, segurança e frescor (24 h x 7 dias; CSP só em Report-Only); 22 Conselho em toda tarefa (backup ok, sem atas de 14 e 15/11) |
| EM ANDAMENTO | 2 | 11 ciência e tecnologia industrial (#60; semeadura ainda não rodou); 20 relatórios de 6 h e vigia dos loops (sem arquivo de relatório no repositório; vazão da Amazon caiu de 54-72/h para 5-34/h) |
| NÃO ATENDIDO | 2 | 18 loja 3D em 3 seções (#63, não iniciada, em fila); 17 Magalu (#61, pausada por ordem do dono; conta como aguardando) |

## (b) Riscos consolidados (duplicatas entre painéis unidas)

Probabilidade (P) e impacto (I) em alta (A), média (M) ou baixa (B), como atribuídos nos painéis. "Fila" aponta a linha de `docs/fila-de-execucao.md` que trata o risco.

| # | Risco consolidado | Fontes | P / I | Evidência (números dos painéis) | Fila |
|---|---|---|---|---|---|
| R1 | Conta de afiliado em perigo por política: declaração de afiliado fora das páginas, mensagens com link sem a linha padrão, raspagem automática da Amazon em aba logada (2/2 h) | 02-A5, 02-A6, 01-§3.6 | M / A | `CommissionNotice` sem uso em nenhuma tela; declaração só em `termos` e `sobre`; 474 runs `amazon-assistida` em 24 h; revisão jurídica pendente | #74, #95 |
| R2 | Repositório GitHub PÚBLICO com 153 arquivos de `docs/backups` (~98 MB), estratégia, atas, tabela de comissão e e-mail pessoal | 02-A7 | M / A | `gh repo view` = PUBLIC | #69 |
| R3 | Coleta e alertas param sem ninguém saber (alertas em dry-run, sem sonda externa, Chrome ponto único de falha, `amazon-vitrine` parado ~22 h) | 02-A1, 04-L1, 04-§5, 03-A8 | A / A | `COLLECTOR_ALERTS` e `TELEGRAM_ALERT_CHAT_ID` ausentes na Vercel; 5 lacunas de mais de 30 min nos batimentos em 48 h (maior 2 h 23 min); `canal_interno_nao_configurado` | #70, #81 |
| R4 | Perda de dados: backup único local de 884 MB (mesmo PC dos loops, sem criptografia), PITR não confirmado, migrações sem ledger confiável | 02-A2, 02-§6, 04-§3 | B-M / A | `__drizzle_migrations` com 19 linhas para ~52 migrations | #71 |
| R5 | Linhas `running` presas e orçamento de tempo igual ao teto da função (reaper ausente) | 02-M1, 04-§3.4, 01-risco 4, 03-B1 | A / M | 104 a 106 presas; ~25 por dia; `collect-shopee` máx 285 s com teto de 300 s; `collect-prices` máx 214 s com teto de 200 s | #72 |
| R6 | Disparador duplicado do `collect-prices` e `?key=` ainda aceito | 02-A8, 04-§8, 01-R2-9, 02-B1 | A / M | 573 execuções em 24 h contra 288 esperadas; 274 minutos com 2 runs; `/api/health` e webhook ML leem `?key=` | #73 |
| R7 | Preço e produto errado ativos: preços implausíveis, itens "desbloqueado/retro", quarentena sem motivo gravado | 02-A4, 01-risco 1, 01-§2 | M / A | 51 acima de R$ 30.000, 12 abaixo de R$ 5, 112 títulos de risco (98 em games); 99 + ~115 quarentenas indistinguíveis no banco | #75, #76 |
| R8 | Dependências com advisory crítico (Next 16.2.6, sharp, zod) e sem trava de CI | 02-A3, 02-M6, 04-A4 | M / A | `npm audit`: 1 crítica e 5 altas; 5+ deploys em Error por import servidor em cliente; 57 dos 89 testes sem entrada em `npm run` | #77, #91 |
| R9 | Negócio sem audiência nem receita medida: 5 membros, 0 conversões, cliques inflados por bots | 03-resumo 1 a 3, 03-D1 a D4 | A / A | 5 membros; 0 linhas em `affiliate_conversions`; 980 de 1.356 cliques são bots | #78, #79, #80 |
| R10 | Frescor insuficiente onde está a maior taxa (Amazon) e fila de coleta que nunca zera | 03-C3, 04-C1, 02-A6 | A / M | Amazon 6,2% em 6 h e 29,8% em 24 h; eletroeletrônicos com 4.018 ofertas devidas e 29,5 h de atraso; Shopee 2,1 h | #81, #88 |
| R11 | Prime/cupom no ritmo do concorrente ainda sem efeito | 01-§7, 03-resumo 5 | A / M | 0 mensagens Prime em 48 h; 0 cupons Shopee em `coupon_items`; 3.610 cupons ML "não verificado"; nenhum job `amazon-promocoes` registrado | #82 |
| R12 | Catálogo fora do front: 275 masters de semeadura em `review`, 278 novos em 24 h; pureza pós-lote não medida | 01-§1.8, 03-C5 | A / M | 319 (painel 1) ou 356 (painel 3) em `review`; lote `auto:r2-11` inclui `geracao_ambigua` 257 | #83, #98 |
| R13 | Carga do banco concentrada em 2 consultas, cache por instância frio na Black Friday e 60 conexões | 04-D4, 04-W1, 04-D6 | M / A | `live_networks` 43% e estatística por master 33% das 181 h de execução; 1ª visita de produto em 2,7 s | #87, #89, #93 |
| R14 | Credenciais e ingestão: token único para 3 redes, service role "Non-sensitive", Preview com acesso de escrita, DB sem TLS | 02-M2, M3, M7 | B / A | token compartilhado; `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET` em Preview | #92, #107 |
| R15 | Bloqueio de robôs úteis pelo firewall (Googlebot, TelegramBot) e prévia de link | 04-W4 | M / M | rajada de ~30 requisições gerou 403 `X-Vercel-Mitigated: deny` para todos os UAs testados | #85 |
| R16 | Rollout da home nova sem agendador nem rollback treinado na semana do pico | 01-risco 9 | M / M | `redesenho_home` inexistente em `feature_flags`; 3 degraus (19, 21 e 22/11) dependem de alguém rodar | #84 |
| R17 | LGPD e termos por rede incompletos (cookie `eg_v`, retenção, matriz de termos) | 02-M8, M9 | M / M | política não cita `eg_v`; histórico de preço de terceiros guardado indefinidamente | #94 |
| R18 | Governança: IDs duplicados na fila, sem ata desde 13/11, sem dono para crescimento, receita, verificação externa e custos | 03-E1, E2, 01-§3.8 | A / B-M | #33, #37 e #45 duplicados; 102 commits sem ata | #104 (e esta rodada) |

## (c) Eficiência, eficácia e efetividade (números medidos nos painéis)

### Eficiência (recurso x resultado; painéis 3 e 4)
- Leituras de preço em 48 h: ~394 mil (ML 275 mil, Shopee 91 mil, Amazon 28 mil) geraram 2.888 mensagens: 0,73% das leituras viram mensagem. 74% das propostas expiram sem envio (14.401 de 19.520); no painel 4, 82% (14.402 expiradas contra 2.807 enviadas).
- Orçamento de tempo esgotado: `collect-shopee` 552 de 574 execuções (96%); `collect-vertical` livros 163 de 191 (85%), impressão 3D 124 de 187 (66%), eletroeletrônicos 112 de 192 (58%). Cotas de API não são o limite (429 em 0,014% das checagens do ML).
- Fila de coleta: `collect-prices` com 6.894 ofertas devidas; eletroeletrônicos com 4.018 devidas e 29,5 h de atraso; Shopee com 3.092 a 3.218 devidas e 2,1 h de atraso (meta 60 min).
- Banco: 1.074 MB; crescimento de 10 a 15 MB/dia; `affiliate_price_snapshots` 664 MB, 3,5 milhões de linhas e 8,8% de linhas mortas (último autovacuum em 11/11); duas consultas somam 76% das 181 h de execução; `max_connections = 60`, `cache hit` 98,82%.
- Web: TTFB 0,32 a 0,62 s com cache quente; 1ª visita de produto 2,70 s; HTML de 573 KB a 987 KB (47,5 a 51 KB comprimido); ~300 KB de JS em brotli; 82 arquivos `force-dynamic`, tudo `x-vercel-cache: MISS`.
- Tempo de função: 71 a 79 h/dia de cron. Custo em R$ por etapa: SEM DADO.
- Retrabalho: 3.403 masters reavaliados; 2.928 decisões de identidade em 7 dias, 0 desfeitas; 541 linhas `closed=false` de dias passados (painel 1 conta 719), em alta.
- Código e testes: 96.720 linhas em `src`; 89 testes `scripts/test-*.ts`, 32 com `npm run test:*`; dos 69 sem banco, 61 passam e 8 falham por harness (`server-only`); 13 scripts de escrita sem padrão `--apply`.
- Dependência do dono: Amazon, cupons, links meli.la, WhatsApp (0 envios em 7 dias), fila de classificação (1.169 itens) e pelo menos 7 tarefas P1 aguardando decisão.

### Eficácia (fazemos o que prometemos?)
- Exatidão da mensagem: 2.865 reconferidas, divergência média 0,00% e máxima 0,89%; 13 de 1.050 com leitura viva diferente (1,2%); 87 de 2.860 (3,0%) divergem mais de 2% do preço atual da oferta em qualquer horário (o preço mudou depois do envio); nas últimas 3 h, 0 de 143. Preço real da loja: SEM DADO.
- Frescor por rede (confirmadas em 6 h / 24 h): ML 96,3% / 98,2%; Shopee 96,5% / 96,5%; Amazon 6,2% / 29,8%.
- Cobertura contra o concorrente (amostra viesada de 20 itens): 17 no catálogo (85%), 10 visíveis (50%).
- Catálogo: 6.443 masters aprovados com oferta ativa; 1.007 em 2 ou mais redes (15,6%); 1.482 de 8.326 (17,8%) com 5 ou mais ofertas (piso do selo).
- Mensagens sem termo proibido: 0 em 2.889; 0 com divergência de recheck acima de 2%.
- Prime e cupom: 42 mensagens CUPOM em 48 h (1,5%), 4 cupons novos em 48 h, 0 mensagens "Exclusivo Prime", 0 cupons Shopee.
- Latência da descoberta à mensagem (mediana): G2 318 s, AC 72 min (p90 5,5 h), CUPOM 118 min.
- Testes das regras do dono rodados na auditoria: `test-comissao-admin`, `test-card-v2`, `test-guardiao-cupons` e `test-promo-prime` com 0 falhas.

### Efetividade (gera resultado de negócio?)
- Audiência: 1 chat, 5 membros, sem crescimento em 5 dias com cerca de 7 mil mensagens enviadas.
- Cliques: 1.356 desde 15/07 (376 humanos, 980 bots); 151 humanos em 7 dias (111 de um único iPhone, provável teste do dono); 14 em 24 h; só 19 humanos em 30 dias com origem Telegram rastreada; 31 humanos com mensagem identificada em todo o histórico (G2 25).
- Receita: 0 conversões importadas; comissão realizada SEM DADO. Comissão prevista (só admin, tabela versionada 2026-11-15): potencial nominal de estoque R$ 2,38 milhões sobre 31.291 ofertas (teto, não previsão); "se todo clique comprasse" ~R$ 29,5 mil em 30 dias, 82% em consoles do ML; com conversão de 1% a 3% (hipótese não medida), R$ 300 a R$ 900. Só a taxa da Amazon é confirmada.
- Onde está o dinheiro (previsto): consoles do ML (69 cliques, ticket médio R$ 4.387); a Amazon paga 8% contra 2,5% do ML em eletrônicos e 3D, mas recebe 2,4% das mensagens por falta de frescor; consoles são 1,4% das mensagens e 3D 8%.
- Disponibilidade comercial: 1.059 a 1.061 ofertas ML ativas com `affiliate_link_pending` (sem comissão, sem clique).

## (d) Plano único priorizado

Esforço: S até 1 h; M meio dia; L de 1 a 3 dias ou mais. "DEPENDE DO DONO" = exige decisão, credencial, painel ou ação física dele. Cada linha tem número na fila (`docs/fila-de-execucao.md`). Datas: P0 até 19/11, P1 até 27/11 (Black Friday), P2 depois.

### P0 (até 19/11)

| Fila | Ação | Dono sugerido | Esforço | Métrica de sucesso | Dono humano? |
|---|---|---|---|---|---|
| #69 | Repositório GitHub público para privado (A7); depois limpar e-mail pessoal de `docs/` | seguranca-db | S | `gh repo view` mostra PRIVATE | DEPENDE DO DONO (ação na conta GitHub) |
| #70 | Ligar `COLLECTOR_ALERTS=1` e `TELEGRAM_ALERT_CHAT_ID` e criar sonda externa em `/api/health` (A1) | engenheiro-infra-sre | S | alerta de prova recebido; loop derrubado de propósito gera aviso | DEPENDE DO DONO (criar chat, variáveis Sensitive, conta da sonda) |
| #71 | Backup: confirmar plano e PITR, `pg_dump` noturno fora da máquina, teste de restauração (A2) | dba-postgres + engenheiro-infra-sre | M | backup diário fora do PC e restauração testada, anotada em `docs/` | DEPENDE DO DONO (painel Supabase, bucket, custo) |
| #72 | Reaper de `collector_runs` `running`, orçamentos a 80% do teto, `run.finish` em `finally` | engenheiro-backend + engenheiro-infra-sre | M | 0 `running` acima de `maxDuration` + 2 min por 3 dias (hoje 104) | não |
| #73 | Achar o segundo disparador do `collect-prices`, desligar e então `CRON_ACEITA_KEY_NA_URL=off`; `/api/health` com `rejectUnlessCronAuthorized` | engenheiro-infra-sre + seguranca-db | S a M | `collect-prices` ~288 execuções em 24 h (hoje 573); 0 ocorrência de `?key=` nos logs | DEPENDE DO DONO (painéis Supabase, cron externos, variável na Vercel) |
| #74 | Transparência de afiliado: seção "Como ganhamos dinheiro", linha no rodapé, linha padrão nas mensagens, sem aviso em cards (A5) | editor-noticias + engenheiro-frontend + estrategista-mercado | S | texto no ar e 100% das mensagens com a linha; declaração Amazon localizável | DEPENDE DO DONO (aprovar o texto; ele retirou o aviso das telas de compra) |
| #75 | Quarentena em lote com backup: 51 preços acima de R$ 30.000, 12 abaixo de R$ 5, 98 títulos de risco em games e demais dos 112; teto absoluto por vertical | guardiao-catalogo + engenheiro-backend | M | 0 ofertas públicas fora da faixa; 0 "desbloqueado/réplica" ativa; rollback testado | DEPENDE DO DONO (aval do teto absoluto: barreira nova) |
| #76 | Gravar o motivo da quarentena (coluna ou trilha) e marcar as ~214 existentes pelos logs | dba-postgres + engenheiro-backend | M | 100% das quarentenas com motivo | DEPENDE DO DONO (aval de migração) |
| #77 | Subir `next` para 16.4.6, `sharp` e `zod`; build e testes | arquiteto-next + engenheiro-software-principal | M | `npm audit --omit=dev` sem crítica; `tsc`, `build` e testes verdes; `vercel ls` Ready | não |
| #78 | Importar conversões (ML CSV, Shopee API) e subId por canal e tipo de mensagem | engenheiro-backend + integrador-apis | M | `affiliate_conversions` > 0 e relatório diário até 19/11 | DEPENDE DO DONO (CSV do ML e credencial Shopee) |
| #79 | Cliques válidos (sem bots, sem UAs do dono) como KPI; `m=` em 100% dos links de mensagem | engenheiro-backend | S a M | bots < 5% do reportado; 100% dos cliques de mensagem com `m=` | não |
| #80 | Captação de inscritos: plano, divulgação do canal no site, nos cartões e na Black Friday; contar todos os chats | estrategista-mercado + produtor-gamer-mundial | M | `group_member_counts` crescendo por dia; meta sugerida 500 até 27/11 | DEPENDE DO DONO (divulgação e canais) |
| #81 | Amazon fresca: religar `amazon-vitrine`, alarme de laço parado (> 30 min), reabertura automática do Chrome e batimento dos loops | engenheiro-coleta + operador | M | >= 90% das ofertas Amazon com gatilho confirmadas em 40 min (hoje 43%); confirmadas em 24 h de 30% para 70% | DEPENDE DO DONO (PC ligado, repouso desativado, Task Scheduler) |
| #82 | Prime e cupom: confirmar `PROMO_PRIME_DERIVADA`, `PROMO_DESCOBERTA`, `GROUP_PROMO_PRIME`; reinjetar `amazon-promocoes`; cupom Shopee; retomar `coupon_items` do ML e confirmar `CUPOMPRAHOME` | agente-cupons + integrador-apis | M | >= 20 mensagens CUPOM/Prime por dia; 0 alvos Prime fora do catálogo | DEPENDE DO DONO (flags Sensitive, Chrome logado) |
| #83 | Regra permanente "master de semeadura com chave forte nasce aprovado" e esvaziar os 275 em `review` | guardiao-catalogo | S a M | masters de semeadura em `review` próximos de 0 e sem acúmulo diário | DEPENDE DO DONO (aval: afrouxa barreira atual) |
| #84 | Agendar os 3 degraus do rollout da home nova (19, 21 e 22/11) e ensaiar o `--rollback` | qa-verificador + engenheiro-infra-sre | S | 10% em 19/11 executado; rollback ensaiado uma vez | DEPENDE DO DONO (criar tarefas ou autorizar execução) |
| #85 | Exceção de firewall para Googlebot e TelegramBot (W4) | engenheiro-infra-sre | S | UAs de robô com 200 durante rajada de teste | DEPENDE DO DONO (painel Vercel) |
| #86 | `proxy.ts`: só chamar `getUser` com cookie `sb-*`; cookie de visitante só com a flag de experimento | arquiteto-next + engenheiro-performance-web | S | menos invocações por visita anônima; TTFB sem piora | não |

### P1 (até 27/11)

| Fila | Ação | Dono sugerido | Esforço | Métrica de sucesso | Dono humano? |
|---|---|---|---|---|---|
| #87 | Materializar a contagem por departamento (`live_networks`) e limitar a idade da estatística por master | dba-postgres + engenheiro-backend | M | `live_networks` < 0,3 s médio; sem estatística com 11,6 dias de idade | DEPENDE DO DONO (migration) |
| #88 | Coleta por valor, `collect-vertical` de livros e eletroeletrônicos mais frequentes, excluir expiradas do `oldest_due_age_s`, congelar ampliações de 20/11 a 30/11 | engenheiro-coleta | M | `oldest_due_age_s` < 2 h (eletro) e < 1 h (Shopee) em 24 h | DEPENDE DO DONO (congelamento e cota Shopee, #20) |
| #89 | Pré-aquecimento das páginas após deploy, `revalidate` de 60 s, imagens menores e `next/image` unoptimized revisto | engenheiro-performance-web | M | 1ª visita de produto < 1,5 s; sem `504` no pico | não |
| #90 | Limitar propostas à cadência de envio; índice parcial da fila; autovacuum de `affiliate_price_snapshots`; índice de `last_price_confirmed_at` | engenheiro-backend + dba-postgres | M | consulta da fila < 1 s (hoje 6,4 s); mortas de snapshots abaixo de 2% | DEPENDE DO DONO (DDL) |
| #91 | CI e pre-push: `npm test` agregado, typecheck, build e regra de fronteira cliente/servidor | engenheiro-infra-sre + engenheiro-software-principal | M | push com import quebrado é barrado; 89 testes na suíte | não |
| #92 | Token de ingest por rede; service role como Sensitive; tirar segredos do escopo Preview; apagar cópias de `.env` em disco | seguranca-db | M | 1 token por rede; Preview sem `DATABASE_URL`/`CRON_SECRET` | DEPENDE DO DONO (reemitir chaves) |
| #93 | Regras de firewall extras, dedupe de cliques, modo "Under Attack" pronto; aumentar a computação do Supabase por 3 dias de pico | engenheiro-infra-sre | M | plano de pico escrito e testado; `max_client_conn` conferido | DEPENDE DO DONO (custo e painel) |
| #94 | LGPD: cookie `eg_v`, retenção e consentimento; matriz "rede x o que o termo permite" | seguranca-db + estrategista-mercado | M | política atualizada; matriz em `docs/` | DEPENDE DO DONO (banner ou desligar `eg_v`) |
| #95 | Decisão sobre a raspagem da Amazon e plano para API oficial (A6) | integrador-apis + estrategista-mercado | L | decisão em ata/ADR com risco declarado | DEPENDE DO DONO |
| #96 | Verificação externa de preço: 30 mensagens por dia conferidas na loja | qa-verificador + operador | M | 95% dentro de 1% | DEPENDE DO DONO (Chrome) |
| #97 | Mix de mensagens para onde está a comissão (consoles, impressoras, Amazon) sem romper régua e diversificação | engenheiro-backend + estrategista-mercado | M | consoles e 3D >= 10% das mensagens (hoje consoles 1,4%, 3D 8%) | não |
| #98 | Pureza pós-lote (amostra de 200 masters); resíduos de console e miúdos; 104 masters com `catalogGate` NULL; fusão dos 7 masters Switch 2 + Mario Kart | guardiao-catalogo | M | >= 98% puros; 0 resíduos citados | não |
| #99 | Foto com mão automática em oferta nova; reduzir falsos positivos `ml_vende`/`http_206` | engenheiro-coleta + qa-verificador | M | oferta nova com mão real entra em quarentena sem lote manual; menos propostas derrubadas (~700/48 h) | não |
| #100 | WhatsApp: lote diário pronto ou API oficial | engenheiro-backend | M | >= 20 envios por dia (hoje 0) | DEPENDE DO DONO |
| #101 | Taxas reais do ML e da Shopee e nova `VERSAO_TABELA` | integrador-apis | S | >= 80% do valor em taxa "confirmada" | DEPENDE DO DONO (login nos painéis) |
| #102 | Confirmar flags de produção (`GROUP_CARD_V2`, `PROMO_*`, `redesenho_home`, `CRON_ACEITA_KEY_NA_URL`) e provar os cards v2 em produção | engenheiro-infra-sre + qa-verificador | S | tabela de flags na seção 11 do `FLUXO_MESTRE.md` | DEPENDE DO DONO (variáveis Sensitive) |
| #103 | Painel de metas (North Star) lido por SELECT: inscritos, cliques válidos, conversões, frescor Amazon, cobertura efetiva | bi-dataviz + cientista-precos | M | painel no ar | não |
| #104 | Ata semanal do Conselho e atas de 14 e 15/11 | geek-lead | S | 1 ata por semana; atas faltantes gravadas | não |
| #105 | Leitor de voucher e preço pix da Shopee | engenheiro-coleta | M | preço exibido igual ao do concorrente nos itens de amostra | DEPENDE DO DONO (aba logada da Shopee) |

### P2 (depois de 27/11)

| Fila | Ação | Dono sugerido | Esforço | Métrica de sucesso | Dono humano? |
|---|---|---|---|---|---|
| #106 | Padrão dry-run/backup/rollback (`scripts/_seguro.ts`) nos 13 scripts de escrita legados | engenheiro-software-principal | M | 13 scripts migrados | não |
| #107 | Hardening: CSP enforce com nonce, TLS no banco, `safeFetchImage`, `audit_log`, teste negativo de IDOR, ledger de migrações, perfis órfãos, handle do Telegram | seguranca-db | L | CSP em enforce; achados B2 a B6, M5, M7 fechados | não |
| #108 | Retenção e crescimento do banco: arquivar `batimento` antigo, retenção de `docs/backups`, índices pouco usados após 7 dias, pastas mortas e `.gitignore`, painel de custo | dba-postgres | L | tamanho de `affiliate_price_snapshots` estabilizado | não |
| #109 | Refatoração: `group-rules.ts` por gatilho, porteiro único, nomes duplicados lib/server, comentário de `regras.ts:29` | engenheiro-software-principal + guardiao-catalogo | L | testes de caracterização verdes | não |
| #110 | Relatório de 6 h versionado (script + log) e vigia com rastro no repositório | engenheiro-infra-sre | M | arquivo de relatório por ciclo | não |

## 5. Documentos-guia atualizados nesta rodada

README e `PROJECT_BLUEPRINT.md` (reescritos para o retrato real), `CLAUDE.md` e `AGENTS.md` (fontes de coleta e regras vigentes), `agents/geek-lead.md` (regra de coleta), `FLUXO_MESTRE.md` (adendo v1.2), `CONSELHO_GEEK.md` (versão 2026-11-15), `docs/plano-convivencia-frentes.md` (crons), `docs/fila-de-execucao.md` (IDs únicos, estados reais e #69 a #110) e a ata `docs/conselho/atas/2026-11-15-auditoria-geral.md`. Cada um traz o bloco "Atualizado em 2026-11-15".

## 6. Divergências entre os painéis (para o leitor não somar duas vezes)

- Linhas `running`: 106 (painel 2), 104 de 105 (painel 4), 58 em todas as execuções de 48 h (painel 3, recorte de outra consulta). Usar "104 a 106 conforme a hora".
- Masters em `review`: 319 (painel 1) e 356 (painel 3); masters aprovados em lote: 1.489 `auto:r2-11` (painel 1) e 3.391 de `review` para `approved` (painel 3, soma de lotes `r2-11`, `q4q5` e `c10`).
- Dias de preço abertos: 719 (painel 1, `closed=false` com data passada) e 541 (painel 3, mais de 1 dia no passado). Em ambos, a fila #15 estava defasada (99).
- Disparador do `collect-prices`: o painel 2 não achou `pg_cron`/`pg_net` na lista de extensões; o painel 4 viu sessões `pg_net`/`pg_cron scheduler` e um comentário de código sobre um job `geek-deals-collect-prices`. A origem do segundo disparador segue NÃO VERIFICADA (#73).
- Ofertas ativas do ML: 24.398 (painel 1), 24.443 (painel 2), 24.519 (painel 3): horas de medição diferentes.
- Mensagens expiradas: 74% (painel 3, sobre as criadas) e 82% (painel 4, expiradas contra enviadas). Bases diferentes.
- Taxa de reconferência: o painel 3 usa 2.865 mensagens; o painel 4 aponta 13 de 1.050 com leitura viva diferente. Medidas distintas, ambas válidas.

## 7. Limites desta síntese

Sem acesso às variáveis "Sensitive" da Vercel (flags, firewall, alertas) nem ao painel do Supabase ou ao Chrome do dono: tudo o que depende disso está marcado NÃO VERIFICADO nos painéis e aqui. Taxas de comissão do ML, Shopee e Magalu são estimadas. Cliques humanos usam filtro aproximado de user-agent. Custo em R$ por etapa e tráfego real: SEM DADO.
