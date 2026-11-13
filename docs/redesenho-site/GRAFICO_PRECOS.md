# Gráfico de monitoramento de preços: diagnóstico e novo desenho (2026-11-13)

Autor: papel bi-dataviz (Conselho Geek, Fase 1). Só diagnóstico e plano: nenhum código de produção alterado, nenhuma escrita em produção, nenhum commit. Rótulos: **DADO REAL** (com fonte), **HIPÓTESE**, **RECOMENDAÇÃO**.

Evidências em `docs/redesenho-site/evidencias/`:
- `grafico-re-3M.json`, `grafico-re-1M.json`, `grafico-re-1S.json` (Resident Evil Village PS5, produto `b26889a8-b861-4dd0-932c-89d265b06fa2`)
- `grafico-sw2pokemon-3M.json`, `grafico-sw2pokemon-1M.json` (console Switch 2 Pokémon Legends Z-A, `062777d2-1c34-4d6e-b7c4-0688ca2ac231`)
- `grafico-metroid-3M.json`, `grafico-metroid-1M.json` (Metroid Prime 4 Switch 2, `49564a65-a1e3-48a1-9d84-694ed05d000b`)
 Todos: resposta crua de `GET https://www.egeek86.com/api/monitoramento/price-history?masterProductId=<id>&timeframe=<tf>` em 2026-11-13 (~10:40 UTC), uma chamada por arquivo, 5 a 6 s entre chamadas.
- `grafico-v2-tabelas-sombra.json` e `grafico-v2-eventos-por-dia.json`: SELECT somente leitura (LIMIT 15 a 20, `statement_timeout` 8 s) em `price_daily_state` e `price_min_events` dos mesmos 3 produtos.
- `grafico-legado-1S-RE-serrilhado.txt`: tabela derivada do JSON de 1S.

Limite desta fase: a captura de tela do gráfico não foi feita (a extensão do Chrome desconectou depois da leitura do texto e do JSON da página; a aba nova que abri, id 1311993383, ficou aberta e não consegui fechá-la; as 3 abas do dono não foram tocadas). Onde o texto abaixo diz "desenhado", é a leitura do código aplicada ao JSON real, não uma imagem.

---

## 1. O que está no ar hoje (DADO REAL)

**Produção roda o gráfico ANTIGO.** Na página `https://www.egeek86.com/ofertas/resident-evil-village-ps5-fisica-lacrado-pronta-entrega-shopee-295f8a` (aba nova, 2026-11-13) o texto contém "Menor preço praticado", "Média geral de mercado", seletor 1D 1S 1M 3M 6M 1A Tudo, selo "Acima do normal" e "Comprar agora", e um `<canvas>`; não contém "degraus", "Camadas" nem "O que sabemos hoje". Além disso `GET /api/produtos/<id>/grafico` responde 404 sem corpo (a rota só existe com `PRODUCT_CARD_V1` e `PRICE_METRICS_V2` ligadas). Conclusão: `PRICE_METRICS_V2` e `PRODUCT_CARD_V1` estão desligadas em produção (confirma FM-02 em aberto). O gráfico V2 (SVG próprio) está pronto no código mas o dono nunca o viu; as "linhas estranhas" são do gráfico antigo.

### 1.1 Gráfico antigo (em produção)
Arquivos: `src/components/monitoring/price-history-chart.tsx` (lightweight-charts 5.2.0), `timeframe-selector.tsx`, série em `src/server/queries/price-history.ts` (`getMasterProductPriceHistory`, rota `/api/monitoramento/price-history`), usado em `product-price-chart-section.tsx` (página do produto, 3M inicial, `pollMs=0`) e em `monitoring-board.tsx` (`/monitoramento`, 1M, polling 45 s).

Séries desenhadas, exatamente:
1. **Área "Menor preço praticado"**: um ponto por balde de tempo (1D: 30 min; 1S: 6 h; 1M: 1 dia; 3M: 2 dias; 6M: 4 dias; 1A e Tudo: 7 dias, `AVG_BUCKET_MS`). Valor do balde = menor entre o último preço conhecido de cada oferta ativa, com carry-forward (`computeBucketedMinSeries`), incluindo o preço-base de antes da janela. Linha reta entre baldes (`LineType.Simple`), marcador em todo ponto.
2. **Linha tracejada "Média geral de mercado"**: por balde, SOMA(preço)/COUNT(cotações) das cotações brutas que caíram naquele balde (CTE `c` no SQL; exclui ofertas "fora da média" e cotação > 2x a média bruta).
3. **Histograma de frequência** é calculado (`frequencyPoints`) e a série existe no ref, mas a legenda só cita as duas linhas.
4. Último ponto da área é SOBRESCRITO no cliente: `synchronizedHistory` troca o valor do último ponto por `currentPriceCents` (linhas 120 a 133 do componente).
5. Selo "Comprar agora / Bom momento / Acima do normal / Considere esperar" ao lado do gráfico, em verde e vermelho, com ponto pulsante.

Tratamento de lacunas: nenhum. Balde sem oferta conhecida é pulado (`continue`), e o lightweight-charts liga o ponto anterior ao seguinte em reta; nunca insere whitespace. Eixo do tempo do lightweight-charts é por índice de ponto (HIPÓTESE de método conhecida da biblioteca; a confirmar no protótipo): pontos desiguais ficam igualmente espaçados. Eixo Y: `autoscaleInfoProvider` com folga `max(12% da amplitude, R$ 5)`.

### 1.2 Gráfico V2 (no código, atrás de flag)
Arquivos: `src/components/monitoring/price-chart-v2.tsx` (SVG próprio, 544 linhas), `src/lib/pricing/chart-model.ts` (`buildChartModel`, módulo puro, 66 verificações em `scripts/test-chart-model.ts`), `src/server/pricing/price-chart-v2.ts` (leitura só de `price_daily_state`, `price_daily_offer`, `price_min_events`; cache SWR 60 s), rota `GET /api/produtos/[id]/grafico`.

Séries: (a) menor preço em DEGRAUS nos instantes reais dos eventos de `price_min_events`, um segmento por "corrida" de dias medidos consecutivos (entre corridas não há linha); (b) trecho "sem cotação há mais de 48 h" tracejado cinza (valor carregado, rotulado); (c) uma linha pontilhada de referência (mediana histórica do período; na camada, mediana das lojas hoje); (d) opcionais em "Camadas": média histórica, média do dia (n >= 3, quebra em dia sem média), marcadores de queda >= 3%; (e) faixa vertical mín-máx quando eventos distam < 3 px (`compressSteps`); (f) barra sob o degrau quando o menor preço é de vendedor de baixa reputação; (g) chip "Agora R$ X · verificado há Y". Eixo X proporcional ao relógio; eixo Y sem zero com nota; leitura por cursor em barra fixa; janelas 1D 1S 1M 3M Tudo; níveis `none/single/points/short/full`.

Já cumpre: nunca interpola, lacuna é buraco, degrau em vez de diagonal, rótulo de escopo parcial, `neutro` sem verde e vermelho. Não cumpre ainda (ver seção 3.2): explicar salto de média por composição, mostrar a evolução da média por dia como padrão, tratar o "pente" de eventos oscilantes com leitura honesta, Amazon, 1A, tabela de eventos visível por padrão.

---

## 2. Dado real: o que a série mostra

### 2.1 Resident Evil Village PS5 (26 ofertas)
**Antigo, 3M** (`grafico-re-3M.json`): 46 pontos de menor preço, TODOS iguais a R$ 140,00 de 15/08 a 13/11 (reta horizontal perfeita por 90 dias). Média por balde de 2 dias entre R$ 162,95 e R$ 202,04: 08-15 179,08; 11-01 162,95; 11-07 170,54; 11-09 192,97; 11-11 202,04; 11-13 191,58 (+13% de 11-07 para 11-09 em 2 dias).
**Antigo, 1S** (`grafico-legado-1S-RE-serrilhado.txt`): menor preço R$ 140,00 em todos os 29 baldes; média por balde de 6 h: 11-07 00:00 R$ 169,00 (1 cotação); 11-07 06:00 R$ 183,70 (4); 11-07 12:00 R$ 144,99 (2); e o MESMO trio exato 169,00 / 183,70 / 144,99 se repete em 11-08 (00:00, 06:00, 12:00). Depois 11-10 18:00 R$ 238,98 (5 cotações) e 11-11 18:00 os mesmos R$ 238,98. A média oscila entre R$ 140,00 e R$ 238,98 numa semana em que o menor preço não saiu de R$ 140,00.
**V2** (`price_daily_state`, `grafico-v2-tabelas-sombra.json`): menor do dia R$ 140,00 em todos os 14 dias medidos (31/10 a 13/11). Média oferta-dia e número de ofertas por dia: 11/09 R$ 182,96 (7 ofertas); 11/10 R$ 211,26 (12); 11/11 R$ 227,36 (14); 11/12 R$ 220,21 (26); 11/13 R$ 219,82 (25). Mediana oferta-dia: 179,99; 200,75; 212,50; 196,74; 193,99.
**Eventos** (`price_min_events`, 31/10 a 13/11): 42 eventos, TODOS em 31/10 (alternando R$ 179,99 e R$ 140,00 a cada ~20 min, 15 eventos mostrados no arquivo, sempre Mercado Livre); nenhum depois.
**Página**: cabeçalho "R$ 239,90" (a oferta da página), "Média do produto (todas as lojas): R$ 182,55", "Menor já visto: R$ 140,00 em 26/07/2026", tabela com Mercado Livre R$ 140,00 "menor preço"; selo "Acima do normal: R$ 57,35 (31,4%) acima da média" e, na mesma tela, "Comprar agora: R$ 42,55 (23,3%) abaixo da média, no menor preço já visto". Três "médias" para o mesmo produto no mesmo dia: R$ 182,55 (cabeçalho, base por cotação), R$ 176,39 (`stats.avgPriceCents` do gráfico 3M), R$ 191,58 (último balde da linha tracejada); a V2 do dia dá R$ 219,82.

### 2.2 Switch 2 Pokémon Legends Z-A (1 oferta, 1 vendedor)
**Antigo, 3M** (`grafico-sw2pokemon-3M.json`): `offers=1`, 46 pontos de menor preço, 33 mudanças, R$ 3.385,70 a R$ 3.897,43; mas também 36 pontos de "Média geral de mercado" (média de uma oferta só = a própria linha de preço, mostrada como segunda série). Últimos pontos: 11-07 R$ 3.693,49; 11-09 R$ 3.760,40; 11-11 e 11-13 R$ 3.897,43.
**V2**: 14 dias `partial` (n_offers = 1, `avg_cents` nulo, correto por regra: média só com 3 ou mais). Menor do dia: 10/31 R$ 3.646,65 até 11/13 R$ 3.897,43 (+6,9%), 10 eventos, todos da mesma oferta no Mercado Livre.
**Leitura**: variação real de preço de um único vendedor (precificação dinâmica); o gráfico antigo desenha uma segunda linha "média de mercado" que não existe.

### 2.3 Metroid Prime 4 Switch 2 (13 ofertas)
**Antigo, 3M** (`grafico-metroid-3M.json`): menor preço R$ 348,36 (08-15) -> 342,89 (09-30) -> 325,74 (10-02) -> R$ 269,90 (10-06) -> volta a 325,74 em 10-24 (+20,7% num passo) -> 309,00 (10-26) -> 325,74 (11-01) -> R$ 296,97 em 11-11. Média por balde: 11-09 407,34; 11-11 390,01; 11-13 442,66 (+13,5%).
**Antigo, 1M**: média 11-12 R$ 395,25 -> 11-13 R$ 442,66 (+12% de um dia para o outro, o último balde é o dia parcial).
**Comparação com a V2 nos mesmos dias**: o antigo mostra R$ 325,74 de 11-01 a 11-09; o menor do dia na V2 foi 11/06 R$ 319,00, 11/07 a 11/09 R$ 317,00, 11/04 R$ 311,00. O antigo esconde mínimos reais (até R$ 8,74 = 2,7% mais baixos).
**Amazon**: os R$ 296,97 de 11-11 são de cotações da Amazon (3 de 3 cotações mínimas da amostra; `byNet` em `grafico-v2-eventos-por-dia.json`: 4 eventos Amazon e 17 Mercado Livre desde 31/10). A Amazon entra no menor preço do antigo e dos eventos da V2.
**Eventos** (V2): 11/10 6 eventos, 11/11 5 eventos; em 11/11 16:54:11,345 há DOIS eventos no mesmo milissegundo em sentidos opostos (31.900 -> 29.697 e 29.697 -> 31.900); a leitura de `buildChartModel` mantém só o último (`evs` filtra mesmo instante).

---

## 3. Causas das "linhas estranhas"

### 3.1 No gráfico em produção (antigo)
| # | Causa | Evidência | Efeito visual |
|---|---|---|---|
| A1 | Último ponto da área é substituído por `currentPriceCents` (preço da oferta da página ou "menor ativo" elegível), não pelo menor preço da série | `price-history-chart.tsx` `synchronizedHistory`; RE: série toda em R$ 140,00, cabeçalho "HOJE R$ 239,90" | HIPÓTESE forte (código + números, sem captura): reta horizontal em R$ 140 e, no último intervalo de 2 dias, uma diagonal subindo a R$ 239,90 |
| A2 | Média por balde é a média das cotações CAÍDAS no balde (ponderada por cotação e por quem a coleta visitou), não oferta-dia (contraria ADR 0004 e R-17) | RE 1S: trio 169,00 / 183,70 / 144,99 repetido todo dia com 1 a 4 cotações por balde; Switch Pokémon: "média" de 1 oferta | Serrilhado diário da linha tracejada que parece mercado e é cadência da coleta |
| A3 | Carry-forward sem teto de 48 h (baseline de antes da janela + último preço de cada oferta até uma nova cotação) | `computeBucketedMinSeries` e a consulta `baselineRows`; ADR 0004 item 3 fixa 48 h | Reta contínua de 90 dias (RE, 46 pontos iguais) que passa a impressão de medição diária; nenhuma lacuna jamais aparece (0 lacunas nos 7 arquivos) |
| A4 | Reta entre baldes e marcador em todo ponto, balde de 2 a 7 dias, tempo por índice | `LineType.Simple`, `pointMarkersVisible`; Metroid 10-24 325,74 vs 269,90 vira diagonal de 2 dias | Mudança de preço instantânea desenhada como rampa; degrau vira diagonal (parece interpolação) |
| A5 | Mínimos intradiários e do dia somem (último preço por oferta por balde) | Metroid: antigo R$ 325,74 vs V2 R$ 317,00 em 11/07 a 11/09 | Linha "mais alta" que o preço real; mudança do menor preço NÃO fica visível (regra do dono) |
| A6 | Amazon dentro do menor preço | Metroid 11-11 R$ 296,97 = Amazon; sem filtro de rede em `price-history.ts` | Degrau para baixo em preço de cache de até 24 h, sem marca |
| A7 | Eixo Y com folga mínima de R$ 5 e área preenchida até o fundo | `autoscaleProvider` (`max(span*0.12, 5)`) | Série plana em R$ 140 vira faixa 135 a 145 e qualquer R$ 1 de ruído parece oscilação grande; área dourada sugere base zero |
| A8 | Salto de média por composição (ofertas entrando e saindo) sem aviso | RE: 7 ofertas em 11/09 (média 182,96) para 12 em 11/10 (211,26): +15,5% sem nenhuma oferta antiga ter subido; 25 a 26 ofertas em 11/12 a 11/13 | Degrau de média de mercado que parece alta de preço |
| A9 | Seis janelas, balde diferente por janela | `AVG_BUCKET_MS` | Trocar 1M para 3M muda a forma da linha (balde de 1 d para 2 d) e o número de pontos (31 para 46) |
| A10 | Dados anteriores a 31/10 (regime legado) misturados na mesma linha, sem aviso | 3M cobre desde 15/08; V2 declara 31/10 como início do regime (`PRICE_DAILY_REGIME_START`) | Linha "histórica" de 90 dias onde só 14 são método oficial |
| A11 | Quatro leituras diferentes de "média" na tela e dois selos contraditórios (verde e vermelho) | seção 2.1 | Confiança; também fere a regra "verde/vermelho só no estado juízo" do guia visual |
| A12 | Gráfico, selo e canvas: sem equivalente textual além do tooltip | `<canvas>` sem `role="img"`/resumo | Leitor de tela sem série |

### 3.2 Na V2 (se for ligada como está, estas serão as próximas "linhas estranhas")
| # | Causa | Evidência | Correção no desenho novo |
|---|---|---|---|
| B1 | "Pente" de eventos oscilantes: ML placeholder (R$ 140,00) alternando com o vendedor (R$ 179,99) a cada ~20 min | RE: 42 eventos em 31/10, 0 depois | Faixa agregada rotulada ("42 mudanças entre R$ 140,00 e R$ 179,99"), não linha |
| B2 | Dois eventos no mesmo instante em sentidos opostos | Metroid 11/11 16:54:11,345 | Mostrar o resultado líquido e listar os dois na tabela |
| B3 | Salto de média por composição não explicado (a decomposição `matched_change_pct` e `composition_flag` existe no banco mas não entra no `ChartDay`) | RE n_offers 7, 12, 14, 26, 25 | Faixa "ofertas no dia" sob o gráfico e marcador de composição |
| B4 | Amazon como menor preço e como evento | Metroid, 4 eventos | Marcador oco "Amazon, confirmada há X h" (decisão do dono, ver seção 9) |
| B5 | Média e mediana são camadas escondidas ("Camadas") | `layers` iniciam todas falsas | Média oferta-dia por dia sempre visível, é o indicador único (ADR 0004) |
| B6 | Janelas 3M/1A vazias (regime só começou em 31/10) | 14 dias medidos hoje | Desabilitar com texto, janela padrão = "desde 31/10" |
| B7 | Média do dia só com 3 ou mais ofertas | Switch Pokémon: `avg_cents` nulo | Estado "poucas ofertas" explícito, sem segunda linha |
| B8 | Chip "Agora" pode divergir do último degrau | cartão-pai doc, limitação 4 | Marcar "agora" no eixo com horário de confirmação, sem ligar ao degrau |

---

## 4. Proposta: o novo gráfico (RECOMENDAÇÃO)

### 4.1 Princípios
1. Uma pergunta por gráfico: "como o menor preço entre as lojas variou, comparado ao valor típico das lojas?". Escopo escrito no título: **"Menor preço entre as lojas monitoradas (só item novo)"**.
2. Estado é degrau, medição é ponto. Preço que dura é degrau horizontal com salto vertical no instante do evento; nunca diagonal. Valores por dia (média oferta-dia) são pontos quadrados ligados por segmento reto APENAS entre dias consecutivos medidos.
3. Nunca interpolar. Sem medição = buraco; trecho carregado por regra (até 48 h; Amazon 24 h) = tracejado com legenda; além disso = buraco.
4. Toda mudança do menor preço visível: marcadores no gráfico e tabela completa abaixo (horário, valor, antes, loja).
5. Uma média só (R-17): a média oferta-dia. Nenhuma outra "média" no mesmo bloco.
6. Cantos retos, tokens existentes, sem verde e vermelho (o gráfico não faz juízo; o selo de juízo está desligado).

### 4.2 Mockup (ASCII, desktop 720 px de largura útil, janela 1M)
```
Menor preço entre as lojas monitoradas (só item novo)           [1S] [1M] [3M] [1A] [Tudo medido]
R$ 3.900 |                                          . . . . . .     ■ 11/12 15:35 R$ 3.897,43
          |                                 ┌───────■─┐            (marcadores quadrados = mudança do menor preço)
R$ 3.700 |        ┌──■──┐      ┌──■──────────┘ ░░░░░░░ │
          | ░░░░░░░│░░░░░│░░░░░░│░░░░░░░░░░░░░░░░ faixa ░│
R$ 3.500 |─■──────┘     └──────┘                                   ░ faixa do dia: menor a maior preço
          |                                                           oferta-dia dentro da faixa plausível
          |  (buraco: 18-19/11 sem medição, sem linha)
          +-----+-----+-----+-----+-----+-----+-----> 31/10 ... 13/11 (eixo proporcional ao relógio)
Ofertas no dia:   ▂▂▃▃▃▅▅▅▇▇▇ (barras 6 a 26)  -> explica salto de média por composição
Legenda: ━ menor preço (degraus)  ■ média das ofertas no dia (1 por oferta)  ░ faixa do dia  ▯ mudança do menor preço
         ┄ trecho sem confirmação recente (> 48 h)   ▭ sem medição
Aviso: o eixo vertical não começa em zero. Dias medidos: 14 (desde 31/10/2026).
Tooltip (cursor ou toque): 11/12 · menor R$ 3.897,43 (Mercado Livre, SQUAREDEALSBRF) desde 03:55 · média das ofertas R$ ... (n=1, sem média: menos de 3) · faixa R$ x a R$ y
Última mudança do menor preço: R$ 3.897,43 em 12/11 às 15:35, loja Mercado Livre (antes R$ 3.856,04)
[Todas as mudanças (10)  v]  tabela: horário | valor | antes | loja
```
Mobile retrato (360 px, 328 de gráfico): mesma pilha, altura 260 px, rótulos do eixo em 3 ticks, legenda em 2 linhas, tooltip vira barra fixa abaixo (`ReadingBar` já existe, `aria-live="polite"`), alvo de toque 44 px nos botões de janela. Paisagem (altura < 480 px): gráfico 55% da altura da viewport (mín. 200 px), barra "ofertas no dia" some e vira linha de texto, tabela de eventos recolhida.

### 4.3 Séries (da mais forte para a mais fraca)
| Série | Fonte | Forma | Cor (tokens) |
|---|---|---|---|
| Menor preço entre as lojas | `price_min_events` + âncora de `price_daily_state` | degrau, 2 px, junta chanfrada | `--color-accent-primary` (dourado); `CHART_PALETTES.line` |
| Média oferta-dia | `price_daily_state.avg_cents` (n >= 3) | quadrado 5 px por dia, segmento reto só entre dias consecutivos, 1,5 px | azul `movingAverage` (já contrasta; no claro `#0369A1`) |
| Faixa do dia | menor do dia a MAIOR preço oferta-dia dentro da faixa plausível (de `members`) | área 12% de opacidade, só nos dias medidos, quebra nas lacunas | cor da linha com opacidade |
| Mudança do menor preço | `price_min_events` | quadrado 7 px sobre o degrau; com muitos eventos próximos vira faixa agregada rotulada | texto primário; borda do fundo |
| Mediana das lojas hoje | `getPriceMetricsV2` | linha pontilhada horizontal só na camada e só com 3 ou mais | texto secundário |
| Ofertas no dia (sub-painel) | `price_daily_state.n_offers` | barras quadradas 24 px de altura | `--color-border-strong` |
| Trecho sem confirmação | regra de 48 h / Amazon 24 h | tracejado cinza, legenda fixa | `textMuted` |

Média histórica do período e mediana histórica ficam fora do gráfico (cartão "Detalhes"): a média oferta-dia por dia já conta a história, e uma linha reta de média histórica sobre uma série de 14 dias induz leitura errada (HIPÓTESE; validar com o estatístico).

### 4.4 Regras de desenho
- Eixo X proporcional ao relógio, fuso America/Sao_Paulo; dia = 00:00 a 24:00 SP (o antigo usa baldes alinhados em UTC).
- Eixo Y: do menor valor desenhado ao maior, folga de 12% da amplitude (sem piso em reais), ticks "bonitos", nota fixa "O eixo vertical não começa em zero"; série plana (amplitude 0): folga de 2% do valor e rótulo "preço sem variação no período". Sem área preenchida até o fundo.
- Lacuna: dia sem `quality complete/partial` quebra linha, faixa e média; hachura leve `--color-border-subtle` com rótulo "sem medição" quando a lacuna passa de 1 dia.
- Composição: dia com `composition_flag` verdadeiro leva marcador oco na média e a frase no tooltip ("a média mudou porque o conjunto de ofertas passou de 7 para 12; nas mesmas ofertas variou X%"), usando `matched_change_pct` do banco.
- Outliers: preço fora da faixa plausível (mesma régua `computeLiveMinFromOffers`/`outOfBandOffers`) nunca entra na faixa nem na média; contagem aparece no cartão "Qualidade e método".
- Open Box, usado e fora de linha: fora por regra do catálogo; o gráfico não filtra de novo, só lê o que já é elegível (`eligibleOfferSql`). Teste de regressão: produto com oferta marcada Open Box não altera o gráfico.
- Amazon: marcador oco "Amazon" e texto "confirmada há X h" no tooltip e na tabela; a oferta Amazon só segura degrau por até 24 h sem nova confirmação (R-21). Decisão aberta com o dono (seção 9).
- Poucos pontos (níveis já existentes, mantidos): 0 dias = cartão "Sem histórico medido"; 1 dia = número e a frase "um gráfico precisa de 2 dias medidos"; 2 a 7 dias = marcadores sem faixa e selo "Histórico curto: N dias medidos"; 8 ou mais dias e 7 de intervalo = completo. Nunca um gráfico vazio com eixos.
- Janelas: 1S, 1M, 3M, 1A, "Tudo medido". Janela cujo início é anterior a 31/10/2026 mostra o aviso "Medição regular desde 31/10/2026". Janela sem nenhum dia medido fica desabilitada com o motivo (`aria-disabled` e texto). Padrão = menor janela que contenha todos os dias medidos (hoje "Tudo medido"; a partir de 30 dias, 1M). 1D só no admin.
- Retorno por janela visível (skill padrao-visual): "Menor preço na janela: R$ X (DD/MM) ; hoje R$ Y ; variação do menor preço no período: Z%" em texto, sem cor semântica.
- Tooltip: sempre ancorado ao dia ou evento real mais próximo (nunca valor "entre" dois pontos); em toque, barra fixa abaixo (dedo não cobre o dado).
- Cantos retos: marcadores quadrados, chips e botões com raio 0 (o override global cobre, mas o SVG usa `rect`, nunca `circle`).

### 4.5 Acessibilidade
- `role="img"` com `aria-label` de resumo e `<table>` equivalente (o "Todas as mudanças" é a tabela: horário, valor, antes, loja) presente no DOM, recolhida visualmente, não `display:none`.
- Resumo textual gerado do dado: "Menor preço entre as lojas: de R$ A (DD/MM) a R$ B (DD/MM) em N dias medidos; hoje R$ C; M mudanças do menor preço; última em DD/MM às HH:mm, loja L."
- Teclado: seletor de janela e "Camadas" como botões com `aria-pressed`; setas esquerda e direita movem o cursor para o evento anterior ou seguinte (hoje o cursor só funciona por ponteiro: lacuna a corrigir).
- Contraste: reaproveitar o medido (7,63:1 no escuro e 6,11:1 no claro na camada neutra); rótulos do eixo em `secondary`.
- `prefers-reduced-motion`: sem animação de desenho. Alvo de toque 44 px no mobile.
- Cor nunca é o único sinal: forma (degrau, quadrado, tracejado, hachura) + texto na legenda.

### 4.6 Biblioteca (RECOMENDAÇÃO: manter o SVG próprio da V2 e aposentar o lightweight-charts da página de produto)
Medido neste repositório: `lightweight-charts` 5.2.0, arquivo de produção `lightweight-charts.production.mjs` = 184 KB, 59.931 bytes gzip (DADO REAL, `gzip -9`). Usado hoje em `price-history-chart.tsx` (página do produto e `/monitoramento`) e citado em `animated-stat-bars.tsx` (a conferir). A V2 é SVG próprio, 0 dependência.
| Opção | Custo de bundle | Ajuste ao pedido | Julgamento |
|---|---|---|---|
| SVG próprio (V2) evoluído | 0 KB de biblioteca; o código atual tem 32,7 KB de fonte | eixo proporcional ao relógio, degraus, lacuna real, faixa, marcadores quadrados, tabela e teclado todos no DOM | RECOMENDADO: já cobre 80% do desenho; falta faixa do dia, sub-painel de ofertas, 1A, teclado |
| lightweight-charts 5.x | ~60 KB gzip (medido) | canvas (sem DOM por ponto); eixo por índice (HIPÓTESE, validar), degrau via `LineType.WithSteps`, lacuna só com whitespace explícito, faixa exige série extra, cor só em hex (`chart-colors.ts`) | aceitável para zoom/pan em séries longas (1A com milhares de pontos), mas hoje pior em fidelidade, acessibilidade e peso |
| uPlot | HIPÓTESE: ~20 KB gzip, NÃO medido (não instalado) | x proporcional, `null` vira lacuna, caminhos em degrau, banda nativa; canvas | candidato só se a V2 não escalar; exige medição antes |
| Recharts | HIPÓTESE: > 100 KB gzip, não medido | SVG, mas lacuna/degrau/eixo de tempo exigem contorno | descartar (peso) |
Plano de custo: remover `lightweight-charts` do chunk da página de produto e do `/monitoramento` poupa ~60 KB gzip de JS do cliente (aproximação; medir com `next build --analyze` antes de afirmar). Se o 1A tiver > 1.500 eventos, agregar por dia antes de desenhar (já é a regra de `compressSteps`).

### 4.7 Orçamento de desempenho
Gráfico carregado por Suspense/`next/dynamic` abaixo da dobra; esqueleto de altura fixa (260 mobile, 320 desktop) para CLS 0; dados do cache SWR de 60 s da V2 (nenhuma consulta nova em produção nesta fase; item 46 da fila exige que a página nunca espere o banco). Meta: nenhum aumento de LCP; JS do gráfico <= 25 KB gzip (HIPÓTESE; medir).

---

## 5. Contrato de dados (RECOMENDAÇÃO; estende `ChartInput` de `chart-model.ts`)
```ts
interface ChartPayloadV3 {
  scope: 'menor-preco-entre-lojas-novo';        // rótulo de escopo, vem do servidor
  regimeStart: '2026-10-31';
  nowIso: string;                                // relógio do servidor
  days: Array<{
    day: string;                                 // 'YYYY-MM-DD' (America/Sao_Paulo)
    quality: 'complete'|'partial'|'gap'|'legacy';
    minCents: number|null;                       // menor preço do dia (bruto elegível)
    minStore: string|null;
    avgOfferDayCents: number|null;               // só com n >= 3
    medianOfferDayCents: number|null;
    bandHiCents: number|null;                    // maior preço oferta-dia dentro da faixa plausível
    nOffers: number;
    nOffersInBand: number;                       // exclui fora da faixa
    compositionFlag: boolean;                    // efeito composição > 50% da variação
    matchedChangePct: number|null;               // variação nas mesmas ofertas vs. dia anterior
    anchorAt: string|null;
  }>;
  events: Array<{
    at: string;                                  // ISO, instante da detecção
    minCents: number; prevMinCents: number|null;
    store: string;                               // 'apelido (rede)'
    network: 'mercado-livre'|'shopee'|'amazon'|string;
    confirmedAt: string|null;                    // obrigatório para Amazon ("confirmada há X h")
    weak: boolean;
  }>;
  lastQuoteAt: string|null;
  freshMaxMs: number;                            // 48 h; 24 h para Amazon
  legacyDays: number;
}
```
Campos novos em relação a hoje: `scope`, `minStore`, `bandHiCents`, `nOffersInBand`, `compositionFlag`, `matchedChangePct`, `network`, `confirmedAt`. As colunas `composition_flag` e `matched_change_pct` já existem em `price_daily_state` (ADR 0004, emenda); `bandHiCents` sai de `members` (mapa oferta -> preço do dia, já lido) com a régua plausível. Nenhuma tabela nova, nenhum recálculo no cliente (a interface só desenha).

Rota: manter `GET /api/produtos/[id]/grafico` (existe, cache `s-maxage=60`) e usá-la também na página do produto e em `/monitoramento` (remove `/api/monitoramento/price-history`, que roda uma varredura de snapshots por requisição; no mesmo pico do item 46).

---

## 6. Casos de teste com dado real (para `scripts/test-chart-model.ts` e para o QA no navegador)
| # | Produto / dia | Entrada real | Resultado esperado |
|---|---|---|---|
| T1 | RE Village, 31/10 | 42 eventos em 1 dia entre R$ 179,99 e R$ 140,00 | 1 faixa agregada rotulada "42 mudanças entre R$ 140,00 e R$ 179,99"; tabela com os 42; nenhuma diagonal |
| T2 | RE Village, 11/09 a 11/12 | n_offers 7, 12, 14, 26; média 182,96, 211,26, 227,36, 220,21 | média desenhada nos 4 pontos; sub-painel mostra as ofertas; tooltip de 11/10 cita "de 7 para 12 ofertas" quando `compositionFlag` verdadeiro; mínimo continua R$ 140,00 reto |
| T3 | RE Village, janela 3M | 14 dias medidos, 76 dias sem regime | janela 3M mostra "Medição regular desde 31/10/2026"; eixo começa em 31/10; 0 pontos antes |
| T4 | Switch 2 Pokémon | n_offers = 1, `avg_cents` nulo, 14 dias | só a linha de degraus; nenhuma série de média; texto "menos de 3 ofertas: sem média"; 10 marcadores |
| T5 | Metroid, 11/11 16:54:11,345 | 2 eventos mesmo instante, sentidos opostos | 1 marcador; tabela lista os 2; sem salto vertical duplo |
| T6 | Metroid, 11/10 a 11/12 | 4 eventos Amazon, valor R$ 296,97 | marcador oco "Amazon"; tooltip "confirmada há X h" (X real); trecho > 24 h sem confirmação vira tracejado |
| T7 | Metroid, 11/07 a 11/09 | menor do dia R$ 317,00 (V2) | degrau em R$ 317,00 (o antigo mostrava R$ 325,74) |
| T8 | Qualquer, dia `gap` | buraco de 1 dia entre 2 dias medidos | linha e faixa quebradas, hachura e "sem medição"; teste: nenhum `L` ou `H` do path cruza o intervalo |
| T9 | Qualquer, série plana (RE, menor R$ 140,00 em 14 dias) | amplitude 0 | eixo com folga 2%, texto "preço sem variação"; sem área até o fundo |
| T10 | Produto com 1 dia medido | `m = 1` | cartão "Só 1 dia medido" com o preço agora; sem eixos |
| T11 | Produto com oferta Open Box ativa | oferta fora do catálogo | gráfico idêntico ao de sem ela (regra do catálogo) |
| T12 | Último ponto vs. "agora" | menor do dia R$ 3.897,43, agora R$ 3.897,43 | chip "Agora" no eixo com horário de confirmação; nenhuma diagonal ligando degrau e chip |
| T13 | Mobile 360 x 640 e 640 x 360 | RE 1M | sem rolagem horizontal; alvo de toque 44 px; CLS 0; legenda visível |
| T14 | Leitor de tela | RE 1M | resumo textual com mínimo, hoje, nº de mudanças e última mudança; tabela alcançável |
| T15 | Paridade | RE, hoje | média do gráfico = média do cabeçalho = média do selo = R$ 219,82 (base oferta-dia), nunca 182,55, 176,39 ou 191,58 |

Aceite visual (QA no navegador real, nos dois temas): 0 segmento diagonal que não seja entre dias medidos consecutivos; 0 valor entre pontos reais; todas as mudanças do menor preço listadas; Axe/contraste >= 4,5:1; teste de 5 s com 5 gamers (4 de 5 dizem "o menor preço está em R$ X e a média das lojas é Y").

---

## 7. Perguntas para o estatístico sênior e o cientista de preços
Lidas em `agents/estatistico-senior.md` e `agents/cientista-precos.md` (não invocados). Perguntas de reunião aplicáveis, registradas para a ata:

**Estatístico sênior**
1. Qual é a população e qual o viés da amostra? Para a faixa do dia: usar mínimo a máximo plausível, ou percentis 25 a 75 das ofertas do dia (mais robusto, sai de `members`)? Com 7 a 26 ofertas por dia (RE), qual o intervalo defensável?
2. Qual a incerteza da média oferta-dia com n = 3? Abaixo de que n a linha de média deve sumir ou vir com o rótulo de amostra pequena (hoje n >= 3)?
3. O salto de 182,96 para 211,26 (7 para 12 ofertas) é erro de dado, isca ou preço legítimo raro? O limite de 50% do efeito composição (`composition_flag`) é o certo para ocultar ou só anotar a variação?
4. A mediana oferta-dia (199) e a média (219,82) divergem 12% no RE: a linha padrão deve ser a média, como manda ADR 0004, ou a mediana, mais robusta a R$ 417,90 da Shopee?
5. A fórmula é auditável com um SELECT? Teste T15 reproduz o gráfico com `price_daily_state`.
6. Média histórica do período sobre 14 dias medidos: vale mostrar, ou é opinião de uma amostra curta?
7. Eventos oscilantes (42 em 31/10): CUSUM/EWMA ou simples agregação por dia para não confundir ruído de coleta com mudança de preço?

**Cientista de preços**
1. Cada indicador do gráfico declara escopo (oferta ou produto), janela e base: o gráfico é produto, janela até 14 dias hoje, base oferta-dia. Confere com `modelo-indicadores.md`?
2. Média oferta-dia por dia de calendário, ou carry-forward de 48 h (a emenda fixa 48 h): qual dos dois alimenta cada ponto do gráfico, e o tooltip diz qual?
3. Pressupostos: sazonalidade, quebra de Black Friday (27/11): marcar a data no eixo como evento externo (sem prever)? Amostra mínima por produto para mostrar faixa?
4. Tratamento da Amazon (cache 24 h, R-21): dentro da média (ADR 0010) e dentro do menor preço, mas com marcador distinto?
5. Lacuna: nenhum preenchimento, nem suavização, nem "completar histórico"; confirmar que o carry-forward por regra (tracejado) não conta como medição.
6. Como a V2 trata a divergência entre `max_cents` bruto e a mediana (207 de 1.642 produtos, R-44h2) ao desenhar o topo da faixa?

---

## 8. Plano de execução (RECOMENDAÇÃO, ordem)
1. (0,5 d, backend) Estender a leitura V2 com os campos novos do contrato (`compositionFlag`, `matchedChangePct`, `bandHiCents`, `network`, `confirmedAt`); testes em `test-chart-model.ts` T1 a T15 em dado real, sem banco novo.
2. (1 d, frontend) Evoluir `price-chart-v2.tsx`: média oferta-dia por padrão, faixa, sub-painel "ofertas no dia", janelas 1S/1M/3M/1A/Tudo medido com estados desabilitados, tabela completa de eventos, teclado, marcador Amazon.
3. (0,5 d, frontend) Substituir o gráfico antigo na página do produto e no `/monitoramento` pela V2 (mesmo componente, `Suspense` com esqueleto de altura fixa).
4. Ligar `PRICE_METRICS_V2` por decisão do dono depois da paridade (fila #14) e da leitura do valor da flag na Vercel (fila #13, FM-02). Até lá, mitigação mínima SEM mudar a métrica: no gráfico antigo, parar de sobrescrever o último ponto com `currentPriceCents` (A1) e remover o selo duplicado verde e vermelho do gráfico (A11). Isto é uma correção de 5 linhas, mas fica para a Fase 2 por ordem do briefing.
5. QA: `qa-verificador` no navegador (360 x 640 retrato e paisagem, 768, 1280; escuro e claro), Axe, CLS, contraste, paridade T15. Remover `lightweight-charts` do bundle da página e medir (`next build --analyze`).
6. Atualizar `docs/modelo-indicadores.md`, `docs/03-metodologia/FLUXO_MESTRE.md` (R-17 e o gráfico) e `docs/guia-visual-cartao-pai.md` (painel do gráfico) no mesmo commit.

---

## 9. Riscos e pendências
- **Verdade da flag**: confirmei por inspeção pública que a V2 está desligada; o valor real na Vercel não foi lido (fila #13). Ligar a V2 sem a paridade (fila #14) mostraria média diferente do cabeçalho legado (R$ 219,82 vs 182,55 no RE).
- **Mesmo produto, quatro "médias"** na tela hoje (seção 2.1): é a violação aberta FM-01/R-17; o gráfico novo só resolve se o cabeçalho e o selo migrarem juntos.
- **Amazon no menor preço**: R-17/ADR 0010 põe a Amazon dentro da média, o cartão de histórico (`price-card-model.ts`) a tira da série. Decisão do dono: no gráfico do produto, a Amazon entra com marcador distinto (recomendado) ou sai como no cartão?
- **Regime curto**: só 14 dias medidos; 3M e 1A ficam vazios até fevereiro; a página deve dizer isso, não esconder.
- **Captura de tela**: não obtida (extensão desconectou); a aba nova 1311993383 do Chrome ficou aberta, para o dono ou o geek-lead fechar. As evidências são JSON, tabelas e leitura de código; as afirmações visuais A1 e A4 estão marcadas como inferência.
- **Eixo por índice do lightweight-charts**: HIPÓTESE; confirmar em protótipo antes de usar o argumento contra a biblioteca.
- **Carga**: as medições foram 11 chamadas HTTP espaçadas e 2 SELECTs com LIMIT; nenhuma escrita. O endpoint antigo executa varredura de snapshots por chamada (Switch 2 chega a 300 mil linhas no raw); não repetir em lote.
- **Retenção do `price_min_events`**: o LIMIT 5000 da leitura V2 basta para 1A com ~40 eventos/dia? RE já teve 42 em 1 dia; medir antes de liberar 1A.
