# Segunda validação independente do cofre de cupons e benefícios (R-67), 2026-11-16

Validador: `qa-verificador` (não implementou). Escopo: correções dos commits 5d2ce90 e 249628c sobre o relatório `docs/qa-cofre-cupons-2026-11-16.md`. Método: leitura adversarial, execução dos testes, 20 mutações em arquivo (todas restauradas; `git diff` limpo nos arquivos mutados) e SELECT em produção (hora das leituras: 2026-11-16 ~01:45Z). Nada escrito em produção, nenhuma mensagem enviada, Chrome não usado. Há alterações não commitadas de outros agentes no working tree (amazon-assistida, schema etc.); não foram tocadas.

## Veredito geral: REPROVADO para "pronto" (R-67). O item continua "em validação".

As 10 correções existem e a maioria funciona, mas restam: um falso negativo do leitor do ML (modal 200 com corpo ilegível vira "sem cupom"), um teste commitado que FALHA no HEAD, caminhos de cupom (campanha e loja/categoria) que publicam sem passar por `podeDivulgar`, 8 mutações sobreviventes (endpoint sem teste algum) e ciclo de produção sem nenhuma linha no cofre.

| # | Ponto | Veredito |
|---|---|---|
| 1 | Retirada de avisos ligada ao cron | APROVADO |
| 2 | Revogação e `simulacao_nao_aplicou` vetam | APROVADO |
| 3 | Modal inconclusivo descarta a leitura | PARCIAL |
| 4 | R-68 "Cupom encerrado" só com prova prévia (soundbar) | APROVADO (com ressalva) |
| 5 | Preço final da vitrine pelo cofre | PARCIAL |
| 6 | Benefícios do ML sem validador | APROVADO |
| 7 | Desconto do rótulo confere com o modal | APROVADO (ligação sem teste) |
| 8 | Endpoint `/api/ingest/cofre-simulacao` | PARCIAL (código correto, zero testes) |
| 9 | Testes e mutações | PARCIAL |
| 10 | Ciclo em produção | PARCIAL |
| + | Novos caminhos fora do cofre | REPROVADO |

## 1. Retirada de avisos: APROVADO
- Chamada real: `src/app/api/cron/group-messages/route.ts:88` (`revogarVencidos()` + `retirarAvisosSemProva()` na fase `cofre`); guarda de teste em `scripts/test-cofre-cupons-122.ts:86`. Mutação N5 (remover a chamada) FALHA o teste.
- Produção: a fase `cofre` roda a cada minuto (collector_runs `group-messages-fases`, `cofre` 15 a 111 ms). Em 2026-11-16 01:34:34.512Z o cron fechou 6 avisos com `end_reason='sem_prova_no_cofre'` (ofertas 78cd82fc, 3acb8d3e, abf5088a, 7a359eb6, 21b4eb06, 64dbf6d9) e gravou `collector_runs` job `cofre-cupons` com `{avisosRetirados: 6}`. Isso só acontece com `COFRE_RETIRAR_AVISOS` ligada no ambiente de produção (a flag não está no `.env.local`).
- Os 6 fechados têm `end_notified_at` nulo e `listPending` (`guardiao-cupons.ts:243-248`) só envia card para `sumiu_da_pagina`/`cancelado_pelo_dono`/`venceu`: nenhum card de "encerrado".
- Restam 7 abertos (todos ML, enviados 01:02 a 01:05Z): ainda não passaram dos 60 min exigidos; devem fechar a partir de ~02:02Z. Reconferir (o medidor falha enquanto isso).
- `nunca_provado`: zero linhas ainda (os 3 `sumiu_da_pagina` de anúncio, fechados 01:12, 01:17 e 01:26Z, são anteriores ao deploy do R-68, 01:28Z, e têm `end_notified_at` preenchido: histórico, não reabre).

## 2. Revogação e simulação que não aplicou vetam: APROVADO
- `src/lib/coupons/cofre.ts:96-97`: simulação de checkout revogada dentro do TTL (30 min) devolve `simulacao_nao_aplicou` ANTES de qualquer outra prova, inclusive ML com campaign_id + modal. `cofre.ts:100-101`: prova revogada não vale. `decidirCupomLido` (`cofre.ts:160`) repassa a simulação revogada mesmo no ML sem campanha.
- Fio no servidor: `provasDeSimulacao` (`src/server/coupons/cofre.ts:58-65`) devolve `revogada: state==='revogado'`, e o lookup a passa (`coupon-item-lookup.ts:165-169`).
- Mutações: remover o veto (M11) e ignorar `revogada` (M12) são capturadas pelo teste do cofre.
- Ressalvas (não bloqueiam): o veto dura 30 min; depois disso só uma nova simulação o repõe. A aba precisa mandar o mesmo `coupon_ref` que o lookup usa (campaign_id no ML; `sem_campanha` na Amazon).

## 3. Modal inconclusivo: PARCIAL
- Correto: `public/loops/ml-cupons-item.js:458-459` descarta (`modal_inconclusivo`, sem POST) se o modal não foi consultado (cota `MODAL_POR_CICLO`), deu exceção, status diferente de 200 ou URL fora de `/cupons/pdp`; 429/403 viram problema (linha 449). Rótulo sem campaign_id e nada confirmado vira `cupom_sem_campanha` (linha 463), também sem POST. Em nenhum desses caminhos sai "sem cupom".
- **Falha restante (F8b, alto):** `PURO.cuponsDoModal` (linhas 131-157) devolve `{}` para QUALQUER corpo sem `"campaignId"`, inclusive HTML de erro, página de verificação que mantém a URL `/cupons/pdp` e corpo vazio. Testei: `cuponsDoModal('<html>erro</html>')`, `cuponsDoModal('')` e "Você não tem cupons disponíveis" retornam `{}` iguais. `mapa = {}` (não nulo) significa "o modal respondeu e a campanha não está", então `filtrarConfirmados` zera os cupons e o leitor envia `coupons: []`, que o ingest grava como `sem_cupom` e derruba cupom real. O relatório anterior pedia exatamente "modal 200 sem JSON" como inconclusivo e fixtures; não há fixture nem teste disso.
- Mutação N2 (remover o descarte `cupom_sem_campanha`) SOBREVIVE: nenhum teste cobre essa linha. N1 (remover `modal_inconclusivo`) é capturada só por regex de texto no teste do cofre.

## 4. R-68 e caso soundbar: APROVADO (com ressalva)
- `src/lib/coupons/prova-cupom.ts:46-50` (`motivoDeFim`), ligado em `guardiao-cupons.ts:229-235` (`end`) e na segunda trava do envio (`listPending`, linhas 246-247). Mutação N8 (devolver o motivo sem checar prova) FALHA o teste.
- Soundbar: `scripts/fixtures/ml-soundbar-carrossel.html` (sintética, 423 bytes) tem "R$ 1.709 com Cupom" com campaign_id 987654 e item R$ 2.299; `test-prova-cupom-121.ts:47-58` prova que o leitor lê o rótulo, que o modal do item sem a campanha não confirma nada (sem cupom) e que modal nulo não confirma nada. Passa. A fixture não é uma página real.
- Ressalvas: (a) a ligação `motivoDeFim` em `end()` não tem teste (mutação N7 SOBREVIVE); (b) "teve prova" é `EXISTS` de qualquer linha com `proof_type` e `validated_at`, o que inclui a linha revogada de uma simulação `nao_aplicou`; caso estreito, mas um cupom barrado só por simulação contaria como "provado".

## 5. Vitrine (`carregarPromosPrime`): PARCIAL
- `src/server/vitrines/pool.ts:118-121` chama `podeDivulgar({uso:'preco_final'})` com o bloco de compra mais as simulações aplicadas da oferta; sem simulação com `valorFinalCents` o item é pulado. Isso fecha o F1.
- Falhas: (a) `finalCentavos` continua DERIVADO (`precoComPromocao(p, pct)`, linha 123) e não é comparado com o valor provado (`valorFinalDito` não é passado), então uma simulação de R$ X libera um preço derivado de R$ Y; (b) `provasDeValorFinalDaOferta` aceita simulação de QUALQUER cupom/benefício da oferta e descarta as revogadas, então o veto não vale na vitrine; (c) mutação N6 (remover o `if (!dec.ok) continue`) SOBREVIVE: o teste só procura o texto `podeDivulgar(` e `uso: 'preco_final'` (`test-cofre-cupons-122.ts:87`).

## 6. Benefício do ML sem validador: APROVADO
- `src/lib/coupons/cofre.ts:27`: o ML só aceita `cupom`; benefício vira `tipo_sem_validador`. Amazon mantém benefício (`cofre.ts:28`). `card-benefits.ts:56` passa por `podeDivulgar` (rede por subquery, rede desconhecida = bloqueada). Mutação M9b (remover a linha) FALHA o teste. `test-beneficio-cartao-120.ts` passa.

## 7. Desconto do rótulo x modal: APROVADO (ligação sem teste)
- `src/lib/coupons/prova-cupom.ts:58-78` (`descontoConfereComModal`): valor em reais com tolerância de R$ 1; percentual com faixa; nome sem valor legível aceita. Ligado em `src/app/api/ingest/cupons-item/route.ts:86`, que grava `sem_prova` quando diverge. Mutação N3 (função sempre ok) FALHA o teste ("rótulo de R$ 590 NÃO bate com R$ 50 OFF"). Mutação N4 (retirar a chamada na rota) SOBREVIVE: nada testa a ligação.
- Observação: percentual com teto pode reduzir o desconto abaixo de metade do nominal e barrar um cupom legítimo (falso negativo aceitável, sem risco de divulgação errada).

## 8. Endpoint `/api/ingest/cofre-simulacao`: PARCIAL
Código conferido (`src/app/api/ingest/cofre-simulacao/route.ts`), tudo no lugar:
- Autenticação por token de 32+ caracteres com `timingSafeEqual`, 503 sem token (`ingest-guard.ts:20-26`); origem por rede da aba (`route.ts:24-31`) e oferta tem de ser da mesma rede da aba (linha 52).
- Limite de 30/h atômico: `pg_advisory_xact_lock` + contagem na trilha + gravação na mesma transação (linhas 42-45, 72); corpo ≤ 20 KB, ≤ 10 linhas.
- `valor_final_cents` obrigatório em `aplicado`, inteiro, `>= 30%` e `< preço` da oferta (linha 55); `resultado` só `aplicado`/`nao_aplicado` (linha 38): `comprado` é filtrado; `coupon_ref` precisa existir (leitura em 24 h ou linha do cofre; `sem_campanha` só fora do ML, linha 56). `kind` configurável.
- Falha: NENHUM teste exercita a rota. Mutações N9 (tirar o piso de 30%), N10 (remover o guard), N11 (aceitar qualquer `resultado`) e N12 (remover o limite) SOBREVIVEM todas. A rota é a porta de entrada de prova de maior peso (preço final e veto) e está sem rede de segurança. Também: simulação de `kind='beneficio'` é gravada mas nenhum consumidor a lê.

## 9. Testes e mutações: PARCIAL
Execução (todos sem `--db` salvo indicado; testes de servidor com `--conditions=react-server`):
- OK: `test-cofre-cupons-122` (também com `--db`), `test-beneficio-cartao-120`, `test-gatilho-cupom` 94/94, `test-cupom-nome` 33/33, `test-ml-links-ui` 53/53, `test-guardiao-cupons` 65/65, `test-cupom-agulha` 111/111, `test-preco-isca` 20. `tsc --noEmit` sem erros.
- **`scripts/test-prova-cupom-121.ts` COMMITADO no HEAD FALHA** ("leitor v1.3.x ..."): exige `VERSAO = '1.3.0'` e o leitor está na 1.3.2. A correção (regex `1[.]3[.][0-9]`) existe só como modificação NÃO commitada no working tree. Com o arquivo atual passa.
- `scripts/medir-cofre-cupons.ts`: sai 1 por 7 avisos abertos (todos com menos de 60 min). `scripts/medir-integridade-preco.ts`: escopo ESTRITO OK; escopo amplo e geral com falhas (cobertura de auditoria, preço do veredito, Amazon > 130 min) fora do cofre; m.1 OK (0 isca fora da quarentena), m.2 com 49 (oferta-dia isca nas métricas, R-61, outra frente).
- Mutações do relatório anterior: **M3 agora capturada, M6 agora capturada**. Integração: remover o `continue` do cofre no lookup (M9a) e a linha `podeDivulgar` de `card-benefits.ts` (M9b) FALHAM o teste. Também capturadas: M11 (veto), M12 (revogada), N1, N3, N5, N8.
- Porém as guardas de integração são regex de texto, não comportamento, e 8 mutações novas SOBREVIVEM: N2 (`cupom_sem_campanha`), N4 (ligação do desconto na rota), N6 (guarda da vitrine), N7 (`motivoDeFim` em `end()`), N9, N10, N11, N12 (endpoint inteiro).

## 10. Ciclo em produção: PARCIAL
- `coupon_validations` = 0 linhas, `coupon_validation_trail` = 0 linhas (SELECT agora). O cofre ainda não gravou uma única decisão, nem barrada (o registro da decisão de leituras barradas, 249628c, nunca disparou porque não há leitura positiva recente no lookup).
- Leitor ML v1.3.2 ainda não está reinjetado: nenhuma leitura `confirmado_modal` existe em toda a história; as leituras recentes são `lido_na_pagina` (87), `derivado_do_rotulo` (38), `sem_cupom` (209), `sem_prova` (3), todas do leitor anterior.
- Valores positivos: `collector_runs` job `cofre-cupons` tem 1 linha (retirada de 6 avisos), a fase `cofre` do cron roda todo minuto, rede ativa sem validador = nenhuma.
- Sem decisões reais no cofre não foi possível observar liberado, barrado e revogado em produção; o medidor das mensagens sem prova (item [3], 38 em 24 h) só limpa 24 h depois de haver prova no ciclo.

## Novos caminhos fora do `podeDivulgar` (grep em `src/` e `scripts/`): REPROVADO
Aplicações de `podeDivulgar`/`decidirCupomLido`: `coupon-item-lookup.ts:124,165`, `card-benefits.ts:56`, `pool.ts:118`. Consumidores de cupom de anúncio e benefício (mensagem, alerta privado, painel, avisos de impressora, site) passam por eles. Mas:
- **G1 (médio-alto): `consultarCupom` em `src/server/messaging/agente-cupons.ts:57-61` consulta `item` (cofre), depois `lookupCampaignCoupon` (campanha, `campaign-coupon-lookup.ts`) e `lookupVerifiedCoupon` (loja/categoria, `coupon-lookup.ts`).** Cupom de campanha e de loja/categoria sai em mensagem `CUPOM` e é registrado como aviso (`registrarDivulgacao`) sem `podeDivulgar`, nem sequer `validadorDaRede`/TTL de prova. Se o item é barrado pelo cofre, o agente cai nos dois seguintes e pode divulgar outro cupom da mesma oferta sem prova no cofre. Ou entra no cofre (com validador próprio e linha em `coupon_validations`) ou a exceção é declarada e registrada na regra R-64 com o motivo.
- G2 (baixo): `group-offers.ts:595-610` seleciona candidatos por `price_with_coupon_cents` de `offer_coupon_reads`, mas só como seleção; o texto final vem do lookup (coberto). Sem divulgação direta.

## Correções obrigatórias (para o item ser "pronto")
1. Leitor ML (F8b): `cuponsDoModal`/`lerItem` só tratam como "modal respondeu" quando há marcador positivo de resposta válida do modal (JSON/estrutura de cupons ou o texto exato de "sem cupons disponíveis"); corpo vazio, erro ou página de verificação com URL `/cupons/pdp` = `mapa` nulo = descarte. Fixtures: modal sem cupons, modal com outra campanha, 200 com corpo ilegível. Teste de comportamento para `cupom_sem_campanha` (N2). Reinjetar v1.3.2.
2. Commitar o conserto de `scripts/test-prova-cupom-121.ts` (regex de versão) para o HEAD voltar a ficar verde.
3. Cobrir `carregarPromosPrime`: comparar o preço derivado com o `valorFinalCents` provado (passar `valorFinalDito`), respeitar o veto na vitrine, limitar as simulações às do mesmo cupom, e teste comportamental (N6).
4. Testes de integração do endpoint `cofre-simulacao` (autenticação, origem por rede, limite 30/h concorrente, piso de 30% e teto do preço, `comprado` recusado, `coupon_ref` inexistente) com banco de teste ou stub, de modo que N9 a N12 passem a falhar. Idem para a ligação de `descontoConfereComModal` na rota `cupons-item` (N4) e `motivoDeFim` em `end()` (N7).
5. G1: cupom de campanha e de loja/categoria passar pelo cofre (ou exceção explícita na R-64, com TTL e prova mínima), e teste de que `consultarCupom` não devolve cupom de fonte sem validador.
6. Trocar a definição de "teve prova" em `end()`/`listPending` para considerar só prova que liberou (estado `divulgavel`/`revalidando`/`revogado` por vencimento, não simulação que não aplicou).
7. Ciclo completo em produção após a reinjeção do leitor: `coupon_validations` e `coupon_validation_trail` com linhas reais (liberado, barrado e revogado), 7 avisos abertos fechados (após as 02:02Z) e `scripts/medir-cofre-cupons.ts` com exit 0; só então voltar à validação.
8. Manter o item "em validação" em `docs/fila-de-execucao.md` até o `qa-verificador` aprovar (a frase de aprovação só pode ser escrita quando todos os pontos acima estiverem APROVADOS).

Nesta rodada a frase de aprovação final não é concedida.
