# Ata do Conselho Geek: modo CUPONS E PROMOÇÕES da Amazon (P0 do dono)

- **Data:** 2026-11-12
- **Porte:** médio (código novo de leitura, ingestão e gatilho; sem migration; sem escrita fora do fluxo de cupons)
- **Presidente:** geek-lead (decisão executada pelo agente-cupons)
- **Convocados:** agente-cupons (autor), integrador-apis, qa-verificador (pareceres independentes; os dois últimos leram o código sem anchoring na conclusão)

## Briefing
O dono (2026-11-12) priorizou cupons e promoções da Amazon. Medido: ML tem 92 mensagens CUPOM/24 h; a Amazon não tinha NENHUMA fonte de cupom lida (`fontesSemLeitura`: `amazon:cupons-de-loja`, ...) e o laço de cupom da página do item leu 177 itens e achou 0 cupom. Leitura de cupom Amazon/Shopee autorizada, somente leitura, pela aba logada.

## Descoberta (somente leitura, aba nova própria, fechada ao fim; as 3 abas dos laços não foram tocadas)
- `/cupons` da Amazon redireciona à lista de departamentos (inútil); `/coupons` redireciona a `/blackfriday`. A "página de cupons" da Amazon BR é a vitrine `/blackfriday` + `/blackfriday/2/` (cards sem texto de cupom) e o bloco **"Cupons em destaque só no app"**, que são links para **47 páginas `/promotion/psp/<ID>`**.
- Cada página `/promotion/psp/<ID>` é **uma regra de promoção**: o título é a regra ("Só no App: 15% off em Suplementos", "20% de desconto em 1 item(ns)", "Exclusivo Prime: Compre 4 Livros e leve 10% off"), o banner traz "De <início> até <fim>" (nem sempre com hora) e os **Termos da promoção** (popover "Ver os termos") trazem a hora do fim ("expirando às 23:59 do dia 30 de Novembro de 2026") e as condições (só produtos físicos; vendidos pela Amazon.com.br, não por parceiros). Os cards (links `/dp/<ASIN>`) trazem título e preço atual (`a-price-whole/fraction`); **o desconto NÃO aparece no card**.
- Dos 47 títulos reais: a maioria "Só no app: X% off em <categoria>" (para todos, no app); o resto é Prime-exclusivo e/ou "compre N". Fixtures reais em `scripts/fixtures/amazon-cupons/`.
- Cupom por item ("Aplicar cupom") continua só na página do item (laço `cupons-24h.js`); não existe lista pública de cupons por item na Amazon.

## Pareceres
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| agente-cupons | Aprova: a promoção é fonte lida com validade (banner + termos), escopo por ASIN | Preço final DERIVADO da regra do título (a loja não mostra); validade só se lida; Prime/compre N/seguir NÃO viram cupom; Amazon entra no gatilho CUPOM por padrão com chave `GROUP_CUPOM_AMAZON=off` | quantos ASINs do catálogo caem nas 47 páginas (a medir na primeira varredura em simulação) |
| integrador-apis | Aprova com ressalvas antes de `enviar:true` | Ciclo >= 30 min; tolerância de preço menor; regex de restrição mais ampla; mensagem deve citar "vendido pela Amazon"; volume em `coupon_reads`; /blackfriday com 200 + login deve pausar | contagem atual de `coupon_reads` (129.241 hoje) |
| qa-verificador | Aprova com ressalvas, sem bloqueio | Limite 50 do SQL cortava o cupom do ASIN; `\w+` na regex de quantidade gerava falso positivo ("off em 24 horas"); data sem hora vence 00:00 (conservador, documentado) | cupons Amazon verificados em produção |

## Divergências e decisão
1. **Volume em `coupon_reads`** (integrador): aceito com mitigação, não resolvido por completo. O escopo é UM cupom por ASIN já ofertado (estável quando os outros cards mudam); lotes de 100 cards por chamada; ciclo de 30 min entre varreduras (~46 min por página, bastam 2 leituras separadas por 30 min); só ASIN que já é oferta ativa grava. **Pendência**: poda de `coupon_reads` (retenção 90 dias, sem rotina automática hoje) e gravar leitura só na mudança de estado, se a medição mostrar > 10 mil linhas/dia.
2. **"Só vendido pela Amazon"**: `affiliate_offers` da Amazon não guarda vendedor (1.713 ofertas ativas, 0 com `seller_id`), então o servidor não prova a condição. Decisão: a mensagem SEMPRE leva a condição ("vale só para itens vendidos pela Amazon.com.br" quando os termos foram lidos, senão "confira no anúncio se o item é vendido pela Amazon.com.br"). Divulga-se a promoção, não se afirma o item.
3. **Validade só com data**: sem a hora nos termos, vale até 00:00 BRT do último dia (um dia a menos, nunca a mais). Sem nenhuma validade lida, nada é gravado.
4. **Escopo**: foi corrigido o limite do SQL (`scopeItemId`), a regex de quantidade, a tolerância de preço (15%) e a descoberta passou a tratar login/captcha com status 200. Não foi aplicada a sugestão de "pular páginas sem mudança" (o servidor já ignora o que não muda de regra; pular quebraria o frescor de 120 min).
5. **Amazon no gatilho CUPOM** (era barrada por regra explícita `amazon_fora_do_gatilho_cupom`): liga por padrão, sob as mesmas travas de frescor/readmissão/laço parado do juízo da Amazon; `GROUP_CUPOM_AMAZON=off` devolve ao estado anterior.

## Execução (o que mudou)
- Leitor puro `src/lib/coupons/amazon-promocoes.ts`; ingestão `src/server/coupons/amazon-promocoes.ts`; rota `POST /api/ingest/amazon-promocoes` (origem Amazon + token, sem token = 503); laço `public/loops/amazon-promocoes.js` (+ cópia em `scripts/chrome/`); fixtures; `scripts/test-amazon-promocoes.ts` (48 verificações).
- Cada ASIN que já é oferta ativa vira um `coupon_items` de escopo `produto` (contrato de `/api/ingest/cupons`); o cupom fica `verificado` após 2 leituras separadas por 30 min; ASIN que ainda não é oferta é devolvido em `asins_novos` e gravado em `collector_runs.meta` (`job cupons-assistida`, `origem amazon-promocoes`) para a vitrine/aprovação contínua.
- Gatilho CUPOM: leitura por anúncio `offer_coupon_reads` com `source = 'amazon-promocoes'` (só para cupom já verificado); validade e estado vêm do `coupon_items`; texto: nome = título da promoção, "só no app" quando for, sem código, preço calculado pela regra. A leitura "sem cupom" da página do item e a da promoção são famílias diferentes (uma não apaga a outra), no lookup, no pool, em `coupon-offers` e no guardião.
- Encerramento: promoção que acaba ou muda de regra fecha os cupons e grava "sem cupom" por oferta (o guardião envia "Cupom encerrado"); `baixarCuponsParados` faz o mesmo quando o prazo lido vence, mesmo com o laço parado.
- Adapter Amazon: `listRead = ativo` (promoções).

## Verificação
`tsc` limpo; testes: amazon-promocoes 48/48, cupom-agulha 111/111, cupons-24h 62/62, guardiao-cupons 60/60, cupom-nome 22/22, cupons 113/113, gatilho-cupom 93/93, mensagens-grupo 230/230. Build e produção: ver relatório do commit.

## Pendências e decisões do dono
- Injetar o laço (modo simulação primeiro) e conferir `window.__promo.simulacao()` antes de `enviar:true`.
- Decidir se o laço entra no vigia próprio (`rede=amazon` compartilha o batimento do `cupons-24h`: o `ok` de um mascara a queda do outro).
- ASINs novos: hoje só ficam no registro da corrida; ligar à vitrine é a próxima tarefa (fila #37).
