# ADR 0004: Cotação por oferta por dia

Data: 2026-11-01. Status: **Proposta** (nada implementado; depende de aprovação do dono). Item: F-26 da auditoria Cowork; pareceres do Estatístico Sênior e do DBA em `docs/conselho/pareceres-2026-11-01/`.

## Contexto
A regra inegociável diz que a média do jogo é o somatório de TODAS as cotações dividido pelo total. Hoje cada linha de `affiliate_price_snapshots` é uma cotação. O coletor antigo gravava uma linha por checagem e o legado ficou. Medido em 2026-11-01 (somente leitura):
- 3.249.799 cotações com preço > 0 para 67.046 pares oferta-dia (48 cotações por oferta-dia). Nos últimos 14 dias, 419.033 linhas para 15.717 pares (27 vezes).
- Switch 2 Nacional: 299.506 cotações contra 1.590 oferta-dia (188 vezes). Mario Wonder: 155.858 contra 1.099.
- Há ofertas com 2 a 7 preços diferentes no mesmo dia, alternando. A causa (cupom, variante, erro de leitura) é desconhecida.

O efeito: um anúncio coletado a cada poucos minutos pesa mais que outro na média, e "N cotações" não mede observações independentes.

## Proposta
1. Cotação passa a ser **uma por oferta por dia** (fuso America/Sao_Paulo), derivada, sem alterar `affiliate_price_snapshots` (continua append-only e intocada).
2. Valor do dia: o estatístico propõe `percentile_disc(0.5)` do dia (preço realmente observado, resiste à oscilação); o DBA propõe guardar último, mínimo, máximo e `n_collected` e deixar a regra escolher. Decidir um dos dois.
3. Média, mediana, contagem, máximo e piso leem a cotação diária. O **mínimo histórico continua lendo o snapshot bruto** (com piso), para não perder preço real que durou poucas horas.
4. Elegibilidade (5 cotações e 14 dias) passa a contar oferta-dias. O rótulo vira "N cotações (oferta-dia)".
5. Estrutura: tabela `affiliate_price_daily`, função `refresh_price_daily(dia)` e view materializada de estatística por produto (desenho no parecer do DBA, migration 0022 não aplicada). Rodar em sombra por 7 dias antes de ligar.

## Impacto medido (parecer do estatístico, último preço do dia por oferta)
| Produto | Cotações hoje | Oferta-dia | Média hoje | Média oferta-dia | Variação |
|---|---|---|---|---|---|
| Switch 2 Nacional | 299.506 | 1.590 | R$ 4.455,56 | R$ 4.453,21 | -0,05% |
| Mario Wonder Switch | 155.858 | 1.099 | R$ 384,96 | R$ 380,58 | -1,1% |
| RE Village PS5 | 10.816 | 301 | R$ 182,60 | R$ 185,33 | +1,5% |
| GT7 PS5 | 93 | 64 | R$ 205,45 | R$ 209,94 | +2,2% |
| Xbox Series X Halo | 23 | 17 | R$ 16.146,30 | R$ 15.946,52 | -1,2% |

A mediana muda até 5,4% (RE Village), o bastante para cruzar a faixa de ±5% em algumas ofertas. O DBA mediu outro método ("último do dia", com mesmo rótulo de dia) e achou o Switch 2 Nacional em R$ 5.009,88 (+12,4%). Em 4.623 produtos, 382 mudam a média em mais de 2% e 72 em mais de 10%. As duas medições divergem no Switch 2: antes de aprovar, rodar os métodos lado a lado e comparar produto a produto.

## Consequências
- A contagem pública cai de 3,25 milhões para cerca de 67 mil: mais honesta, mas o número "encolhe" na home.
- Nenhum preço real some e nenhum dado é inventado. Muda o significado de "cotação" no texto da regra inegociável (`AGENTS.md`), por isso exige emenda do dono.
- Leituras estatísticas passam de 3,25 milhões para cerca de 67 mil linhas (consultas hoje de 9 s, 18,7 s e 8 s).
- Risco: a mudança de média (72 produtos acima de 10%) altera vereditos; fuso e regra do dia precisam de decisão.

## Decisão
Pendente do responsável do projeto. Até lá, `getPublicMetrics().quotes` continua contando snapshots brutos com preço > 0.
