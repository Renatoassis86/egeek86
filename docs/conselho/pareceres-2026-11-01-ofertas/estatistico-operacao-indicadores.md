# Parecer do Estatístico Sênior: como operar os indicadores (2026-11-01)

Pedido do dono: estudar COMO OPERAR média única, mediana, piso 35%, filtro de outlier, histórico elegível, veredito ±5%, menor já visto, preço típico, dispersão e selo, com plano de execução eficiente e eficaz. Regra nova (2026-11-01): itens são separados; só se junta item IDÊNTICO (título, plataforma, edição, tipo); misturar contamina média e mediana.

Método: leitura de `AGENTS.md`, skill `regras-negocio-egeek`, `docs/modelo-indicadores.md`, ADRs 0001, 0002, 0004 e dos pareceres de 2026-11-01 (estatístico, DBA, especialista em preços, guardião). SELECT somente leitura no banco de produção (via `connect()` de `scripts/_dup-shared.ts`). Nenhum código editado, nada gravado. Scripts de medição ficaram no scratchpad, fora do repositório.

Legenda: **[Dado]** medido hoje; **[Hipótese]** inferência a confirmar; **[Rec]** recomendação. Decisão de negócio é do dono.

## 0. Posição

1. A regra nova muda a ordem do trabalho: **pureza do grupo vem antes de qualquer estimador**. Estimador robusto conserta cauda, não conserta mistura. Quando o grupo é uma mistura legítima de itens diferentes (RE2 dentro de RE3, bundle dentro de avulso), a mediana também erra.
2. O teste por preço sozinho NÃO basta. [Dado] Das 23 ofertas com numeral de título divergente do master (em masters com 3 ou mais ofertas), só 2 estão a mais de 2x ou menos de 0,5x da mediana. 21 de 23 (91%) são invisíveis ao teste de razão preço/mediana, porque RE2, RE3 e RE4 custam parecido. Precisa de teste de IDENTIDADE (título) e de teste de PREÇO, em separado.
3. O teste por título também não basta. [Dado] No master "Console Nintendo Switch 2, Modelo Nacional" (70 ofertas ativas, TODAS com o mesmo título), há 4 ofertas de vendedores "5_green" a R$ 2.906,32, 3.062,03, 3.133,70 e 3.225,09 (z robusto de -5,1 a -3,8; mediana R$ 4.359,52). Centavos não redondos são típicos de conversão cambial [Hipótese]. Só o preço as separa.
4. A corroboração de "2 vendedores dentro de ±10%" (modelo-indicadores 9.2) NÃO protege contra importado: importado é vendido por vários. Aqui os 4 vendedores corroborariam o selo. Para a cauda inferior robusta (z < -3,5) a corroboração não pode liberar o selo.
5. A divergência de F-26 entre os pareceres tem causa identificada (seção 4.1): a diferença de +12,4% do DBA no Switch 2 Nacional é a média por oferta-dia SEM filtro de outlier. Com piso e filtro, a mesma série dá R$ 4.450 (-0,2% vs hoje). A pesagem por frequência de coleta escondia ofertas de preço absurdo; a oferta-dia as revela. Logo, oferta-dia só entra junto com exclusão robusta.
6. 58% dos masters com oferta ativa (1.294 de 2.231) têm 1 ou 2 ofertas: não existe distribuição transversal para mediana ou MAD. Para esses, a pureza depende do título e de um prior por classe do catálogo, e o veredito depende do histórico da própria série.

## 1. Definição operacional final de cada indicador

### 1.0 Unidade, população e ordem de cálculo (vale para todos)

- **Unidade de observação**: oferta-dia `(o, d)`, dia em `America/Sao_Paulo`. Valor do dia `x(o,d) = percentile_disc(0.5)` dos snapshots do dia com `price_cents > 0`. [Dado] 61,4% das oferta-dias (42.098 de 68.593) têm mais de um preço distinto, 1.396 têm máx/mín >= 1,5 e 307 têm máx/mín >= 3: o último do dia herdaria a oscilação, a mediana do dia a absorve. Guardar também `last`, `min`, `max`, `n_collected` (convergência com o DBA, seção 4.2). Depende da decisão D1 (ADR 0004).
- **População elegível `E(m)`** do master `m`, nesta ordem:
  1. **Identidade**: só ofertas com `integrity = ok` (seção 2). Oferta em quarentena de identidade NÃO entra em nenhum indicador de `m`.
  2. **Dias fechados**: dias <= ontem para média, mediana, contagem e dispersão (a referência não inclui o preço que está sendo julgado). O mínimo e o "atual" leem também o dia corrente.
  3. **Piso duro** (vigente): sai `x <= 0,35 x mediana(E)`, só com >= 3 oferta-dias.
  4. **Exclusão robusta** (nova, seção 1.1): sai `x` com z robusto > 3,5 E desvio > 20% da mediana, só com >= 10 oferta-dias e >= 3 ofertas distintas.
  5. **Teto** (vigente): sai `x > 3 x mediana` de média e máximo. **Filtro 2x** da média bruta fica por cima enquanto o backtest não provar que a regra robusta o contém (retirá-lo é decisão do dono, ADR 0001 item 2).
  6. Nada é apagado. Cada exclusão grava o motivo (`excluded_by`) para auditoria.
- **Escopo**: sempre o produto (`master_product_id`). Nenhuma média por loja ou por oferta.

### 1.1 Estimador robusto e parâmetros

- **Mediana** `med`: `percentile_disc(0.5)` sobre `E` (devolve preço observado, sem interpolação; dado real, nunca valor sintético).
- **Escala robusta** na escala log: `s = 1,4826 x MAD(ln x)`; `z = |ln x - ln med| / s`. Log porque preço é multiplicativo (R$ 50 de desvio pesa diferente em jogo e em console).
- **Regra de exclusão robusta**: `z > 3,5` E `|x/med - 1| > 0,20`. A segunda condição evita cortar grupos muito apertados (MAD minúsculo). [Dado] Em 441 masters com >= 5 ofertas ativas (preço atual), a regra marca 226 ofertas; 183 delas estão DENTRO da faixa 35% a 300% da mediana, ou seja, nenhuma regra vigente as pegaria. As regras vigentes, medidas no mesmo conjunto (7.132 ofertas em masters com >= 3 ofertas): piso 35% corta 24; entre 35% e 50% há 61; acima de 3x há 61; acima de 2x a média bruta há 79.
- **Assimetria**: cauda inferior (isca, importado, erro) sai de média, mediana, mínimo e selo; cauda superior (reajuste, revendedor, erro de escala) sai de média e máximo. A cauda superior sozinha NÃO bloqueia selo.
- **Média aparada 10%** (`tmean`) e `|média/tmean - 1|` ficam como auditoria. [Dado] Em 933 masters com >= 5 oferta-dias (sem filtros), a média simples difere da aparada em mais de 2% em 178 (19%) e em mais de 5% em 56; depois da exclusão robusta espera-se que caia (medir na sombra, E5).

### 1.2 Tabela de indicadores

| Indicador | Fórmula | População | Estimador | n < 5 e n < 3 | Incerteza exibida |
|---|---|---|---|---|---|
| **Média única** (referência do veredito, decisão do dono) | `avg = Σ x / n` | `E(m)` limpa, dias fechados, todas as lojas | média aritmética sobre população já limpa (a robustez vem da limpeza, não da fórmula) | n_od < 5: `null`; 5 a 9: "preliminar" | n_od e nº de lojas; no admin, `tmean` e IC |
| **Mediana / preço típico** | `med = percentile_disc(0.5)(x)` | `E(m)` limpa | mediana | n_od < 5: `null` | faixa usual `[P25, P75]` com n_od >= 10; IC da mediana por estatística de ordem no admin |
| **Piso 35%** | exclui `x <= 0,35 x med(E bruta)` | todas as oferta-dias do master (após identidade) | mediana bruta | < 3: sem régua, tudo passa | `floorExcludedCount` |
| **Filtro de outlier** | piso, depois z>3,5 e >20%, depois teto 3x, depois 2x | idem | MAD em log | exclusão robusta só com n_od >= 10 e >= 3 ofertas | nº e motivo das exclusões |
| **Histórico elegível** | `n_od >= 5` E `span >= 14 dias` (vigente) + camada: A = `n_od >= 10` E `>= 3 ofertas distintas`; B = elegível, mas abaixo de A | `E(m)` | contagem | n_od < 5: "histórico curto" | rótulo "N cotações (oferta-dia) de M lojas" |
| **Veredito ±5%** | `delta = (atual - avg)/avg`; `|delta| <= 5%` em linha | `atual` = menor oferta pública íntegra; `avg` = acima | média | sem elegibilidade: sem veredito | R$ e %; camada B leva "preliminar" |
| **Menor já visto** | `min(snapshot bruto acima do piso, de vendedor não low, de oferta íntegra, e o atual)` | snapshots de ofertas íntegras | mínimo | n < 3 cotações: exibe só o atual | data, loja, "encerrada" se inativa |
| **Preço típico** | = mediana acima | idem | mediana | n_od < 5: `null` | faixa usual |
| **Dispersão** | `disp = P90/P10` das oferta-dias limpas (substitui máx/mín) | `E(m)` limpa | percentis | n_od < 10: `null` (sem rebaixar) | número e rótulo "preço disperso" |
| **Selo "menor registrado"** | ver 1.3 | | | | |

Notas de calibração:
- **Dispersão por P90/P10 em vez de máx/mín**: [Dado] no Switch 2 Nacional (preços atuais) P10 = R$ 3.950 e P90 = R$ 5.300, razão 1,34, enquanto máx/mín bruto é 153x (2.906 a 447.009). Máx/mín cresce com n e com um único erro; percentil não. Limiar inicial: `disp > 2` = baixa confiança (substitui `> 3` do máx/mín). [Hipótese] calibrar na sombra; o 3,07 do Xbox Halo (parecer anterior) era máx/mín.
- **Guarda média x mediana**: `|avg/med - 1| > 10%` marca `mean_sensitive` (veredito vira "preliminar"). Limiar a calibrar no backtest (E12).
- **Veredito**: a média continua a referência (regra do dono; modelo-indicadores 9.1). A mediana confirma, não decide (convergência com o especialista em preços na vitrine, seção 7).

### 1.3 Selo "menor preço já registrado" (condições, todas)

1. Camada A (`n_od >= 10` e `>= 3 ofertas distintas`) e `span >= 14 dias`.
2. `atual <= lowAll` do conjunto íntegro e acima do piso.
3. Sem `lowConfidence` (`disp <= 2`, `mean_sensitive = false`).
4. Vendedor não `low` (vigente) e oferta pública íntegra.
5. **Cauda inferior robusta**: se `z < -3,5` com desvio > 20%, NÃO ganha selo, e a corroboração de 2 vendedores NÃO libera (item 4 da Posição).
6. Zona de suspeita 35%-50% (vigente): corroboração de 2 vendedores continua exigida.
Justificativa do item 1 [Dado/teoria]: sob permutabilidade, a chance de o último valor ser um recorde é `1/n`. Com `n_od = 5` é 20%; com 10, 10%; com 30, 3%. Hoje o selo existe desde `n = 5`. A mudança retira selo de parte dos 379 masters de 5 a 9 oferta-dias (de 933 com >= 5). Isso altera o que o público vê: decisão D3.

### 1.4 Amostra pequena e incerteza

| Situação | O que mostrar |
|---|---|
| Master com `n_od < 3` ou 1 oferta [Dado: 3.207 dos 4.768 masters com cotação têm < 3 oferta-dias; 2.615 têm histórico de 1 oferta só] | só o preço atual, "Histórico curto". Sem típico, sem faixa, sem veredito, sem selo |
| `3 <= n_od < 5` | faixa observada "R$ min a R$ max (N cotações)". Sem típico, sem veredito |
| `5 <= n_od < 10` ou `< 3 ofertas` (camada B) | preço típico e veredito marcados "preliminar"; sem faixa usual; sem selo |
| `n_od >= 10` e `>= 3 ofertas` (camada A) | típico, faixa usual `[P25, P75]`, veredito, selo |

IC da mediana, distribuição livre, por estatística de ordem: posições `j = floor(n/2 - 1,96 x sqrt(n)/2)` e `k = n - j + 1`; para `n = 5` o par `(x1, x5)` cobre com 93,75%. Como as observações da mesma oferta são autocorrelacionadas, o `n` efetivo é próximo do número de ofertas. Por isso o IC público usa a contagem de ofertas distintas quando for menor que `n_od`, e o bootstrap em bloco por oferta (admin) é a verificação. [Dado] Dos 625 masters elegíveis pela regra atual (>= 5 oferta-dias e >= 14 dias), 138 (22%) têm 2 ou menos ofertas distintas: a "média de todas as lojas" é na prática a média de um ou dois anúncios. O rótulo precisa dizer "M lojas".

## 2. Pureza do grupo ANTES de calcular

### 2.1 Chave de identidade

Uma oferta só pertence ao master se a chave bate: `(franquia + título normalizado com numerais e subtítulo, plataforma, edição, tipo, composição, formato, condição, origem)`.
- Já existem em `master_products`: `product_type`, `game_platform_gen`, `game_edition_type`, `game_format`.
- Faltam (apontados pelo guardião): `composition` (single / bundle console+jogo / jogo+brinde / multipack) e `origin` (nacional / internacional). [Dado] `affiliate_offers.currency` é BRL em 9.071 de 9.071 ofertas ativas: nenhum campo de origem hoje.
- A chave também alimenta `findExistingMasterProduct`: edição, bundle e origem entram na comparação, senão o dedup junta o que o dono mandou separar. [Dado] Há 3 masters ativos para "Resident Evil 3" PS5 (`c78b07f7` com "euros" no nome, `6813e83f`, `d0c7e9ee`): violação da regra de um jogo, uma média, ao lado da contaminação por RE2.

### 2.2 Sinais de integridade (um por oferta; todos puros e testáveis)

| Sinal | Regra | Evidência medida | Efeito |
|---|---|---|---|
| S1 Numeral | conjunto de numerais soltos do título da oferta (inclui romano) difere do do master (ambos não vazios) | [Dado] 31 ofertas em 19 masters (9 com >= 50% divergente); 8 em masters com < 3 ofertas (invisíveis a qualquer teste de preço). Ex.: master "Resident Evil 3 Ps5 Midia Fisica" com 6 ofertas de RE2/RE4 e ~12 mil snapshots de RE2; "Street Fighter V" com SF6; "Forza Horizon 5" Standard com variante | quarentena de **identidade** |
| S2 Edição e composição | palavras de edição/bundle/combo/kit/steelbook/lacrado presentes em um lado e ausentes no outro; flag `bundle`; "+" e "com" | [Dado] não detectado nas ofertas ativas medidas por lista simples (0), mas o guardião achou 71 masters visíveis com flag bundle e o caso Halo+baralho; lista precisa vir do classificador do guardião | quarentena de **identidade** |
| S3 Cobertura de tokens | Jaccard entre tokens do master e da oferta < 0,5 | [Dado] 11 ofertas em masters com >= 3 ofertas | revisão |
| S4 Escala | `x/med` entre 80 e 125 vezes o esperado (erro de dígito, centavos x reais) ou preço absoluto implausível pela classe | [Dado] 4 ofertas ATIVAS acima de R$ 50.000: R$ 2.285.000,00 (PS4 Slim 1TB; era R$ 22.850 no ADR, subiu 100x), R$ 1.200.000 (Xbox One S), R$ 447.009 (Switch 2 Nacional, 102x a mediana, deslocamento exato de dígito), R$ 50.000 (PS5 Pro 2TB) | quarentena de **preço** (não corrigir: corrigir seria fabricar) |
| S5 Cauda robusta | z robusto de `x` no grupo (seção 1.1) | [Dado] 226 ofertas em 441 masters n >= 5; Switch 2 Nacional: R$ 2.906,32 z=-5,1; 447.009 z=+58 | revisão; cauda inferior bloqueia selo |
| S6 Centavos | centavos fora do padrão psicológico (.00/.90/.99) | [Hipótese] as 4 ofertas de 2.906 a 3.225 terminam em .32, .03, .70, .09 | sinal fraco, só soma ao S5 |
| S7 Marcador de origem no título | "internacional", "importado", "versão global", "exterior", "JP", "NTSC" | [Dado] 1 título com "versão internacional" e 1 com "versão global" entre as ofertas de console; 71 com "nacional", 13 com "bivolt". Recall baixíssimo | quarentena de **origem** quando presente |
| S8 Prior por classe (cross-master) | mediana do master vs mediana dos masters da mesma classe (tipo x plataforma x capacidade), z robusto entre masters | [Dado] "Xbox Series X Halo" (2 ofertas, R$ 15.500 e 17.478, mediana R$ 16.489) contra outros Xbox Series X de R$ 5.299 a R$ 10.250 | só fila de revisão; para masters com < 3 ofertas |
| S9 Heterogeneidade interna | master onde >= 2 sub-grupos de título (por S1) têm >= 2 ofertas cada | [Dado] master de RE3 | master inteiro em revisão |

Pontuação: `score = Σ pesos` (S1=4, S4=4, S7=3, S2=3, S5 inferior=2, S5 superior=1, S3=2, S6=1). Quarentena automática com `score >= 4` só para os sinais cuja precisão for medida >= 90% na auditoria manual (E4): hoje S1 e S4. Os demais vão para revisão (`score` 2 ou 3) e não alteram indicador até o humano decidir (exceto S5 inferior, que bloqueia selo e menor já visto por padrão).

### 2.3 O que fazer com oferta suspeita

- Estados em tabela própria derivada `offer_integrity(offer_id, state, reason, score, evidence jsonb, detected_at, decided_by, decided_at)`: `ok`, `review`, `quarantine_identity`, `quarantine_price`, `quarantine_origin`. Não altera `affiliate_offers` nem `affiliate_price_snapshots`. Nunca apagar.
- `quarantine_identity`: a oferta e seus snapshots saem de TODOS os indicadores de `m` (inclusive mínimo histórico, porque é outro produto), saem de preço atual, vitrine e contagem pública. O destino correto é **relink** ao master certo (RE2 para o master RE2, com `findExistingMasterProduct` e chave de identidade). Como o histórico está nos snapshots da oferta, o relink leva a série junto, sem reescrever cotação. Relink é gravação em `affiliate_offers.master_product_id`: backup, log, reversão (seção 6, E9).
- `quarantine_price` (escala, isca): sai de média, mediana, máximo, mínimo, selo e preço atual; fica em `Outras ofertas` do comparador com a etiqueta "preço fora do padrão, confirme".
- `quarantine_origin` (importado confirmado): decisão D4. Recomendado: sai da média, mediana e selo do produto nacional; aparece em seção própria "internacional" quando houver o campo.
- `review`: continua nos indicadores, mas sem selo e sem destaque; entra na fila com a evidência. A decisão humana vira exemplo rotulado e regra de exceção por oferta (nunca por regex). Decisão humana fixada não é sobrescrita pelo detector.
- Re-liberação: o estado é reversível; as estatísticas leem `offer_integrity` no momento do recálculo, então mudar o estado não exige reescrever o diário.

## 3. Internacionais, importados e preços absurdos

1. **O que dá para provar hoje**: nada de origem. Sem campo, o importado se separa só por padrão de preço (S5 inferior, S6), por marcador de título (S7, recall mínimo) e por vendedor [Hipótese].
2. **Caso R$ 2.906**: [Dado] é uma oferta ATIVA do Switch 2 Nacional (vendedor 5_green, 1.068 vendas), a 66,7% da mediana (R$ 4.359,52). Passa no piso de 35% e na zona de suspeita (50%), logo o selo vigente não a barra. Ela e outras 3 formam um aglomerado de z=-3,8 a -5,1 com 4 vendedores distintos. Regra proposta: cauda inferior robusta bloqueia selo e menor já visto; origem a confirmar (D4).
3. **Caso R$ 15.500**: [Dado] "Xbox Series X 1TB Halo Infinite" tem 2 ofertas (R$ 15.500,00 e 17.478,00). Com n = 2 não há mediana nem MAD. Pelo prior (S8) a mediana do master é 1,6x a maior mediana seguinte entre consoles Xbox Series (R$ 10.250, 4 ofertas) e mais que o dobro da maioria dos demais (R$ 4.352 a R$ 7.999). Vai para revisão; não entra em veredito (n < 3). O cluster pode ser real (edição de colecionador) ou revendedor: dado que falta (seção 8).
4. **Erros de escala (R$ 2.285.000 e similares)**: S4 quarentena de preço. Não corrigir valor. O R$ 22.850 do ADR virou R$ 2.285.000: o dado piorou entre revisões, sinal de que a quarentena precisa ser automática no ingresso da coleta e não só auditoria pontual.
5. **Mistura de variantes dentro de um mesmo master**: [Dado] "Console PlayStation 5 Slim Digital 825GB" tem 153 ofertas, mediana R$ 4.500, mínimo R$ 1.999 e máximo R$ 25.000, e o grupo `ps5` de console contém também Portal, bases, leitor de disco e kits com jogos. A mediana é válida só dentro do grupo puro; o detector de bimodalidade (maior lacuna em log entre dois aglomerados de >= 2 ofertas, razão > 1,35) vai para revisão de composição/edição.
6. **O que pedir à API oficial** [Hipótese a confirmar com o Integrador]: campos de entrega internacional/origem do item e país do vendedor no Mercado Livre; categoria/loja oficial na Shopee e Magalu. Sem scraping.

## 4. Cálculo e entrega eficientes

### 4.1 Reconciliação medida do F-26 (as duas medições do ADR 0004 convergem)

[Dado] hoje, Switch 2 Nacional (299.510 snapshots, 1.598 oferta-dias, 213 ofertas):

| Método | n | Média | Mediana | Média limpa (piso + 2x) | Mediana limpa |
|---|---|---|---|---|---|
| Snapshot bruto (hoje) | 299.510 | 4.458,53 | 4.491,00 | 4.455,56 | 4.491,00 |
| Oferta-dia, último do dia (SP) | 1.598 | **5.004,09** | 4.399,99 | 4.450,19 | 4.399,99 |
| Oferta-dia, mediana do dia (SP) | 1.598 | 4.970,90 | 4.399,00 | 4.416,96 | 4.399,00 |

O +12,4% do DBA (média bruta, R$ 5.009) é o efeito de erros de escala sem peso de frequência; com a limpeza a média cai a R$ 4.450 (-0,2%), que é o número do estatístico (-0,05%). Mario Wonder: média 384,96 (snapshot) contra 380,87 (último) e 373,97 (mediana do dia): -1,1% e -2,9%. Mediana do dia reduz a média cerca de 1,8% sobre o último do dia e a mediana cerca de 2%. Escolha final recomendada: mediana do dia para média, mediana e contagem; mínimo continua lendo o snapshot bruto. [Hipótese] o excesso de R$ 546 sobre a média corresponde a cerca de 2 oferta-dias a R$ 447.009; confirmar na sombra.

### 4.2 Camadas e o que roda quando

| Camada | Conteúdo | Frequência | Custo estimado |
|---|---|---|---|
| L0 `affiliate_price_snapshots` | cotação bruta, append-only, **não muda** | a cada coleta (5 min) | já existe (3,25 M linhas, 535 MB) |
| L1 `affiliate_price_daily` (DBA, migration 0022) | `(offer_id, day)` com `price_med`, `price_last`, `price_min`, `price_max`, `n_collected` | upsert incremental só do dia corrente e só das ofertas tocadas na coleta; fechamento de D-1 às 03:30 BRT | [Dado] 68.593 linhas; ~1 MB/dia; uma fatia diária 18 a 45 mil snapshots |
| L2 `offer_integrity` | estado e evidência por oferta | recalcula o score das ofertas tocadas a cada coleta (barato: título e preço atual); revisão semanal completa | 9 mil ofertas ativas |
| L3 `product_price_stats` (tabela, não MV) + `_history` | uma linha por master: `avg, median, p25, p75, p10, p90, min*, n_od, n_offers, span, tier, flags, calc_version, computed_at` | recomputação completa diária 03:30 após o fechamento (conjunto, em SQL único); recomputação pontual de 1 master quando há relink ou mudança de `integrity` | [Dado] ~4,8 mil masters com cotação, 68 mil linhas de entrada; meta < 3 s (DBA mede 1,8 s para agrupar) |
| L4 serving | cards, tabela, busca, home e `getPublicMetrics` leem L3 e a oferta pública atual | a cada requisição, cache curto | meta DBA: < 300 ms |

- **A cada coleta (5 min) recalcula-se só**: snapshot (já existe), linha do dia em L1 das ofertas tocadas, `integrity` das tocadas, ofertas públicas e preço atual (54 ms medido pelo DBA) e o veredito do preço atual como função pura sobre a linha L3 já gravada. Nada de percentil sobre 3 milhões de linhas.
- **Diário**: fechar D-1, recomputar L3 inteiro, gravar `_history` (permite backtest), rodar invariantes e alertas, invalidar tags de cache e aquecer.
- **Não recomputar L3 a cada coleta**: a referência muda devagar (dias fechados) e o "atual" é a única parte viva. Isso também elimina a autorreferência (preço de hoje dentro da média contra a qual ele é julgado).
- **Sombra**: 7 dias com v1 (atual) e v2 lado a lado; produto a produto, diferença explicada antes de ligar (ADR 0004, item 5).
- **Compatível com o ADR 0004**: L1 é derivada; L0 não é tocada. Invariante I8 verifica por hash dos dias fechados que L0 não mudou. O mínimo histórico lê L0.
- **Backfill**: dia a dia, fora do horário de coleta (`DISTINCT ON` com `date_trunc` levou 22 s; o agrupamento direto 1,8 s segundo o DBA; minha leitura com `array_agg` pelo pooler levou 44 s, portanto não rodar de uma vez).
- **Divergência registrada**: o DBA quer guardar último, mín e máx e deixar a regra escolher; o estatístico escolhe a mediana do dia. Proposta única: gravar todas, `price_med` é a coluna lida pelos indicadores.

## 5. Validação contínua

### 5.1 Invariantes testáveis (rodam em CI com SQL somente leitura e no cron diário)

| # | Invariante | Alvo |
|---|---|---|
| I1 | `min_raw <= min_clean <= median <= max_clean <= max_raw` e `min_clean <= avg <= max_clean` | 0 violações |
| I2 | `atual_público >= menor_já_visto` do mesmo produto (F-14) | 0 de 7.887 ofertas ativas |
| I3 | contador único: Σ `n_od` por produto = nº de pares oferta-dia íntegros = `getPublicMetrics().quotes`; mesmo valor em todas as telas no mesmo `computedAt` | 100% iguais |
| I4 | Σ buckets (tipo, fabricante, "sem plataforma") = total de produtos | 100% |
| I5 | nenhuma oferta `ok` com `integrity` pendente de S1/S4 (numeral divergente ou escala) | 0 (hoje 31 e 4 abertas) |
| I6 | nenhuma oferta em quarentena aparece em preço atual, vitrine, destaque, contagem | 0 |
| I7 | idempotência: `refresh_price_daily(d)` duas vezes dá o mesmo hash | igual |
| I8 | imutabilidade: contagem e checksum por dia fechado de `affiliate_price_snapshots` não mudam entre execuções | igual |
| I9 | veredito exibido = `computeVerdict` recalculado da linha L3 | 100% das linhas da tabela e dos cards |
| I10 | selo => camada A, sem `lowConfidence`, vendedor não `low`, não cauda inferior | 0 exceções |
| I11 | `n_od < 5` => sem típico, sem veredito, sem selo | 0 exceções |
| I12 | dedup: sem 2 masters com mesma chave título+plataforma+edição+tipo+composição | hoje >= 1 grupo violado (RE3 x3) |
| I13 | quarentena nova por dia <= 2% das ofertas ativas; acima disso é falha de coleta, não de produto | alerta |

### 5.2 Backtest (rolling-origin, 60 dias, sem dado sintético)

Para cada dia `t`, calcular a referência só com dias < t e julgar os preços observados em `t`.
- **Estabilidade do veredito**: fração de produtos que muda de faixa entre `t-1` e `t`. Meta: < 3% por dia (sem mudança real de preço).
- **Cobertura da faixa usual**: fração de oferta-dias de `t` dentro de `[P5, P95]` da referência. Meta: 90% ± 4 pontos.
- **Escolha do estimador**: erro absoluto relativo mediano de prever a mediana dos próximos 7 dias com média, média aparada 10%, mediana e média pós-MAD. Fica o de menor erro; empate vai para a média (regra do dono).
- **Precisão do "abaixo do normal"**: dos produtos `below` em `t`, fração ainda abaixo da referência nos 3 dias seguintes. Mede persistência (preço-lampejo).
- **Efeito da oferta-dia**: relatório de diferença de média e mediana por produto, v1 contra v2, assinado pelo estatístico (hoje: 382 de 4.623 produtos mudam média > 2% e 72 > 10%, medição do DBA, a refazer com a exclusão robusta).

### 5.3 Alertas de deriva (diários)

- PSI da distribuição `x/mediana` contra os 14 dias anteriores > 0,2.
- Proporção de ofertas em cada sinal (S1 a S9) acima de 2x a linha de base de 14 dias.
- Taxa de oferta-dias com mais de 1 preço distinto (hoje 61,4%): variação > 10 pontos indica mudança no coletor.
- Aumento de masters heterogêneos (S9) ou de bimodais.
- Queda de cobertura da faixa usual abaixo de 85%.
- Falha de invariante I1 a I13.

### 5.4 Amostra auditada manualmente

- 150 itens sinalizados (por sinal, estratificado) + 150 não sinalizados (controle de falso negativo) + 50 aleatórios de produtos com selo. Dois avaliadores independentes (dono e guardião), 15% em dupla (kappa >= 0,85). Rotular: item idêntico ao master (sim/não), origem, composição.
- Precisão de cada sinal com IC de Wilson 95%. Meta: >= 90% para os que aplicam quarentena automática; >= 70% para os que só abrem revisão. Falso negativo: com 150 limpos e 0 erros, o limite superior 95% é 3/150 = 2% (regra dos 3).
- Mensal depois: 100 itens para detectar deriva do classificador. Os rótulos viram conjunto ouro (dado real, nunca sintético).

## 6. PLANO DE EXECUÇÃO

Tipos: **C** = só código (reversível por git), **B** = grava no banco com backup e log, **D** = precisa de decisão do dono.

### 6.0 Decisões do dono (bloqueiam as etapas indicadas)

| # | Decisão | Recomendação | Bloqueia |
|---|---|---|---|
| D1 | Aprovar ADR 0004 (cotação = oferta-dia) e valor do dia | aprovar, mediana do dia (`percentile_disc(0.5)`), mínimo no bruto, fuso America/Sao_Paulo, emenda da regra de "cotação" | E6 a E11 |
| D2 | Semântica da quarentena: identidade e escala saem dos indicadores e do preço atual público; cauda inferior bloqueia selo e menor já visto | aprovar | E8 |
| D3 | Selo exige camada A (n_od >= 10 e >= 3 ofertas) e dispersão P90/P10 <= 2 | aprovar (retira selo de parte dos produtos de 5 a 9 oferta-dias) | E10 |
| D4 | Importado/internacional fora de média, mediana e selo do nacional; seção própria | aprovar; depende do campo de origem | E13 |
| D5 | Veredito continua contra a MÉDIA; mediana confirma | manter | E5 |
| D6 | Itens separados por edição, bundle e origem exigem criar masters novos e mexer no dedup | aprovar, com guardião | E9 |

### 6.1 Etapas em ordem

| # | Etapa | Tipo | Esforço | Depende de | Critério de pronto | Métrica |
|---|---|---|---|---|---|---|
| E1 | Funções puras `identity-key` e `integrity-signals` (S1 a S9) + script `audit-pureza.ts` SOMENTE LEITURA que emite CSV por oferta | C | 2 d | nada | testes com títulos reais deste parecer (RE2/RE3/RE4, SF V/6, Forza, GT7, Switch 2 R$ 2.906) verdes; CSV gerado para as 9.071 ofertas ativas | reproduz 31 divergências de numeral (19 masters) e 4 escalas; tempo < 60 s |
| E2 | `robust-stats.ts`: mediana, MAD log, aparada, IC por ordem, camadas A/B, P90/P10; testes de propriedade | C | 1 d | nada | propriedades: `min<=med<=max`, invariância a escala, exclusão idempotente | 100% dos testes; erro do IC vs bootstrap < 5 pontos |
| E3 | `check-invariants.ts` (I1 a I13), somente SELECT, saída JSON | C | 1 d | E2 | roda em < 60 s no CI e no cron | linha de base de violações hoje (RE3 x3, 31 numerais, 4 escalas) registrada |
| E4 | Auditoria manual: amostra 150 + 150 + 50 a partir do CSV de E1 | C + humano | 1 d de rotulagem (dono + guardião) | E1 | precisão por sinal com IC Wilson; kappa >= 0,85 | precisão S1 e S4 >= 90% (decide quarentena automática) |
| E5 | Sombra v2 em memória: `stats v2` (limpeza em camadas) lendo snapshots, 200 produtos de amostra, comparação com v1 | C | 2 d | E1, E2 | relatório por produto (média, mediana, flags); Switch 2 Nacional reconcilia com a seção 4.1; diferenças > 2% explicadas | 0 produto com divergência sem explicação |
| E6 | Migration aditiva 0022: `affiliate_price_daily`, `offer_integrity`, `product_price_stats` + `_history`, função `refresh_price_daily(d)`. Rollback = DROP das tabelas novas | B | 2 d (DBA) + revisão | D1; E5 | backup do esquema e contagem/hash por dia de L0 antes; migration aplicada em horário de baixa coleta | tabelas criadas; L0 intacta (I8) |
| E7 | Backfill dia a dia 2026-07-13 até hoje + sombra de 7 dias com v1 e v2 | B | 1 d + 7 d de espera | E6 | I7 e I8 passam; v2 do banco = v2 em memória de E5 | 0 diferença; hash estável; 68 mil linhas |
| E8 | Popular `offer_integrity` pelo detector: dry-run, relatório, aprovação, insert (só sinais com precisão >= 90% em E4) | B + D2 | 0,5 d | E4, E6, D2 | dry-run aprovado; `integrity` aplicada; ofertas continuam em `affiliate_offers` | 4 escalas e 31 numerais fora dos indicadores; I5 = 0 |
| E9 | Relink das intrusas e dedup de masters (RE2 para o master certo; os 3 masters de RE3): backup CSV `(offer_id, master_antigo)`, log por id, `findExistingMasterProduct` com a chave nova, reversão por script | B + D6 | 2 d (guardião) | E8, D6 | lote pequeno primeiro, conferência, depois o resto | I12 = 0; histórico da oferta preservado; contagem de snapshots por oferta idêntica antes/depois |
| E10 | Telas e buscas leem `product_price_stats` e a oferta pública; rótulos "N cotações (oferta-dia) de M lojas", "preliminar", faixa usual; selo por camada A; remover recálculos em `price-table.ts`, `search-products.ts`, `affiliate.ts` | C | 3 d | E7, D3 | I9, I10, I11, I3 e I4 passam; teste que compara página, tabela e busca em 50 produtos | divergência entre telas = 0; latência fria < 1,5 s (DBA) |
| E11 | Operação: cron diário 03:30 BRT (fechar D-1, recomputar L3, gravar `_history`, invariantes, alertas, aquecer); recompute pontual por master em relink | C + B (cron) | 1,5 d | E10 | job observável, falha avisa | tempo do job < 30 s; invariantes verdes 7 dias seguidos |
| E12 | Backtest e painel de deriva no admin (seção 5.2 e 5.3); calibrar 2, 3,5, 20%, 10% | C | 2 d | E7 | relatório assinado; limiares fixados em constantes | estabilidade < 3%/dia; cobertura 90 ± 4 |
| E13 | Origem do anúncio: pedir campo à API oficial e criar tratamento de importado | C + B | 2 d (Integrador) | D4 | campo capturado nos novos snapshots; quarentena de origem | S7/S6 substituídos por dado |

Esforço total estimado: cerca de 19 dias de trabalho + 7 dias de sombra. Caminho crítico: D1 -> E5 -> E6 -> E7 (sombra) -> E10 -> E11. Paralelizáveis: E1, E2, E3 imediatamente; E4 assim que E1 sair.

### 6.2 Separação por tipo

- **Só código (pode começar já, sem decisão)**: E1, E2, E3, E5, E12 (versão local), grande parte de E10 e E11.
- **Grava no banco com backup**: E6 (tabelas novas, rollback por DROP), E7 (preenche tabelas derivadas), E8 (insere estado em tabela nova), E9 (única que altera dado existente: `master_product_id` de ofertas, com backup CSV e log).
- **Precisa de decisão do dono**: D1 (ADR 0004), D2, D3, D4, D6; D5 é manter o que já está.

### 6.3 Métricas de sucesso consolidadas

1. Pureza: I5 = 0 e I12 = 0; precisão da auditoria manual das ofertas com selo >= 98% de itens idênticos (IC Wilson).
2. Consistência: 0 divergência entre telas no mesmo `computedAt` (I3, I4, I9).
3. Contagem: cotações públicas = pares oferta-dia íntegros (cerca de 68 mil, em vez de 3,25 milhões); leituras estatísticas lendo <= 100 mil linhas.
4. Robustez: média pós-limpeza do Switch 2 Nacional por oferta-dia dentro de 1% da de hoje; nenhum selo com cauda inferior robusta.
5. Desempenho: recompute diário < 30 s; consulta fria < 1,5 s.
6. Honestidade: 0 selo em histórico curto; 0 veredito com `n_od < 5`.

## 7. Dependências e divergências declaradas

- **DBA**: estrutura L1/L3 e migration 0022; divergência resolvida em gravar todas as colunas e ler `price_med`. Atenção: a MV desenhada por ele usa `price_last` e filtro de piso sobre `price_min`; precisa ser ajustada para `price_med`, exclusão robusta e `offer_integrity`.
- **Guardião do catálogo**: chave de identidade, `composition`, `origin`, relink, dedup e rótulos de edição. Sem isso S2 tem recall baixo. Posição dele sobre bundle fora da média fica incorporada (bundle = identidade diferente).
- **Especialista em preços**: aceito o uso da mediana como confirmação nas seções da vitrine (mais estrita que o veredito, sem contradizê-lo). Registro: nas vitrines `d` deveria usar a mediana limpa de L3 e o peso de amostra deveria usar `n_od`/ofertas, não `history_days` apenas. Também ressalvo que a regra de corroboração por 2 vendedores não pode desbloquear selo na cauda inferior robusta.
- **Matemático aplicado**: confirmar z robusto em log, os limiares 3,5 e 20%, P90/P10 e a monotonicidade do `score` de integridade.
- **Cientista de dados de tempo real**: causa da oscilação intradiária (61,4% de oferta-dias com mais de um preço) e se o "último do dia" seria um valor válido; prova de coleta nos masters com 1 oferta.
- **Gamer veterano**: definição de edição/bundle que é item distinto (steelbook, Deluxe, combo, importado) e de retrô.
- **Divergência com o ADR 0002 (mediana das ofertas frescas para o piso público) e 0001 (mediana das cotações)**: as duas réguas existem; a proposta é ler o piso de `product_price_stats` na CTE pública, adiado antes por custo; com L3 tabelada o custo cai e a régua única passa a ser possível (corrige F-14 pela raiz).

## 8. Dado que falta

1. Campo de origem/internacional e país do vendedor (API oficial). Sem ele, importado só se detecta por preço.
2. Causa de 61,4% das oferta-dias com mais de um preço (cupom, variante, leitura). Define se mediana do dia é a melhor escolha.
3. Se os 4 anúncios ativos acima de R$ 50.000 estão no conjunto público (frescor e prova de coleta); não medi se aparecem em alguma tela.
4. Lista oficial de edições e composições por franquia (guardião e gamer veterano) para S2.
5. Rótulos humanos (E4) para medir precisão e recall; até lá todos os números de sinal acima são contagem, não acurácia.
6. Distribuição de preço por classe (percentis por tipo x plataforma x capacidade) para o prior S8.
7. O Xbox Series X Halo (R$ 15.500 a 17.478) é cluster real de revendedores ou edição diferente? Conferência manual.
8. Reproduzir o conjunto de 2.906 a 3.225 com o campo de centavos do vendedor para confirmar a hipótese de conversão.

## 9. Medições deste parecer (SELECT, 2026-11-01)

- 9.071 ofertas ativas com preço > 0 (todas BRL) em 2.231 masters não mesclados; por nº de ofertas: 1: 649; 2: 645; 3-4: 486; 5-9: 275; 10 ou mais: 176.
- 7.132 ofertas em masters com >= 3 ofertas; razão preço/mediana: < 0,35: 24; 0,35-0,5: 61; 0,5-0,8: 632; 0,8-1,25: 5.237; 1,25-2: 994; 2-3: 123; >= 3: 61.
- 4.768 masters com cotação; por oferta-dias: < 3: 3.207; 3-4: 628; 5-9: 379; 10-29: 238; 30 ou mais: 316. Por ofertas distintas com histórico: 1: 2.615; 2: 912; 3-4: 607; 5 ou mais: 634.
- 68.593 oferta-dias; 42.098 (61,4%) com mais de um preço distinto.
- Diferença |média - mediana| / mediana em 933 masters com >= 5 oferta-dias, sem limpeza: P50 4,2%, P90 19,3%, P99 158,9%. Média aparada 10%: P50 3,3%, P90 17,1%. Média pós-MAD: P50 2,5%, P90 12,5%, P99 46,8%.
- Numeral divergente: 31 ofertas, 19 masters, 9 com >= 50% divergente. Entre 23 em masters com >= 3 ofertas, 2 extremas de preço.
- Reputação de vendedor disponível em 7.218 das 9.084 ofertas lidas (79%).
