# Ata do Conselho Geek: Fluxo Mestre (consolidação dos 6 capítulos)

- **Data:** 2026-11-12
- **Porte:** médio (documento de governança que vira regra imperativa; nenhuma mudança de código, dado, cron, loop ou aba)
- **Presidente:** geek-lead
- **Convocados:** mesa fixa (`estrategista-mercado`, `especialista-precos`, `gamer-veterano`, `qa-verificador`) mais tema (`dba-postgres`, `engenheiro-infra-sre`, `estatistico-senior`, `seguranca-db`). Pareceres independentes, em paralelo, somente leitura.

## Briefing
**Objetivo:** consolidar os capítulos de `docs/fluxo-mestre/01..06` num fluxo organizacional único (`docs/03-metodologia/FLUXO_MESTRE.md`): nós, filas, pilhas, precedência entre recursos, regras imperativas R-xx, hierarquia, automações, SLOs e um registro único de pontas soltas ligado à fila de execução.
**Regras inegociáveis em jogo:** dado real (R-01), só API oficial (R-02), um jogo uma média (R-13, R-17), só produto novo e em linha (R-10), nada destrutivo sem autorização.
**Pergunta a decidir:** a consolidação está correta, sem contradição e sem pontas soltas sem dono? Qual regra prevalece onde os capítulos divergem?

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estrategista-mercado | aprova com ressalvas | falta métrica de negócio; priorizar a Black Friday (#8 links de games, #13, #14, #7, #26, FM-42) e congelar #24, #29, #4, #3, #31 até depois de 30/11; FM-35 e FM-42 para Alta | comissão e cliques por loja em 30 dias; quanto das 8.486 ofertas de games sem link tem gatilho |
| especialista-precos | aprova com ressalvas | criar R-17b (nenhum selo ou "%" fora do `price_daily_state`); `/black-friday` só com preço, mínimo e data até FM-01 fechar; alinhar R-19 e R-23; mínimo fora da faixa vira "em revisão"; promover a âncora pré-Black a regra | valores de `PRICE_METRICS_V2` e `PRICE_AMAZON_MODE` no app; paridade das duas médias; quantos produtos da BF têm 5+ ofertas |
| gamer-veterano | aprova com ressalvas | cupom no máximo 1 vez por 4 a 6 h; sem cartão, não envia; tirar `/inteligencia-gamer` do menu já; travar as 3 proibições em `BANNED` antes de tudo; lista versionada de "em linha" | saída de inscritos por frequência de cupom; cliques por gatilho |
| qa-verificador | aprova com ressalvas | criar as tarefas #13 a #31 na fila com critério numérico; corrigir FM-14 ausente, a referência errada FM-32 no N09 e a ata citada; reescrever as altas no modelo "consulta X retorna 0" | valores das flags; origem do disparo duplicado; medida inicial de FM-07, FM-13, FM-18 |
| dba-postgres | favorável com condições | FM-07 e FM-03 antes de qualquer carga nova; ALTER ROLE com `RESET` documentado e dry-run de R-38; retenção em duas etapas (medir, arquivar em faixas); 0045/0048 em dry-run com `lock_timeout` 5 s; journal do drizzle diverge | pico de conexões e nº de instâncias da Vercel; índice `(day, closed)`; se o plano permite papel dedicado |
| engenheiro-infra-sre | ordem quase certa | núcleo do pre-push (JSON.parse + numeração) antes de #17/#18; #16 depois de #17, em 60 s e depois 30 s; #18 começa por `collector-health` em 12/42; a escada não é executável sem flag por cron | valores de `COLLECTOR_ALERTS`/destino/`PRICE_METRICS_V2`; agendador do 2º disparo; estado do vigia |
| estatistico-senior | favorável com ressalvas | escada R-19 com ordem de rigor invertida (veredito 3, texto 5); faixa 0,35x a 3x frágil com N=3; `percentile_disc` viesa para baixo em dia par; carry-forward infla N; janela de 30 dias da BF é de ~27 dias; efeito composição | paridade das médias; fração de oferta-dias carregados; distribuição de N |
| seguranca-db | concorda, nada bloqueante | R-40 e R-03 primeiro; teste que varre `admin/**/page.tsx`; `.gitignore` para `--out` e builds; rota de limpeza de transações só com Bearer, dry-run, papel restrito; ALTER ROLE só no papel certo | RLS de `system_config`; quem chama o job pg_net com `?key=`; segredo embutido em `public/loops` |

Conferências do qa-verificador contra o código: 11 afirmações amostradas conferem (19 crons, cadências, `maxDuration`, `SEND_BUDGET_MS` 38.000, ADR 0004 e 0010, `BANNED`, nomes de flags, `?key=` em `discover-shopee-esporte`); a segurança conferiu no código `?key=` com `===`, 6 páginas admin sem `requireAdmin`, CORS `*` em `/loops`, token ML em `system_config` e o arquivo `--out` (546 linhas, sem segredo; risco é commit acidental).

## Divergências e réplica
| # | Divergência | Quem | Resultado nesta ata |
|---|---|---|---|
| 1 | Congelar o escopo até 27/11 e empurrar `/admin/fluxo` (#4), PDF (#3), CI completo (#24), retenção (#29) e higiene (#31) para depois de 30/11 **contra** #3 e #4 serem pedidos P0 do dono | estrategista-mercado × pedido do dono | **Não resolvida; vai ao dono** (FLUXO_MESTRE §9, item 12). Nada foi adiado. O núcleo barato do pre-push foi adiantado por pedido do SRE |
| 2 | Inverter a fila de links (games antes de Plus até 27/11; hipótese sem dado de comissão) **contra** a decisão do dono de 2026-11-12 (Plus primeiro) | estrategista-mercado × decisão do dono | **Vai ao dono** (§9, item 11). Mantida a decisão vigente |
| 3 | Veredito com 5 ofertas e carry-forward fora da contagem (estatístico) **contra** a escada vigente 3/5/14 e o carry-forward da ADR 0004 | estatistico-senior × código e ADR | **Vai ao dono e ao cientista-precos** (tarefa #32, FM-48). A escada vigente continua valendo; a divergência é registrada, não escondida |
| 4 | Rebaixar o resumo diário abaixo de cupom e insight | gamer-veterano × ordem de classe vigente | **Vai ao dono** (§9, item 14). Ordem mantida |
| 5 | `/black-friday` sem selo até FM-01 fechar (especialista-precos) **contra** a urgência de mostrar quedas na Black Friday (estrategista) | especialista-precos × estrategista | Convergem na solução (migrar para a V2 antes de 26/11, #14). Interino é decisão do dono (§9, item 2). R-17b registrada como regra |
| 6 | Quando aplicar as travas do banco: DBA aprova já; SRE quer depois de resolver o disparador duplicado e em duas etapas | dba-postgres × engenheiro-infra-sre | **Resolvida a favor do SRE**: #16 depois de #17, 60 s e depois 30 s, `lock_timeout` só após medir o `daily` (o DBA registrou o risco de o `daily` falhar sob `lock_timeout`, que corrobora a etapa) |
| 7 | R-19 contra R-23 (texto com "%" com 3 ou 5 ofertas, também na formação) | especialista-precos | **Resolvida por redação**: R-23 passou a dizer que todo texto com "%" segue R-19 e que a formação não leva "%" |
| 8 | FM-35 (links) e FM-42 (retidas/propostas) como Alta | estrategista, gamer | FM-35 reclassificada para **Alta**; FM-42 mantida Média com decisão pendente do dono (documento de gamer e estrategista a favor de elevar; sem dado de receita para decidir) |

## Decisão
Plano aprovado pelo geek-lead, dentro do que cabe ao Conselho (consultivo):

1. **`FLUXO_MESTRE.md` v1.0 publicado** com as correções dos pareceres: R-17b nova; R-19, R-23 e R-03 reescritas; FM-14 (escada sem mecanismo executável), FM-48 (metodologia estatística) e FM-49 (lista versionada de "em linha") criadas; FM-35 reclassificada; referência errada do N09 corrigida (FM-27); itens NÃO VERIFICADOS novos (instâncias da Vercel, RLS de `system_config`, `COLLECTOR_RUNS`, carry-forward).
2. **Fila de execução** (`docs/fila-de-execucao.md`): item #1 pronto; #2 em verificação; #6 decomposta em **#13 a #32**, cada uma com dono e critério de pronto medível, e as regras de ordem de dependência (#13 antes de #14; #17 antes de #16, #18 e #20; #15 antes de #29).
3. **Prevalece** (FLUXO_MESTRE §8): média oferta-dia sobre a legada (D-01); frescor em camadas, o mais estrito vale para o que se envia (D-02); regra do dono sobre o código para o cartão (D-03); `vercel.json` sobre comentários (D-04); medido sobre estimado (D-05, D-06); três indicadores nomeados para "links pendentes" (D-07).
4. **Fica de fora:** qualquer execução das pontas soltas (nenhum código, dado, cron, loop, aba ou `vercel.json` foi tocado); decisão sobre a escada estatística; reescalonamento dos crons.
5. **Memória e lei:** regra imperativa gravada em `memory/fluxo-mestre-regra-imperativa.md` e referência em `CLAUDE.md` (seção Orquestração): FLUXO_MESTRE.md é a lei de convivência dos processos.

- **Decisão do responsável do projeto:** pendente nos itens 1 a 14 da seção 9 do `FLUXO_MESTRE.md` (uma pergunta por vez, na ordem de impacto). O plano de documentação acima é reversível e não altera produção.

## Métrica de sucesso
- 100% das pontas Alta com id de fila existente, dono e critério verificável (conferido por grep: seção 10 do FLUXO_MESTRE contra a fila).
- Zero contradição entre capítulos sem regra de prevalência (seção 8).
- Em 26/11: #14, #15, #19, #21 e #23 concluídas ou decididas pelo dono; `/black-friday` lendo só `price_daily_state`.
- Cada ponta fechada mostra a medida de prova na ata do dia.

## Execução e verificação
- **Executores:** geek-lead (documento, fila, ata, memória); 8 membros do Conselho (pareceres, somente leitura).
- **QA:** o `qa-verificador` emitiu parecer sobre a consolidação (11 afirmações conferidas; apontou ids de fila inexistentes, FM-14 ausente e referência errada, todos corrigidos). A tarefa #2 fica em **verificação** até o `qa-verificador` rever a versão final e a publicação (`vercel ls` Ready).

## Retrospectiva
A preencher após as tarefas #13 a #24 e a decisão do dono sobre a seção 9.
