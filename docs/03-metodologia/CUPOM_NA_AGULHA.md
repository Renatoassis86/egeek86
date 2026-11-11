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
- Token: `COUPON_INGEST_TOKEN` (dedicado, 32+ caracteres, preferido). Enquanto não existir, valem `ASSISTED_INGEST_TOKEN` / `AMAZON_INGEST_TOKEN`. Origem fixa (Mercado Livre). Sem token: 503.
- Indicador: bloco "Cupom na agulha, por loja" em `/admin/mensagens`.
- Auditoria: `coupon_consults.miss_reason` (migration 0041) guarda por que não saiu cupom, por etapa.

## Casamento categoria para departamento

`src/lib/coupons/categoria-vertical.ts`. Só rótulo que a loja publicou e que declara a categoria sem ambiguidade ("Casa" para eletrodomésticos, "Livros e Jogos" para games e livros). Marca, campanha e rótulo ambíguo ("Smartphones") não casam. Como todos os 146 cupons de categoria lidos hoje dizem "Em produtos selecionados", o casamento prioriza a releitura do anúncio; o cupom só vai para a mensagem se o anúncio confirmar a campanha ou se a regra lida declarar todos os produtos.

## Pontos de encaixe por rede (`src/lib/coupons/network-adapters.ts`)

- Mercado Livre: ativo (anúncio, lista, código do dono).
- Shopee: só código do dono. Leitura de voucher pela aba logada depende de decisão do dono. `shopee_campaigns` são campanhas de comissão do programa, nunca cupom de comprador.
- Amazon: nada ligado. Depende de decisão do dono para ler selo de cupom e preço com cupom na página do produto (coleta assistida já existente). Encaixe: `offer_coupon_reads` com `source = 'amazon-pagina'`; depois incluir a rede em `ITEM_READ_NETWORKS` (`agulha.ts`).

## Operação

- Diagnóstico (somente SELECT): `npx tsx --conditions=react-server --env-file=.env.local scripts/diagnostico-cupons-agulha.ts [--consultar]`.
- Testes: `npx tsx --conditions=react-server scripts/test-cupom-agulha.ts`.
- Migration 0041 (dry-run por padrão): `npx tsx --env-file=.env.local scripts/apply-cupom-agulha.ts [--apply | --rollback]`.
