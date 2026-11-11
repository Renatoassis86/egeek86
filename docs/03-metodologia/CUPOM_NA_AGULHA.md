# Cupom na agulha (Agente de Cupons)

Pedido do dono, 2026-11-11: o gatilho dos cupons é sempre automático; o agente de cupons tem sempre um cupom ativo e testado na agulha para as mensagens; a conferência existe para não mandar cupom que não serve.

## Definição

Um cupom só entra numa mensagem se passar nas quatro conferências (`src/lib/coupons/agulha.ts`, função `evaluateAgulha`). Falhou qualquer uma: a mensagem sai sem cupom, e o preço nunca é bloqueado (a consulta tem limite de 4 s e qualquer erro vira "sem cupom").

| | Conferência | Regra |
|---|---|---|
| a | Lido na fonte, validade futura | Preço com cupom lido na página do anúncio; ou cupom de lista lido no portal; ou código digitado pelo dono. Validade lida precisa estar a mais de 15 min do fim. O anúncio não informa validade (aceito só nele; a mensagem não afirma validade). Lista e código sem validade lida nunca entram. |
| b | Revalidado na janela de frescor | Anúncio 120 min; lista 120 min; código do dono 24 h. |
| c | Condição contra a oferta | Rede com leitura autorizada; público "todos"; conta lida elegível; "por seguir a loja" fora; compra mínima atingida pelo preço de agora; cupom de categoria só com o departamento declarado e sem "produtos selecionados" (ou confirmado pelo anúncio). |
| d | Preço final | Com cupom menor que sem cupom; leitura feita sobre o preço de agora (tolerância de 2 centavos); desconto até 70%; quando a regra (% e teto, ou valor fixo) foi lida, o desconto lido tem de bater com o calculado. |

## Por que a janela é 120 min e não 6 h / 12 h

Medido em 2026-11-11 sobre `offer_coupon_reads` (46 pares "leitura com cupom, próxima leitura do mesmo anúncio"): entre 1 e 2 h o cupom sumiu em 9 de 40 pares (22%) e o preço do anúncio mudou em 9 de 40. Janela de 6 h publicaria cupom morto em cerca de 1 de cada 3 mensagens. A amostra é de um dia (início da 11.11); revisar quando houver mais dias. A cobertura se ganha lendo mais e na ordem certa, não aceitando leitura velha.

- Meta de releitura das ofertas que importam: 45 min (deixa 75 min de folga na janela de 120).
- Inventário vivo: cupom de lista "verificado" sem nenhuma conferência há mais de 12 h deixa de constar como verificado (baixa automática, reversível pela próxima leitura).

## Automação (nenhum passo manual)

- Cron `group-messages` (já existente, a cada 5 min): consulta única do motor (`consultarCupom`, ordem anúncio, código do dono, lista) com a agulha em cada etapa; ciclo do guardião; baixa automática (`src/server/coupons/baixa.ts`); a cada ~30 min grava o resumo de cobertura em `collector_runs.meta` (job `agente-cupons`).
- Fila de revalidação priorizada (`src/server/coupons/revalidation-queue.ts`), exposta em `GET /api/ingest/cupons-revalidar` e também (mesmo formato antigo `{ items: [{ id, url }] }`) em `GET /api/ingest/cupons-item`. A aba logada lê o anúncio e envia o resultado para `POST /api/ingest/cupons-item` (contrato inalterado). Prioridade: 0 cupom já divulgado e aberto; 1 mensagem pronta na fila; 2 anúncio que mostrou cupom nas últimas 24 h; 3 mensagem em proposta; 4 departamento com cupom de categoria declarado; 5 enviada nas últimas 3 h; 6 demais elegíveis.
- Token: `COUPON_INGEST_TOKEN` (dedicado, 32+ caracteres, preferido). Enquanto não existir, valem `ASSISTED_INGEST_TOKEN` / `AMAZON_INGEST_TOKEN`. Origem fixa por rede (ML, Amazon, Shopee; ver "Redes"). Sem token: 503.
- Indicador: bloco "Cupom na agulha, por loja" em `/admin/mensagens`.
- Auditoria: `coupon_consults.miss_reason` (migration 0041) guarda por que não saiu cupom, por etapa.

## Casamento categoria para departamento

`src/lib/coupons/categoria-vertical.ts`. Só rótulo que a loja publicou e que declara a categoria sem ambiguidade ("Casa" para eletrodomésticos, "Livros e Jogos" para games e livros). Marca, campanha e rótulo ambíguo ("Smartphones") não casam. Como todos os 146 cupons de categoria lidos hoje dizem "Em produtos selecionados", o casamento prioriza a releitura do anúncio; o cupom só vai para a mensagem se o anúncio confirmar a campanha ou se a regra lida declarar todos os produtos.

## Redes (`src/lib/coupons/network-adapters.ts`)

Decisão do dono, 2026-11-11: leitura de cupom da Shopee e da Amazon autorizada, pela página do item, na aba logada do Chrome dele. Mesmas 4 conferências do Mercado Livre (`ITEM_READ_NETWORKS` e `LIST_NETWORKS` em `agulha.ts`).

- Mercado Livre: anúncio, lista e código do dono (inalterado; POST em `/api/ingest/cupons-item`).
- Amazon: selo de cupom lido na página do produto, gravado em `offer_coupon_reads` com `source = 'amazon-pagina'`. Código do dono aceito em `/admin/cupons-campanha` (`lookupCampaignCoupon` agora aceita Amazon). Sem lista pública de cupons.
- Shopee: voucher / "preço com cupom" lido na página do item, `source = 'shopee-pagina'`. Código do dono já aceito. `shopee_campaigns` são campanhas de comissão e nunca viram cupom de comprador (o validador só aceita rótulo com "cupom" ou "voucher" e o preço sai da leitura, nunca de `shopee_campaigns`).

### Como a leitura da página vira cupom (`src/lib/coupons/page-read.ts`, `src/server/coupons/page-reads.ts`)

1. Fila por rede: `GET /api/ingest/cupons-revalidar?rede=amazon|shopee&n=20` -> `items: [{ id, url, ref, preco_cents, prioridade, motivo, ultima_leitura_min }]`. Mesma priorização do ML (0 a 3, 5, 6; a 4, categoria por lista, só existe no ML). Alvo: o item mais barato de cada produto aprovado em cada rede, releitura devida a cada 45/90 min. URL: Amazon `/dp/<ASIN>` sem tag; Shopee o link oficial da oferta (shopee.com.br); item sem URL resolvível é pulado.
2. Leitura: `POST /api/ingest/cupons-revalidar?rede=amazon|shopee` com `{ rows: [{ id, ref, price_seen_cents, coupons: [{ label, price_with_cents? }] }] }`. `ref` (ASIN / itemId lido na página) precisa bater com a oferta, senão a linha é recusada (`pagina_de_outro_item`); `price_seen_cents` é obrigatório e precisa estar a no máximo 50% do preço da oferta. `coupons` vazio = lido e sem cupom (fecha leituras positivas anteriores).
3. Preço com cupom: o que a página mostra (`status = lido_na_pagina`); sem ele, derivado da regra escrita no próprio selo sobre o preço lido (`derivado_do_rotulo`; a Amazon quase nunca mostra o preço final). Selo sem regra legível ("Cupom disponível") é descartado. Mínimo e teto lidos do selo entram como regra da agulha (compra mínima atingida, desconto coerente).
4. Na mensagem: `lookupItemCoupon` aplica a agulha com a regra do selo; texto por rede (Amazon: "Marque o cupom na página do produto antes de pagar"; Shopee: "Aplique o voucher no carrinho antes de pagar"). Selo Prime, novos usuários, primeira compra, membros: barrado (`publico_restrito`); "seguir a loja": barrado.
5. Proteção (igual às rotas assistidas): origem fixa POR REDE (ML só mercadolivre.com.br, Amazon só amazon.com.br, Shopee só shopee.com.br; origem cruzada = 403), token (`COUPON_INGEST_TOKEN`; senão `ASSISTED_INGEST_TOKEN` / `AMAZON_INGEST_TOKEN`; nenhuma credencial nova), sem token = 503 (kill-switch), corpo até 120 KB, até 40 linhas. A guarda roda antes de ler o corpo.
6. Chrome: `scripts/chrome/cupons-leitura-loop.js` (colar no console de uma aba logada da rede; pede endereço do site e token, nada fica no arquivo; começa em SIMULAÇÃO; para em captcha/login/status diferente de 200; só a fila, 5 a 9 s entre itens, ciclo de 45 min).
7. Painel `/admin/mensagens` ("Cupom na agulha, por loja"): Amazon e Shopee ganham bloco próprio (alvo, lidas em 2 h, na agulha, idade da última leitura, por departamento). Até o loop rodar, mostram 0 lidas (dado real, não estimado).

### O que NÃO está validado

- Seletores do selo de cupom e do preço (Amazon: `#couponText*`, `#couponBadgeRegularVpc`; Shopee: classes `voucher`/`coupon`) são palpite sobre o HTML atual; a Shopee é SPA (a aba abre a página, espera e lê). Por isso o loop nasce em simulação: conferir rótulos e preços no console antes de `CFG.enviar = true`.
- A URL de leitura da Shopee passa pelo link oficial de afiliado da oferta (clique do próprio dono); o dono decide se aceita.
- Sem leitura, a mensagem das duas redes continua saindo sem cupom (motivo `sem_leitura`): nada é divulgado sem leitura na fonte.

## Operação

- Diagnóstico (somente SELECT): `npx tsx --conditions=react-server --env-file=.env.local scripts/diagnostico-cupons-agulha.ts [--consultar]`.
- Testes: `npx tsx --conditions=react-server scripts/test-cupom-agulha.ts`.
- Migration 0041 (dry-run por padrão): `npx tsx --env-file=.env.local scripts/apply-cupom-agulha.ts [--apply | --rollback]`.
