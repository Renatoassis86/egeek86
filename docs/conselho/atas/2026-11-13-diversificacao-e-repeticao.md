# Ata do Conselho Geek: produto repetido em duas mensagens e falta de diversidade por tipo nos grupos

- **Data:** 2026-11-13
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados:** guardiao-catalogo (parecer independente sobre catálogo e tipos; entregou a ampliação do classificador), engenheiro-backend e cientista-dados-tempo-real (consultados pelo código e pelas medidas do presidente), qa-verificador (verificação independente antes do commit). Dispensados por porte: seguranca-db (sem rota, segredo ou migration novos), bi-dataviz e designer-marca (sem tela nova).

## Briefing (pedido do dono, 2026-11-13, com 3 prints do grupo Games)
1. Por que o mesmo produto (Capcom Fighting Collection 2, Switch, Mercado Livre) saiu duas vezes seguidas, uma como CUPOM e outra como "Boa compra" com o bloco de cupom repetido?
2. Por que a Casa tem muita air fryer e micro-ondas, e outro grupo só mostra soundbar? Não existem outros produtos? Diversificar cada categoria com o que lhe é correlato.
3. Corrigir, apresentar o motivo, sem deixar pendência.

## 1. Motivos medidos (banco de produção, somente leitura; `scripts/medir-repeticao-diversidade.ts`)

### 1a. Por que o mesmo produto sai várias vezes
Janela de 24 h até 2026-11-13 00:30 UTC, canal Telegram, status `enviada`:

| Medida | Valor |
|---|---|
| Mensagens enviadas | 2.611 |
| Masters com 2 ou mais mensagens | 331 (de 1.075 enviados) |
| Mensagens que são repetição de um master já enviado | 1.807 (69% do volume) |
| Mediana do intervalo entre repetições | 61 min (mínimo 6 s) |
| Pares de gatilho: G2 depois de G2 | 1.596 |
| CUPOM depois de G2 / G2 depois de CUPOM | 45 / 46 |
| CUPOM depois de CUPOM | 90 |
| Por loja (masters repetidos) | games 93, impressão 3D 45, tecnologia 42, casa 42, esporte 38, livros 36, eletrônicos 35 |

Causas, no código:
1. **O piso entre duas mensagens do mesmo produto era 1 h por gatilho** (`PRODUCT_GAP_MIN = 60`; decisão anterior do dono, "canal movimentado"). Sendo o G2 (abaixo da média) a fila quase inteira, os poucos produtos elegíveis voltavam a cada hora. Hoje há só 20 G2 pendentes contra 592 Achados na fila: oferta elegível por comparação é escassa e o motor reciclava os mesmos produtos.
2. **Cupom e preço eram independentes por desenho** (comentário em `productDedupBlock`, `persistProposals` e `listPendingForSend`: "cupom e preço do mesmo produto não se bloqueiam"). A mensagem de preço já incorpora o cupom válido no envio (`withCouponBlock`), então o par saía como duas mensagens com a mesma informação do cupom. O incidente dos prints é exatamente esse par (CUPOM e depois "Boa compra" do mesmo master em minutos).
3. **Caso dos prints, medido no banco:** o Capcom Fighting Collection 2 teve 9 mensagens em 6 h (de 18:17 a 23:37 UTC): CUPOM de hora em hora (18:17, 19:18, 20:19, 21:34, 22:36, 23:36) e G2 de hora em hora (20:32, 21:35, 22:36, 23:37), sendo que em 22:36 e 23:36 o CUPOM e o G2 saíram com 37 e 50 segundos de diferença. A "Boa compra" em R$ 274,65 entrou pela regra da MÉDIA, não pelo menor registrado: 11,4% abaixo da média única de R$ 309,89 (4 ofertas, 13 dias de série), degrau 2 da régua (6% a menos de 12%). O mínimo de 12 dias (R$ 264,92) é só informação da linha mínimo/máximo; estar acima do mínimo não impede o selo. O defeito é a repetição horária e o par CUPOM + G2, não a elegibilidade.

### 1b. Por que Casa e Eletrônicos concentram um tipo
Mensagens enviadas em 24 h por tipo (e catálogo elegível, o mesmo predicado da média única):

| Loja | Envios 24 h (topo) | Catálogo elegível (topo) | Diagnóstico |
|---|---|---|---|
| Eletrônicos | soundbar 89 de 318 (28%), mas só 24 produtos | 224 produtos, soundbar 44 (20%) | catálogo pequeno + repetição: a JBL Cinema SB180 saiu 22 vezes em 24 h |
| Casa | air fryer 52 de 344 (15%), ar-condicionado 40, geladeira 40 | 489 produtos, air fryer 129 (26%) | catálogo concentrado em air fryer (26%); o motor até envia menos air fryer do que há no catálogo; micro-ondas não aparece no topo das 24 h |
| Tecnologia | placa de vídeo 195 de 387 (50%), 57 produtos | placa de vídeo 76 de 313 (24%) | o motor dobra a concentração do catálogo |
| Impressão 3D | impressoras 200 de 362 (55%) | 148 produtos, 6 tipos | catálogo de 6 tipos |
| Livros | RPG 118 de 285 (41%) | RPG 88 de 221 (40%) | catálogo concentrado |
| Esporte | bola 13%, proteção 13%, bicicleta 13%, halter 13% | bola 20% | mais equilibrado; halter repetiu 9 vezes por produto |

Causas do motor (não só do catálogo):
1. **A cota de 30% por tipo existia, mas isentava todo "alerta"**, e o G2 é classe alerta (2.076 das 2.611 mensagens). A cota nunca atuava sobre quase nada.
2. O rodízio por tipo só valia para as classes insight e radar (e para o pool de produtos), não para o alerta.
3. A janela de 300 propostas lidas pelo envio rodizia por gatilho e loja, não por tipo.
4. Repetição (1a): o mesmo produto de um tipo pequeno inflava o tipo (envios por produto: halter 9,2; teclado 7,3; impressora 5,7).
5. Catálogo: o dono tem razão em que o catálogo elegível é estreito em Eletrônicos (224). O restante é 'outros' mal classificado (193 produtos, 26% antes da ampliação do classificador) e semeadura de tipos novos que ainda não rodou.

## 2. Decisões e correções (R-47, atrás de flags)
- **Cooldown único por produto entre todos os gatilhos** (padrão 8 h; `GROUP_MASTER_COOLDOWN_H`, `0` ou `off` reverte). Simulação sobre as 48 h reais: o volume que sobrevive só com os envios já feitos seria 1.305 (4 h), 1.124 (6 h), 1.034 (8 h), 923 (12 h) e 800 (24 h) de 2.611; é um piso, porque a fila (592 Achados esperando) repõe com produtos novos. Escolhi 8 h dentro da faixa de 6 a 12 h do dono: permite até 3 aparições por dia e não esvazia o canal.
- **Exceções por mudança material**: cupom novo (60 min), queda adicional de 5% ou mais (2 h; novo menor preço, 30 min), degrau da régua mais forte (2 h). Envio manual do dono não é travado.
- **Cupom + preço = uma mensagem**: a de preço já leva o cupom; quem sai primeiro vence e a outra cai no cooldown. O cupom volta só se for outro cupom.
- **Cota por tipo também para o alerta G2/OK2**, teto de 2 por hora por tipo (`GROUP_TIPO_POR_HORA`) e rodízio do tipo menos enviado também no alerta; cota suave (só quando há alternativa de outro tipo); isentos: novo mínimo e degraus 4 e 5. Reverte com `GROUP_TIPO_COTA_ALERTA=off`.
- **Janela de 300 da fila** rodizia também por tipo; pré-filtro barra master enviado em 60 min por qualquer gatilho.
- **Catálogo (item 2c)**: classificador de tipos ampliado pelo guardião (drone, celular, TV Box, microfone, áudio hi-fi, casa inteligente; Casa: bebedouro, lavadora de alta pressão, torradeira, aquecedor, chuveiro, máquina de costura; Tecnologia, Esporte, Livros e Impressão 3D com seus correlatos). O mapa tipo x loja e os segmentos de semeadura de 2026-11-12 já cobrem os correlatos pedidos; falta rodar a semeadura e aprovar os masters novos pelo caminho existente: **fila #43**.

## 3. Riscos e o que não foi feito
- **Volume**: com cooldown, o número de mensagens por dia tende a cair em relação às 2.611 de hoje (69% eram repetição). A medida de produção decide; se ficar abaixo do aceitável, ajustar `GROUP_MASTER_COOLDOWN_H` (6 h) sem novo deploy de código, só variável de ambiente.
- **Games** não tem tipo (só plataforma): a cota por tipo não atua nele; o cooldown atua.
- A semeadura de novos tipos depende de aprovação de masters (R-43/R-45) e da cota das APIs: não é instantânea (fila #43).
- Dois produtos de cozinha em Tecnologia e dois mangás em Esporte: vertical errada, fila #44.

## 4. Verificação
Ver a seção "Resultado em produção" abaixo (preencher após o deploy e a janela de 30 min).

## Resultado em produção (deploy no ar por volta de 00:47 UTC; medido às 01:22 UTC, 35 min)
- **Repetição:** 24 envios, 24 masters distintos, **0 repetições** (antes: 69% do volume era repetição; mediana de 61 min entre repetições). O último par repetido (Capcom CUPOM e G2, 6 s de diferença) é de 00:44, antes do deploy.
- **Gatilhos:** G2 13, AC 11, CUPOM 0 (24 envios).
- **Tipos:** amostra pequena demais para fatiar por tipo (24 envios); a medida de 24 h fica para a retrospectiva (rodar `scripts/medir-repeticao-diversidade.ts 24` em 2026-11-14 00:00 UTC e comparar com a linha de base desta ata).
- **Volume:** 24 envios em 35 min contra cerca de 25 por 20 min antes, fora da hora cheia: queda de cerca de 45% neste trecho, esperada pela retirada das repetições, mas NÃO validada como aceitável. Decisão do dono: se quiser mais volume, `GROUP_MASTER_COOLDOWN_H=6` (variável de ambiente, sem código).
- **Desempenho (alerta de 01:00 a 01:05):** não causado pelo R-47. Ciclos do `group-messages` já levavam 25 a 58 s desde 23:43 (antes do deploy); média 25,7 s e máximo 49 s desde 00:47; os ciclos de 00:53 a 00:57, já com o código novo, levaram 5 a 16 s. Causa: varredura `live` (pick de 10 a 17 s a cada ciclo sem cache) competindo com collect-prices, collect-shopee e collect-vertical, e cache zerado por outro deploy às 00:57. Site respondeu 200 em 30,8 s na home (mesma contenção). Item na fila #45.
- **Pendência registrada:** ciclos que passam de 60 s se sobrepõem e podem decidir sobre o mesmo histórico (par de 6 s); se reaparecer repetição depois de 00:47, tratar com trava por master no envio (fila #45).
