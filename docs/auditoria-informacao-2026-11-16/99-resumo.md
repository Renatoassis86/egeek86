# Auditoria independente de informação: resumo (2026-11-16)

Auditor: agente independente, somente leitura (SELECT em transação READ ONLY), 10 ciclos, 28 achados (AUD-01 a AUD-28).

**Atualização (ciclos 07 a 10)**: os ciclos 07 e 08 acharam 3 itens médios (AUD-25, 26, 27) e 2 baixos; os ciclos 09 (modelagem) e 10 (adversarial final) não acharam item novo médio ou alto. Condição de parada atingida (2 ciclos seguidos limpos), com cobertura quase total (lacunas na seção de cobertura). Isso NÃO significa informação limpa: os 5 achados altos seguem abertos; significa que os testes que sei fazer pararam de achar coisa nova.

## Achados por severidade
**ALTA (5)**
- AUD-01 P1/P3/P5: "menor registrado" inclui Amazon, "hoje" exclui (29 de 174 mensagens; 11 com mínimo Amazon). Site diz R$ 49,97, mensagem diz R$ 130,00.
- AUD-02 30 mensagens já publicadas com preço depois marcado como isca (lista para decisão do dono; nada foi apagado).
- AUD-10 Gatilho de isca R-61 cego a Shopee e Amazon (`seller_id` 100% nulo): 33 ofertas abaixo de 0,50 x mediana, algumas em "Menor preço agora" (GodFall R$ 49,97; soundbar Wave One R$ 839,61).
- AUD-11 Dias fechados de `price_daily_state` guardam mínimo de isca (24 masters/128 dias) e mínimo de vendedor fraco (12% dos dias): média e mínimo vêm de conjuntos diferentes.
- AUD-14 Open Box, vitrine e Outlet aprovados e visíveis (10 ofertas Shopee; 1 em mensagem P2 enviada). Obs.: na 2ª leitura só 1 ainda aparecia sem quarentena (outro agente pode ter agido); reconferir.

**MÉDIA (12)**: AUD-25 degrau "pela queda" que não é pela queda (8/77 e 15/68 cards), AUD-26 painel privado sem texto guardado, AUD-27 links com item diferente/preço divergente ainda ativos (5 + 126; 111 mensagens); AUD-03 "Novo no monitoramento" repetido (48%), AUD-04 "%" com menos de 5 ofertas (249), AUD-05 "25687 mil vendas" (22), AUD-12 Amazon sem frescor (86% > 24 h), AUD-15 retrô/clone aprovado (2), AUD-16 itens miúdos aprovados (~8), AUD-19 link nunca verificado (~32.700), AUD-20 CEP Amazon 58035000 (48), AUD-21 crachá "-51%" em seção "queda confirmada".

**BAIXA (11)**: AUD-06, 07, 08, 09, 13, 17, 18, 22, 23, 24 (mediana inferior do dia), 28 (página de esporte sem bloco).

## Cobertura do catálogo (Fase 0)
Cobertas com teste: C01, C02, C04, C05, C06, C08 (parcial), C11, C12, C14 a C21, C23, C24, C25, C26, C27, C29. Parciais: C09/C22 (contadores não reproduzíveis, inconclusivo), C10 e C28 (só games e 1 página real; as rotas de produto dos outros 6 departamentos não foram lidas), C03/C30 (cupons e painel de impressoras são de outros agentes, só cruzei saída), C07 (selo não recomputado), C13 (nenhum uso). Fechado nos ciclos 07 a 10: páginas de TODOS os departamentos (rota `/mercado/<dept>/<slug>`, 60 masters, 0 divergências de preço), selo/régua recomputado (mensagens e cards), contadores (definição documentada), Pix/cartão da Amazon e cupons (confirmados, sem duplicar), links (a confirmar com o agente de links). Lacunas restantes: texto real do painel privado (não é guardado, AUD-26), `price_min_events` x ofertas, e-mails transacionais; estoque nenhuma superfície afirma.

## Invariantes novos propostos
I-01 a I-14 (nos ciclos). Resumo: série e "hoje" na mesma base de redes; zero mensagem com preço em `preco_isca_marcas`; "Novo" uma vez por oferta/grupo; "%" só com >= 5 ofertas; `min_cents` e média do mesmo conjunto; toda oferta visível >= 0,50 x mediana ou quarentena (sem depender de `seller_id`); Amazon em "Menor preço agora" só com confirmação <= 24 h; título com open box/vitrine/outlet/retrô/desbloqueado nunca ativo; contrato diário "Menor preço agora" da página = consulta (5 masters por departamento).

## Regras sugeridas para o FLUXO_MESTRE
1. **R-69 Mesma base**: qualquer mensagem ou card que compare "hoje" com histórico usa o mesmo conjunto de redes, ofertas e filtros nos dois lados.
2. **R-70 Gatilho sem identidade de vendedor**: critério de isca não pode depender de `seller_id`; falta de vendedor usa a loja/rede como voto.
3. **R-71 Correção retroativa**: quando uma regra de dado nasce, o reprocesso dos dias FECHADOS afetados é parte do "pronto" (script com backup), ou o limite fica declarado na tela.
4. **R-72 Rótulo verdadeiro**: "Novo", "Queda", "Menor" só com fato que o sustente, medido por teste de propriedade contra o banco (os ciclos deste auditor viram `scripts/medir-*`).
5. **R-73 Contrato por página**: teste diário de amostra estratificada (todos os departamentos) comparando página x consulta.

## Depende do dono
1. Mensagens já publicadas (AUD-02, 30; AUD-03 786 repetições; AUD-08 594 antigas): apagar/corrigir? (nada foi feito.)
2. "Outlet" é novo? (7 ofertas Shopee, inclui PS5 Slim R$ 4.599 e Wolverine R$ 5.399,99.)
3. A média provisória aceita na beta vale para texto com "%" em mensagem pública (AUD-04)?
4. Crachá "% abaixo da média" na seção "Queda confirmada": renomear ou trocar pelo % de queda real (AUD-21).
5. Autorizar `scripts/auditoria-informacao/quarentena-condicao-nao-nova.ts --apply` (dry-run entregue; reversível com `--rollback`).
