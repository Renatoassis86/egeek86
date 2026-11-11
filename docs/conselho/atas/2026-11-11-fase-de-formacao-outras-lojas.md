# Ata: fase de formação das lojas que não são games

- **Data:** 2026-11-11. **Porte:** médio (regra de mensagem + cadência de coleta). **Origem:** pedido direto do dono.
- **Pedido:** acelerar o carregamento das outras lojas, flexibilizar para popular os grupos, usar MÉDIA SIMPLES agora e, numa data de corte no fim de novembro, voltar sozinho à estrutura dos games.
- **Nota de transparência:** execução pelo engenheiro de coleta; não houve reunião com pareceres independentes. Cabe confirmação do `qa-verificador` e do `estatistico-senior`.

## Decisão (aguarda ratificação do dono)
1. Data de corte **2026-11-30** (Brasília), constante única `DATA_DE_CORTE_FORMACAO` (`src/lib/messaging/fase-formacao.ts`).
2. Antes: média simples (>= 3 ofertas), 2 lojas, régua só "abaixo da média". Depois: estrutura dos games (10%, oferta-dia elegível, 3 lojas). Detalhes em `docs/03-metodologia/FASE_DE_FORMACAO.md`.
3. Texto: sem "% abaixo da média" com menos de 5 ofertas (regra aplicada em todos os modelos); sem "afiliado".
4. Identidade `incerta` fora da média simples e da escolha da oferta; a trava de identidade completa segue só para games e consoles.
5. Risco aceito: média simples de 3 ofertas é frágil (pacote, ágio, variante). Mitigações: faixa 0,35x a 3x a mediana, Open Box/região/edição fora, retido acima de 45% abaixo da média, texto sem percentual com amostra pequena.

## Aceleração (números; só código/config, nada aplicado em produção)
| Item | Antes | Depois |
|---|---|---|
| `collect-vertical` (ML, 6 lojas): chamadas por execução | 150 | 240 |
| `collect-vertical`: execuções por hora por loja | 2 | 3 (minutos escalonados, `vercel.json`) |
| Teto teórico ML/h nas 6 lojas | 1.800 | 4.320 (só usa o que está devido na fila; cada oferta segue com intervalo de 30/60 min) |
| Rota `ampliar-amostra-shopee`: duração / orçamento | 60 s / 48 s | 300 s / 240 s |
| Rota: masters por chamada (padrão/máx) | 15 / 40 | 30 / 80 |
| Rota: chamadas Shopee por chamada (padrão/máx) | 90 / 150 | 200 / 450 |
| Rota: autorização | só `TESTE_LOJA_KEY` | também `CRON_SECRET` (permite agendar) |
| Teto horário do job Shopee (freio de quota) | 3000 | 3000 (inalterado) |
Não alterado: descoberta `discover-products` (é só games); `collect-shopee` (já ~5 min); Amazon assistida.
Quota: o ML tem teto diário e `collect-vertical` não faz recuo em 429 (falha volta à fila); vigiar `collector-health` e os 429 nas primeiras 24 h e reverter `vercel.json`/cap se houver. A Shopee divide 8000/h com `collect-shopee`.

## Fica para o dono
- Ratificar a data de corte e o risco da média simples de 3 ofertas.
- Decidir se o `ampliar-amostra-shopee` entra no `vercel.json` (o agendamento com `apply=1` grava; não foi adicionado) e se sobe `VERTICAL_<LOJA>_MAX_CALLS` no ambiente.
- A fila de classificação de identidade precisa preencher `OfferFact.identidade` no carregador (`group-offers.ts`).
- Deploy para valer.

## Roteiro de teste da rota Shopee em produção (dry-run, não grava)
```
curl -s -H "Authorization: Bearer $TESTE_LOJA_KEY" "https://www.egeek86.com/api/cron/ampliar-amostra-shopee?vertical=livros&limitMasters=10&maxCalls=60"
```
Conferir `modo: "dry-run"`, `parou_por`, `erro_api` (null), `chamadas.usadas/teto`, `pares_aceitos`. Só então, com decisão do dono, repetir com `&apply=1`; para desfazer: `?rollback=<run_id>&apply=1`. Paginação: `&offset=<proximo_offset>`.
