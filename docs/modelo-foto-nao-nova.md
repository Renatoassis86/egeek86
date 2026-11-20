# Modelo de foto "nao nova" (R-109)

Pedido do dono (2026-11-20): jogo/console com mao na foto, ou jogo fotografado perto de varios outros, nao e novo. O modelo le a foto do anuncio e sugere marca; **nunca apaga e nunca desbloqueia**.

## Variaveis (por foto)
| Grupo | Variavel | Como |
|---|---|---|
| Visao (principal) | embedding CLIP ViT-B/32 (512 dim, q8, local via `@huggingface/transformers`, sem API) | entrada da regressao logistica |
| Imagem (auxiliares, `extrairFeatures`) | fracao e maior mancha de pele (YCbCr), pele no centro, borda branca (estudio), desvio da borda, densidade de bordas, saturacao, entropia de cor, razao de aspecto, resolucao | so regras e razoes legiveis (sozinhas davam precisao 0,65 no CV) |
| Compatibilidade | dHash 64 bits da foto da oferta x imagem do catalogo do master; <= 8 bits = capa oficial, **nunca marca** | `distCapaOficial` |
| Texto | usado/seminovo, lote/"N jogos", vendedor de usados (`sinaisTexto`) | `usado` ja e do porteiro (R-10); `revendedor` soma 0,03 |
| Pilha de jogos | numero de capas na cena (`capasNaCena`) | **so por classificador de visao opcional** (via API Claude, nao executado): 3 ou mais = alto, motivo `foto_com_varios_jogos` |

## Rotulos
198 URLs com classe visual (`docs/backups/foto-mao-real-por-url-2026-11-15.json`: 98 `mao_real`, 100 `sem_mao_real`), classificadas pelo assistente em 15/11. **Nao sao bloqueios do dono**: o banco nao guarda bloqueio manual de envio de jogo (0 masters com `catalogGate.manual = rejected`; os bloqueios de 20/11 nao deixaram rastro que o codigo leia). Quando o dono tiver um registro de bloqueio, ele entra como rotulo positivo e o modelo e retreinado (`treinar`).

## Metricas (validacao cruzada, 5 dobras estratificadas, determinista)
Gravadas em `src/lib/catalog/foto-nao-nova-modelo.json` > `metricas`. Limiar 0,50: precisao 0,91, revocacao 0,93 (TP 91, FP 9, TN 91, FN 7). Faixa **alto** (limiar 0,70, menor com precisao >= 0,95): precisao 0,955, revocacao 0,867 (TP 85, FP 4, TN 96, FN 13). Faixa **medio** (0,21): precisao 0,83, revocacao 0,97. A aplicacao usa so pontuacao >= 0,80.

## Primeira rodada em producao (300 ofertas de games enviadas em 3 dias, dry-run)
14 `alto`, 91 `medio`, 195 `baixo`, 0 imagens ilegiveis; 7 com pontuacao >= 0,80. Conferencia visual de 6 do `alto`: **6 de 6 sao foto caseira de usado** (so o disco, cartucho solto, pilha em mesa, estojo em cama), mas **so uma e mao de fato**: o modelo aprendeu "ambiente domestico/foto de usado", nao so mao (o motivo gravado continua `foto_com_mao`). Conferencia de 6 do `medio`: ~3 de 6 sao arte oficial limpa (falso positivo); por isso o `medio` e lista para o dono, nunca marca.

## Limites
- 198 exemplos, um unico anotador (o assistente); o L2 foi escolhido na mesma validacao (otimismo leve). Sem conjunto de teste independente: o primeiro contato com bloqueios reais do dono e o teste de verdade.
- Negativos sao em boa parte foto de estudio/arte de caixa; foto caseira sem mao de produto lacrado pode ser marcada (por isso o `medio` vai para o dono e o `alto` fica em quarentena reversivel).
- Pilha/lote por foto nao tem rotulo nem validacao; so por texto ("lote", "N jogos") e pela visao opcional.
- Mao ilustrada na arte da caixa nao conta (regra de 15/11); a regra `capa_oficial` protege o caso.

## Uso em producao (padrao negado)
`scripts/foto-nao-nova.ts pontuar` (lotes de 8 imagens com pausa, so URLs do catalogo, consulta unica com LIMIT): dry-run por padrao; `--apply --por Nome` poe em **quarentena a OFERTA** (`affiliate_offers.quarantined_at`, a mesma marca da regra de 15/11: master agrega varios vendedores) so quando faixa `alto` e pontuacao >= 0,80, com backup NDJSON e log; `--rollback <log> --apply` reverte. Pula quem tem decisao humana (`catalogGate.manual`) ou master rejeitado. `medio` e `alto` abaixo de 0,80 saem em lista JSON em `docs/backups/foto-nao-nova-pontuacao-*.json` para o dono decidir. Motivos: `foto_com_mao`, `foto_com_varios_jogos`. Sem cron: a pontuacao e pesada para rota serverless (modelo CLIP local), roda em script e em pausas.
