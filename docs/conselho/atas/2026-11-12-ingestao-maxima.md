# Ata do Conselho Geek, 2026-11-12: ingestão máxima (Amazon e Shopee), produto único bem-vindo

Porte: médio. Presidente: geek-lead. Mesa: engenheiro-coleta, integrador-apis, guardiao-catalogo, dba-postgres (pareceres independentes, só leitura); qa-verificador na verificação final.

## Pedido do dono (2026-11-12)
Conferir se Amazon e Shopee aumentaram a ingestão e o fluxo para os grupos; produto único (poucas ofertas no banco) não é motivo para não trazer: trazer, aprovar e passar a monitorar. Diversificação por loja, máximo de produtos.

## Medição de partida (banco, 2026-11-12 ~20h UTC)
- Amazon, ofertas novas por hora: 2 a 63/h até 15h UTC; 286, 338, 301 nas 16h, 17h e 18h UTC (vitrine); 100 e 42 nas horas seguintes. 485 rascunhos, 1.420 ativas.
- Shopee: ativas 3.145; nenhum master criado pela cobertura (`attributes.shopeeCriacao`: 0). A cobertura por categoria só rodou 5 vezes em dry-run (10h15 UTC), com 1 erro 10030 e 2 erros 10000. Não estava no `vercel.json`.
- Fila de cartões pendentes: 641 identidade sem origem, 67 plus, 63 amazon_cobertura, 49 mídia, 20 modelo, 4 armazenamento, 1 preço.
- Banco: 19 a 28 conexões de 60; nenhuma transação > 30 s.

## Pareceres (resumo)
- **engenheiro-coleta**: agendar 1 a 2 vezes por hora, `pages=3 maxCalls≈60 maxMasters=10` e subir após 3 execuções sem 10030; minuto livre (12 mod 15 está livre); `ehLojaPlus` não barra nada; `MAX_POR_MASTER` só vale para master existente; chave fraca vai sempre para a fila (intencional); **bug**: o cursor avançava antes de processar a página e gravava mesmo após erro no meio; sem pausa após 10030; concorrência entre execuções poderia duplicar master (mitigada por dedup por execução + cadência).
- **integrador-apis**: único limite oficial é 8000 chamadas/h; o 10030 na 5ª chamada indica limite oculto de rajada; o contador do teto da cobertura não enxerga o `collect-shopee`; recomenda 25 a 30 chamadas/h no início, pausa de 60 min após 10030, tratar 10000 como transitório. Nada viola os termos (só `productOfferV2`).
- **guardiao-catalogo**: o freio de "produto único" estava em `escopo-compra.ts` R3 (sinal de demanda: 3 ofertas ou 2 vendedores) e, na Shopee, no master nascer sempre em `review`; o gate (`gate.ts`) e `aprovacao-nicho.ts` não exigem número de ofertas; não existe hoje checagem de reputação do vendedor nem lista Hyperkin/Analogue/Retro-Bit/8BitDo (precisa de dado novo); condições seguras de auto-aprovação listadas; manter mídia, modelo, armazenamento e preço com o dono.
- **dba-postgres**: migration 0048 segura (DDL de catálogo, 32 mil linhas, `lock_timeout 5s`); consultas de carga medidas em 5 a 40 ms; aprovação com uma transação curta por cartão, lote de 50 a 60, sem paralelismo; cobertura limitada pela cota da API, não pelo Postgres.

## Decisões (consultivas; executadas dentro da autorização do dono)
1. **Shopee**: cobertura por categoria agendada com `apply=1` no `vercel.json` às :22 e :52 (cada 30 min), `pages=3 maxCalls=45 maxDuvidas=15 maxMasters=12` (cerca de 90 chamadas/h, 1,1% das 8000/h; teto da própria rota 800/h). Pausa de 45 min após 10030 (`system_config.cobertura_shopee_pausa_ate`). Cursor não avança em página interrompida. Master novo com chave forte e porteiro/escopo aprovável nasce **aprovado** (`approvedBy auto:shopee-cobertura`, `previousVerdict review`), mesmo com uma só oferta; chave fraca continua na fila (dúvida de identidade). Reversão: `?rollback=<run_id>&apply=1` (ou `desfazerCobertura` por script).
2. **Migration 0048** aplicada (3 colunas anuláveis em `affiliate_offers`) com retrato do esquema em `docs/backups/migration-0048-esquema-antes-*.json` e rollback pronto; `SHOPEE_VARIANTE_COLUNAS=1` ligado na Vercel.
3. **Produto único**: R3 do escopo de compra aposentada (sem mínimo de ofertas ou vendedores); teste atualizado. Piso de preço (R2) e anomalia (R5) permanecem.
4. **Aprovação contínua**: rota `/api/cron/aprovacao-auto` a cada 10 min (:12, :22, ...), lote 60, uma transação curta por cartão via `decidir()`, só Amazon e só motivos produto novo, rascunho, cobertura e fronteira; guarda extra (`auto-guarda.ts`): sem preço, jogo sem plataforma, retro-estilo sem Hyperkin/Analogue/Retro-Bit/8BitDo, preço fora de 0,35x a 3x da média quando há 3+ referências. Mídia, modelo, armazenamento e preço seguem com o dono. Chave de desligamento: `APROVACAO_AUTO=off`. Reversão: desfazer pelo histórico de `/admin/aprovacao` (decisionIds no `collector_runs.meta` do job `aprovacao-auto`).
5. Não alterados: régua e fila de mensagens (`group-*.ts`), loops do Chrome, o script `aprovacao-liberar-tudo.ts` em execução.

## Riscos aceitos e pontas abertas
- Reputação do vendedor: não há fonte nos cartões Amazon; fica como dependência do dono (decidir se quer o dado).
- Média pública com n=1: o produto único aparece, mas o veredito de queda continua exigindo 5 ofertas (`MIN_OFERTAS_QUEDA`).
- Shopee chave fraca (só título, sem marca conhecida+modelo): segue para a fila; aceitar marca-apenas é decisão do dono.
- Limite oculto de rajada da Shopee: monitorar 10030 por 7 dias antes de subir `maxCalls`.
- A chamada de dry-run em produção exige `TESTE_LOJA_KEY`/`CRON_SECRET` (variáveis sensíveis, não legíveis da máquina de desenvolvimento): a primeira execução com `apply=1` é a do cron, acompanhada em `collector_runs`.
