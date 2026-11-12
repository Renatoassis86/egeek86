# Ata do Conselho Geek: régua flexível (menor preço registrado), mínimo e máximo nas mensagens, diagnóstico das TVs

- **Data:** 2026-11-12
- **Porte:** médio
- **Presidente:** geek-lead
- **Convocados:** estatistico-senior (parecer independente), qa-verificador (verificação independente antes do commit). Dispensados por porte: especialista-precos, dba-postgres, seguranca-db (sem migration, sem rota nova, sem segredo).

## Briefing (pedido do dono, 2026-11-12)
1. "Se os itens tiverem a partir do menor preço que foi registrado pode ser liberado e enviado para os grupos. Para compor a base de dados pode ir com qualquer preço (datalake). Para as mensagens não será mais a partir de 3% inferior, todo o mesmo pode mandar."
2. "Estou vendo poucas TVs sendo enviadas. Está com algum problema?"
3. "Coloque nas mensagens preço máximo e preço mínimo também."

## Interpretação adotada (reversível por variável de ambiente)
- (a) **Base/datalake:** nada muda. Coleta, ofertas, cotações e aprovação seguem sem filtro de preço (o corte sempre foi só de mensagem).
- (b) **Mensagem:** o corte de % abaixo da média deixa de ser o único portão. É elegível TAMBÉM (união, não substituição) o preço que está no menor já registrado do produto (preço <= menor preço diário dos dias anteriores). "Todo o mesmo pode mandar" foi lido como "o produto no seu mínimo histórico pode mandar, mesmo sem queda de 3% sobre a média". Oferta sem esse mínimo e sem 3% continua barrada. Chave: `GROUP_REGUA_ELEGIVEL_MIN=on` (ausente ou `off` = comportamento anterior).
- (c) **Veredito honesto:** elegível só pelo mínimo, sem 3% de queda, entra no degrau 1 "Bom preço" neutro: sem percentual, sem "abaixo da média", sem "% OFF", sem "de/por", sem "afiliado"; linha "Menor preço dos últimos N dias". Nas lojas fora da régua vale o texto antigo ("Está no menor preço que registramos desde dd/mm").
- (d) **Mínimo e máximo:** linha `Mínimo R$ X · Máximo R$ Y (últimos N dias)` em Telegram, WhatsApp e cartão de imagem da régua; "Maior já visto" no cartão e na régua do front. Só com >= 7 dias medidos e amplitude real; senão a linha é omitida. `GROUP_REGUA_MINMAX=off` remove.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação | Atendida |
|---|---|---|---|
| estatistico-senior | Aprova a união com guardas | Subir o piso para 10 dias; travar série plana (amplitude >= 5%); trocar o máximo por medida robusta; rotular pelo calendário; medir antes de ligar | Parcial: trava de amplitude de 5% (`GROUP_REGUA_ELEGIVEL_MIN_AMPL_PCT`), máximo robusto (maior mediana diária das ofertas, `price_daily_state.median_offer_day_cents`, medido: o `max_cents` passava de 1,5x a maior mediana em 207 de 1.642 produtos e 548 séries são planas), rótulo por intervalo de calendário, volume medido. **Piso de dias mantido em 6** (configurável em `GROUP_REGUA_ELEGIVEL_MIN_DIAS`): o histórico real é de no máximo ~13 dias e o impacto medido é de +0,5%; o dono pode subir para 10 sem deploy. |
| qa-verificador | FAIL parcial, depois corrigido | (1) texto do tópico Histórico mudava mesmo com a chave desligada; (2) Amazon na série errada; (3) sobreposição possível no cartão | (1) `GROUP_REGUA_MINMAX=off` devolve o formato antigo; (2) falso positivo: `aplicarRegua` já devolve nulo para Amazon e `finish` escolhe a série da Amazon; (3) faixa do cartão subiu para 34 px acima do rodapé (não renderizado em produção ainda) |

## Diagnóstico das TVs (medido no banco, somente leitura; `scripts/medir-tvs.ts`)
- **Não há defeito de classificação nem de duplicata.** TVs são `eletroeletronicos/general`, tipo `smart-tv`; 4 falsos positivos de jogo/acessório excluídos pelo filtro.
- **Catálogo:** 32 masters de TV com oferta ativa (7,4% dos 433 masters de Eletroeletrônicos), 106 ofertas ativas; **28 dos 32 têm UMA só rede**, logo sem média única nem "3 lojas" para o gatilho de preço; só o Achado ("Novo no monitoramento") pode falar deles.
- **Funil dos 32 (todos com oferta fresca):** 14 enviáveis automáticos; 4 sem gatilho; 7 só com Amazon (Achado exige ML/Shopee); 5 barrados pela faixa de preço do tipo (2 abaixo de 0,5x e 3 acima de 2,5x a mediana das TVs); 1 em aprovação humana (desconto > 45% da média); 1 sem link de afiliado pronto.
- **Envios:** 13 mensagens de TV em 24 h (8 produtos em 7 dias) de 201 enviadas na loja = 6,5%, igual à fatia de TV no catálogo (7,4%). A cota por tipo (30%) não é o limitante.
- **Causa dominante:** fila saturada da loja: em 24 h, 201 enviadas, 142 expiradas e 54 pendentes; as TVs competem com 433 produtos. 16 propostas de TV expiraram e 7 aguardam. É REGRA (cadência, fila justa, repetição), não defeito.
- **Causa estrutural:** cobertura. Há poucas TVs monitoradas. Remédio de negócio: ampliar a semeadura/cobertura por categoria de TV em Eletroeletrônicos nas redes (vira tarefa #41, decisão do dono sobre prioridade e cota). A nova regra do menor preço não acrescentou nenhuma TV (0).

## Volume previsto (`scripts/medir-volume-minimo.ts`, mesmo pool do ciclo, 878 produtos, sem histórico de envio)
- Candidatos enviáveis (auto, sem retenção, exceto Achado): **186 antes, 187 depois (+1; +0,5%)**. Com o piso de 3 dias a conta foi +3 (+1,6%) em medição anterior (antes da trava de amplitude). Conclusão: a regra é praticamente neutra em volume hoje (poucos produtos estão no menor preço ao mesmo tempo, a série real tem no máximo ~13 dias, 33% das séries são planas e a exigência de >= 3 ofertas e 3 lojas continua). Os limites de cadência, a fila justa e o terço do degrau 1 não foram alterados; não há risco de inundar.

## Decisão
Executada: R-44h no `FLUXO_MESTRE.md`, tarefa #41 na fila. Código: `regua.ts` (config, `noMenorRegistrado`, `faixaPreco`, `viaMinima`), `group-rules.ts` (`detectMovement` com T2 "no menor registrado", `finish`, `aplicarRegua`), `group-offers.ts` (`loadSeries` com máximo), `group-messages.ts` (tópico Histórico), cartão (`offer-card*.ts*`, rota `group-messages`), front (`regua-oferta.tsx`, `offer-card.tsx`, `affiliate.ts`). Testes: `scripts/test-regua-minmax.ts` (70 verificações) e as suítes de régua/mensagens existentes seguem verdes (254, 49, 233, 217, 230, 18).

- **Como reverter:** `GROUP_REGUA_ELEGIVEL_MIN` apagada ou `off` (e redeploy) devolve a elegibilidade de antes; `GROUP_REGUA_MINMAX=off` remove a linha de mínimo/máximo; nenhuma migration a desfazer.
- **Decisão do responsável:** pedido do dono; a interpretação acima fica registrada para ele corrigir se "todo o mesmo" significava mais do que o menor preço registrado (por exemplo, liberar qualquer preço de produto com média, o que mudaria o volume de forma relevante).

## Verificação
Ver o relatório final da sessão (tipagem, testes, volume, deploy e site) e a retrospectiva de 24 h a preencher.

## Retrospectiva
Preencher após 24 h com a chave ligada: enviadas por hora por loja, mensagens com a linha de mínimo/máximo, 0 termo banido, job < 45 s.
