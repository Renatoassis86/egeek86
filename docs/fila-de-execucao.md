# Fila de execução de tarefas (viva) — desde 2026-11-12

Regra do dono: **nada fica inacabado**. Uma tarefa só sai da fila quando cumpre o critério de pronto. Prioridade manda: P0 antes de P1, e assim por diante. Esta fila é lida em todo relatório de 10 minutos.

## Regras da fila
1. **Limite de trabalho em andamento (WIP):** até concluir o P0, nenhuma frente nova abre. Pedido novo do dono entra na fila com prioridade e só fura a fila se o dono disser "urgente".
2. **Pronto = critério verificável** (documento no repositório, código no ar com `vercel ls` Ready, medida no banco, ata gravada). Sem isso a tarefa continua "em andamento".
3. **Estados:** `fila` > `em andamento` > `verificação` (qa-verificador) > `pronto`. Bloqueada fica `bloqueada` com o motivo e o que a destrava.
4. **Um dono por tarefa** (agente ou eu). Agente que termina entrega relatório e a tarefa vai a `verificação`; quem consolida fecha.
5. **Frentes que nunca param** (loops, vigia, crons) não entram na fila: são infraestrutura (ver Plano de convivência).
6. **Reconciliação:** a cada relatório, conferir a fila contra o estado real; item `em andamento` sem avanço em 2 relatórios vira alerta.

## Fila
| # | Prio | Tarefa | Dono | Estado | Critério de pronto |
|---|---|---|---|---|---|
| 1 | P0 | **Fluxo Mestre**: capítulos 1 a 6 | 6 agentes (coleta, catálogo, preços, backend, arquiteto Next, SRE) | cap. 1, 2, 3, 5 e 6 prontos; 4 em andamento | 6 arquivos em `docs/fluxo-mestre/` com pontas soltas e `NÃO VERIFICADO` marcados |
| 2 | P0 | Fluxo Mestre: documento consolidado, ata do Conselho, regra imperativa na memória do projeto | eu (geek-lead) | fila (depende de #1) | `docs/03-metodologia/FLUXO_MESTRE.md` + ata em `docs/conselho/atas/` + memória gravada |
| 3 | P0 | Fluxo Mestre: PDF | eu | fila (depende de #2) | PDF gerado em `docs/fluxo-mestre/` e enviado ao dono |
| 4 | P0 | Página `/admin/fluxo` (fluxo ao vivo: nós, filas, jobs, alertas, regras) | engenheiro-frontend + arquiteto-next | **feito (2026-11-12)**: `/admin/fluxo` + `GET /api/admin/fluxo` (checagem admin na página e na rota), 5 blocos, auto-refresh 45 s, cache 15 s; menu 'Fluxo ao vivo'; PENDENTE: alinhar nomes de nós com `FLUXO_MESTRE.md` quando existir | página no ar, só admin, lendo `collector_runs`, filas e esta fila; `vercel ls` Ready |
| 5 | P1 | Black Friday: ata, retrô-estilo novo (SupaBoy), vitrine por loja da Amazon (Plano 2), modo cupons/promoções da Amazon | fork da Black Friday | **parcial (2026-11-12)**: no ar `/black-friday` e fila de atualização com quentes (a304476); ata gravada; exceção retrô-novo + vitrine por loja (modo opt-in `vitrine`) + testes tsx 21/21 commitados; PENDENTE: ligar o modo vitrine no vigia (`modos` com `vitrine`, 1º `enviar:false`), cadastro real do SupaBoy (sai com a consulta 'hyperkin' quando ligar), modo cupons/promoções (fila) | ata gravada; vitrine e cupons lendo no ar; SupaBoy cadastrado; testes tsx |
| 6 | P1 | Pontas soltas graves dos capítulos: duas médias no site (stats antigo vs oferta-dia), 99 dias de estado abertos, colisões de cron (minutos 0/30), cron aceitando `?key=` na URL | a definir após #1 | fila | cada ponta com correção aplicada e medida |
| 7 | P2 | Cupons: confirmar mensagem CUPOM com nome/"Como usar" no ar; loop de cupons da Shopee | agente-cupons | fila | mensagem real enviada com nome; loop Shopee rodando |
| 8 | P2 | Mercado Livre: links meli.la até zerar (hoje ~10,3 mil pendentes); resolver 1.476 só com URL de catálogo (/p/MLB) via API oficial | loop + engenheiro-coleta | em andamento (loop rodando) | pendentes = 0 |
| 9 | P2 | Shopee: migration 0048 (+ flag), cobertura por loja em dry-run, coleta Plus por cron | engenheiro-coleta | fila | tabelas aplicadas, cobertura medida, cron ligado |
| 10 | P2 | Indicador de tendência da Black Friday (queda real, ≥5 ofertas) | cientista-precos | fila | indicador no ar na `/black-friday` e nas mensagens |
| 11 | P3 | Fila de classificação do admin (~1,1 mil itens) | **dono** | aguardando o dono | fila esvaziada ou só casos duvidosos |
| 12 | P3 | Verificar efeito do alívio do banco (cadências novas) | SRE | em andamento | 24 h sem transação presa > 120 s e group-messages < 45 s |

## Como atualizar
Quando a tarefa avança, trocar o estado aqui no mesmo commit da mudança. Tarefa nova entra no fim da sua prioridade.
