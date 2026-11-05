# ADR 0004: Cotação por oferta por dia

Data: 2026-11-01. Status: **Aceita por delegação em 2026-11-03, reversível; confirmada pelo dono em 2026-11-05 (D1, D2, D3) e emendada em 2026-11-05 (ver Emenda 2026-11-05). Fase 1 implementada em SOMBRA (nenhuma tela lê as tabelas novas)** (o dono mandou "fazer tudo o que falta"; adotada a recomendação registrada abaixo). Implementação em código: NÃO feita nesta rodada (ver Plano). Item: F-26 da auditoria Cowork; pareceres do Estatístico Sênior e do DBA em `docs/conselho/pareceres-2026-11-01/`.

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

## Decisão (adotada por delegação em 2026-11-03, reversível)
1. Cotação = **uma por oferta por dia** (fuso America/Sao_Paulo), derivada; `affiliate_price_snapshots` segue append-only e intocada.
2. Valor do dia = **mediana diária** (`percentile_disc(0.5)`, preço realmente observado; recomendação do Estatístico Sênior). A tabela diária guarda também último, mínimo, máximo e `n_collected` (recomendação do DBA), para que a regra possa ser trocada sem recoletar nada.
3. Média, mediana, contagem, máximo e piso leem a cotação diária; o **mínimo histórico continua lendo o snapshot bruto** (com piso e quarentena).
4. Elegibilidade (5 cotações e 14 dias) conta oferta-dias; rótulo "N cotações (oferta-dia)".
5. Ofertas em quarentena (migration 0023) e fora do porteiro/identidade ficam fora da tabela diária, como já ficam de todo indicador.
6. Reversão: a decisão não altera dado; desligar a leitura diária (flag) volta ao cálculo por snapshot bruto. Emenda ao texto "cotações" do `AGENTS.md` fica para o dono quando a leitura diária for ligada.

## Plano de implementação (NÃO executado)
Por que não foi implementado agora: exige tabela nova (`affiliate_price_daily`), função `refresh_price_daily(dia)`, view/CTE de estatística e 7 dias de execução em sombra; o parecer do DBA já aponta que a migration deve ser desenhada com a outra frente de desempenho (pré-computação) em andamento, e as medições do estatístico e do DBA divergem no Switch 2 (R$ 4.453,21 contra R$ 5.009,88), o que pede a comparação lado a lado antes de ligar. Fazê-lo agora sem esse cruzamento mudaria 72 vereditos sem validação.
1. Migration aditiva (número livre após a 0023) com `affiliate_price_daily(offer_id, day, median_cents, last_cents, min_cents, max_cents, n_collected)`, PK (offer_id, day).
2. `refresh_price_daily(dia)` idempotente, alimentada só por snapshots de ofertas fora de quarentena/porteiro.
3. Sombra de 7 dias: calcular os dois métodos (mediana do dia e último do dia) e comparar produto a produto; liberar só se a divergência do Switch 2 for explicada.
4. Trocar a fonte de `priceQuotesCtes` (`product-price-stats.ts`) por flag; manter o mínimo no snapshot bruto.

## Emenda 2026-11-05 (fase 1 em sombra)
Aprovação do dono (2026-11-05): média por OFERTA-DIA (cada oferta vale 1 por dia), selo e gráfico na mesma base, legado anterior a 31/10 com aviso, e regra nova: TODA mudança do menor preço do momento é registrada e apresentada (evento com horário, valor e loja). O que mudou em relação ao plano acima:
1. **Tabelas** (migration 0024, em vez de `affiliate_price_daily`): `price_daily_offer` (uma linha por oferta-dia medida: mediana, última, mín, máx, n_collected), `price_daily_state` (estado do dia por produto, com `closed`) e `price_min_events` (cada mudança do menor preço elegível). Derivadas, sem FK, RLS ligada e REVOKE de anon/authenticated.
2. **`price_daily_offer` guarda todas as ofertas com preço > 0**; a elegibilidade (quarentena, identidade, porteiro) é aplicada na LEITURA (`src/server/pricing/eligibility-sql.ts`, equivalente à regra do site), para uma oferta que deixe a quarentena não ter buraco no passado. Isto revisa o item 5 da decisão ("fora da tabela diária"): o efeito para o usuário é o mesmo (fora de todo indicador).
3. **Preço da oferta no dia** = mediana do dia (como decidido). **Média do dia M_d** = média simples dos preços oferta-dia das ofertas vigentes ao fim do dia, com carry-forward do último preço só dentro de 48 h; só com 3 ou mais ofertas (senão NULL e quality 'partial'); sem imputação além de 48 h (a oferta sai e n cai); dia sem oferta fresca = 'gap'; anterior a 31/10 = 'legacy'.
4. **Média do período** = soma dos preços oferta-dia / nº de oferta-dias (não a média das médias diárias). Elegibilidade a veredito: 3 ofertas distintas, 5 oferta-dias, 14 dias.
5. **Decomposição**: `matched_change_pct` (variação das mesmas ofertas entre dias consecutivos, M_C(t2)/M_C(t1) - 1) e `composition_flag` (efeito composição > 50% da variação de M_d).
6. **Mínimo continua no bruto elegível** (menor do dia = mínimo das cotações brutas elegíveis do dia; menor de 30/90 dias e de sempre, com data e loja, no bruto).
7. **Flag**: `PRICE_DAILY_SHADOW=1` liga o gancho da coleta e o job; desligada por padrão. Desligar = nada novo roda; as tabelas ficam inertes. A emenda ao `AGENTS.md` continua para quando a leitura for ligada.
