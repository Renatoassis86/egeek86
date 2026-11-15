# Auditoria 2026-11-15, painel 3: modelo de negócio, eficiência, eficácia e efetividade

Tarefa #64 (dono, 2026-11-15): "ver o que temos na organização geral do modelo de negócio e verificar eficiência, eficácia e efetividade". Painel 3 do Conselho Geek (papéis: estratégia de mercado, ciência e especialista de preços, estatística, benchmark, key user gamer, produtor gamer, marca). Somente leitura: SELECTs no banco de produção e leitura de código e documentos. Nenhum token lido ou impresso.

**Medição:** 2026-11-15 ~07:40 UTC (04:40 em Brasília). Janela "48 h" = 13/11 07:40 a 15/11 07:40 UTC. Todo número vem de SELECT feito nesta sessão, salvo quando marcado "(doc)" (lido de documento do repositório) ou "SEM DADO". Dias em horário de Brasília.

**Ressalvas de método**
1. Cliques humanos = `analytics_events.affiliate_click` cujo user-agent não casa com bot|crawler|spider|webindexer|facebookexternalhit|preview|whatsapp|telegram|curl|python|headless|go-http|slurp. É filtro aproximado; o `validClicks` do doc de rastreio é mais fino (1 por oferta/UA/30 min).
2. Um único iPhone (iOS 18_7) responde por 111 dos ~150 cliques "humanos" dos últimos 7 dias: provavelmente o dono testando. O tráfego humano externo real é menor que o número bruto.
3. A comissão prevista usa a tabela versionada de `src/lib/admin-gestao/taxas-comissao.ts` (VERSAO_TABELA 2026-11-15). Só a Amazon é "confirmada" (tabela oficial); ML, Shopee e Magalu são "estimadas".

---

## Resumo executivo

1. **A máquina de dados é forte e o negócio está sem audiência.** O pipeline acompanha 31,3 mil ofertas ativas e envia ~1.440 mensagens/dia ao Telegram com preço reconferido (0 de 2.865 divergiram mais de 2% na reconferência; máximo 0,89%). Mas o único chat contado em `group_member_counts` tem **5 membros** (estável desde 10/11, 109 leituras). O gargalo da efetividade é **audiência e distribuição**, não coleta.
2. **Não existe receita medida.** `affiliate_conversions` tem **0 linhas** e nenhum importador está agendado. Comissão real = SEM DADO; só existe comissão **prevista**.
3. **Cliques:** 1.356 `affiliate_click` desde jul/2026, dos quais 980 (72%) são bots. Humanos: 376 no total, 151 em 7 dias, 14 nas últimas 24 h. Só 19 cliques humanos em 30 dias vieram com origem Telegram rastreada.
4. **Onde está o dinheiro (previsto):** 82% do potencial de comissão dos cliques humanos de 30 dias está em **consoles no Mercado Livre** (69 cliques, ticket médio R$ 4.387, taxa 8%). A maior taxa (Amazon 8% em eletrônicos e 3D) está na rede de **pior frescor** (30% das ofertas ativas confirmadas em 24 h), com 2,4% das mensagens.
5. **Ritmo de captura vs Jogo Barato:** cupom, Prime e voucher são o ponto fraco. 42 mensagens CUPOM em 48 h (1,5%); 4 cupons novos em 48 h; **0 cupons Shopee** em `coupon_items`; 3.610 cupons ML "não verificado" sem leitura nas últimas 6 h; Prime derivado ainda atrás de flag desligada.
6. **Frescor:** ML 96% das ofertas ativas com preço confirmado em 6 h; Shopee 96,5% em 6 h, mas fila de atraso de 2,1 h (meta 60 min) e orçamento esgotado em 96% das execuções; Amazon 6% em 6 h e 30% em 24 h. O laço `amazon-vitrine` está parado há ~22 h (último 14/11 08:52 UTC), contra a regra "loops nunca param".
7. **Retrabalho é de governança de catálogo:** 3.403 masters reavaliados (3.391 de `review` para `approved`, 12 de `rejected` para `approved`); 2.928 decisões de identidade em 7 dias, 0 desfeitas; 1.169 itens pendentes na fila de identidade (dono).
8. **WhatsApp não entrega:** 0 mensagens `enviada` em 7 dias; 11.692 expiradas e 1.037 propostas paradas. Depende do envio manual do dono.
9. **Documentos-guia estão 4 a 5 meses atrás em pontos centrais** (README e BLUEPRINT descrevem marketplace de drops; CLAUDE.md diz "coleta somente por API oficial") e **não há ata do Conselho desde 13/11**, apesar de 102 commits desde então.
10. **Prioridade até 27/11:** (P0) medir clique e receita de verdade, ligar Amazon, cupom e Prime no ritmo do concorrente e começar a captar inscritos. Sem isso a Black Friday será tecnicamente correta e comercialmente invisível.

---

## (A) O modelo de negócio como está (retrato, não plano)

### A1. Proposta de valor (real)
"Preço honesto com histórico". O egeek86.com mostra, por produto (master), a série de preço **por oferta e por dia** (ADR 0004), o **menor preço registrado** e o selo de comparação com piso (5 cotações e 14 dias). No Telegram publica quedas reais com cartão de imagem, link rastreado `/go/<slug>?s=tg&m=<chave>` e preço reconferido ao vivo antes do envio. Diferença para o concorrente de referência (Jogo Barato): ele é curadoria humana de achados com ritmo alto; nós somos **motor de medição** que só chama de oferta o que o histórico prova.

### A2. Público
- Gamer brasileiro comprador de console e jogo físico novo; em menor grau impressão 3D (Bambu Lab), eletrônicos, eletrodomésticos, esporte e livros (7 departamentos).
- Públicos reais hoje: (a) Telegram, **5 membros** contados; (b) visitantes do site, 14 cliques humanos em 24 h e 151 em 7 dias (com testes do dono); (c) WhatsApp, sem envio automático.
- A estratégia declarada (Black Friday em 27/11 contra o Jogo Barato) supõe milhares de inscritos. O dado não sustenta isso ainda.

### A3. Fontes de receita (retrato)
| Rede | Mecanismo | Ofertas ativas (fora da quarentena) | Taxa na tabela da #62 | Confiança |
|---|---|---|---|---|
| Mercado Livre | afiliado (links meli.la/oficiais). 1.059 ofertas ativas com `affiliate_link_pending` (4,3%) redirecionam para /link-em-ativacao e não monetizam | ~24,5 mil | jogos, consoles, acessórios e livros 8%; esporte 7%; eletrodomésticos 5%; eletrônicos, informática e 3D 2,5% | estimada (faixas de terceiros; o painel exige login) |
| Shopee | API de afiliados | 4.173 | jogos, consoles, acessórios e livros 3% (medido em 2.700 campanhas oficiais); eletrônicos e 3D 4%; esporte 6% | estimada (3% medido só nas campanhas) |
| Amazon | Associados (aba logada do dono) | 2.801 | 8% (jogos, consoles, eletrônicos, informática, eletro, esporte, 3D); livros 10%; outros 7% | **confirmada** (tabela oficial) |
| Magalu | em estudo (#61, pausada pelo dono) | 0 | 2,5% a 5,5% | estimada |

Receita real: **SEM DADO** (0 conversões importadas). O código de importação existe (`src/server/affiliate-reports/`: `ml-csv.ts`, `shopee-api.ts`, `store.ts`), mas não está agendado em `vercel.json` e a tabela está vazia.

### A4. O que já existe da comissão prevista (#62)
- `src/lib/admin-gestao/taxas-comissao.ts`: módulo puro com TABELA (rede x categoria), `VERSAO_TABELA='2026-11-15'`, `comissaoOferta`, `comissaoProduto`, `acumular/resumir`.
- `src/server/queries/admin-comissao.ts`: `comissaoPorOfertas`, `comissaoPorMasters`, `resumoComissao` (por rede, loja/vendedor e categoria, sobre ofertas ativas fora da quarentena).
- UI: `/admin/comissao` (agregados) e colunas em `/admin/ofertas` e `/admin/catalogo`.
- Guarda de privacidade: `scripts/test-comissao-admin.ts` falha se o módulo for importado fora do admin (pedido do dono: só no admin).
- **Limite conceitual:** `resumoComissao` agrega **valor de estoque x taxa** (potencial nominal de R$ 2,38 milhões se todo o estoque vendesse). Isso mede catálogo, não negócio. Faltam a visão **exposta** (cliques, mensagens enviadas), calculada no item D deste relatório, e a **realizada** (conversões).

### A5. Funil (retrato; 48 h salvo indicação)
| Etapa | Volume medido | Observação |
|---|---|---|
| Descoberta | 138 execuções `discover-products` (ML), 60 `cobertura-shopee`; `amazon-vitrine` parado | ML cria poucas ofertas novas por execução |
| Coleta (leituras de preço) | ~394 mil (ML 275 mil, Shopee 91 mil, Amazon 28 mil) | a mesma oferta é lida várias vezes |
| Catálogo | 6.443 masters aprovados com oferta ativa (games 3.238, eletroeletrônicos 1.106, eletrodomésticos 566, tecnologia 565, esporte 551, livros 249, 3D 168); 1.007 em 2 ou mais redes (15,6%) | 8.326 masters com oferta ativa; 1.482 com 5 ou mais ofertas |
| Indicador | `price_daily_state`: 5.923 linhas no dia | 541 dias abertos antigos (#15) |
| Mensagem (proposta) | 19.520 criadas (14.401 expiradas, 2.807 enviadas, 1.101 e 762 em proposta, 221 retidas, 34 erro) | 74% das propostas expiram |
| Envio | 2.888 enviadas (1.609 masters, 1.741 ofertas) | ~1.440/dia, ~60/hora |
| Clique | 14 humanos em 24 h; 31 humanos com origem de mensagem identificada em todo o histórico | CTR por mensagem da ordem de 0,1% (hipótese) |
| Comissão | SEM DADO | 0 conversões |

A conversão ponta a ponta (mensagem para clique) não é calculável com confiança: o clique só grava `origem`/`mensagem` quando o link traz `s` e `m`, e 436 dos cliques de 30 dias vieram sem origem.

### A6. Ativos
1. **Histórico de preço por oferta/dia:** `price_daily_offer`, `price_daily_state` (72 mil linhas), `affiliate_price_snapshots`, `price_min_events` (6.247 eventos em 48 h). Único ativo difícil de copiar.
2. **Catálogo de masters com regras de identidade** (ADR 0006 e 0011): 10.965 com `catalogGate`: 7.907 aprovados, 2.704 rejeitados, 356 em revisão, 373 sem veredito. Regras: região, cross-gen e edição limitada separam; cor junta; Open Box fora; só novo e em linha; sem peças e miúdos; foto com mão = seminovo.
3. **Canais:** Telegram (1 chat, 5 membros), canal Destaques (configurado), WhatsApp (manual), site com `/black-friday`.
4. **Motor de mensagens** com régua (R-44), cooldown por master (R-47), N1 neutro (R-51) e reconferência ao vivo (R-22).
5. **Memória operacional:** `FLUXO_MESTRE.md` (656 linhas), ADRs 0001 a 0012, 28 perfis em `agents/`, 46 atas até 13/11.

### A7. Vantagens e fraquezas contra o Jogo Barato
| Eixo | Nós | Jogo Barato (pelos pedidos do dono) | Medida |
|---|---|---|---|
| Série de preço por oferta/dia e menor preço registrado | sim | não publica | ativo único |
| Exatidão da mensagem | reconferência ao vivo; 0 de 2.865 acima de 2% | desconhecida | C2 |
| Pureza da cesta | regras ADR 0006 | curadoria humana | C5 |
| **Ritmo de captura Prime/cupom** | atrás (Prime derivado desligado; 42 CUPOM em 48 h) | rápido, inclui "Exclusivo Prime 25% na finalização" | 9 alvos Prime de 14/11: 6 no catálogo, 3 inexistentes, 0 visíveis (doc) |
| **Cobertura Shopee** | 4.173 ofertas ativas (13% do catálogo) | publica itens Shopee de nicho | 3 de 3 itens de 15/11 coletados; 1 oculto por falso positivo de foto com mão (doc) |
| **Preço com voucher e pix** | a API Shopee devolve o preço cheio | publica "no 12x" (cheio x 0,95) e "no pix" (x 0,92) | nosso preço parece maior para o mesmo item (doc) |
| Cartão visual | em redesenho (#58) | foto grande, QR, limpo | em andamento |
| Audiência | 5 membros | milhares (observação externa) | gap decisivo |

### A8. Dependências críticas
1. **PC do dono ligado com Chrome logado** para Amazon assistida, cupons Amazon/Shopee e links meli.la. Quando cai, a Amazon perde frescor (hoje 6% em 6 h) e laços param (`amazon-vitrine` há ~22 h).
2. **Supabase Micro (60 conexões)** com histórico de incidentes (#33, #45, #46) por CPU e transações presas.
3. **Vercel crons (24 entradas em `vercel.json`)**; sem sonda externa de disponibilidade (#13 ainda em "fila").
4. **Tempo de execução por função**, não cota: ML tem 429 em 0,014% das checagens do `collect-prices`; o orçamento se esgota em 144 de 192 execuções do vertical eletroeletrônicos e em 552 de 574 da Shopee.
5. **Credenciais Shopee "Sensitive" na Vercel:** inacessíveis fora do servidor; impediram conferir um item do concorrente (doc).
6. **Cadastros nas mãos do dono:** taxa real do ML, Magalu (portal Parceiro), lojas de calçado (#40).
7. **Termos de uso:** a Amazon limita cache de preço a 24 h (regra D2 no código); "API oficial" (CLAUDE.md) convive com coleta assistida; risco documentado em `revisao-legal-lgpd-comissao-2026-11-03.md`.

### A9. Mapa de processos e donos
| Processo | Mecanismo | Frequência (medida/`vercel.json`) | Dono (fila/agentes) | Estado em 48 h |
|---|---|---|---|---|
| Preço ML geral | cron `collect-prices` | */5 (1.150 execuções) | engenheiro-coleta | ok, 105 s médios |
| Preço ML por vertical | 6 crons `collect-vertical` | 15 min cada | engenheiro-coleta | `partial` em 165/191 (livros), 145/192 (eletro), 133/187 (3D) |
| Preço Shopee | cron `collect-shopee` | */5 (574 execuções, 243 s) | engenheiro-coleta | orçamento esgotado 552/574 |
| Cobertura Shopee | `cobertura-shopee`, `discover-shopee-esporte`, `ampliar-amostra-shopee` | 10 min e 1 h | engenheiro-coleta | 28 erros em `cobertura-shopee` |
| Amazon | laços Chrome `amazon-assistida.js`, `amazon-vitrine`, `amazon-promocoes.js` | 1.605 execuções (assistida) | operador (Claude) + dono (Chrome) | assistida ok; vitrine parada ~22 h |
| Cupons | `cupons-24h.js`, `ml-cupons-item.js`, `agente-cupons`, batimento | 24 h | agentes de cupom | 4 cupons novos |
| Links ML | `ml-links-ui.js` | contínuo (973 execuções) | laço + dono | 1.059 pendentes |
| Identidade e aprovação | `fila-classificacao` (13,43), `fila-api-oficial` (8,28,48), `aprovacao-auto` (10 min) | | guardiao-catalogo | 1.169 itens para o dono |
| Snapshots e indicadores | 5 crons `refresh-snapshots` | 10 a 60 min | cientista-precos, backend | 18 erros em `stats` |
| Mensagens | `group-messages` | a cada 1 min (2.799 execuções, 20 s) | engenheiro-backend | 28 erros |
| Saúde | `collector-health` | */30 | engenheiro-infra-sre | ainda não grava `collector_runs` (#13) |
| Alerta de queda ao usuário | `notify-price-drops` | diário 11h | backend | SEM DADO |
| Decisão | `geek-lead` + especialistas | por tarefa | dono decide | última ata 13/11 |

---

## (B) Eficiência: recurso x resultado

### B1. Tempo e volume por etapa (48 h, `collector_runs`)
| Job | Execuções | Duração média | Lidas | 429 | Erros | Orçamento esgotado |
|---|---|---|---|---|---|---|
| collect-prices (ML) | 1.150 | 105 s | 135.864 | 19 (0,014%) | 898 (0,66%) | 0 |
| collect-vertical (6 jobs ML) | 1.145 | 62 a 280 s | 139.660 | 3 | 3.064 | 2 a 165 por job |
| collect-shopee | 574 | 243 s | 91.119 | 3 | 357 | **552** |
| amazon-assistida | 1.605 | 2 s | 14.756 | 0 | 0 | 0 |
| amazon-vitrine | 154 | 13 s | 13.129 | 0 | 0 | 0 |
| group-messages | 2.799 | 20 s | 2.859 enviadas | | 28 | 0 |
| Todas as execuções | 10.902 | | | | 81 `error` (0,74%), 1.041 `partial` (9,5%), 58 `running` | |

- **Cotas:** o ML está longe do limite (meta do Fluxo: < 2% de 429). A Shopee também. O problema é o **orçamento de tempo da função**: `collect-shopee` termina por orçamento em 96% das execuções e `collect-vertical:eletroeletronicos` em 75%.
- **Rodízio e atraso (`oldest_due_age_s`, execução mais recente):** `collect-prices` 3.577 s (1,0 h; 6.942 devidas); `collect-shopee` 7.486 s (2,1 h; 3.092 devidas); `collect-vertical:impressao3d` 4.343 s; `:livros` 3.518 s; **`:eletroeletronicos` 106.065 s (29,5 h; 4.018 devidas)**. O máximo de `collect-prices` chega a 9.012.246 s (104 dias): ofertas expiradas ainda "devidas" distorcem o indicador; ele deveria excluí-las (#20).
- **Custo em R$ por etapa:** SEM DADO. Medir: exportar o uso mensal da Vercel e do Supabase e dividir por mensagem enviada e por clique válido.

### B2. Proporção leitura para mensagem
394 mil leituras em 48 h geraram 2.888 mensagens: **0,73% das leituras viram mensagem**, e 74% das propostas criadas expiram sem envio (14.401 de 19.520). A expiração é desejada (guarda de frescor e preço), mas custa CPU de banco na detecção.
- 1.609 masters distintos enviados; 271 receberam mais de 2 mensagens; 25 pares do mesmo master a menos de 8 h (o cooldown R-47 falha em ~0,9%).
- Mix por gatilho: G2 (queda sobre a média) 1.549 e AC 1.130 somam 93%; CUPOM 42; N1 31; plataforma (P1 a P4) 88.

### B3. Retrabalho
- Reavaliação de catálogo: 3.403 masters com `previousVerdict` (3.391 `review` para `approved` pelos lotes `auto:r2-11` de 15/11 e `q4q5`/`c10`; 12 `rejected` para `approved`). Aprovação em bloco reversível, como o dono pediu.
- Identidade: 2.928 decisões em 7 dias, 0 desfeitas; fila de revisão: 1.169 `pending`, 2.421 `resolved`, 483 `auto_resolved`.
- Quarentena: 661 ofertas, 214 ainda `active`.
- Exclusão da média por vendedor fraco: 4.417 ofertas ativas (decisão do dono pendente, #21).
- Mensagens: 34 `erro` ("envio interrompido") e 221 retidas.
- Dias de preço abertos: 541 linhas `closed=false` com mais de 1 dia no passado (desde 05/11); a fila #15 registrava 99. **Piorou.**
- Falsos positivos de qualidade: master Switch Lite rejeitado por `foto_com_mao` por causa da arte da caixa (doc); oferta Amazon mal casada que ditava o menor preço de um combo Bambu (doc).

### B4. Automação x trabalho manual do dono
- Automático: ML, Shopee (API), mensagens Telegram, aprovação automática, indicadores.
- Depende do dono e do PC: Amazon (Chrome logado), cupons, links meli.la, **WhatsApp (0 envios em 7 dias)**, fila de classificação (1.169), autorizações (#16, #18, #21, #23, #51, #52, #11), cadastros de afiliado.
- Pelo menos 7 tarefas P1 da fila aguardam decisão do dono.

---

## (C) Eficácia: fazemos o que prometemos?

### C1. Cobertura contra o mercado (amostra do Jogo Barato, tirada dos inventários; não há feed do concorrente)
| Amostra | Itens | No catálogo | Visíveis ao público | Causa do que faltava |
|---|---|---|---|---|
| Jogos Prime Switch/Switch 2 (14/11) | 9 | 6 | 0 | leitor descartava Prime; frescor Amazon de 11 a 25 h; 3 lançamentos não existiam |
| Itens Shopee "cupom 5%" (15/11) | 3 | 3 | 2 | master rejeitado por `foto_com_mao` (falso positivo) |
| Bambu Lab A1, A1 Mini, P1S, P2S e combos (15/11) | 8 masters | 8 | 8 (todos só com ML; Shopee 0 de 8; Amazon 4 de 8) | Shopee sem categoria 3D; oferta Amazon mal casada |
| **Total** | **20** | **17 (85%)** | **10 (50%)** | rede, visibilidade e frescor, mais que produto |

Cobertura de produto alta (85%); cobertura efetiva (visível, com as redes esperadas e preço fresco) por volta de 50%. Amostra pequena e com viés de seleção (o dono enviou o que viu faltar): indicativa. Para medir: planilha semanal de 50 itens do concorrente (rotina da #57) com colunas "no catálogo / visível / ofertas por rede / preço igual ao do concorrente".

### C2. Exatidão do preço (48 h)
| Medida | Resultado |
|---|---|
| Reconferência antes do envio | 2.865 `ok`; divergência média 0,00%, máxima 0,89%; 0 acima de 2% |
| Preço vivo diferente do detectado | 13 de 1.050 com leitura viva (1,2%) |
| Mensagem x preço atual da oferta (qualquer horário) | 2.773 iguais; 87 (3,0%) divergem mais de 2%; 33 mais de 10% (o preço mudou depois do envio) |
| Mensagem x preço atual, últimas 3 h | 143 mensagens, 0 divergem, 0 em oferta inativa |
| Ofertas enviadas hoje `expired` | 85 de 2.889 (2,9%) |
| Mensagens sem cartão | 32 |
| Preço real da loja | **SEM DADO** (a reconferência compara com nosso banco/API, sem amostra externa) |

Medir contra a loja: conferir 30 mensagens por dia no anúncio (Chrome do dono) e gravar; meta 95% dentro de 1%. O mesmo vale para o site: a diferença site x mensagem x loja nunca foi medida de ponta a ponta.

### C3. Frescor por rede (ofertas ativas fora da quarentena)
| Rede | Ativas | Confirmadas < 6 h | < 24 h | Atraso da fila | Meta |
|---|---|---|---|---|---|
| Mercado Livre | 24.519 | 96,3% | 98,2% | 1,0 h (geral); 29,5 h (eletroeletrônicos) | 60 min |
| Shopee | 4.173 | 96,5% | 96,5% | 2,1 h | 60 min (#20 aguarda o dono) |
| Amazon | 2.801 | 6,2% | 29,8% | n/a (depende do Chrome) | 40 min para ofertas com gatilho (#26: hoje 43%) |

A Amazon, a rede de maior taxa, tem o pior frescor: só 833 de 2.801 ofertas passam na regra de 24 h para a média.

### C4. Selo e indicadores
Regras e testes existem (selo com 5 cotações e 14 dias, média por oferta/dia, menor preço registrado, mudança do menor preço sempre visível). Corretude em produção: **SEM DADO** além dos testes. Elegibilidade: 1.482 dos 8.326 masters ativos (17,8%) têm 5 ou mais ofertas. #14 (paridade da média única) e #15 (dias abertos) seguem em "fila". Proposta: SLO diário "divergência entre média pública e recálculo independente < 3% em 20 produtos" (descrito na #14).

### C5. Qualidade de identidade
- 6.443 masters aprovados com oferta ativa; 1.007 em duas ou mais redes.
- Pendentes: 356 masters em `review`, 373 sem veredito, 1.169 itens de identidade.
- Em 15/11 o lote `auto:r2-11` aprovou 3.391 masters vindos de `review`, incluindo motivos como `geracao_ambigua` (257) e `jogo_sem_plataforma_nem_formato_fisico` (180): risco de mistura de geração/formato. A regra do dono é "grupos só de iguais"; **não há medida de pureza posterior ao lote**. Proposta: amostra de 200 masters do lote conferida pelo guardião (meta: 98% puros).

### C6. Mensagens com preço válido na hora do envio
Reconferência ao vivo e `recheck` cobrem 99,2% das mensagens (2.865 de 2.888); os casos de oferta ausente da busca (2) e inativa ou em quarentena (1) foram barrados no ato. Tempo entre a leitura viva e o envio: mediana 1,9 s, p90 2,8 s.

---

## (D) Efetividade: gera resultado de negócio?

### D1. Cliques
| Janela | Bruto | Humanos (filtro) | Bots |
|---|---|---|---|
| Desde 15/07 | 1.356 | 376 | 980 |
| 7 dias | 306 | 151 | 155 |
| 24 h | 166 | 14 | 152 |

Em 15/11 os bots (`meta-webindexer`, `TelegramBot`) foram 152 de 166 cliques: a pré-visualização de links infla o número. **KPI de clique deve partir de `validClicks`, não do bruto.**

Humanos nos últimos 30 dias por rede: ML 175, Shopee 25, Amazon 10. Por departamento (todos os cliques de 30 dias, incluindo bots): games 181, sem departamento gravado 154, 3D 44, livros 31, tecnologia 18, eletroeletrônicos 15, eletrodomésticos 9, esporte 6.

Origem (30 dias, humanos): 191 sem origem, 19 Telegram. O `Referer` está nulo em todos os cliques recentes (política sem referrer). **Não sabemos de onde vem o tráfego do site.**

### D2. Conversão e comissão realizada
`affiliate_conversions`: **0 linhas, SEM DADO.** Para medir: (1) agendar a importação do CSV do ML e da API de relatório da Shopee, já codificadas; (2) subId por canal (`tg`, `wa`, `site`) e por tipo de mensagem (G2, AC, CUPOM, N1, Prime); (3) tabela diária de cliques válidos x conversões x comissão líquida por rede.

### D3. Crescimento de canal
`group_member_counts`: **um chat, 5 membros, de 10/11 a 15/11 (109 leituras, mínimo 5 e máximo 5)**. Crescimento zero em 5 dias com cerca de 7 mil mensagens enviadas. Os demais departamentos e o canal Destaques não têm contagem; as mensagens de todos os departamentos vão para um único `TELEGRAM_GROUP_CHAT_ID`. Meta sugerida: 500 inscritos até 27/11.

### D4. Engajamento por tipo de mensagem
Cliques humanos com mensagem identificada em todo o histórico: G2 25, RADAR 2, OK2 2, P5 2 (31 no total). Frente às 1.549 G2 enviadas só em 48 h, a taxa de clique por mensagem fica da ordem de 0,1% a 1%. **Engajamento por gatilho = SEM DADO** estatisticamente (n pequeno). Medir: visualizações e reações por mensagem (estatísticas do canal via API do Telegram) e cliques `m=` por gatilho em janela de 7 dias; só interpretável com 500 ou mais inscritos.

### D5. Onde está o dinheiro (comissão prevista, tabela #62)

**(1) Estoque ativo (potencial nominal, R$ mil):** ML eletrônicos 946, ML consoles 338, ML eletrodomésticos 201, ML jogos 175, ML acessórios games 154, ML 3D 121, ML informática 108, ML esporte 89, Amazon eletrônicos 44, Amazon informática 31, Shopee consoles 25. Total R$ 2,38 milhões sobre 31.291 ofertas. É teto, não previsão.

**(2) Exposição real: cliques humanos de 30 dias x taxa x preço no clique (se todo clique comprasse uma unidade):**
| Rede / categoria | Cliques | Preço médio | Comissão potencial |
|---|---|---|---|
| ML consoles | 69 | R$ 4.387 | R$ 24.216 |
| ML jogos | 86 | R$ 223 | R$ 1.537 |
| Shopee consoles | 10 | R$ 4.594 | R$ 1.378 |
| ML impressão 3D | 11 | R$ 4.478 | R$ 1.232 |
| Amazon consoles | 1 | R$ 4.084 | R$ 327 |
| Amazon 3D | 1 | R$ 3.880 | R$ 310 |
| ML eletrodomésticos | 4 | R$ 1.250 | R$ 250 |
| Demais | 28 | | R$ 225 |

Total ~R$ 29,5 mil de "comissão se todo clique comprasse". Com conversão afiliada típica de 1% a 3% (**hipótese não medida**), o previsto fica entre **R$ 300 e R$ 900 em 30 dias**, 82% em consoles no ML. Inclui testes do dono (111 cliques de um iPhone), portanto é teto.

**(3) Oferta de mensagens (48 h) por rede e categoria:** ML jogos 581 (8%, ticket R$ 255), ML eletrônicos 377 (2,5%, R$ 2.518), ML eletrodomésticos 342 (5%, R$ 1.393), ML esporte 325 (7%, R$ 642), Shopee jogos 318 (3%, R$ 221), ML informática 316 (2,5%, R$ 2.577), ML livros 270 (8%, R$ 93), ML 3D 240 (2,5%, R$ 2.425), ML consoles 41 (8%, R$ 3.850), Amazon 69 no total (8%). Comissão unitária por venda: console ML R$ 308; eletrônico ML R$ 63; Amazon 3D R$ 41; jogo ML R$ 20; livro ML R$ 7. Quase 30% das mensagens (livros e jogos baratos, Shopee jogos) pagam de R$ 7 a R$ 20 por venda; consoles são 1,4% das mensagens.

**Leitura estratégica:** (a) consoles e impressoras são o pagamento; (b) a Amazon paga 3,2 vezes o ML em eletrônicos e 3D (8% contra 2,5%) e recebe 2,4% das mensagens por falta de frescor; (c) a Shopee a 3% em jogos tem o pior R$ por venda; (d) a tabela do ML é estimada: confirmar no painel pode mudar a ordem.

### D6. O que mais move a Black Friday (27/11)
1. Consoles e acessórios de console (Switch 2, PS5, Xbox): 82% do potencial dos cliques.
2. Impressoras 3D (Bambu P1S, P2S, A1), com Amazon a 8% e tickets de R$ 3 mil a R$ 8 mil.
3. Prime e cupom no ritmo do concorrente: o diferencial de captura que o público compara.
4. Preço honesto na hora: a promessa central; o risco é afirmar "menor preço" a uma audiência de 5 pessoas.
5. Audiência: sem 500 ou mais inscritos, o resto não converte.
6. Travas de calendário: #10 (tendência da Black Friday) e #48 (rollout da landing 19 a 22/11, congelamento 23 a 28/11).

---

## (E) Gaps de organização

### E1. Documentos-guia a atualizar (varredura por palavra-chave e data do último commit; itens marcados exigem leitura humana)
| Arquivo | Último commit | Problema | O que mudou desde 10/11 |
|---|---|---|---|
| `CLAUDE.md` | 12/11 | Sem menção a Amazon, Shopee, Magalu, comissão, frescor, flags. "Coleta somente por API oficial" contradiz a coleta assistida da Amazon (aba logada) e a coleta pública avaliada para o Magalu | R-44 a R-51, regras do dono ("nada inacabado", pedido novo vai para a lista), auditoria permanente de cobertura (#57) |
| `AGENTS.md` | 05/11 | Uma menção de Magalu; nenhuma de Amazon assistida, comissão, N1 | idem |
| `README.md` | 13/07 | Descreve "marketplace vertical, drops e colecionáveis"; o produto é um hub de inteligência de preços | pivô completo |
| `docs/PROJECT_BLUEPRINT.md` | 16/07 | Idem; sem Shopee, Magalu, comissão, mensagens | pivô completo |
| `docs/radiografia-plataforma.md` | 16/07 | Retrato de julho | tudo |
| `docs/plano-metricas-regras-negocio.md` | 25/07 | Antecede ADR 0004/0010 e a média por oferta/dia | métricas |
| `docs/plano-data-science-e-analytics.md` | 26/07 | Idem | analytics |
| `docs/auditoria-egeek86.md` | 31/10 | Antecede Amazon assistida, 7 departamentos, régua, cupons | indexar a nova pasta `docs/auditoria-2026-11-15/` |
| `docs/modelo-indicadores.md` | 03/11 | Antecede Amazon na média e frescor de 24 h | ADR 0010, `amazon-mode.ts` |
| `docs/03-metodologia/FLUXO_MESTRE.md` | 14/11 | Cabeçalho diz "versão 1.1, 2026-11-12" mas já contém R-51 (14/11). Sem Magalu; comissão e foto com mão só 3 e 1 menções; sem cards v2 e Prime derivado | faltam R-52 em diante: foto com mão por oferta, promoção Prime, cards v2, comissão interna, Magalu, auditoria de cobertura |
| `docs/fluxo-mestre/01` a `06` e PDFs | 12/11 | Capítulos e PDFs em v1.1; sem as mudanças de 13 a 15/11 | idem |
| `docs/03-metodologia/CONSELHO_GEEK.md` e `ARQUITETURA_AGENTES.md` | 31/10 | Mesa e quadro por tema não refletem os 28 perfis de `agents/` nem os painéis de auditoria | painéis por tema |
| `docs/03-metodologia/FLUXO_DE_ENVIO_TELEGRAM.md`, `docs/mensagens-grupos-2026-11-10.md` | 11 a 12/11 | Antecedem R-47 (cooldown e diversificação), R-51 (N1), régua flexível, cards v2 | mensagens |
| `docs/03-metodologia/CUPOM_NA_AGULHA.md`, `docs/cupons-2026-11-10.md`, `docs/cupons-portais-2026-11-10.md` | 10 a 12/11 | Antecedem Prime derivado (#33 Prime) e cupom encerrado com nome (#56) | cupons |
| `docs/rastreio-cliques-e-conversoes-2026-10-31.md` | 31/10 | Não registra que a conversão nunca foi importada nem o efeito dos bots; falta o plano de subId por tipo de mensagem | cliques |
| `docs/divida-coleta-sem-api-oficial.md` | 31/10 | Antecede Amazon assistida e Magalu | coleta |
| `docs/checklist-pendencias-2026-11-14.md` | 14/11 | Não cobre #56 a #64 de 15/11 | fila |
| `docs/fila-de-execucao.md` | 15/11 | **IDs duplicados** (#33, #37 e #45 aparecem duas vezes) e a seção "Jogos em promoção Prime" reinicia a numeração | numeração |
| `docs/amazon-assistida-loop.md` | 12/11 | `amazon-vitrine` parado há ~22 h não vira alerta | laço |
| `docs/conselho/atas/` | 13/11 | **Nenhuma ata de 14 e 15/11** apesar de decisões do dono (foto com mão, Prime, N1, console fora de linha, comissão, Magalu) | 102 commits desde 13/11 |
| Memória do dono (`MEMORY.md`) | 15/11 | Não registra: comissão só no admin, Magalu pausada, auditoria geral #64 | 15/11 |

### E2. Responsabilidades sem dono
1. **Crescimento de audiência** (inscritos Telegram/WhatsApp, divulgação do site): nenhum agente executa; `estrategista-mercado` opina.
2. **Importação de conversões e receita real:** código sem agendamento e sem dono.
3. **Verificação externa de preço** (amostra contra a loja).
4. **Disponibilidade do PC e do Chrome:** responsável humano sem alarme (`amazon-vitrine` caiu 22 h sem alerta).
5. **Envio WhatsApp:** manual, sem processo e sem SLO.
6. **Custos** (Vercel, Supabase): sem painel.
7. **Confirmação das taxas de comissão** (ML e Shopee): depende do dono logar.
8. **Atas e atualização de documentos:** a regra existe, nenhum job a verifica.
9. **Fila de decisões do dono** (#11, #16, #18, #21, #23, #51, #52): sem prazo nem lembrete.

### E3. Métricas de sucesso ausentes
Não há North Star nem painel de metas. Proposta na seção F: inscritos, cliques válidos por dia e por 100 mensagens, conversões e comissão realizada por rede, frescor Amazon, cobertura efetiva da amostra do concorrente, exatidão contra a loja, reavaliações de catálogo por semana.

---

## (F) Recomendações priorizadas até a Black Friday (27/11)

### P0 (15 a 19/11)
| # | Ação | Dono sugerido | Métrica de sucesso |
|---|---|---|---|
| 1 | **Medir receita real:** agendar importação ML (CSV) e Shopee (API); subId por canal e tipo de mensagem; tabela diária de cliques válidos x conversões x comissão | engenheiro-backend, integrador-apis | `affiliate_conversions` > 0 e relatório diário até 19/11 |
| 2 | **Cliques válidos como KPI:** `validClicks` em todos os relatórios, excluir UAs do dono, `origem` e `m=` em 100% dos links de mensagem | engenheiro-backend | bots < 5% do reportado; 100% dos cliques de mensagem com `m=` |
| 3 | **Audiência:** plano de aquisição (canal divulgado no site, nos cartões e na Black Friday); contar inscritos de todos os chats | estrategista-mercado, produtor-gamer-mundial (dono novo) | `group_member_counts` crescendo ao dia; 500 em 27/11 |
| 4 | **Amazon fresca:** religar `amazon-vitrine`, alarme de laço parado (> 30 min), segunda aba, prioridade a consoles e impressoras 3D | engenheiro-coleta, operador | >= 90% das ofertas Amazon com gatilho confirmadas em 40 min (hoje 43%); confirmadas em 24 h de 30% para 70% |
| 5 | **Prime e cupom no ritmo do concorrente:** o dono liberar `PROMO_PRIME_DERIVADA`, `PROMO_DESCOBERTA`, `GROUP_PROMO_PRIME`; cupom Shopee (0 hoje); revalidar os 3.610 cupons ML | agente-cupons, dono | >= 20 mensagens CUPOM/Prime por dia; 0 alvos Prime fora do catálogo na amostra diária |
| 6 | **Atas e guias:** gravar atas de 14 e 15/11, corrigir IDs duplicados da fila, atualizar `CLAUDE.md` (fontes de coleta) | geek-lead, qa-verificador | atas gravadas; fila com IDs únicos |

### P1 (20 a 26/11)
| # | Ação | Métrica de sucesso |
|---|---|---|
| 7 | Eletroeletrônicos e Shopee dentro do orçamento: dividir o job ou reduzir o conjunto ativo; excluir expiradas do `oldest_due_age_s`; decisão da #20 com o dono | `oldest_due_age_s` < 2 h (eletro) e < 1 h (Shopee) em 24 h |
| 8 | Verificação externa de preço: 30 mensagens por dia conferidas na loja | 95% dentro de 1% |
| 9 | Fechar `price_daily_state` aberto (541 linhas, em alta) e paridade da média única (#14, #15) | 0 linhas abertas com mais de 1 dia por 3 dias; divergência mediana < 3% |
| 10 | Redirecionar a oferta de mensagens para onde está a comissão (consoles, impressoras, Amazon) sem romper régua e diversificação | consoles e 3D >= 10% das mensagens (hoje: consoles 1,4%, 3D 8%) |
| 11 | Pureza pós-lote r2-11: amostra de 200 masters | >= 98% puros |
| 12 | WhatsApp: lote diário pronto para envio ou API oficial | >= 20 envios por dia |
| 13 | Pedir ao dono as taxas reais do ML e da Shopee e subir `VERSAO_TABELA` | >= 80% do valor em taxa "confirmada" |

### P2 (depois de 27/11 ou se sobrar capacidade)
14. Indicador de tendência da Black Friday (#10) com piso de 5 ofertas.
15. Painel de custo por mensagem e por clique (Vercel, Supabase).
16. Magalu (#61) só após cadastro e decisão do dono.
17. Atualizar ou arquivar em `docs/arquivo/` os documentos de julho (README, BLUEPRINT, radiografia, planos).
18. Engajamento por gatilho com 500 ou mais inscritos (D4).

### Painel de metas sugerido (todas medidas por SELECT)
Inscritos (500); cliques válidos por dia (150); cliques por 100 mensagens (1); conversões por dia e comissão líquida (> 0 em 19/11); Amazon confirmada em 24 h (70%); cobertura efetiva da amostra do concorrente (85%); exatidão contra a loja (95% em 1%); reavaliações de catálogo por semana (em queda).

---

## Apêndice: consultas usadas (resumo)
`analytics_events` (event_name, properties->>'origem'/'mensagem'/'offerId', context->>'userAgent'), `group_member_counts`, `group_messages` (status, trigger, sent_at, recheck_*, live_*), `affiliate_offers` x `affiliate_networks` (status, quarantined_at, last_price_confirmed_at, affiliate_link_pending), `collector_runs` (48 h por job e rede), `master_products.attributes->'catalogGate'`, `identity_decisions`, `identity_review_items`, `coupon_items`, `price_daily_state`, `price_min_events`, `affiliate_conversions`. Taxas copiadas de `taxas-comissao.ts` (2026-11-15) para uma CTE. Nenhuma escrita.
