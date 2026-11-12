# Ata do Conselho Geek: atualização do Guia Mestre (v1.1) e execução da autorização do dono sobre a seção 9

- **Data:** 2026-11-12
- **Porte:** médio
- **Presidente:** geek-lead
- **Convocados:** o presidente fez a triagem e a conferência contra o código e o `vercel.json`; o `qa-verificador` verifica antes da conclusão (relatório ao final do commit). Sem veto: nenhuma regra inegociável foi tocada.

## Briefing
O dono autorizou no chat (2026-11-12): "Aprovo o que tiver ainda de aprovar. Pode seguir com a execução. Aproveite e atualize a nossa arquitetura no guia mestre caso alguma coisa ainda esteja defasada. Ao final me dê os links." O coordenador delimitou: executar as 14 decisões da seção 9 do `FLUXO_MESTRE.md` pela opção recomendada, **só se reversível, sem parar laços nem mudar cadência ou cota de forma arriscada**; `vercel.json` só por `JSON.parse`/`JSON.stringify`; o que for irreversível ou de negócio fica pendente.

## Parecer do presidente (conferido contra o código, não estimado)
1. **Defasagens achadas na v1.0**: contagem de crons (19 contra 21 no `vercel.json`); `cobertura-shopee` dada como "fora do `vercel.json`"; `aprovacao-auto`, link curto `/g`, canal Destaques e loop de promoções da Amazon sem nó; régua descrita só como 10% na tabela de nós; `/admin/fluxo` dito "não implementado"; migrations 0048 e 0050 sem estado; FM-22, FM-29, FM-16 e FM-31 com estado antigo; incidentes do dia sem registro; SLOs sem envio/hora, régua e jobs novos.
2. **Estado do loop de promoções da Amazon** (agente ainda finalizando): verificado no repositório. Os arquivos `public/loops/amazon-promocoes.js`, `scripts/chrome/amazon-promocoes.js`, `scripts/test-amazon-promocoes.ts`, `src/app/api/ingest/amazon-promocoes/`, `src/lib/coupons/amazon-promocoes.ts` e `src/server/coupons/amazon-promocoes.ts` estão não commitados, e `src/server/messaging/coupon-lookup.ts` está modificado e não commitado. Esta atualização **não os commita** (pertencem ao agente de cupons) e o guia os descreve como "em construção, não no ar" (N65, FM-52).
3. **Não foi lido na Vercel** o valor de `GROUP_REGUA_LOJAS` etc.; o escopo "7 lojas" vem do operador e fica registrado como NÃO VERIFICADO (FM-53).

## Decisões executadas (autorização do dono, só o reversível)
| # | Decisão | Resultado |
|---|---|---|
| 2 | `/inteligencia-gamer` fora do menu | **Executada em parte**: item "Observatório Gamer" removido de `app-header.tsx` e de `mobile-nav-drawer.tsx` (imports órfãos limpos); `tsc --noEmit` limpo. Reverter: `git revert` do commit. Resta a seção da home e a rota (FM-51, fila #23) |
| 6 | "Afiliado" para "Divulgador" | **Já estava feita** (8238927); conferida na interface; FM-22 resolvida |
| 11 | Ordem da fila de links | **Mantida** (sem dado de comissão para inverter) |
| 12 | Black Friday x P0 do dono | **Adotada**: #3 e #4 já prontos; CI completo, retenção e higiene depois de 30/11; núcleo do pre-push adiantado |
| 14 | Resumo diário x cupom | **Mantida** a ordem alerta > resumo > cupom |

## Decisões que ficam PENDENTES, com o motivo
1. **Reputação baixa na média**: muda o dado público e exige backfill; não é só reversível por flag.
3. **Reescalonar crons 0/30 e disparador duplicado**: muda cadência de produção; antes, inventário do disparador (fila #17). O `vercel.json` não foi alterado, portanto não houve risco de JSON inválido.
4. **Travas do banco**: `ALTER ROLE` em produção, depois de #17 e de medida.
5. **Backlog de coleta**: decisão de negócio e de cota.
7. **Meta de esvaziamento da fila do dono**: é do dono. Ferramentas prontas; `aprovacao-liberar-tudo.ts --apply` exige ordem dada por ele mesmo e não foi rodado.
8. **Retidas e propostas**: rejeitar em lote é decisão de negócio.
9. **Cupom 3 a 6 h, política do cartão, Achado acima de 3 h**: muda a cadência das mensagens.
10. **Shopee fora de games**: a cobertura já está agendada (905e499). `ampliar-amostra-shopee`, `discover-shopee-esporte` e `import-shopee-conversions` ficam pendentes: a rota de conversões diz no próprio código que só se agenda depois de validar credenciais e a migration 0021 (ninguém verificou) e a cobertura ainda está em medida de 10030 por 7 dias.
13. **Metodologia (FM-48)**: muda o que o público vê como verdade; reprocesso exige ata.
- Pendência de ação do dono já registrada na ata da régua: criar o canal Destaques e adicionar o bot (`TELEGRAM_DESTAQUES_CHAT_ID`).

## Ponta nova achada na conferência
- **FM-50**: `cobertura-shopee` (`22,52`) e `aprovacao-auto` (`12-52/10`) disparam juntos nos minutos 22 e 52. Registrada, sem mudança de cadência (R-41 exige ata e medida).

## Entregas
`docs/03-metodologia/FLUXO_MESTRE.md` v1.1 (N61 a N65, Q20, R-46, D-14 a D-16, seção 9.1, FM-50 a FM-53, incidentes, SLOs); adendos em `docs/fluxo-mestre/01`, `02` e `06`; `docs/fluxo-mestre/visual/gerar-fluxo-visual.mjs` com a página 11; `docs/fila-de-execucao.md` (#37 e estados); `FLUXO_MESTRE.pdf` e `FLUXO_VISUAL.pdf` regenerados.

## Métrica de sucesso
Nenhuma afirmação do guia sem lastro: cada item tem commit, arquivo ou ata de origem, ou a marca NÃO VERIFICADO. Site 200 e deploy Ready depois do push.

## Retrospectiva
Preencher quando o dono responder as decisões pendentes (fila #37).
