# Ata 2026-11-05: gráficos de preço e indicadores com dado real

**Porte:** médio. **Pedido do dono:** suspeita de que "Menor preço praticado" e "Média geral de mercado" não mostram a evolução real diária; usar os agentes para definir a melhor forma de construir gráficos e indicadores.
**Pareceres independentes (somente leitura):** cientista-dados-tempo-real, estatistico-senior, especialista-precos, bi-dataviz, qa-verificador.

## Veredito
O dono tem razão. Nenhum valor é inventado, mas as linhas não são medição diária e a tela não avisa disso.

## Achados (acordos entre os cinco pareceres)
1. **Três médias diferentes para o mesmo produto:** linha do gráfico (só ofertas ativas hoje, por cotação, filtro 2x, janela do seletor), selo "% abaixo da média" (histórico inteiro, inclui ofertas expiradas, filtros 35%/2x/3x) e a média do produto. Silent Hill 2: gráfico R$527,70 contra oficial R$390,91. Viola "um jogo, uma média".
2. **Peso por frequência de coleta:** média por cotação pondera a oferta coletada mais vezes. Mario vs. Donkey Kong: 26.403 de 26.914 cotações são de 3 ofertas já expiradas (R$397 a R$437); o selo "32,6% abaixo" é R$279,90 contra R$415,15 dessas ofertas mortas. Entre ofertas vivas a queda é ~10% sobre a mediana (R$310,30).
3. **Carry-forward sem prazo e sem sinalização:** NBA 2K21 não tem cotação de 29/09 a 31/10 (33 dias) e a linha fica plana em R$99,90 sustentada por oferta Shopee parada; Silent Hill 2 tem 28 de 30 dias com menor preço carregado de oferta sem coleta no dia.
4. **Reta entre pontos esparsos** (média de 3 pontos, R$100 a R$108) é composição de lojas, não tendência, e a trava de pouca amostra nunca dispara (carry-forward gera dezenas de pontos a partir de uma medição).
5. **"Menor do dia" não é o menor do dia:** o SQL guarda só a última cotação de cada oferta por balde; Switch 2 difere do mínimo observado em 26 de 31 dias.
6. **Passado reescrito:** só ofertas ativas hoje entram; oferta que expira some do gráfico inteiro (o "menor já visto R$49,90" não aparece no gráfico, mas aparece no selo).
7. **Último ponto sobrescrito** pelo preço atual sem rótulo; baldes em UTC divergem do dia de Brasília; eixo com piso fixo de R$5 exagera 8% de variação; rótulo do preço atual colide com o eixo; tooltip conta de amostra de 2.000.
8. **Regime de coleta mudou em 31/10** (oscilação de 250 a 800 registros/dia por produto até 30/10; depois 1 por oferta/dia). Histórico anterior não é comparável.
9. Não encontrado: interpolação numérica, cotação em quarentena entrando, oferta ativa sem coleta há mais de 7 dias hoje.

## Divergências e como foram resolvidas
- Linha de média: manter (cientista e estatístico, com nova definição) × tirar e mostrar só número/linha horizontal (preços e dataviz). **Síntese:** linha diária só com 3 ou mais ofertas no dia; média do produto vira linha horizontal e chip; mediana opcional.
- Janela de frescor N do carry-forward: 48 h (cientista/dataviz) × 7 dias (regra pública atual). **Pendente:** medir distribuição de idade do último registro por oferta antes de fixar; usar a regra pública de 7 dias como teto e 48 h para o tracejado.

## Decisão recomendada (plano em ordem)
1. **Definição única (ADR 0004, já aceita por delegação):** preço da oferta no dia = mediana das cotações da oferta no dia (fuso America/Sao_Paulo); média do dia = média simples entre ofertas ativas no dia (cada oferta pesa 1); menor do dia = mínimo das cotações brutas elegíveis do dia; mediana do dia de apoio. Mesmos filtros (quarentena, identidade, piso 35% da mediana, teto 3x) em gráfico, selo e cabeçalho.
2. **Tabela diária persistida** `price_daily_state` (produto, dia, menor, média, mediana, máximo, n_ofertas, n_cotações, cobertura, qualidade complete/partial/gap/legacy), recalculada para "hoje" a cada ciclo e congelada nos dias fechados; gráfico lê só dela (também resolve o custo de 100 mil+ linhas por consulta). Backfill só a partir de 31/10; antes marcado legacy. Escrita com backup, log e reversão.
3. **Registrar histórico de status da oferta** (ativa/inativa/quarentena por dia) para o passado deixar de ser reescrito.
4. **Gráfico:** menor preço em degraus só no trecho medido, tracejado cinza (35% opacidade) após o prazo de frescor, linha quebrada em lacuna; média diária só com N maior ou igual a 3 ofertas; faixa mínimo-máximo opcional (desligada no mobile); marcador só em medição real; marcador de queda; média do produto como linha horizontal; "menor já visto" com data e loja; chip "Agora R$ X, coleta há Yh" no lugar do rótulo sobre o eixo; eixo com folga proporcional e nota "eixo não começa em zero"; leitor fixo no mobile; estados de pouca amostra (0 a 1 medição: cartão sem gráfico; 2: pontos sem linha; histórico curto com selo; completo com 8 ou mais medições em 7 ou mais dias).
5. **Selo "abaixo da média":** mesmo conjunto da linha; exige 3 ofertas distintas, 5 oferta-dias e 14 dias; usar também menor dos últimos 30 dias como referência (padrão Omnibus) e percentil.
6. **Rodar em sombra** (cálculo novo ao lado do atual) para NBA 2K21 e Mario vs. Donkey Kong antes de ligar.
7. **Verificação:** qa-verificador com os 8 testes de aceite do parecer de dataviz e as 6 métricas do estatístico (selo e última média da linha diferem em no máximo 1 centavo; nenhum ponto com N menor que 3; passado não muda quando oferta expira).

## Fora do escopo agora
Faixa mín-máx no mobile, mediana como linha, backfill anterior a 31/10, histórico de preço por loja.

## Decisões que são do dono
- D1: adotar "uma oferta, um preço por dia" no cálculo da média (emenda ao texto "somatório de TODAS as cotações / total de cotações" do AGENTS.md; ADR 0004 já registra).
- D2: o selo e o gráfico passam a usar a mesma média (muda o que o usuário vê; o 32,6% do Mario vs. Donkey Kong cai para ~10%).
- D3: legado anterior a 31/10 fica oculto ou com aviso.

## Métrica de sucesso (a conferir após o ar)
Selo e última média da linha iguais em 100% dos produtos; zero ponto de média com N menor que 3; zero reta atravessando lacuna; nenhum dia fechado muda após expiração de oferta.

## Decisões do dono (2026-11-05, chat)
- D1 aprovada: cada oferta vale 1 por dia na média (AGENTS.md emendado).
- D2 aprovada: selo e gráfico usam o mesmo conjunto.
- D3 aprovada: dados anteriores a 31/10 aparecem com aviso "histórico antigo".
- **Regra nova do dono:** quando o menor preço do momento mudar, isso precisa ser apresentado. Consequência de desenho: além da tabela diária, grava-se um log de eventos `price_min_events` (produto, instante, menor preço, oferta/loja, preço anterior) sempre que o menor preço elegível muda; "Preço agora" mostra o valor vigente com horário da última mudança; o gráfico (inclusive 1D e 1S) desenha cada mudança como degrau no instante real; mudança de queda gera marcador.
- Execução: fase 1 (tabelas `price_daily_state` e `price_min_events`, cálculo em sombra, sem mudar o site), depois QA, depois topo/selo, depois gráfico.

## Execução fase 1 (2026-11-05, em SOMBRA; nada do site foi alterado)
Executor: engenheiro-backend. Nenhuma página, componente público ou cálculo atual foi tocado; nenhum deploy, nenhum commit. Tudo atrás de `PRICE_DAILY_SHADOW` (desligada por padrão).

### Definições finais (ajustes dos pareceres de estatística, matemática e preços)
- **Preço oferta-dia** = mediana (`percentile_disc(0.5)`) das cotações da oferta no dia civil de Brasília. Cada oferta vale 1, não importa quantas vezes foi coletada.
- **M_d** (média do dia, `avg_cents`) = média simples dos preços oferta-dia das ofertas elegíveis vigentes ao fim do dia. Carry-forward do último preço só dentro de 48 h (tau); passou disso a oferta sai do conjunto e n cai (sem imputação). Oferta expirada não é carregada. **Só com n >= 3**; com 1 a 2 ofertas grava mínimo e mediana, `avg_cents` NULL e `quality='partial'`; 0 ofertas frescas = `gap`; dia anterior a 31/10 = `legacy` (só contagem, nada recalculado, sem provar atividade).
- **Menor do dia** = mínimo das cotações brutas elegíveis do dia (se o mínimo bruto de uma oferta cai fora da faixa plausível, vale a mediana do dia dela). **Faixa plausível**: preço > 35% e <= 3x a mediana das ofertas frescas do dia (só com 3 ou mais ofertas; constantes de `price-verdict.ts`).
- `median_offer_day_cents` = mediana entre as ofertas do dia. `matched_change_pct` = variação das MESMAS ofertas entre dias consecutivos, M_C(t2)/M_C(t1) - 1 (Dutot encadeado). `composition_flag` = |efeito composição| > 50% de |M_d - M_(d-1)|, com M_d - M_(d-1) = [M_C(2) - M_C(1)] + composição.
- **Média do período** = soma dos preços oferta-dia / nº de oferta-dias (não a média das médias diárias); mediana de oferta-dia de 30 e 90 dias; percentil do preço agora na série de `min_cents` diários. Elegível a veredito: 3 ofertas distintas, 5 oferta-dias e 14 dias.
- **Eventos do menor preço**: cada mudança do menor preço elegível vigente (ofertas ativas, cotação <= 48 h, faixa plausível) grava `price_min_events` (instante, valor, valor anterior, oferta, rede, vendedor, origem `live`/`reconstructed`). Queda: instante da cotação; alta/expiração: instante da detecção. Gancho no `recordPriceSnapshot` (só com a flag, melhor esforço, nunca derruba a coleta) e fallback no job.
- Elegibilidade única: `src/lib/pricing/daily-state.ts` (números) + `src/server/pricing/eligibility-sql.ts` (quarentena, identidade, porteiro). Conferida contra o banco: 0 divergências com `offerIdentityVisibleSql` + `catalogGateVisibleSql` em 18.385 ofertas (13.170 elegíveis); 0 ofertas em quarentena elegíveis.

### O que foi feito
- Migration `0024_price_daily_state.sql` (+ `.rollback.sql`) APLICADA no banco: `price_daily_offer`, `price_daily_state`, `price_min_events`; RLS ligada e sem grant para anon/authenticated (conferido). Fora do `_journal.json`, como 0019-0023. Aplicador: `scripts/apply-price-daily.ts`.
- Backfill reversível aplicado (`scripts/backfill-price-daily.ts`): transação REPEATABLE READ única; o dry-run prévio (transação desfeita) deu números equivalentes.
- Job `src/server/jobs/refresh-price-daily.ts`, rota `?part=daily` em `/api/cron/refresh-snapshots` (responde "desligada" sem a flag) e cron novo em `vercel.json` (`9-59/15`, com offset dos de `stats` e `showcase`).

### Números medidos
- Backfill: 44.607 linhas `price_daily_offer` (24/10 a 05/11), 2.823 produtos com cotação medida; `price_daily_state` 38.185 linhas (4.229 complete, 4.843 partial, 7 gap, 29.106 legacy); 9.914 eventos reconstruídos (1.698 baseline, 4.046 quedas, 4.170 altas). Duração 595 s (a maior parte são os lotes de reconstrução).
- Job (1 ciclo, hoje): **24 s** (24,1 s e 23,3 s em duas execuções seguidas), 2.755 produtos, 1.635 estados do dia; segunda execução idempotente (0 eventos novos). O ciclo do `stats` é ~106 s, então o job ficou em cron próprio, e não somado ao mesmo. O primeiro ciclo após a meia-noite fecha o dia anterior e deve levar mais (não medido).
- Testes: `scripts/test-daily-state.ts` 48 verificações OK; `scripts/test-daily-state-db.ts` 17 OK (equivalência da elegibilidade, invariantes das tabelas, 200 oferta-dias sorteadas conferidas contra o bruto: 0 divergentes); `npx tsc --noEmit` limpo; `npm run build` OK; test-dimensions, test-gate, test-identity, test-shopee OK. **`test-discover-policy` tem 1 falha (caso "review do porteiro: bornAs", esperado review, obtido approved) em código que esta rodada não tocou; não investigada.**

### Como reverter
- Dados do backfill: `npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-price-daily.ts --revert backup/dados/price-daily-backfill-log-2026-11-05T03-03-48-121Z.json` (apaga oferta-dia de 24/10 em diante, todo o estado diário e os eventos reconstruídos; cotações e ofertas não são tocadas). A reversão NÃO foi executada no banco real.
- Tabelas: `scripts/apply-price-daily.ts --rollback` (DROP das três, derivadas).
- Desligar: não ligar `PRICE_DAILY_SHADOW` (gancho e job não rodam) e remover a linha do cron. Backup de `affiliate_offers` anterior à aplicação: `backup/dados/affiliate_offers-pre-price-daily-2026-11-05T02-53-09-901Z.ndjson`.

### Comparação em sombra (`docs/comparacao-metricas-sombra-2026-11-05.csv`, valores em centavos)
Conferido contra o esperado do estatístico: Mario vs. Donkey Kong, agora R$ 279,90 contra mediana vigente R$ 310,30 = **-9,8%** (o selo atual mostra -32,6% contra a média por cotação de R$ 415,10); NBA 2K21, R$ 99,00 contra R$ 99,45 = **-0,5%**. Silent Hill 2: média oficial R$ 390,91, média do gráfico R$ 477,54, nova (30 dias, oferta-dia) R$ 402,48. Switch 2: agora R$ 3.095,74 contra mediana vigente R$ 4.347,50 (-28,8%). Os quatro têm só 6 dias de regime novo, então o veredito proposto é "histórico curto" até completar 14 dias (o site hoje já emite veredito).
- **Divergência Estatístico (R$ 4.453,21) x DBA (R$ 5.009,88) no Switch 2:** mecanismo identificado. Hoje, o "último preço do dia por oferta" dá R$ 5.855,26 sem filtro algum e R$ 4.438,28 a R$ 4.438,36 com a faixa plausível, com o filtro 2x ou só com a elegibilidade. A diferença vem de UMA oferta de ~R$ 447 mil (7 oferta-dias), hoje em quarentena (migration 0023, de 03/11, posterior às duas medições de 01/11). O Estatístico media com filtro de outlier; o DBA, sem. Os números exatos de 01/11 não foram reproduzidos (dados e filtros mudaram depois): a explicação é por mecanismo e ordem de grandeza, não por igualdade de centavos.
- Diferença a decidir: o "menor de 90 dias/sempre" novo (bruto elegível, faixa pela mediana VIGENTE, sem excluir vendedor fraco) pode ficar abaixo do atual, que usa piso de 35% da mediana de TODAS as cotações e exclui vendedor fraco (Mario vs. DK: R$ 133,42 contra R$ 169,90). Pendente: qual referência de faixa e se vendedor fraco entra no "menor de sempre".

### Riscos e pendências
- Dia fechado usa o status ATUAL das ofertas (não há histórico de status): oferta que expira depois do fechamento pode não ser carregada em recálculo de backfill; no job ao vivo o fechamento ocorre no primeiro ciclo após a meia-noite. O histórico de status da oferta (item 3 do plano) continua pendente.
- Não verificado: tempo do ciclo de fechamento de dia no cron real; tempo do gancho da coleta em produção; comportamento do cron na Vercel (nada foi para o ar).
- Produto sem oferta na janela de 7 dias não tem linha (a ausência é a lacuna); só 7 linhas `gap` existem.
- Fases 2 (topo/selo) e 3 (gráfico) não iniciadas; a emenda do `AGENTS.md` ("cada oferta vale 1 por dia") fica para quando a leitura for ligada.
