# Cupons e descontos de cartão das impressoras 3D prioritárias (#112, 2026-11-15)

Ordem fixa do dono: P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo; depois P2S, P1S, A1, A1 Mini; por último Kobra (sempre o combo primeiro).

## Diagnóstico (SELECT de 2026-11-15)
- A fila de leitura por anúncio (`revalidation-queue.ts`) enchia as 20 vagas com "mensagem pronta na fila" (prioridade 1) e anúncios com cupom visto nas últimas 24 h (prioridade 2). As impressoras (prioridade 6) nunca chegavam: a P1S Combo do ML foi lida pela última vez em 12/11.
- As ofertas de impressora quase não têm `external_item_id`; a URL de leitura depende da API oficial (vendedor ou preço igual).
- A Amazon P2S Combo (B0GP9LBGY7, R$ 8.459,10) **não está no catálogo** (nenhuma oferta Bambu P2S Combo da Amazon). Cobertura a tratar na auditoria de cobertura; não foi criada oferta aqui.

## O que mudou
1. **Fila** (`src/lib/coupons/fila-impressoras.ts`, usada por `listarFilaRevalidacao`, ML e Amazon):
   - prioridade 0 (cupom já divulgado aberto) continua na frente; depois vêm as impressoras prioritárias na ordem do dono, depois as mensagens prontas e o resto;
   - impressoras: cadência de 30 min por oferta (Kobra e outros Bambu 60 min); nunca lida primeiro (combo antes), depois a leitura mais velha (rodízio, a mesma oferta só volta depois das demais);
   - teto de 50% das vagas para impressoras (a carga total não aumenta); as demais seguem a regra de sempre (45/90 min).
   - Teste: `scripts/test-fila-impressoras-112.ts` (puro, e com `--db` imprime as 20 primeiras de ML e Amazon). No SELECT real, a P2S Combo (R$ 8.330) abre a fila do ML, depois A1 Combo, P2S, P1S, A1, A1 Mini, A2L, Kobra.
2. **Desconto por cartão/meio de pagamento**: tabela nova `offer_card_benefits` (migration `0053_offer_card_benefits.sql`, aditiva, aplicada com retrato do esquema em `docs/backups/`; rollback `0053_offer_card_benefits.rollback.sql`; `scripts/aplicar-migration-0053.ts`). Uma linha por (oferta, benefício): tipo (`cartao_pct`, `pix_pct`, `parcelas`, `cashback`), emissora, percentual, teto, mínimo, parcelas, cashback, base lida, preço final derivado, `needs_confirm`, texto lido, `first_seen_at`, `last_seen_at`, `alerted_at`.
   - As abas mandam só **textos** em `rows[].beneficios_cartao` (ML: POST `cupons-item`; Amazon/Shopee: POST `cupons-revalidar`); o servidor interpreta (`src/lib/coupons/card-benefit.ts`). Texto sem regra legível é descartado.
   - Preço final só quando há percentual lido e preço lido na página; teto lido limita o desconto. Percentual por cartão ou Pix vem **sempre** "a confirmar no carrinho" (teto, validade e conta ficam no "Saiba mais"). Parcelas e cashback são informação de pagamento, sem preço final.
   - Vale na tela por 3 h após a última leitura.
   - Flag `CARD_BENEFITS=off` desliga a gravação e a exibição.
3. **Front** (`GUIA_3D_CUPONS=off` desliga): na guia do Plus, abaixo do preço de cada loja; nos cartões do departamento (seções, destaques e lista), a linha da loja de menor preço.
   - Cupom: `Cupom: <nome> (preço com cupom R$ X)` só com leitura válida pela agulha (frescor 120 min, preço lido, condição, público, validade). Sem cupom, nada aparece.
   - Cartão: `Desconto no cartão: Itaú Mastercard 15% (a confirmar no carrinho)`; `Pagamento: 10x de R$ 845,91 sem juros`; `Pagamento: Cashback R$ 46,65 (Mercado Pago)`.
4. **Mensagens**: a mensagem de CUPOM ATIVO ganhou o tópico "Desconto no cartão" quando há benefício de cartão/Pix lido naquela oferta. Não há mensagem nova só de cartão: usa a fila, as cotas e a dedup do CUPOM (uma mensagem por oferta por mudança). Copy sem "% OFF" e sem termos proibidos (teste).
5. **Aviso privado do dono**: `alertarCuponsImpressoras` (passo do ciclo do agente de cupons) avisa só o chat `TELEGRAM_ALERT_CHAT_ID` quando surge cupom válido ou desconto de cartão novo em P2S Combo e P1S Combo (combo primeiro): nome, regra, validade, link. Dedup: cartão por `alerted_at`; cupom por `collector_runs` (job `impressora-cupom-aviso`). Flag `PRINTER_COUPON_ALERT` (padrão ligada, `off` desliga). Sem `COLLECTOR_ALERTS=1` + chat + token vira dry-run (devolve o que enviaria, não marca nada). Nada vai aos canais públicos.

## Loops (reinjetar)
- `public/loops/ml-cupons-item.js` (e `scripts/chrome/`): `PURO.extrairBeneficiosCartao(html)` copia trechos como "18x R$ 547,33 com cartão Mercado Pago", "R$ 46,65 de cashback em Meli Dólar com seu Cartão de Crédito Mercado Pago", "5% OFF no Pix", "cartão X e ganhe N%".
- `public/loops/cupons-24h.js` (Amazon): `beneficiosCartaoDoc(doc)` copia os textos do bloco de compra ("Use seu cartão Itaú Mastercard e ganhe 15% off!", "em até 10x de R$ 845,91 sem juros").
- Os seletores e as expressões **não foram validados na página real**: conferir em `status().linhas` com `enviar:false` antes de enviar.

## Como cada coisa se aplica (lido x a confirmar)
| Item | Lido na página | Depende de confirmar no carrinho |
|---|---|---|
| Cupom do anúncio ML ("R$ X com Cupom") | nome, preço com cupom, campanha | validade quando a lista de cupons não a traz |
| Cupons da conta (R$ 200 OFF BF mín. R$ 600 até 30/11; 5% até R$ 140 até 28/11; 30% LIQUIDA) | só valem se o anúncio mostrar "com Cupom"; hoje não aparecem nas P2S/P1S Combo | tudo |
| Amazon, "Use seu cartão Itaú Mastercard e ganhe 15% off" | emissora e percentual; preço derivado só do % sobre o preço lido | teto, validade, bandeira exata e conta (tela "Saiba mais") |
| Parcelamento sem juros, ML cartão Mercado Pago, cashback Meli Dólar | parcelas, valor da parcela, cashback | juros do cartão MP (o texto não diz "sem juros") |

## Verificação pendente (Chrome do dono)
Reinjetar os dois loops; uma leitura real de P2S Combo ML (R$ 8.330) e Amazon; conferir `SELECT * FROM offer_card_benefits` e a guia em `/mercado/impressao3d`.

## Testes
`npm run test:cupons-impressoras` (fila, benefício de cartão, aviso privado; `scripts/test-aviso-impressoras-112.ts --db` grava um benefício temporário, confere front e dry-run e apaga).
