# Plano de convivência das frentes de trabalho (2026-11-12)

Objetivo: as frentes (coleta, links, cupons, mensagens, Black Friday, classificação, deploys) rodam ao mesmo tempo sem se atrapalhar. Nada aqui para loop nenhum: só ordena quem usa o quê, quando.

## 1. Onde as frentes colidem hoje (medido)
| Recurso compartilhado | Quem disputa | Sintoma visto |
|---|---|---|
| Banco Supabase (Micro, 60 conexões, IO) | crons de coleta, semeadura, médias, mensagens, ingestões dos loops | transações "idle in transaction", consultas lentas, group-messages perto de 60 s |
| Cota da API do Mercado Livre (por Client ID) | collect-prices, semear-vertical, fila-api-oficial, leitura de cupom de item, discover | 429 bloqueando semeadura e leitura de página |
| Aba logada da Amazon | coleta assistida, cupons 24 h, vitrine Black | uma carga atrapalha a outra; recarregar a aba mata os loops |
| Orçamento de 60 s por rota (Vercel) | group-messages, coletas | execuções cortadas |
| Repositório (main) | eu, agentes em paralelo | commits cruzados, vercel.json quebrado (7e177ac) |
| Fila de aprovação/identidade | porteiro automático, Shopee em massa, Black Friday | revisão acumulada esperando o dono |

## 2. Regras de convivência
1. **Dono por recurso.** Cada recurso tem uma fila e um dono: banco (cron de menor prioridade cede), ML (um orçamento único somado), aba Amazon (um laço por vez, ver §4), main (um escritor por vez, ver §5).
2. **Prioridade quando disputam** (do que nunca pode atrasar ao que pode esperar): 1) envio de mensagens e confirmação de preço de quem tem gatilho; 2) cupons; 3) refresh de ofertas já vistas; 4) descoberta e semeadura; 5) médias/estado diário e inventário; 6) relatórios.
3. **Orçamento único do ML.** Uma conta só de chamadas por hora, dividida por classe (confirmação, links, cupom, descoberta). Primeiro 429 de uma classe pausa só a classe de menor prioridade, nunca a de envio.
4. **Escalonamento de cron.** Nenhum par de jobs pesados no mesmo minuto. Minutos fixos por job (já feito para coleta Plus: 1, 3, 6, 8, 11, 13; semeadura 7/27/47; médias 0/30; estado diário 9/39). Qualquer novo cron escolhe um minuto livre da tabela.
5. **Escrita enxuta.** Job novo escreve só mudança real (sem regravar o igual), em lote, transação curta, sem manter transação aberta durante chamada externa. Teto de linhas por execução.
6. **Mensagens primeiro.** O job de mensagens lê o que os coletores gravaram; nenhum coletor segura lock de linha que o envio precisa.
7. **Loops de aba não se pisam.** Cada aba tem uma lista de loops e um só aciona rede por vez com pausa aleatória; recuo de 429 por origem, compartilhado entre os loops da mesma aba (se um recuou, os outros também desaceleram).

## 3. Mapa de prioridade por frente
- **Mensagens Telegram**: sempre rodam; gatilhos Black/Achado/Cupom usam o mesmo pool com diversidade.
- **Amazon**: Plano 1 (refresh dos itens que temos, dentro de 40 min) e Plano 2 principal (promoções característicos de cada loja, mesmo fora do catálogo ML/Shopee). Plano 2 usa a vitrine como descoberta e entra em rascunho com dedup.
- **ML**: links meli.la (alta ticket primeiro), cupom de item, confirmação de preço; semeadura só com folga de cota.
- **Shopee**: tudo no banco (nunca descarta por variação), mensagem só com a régua; cobertura por loja em horário próprio.
- **Classificação**: automática para o óbvio; resto na fila do dono, sem bloquear coleta nem mensagem.

## 4. Aba logada (Amazon, ML, Shopee)
- Uma aba por loja, um conjunto de loops com ordem: confirmação > cupom > vitrine > descoberta.
- Fila única por aba com prioridade; recuo comum por origem.
- Vigia (5 min) reinjeta e reabre; versão nova só reinjetada quando `/loops/*.js` muda.

## 5. Repositório e deploy
- Um escritor por vez em `main`: antes de commitar, `git fetch` e conferir o que mudou; commitar só os próprios arquivos; nunca `git add -A`.
- `vercel.json`: editar só via script (`JSON.parse` e `JSON.stringify`), validar antes do push (incidente 7e177ac).
- Mudança que mexe em carga (cron, orçamento) entra pela ata do Conselho e fica registrada neste documento.
- Depois de cada push: `vercel ls` Ready, site 200 e conferência dos jobs no `collector_runs`.

## 6. Medição (para provar que parou de colidir)
- Por hora: execuções ok/parcial por job, 429 por origem, transações presas encerradas, duração do group-messages, linhas gravadas por job.
- Meta de sucesso: zero transação presa > 120 s; group-messages < 45 s; 429 do ML < 2% das chamadas; nenhuma mensagem com gatilho perdida por confirmação atrasada.

## 7. Próximos passos
1. Agente da Black Friday inclui o Plano 2 da Amazon respeitando este mapa (ata em curso).
2. Orçamento único do ML (conta somada por classe), com painel simples no `/admin`.
3. Recuo comum por origem nos loops de aba.
4. Revisão semanal dos minutos dos crons.

---

## Atualizado em 2026-11-15

Auditoria: `docs/auditoria-2026-11-15/` (painéis 2 e 4). O que mudou nos jobs e crons desde 12/11 (conferido contra `vercel.json`, 24 entradas):

| Job | Cadência hoje | Observação medida |
|---|---|---|
| `collect-prices` | `*/5` | 1.150 execuções em 48 h (573 em 24 h contra 288 esperadas): há um segundo disparador desconhecido; fila #73 |
| `collect-shopee` | `*/5` | orçamento esgotado em 552 de 574 execuções (96%); fila #88 |
| `collect-vertical` x6 | a cada 15 min, minutos 1, 3, 6, 8, 11, 13 | livros, impressão 3D e eletroeletrônicos esgotam o orçamento em 58% a 85% das execuções |
| `cobertura-shopee` | a cada 10 min (`4-54/10`) | cota própria (R2-7); 0 erros desde ~10:00 BRT de 14/11 |
| `ampliar-amostra-shopee` | `33 * * * *` | foco 3D (`bambu impressora`); primeiro ciclo terminou em `erro_rate_limit` |
| `discover-shopee-esporte` | `27 * * * *` | calçados |
| `semear-vertical` | a cada 20 min (`7-57/20`) | era 7/27/47 |
| `refresh-snapshots` | stats 0/30; showcase `4-59/15`; vitrines `5-55/10`; daily `9-59/30`; inventory `41` | `running` presos continuam (104 a 106) |
| `aprovacao-auto` | a cada 10 min | |
| `group-messages` | a cada minuto | |
| `collector-health` | a cada 30 min | alertas em dry-run; fila #70 |

**Novas regras de convivência.** (1) Mudar o minuto, o orçamento ou o `maxDuration` de um cron exige ata e o script com `JSON.parse`/`JSON.stringify`; os orçamentos de tempo devem ficar em 80% do `maxDuration` (proposta da auditoria, fila #72) e o `finish` da corrida em `finally`. (2) Congelar a ampliação de catálogo (`semear-vertical`, `ampliar-amostra-shopee`, `discover-*`) de 20/11 a 30/11 libera cota e CPU para atualizar o que já existe (fila #88; depende do dono). (3) O vigia de loops agora inclui a reabertura automática do Chrome e alarme de laço parado acima de 30 min (fila #81). (4) Escalonamento: a trava de ciclo `acquireCycleLock` deve cobrir as rotas de coleta por rede, para impedir dois coletores de 240 s ao mesmo tempo contra a cota do ML (achado C2). (5) Itens P0 da auditoria entram antes de qualquer frente nova (regra de WIP da fila).

NÃO VERIFICADO: a origem do segundo disparador do `collect-prices` e o limite `max_client_conn` do Supavisor.

