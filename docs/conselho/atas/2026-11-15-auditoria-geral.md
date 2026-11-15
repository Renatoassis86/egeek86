# Ata do Conselho Geek: auditoria geral (fila #64)

- **Data:** 2026-11-15
- **Porte:** grande (mudança em guias de negócio, plano de segurança e de dados de produção; nenhuma escrita em produção nesta rodada)
- **Presidente:** geek-lead
- **Convocados (painéis que auditaram):**
  - Painel 1, pedidos atendidos e mudanças causadas: `qa-verificador`, `guardiao-catalogo`, `gamer-veterano`.
  - Painel 2, vulnerabilidades no contexto do negócio: `seguranca-db`, `engenheiro-infra-sre`, `engenheiro-backend`.
  - Painel 3, modelo de negócio, eficácia e efetividade: `estrategista-mercado`, `cientista-precos`, `especialista-precos`, `estatistico-senior`, `pesquisador-benchmark`, `key-user-gamer`, `produtor-gamer-mundial`, `designer-marca`.
  - Painel 4, eficiência técnica: `engenheiro-software-principal`, `arquiteto-next`, `engenheiro-performance-web`, `engenheiro-coleta`, `dba-postgres`, `integrador-apis`, `bi-dataviz`.
- **Documentos:** `docs/auditoria-2026-11-15/00-sintese.md` (síntese e plano) e os painéis `01` a `04` na mesma pasta. Todos de leitura: SELECT em transação `read only`, `curl` público, `npm audit`, leitura de código; nada foi escrito em produção.

## Briefing
Pedido do dono (2026-11-15): "vamos ver o que temos na organização geral do modelo de negócio (atualize os documentos guias) e vamos ver o que ainda tem de vulnerabilidade... verifique eficiência, eficácia e efetividade". Quatro frentes: (1) todos os pedidos do dono foram atendidos e que mudanças causaram; (2) retrato real do modelo de negócio e atualização dos guias; (3) vulnerabilidades no contexto do negócio; (4) eficiência, eficácia e efetividade. Restrição: não alterar código de aplicação, scripts de produção nem `vercel.json`; só documentos e a fila.

Regras inegociáveis em jogo: nenhum dado fake; só produto novo e em linha; barreira nova só com aval do dono; foto real; sem itens miúdos; comissão prevista só no admin; pedido novo vai para a lista; nada inacabado; nenhum loop pode parar; gravação em massa só com dry-run, backup, log e rollback.

## Pareceres (rodada 1)
Resumo do que cada painel concluiu, com o dado que cada um disse faltar.

| Painel | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| 1 pedidos atendidos | 10 de 22 pedidos atendidos, 8 parciais, 2 em andamento, 2 não atendidos | fechar o que está parcial antes de abrir frente nova; gravar o motivo da quarentena; destravar os 275 masters de semeadura | estado das flags da Vercel (Sensitive); prova de que a mensagem de cupom encerrado carrega o nome |
| 2 vulnerabilidades | 0 críticas de segurança clássica, 8 altas, 9 médias, 6 baixas; as ameaças reais são perder a conta de afiliado, publicar preço errado, coleta parada sem aviso e perda do banco | P0: repositório privado, alertas, backup fora da máquina, transparência de afiliado, quarentena em lote, achar o segundo disparador, atualizar Next | plano e PITR do Supabase; regras do firewall; origem do segundo disparador |
| 3 modelo e efetividade | a máquina de dados é forte e o negócio está sem audiência (5 membros) e sem receita medida (0 conversões); 72% dos cliques são bots | medir receita e clique válido, captar inscritos, religar Amazon, Prime e cupom antes de 27/11 | taxa real de ML e Shopee; conversão real; custo por etapa; tráfego de origem |
| 4 eficiência técnica | o gargalo é a coleta (96% das execuções da Shopee esgotam o orçamento), não a web; 104 `running` presos; duas consultas somam 76% da carga do banco | reaper e orçamentos a 80%, materializar contagens, coleta por valor, CI, congelar ampliações de 20 a 30/11 | tráfego e cobrança reais; `EXPLAIN` das consultas pesadas (evitado fora do pico) |

## Divergências e réplica (rodada 2)
1. **`running` presos e disparador duplicado (painéis 2 e 4).** O painel 2 afirma que o banco não tem `pg_cron`/`pg_net` na lista de extensões e que há um agendador externo; o painel 4 viu sessões `pg_net`/`pg_cron scheduler` e um comentário de código sobre o job `geek-deals-collect-prices`. Resultado: as duas leituras convergem para "há um segundo disparador" e divergem na origem; a origem fica NÃO VERIFICADA e vai para a fila #73. As linhas `running` e o orçamento de tempo, que aparecem nos dois, foram unificados em #72.
2. **Contagens que diferem por hora de medição** (masters em `review` 319 x 356; dias abertos 719 x 541; aprovados em lote 1.489 x 3.391; ofertas ativas do ML 24.398 a 24.519). Resultado: usar a faixa e citar o painel; a síntese registra cada uma na seção 6.
3. **Aviso de comissão.** O painel 2 (A5) trata a falta de declaração como a falha de menor custo e maior impacto; o painel 1 (item 9) registra que o dono decidiu retirar o aviso das telas de compra. Resultado: a mitigação proposta não recoloca o aviso nos cards (seção "Como ganhamos dinheiro", rodapé, linha nas mensagens); a decisão de manter ou retirar nas páginas de produto fica do dono, que precisa saber do risco.
4. **Frescor.** O painel 1 aponta a contradição entre os "7 dias" do R2-3 e as "24 h" de 9c53d0e; vale 24 h para clicar e 7 dias para a série, a ser registrado no código (#109) e no Fluxo Mestre (R-56).
5. **Ritmo de expansão x capacidade de atualizar.** O painel 4 pede congelar `semear-vertical`, `ampliar-amostra-shopee` e `discover-*` de 20 a 30/11; o painel 1 e a regra do dono "banco cheio, barreira nova só com aval" tensionam com isso, e o painel 3 quer mais Prime e cupom (descoberta). Resultado: proposta de congelar só a ampliação de catálogo, não os laços de cupom e Prime; depende do dono (#88).

## Decisão (proposta ao dono; nada foi executado em produção)
Plano único em `docs/auditoria-2026-11-15/00-sintese.md` seção (d), gravado na fila como #69 a #110. Ordem:
1. **P0 até 19/11** (#69 a #86): repositório privado; alertas e sonda externa; backup fora da máquina; reaper de `running` e orçamentos; segundo disparador e `?key=`; transparência de afiliado; quarentena em lote e motivo gravado; Next, sharp e zod; importador de conversões, cliques válidos e captação de inscritos; Amazon fresca e loops; Prime e cupom; os 275 masters; rollout da home nova; exceção de firewall; `proxy.ts`.
2. **P1 até 27/11** (#87 a #105): materialização do banco, coleta por valor, pré-aquecimento, fila de mensagens e autovacuum, CI, segredos, pico de Black Friday, LGPD e termos, decisão sobre a raspagem da Amazon, verificação externa de preço, mix de mensagens, pureza do catálogo, foto com mão automática, WhatsApp, taxas reais, flags, painel de metas, atas, preço com voucher.
3. **P2 depois** (#106 a #110): scripts legados, hardening, retenção, refatoração, relatório de 6 h versionado.
4. **Guias atualizados nesta rodada:** `README.md`, `docs/PROJECT_BLUEPRINT.md`, `CLAUDE.md`, `AGENTS.md`, `agents/geek-lead.md`, `docs/03-metodologia/FLUXO_MESTRE.md` (v1.2, seção 14), `docs/03-metodologia/CONSELHO_GEEK.md`, `docs/plano-convivencia-frentes.md`, `docs/fila-de-execucao.md` (IDs únicos, estados reais, #69 a #110).

- Decisão do responsável do projeto: **pendente** (itens marcados DEPENDE DO DONO exigem resposta; os demais podem ser executados pelos agentes na ordem da fila, sem interromper o que está em andamento).

## O que fica de fora desta rodada
- Qualquer alteração de código de aplicação, de scripts de produção ou de `vercel.json` (restrição do pedido): todas as correções viraram linhas da fila.
- Magalu (#61), pausada pelo dono até fechar os pedidos abertos; entra só depois de 27/11.
- Loja de impressão 3D em três seções (#63) e o gráfico V2 (#49): continuam na fila sem prazo de pico.
- Refatoração do motor de mensagens e do porteiro (#109): só depois da Black Friday.
- Indicador de tendência da Black Friday (#10) e painel de custo: P2.
- Os guias de julho (`radiografia-plataforma.md`, `plano-metricas-regras-negocio.md`, `plano-data-science-e-analytics.md`) e os PDFs do Fluxo Mestre não foram reescritos: ficam como memória de época e entram na fila de arquivamento (P2); os PDFs devem ser regerados quando o dono aprovar a v1.2.
- Itens não verificáveis daqui (flags Sensitive, firewall, plano do Supabase, origem do segundo disparador, estado do `redesenho_home`, onde vive o relatório de 6 h): marcados NÃO VERIFICADO.

## Riscos
1. Conta de afiliado: Amazon pode encerrar o Associates por falta de declaração visível ou pela raspagem na conta logada; é perda total de comissão e histórico (R1 da síntese).
2. Repositório público: estratégia, tabela de comissão, backups de mensagens e e-mail pessoal expostos (R2).
3. Coleta e alertas parados sem aviso na Black Friday; Chrome é ponto único de falha (R3).
4. Perda do banco sem backup fora da máquina (R4).
5. Mensagem ou vitrine com preço/produto absurdo, destravado ou retrô; quarentena sem motivo gravado dificulta reverter (R7).
6. Negócio sem receita medida e com audiência de 5 pessoas: a Black Friday pode ser tecnicamente correta e comercialmente invisível (R9).
7. Regressão por mudar demais sem rede de proteção: 5+ deploys em Error e 57 de 89 testes sem entrada em `npm run` (R8).
8. Todas as quarentenas e aprovações em bloco são reversíveis só enquanto houver backup NDJSON e script de rollback; o backup está no repositório público (risco 2 agrava o 5).

## Perguntas ao dono (uma por vez, nesta ordem, com recomendação)
1. **Tornar o repositório GitHub privado agora?** Recomendação: sim; é um clique e remove o risco de estratégia e tabela de comissão públicas (#69).
2. **Criar o chat privado de alertas e liberar `COLLECTOR_ALERTS=1` e `TELEGRAM_ALERT_CHAT_ID`, mais a sonda externa?** Recomendação: sim (#70).
3. **Aprovar a mitigação de transparência sem aviso nos cards** (seção "Como ganhamos dinheiro", linha no rodapé, linha final nas mensagens)? Recomendação: sim; e ciência de que a retirada do aviso nas telas de compra segue um risco com a Amazon e o CONAR (#74).
4. **Aprovar o teto absoluto de preço por vertical e a quarentena em lote** (51 acima de R$ 30.000, 12 abaixo de R$ 5, 112 títulos de risco)? Recomendação: sim, com backup e rollback (#75); é barreira nova e só vale com o seu aval.
5. **Liberar a regra "master de semeadura com chave forte nasce aprovado" e esvaziar os 275 em `review`?** Recomendação: sim (#83).
6. **Confirmar plano e PITR do Supabase e abrir bucket privado para o `pg_dump` noturno?** (#71)
7. **Indicar quem (ou o quê) dispara o `collect-prices` fora da Vercel** (painel do Supabase, cron externo, agente seu) e autorizar desligar a duplicata (#73).
8. **Congelar a ampliação de catálogo de 20/11 a 30/11** para liberar cota e CPU à atualização do que já existe? Recomendação: sim, só `semear-vertical`, `ampliar-amostra-shopee` e `discover-*` (#88).
9. **Manter o Chrome sempre ligado** (repouso desativado, reabertura no logon do Windows) e criar as tarefas do rollout da home em 19, 21 e 22/11 (#81, #84).
10. **Decidir sobre a raspagem automática da Amazon na conta logada** (manter, reduzir ou migrar para API oficial) (#95), e se vamos captar inscritos com divulgação do canal no site e nos cartões (#80).

## Métrica de sucesso
Conferir em 19/11 (fim do P0) e 27/11 (Black Friday): repositório privado; alerta de prova recebido; `collect-prices` perto de 288 execuções/24 h; 0 `running` acima de `maxDuration`; `npm audit` sem crítica; `affiliate_conversions` > 0; Amazon com 70% das ofertas confirmadas em 24 h; inscritos acima de 5 e em crescimento (meta sugerida 500); 0 oferta pública fora da faixa de preço; rollout da home nova executado. Painel de metas em #103.

## Execução e verificação
- Executores desta rodada: geek-lead (síntese, guias, fila, ata) sobre os painéis de qa-verificador, guardiao-catalogo, gamer-veterano, seguranca-db, engenheiro-infra-sre, engenheiro-backend, painel 3 e painel 4. Números da síntese foram copiados dos painéis, nenhum foi inventado.
- QA: conferência cruzada de IDs da fila (sem duplicata; #66 a #68 renumerados), links entre documentos e consistência dos números. `qa-verificador` deve fechar a #64 depois da resposta do dono.

## Retrospectiva
Preencher em 19/11 (P0) e depois da Black Friday: quais itens P0 entraram, qual métrica se moveu, o que a auditoria deixou escapar.
