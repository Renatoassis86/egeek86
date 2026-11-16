# QA independente do cofre de cupons e benefícios (R-67), 2026-11-16

Validador: `qa-verificador` (não é o autor). Escopo: commits 12aa04c (R-62), 103be3f (R-63) e f05ce39 (R-64 a R-67). Método: leitura adversarial do código, execução dos testes, mutação em cópia temporária (restaurada; `git diff` limpo nos arquivos de cofre) e SELECT em produção. Nada foi escrito em produção, nenhuma mensagem enviada, Chrome não usado. Não foi lida a página real do ML/Amazon (somente leitura de código e banco): o ponto 5 fica PARCIAL por isso.

## Veredito geral: REPROVADO para "pronto" (R-67). O item permanece "em validação".

O núcleo puro (`podeDivulgar`) é sólido, mas: (a) a ligação ao resto do sistema não tem teste algum (apagar as duas travas de integração deixa todos os testes verdes); (b) há caminhos de preço final fora do cofre; (c) a revogação e a simulação de checkout não chegam a barrar nada; (d) o leitor do ML tem falso negativo estrutural e uma lacuna de falso positivo.

| # | Ponto | Veredito |
|---|---|---|
| 1 | `podeDivulgar` é o único caminho | PARCIAL |
| 2 | Padrão negado | APROVADO (com ressalva) |
| 3 | TTL, revalidação, revogação | PARCIAL |
| 4 | Casos reais do dono | APROVADO (P1S, Itaú); PS5 fora do escopo |
| 5 | Leitores v1.3.0 / v1.2.0 | PARCIAL |
| 6 | Testes e mutação | REPROVADO |
| 7 | 14 avisos abertos sem prova | APROVADO retirar (com condição) |
| 8 | Endpoint `/api/ingest/cofre-simulacao` | PARCIAL |

## 1. Caminho único: PARCIAL

Mapa (grep `podeDivulgar|cofreLigado` em `src/` e `scripts/`): só dois pontos de aplicação, `lookupItemCouponDetail` (`src/server/messaging/coupon-item-lookup.ts:156-167`) e `beneficiosVivosPorOferta` (`src/server/coupons/card-benefits.ts:55-56`). Por eles passam, de fato, mensagem (coupon-offers.ts:52,58), alerta privado `PRINTER_COUPON_ALERT` (aviso-impressoras.ts:47,66), painel de impressoras (painel-impressoras.ts:104,116,219,222) e avisos de impressoras 3D do front (avisos-impressoras-3d.ts:21,34). Isso é bom e foi confirmado leitura a leitura.

Furos:
- **F1 (médio): preço final derivado no site fora do cofre.** `src/server/vitrines/pool.ts:93-124,163` (`carregarPromosPrime`) lê `coupon_items`/`offer_coupon_reads` direto e DERIVA `finalCentavos = precoComPromocao(preço, pct)` para o card/vitrine. Não chama `podeDivulgar` nem `lookupItemCouponDetail`. Hoje protegido só pela flag `PROMO_PRIME_DERIVADA` (`amazon-promocoes.ts:165`, exige `'on'`; não aparece no `.env.local`), ou seja, é a mesma classe de erro do Itaú (preço final calculado) esperando a flag ser ligada. Correção: passar por `podeDivulgar({uso:'preco_final'})` ou barrar enquanto não houver prova de valor final.
- **F2 (médio): `uso: 'preco_final'` e `valorFinalDito` nunca são chamados** em produção (só `uso:'mensagem'` e `'card'`). A R-66 ("preço final só com prova de valor") existe só no puro e no teste; na prática o que impede "com o desconto: R$ X" hoje é `derivar()` devolver nulo (R-62) e o filtro de tipo, não o cofre. Os textos `com cupom: R$ X` (aviso-impressoras.ts:76, group-rules.ts:1325) usam `r.pw` do leitor sem comparar com o valor provado.
- **F3 (baixo): `cofreLigado()` falso (`COFRE_CUPONS=0`) desliga os dois pontos** sem alarme; o medidor não checa a flag.
- Ressalva do ML em benefício: ver ponto 5 (F8).

## 2. Padrão negado: APROVADO (com ressalva)

`podeDivulgar` com rede `magalu`/`aliexpress` ou tipo sem validador devolve `rede_sem_validador`/`tipo_sem_validador` (`src/lib/coupons/cofre.ts:107-110`). Mutação M1 (liberar rede sem validador) é capturada pelo teste (1 falha). No caminho real, rede fora de `ITEM_READ_NETWORKS` já sai antes (`coupon-item-lookup.ts`, `rede_sem_leitura_autorizada`) e, para benefício, o `rede` vem de subquery: rede desconhecida vira `''`/slug sem validador = bloqueada. Ressalva: o teste `--db` só falha para rede ativa sem validador; não existe teste de integração que injete uma rede nova. O validador "provisório" da Shopee aceita `bloco_de_compra_escopado` sem leitor auditado, e `provaDoCupomAmazon` é reaproveitada pela Shopee (`coupon-item-lookup.ts:163`) com `verificado` = apenas `src === 'shopee-pagina'` (o nome da fonte vira prova).

## 3. TTL e revogação: PARCIAL

- TTL puro correto: 10/120/10/30 min; revalidando acima da metade (teste cobre; mutação M2b capturada, 3 falhas).
- **F4 (alto): a revogação não é consultada por ninguém.** `revogarVencidos` e `registrarDecisao` só gravam estado; `podeDivulgar` é puro e decide só pelas leituras novas. O estado `revogado` da tabela nunca bloqueia nada. Só se a leitura sumir ou vencer o aviso deixa de sair, o que já ocorria pela agulha.
- **F5 (alto): `retirarAvisosSemProva` está importado em `src/app/api/cron/group-messages/route.ts:16` e NUNCA é chamado** (grep: nenhuma chamada em `src/` ou `scripts/`). A "etapa 4" de retirada de avisos é código morto; a flag `COFRE_RETIRAR_AVISOS` não faz nada hoje, e o medidor continuará FALHANDO.
- **F6 (médio): `nao_aplicado` na simulação não bloqueia.** O endpoint revoga a linha do cofre e grava `sim:<ref>` revogado (route.ts:44-49), mas como a decisão não lê o banco, um cupom do ML com campaign_id + `confirmado_modal` continua divulgável mesmo depois de uma simulação que provou que não aplica. A promessa "resultado nao_aplicado revoga" (R-66) não é cumprida.
- **F7 (baixo): tabela vazia em produção.** `coupon_validations` = 0 linhas e `coupon_validation_trail` = 0 (SELECT em 2026-11-16): a migration 0061 existe, mas o cofre ainda não rodou em produção (sem deploy/ciclo). Nada do que foi dito sobre "trilha", "barrados 24 h" e painel foi observado com dados reais; o painel e o medidor foram verificados só quanto ao código.

## 4. Casos reais do dono: APROVADO

- **P1S Combo NIC.3D (oferta 604a8605-1027-4c0b-b0e5-abda657e73c3):** única leitura positiva (2026-11-16 01:01:43Z) tem `campaign_id = NULL`, `status = lido_na_pagina`, `source = item_page_assistida`. `provaDoCupomMl` devolve `[]` (cofre.ts:135) e `provaCupomMl` retorna `cupom_sem_campanha`; a agulha devolve nulo e o anúncio não é reenviado. Barrado (duas camadas independentes). Leituras seguintes `sem_cupom`. Verificado no banco.
- **Itaú 15% nas ofertas Amazon:** `offer_card_benefits` está com 0 linhas (arquivamento aplicado); `cartao_pct`/`pix_pct`/`cashback` não passam `beneficioVerificado` e `provaDoBeneficio` os recusa (cofre.ts:146-148); `derivar()` devolve nulo (card-benefit.ts, R-62). Barrado em três camadas. `scripts/test-beneficio-cartao-120.ts` passa.
- **PS5 isca:** é a R-61 (preço-isca, mediana de preços), outra frente, fora destes commits e ainda NÃO commitada (`src/lib/pricing/preco-isca.ts`, `scripts/test-preco-isca.ts`, migration 0060 estão como não rastreados). Não faz parte do cofre de cupom; não validado aqui.
- **Nota:** 8 dos 14 avisos abertos são "Cupom de R$ 200,00" em ofertas diferentes, lidos todos por volta de 01:01-01:05Z com `lido_na_pagina` e sem campaign_id: o mesmo padrão do caso fundador replicado em lote (ver ponto 7).

## 5. Leitores: PARCIAL (sem página real; análise de código e dos fixtures existentes)

ML v1.3.0 (`public/loops/ml-cupons-item.js:419-450`): só envia cupom com `campaign_id` + presença no modal `/cupons/pdp` do mesmo item. O parser `cuponsDoModal` tem teste com fixture (`scripts/test-ml-links-ui.ts:104-106`); NÃO há fixture do caso "Você não tem cupons disponíveis" nem de modal com campanha diferente.

- **F8 (alto, falso negativo): modal inconclusivo vira "sem cupom".** Se a cota `MODAL_POR_CICLO = 8` (linha 292) acabou, se o modal deu exceção/status diferente de 200, ou se a URL do modal não pôde ser montada (sem `base_price`), `mapa` continua nulo, `confirmados` fica vazio e a linha segue como `coupons: []`. O ingest grava isso como `sem_cupom` (cupons-item/route.ts:88, `valid.length` zero) e, pela regra "leitura divergente derruba positivas", apaga cupom real. Lote padrão é 20 e a cota é 8: a partir do 9º item com campaign_id, cupom legítimo é derrubado. O leitor deveria descartar ("inconclusivo", sem POST) e não afirmar ausência.
- **F9 (médio, falso positivo residual): campaign_id e preço do rótulo não são amarrados ao modal.** `extrairCupons` (linhas 170-200) escolhe o `campaign_id` pela janela de ±800 caracteres em volta do preço no HTML cru; o modal só confirma que a campanha existe para o item. Não há conferência de que o valor do modal (ex.: "R$ 200 OFF", `cuponsDoModal.name`) bata com `preço visto - preço com cupom`. Um item com cupom real pequeno e o texto "R$ X com cupom" de outro vendedor dentro da janela passa. Sugestão: exigir desconto do rótulo compatível com o título/mínimo/teto do modal.
- **F10 (médio): benefícios do ML (`parcelas`, `preco_a_vista`) lidos de TEXTO INTEIRO da página** (`extrairBeneficiosCartao` usa `textoDoHtml(html)`, linhas 208-230), enquanto a Amazon v1.2.0 só lê o bloco de compra (`cupons-24h.js:403-410`, exclui `marketing-widget-url`, `promo`, `sponsored`). No cofre, o validador do ML aceita `bloco_de_compra_escopado` para benefício (cofre.ts:45) e o `provaDoBeneficio` rotula como tal: rótulo sem lastro no ML (página de catálogo com vários vendedores é exatamente o caso fundador do R-63). Correção: escopo do bloco de compra no ML ou retirar benefício do validador do ML.
- Amazon v1.2.0: escopo do bloco e exclusões presentes no código (`cupons-24h.js:403-410`); o caso fixture real do Itaú está coberto pelo teste de leitura de arquivo. Não reproduzi o widget de marketing carregado (sem Chrome).
- Frescor: leitura com prova vale 10 min no ML e o ciclo declarado da fila é de 45 min (cabeçalho do leitor); cupom ML só será divulgável logo após uma releitura bem-sucedida. É coerente com a decisão do dono, mas o recall será baixo; medir depois do deploy.

## 6. Testes e mutação: REPROVADO

Execução (2026-11-16): `test-cofre-cupons-122.ts` OK (sem e com `--db`; redes ativas: mercado-livre, shopee, amazon); `test-beneficio-cartao-120.ts` OK; `test-prova-cupom-121.ts` OK; `tsc --noEmit` sem erros; `medir-cofre-cupons.ts` sai com 1 (falha esperada: 14 avisos abertos sem prova; item [3] = 38 mensagens CUPOM nas últimas 24 h sem prova no cofre, porque o cofre ainda não rodou).

Mutação em `src/lib/coupons/cofre.ts` (cópia restaurada):

| Mutação | Resultado |
|---|---|
| M1 rede sem validador libera | pega (1 falha) |
| M2b remove checagem de TTL | pega (3 falhas) |
| M4 ignora `revogada` | pega (1 falha) |
| M5 `cartao_pct` vira prova | pega (3 falhas) |
| M7 Amazon `verificado=false` gera prova | pega (1 falha) |
| M8 ML aceita bloco de compra para cupom | pega (1 falha) |
| M3 bloco de compra entra em `PROVAS_DE_PRECO_FINAL` | **SOBREVIVE** (0 falhas): o teste de "preço final" usa prova sem `valorFinalCents` |
| M6 `provaDoCupomMl` ignora `status !== 'confirmado_modal'` | **SOBREVIVE** (0 falhas): nenhum teste usa campanha válida com status `lido_na_pagina` |

Mutação de integração: removi o `continue` do cofre em `coupon-item-lookup.ts` e a linha `podeDivulgar` em `card-benefits.ts`. Resultado: os três testes continuam verdes (`OK`). O cofre pode ser desligado dos dois únicos pontos de aplicação sem que nada falhe; a garantia "único caminho" não tem teste. (Arquivos restaurados; `git diff` limpo para eles.)

## 7. Os 14 avisos abertos sem prova: APROVADO retirar

Todos de mercado-livre, abertos em 2026-11-15 21:57Z a 2026-11-16 01:05Z, `last_checked_at` 01:21:30Z. Nenhuma oferta tem leitura `confirmado_modal` em toda a história.

| Aviso | Oferta | Rótulo | Observação |
|---|---|---|---|
| cfecaee8 | 7a359eb6 | R$ 15,00 | 6 leituras com campaign_id, nenhuma confirmada pelo modal |
| 29e3026d | 21b4eb06 | R$ 1.367,00 | sem campanha |
| 05c5fd03 | 64dbf6d9 | R$ 48,00 | sem campanha |
| fda7055e | abf5088a | R$ 1.753,00 | sem campanha |
| 3447da1d | 3acb8d3e | R$ 1.790,00 | sem campanha |
| 2d3584be | 78cd82fc | R$ 67,00 | 1 leitura com campanha, sem modal |
| 526a0699 | 2933e961 | R$ 1.001,00 | 1 leitura com campanha; última leitura `sem_prova` 01:21 |
| 7b139e84 | f6e4dba2 | R$ 200,00 | sem campanha |
| fc066c1f | 604a8605 (P1S NIC.3D) | R$ 200,00 | caso fundador |
| 180429c5 | c8f0ecf7 | R$ 200,00 | sem campanha |
| 0cdded53 | 7da06614 | R$ 200,00 | sem campanha |
| 8e97c379 | 892b84d8 | R$ 200,00 | sem campanha |
| 6f2c80f4 | d22d14c2 | R$ 200,00 | sem campanha |
| de7fa99b | 2fb89639 | R$ 200,00 | sem campanha |

Retirar é seguro (fechar `coupon_announcements`, `end_reason='sem_prova_no_cofre'`, sem card de "cupom acabou", reversível pelo UPDATE documentado), mas a flag `COFRE_RETIRAR_AVISOS=1` HOJE NÃO FAZ NADA (F5: função nunca chamada). Para retirar de fato é preciso religar `retirarAvisosSemProva()` ao ciclo. Condição: o ML v1.3.0 precisa estar reinjetado, senão nenhum aviso novo legítimo terá prova e todos seriam fechados após 60 min (comportamento desejado pela regra, mas deve ser consciente). Também notar: fechar o registro não apaga as mensagens já enviadas ao canal; o dono pode querer um aviso de correção (decisão dele, não executada).

## 8. Endpoint `/api/ingest/cofre-simulacao`: PARCIAL

OK: token obrigatório com `timingSafeEqual` e mínimo de 32 caracteres, 503 sem token (`ingest-guard.ts:23-37`); origem fixa; corpo ≤ 20 KB; no máximo 10 linhas; `resultado` só `aplicado`/`nao_aplicado` (rejeita `comprado` e qualquer outro valor pelo filtro, route.ts:26); oferta precisa existir e estar `active`; limite 30/h (`SIMULACOES_POR_HORA`) com 429.

Falhas:
- **F11 (alto): o endpoint só funciona na origem do ML.** `couponGuard(request)` usa a rede padrão `mercado-livre` (route.ts:21); a aba da Amazon/Shopee recebe 403 `origem_nao_permitida`, embora a rota aceite ofertas de qualquer rede. O gancho de simulação da Amazon (a única que sustenta preço final de benefício) é inutilizável como está.
- **F12 (médio): limite não atômico** (SELECT count e depois INSERT por linha): requisições concorrentes ultrapassam 30/h. E o contador é global, não por rede nem por token.
- **F13 (médio): `valor_final_cents` sem validação** (qualquer número finito é gravado, sem ser menor que o preço da oferta nem plausível) e `aplicado` libera cupom do ML mesmo sem campaign_id/modal (`podeDivulgar` aceita `simulacao_de_checkout` para cupom do ML, teste linha "simulação libera cupom do ML mesmo sem modal"), contornando a R-63 com o mesmo token das outras rotas. `kind` está fixo em `cupom`, então simulação de benefício (R-66) não tem como ser registrada.
- **F14 (baixo): a rota não valida que o `coupon_ref` informado existe** para a oferta (grava `sim:<ref>` livre).

## Correções obrigatórias (para o item ser "pronto")

1. Ligar `retirarAvisosSemProva()` ao ciclo (route.ts do cron) atrás da flag e adicionar teste; ou remover o import morto e a documentação da etapa 4 (F5).
2. Fazer `podeDivulgar` ou o ponto de aplicação consultar a revogação gravada (`coupon_validations.state='revogado'`, inclusive `simulacao_nao_aplicou`), para que `nao_aplicado` barre de fato (F4, F6).
3. Tratar modal inconclusivo/cota esgotada no leitor ML como "descartar leitura" (sem POST de "sem cupom") ou subir a cota para cobrir o lote; adicionar fixtures: modal "sem cupons disponíveis", modal com outra campanha, modal 200 sem JSON (F8).
4. Amarrar o desconto do rótulo ao título/mínimo/teto do modal antes de marcar `confirmado_modal` (F9).
5. Escopar a leitura de benefícios do ML ao bloco de compra ou remover `beneficio` do validador do ML (F10).
6. Passar `carregarPromosPrime` (vitrines) por `podeDivulgar({uso:'preco_final'})` ou documentar a flag como proibida; chamar `uso:'preco_final'`/`valorFinalDito` onde o texto traz "com cupom/ com o desconto: R$ X" (F1, F2).
7. Endpoint: `couponGuard(request, rede)` por rede da oferta (origem Amazon/Shopee), limite atômico (UPDATE/INSERT condicional ou advisory lock), validar `valor_final_cents` (0 < valor < preço da oferta), `kind` configurável, checar `coupon_ref` (F11 a F14).
8. Testes: (a) adicionar caso "campanha válida com status `lido_na_pagina` = sem prova" (M6); (b) caso de `bloco_de_compra_escopado` com `valorFinalCents` preenchido não sustenta preço final (M3); (c) teste de integração (com banco de teste ou stub) que prove que `lookupItemCouponDetail` e `beneficiosVivosPorOferta` barram sem prova e que removê-los falha (mutação de integração).
9. Rodar o cofre em produção por um ciclo completo (deploy, reinjeção do leitor ML 1.3.0), reexecutar `scripts/medir-cofre-cupons.ts` (hoje exit 1 por 14 avisos) e só então voltar à validação; observar `coupon_validations` e a trilha com dados reais (F7).
10. Registrar no `docs/fila-de-execucao.md` o estado "em validação" deste item até o `qa-verificador` aprovar após as correções.
