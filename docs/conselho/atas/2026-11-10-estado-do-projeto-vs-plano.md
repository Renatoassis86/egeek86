# Ata do Conselho Geek: estado do projeto contra o plano e passo a passo até a Black Friday

- **Data:** 2026-11-10 (Black Friday em 2026-11-27: faltam 17 dias)
- **Porte:** grande (visão geral, sem execução). SOMENTE LEITURA: nenhum código, banco, Vercel ou commit foi alterado.
- **Presidente:** geek-lead
- **Convocados (pareceres independentes, em paralelo):** estrategista-mercado, especialista-precos, estatistico-senior, cientista-dados-tempo-real, cientista-precos, dba-postgres, key-user-gamer (estado das seções do site, lido no código), qa-verificador. Conselho consultivo; decisão de negócio é do dono.

## Briefing
Pergunta do dono: como está o projeto; estamos seguindo o plano do conselho, da estatística (métricas) e da modelagem/aprendizado de máquina; como anda a extração do portfólio; as seções e locais dos itens estão formatados no site; qual o passo a passo até 27/11. Prioridade declarada: receber comissão. Não se reabrem decisões já tomadas. Regras em jogo: zero dado fake, um jogo uma média (ADR 0004), uma imagem um lugar, cliente nunca vê "afiliado", coleta por API oficial (emendada para a Amazon em 10/11).

Convenção: **[D]** dado medido hoje (SELECT de leitura, 10/11 ~22h local, script temporário apagado), **[C]** visto no código, **[H]** hipótese, **[R]** recomendação.

## 1. Plano x realizado por frente

| Frente | Plano | Realizado hoje | Situação |
|---|---|---|---|
| Coleta Mercado Livre games | Cada oferta checada com frescor, API oficial | [D] collector_runs 24 h: `collect-prices` 576 rodadas, 576 ok, 26.069 checadas, 12.059 snapshots, 1 erro, 1 rate-limited, 34 s em média, máximo 72,9 s. 9.919 ofertas ativas não quarentenadas, 9.919 checadas em < 6 h | No plano |
| Coleta Shopee | 5 em 5 min, sem 429 | [D] 1.150 ativas, todas checadas em < 6 h; ~2.000 checadas/h nas últimas 6 h com 0 erro. Mas as 180 rodadas das últimas 24 h estão `partial` (nenhuma `ok`), com 145 erros/rate-limited concentrados antes das 18h UTC | Recuperado, status enganoso |
| Coleta verticais novas | Semeadura espaçada | [D] 48 rodadas ok em cada uma das 4 verticais; ofertas ML ativas: tecnologia 106, livros 152, eletroeletrônicos 28, eletrodomésticos 13, esporte 0 | Pequeno; gargalo é descoberta |
| Amazon | Fora da Black Friday (ata 10/11 de manhã) | [D] 138 ofertas ativas via raspagem assistida, 20 rodadas ok em 24 h, 10 itens por rodada, tag única nos 138 links | Desvio (ver seção 3) |
| Magalu, AliExpress | Fora da Black Friday | [D] 0 ofertas | Sem coleta |
| Catálogo / dedup / identidade | ADR 0005 e 0006; `findExistingMasterProduct` | [D] 6.594 masters games; 0 oferta órfã, 0 vertical divergente, 0 GTIN duplicado, 0 `(rede, item)` duplicado (dba-postgres); [C] testes de identidade 152/152, gate 126, dimensões 259, `tsc` exit 0 (qa-verificador). 0 de 6.594 masters com GTIN | Coerente; sem GTIN |
| Indicadores (ADR 0004) | Média por oferta-dia, selo e eventos | [D] `price_daily_offer` 108.829 linhas (24/10 a 10/11, 18 dias, 3.308 masters); `price_daily_state` 46.718 linhas (desde 13/07, 4.474 masters, mediana de 2 dias medidos por master, máximo 119, 1.670 com `composition_flag`); `price_min_events` 11.418 em 1.921 masters, 9.646 `reconstructed` (84%), 580 nas últimas 24 h; em 10/11, 1.850 masters com estado, 882 com 2 ou mais lojas, 644 com 3 ou mais ofertas | Sombra rodando, leitura pública no legado |
| Flags `PRICE_METRICS_V2` e `PRODUCT_CARD_V1` | Ligar após paralelo SQL, QA e autorização | [C] seguem OFF (decisão do dono; a variável não consta em `.env.local`, valor na Vercel não conferido por mim); cards, tabela e home usam a base do ADR 0001 (cotação bruta), contradizendo "selo, gráfico e cabeçalho usam a MESMA média" enquanto a V2 está desligada. Faltam: backtest, script de paralelo SQL em 30 ou mais produtos, QA no navegador | Atrasado |
| Eventos do menor preço | Toda mudança registrada com hora, valor, loja | [D] ata de 10/11: 68 eventos com min = prev_min, 936 masters com oferta ativa sem evento, 681 de 2.613 masters gamer sem linha em `price_daily_state` (números da ata, não remedidos hoje) | Atrasado |
| Modelagem / aprendizado de máquina | Plano de 26/07: ARIMA, Prophet, XGBoost, NLP, previsão 30/60/90 dias | **Não existe modelo algum.** [C] sem `.py`, `.ipynb`, `.pkl`, `.onnx`; sem ARIMA/Prophet/XGBoost em `src/`; a única menção é um item de intenção em `src/app/admin/data-science/page.tsx:28`. O que existe é estatística descritiva e regra: `price-verdict-v2.ts` (mediana entre lojas, banda por MAD e percentil), `parecer-produto.ts`, quarentena por faixa 0,35x a 3x. `VERDICT_JUDGEMENT_ENABLED = false`. Com 18 dias de oferta-dia e mediana de 2 dias medidos por master, não há base para previsão | Plano de ML não seguido, e a ata de 05/11 já havia priorizado o descritivo. Registrar o adiamento formalmente |
| Verticais no site | Isolamento por allow-list (ADR 0008) | [D] 52 masters nas 4 verticais novas, todos em revisão, 0 visíveis. [C] `/go` e sitemap filtram `vertical='games'` | Isolado, nada público |
| Parecer + BI por produto | Depois das métricas | Não iniciado | Depois de 27/11 |

## 2. Cobertura do portfólio

**Masters por vertical e veredito do gate** [D] (visível = veredito diferente de review/rejected):

| Vertical | Masters | Visíveis | Revisão ou rejeitados | Visíveis com oferta ativa |
|---|---|---|---|---|
| games | 6.594 | 4.523 | 2.071 (1.575 rejected, 496 review) | 2.054 (45%), todos com oferta checada em < 6 h |
| tecnologia | 17 | 0 | 17 | 0 |
| eletroeletrônicos | 6 | 0 | 6 | 0 |
| livros | 24 | 0 | 24 | 0 |
| eletrodomésticos | 5 | 0 | 5 | 0 |
| esporte | 0 | 0 | 0 | 0 |

**Games visíveis com oferta ativa, por plataforma (jogos / acessórios / consoles)** [D]: ps5 368 / 71 / 27; ps4 356 / 34 / 9; switch_1 476 / 76 / 32; switch_2 38 / 17 / 8; xbox_series 119 / 68 / 17; xbox_one 170 / 19 / 8; xbox_360 20 / 7 / 0; plataforma `unknown` 45 jogos / 65 acessórios / 4 consoles (102 jogos e 161 acessórios visíveis sem plataforma definida, contra a regra de não ficar em `unknown`).

**Profundidade da comparação** [D]: dos 4.523 masters games visíveis, 2.469 não têm oferta ativa, 1.914 têm 1 rede, 106 têm 2 redes e 34 têm 3 redes. Masters visíveis com oferta ativa por rede: ML 1.334, Shopee 811, Amazon 83.

**Ofertas ativas por rede e vertical (frescor)** [D]: Mercado Livre 10.318 (games 10.019 sendo 100 em quarentena, tecnologia 106, livros 152, eletroeletrônicos 28, eletrodomésticos 13); Shopee 1.150 (games); Amazon 138 (games). Das ofertas ativas não quarentenadas, 100% checadas em < 6 h (ML, Shopee e Amazon). Expiradas: ML games 5.687, Shopee games 3.204. Fila: o campo `oldest_due_age_s` chegou a 8.602.765 s (~99 dias) em alguma rodada e `due_total` a 9.221, número incompatível com o frescor das ativas: [H] vem de oferta fora do conjunto "ativa não quarentenada" ou com `last_checked_at` nulo; não usar como alarme até explicar.

**Banco** [D, dba-postgres]: 668 MB (`affiliate_price_snapshots` 553 MB, 3,37 milhões de linhas, 13/07 a hoje); RLS em 86 de 86 tabelas; 21 de 60 conexões em uso; sem política de retenção de snapshots e `collector_runs`; `cron.job` ilegível para o usuário da conexão (agendamentos não confirmados pelo banco).

### Links de afiliado do Mercado Livre (prioridade do dono: comissão) [D]

Consulta: `affiliate_offers` com `status='active'`, rede `mercado-livre`, forma da `affiliate_url`.

| Vertical | Ativas | Com `matt_tool` | Link puro pendente (`affiliate_link_pending=true`, sem parâmetro) | Short link `meli.la` | Em quarentena (dentro de "com matt_tool") |
|---|---|---|---|---|---|
| games | 10.019 | 10.014 | 4 | 1 | 100 |
| tecnologia | 106 | 44 | 62 | 0 | 0 |
| livros | 152 | 128 | 24 | 0 | 17 |
| eletroeletrônicos | 28 | 23 | 5 | 0 | 0 |
| eletrodomésticos | 13 | 8 | 5 | 0 | 0 |
| **Total** | **10.318** | **10.217 (99,0%)** | **100** | **1** | **117** |

- Todas as 10.217 ofertas com `matt_tool` usam **um único valor** de `matt_tool` (distintos = 1). Nenhuma traz `matt_word` ou `matt_source`. Os 100 pendentes são permalink puro (hosts `produto.mercadolivre.com.br` 8.784, `www.mercadolivre.com.br` 1.533, `meli.la` 1).
- Fora de quarentena e clicáveis no público (games): 9.914 com `matt_tool`, 1 `meli.la`, **4 puras**. As 96 puras das verticais novas não são alcançáveis pelo cliente (`/go` filtra games). [C] `/go/[slug]/route.ts` **não bloqueia** `affiliate_link_pending`: redireciona para o permalink puro, então essas 4 ofertas games levam ao cliente à loja **sem comissão** (só registra `linkPending` no evento de clique).
- Shopee: 1.150 ativas, todas em `s.shopee.com.br` (link curto). Amazon: 138 ativas, todas `www.amazon.com.br` com `tag=` único.
- [H] Não confirmei que `matt_tool` sozinho (sem `matt_word`) credita comissão nem que o valor único é o do dono (a variável `MELI_TOOL_ID` não está em `.env.local`; valor na Vercel não conferido). [R] O dono confere no painel de afiliados do ML se cliques e vendas aparecem atribuídos à conta; é o único teste que prova a comissão.

### Seções do site [C, key-user-gamer; lido no código, sem navegador]

| Seção/rota | Estado | O que falta |
|---|---|---|
| Home | pronta | sem destaque de Black Friday |
| `/ofertas` | pronta | filtros por tipo, fabricante, geração, formato, rede e ordem existem; sub-plataforma/categoria de departamento não |
| `/pesquisa`, `/monitoramento`, `/altas-e-baixas`, `/ofertas/[slug]`, `/oferta-encerrada` | prontas | confirmar tratamento da plataforma `unknown` |
| `/tabela-de-precos` | parcial [H] | sem filtro de plataforma lido |
| `/ranking` | placeholder | sem dado real |
| `/hype-zone`, `/leiloes`, `/inteligencia-gamer`, `/noticias` | prontas | conteúdo não auditado |
| Página ou faixa Black Friday | ausente | zero ocorrências no código público |
| `/mercado/[vertical]` e páginas das 5 verticais | ausentes | por decisão, ficam ocultas |
| Menu e rodapé | parcial | sem plataforma nem departamento no menu |
| Aviso de comissão | parcial | `CommissionNotice` no rodapé e na tabela de lojas (`product-stores-table.tsx:100`); não na vitrine nem no botão de compra |

O cliente vê hoje apenas games. Divergência entre pareceres: o key-user não conseguiu afirmar se o botão some nas ofertas pendentes; o código confirma que não (rota `/go`, acima).

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estrategista-mercado | Plano seguido na cobertura ML+Shopee; receita limitada por oferta e aviso | Aviso de comissão, promover masters com oferta ativa, destravar links pendentes, Black Friday só com ML e Shopee | Taxa de clique por oferta |
| especialista-precos | Dados no plano, camada pública atrasada | Ligar V2 e CARD só como fatos após paralelo SQL; selo e "% abaixo" só com 14 ou mais dias e 3 ou mais ofertas; Amazon fora da média; congelar regras em 20/11 | Código de renderização do selo não lido por ele |
| estatistico-senior | Descritivo seguido, ML não | Sem veredito nem previsão; só preço agora e mediana das lojas com 3 ou mais lojas; marcar a quebra de 05/11; reavaliar ML em 2027 com 90 dias ou mais | Backtest do juízo |
| cientista-dados-tempo-real | ML saudável, Shopee recuperando, Amazon frágil | Entender `partial`, alarmes de frescor e rodada parada, teste de carga do ML, plano B da Amazon, congelar coleta de 20 a 27/11 | Explicação dos 99 dias de fila |
| cientista-precos | V2 e CARD prontos em sombra, faltam eventos e estado | Corrigir eventos e preencher estado, paralelo SQL, ligar V2 e CARD por volta de 20/11 só com fatos | Script de paralelo SQL inexistente |
| dba-postgres | Banco íntegro e pequeno | Medir conexões e EXPLAIN das consultas quentes, alertas de disco e conexões, backup antes de DDL, retenção depois | Plano e cota de disco do Supabase |
| key-user-gamer | Games pronto, Black Friday ausente | Resolver pendentes, faixa Black Friday com dado real, aviso de comissão na oferta, esconder `/ranking` | QA no navegador |
| qa-verificador | `tsc` e 10 de 11 testes verdes; zero "afiliado" visível | Registrar emenda Amazon, rodar build e `test-plausibilidade` com `--conditions=react-server`, veto a anunciar Amazon e a ligar V2 sem regressão | `build` e `test:vertical` não rodados |

## 3. Onde o projeto desviou do plano e riscos

1. **Raspagem assistida da Amazon (decisão do dono, 10/11).** Emenda a regra de 2026-10-28 (só API). 138 ofertas ativas, 20 rodadas/24 h, depende do PC e da aba logada do dono. A emenda ainda **não está registrada como ADR** (a ata de 10/11 manda registrar antes de código; o código já roda). Risco aceito pelo dono: a Licença de PI da Amazon exclui robôs e limita cache de preço a 24 h; 6(y) proíbe rastreio e alerta de preço, 6(z) proíbe misturar com outros varejistas; violação material permite suspensão e retenção de comissões. A conta não está aprovada na Creators API.
2. **Shopee na média e no histórico públicos (dono, 10/11).** Perguntas à Shopee não serão enviadas; risco contratual residual de exibir histórico e o nome "Shopee" (ambíguo, T&C 2.3(a) e 6.1(d)).
3. **Sem aviso de comissão (dono: "não precisa").** Contraria CONAR 2026 e CDC (identificação de publicidade) e a cláusula 5 do Operating Agreement da Amazon (frase obrigatória em local destacado; risco de suspensão do programa). Estado atual: aviso genérico no rodapé e na tabela de lojas.
4. **Link sem comissão alcançável:** 4 ofertas games pendentes saem pelo `/go` sem rastreio.
5. **Média da Amazon:** o especialista-precos recomenda mantê-la fora de média, histórico e alerta até parecer jurídico; o código atual não separa (a decidir, item 3 do dono).
6. **Sem plataforma:** 102 jogos e 161 acessórios visíveis em `unknown`.
7. **Quebra de série em 05/11** (768 para 607 masters com média; `composition_flag` 449 contra 113 a 156), por viés de seleção da emenda ADR 0004.
8. **Contratos ML/Shopee/Amazon:** termos do ML não lidos; Shopee sem cláusula sobre histórico; Amazon com termos lidos e conflitantes com o uso atual.

## Divergências e réplica (rodada 2)
- **Ligar V2/CARD antes da Black Friday?** cientista-precos recomenda ligar por volta de 20/11 com escopo "fatos"; especialista-precos aceita se passar as pré-condições e reversão testada; qa-verificador veta sem teste de regressão; estatistico-senior só aceita fatos (sem selo, sem veredito). Resultado: convergem em "fatos apenas, com paralelo SQL de diferença zero e reversão testada, decisão do dono"; sem isso, a Black Friday abre no legado e **sem** a regra "mudança do menor preço sempre visível" (risco assumido).
- **Cronograma do selo:** o estrategista [H] diz que a janela de 14 dias fecha ~13/11; a medição mostra apenas 18 dias de oferta-dia e mediana de 2 dias por master, logo o selo só vale para uma minoria. Resolvido a favor do estatístico: sem desconto sem base.
- **Aviso de comissão:** o dono decidiu que não precisa; estrategista, QA e key-user pedem. Vai de novo ao dono como decisão 2, com o argumento do risco à conta Amazon (e CONAR), sem reabrir a decisão sobre a Shopee.

## Decisão (plano de 17 dias, em ordem)
Plano proposto; nada executado. Responsável entre parênteses; métrica de sucesso ao fim de cada item.

| Quando | Item | Responsável | Métrica de sucesso |
|---|---|---|---|
| 11 a 12/11 | Registrar a emenda da raspagem assistida da Amazon como ADR e na ata (pré-condição do dono) | geek-lead, arquiteto-next | ADR numerado, com as condições da ata de 10/11 |
| 11 a 12/11 | Bloquear no `/go` e na página da oferta o clique de oferta com `affiliate_link_pending` (rótulo "link em ativação") e tratar as 100 pendentes: pedir ao dono o link do gerador ML ou regerar com o `matt_tool` | engenheiro-frontend, engenheiro-backend, dono | 0 oferta clicável sem rastreio; pendentes games = 0 |
| 11 a 13/11 | Prova de comissão ML: cliques/vendas atribuídos no painel do ML; verificar se `matt_tool` sozinho basta | dono, integrador-apis | Atribuição confirmada ou formato de link corrigido em lote (com backup NDJSON) |
| 11 a 14/11 | Aviso de comissão no botão e na página da oferta, sem a palavra "afiliado"; frase da cláusula 5 junto às ofertas Amazon | engenheiro-frontend, revisão jurídica | Aviso visível em 100% das páginas de oferta; 0 "afiliad" no HTML público |
| 12 a 14/11 | Eventos do menor preço: corrigir os 68 com min = prev_min, ligar os 936 masters sem evento; preencher `price_daily_state` dos 681 sem linha; reparar as 18 linhas abertas | cientista-precos, dba-postgres (com backup) | 0 evento min = prev_min; 100% dos masters com oferta ativa com estado |
| 12 a 15/11 | Paralelo SQL em 30 ou mais produtos (diferença zero), backtest do juízo, rodar `build`, `test:vertical`, `test-plausibilidade` com `--conditions=react-server` | estatistico-senior, qa-verificador | Diferença zero; testes todos verdes |
| 13 a 17/11 | Alarmes: idade máxima do dado por rede, rodada `running` > 15 min, `partial` consecutivas, ausência de `amazon-assistida` > 6 h (a ata já pede 3 h), 429 > 5%, conexões > 40; explicar `oldest_due_age_s`; corrigir o critério de fechamento `partial` da Shopee | cientista-dados-tempo-real, engenheiro-infra-sre | Alarmes disparando em ensaio; `partial` vira `ok` em rodada completa |
| 13 a 18/11 | Faixa ou página Black Friday só com ML e Shopee e dado real ("menor preço desde DD/MM", sem selo de desconto sem base); promover masters com oferta ativa e rebaixar os 2.469 sem oferta; tratar `unknown`; filtro por plataforma na tabela e no menu; esconder ou rotular `/ranking` | engenheiro-frontend, key-user-gamer, designer-marca | Página no ar; 0 número sem origem no banco; 0 imagem repetida |
| 17/11 | Ponto de decisão Amazon (go/no-go Creators API: conta, credencial, resposta sobre histórico) e retirada da Amazon da média se o dono assim decidir | geek-lead, dono | Decisão registrada em ata |
| 18 a 20/11 | Ligar `PRICE_METRICS_V2` e `PRODUCT_CARD_V1` apenas como fatos, se o paralelo e o QA passaram, com reversão testada; senão ficam OFF | dono, qa-verificador | Reversão ensaiada; página = cards = tabela na mesma média |
| 19 a 20/11 | Teste de carga do ML e Shopee; backup do banco; plano B da Amazon se o PC do dono ficar desligado | engenheiro-infra-sre, dba-postgres | Conexões < 40 de 60; leitura fria < 5 s |
| 20 a 27/11 | **Congelamento de regras, coleta e esquema**; só correções com ensaio de reversão; vigília diária de 429, frescor e eventos | geek-lead, qa-verificador | 0 regressão; frescor < 6 h em 100% das ativas |
| 27/11 | Black Friday: declarar só lojas com oferta fresca (ML e Shopee), sem mencionar AliExpress ou Magalu | estrategista-mercado | 0 menção a loja sem oferta; 0 cupom sem origem |

**Fica de fora até 27/11:** previsão e qualquer modelo de ML (reavaliar em 2027 com 90 dias ou mais de oferta-dia; registrar o adiamento); veredito e selo "abaixo do usual" sem 14 ou mais dias com 3 ou mais ofertas; parecer + BI por produto; páginas públicas das 5 verticais novas; AliExpress e Magalu; Creators API (salvo go em 17/11); alertas de preço; backfill do legado; retenção de snapshots; qualquer dado sem origem no banco.

## Decisões que cabem ao dono (uma por vez, com recomendação)
1. **Conferir no painel de afiliados do ML se `matt_tool` sozinho gera comissão e se o valor único é o seu.** Recomendação: fazer até 13/11; é a prova de que as 10.217 ofertas pagam.
2. **Aviso "Podemos receber comissão se você comprar" junto ao botão e a frase da Amazon, reconsiderando a decisão de "não precisa".** Recomendação: aprovar (risco de suspensão do programa Amazon e CONAR).
3. **Amazon fora da média, do histórico e do alerta de preço até parecer jurídico?** Recomendação: sim, mostrar só preço atual com horário.
4. **Autorizar bloquear o clique em oferta com link pendente e fornecer os links das 100 pendentes (tecnologia 62 primeiro, tíquete alto).** Recomendação: sim.
5. **Ligar V2 e CARD só como fatos por volta de 20/11 se passarem paralelo e QA?** Recomendação: sim; senão, abrir a Black Friday no legado ciente de que a mudança do menor preço não ficará visível.
6. **Registrar a emenda da raspagem Amazon como ADR e o adiamento do ML.** Recomendação: sim, hoje.
7. **Congelamento de 20 a 27/11.** Recomendação: sim.

- Decisão do responsável do projeto: **pendente**

## Métrica de sucesso
Até 27/11: 100% das ofertas clicáveis com link rastreado; 0 selo ou desconto sem base; 0 evento min = prev_min; frescor < 6 h em 100% das ofertas ativas de ML e Shopee; 0 "afiliado" e 0 imagem repetida no HTML público; testes verdes; reversão das flags ensaiada. Conferir em 17/11 (go/no-go), 20/11 (congelamento) e 27/11.

## Execução e verificação
- Executores futuros: engenheiro-frontend, engenheiro-backend, cientista-precos, dba-postgres, cientista-dados-tempo-real, engenheiro-infra-sre, integrador-apis.
- QA desta etapa: somente leitura. Registrei os números acima a partir de SELECTs desta sessão (script temporário apagado) e dos pareceres; o `tsc` (exit 0) e os testes (10 de 11) foram rodados pelo qa-verificador; `build`, `test:vertical`, navegador e `cron.job` **não** foram verificados. A contagem de masters sem estado (681), eventos min = prev_min (68) e sem evento (936) vêm da ata de 10/11 e não foram remedidas hoje.

## Retrospectiva
Preencher em 17/11 e após a Black Friday.
