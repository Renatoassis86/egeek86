# Modelo em modo sombra: preço da mensagem (2026-11-14)

Gerado por `scripts/ml-preco-mensagem/treinar.ts` (somente SELECT). Os números abaixo são os reais desta execução; nada foi inventado.

## O que o modelo estima
A chance de uma mensagem **não sobreviver à checagem de preço**: preço velho, anúncio que sumiu ou mudou na releitura ao vivo, ou preço da mensagem diferente do relido (divergência >= 2%).
Origem do problema: `docs/investigacao-preco-mensagem-vs-site-2026-11-14.md` (anúncio irmão do mesmo vendedor, 94,7% das ofertas do ML sem `external_item_id`).

## Dados
- Mensagens do Telegram com rótulo: **7028** (de 7072 linhas candidatas), ofertas distintas: 1957, snapshots de preço lidos: 10123.
- Positivos (não sobreviveu): **1614** (23.0%). Divergência estrita >= 2% (o caso do P2S Combo): só **16** mensagens, poucas demais para treinar um modelo só delas; por isso o rótulo principal inclui a falha de revalidação.
- Sem nenhum snapshot anterior à mensagem: 0 linhas (atributos de histórico ficam zerados).
- Período: 2026-11-11T03:38 a 2026-11-14T17:13 UTC. **Só 4 dias** de dados: o modelo é frágil e deve ser re-treinado quando houver mais.

## Divisão por tempo
- Treino: as 4919 mensagens mais antigas (1198 positivos). Teste: as 2109 mais novas (416 positivos, taxa-base 19.7%).

## Resultado no TESTE (mensagens mais novas)
| Modelo | AUC | Precisão média (AP) | Limiar (recall 80% no treino) | Precisão | Recall | TP | FP | TN | FN |
|---|---|---|---|---|---|---|---|---|---|
| Logística (base) | 0.755 | 0.399 | 0.229 | 30.8% | 80.3% | 334 | 749 | 944 | 82 |
| Boosting de stumps | 0.751 | 0.403 | 0.234 | 30.8% | 74.8% | 311 | 699 | 994 | 105 |
| Regra `preco_oscilando` (ponto de comparação) | n/d | n/d | flag | 33.3% | 0.7% | 3 | 6 | 1687 | 413 |

Modelo escolhido para o modo sombra (maior AP no teste): **boosting de stumps**, limiar 0.234 (escolhido só com dados de treino, para recall alto: barrar erro custa menos que enviar erro).

### Limiares no teste (modelo escolhido)
| Limiar | Mensagens marcadas | Precisão | Recall |
|---|---|---|---|
| 0.2 | 1291 | 28.7% | 88.9% |
| 0.3 | 417 | 43.4% | 43.5% |
| 0.4 | 167 | 48.5% | 19.5% |
| 0.5 | 6 | 66.7% | 1.0% |
| 0.6 | 0 | n/d | 0.0% |
| 0.7 | 0 | n/d | 0.0% |

### Rótulo estrito (divergência >= 2%) no teste
Positivos no teste: 0. AUC da logística: n/d; dos stumps: n/d (com tão poucos positivos, é só indicativo).

### Atributos mais pesados da logística (coeficientes padronizados)
- `sem_media`: -0.338
- `gatilho_g2`: 0.333
- `gatilho_ac`: -0.171
- `rede_ml`: -0.168
- `ticket_log10`: 0.155
- `rede_amazon`: 0.153
- `hora_cos`: -0.128
- `razao_preco_lista`: -0.107

## Como o modo sombra funciona
- `src/lib/messaging/ml-preco.ts` monta os atributos (mesmo código no treino e na produção) e pontua.
- Com `GROUP_ML_SOMBRA=on`, o envio registra `candidate.mlSombra = {v, p, alto, em}` na linha da mensagem. **Nunca bloqueia, reordena ou altera a mensagem.**
- O modelo vive em `src/lib/messaging/ml-preco-modelo.json` (gerado por este script). Para re-treinar: rode o script de novo e faça commit.

## Limites e próximos passos
- Poucos dias de dados e rótulo indireto (falha de revalidação), não só divergência de preço. Reavaliar com 2 a 3 semanas.
- Para virar bloqueio: comparar `mlSombra.p` das mensagens enviadas com o resultado da releitura de 30 min (`recheck_divergence_pct`) por alguns dias e só então decidir o limiar.
- Preencher `external_item_id` (correção 2 do plano) deve reduzir o risco na origem.

## Leitura honesta (acrescentada à mão)
- **Ganho modesto:** com recall de ~75% no teste, a precisão é ~31% contra taxa-base de ~20%. Serve para ordenar risco, não para bloquear sozinho.
- **O que o modelo aprendeu:** os atributos mais pesados são `sem_media`, `gatilho_g2`, `rede_ml` e `ticket_log10`, ou seja, o TIPO da mensagem (gatilho, rede, se há média), e não a dinâmica do preço. A causa do caso P2S Combo (anúncio irmão do mesmo vendedor, 94,7% sem `external_item_id`) aparece fraca porque só 16 mensagens têm divergência estrita >= 2% e nenhuma caiu no teste.
- **Rótulo indireto:** o positivo principal é "revalidação ao vivo: já não vale" (preço velho, sumiu ou mudou) OU divergência >= 2%. Não é a divergência medida contra o site para todas as mensagens.
- **Janela curta:** 4 dias de dados (ver acima). Reavaliar com 2 a 3 semanas e, principalmente, depois que `external_item_id` for preenchido.
- **Modo sombra:** com `GROUP_ML_SOMBRA=on`, cada mensagem enviada recebe `candidate.mlSombra = {v, p, alto, em}` (registrado por `src/server/messaging/ml-sombra.ts`, chamado em `group-queue.ts` logo após o envio, com prazo de 2,5 s). Nada é bloqueado. A flag está DESLIGADA por padrão e **não foi ligada na Vercel**: ligar é decisão do dono.
- **Como decidir virar bloqueio:** depois de alguns dias com a flag ligada, comparar `mlSombra.p` das mensagens enviadas com `recheck_divergence_pct` (releitura de 30 min) e escolher o limiar pelos números novos.
