# Ata do Conselho Geek: oscilação de preço por multi-catálogo no coletor do Mercado Livre

- **Data:** 2026-11-06
- **Porte:** grande (mudança de coleta e de dado de produção; reprocesso de eventos e medianas)
- **Presidente:** geek-lead
- **Convocados:** mesa fixa (estrategista-mercado, especialista-precos, gamer-veterano, qa-verificador) e, por tema: estatistico-senior, dba-postgres, engenheiro-coleta (parecer por leitura de código; a consulta à API ficou com o integrador), integrador-apis, guardiao-catalogo, engenheiro-backend
- **Escopo desta reunião:** somente desenho e ata. Nenhum código de coleta alterado, nada escrito no banco, sem commit, sem deploy. A única ação externa foi a consulta pontual somente leitura à API oficial do Mercado Livre autorizada pelo dono em 2026-11-06 (10 chamadas, sem 429, nada gravado).

## Briefing
Objetivo: desenhar a correção da oscilação de preço de ofertas de vendedor em masters com 2 ou mais catálogos ML.

Causa verificada em `src/server/collector/collect-prices.ts` (lida por 7 dos 10 membros, todos concordam):
- Agrupamento por `networkId:externalRef` (linhas 160-175): um master com N catálogos gera N grupos, processados em paralelo (`GROUP_CONCURRENCY = 4`).
- Lookup da oferta de vendedor por master+rede+vendedor, sem catálogo (linhas 427-441): os N grupos gravam na MESMA oferta, cada um com o preço do seu catálogo. `collapseBySeller` só colapsa dentro de um grupo.
- O `external_ref` da oferta de vendedor só é gravado no INSERT (linha 489) e nunca atualizado.
- Achado novo, confirmado por leitura de código por 8 membros (a frequência real ainda NÃO foi medida): `expiredOfferIds` (linhas 576-584) expira, de forma imediata e sem passar por `MAX_CONSECUTIVE_MISSES`, toda oferta do grupo cujo `external_ref` é A e que não apareceu no catálogo A; se o vendedor só aparece no catálogo B, o grupo B a reativa (linhas 553-555, `expired` vira `active`). Logo existe oscilação de STATUS além da de preço. O `group.offerIds` também depende de quais irmãs estavam "vencidas" naquele ciclo (`dueWhere` + `LIMIT`), o que torna o resultado dependente de ordem.
- Há ainda leitura-e-escrita sem lock em `existingOffer.status` (backend): dois grupos do mesmo master podem se sobrescrever.

Regras inegociáveis em jogo: sem dado fake/sintético/interpolado; um jogo, um master, uma média (oferta-dia, ADR 0004); toda mudança do menor preço é evento registrado; só API oficial; nada destrutivo sem autorização; concorrência real dinâmica.

Pergunta a decidir: qual a correção estrutural, em que ordem executar, o que é paliativo, como reprocessar sem inventar dado, o que cabe ao dono.

## Achados da consulta pontual à API oficial (integrador-apis, dado real)
Orçamento: 10 chamadas, sem 429, token já gravado em `system_config` lido por SELECT, nada gravado em banco ou repositório. Duas chamadas foram repetidas por engano (aviso de transparência), o que consumiu cota e deixou o multiget sem teste.

**RE3 (esclarecido).** O id `0885ff7a` é uma OFERTA; o master é `6813e83f-ef94-4b10-b54d-6e844c8a05b5`. Por SELECT, o master tem 7 `external_ref` ML (6 com oferta ativa), não 5 como no briefing. O vendedor A2ZGAMESINCBRF (id 3003302367) tem TRÊS anúncios distintos em três catálogos, com preço estável em cada um:

| Catálogo | Anúncio | Preço |
|---|---|---|
| MLB46308238 | MLB5957823202 | R$ 188,76 |
| MLB46286520 | MLB5957931472 | R$ 190,02 |
| MLB45004754 | MLB5957852488 | R$ 192,12 |

Os 3 valores batem exatamente com os snapshots alternados da oferta única do vendedor (18.876 / 19.002 / 19.212 centavos). Nenhum `item_id` se repete entre os 65 itens dos 6 catálogos lidos (os outros 3 catálogos não trazem o vendedor). Conclusão com evidência real: a API não erra nem varia; a oscilação é alternância entre anúncios diferentes do mesmo vendedor. O preço correto da oferta do vendedor é o menor (R$ 188,76), que é o que o comprador consegue pagar. `original_price` nulo e `condition = new` nos três.

**Zelda Switch 2 (NÃO esclarecido).** `GET /items/MLB5505062827` devolveu 403 `access_denied` com o token do app (2 tentativas); o orçamento acabou antes de testar o multiget `/items?ids=` (que o código já usa para títulos). O anúncio não aparece mais no catálogo MLB79488318 (hoje 18 itens, de R$ 7.000 a R$ 15.000) e o vendedor GUI_TEIXEIRA não aparece em nenhum item. Snapshots da oferta 9701a981 (fonte `api`, preço de lista nulo): R$ 9.500 (03/11 12:50), R$ 8.000 (03/11 15:15), R$ 9.500 (04/11 11:30). Descartados com dado: multi-catálogo (catálogo único) e promoção via `original_price` (nulo nas 3 leituras). Sobram mudança real do anúncio, outlier de revendedor ou leitura transitória; não distinguível. Fica FORA do escopo desta correção e vira trilha separada.

**Divergências de número a registrar (não escondidas).** (a) 7 catálogos para o RE3, não 5. (b) O guardiao-catalogo, por SELECT próprio com outra janela e filtro, contou 94 masters multi-catálogo com oferta ativa (73 com exatamente 2, 3 com 5 ou mais), contra os 369 do briefing; a diferença não foi reconciliada. O número a usar nas decisões é o do briefing até a reconciliação (item 0 do plano).

## Pareceres (rodada 1, independentes e em paralelo)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| especialista-precos | Apoia a opção 1 na variante "resolver juntos"; contra a opção 4 | Colapsar por vendedor entre catálogos; expirar só quem sumiu de todos; quarentena só temporária | Quantos dos 369 são duplicata; ofertas com `external_ref` diferente do catálogo atual |
| estatistico-senior | Causa é identidade, não ruído; apoia a opção 4 como defesa | Corrigir identidade; 2 leituras como defesa permanente; quarentena só como alarme; reprocessar após 7 dias limpos | Taxa de falso positivo do critério (só há os 55 casos conhecidos) |
| dba-postgres | Contra a opção 1a; migration aditiva depois | Fluxo sem DDL; depois `external_item_id` + UNIQUE parcial (master, rede, vendedor), após medir duplicatas | Duplicatas atuais; transições de status; se snapshot guarda origem (não guarda) |
| engenheiro-coleta | Unidade de coleta passa de catálogo para (rede, master) | Buscar todos os catálogos do master, unir, colapsar; expiração só se TODOS responderam; contador de faltas | Quantas ofertas têm `external_ref` diferente do catálogo atual; masters que compartilham catálogo |
| integrador-apis | Apoia a opção 1b; consulta feita | `/products/{id}/items` garante pertencimento; custo de cota neutro; `sale_price` tratar como evento | Teste do multiget `/items?ids=` com `catalog_product_id`/`status` (1 chamada) |
| guardiao-catalogo | Os masters multi-catálogo em geral NÃO são duplicata de master | Triagem offline com `compareIdentity`; desmembrar só os que misturam edição; fusão não é a causa | Lista exata e quantos têm divergência hard entre catálogos |
| engenheiro-backend | Apoia 1b atrás de flag; contra 1a | Agrupar por (rede, master), flag `COLLECT_MASTER_GROUPING`, piloto em 2 masters; índice único como defesa | Masters com mais de 5 catálogos (custo/`maxDuration`) |
| gamer-veterano | Apoia 1b; contra quarentena automática | Auditar a identidade ANTES de juntar; mostrar faixa observada ao cliente | Por que cada master tem 2+ catálogos |
| qa-verificador | Teste antes do código | Função pura extraída + `scripts/test-collector-multicatalog.ts` + critérios por SQL | Onde o payload bruto por catálogo é guardado; frequência de oscilação de status |
| estrategista-mercado | Apoia 1b; apoia quarentena temporária já | Estancar com quarentena (opção 3), corrigir, depois reprocessar | Cliques nos 27 masters afetados; custo de cota |

## Pontos de acordo (10 de 10 ou quase)
1. **A opção 1 só vale na segunda variante.** Resolver os catálogos do mesmo master em um passo e representar o vendedor pelo anúncio mais barato ativo entre eles. A variante "uma oferta por (master, rede, vendedor, catálogo)" é rejeitada por unanimidade (9 de 9 que opinaram): faria o mesmo vendedor valer mais de 1 por dia na média, violando "cada oferta vale 1 por dia" (ADR 0004) e "um jogo, uma média". A evidência do RE3 confirma: o preço certo é o menor anúncio do vendedor (R$ 188,76), não um por catálogo.
2. **Corrigir também a expiração**: expirar só quem sumiu de TODOS os catálogos do master, e só quando TODOS responderam com sucesso.
3. **Paliativos não são correção** (quarentena, 2 leituras); reprocesso só DEPOIS da causa corrigida, com backup e log, a partir de snapshots reais, sem interpolar e sem apagar.
4. **Zelda fica fora** desta correção (trilha separada de outliers), e fora dos critérios de aceite.
5. **Custo de cota neutro em regime** (mesma chamada por catálogo; muda a lógica e uma consulta de banco por master) e rollback por flag, sem migration na primeira entrega.
6. Merge/desmembramento de masters e quarentena em lote precisam de autorização do dono, com backup e log.

## Divergências e réplica (rodada 2)
| Tema | Posições | Resolução do presidente |
|---|---|---|
| Opção 4 (evento de menor preço só após 2 leituras) | A favor: estatistico-senior, gamer-veterano (apoio), backend (só para o evento, após o passo 1). Contra: especialista-precos, engenheiro-coleta, dba, integrador, estrategista, qa (atrasa evento real; fere "toda mudança é evento registrado") | Reformulada em ponto de convergência: o evento é SEMPRE gravado na hora, com horário da primeira leitura, nunca atrasado nem fabricado; a "confirmação em 2 leituras" vira atributo de exibição/alerta (destaque de "novo menor preço"), não condição de registro. Isso satisfaz o argumento do estatístico (não destacar ruído) e o dos contrários (nenhum evento perdido ou atrasado). Depende de coluna/ADR próprios: fora desta correção, fase 4 |
| Quarentena automática (opção 3) | Estrategista: aplicar já, em lote. Especialista-precos, DBA, guardião, qa: só temporária. Estatístico, coleta, backend, gamer: só alarme/lista de revisão, nunca ação automática | Nenhuma quarentena AUTOMÁTICA. Detector em modo alarme (lista) no pós-correção. Quarentena em lote das ~51 ofertas ativas oscilantes é plano B, manual, só se o piloto passar de 72 h; vai ao dono. Motivo: o efeito medido na média é pequeno (RE3 R$ 188 contra R$ 192, cerca de 2%) e quarentenar remove ofertas reais da cobertura; o gamer-veterano lembra que a Black Friday gera repricing legítimo que um limiar fixo confundiria |
| Opção 2 (revisar os 369 masters) | Gamer, especialista-precos: antes ou junto. Guardião, backend, estrategista, qa: paralela/ortogonal, não bloqueia. Guardião: a maioria é multi-catálogo legítimo (ex. Mario Kart 8 com 17 catálogos) | Não bloqueia a correção. Vira TRIAGEM offline somente leitura (`compareIdentity` entre os títulos dos catálogos de cada master), com o resultado que decide se algum master mistura edição (desmembrar) ou duplica outro master (fundir). Entre os dois riscos do gamer-veterano (juntar edições diferentes), a defesa já existe no passo 1: o veredito de identidade por título original (`collapseBySeller` com `verdicts`) impede que um anúncio Open Box/outra edição represente o vendedor |
| Expiração: imediata ou por contador | Coleta propõe passar pelo contador `MAX_CONSECUTIVE_MISSES`; demais não tratam | Manter a semântica atual (imediata) calculada sobre a união do master e só com todos os catálogos OK: master de catálogo único fica idêntico ao comportamento de hoje (exigência do QA) e a regra de concorrência real (loja inativa sai e o próximo mais barato entra no ciclo) é preservada. Contador atrasaria a saída de estoque zerado por 45 min a 3 h |
| Quando reprocessar | Estatístico: 7 dias limpos. Estrategista e demais: após a correção. Backend: 7 dias | 7 dias limpos em produção, ou 72 h no piloto mais dry-run com diff aprovado pelo dono, o que vier depois |

Réplica formal dispensada: as divergências foram resolvidas por reformulação (opção 4) ou por escopo (opção 2, quarentena) sem que algum membro precisasse contra-argumentar; fica registrado que estrategista-mercado mantém a preferência pela quarentena já, e estatístico-senior pelas 2 leituras como regra permanente de exibição.

## Riscos consolidados
- **Falha parcial por catálogo.** Se um dos N catálogos falhar e os outros responderem, gravar o menor preço apenas dos que responderam pode gravar um valor MAIS ALTO que o real e recriar a oscilação. Regra: tudo ou nada por master (retry uma vez; se persistir, não grava preço nem expira, e não renova o carimbo).
- **Paginação desconhecida.** Não está confirmado se `/products/{id}/items` pagina; se cortar a lista, vendedores além do corte pareceriam ausentes e seriam expirados. É dado que falta (um pedido de teste, não feito por limite de cota).
- **Orçamento de tempo.** Há masters com 17 a 19 catálogos (Mario Kart 8, FF VII Rebirth). A unidade de trabalho vira o master (N chamadas sequenciais dentro de um slot); o teto por execução deve ser em CHAMADAS de catálogo, não em ofertas (hoje `MAX_OFFERS_PER_RUN = 150`), para não cortar um master no meio.
- **Dois masters compartilhando um catálogo** (duplicata) hoje caem no mesmo grupo e usam o master da primeira oferta; com o novo agrupamento cada master busca seus catálogos; precisa de teste.
- **Reprocesso com a causa ativa** reconstrói o mesmo ruído e cria segunda verdade.
- **Índice único novo** falha se existirem duplicatas (master, rede, vendedor); medir antes e marcar, nunca DELETE.
- **Quebra de série** na média dos masters afetados ao corrigir (preço do vendedor passa a ser o menor entre catálogos).

## Decisão recomendada, em ordem de execução
Todas as etapas abaixo são recomendação do conselho; nenhuma começa sem a decisão do dono registrada (ver "O que cabe ao dono").

**Etapa 0, medição (somente SELECT, sem risco; dba-postgres + cientista-dados-tempo-real).**
a) Reconciliar 369 (briefing) vs 94 (guardião). b) Duplicatas (master, rede, vendedor) com `seller_id` não nulo. c) Ofertas ativas cujo `external_ref` difere do catálogo em que o vendedor aparece hoje. d) Transições `expired` para `active` nos últimos 8 dias em masters multi-catálogo (mede a oscilação de STATUS). e) Distribuição de catálogos por master (quantos acima de 5; custo em chamadas por ciclo). f) Pares de masters que compartilham `external_ref`. g) Gravar a paginação de `/products/{id}/items` (1 chamada, sob nova autorização do dono, pois as 10 foram usadas).

**Etapa 1, testes antes do código (qa-verificador + engenheiro-software-principal).** Ver plano de testes.

**Etapa 2, correção estrutural no fluxo, sem migration (engenheiro-coleta + engenheiro-backend; revisão: arquiteto-next, engenheiro-software-principal).**
1. Extrair uma função pura `consolidateMasterResults`: entrada = resultados por catálogo (cada resultado marcado com o catálogo que o trouxe) e veredictos de identidade; saída = um resultado por vendedor (anúncio mais barato ativo, com a mesma regra de `collapseBySeller`: identidade duvidosa nunca representa o vendedor; desempate por item id) mais o melhor preço por catálogo para os placeholders.
2. Agrupar a coleta por (rede, master): carregar TODOS os `external_ref` do master (ofertas e placeholders, não só as vencidas) e TODAS as suas ofertas; buscar os catálogos em sequência dentro do slot; aplicar uma única vez (`applySnapshotsToGroup` por master).
3. Placeholders (vendedor nulo): seguem recebendo o melhor preço do SEU catálogo (`pickCatalogPlaceholder`, correção de 05/11 preservada).
4. Expiração: calculada sobre a união do master, só se todos os catálogos responderam; semântica imediata atual.
5. Tudo ou nada por master em falha parcial (retry 1x).
6. Teto por execução em chamadas de catálogo; carimbo `last_checked_at` e `last_price_confirmed_at` conforme hoje, para todas as ofertas do master tratadas.
7. Atrás da flag `COLLECT_MASTER_GROUPING` (desligada por padrão) com lista de masters-piloto: primeiro Celeste PS4 e RE3 (master `6813e83f`); rollback = desligar a flag, sem migration a desfazer.

**Etapa 3, piloto e ampliação.** 72 h nos 2 masters-piloto com métrica diária por SQL; depois os 27 masters com oscilação; depois todos os multi-catálogo; por fim o legado (agrupamento por catálogo) é removido do código.

**Etapa 4, saneamento e defesa (cada item exige aprovação própria do dono).**
- Triagem de catálogo (opção 2 reformulada): offline, somente leitura, em lote com backup e log; desmembrar só masters que misturam edição; fundir só masters distintos duplicados.
- Migration aditiva (dba-postgres): `external_item_id text NULL` (anúncio vigente, auditoria) e `UNIQUE (master_product_id, network_id, seller_id) WHERE seller_id IS NOT NULL` via `CREATE INDEX CONCURRENTLY`, só após zerar duplicatas por marcação (nunca DELETE); rollback = `DROP INDEX` e `DROP COLUMN`; sem backfill (a coluna se preenche no próximo ciclo).
- Detector de oscilação em modo alarme (3+ reversões A-B-A em 24 h e razão acima de 1,3), relatório diário, sem ação automática.
- "Confirmação em 2 leituras" como atributo de exibição do novo menor preço, não de registro (precisa de ADR e coluna).

**Etapa 5, reprocesso (ver plano abaixo).**

**Trilha paralela, Zelda (cientista-precos + integrador-apis).** Tratar como outlier de dado: testar o multiget `/items?ids=` (que o código já usa) para `status`, `catalog_product_id` e `sale_price` do anúncio MLB-5505062827 e comparar com os outros 17 itens do catálogo; não bloqueia nada.

## Plano de reprocesso com backup e log
Pré-condições: correção em produção, 7 dias sem oscilação nova nos masters migrados (ou 72 h de piloto e diff aprovado), aprovação do dono depois do dry-run. Reaproveita a infraestrutura existente: `scripts/reprocessar-eventos-minimo.ts` (dry-run padrão em transação READ ONLY, `--apply` com backup NDJSON e log JSON, `--revert <log>`, idempotente, lock por produto `pme:<id>`, nunca toca eventos `live`) e o padrão de backup/log de `backup-pre-fusao.mjs` e `quarentena-precos-absurdos.ts`.
1. **Backup antes de gravar:** backup NDJSON dos 107 eventos de menor preço afetados e das linhas de mediana diária (`affiliate_price_daily`/derivadas) dos masters afetados, em `backup/dados/`, com contagem de linhas e hash registrados; backup completo do banco no padrão do dia 03/11 se o escopo crescer. Contagem de linhas do backup igual à do log.
2. **Dry-run primeiro:** relatório e CSV de diff por master (removido, adicionado, alterado), com o antes/depois da média oferta-dia e do menor preço, sem gravar.
3. **Regra de reconstrução:** somente a partir de snapshots reais (`affiliate_price_snapshots` continua append-only e intocado). Nenhum valor é interpolado. Para as ofertas oscilantes, no período anterior à correção, os snapshots são cotações reais de anúncios reais, mas não representam o preço do vendedor (o menor anúncio); portanto: (i) eventos de menor preço derivados de oferta oscilante nesse período são MARCADOS como não confiáveis (`superseded`/equivalente), não apagados, e recalculados só com ofertas elegíveis; (ii) lacunas que não se reconstroem ficam marcadas, não preenchidas. Decisão técnica em aberto, a fechar com o dry-run e o estatístico: como tratar as medianas oferta-dia dos dias contaminados (não reescrever o valor real; avaliar excluir esses oferta-dias das médias com flag, ou manter com marca). A decisão sobre a mediana vai ao dono com o diff na mão.
4. **Aplicar** em uma transação por produto, com log (offer_id/evento, valores e status antigos e novos); idempotente.
5. **Reversão:** `--revert <log> --apply` restaura do log e do backup; verificação pós-reversão por contagem.
6. **Verificação pós:** zero evento de menor preço novo originado de oferta oscilante; contagem de masters e ofertas ativas igual à anterior com diferença explicada; amostra manual de 20 masters comparando selo, gráfico e cabeçalho (mesma média).

## Plano de testes (qa-verificador)
Padrão do projeto: scripts `tsx` avulsos em `scripts/test-*.ts`, sem banco, saem com código 1 em falha (ex.: `test-catalog-placeholder.ts`). Registrar tudo num único `test:coleta` em `package.json` (hoje só `test:parecer` e `test:collector` estão lá; os demais não têm gatilho em CI, risco de processo).
1. **Unitário puro** `scripts/test-collector-multicatalog.ts` sobre `consolidateMasterResults`:
   - Regressão RE3: 3 catálogos, mesmo vendedor, R$ 188,76 / 190,02 / 192,12, saída = 1 oferta a R$ 188,76; invariante à ordem dos catálogos (testar as permutações).
   - Regressão Celeste PS4: 2 catálogos, mesmo vendedor, preços diferentes.
   - Vendedor em apenas um dos catálogos: não pode ser expirado.
   - Vendedor ausente de todos: expira (e só com todos os catálogos OK); falha parcial de catálogo: nenhum preço gravado e nenhuma expiração.
   - Catálogo único: saída idêntica à do coletor atual.
   - Anúncio Open Box/outra edição nunca representa o vendedor; placeholder por catálogo preservado; master que divide catálogo com outro master.
   - Idempotência: 2 passadas seguidas não geram snapshot novo.
2. **Fixtures com dado real, nunca sintético:** pares (vendedor, preço, catálogo, item id) reais obtidos nesta consulta e de `affiliate_price_snapshots`, com vendedor anonimizado por hash; se o payload bruto não estiver guardado, o teste declara a limitação.
3. **Suítes existentes que devem continuar a 0 falha:** `test-catalog-placeholder`, `test-identity`, `test-gate`, `test-daily-state`; `tsc` e build limpos.
4. **Aceite por SQL nas 24 h seguintes a 3 ciclos reais sem erro** (critérios de bloqueio do "concluído"): zero ofertas com 3+ reversões e razão acima de 1,3 nos masters-piloto (depois nos migrados); zero transições `expired`/`active` sem mudança real; zero duplicatas (master, rede, vendedor); nenhuma linha escrita sem backup; regras inegociáveis auditadas; Zelda fora dos critérios.
5. **Amostra contra a API oficial** (com nova autorização de cota): para 5 a 10 ofertas migradas, o preço gravado é o menor anúncio do vendedor entre os catálogos do master.

## Métrica de sucesso
Conferir por SQL e registrar na retrospectiva:
- Ofertas oscilantes (3+ reversões A-B-A em 24 h, razão acima de 1,3) em masters migrados: de 55 para 0 em 7 dias (piloto: 0 em 72 h); em catálogo único segue 0.
- Transições `expired`/`active` por oferta e dia em masters multi-catálogo: 0 sem causa externa.
- Novos eventos de menor preço originados de oferta oscilante: 0 (histórico: 107 de 503 a reprocessar).
- Duplicatas (master, rede, vendedor): 0.
- Preço da oferta = menor anúncio do vendedor entre catálogos, em amostra conferida na API.
- Chamadas de API por ciclo dentro de +10% da linha de base e duração do cron abaixo de 60% do `maxDuration` (250 s).
- Selo, gráfico e cabeçalho com a mesma média; diferença da média oferta-dia antes/depois listada por master.

## O que cabe ao dono (uma pergunta por vez, com recomendação)
Decisão do responsável do projeto: pendente em todas. Perguntar nesta ordem; cada uma só quando a anterior estiver respondida.
1. **Aprova implementar a correção 1b (agrupar por master, anúncio mais barato do vendedor entre catálogos, expiração pela união) atrás da flag `COLLECT_MASTER_GROUPING`, com piloto em Celeste PS4 e RE3 por 72 h antes de ampliar?** Recomendação: sim. Sem migration, rollback por flag.
2. **Autoriza uma segunda consulta pontual somente leitura à API oficial** (no máximo 3 chamadas: paginação de `/products/{id}/items`; multiget `/items?ids=MLB5505062827` para o Zelda)? Recomendação: sim, as 10 chamadas anteriores se esgotaram e a paginação é risco aberto.
3. **Quarentena em lote das ~51 ofertas ativas oscilantes até o piloto fechar?** Recomendação: NÃO agora; só se o piloto passar de 72 h, e então manual, com backup e log, reversível por `quarantined_at`. (Divergência: estrategista-mercado recomenda já.)
4. **Aprova a migration aditiva (`external_item_id` e UNIQUE parcial por master/rede/vendedor), depois da Etapa 0 mostrar as duplicatas?** Recomendação: sim, em outra rodada, com backup.
5. **Aprova a triagem de catálogo dos masters multi-catálogo em lote (offline, somente leitura primeiro), com desmembramento/fusão só dos que a triagem apontar, em bloco com backup e log?** Recomendação: sim, na forma de aprovação em bloco do reversível, como o senhor prefere.
6. **Aprova o reprocesso dos 107 eventos e, se necessário, das medianas, depois de ver o diff do dry-run?** Recomendação: sim, após 7 dias limpos (ou 72 h de piloto), com o diff por master na mão; a regra para as medianas dos dias contaminados é a questão a decidir com o diff.
7. **Zelda como trilha separada de outliers?** Recomendação: sim.
8. **"Confirmação em 2 leituras" como atributo de exibição do novo menor preço** (o evento continua registrado na hora)? Recomendação: sim, depois da correção, com ADR; não faz parte desta entrega.

## Execução e verificação
- Executores previstos: engenheiro-coleta e engenheiro-backend (código), dba-postgres (medição, migration, backup/log), guardiao-catalogo (triagem), integrador-apis (cota e API), cientista-precos e estatistico-senior (regra das medianas), engenheiro-software-principal (revisão de código e testes).
- Vetos registrados: nenhum. Linhas vermelhas lembradas: nenhum dado interpolado ou fabricado no reprocesso; nada de DELETE; sem scraping; só API oficial.
- QA: pendente (nada foi executado nesta reunião). Esta ata não declara nada concluído; a execução exige `qa-verificador` e a skill `checklist-publicacao`.

## Implementação da paginação (2026-11-06, autorizada pelo dono; sem commit, sem deploy, flag desligada)
Fecha o risco "Paginação desconhecida". Fatos medidos na API oficial (consulta anterior): a resposta traz `paging {total, offset, limit}`; `limit` padrão 100; `limit` e `offset` funcionam (limit=10&offset=95 devolveu 2 itens de total 97). O teto máximo de `limit` é DESCONHECIDO: o código nunca pede mais que 100 e a API real não foi chamada nesta tarefa.

**Desenho (só no caminho por master; testes escritos antes do código).**
- `fetchCatalogAllPages` (`src/lib/affiliate/master-consolidation.ts`, pura): `limit=100`, `offset` crescente enquanto `offset + brutos da página < paging.total`; o offset avança pelo que realmente veio. Dedupe por item id; a completude conta ids brutos únicos (inclui itens não `new`, que o adapter descarta).
- Lista incompleta é FALHA do catálogo, e catálogo falho é falha do master (regime tudo-ou-nada existente: nada gravado, nada expirado, `last_checked_at` não renovado, master segue devido): página que falha após 1 retry; `paging` ausente; `paging` inconsistente (total negativo/não inteiro, offset diferente do pedido, total mudando entre páginas); página vazia sem progresso; acumulado único menor que o total; mais de 10 páginas por catálogo (`MASTER_MAX_PAGES_PER_CATALOG`, 1000 anúncios).
- `fetchMasterCatalogs` não repete mais o catálogo inteiro na falha de paginação (o retry de 1x é por página); `retries: 0` no coletor por master.
- Orçamento: custo = páginas. `createCallBudget` ganhou `canAdmit(owner, minCalls)` (admissão sem consumir, 1 por catálogo) e `tryCharge(owner)` (cobra ANTES de cada página/retry). O 1º master do ciclo é isento do teto (evita starvation de master com muitos catálogos), mas suas páginas contam. Orçamento esgotado no meio de um catálogo = falha parcial do master (`mastersPartialByBudget`), sem erro de API registrado. Catálogo compartilhado por 2 masters é paginado uma vez por ciclo (cache); só quem dispara a busca paga.
- Adapter: `fetchCatalogPage` (opcional em `PriceSource`; ML implementa) e `parseMeliCatalogPage` (pura, testada). 404 na 1ª página = catálogo sem vendedores (igual ao legado); 404 depois da 1ª é falha. Fonte sem `fetchCatalogPage` falha fechado no caminho por master.
- Alarme no `summary.masterGrouping`: `catalogosAcimaDe100 [{externalRef, total}]` (paging.total > 100, sem repetir no ciclo), `paginationFailures [{externalRef, kind}]`, `mastersPartialByBudget`. `catalogApiCalls` agora conta páginas e retries.
- Flag desligada: comportamento IDÊNTICO. `fetchSnapshots` (legado) não foi alterado (só um comentário `TODO(paginacao-legado)`); testes verificam que ele não tem `limit`/`offset` e que `processCatalogGroup` não usa o caminho paginado.

**Risco do legado (NÃO alterado, a decidir pelo dono).** Com a flag desligada (produção hoje), `GET /products/{id}/items` é chamado sem `limit/offset` e `paging` é ignorado: catálogo com total > 100 é cortado em silêncio e os vendedores além do corte são expirados por `expiredOfferIds`. Indício medido (somente leitura, 2026-11-06): nenhum catálogo ML tem mais que 90 ofertas ativas+rascunho; o maior tem exatamente 90 (MLB19472094, 90 vendedores) e outros 3 têm 85 a 88, todos de 1 master. Esse teto de 90 com 90 vendedores é compatível com corte em 100 itens depois de remover não-novos e repetidos, mas NÃO prova truncamento (o total real da API não foi consultado). Recomendação: ao ligar a flag nesses masters, o alarme `catalogosAcimaDe100` mede o total real sem custo extra; só depois decidir se o legado também deve paginar.

**Estimativa de chamadas por ciclo (dados reais, somente leitura).** 9.554 ofertas ML ativas/rascunho em 2.061 catálogos distintos e 1.934 masters; 98 masters com 2+ catálogos, 3 com 5+, máximo 6. Catálogos com mais de 90 ofertas: 0 (mais de 80: 4; mais de 50: 12). Logo páginas extras previstas hoje: 0 (cada catálogo continua custando 1 chamada) e a linha de base + 10% do teto não muda. O número é limite inferior: ofertas no banco são 1 por vendedor, a API pode listar mais anúncios que isso. O alarme dirá o real.

**Ressalvas do QA independente (aprovado com ressalvas), corrigidas.**
- R1, isenção determinística e admissão atômica: o master isento do teto é eleito ANTES do `mapWithConcurrency` (`setExempt`, o primeiro alvo da fila), não mais o primeiro a chegar ao orçamento. `admit(owner, minCalls)` reserva a folga mínima (folga livre = teto, menos cobradas, menos reservas dos outros) e as cobranças do master consomem a reserva primeiro; `release` no `finally` devolve o que não foi usado. Quatro masters concorrentes não disputam mais a mesma folga. `canAdmit` segue existindo (não reserva).
- R2, isento não herda falha alheia: `withExemptRetry` — se o master isento aguarda a promessa em cache disparada por outro master e ela falhou por orçamento, ele refaz a busca (a falha não fica em cache) já com isenção. Master comum e outros tipos de falha não são retentados.
- R3, catálogo vazio sem `paging`: resposta 200 bem formada (`results` é array), na 1ª página, sem nenhum item bruto e sem `paging` vale como catálogo vazio (`emptyWithoutPaging`). Qualquer resposta com itens sem `paging`, ou vazia fora da 1ª página, continua falhando (`paging-ausente`). Esse caso NÃO foi medido na API real (só o caso com `paging` foi); fica visível em `summary.masterGrouping.catalogosVaziosSemPaging`.
- S1, validação mais dura: `paging.total` 0 com itens na página, ou mais itens brutos ÚNICOS que o total, falha como `paging-inconsistente`. Um id repetido não conta como excesso (a regra de dedupe continua valendo).
- S2, multiget de títulos: o custo do orçamento NÃO conta `fetchSellerTitles` (até 1 chamada por 20 anúncios, ou seja, até 5 por página); é subestimação conhecida, igual ao legado. Contador separado e sem efeito no teto: `titleMultigetCallsEstimated` = soma de `ceil(anúncios da página / 20)` (estimativa, não a contagem real do adapter).
- R4, mutantes mortos: (a) remover o `break` de `CatalogPagingError` em `fetchMasterCatalogs` faz o teste "falha de paginação NÃO repete o catálogo" falhar (2 chamadas em vez de 1); (b) trocar "primeiro vale" por "último vale" na deduplicação faz o teste do preço da 1ª página falhar (999999 em vez de 1003). Mutações feitas no próprio arquivo, com cópia e md5 conferido na restauração (8bdda7c9fec49d45df8533645ab9b2d1).

**Brecha em R3 e erro no summary (2ª rodada do QA), corrigidas.**
- `parseMeliCatalogPage` só trata `paging` undefined/null como ausente de fato. `paging` presente porém inválido (total string, só `total`, objeto vazio, tipo errado, NaN, negativo, não inteiro, offset/limit faltando) marca `pagingInvalid` e `fetchCatalogAllPages` falha com `paging-inconsistente`, com `results` vazio ou não. "Vazio sem paging" continua valendo só para paging ausente na 1ª página com zero itens brutos. Mutação (inválido tratado como ausente) morta por teste, md5 restaurado conferido.
- `sanitizeErrorForSummary`: redige `Bearer ...`, `access_token`, `refresh_token`, `client_secret`, `client_id`, `api_key`, `authorization` e `token` com valor ANTES de cortar em 200 caracteres (segredo no corte não vaza pela metade). Aplicada só no caminho por master: `lastError` de `fetchCatalogAllPages` e de `fetchMasterCatalogs`, e o `catch` externo de `processMasterTarget`. O legado (`fetchSnapshots`, `mercado-livre-auth.ts`, `processCatalogGroup`) não usa a função e ficou inalterado (teste de texto). Mutação (sem redação) morta por teste. O texto bruto do erro de auth segue indo ao `console.error` do próprio legado/auth, fora do summary.

**Pontos menores conhecidos (não corrigidos, aceitos para o piloto).**
- Master NÃO isento com catálogo de 2 ou mais páginas depende da folga do teto: sem folga, falha parcial por orçamento naquele ciclo (`mastersPartialByBudget`) e fica devido.
- O master isento pode consumir a folga e zerar a dos demais no ciclo (o custo dele é contado, nunca recusado).
- Páginas refeitas pelo isento no retry de `withExemptRetry` (quando herdou falha de orçamento alheia) são pagas de novo; o custo é contado, a cota extra é real.
- O orçamento é indexado só por `masterProductId` (sem rede). Latente: hoje só o Mercado Livre usa o caminho por master; ao entrar uma 2ª rede com o mesmo master, as chaves colidiriam.
- As partes novas de `collect-prices.ts` não têm teste executável (dependem de `server-only` e banco): `setExempt`, `admit`/`finally release`, contadores do summary (`catalogosAcimaDe100`, `catalogosVaziosSemPaging`, `paginationFailures`, `titleMultigetCallsEstimated`) e o `sanitizeErrorForSummary` no `catch`. Cobertas só por testes das funções puras e por teste de texto. O piloto de 72 h é a primeira execução real dessas partes.

**Verificação.** `scripts/test-collector-multicatalog.ts`: 93 testes ok (42 anteriores + 31 de paginação + 13 das ressalvas + 7 da brecha R3 e do erro no summary, com servidor simulado em memória). Demais suítes e `tsc` ok (ver relato). Não verificado: chamada real com `limit/offset` pelo adapter, execução de `collect-prices` ponta a ponta com banco, tempo de cron com paginação, teto máximo de `limit` da API.

## Retrospectiva
Preencher após o piloto e após o reprocesso: métrica atingida? falsos positivos? custo de cota e duração do cron? número real de masters multi-catálogo (369 ou 94)? causa do Zelda?

## Decisão 3 (2026-11-06): quarentena das ~51 ofertas oscilantes
Decidido pelo responsável: **não aplicar quarentena agora.** A correção da coleta por produto está em piloto de 72 h (Celeste PS4 e RE3); a quarentena esconderia a leitura do efeito. Reavaliar depois do piloto, com o resultado medido. Divergência registrada: o estrategista de mercado defendia a quarentena imediata.
Também em 2026-11-06 (autorização do responsável): `COLLECT_MASTER_GROUPING=1` e `COLLECT_MASTER_GROUPING_MASTERS` (2 ids) ligadas em produção; `PRICE_DAILY_SHADOW=1` ligada em produção. `PRICE_METRICS_V2` e `PRODUCT_CARD_V1` seguem desligadas.

## Reconciliação da contagem de masters multi-catálogo (2026-11-06, somente leitura)
Script `scripts/medir-masters-multicatalogo.ts`. Masters ML com 2 ou mais `external_ref` distintos, por definição: A) qualquer oferta/qualquer status: **369** (1.030 catálogos, máx. 21); B) só com vendedor: 134; C) com vendedor e active: 92; D) qualquer oferta active: 94; **E) com vendedor, active, fora de quarentena (o que a coleta por master realmente consolida): 91** (210 catálogos; distribuição 2 catálogos: 72, 3: 14, 4: 2, 5: 2, 6: 1). Os 369 incluem 277 masters cujo 2º catálogo só existe como placeholder ou oferta inativa. Base para a decisão 5: o universo operacional é 91, não 369.
