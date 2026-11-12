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

## Loop 24 h (Amazon e Shopee), sem colar nada no console

Pedido do dono, 2026-11-11: a equipe de cupons trabalha 24 h por dia. Arquivo: `scripts/chrome/cupons-24h.js` (substitui o uso manual de `cupons-leitura-loop.js`, que continua como alternativa com prompt). Quem opera a aba logada injeta a configuração e o arquivo; o loop roda em segundo plano (setTimeout encadeado) e a chamada de injeção devolve na hora (limite de 45 s por chamada do `javascript_tool` não atrapalha).

### Como injetar (uma aba por rede)

1. Abrir uma aba logada em `https://www.amazon.com.br` (ou `https://shopee.com.br`). Manter a aba aberta, de preferência numa janela própria, sem suspensão de aba.
2. Chamada 1 (configuração; o token vem do ambiente do operador e nunca é gravado em arquivo, localStorage ou log): `window.__CUP_CFG = { api: 'https://<site>', token: '<token>', rede: 'amazon', enviar: false };`
3. Chamada 2: o conteúdo inteiro de `scripts/chrome/cupons-24h.js`. Ele apaga `window.__CUP_CFG`, guarda o token só na closure e inicia.
4. Começar com `enviar: false` (simulação: lê, mostra em `status().linhas`, só manda batimento). Conferir rótulos e preços; reinjetar com `enviar: true` para gravar.
5. Acompanhar: `JSON.stringify(window.__cup.status())` (ciclos, último ciclo, pausa, erros, últimas linhas, batimento; nunca contém o token). Parar: `window.__cup.stop()` (manda batimento `parado/operador`; o vigia não avisa).

Opcionais em `__CUP_CFG`: `lote` (15), `pausaMs` ([6000, 11000], piso fixo de 4 s), `idleMin` (3, espera com fila vazia), `cuponsPaginaMin` (60), `cuponsUrl` (informar se a descoberta falhar), `shopeeLinkCurto` (`'pular'` por padrão; `'permitir'` só após o dono aceitar o clique de afiliado do link curto `s.shopee.com.br`).

### O que o loop faz

- A cada ciclo: `GET /api/ingest/cupons-revalidar?rede=...` (só itens devidos), lê cada item com pausa aleatória, `POST` das linhas (só com `enviar: true`) e `POST /api/ingest/cupons-heartbeat`. Fila vazia: espera `idleMin`; fila com itens: novo ciclo em 30 s.
- Amazon: página do produto em iframe oculto de mesma origem, esperando o navegador desenhar o selo; só os ids `#couponsInBuybox_feature_div`, `#couponBadgeRegularVpc`, `#couponTextpctch*`; nunca `sp_detail*` nem selo dentro de carrossel/patrocinado nem id com ASIN de outro produto. A página oficial de cupons (URL descoberta pelo menu; `status().cuponsUrl`) é lida no máximo 1 vez por hora, só leitura: reordena a fila (ASIN com cupom na lista vai primeiro) e cobre o selo quando o produto não o mostra (`fonte: lista-oficial`). Produto que não renderizou ou sem preço lido é descartado, nunca "sem cupom".
- Shopee: voucher na página do item (popup de mesma origem; sem popup, iframe). Link curto de afiliado é pulado (contador `puladosLinkCurto`) até o dono decidir.
- Bloqueio: captcha, login, 403 ou 429 do site pausam com recuo (15, 30, 60, 120 min; login 30, 60, 120) e retomam sozinhos; 5 captchas/403/429 seguidos (4 logins) PARAM o loop. Token recusado (401), origem recusada (403 do servidor) e popup bloqueado param de imediato. 503 do servidor (kill-switch) recua 10 a 60 min. Nunca contorna captcha.

### Heartbeat e vigia

- `POST /api/ingest/cupons-heartbeat?rede=amazon|shopee` (mesmo guard: origem fixa por rede + token; sem token 503; corpo até 2 KB; só números e códigos curtos). Grava em `collector_runs` (job `cupons-batimento`, status ok/partial=pausado/error=parado). Exige a migration 0025; sem ela a rota responde `gravado: false`, o painel mostra "indisponível" e o vigia não age.
- Painel `/admin/mensagens`, bloco "Cupom na agulha, por loja": linha "Último batimento do loop" por rede (idade, ciclo, estado, situação).
- Vigia (passo do `cicloAgenteCupons`, a cada ~5 min): rede com último batimento `ok` há mais de 60 min (inclui pausa longa e parada por captcha) gera aviso interno pelo canal já usado nos alertas da equipe (`sendTelegramMessage` para `TELEGRAM_ALERT_CHAT_ID`, exige `COLLECTOR_ALERTS=1`; sem isso só registra) e uma linha de auditoria em `collector_runs` (job `cupons-vigia`, `meta.evento = 'rede_sem_leitura'`). No máximo 1 aviso por rede a cada 6 h. Não avisa: rede que nunca bateu, sem sinal há mais de 7 dias, parada pedida pelo operador. O resumo do ciclo (`agente-cupons`) inclui `vigiaAvisados` e `vigiaRedesSemLeitura`.

### Runbook: reinjetar e o que fazer se cair

- Recarregou ou fechou a aba, ou o Chrome reiniciou: o loop morreu. Reinjetar (passos 2 e 3). Reinjetar sobre um loop vivo o substitui sem duplicar.
- `status().rodando === false` e `parou.motivo`:
  - `token_recusado`: token trocado ou errado; reinjetar com o token vigente.
  - `origem_recusada`: a aba não está no domínio da rede (ou `COUPON_ALLOWED_ORIGINS` mudou).
  - `popup_bloqueado`: permitir pop-ups para shopee.com.br e reinjetar.
  - `captcha_seguidos`, `http_403_seguidos`, `http_429_seguidos`, `login_seguidos`: o site está barrando. Abrir a aba, resolver o captcha ou entrar na conta como pessoa, esperar e reinjetar. Não reduzir pausas.
- `status().pausa` preenchido: recuo em andamento, nada a fazer; retoma em `pausa.ate`.
- `batimento.falhas` crescendo: o servidor não recebe o batimento (CSP da página, rede ou 5xx); ver `erros`. Sem batimento por 60 min o vigia avisa a equipe.
- Aviso "rede sem leitura" recebido: abrir a aba da rede, `status()`, aplicar o item acima. Próximo aviso da mesma rede só em 6 h.
- Aba em segundo plano: o Chrome limita timers (cerca de 1 por minuto após alguns minutos); o ritmo do loop (pausas de segundos entre itens) fica mais lento mas continua. Aba descartada pelo Chrome mata o loop; o vigia avisa.

Testes do loop: `npx tsx --conditions=react-server scripts/test-cupons-24h.ts` (batimento, guard, vigia e lógica pura do leitor; fixtures marcadas como tais, sem rede e sem banco).

### Não validado em produção

Seletores de preço da Amazon e da Shopee, os ids do selo e a URL da página de cupons são os indicados pelo dono/palpite; começar em simulação. A Shopee pode impedir iframe (X-Frame-Options) e popup sem gesto do usuário. O link normal da Shopee exige o `shopId`, que a fila ainda não entrega (só o link de afiliado da oferta): enquanto isso os itens de link curto são pulados.

## Gatilho CUPOM: mensagem "Cupom ativo" por oferta (2026-11-12)

Problema medido (dono, 2026-11-12): em 3 h saíram 291 mensagens e nenhuma levou cupom. O motor escolhia a oferta mais barata do produto e só anexava cupom se ESSA oferta tivesse cupom válido; os cupons válidos quase nunca coincidiam com a oferta escolhida. Solução: o cupom ganhou mensagem própria, por oferta (o bloco de cupom nas mensagens de preço continua como estava).

- **Quem gera** (`evaluateCoupon`, `group-rules.ts`): para cada produto com oferta de cupom que passa na agulha agora (`lookupItemCouponDetail`: as 4 conferências, só cupom que serve a qualquer comprador; "por seguir a loja", público restrito e compra mínima não atingida ficam fora). Entre as ofertas do produto com cupom válido, a de MAIOR desconto em reais. Gatilho `CUPOM`, classe `cupom`. Amazon fica fora (carimbo e regras próprias).
- **Texto** (`formatCouponMessage`): "CUPOM ATIVO", título, preço COM cupom rotulado e a loja, cupom (nome), desconto (R$ e %, com o preço do anúncio sem cupom), compra mínima e teto só se lidos, como ativar, "Outra oferta, sem cupom" quando existe oferta válida mais barata que o preço final, e o rodapé "Preço lido na página do anúncio em dd/mm às hh:mm". Sem "% OFF", sem "de R$ por R$", sem média, sem "menor preço".
- **Prioridade**: alerta > resumo > cupom > insight/achado > radar > plataforma.
- **Dedup**: 1 h por produto (só entre mensagens de cupom; uma mensagem de preço do mesmo produto não bloqueia a de cupom e vice-versa) e 1 h por cupom (mesma oferta/leitura divulgada em QUALQUER mensagem, inclusive o bloco de cupom de uma mensagem de preço).
- **Cota por loja**: no máximo 6 mensagens de cupom por hora por loja; em 24 h, cupom não passa de 40% das mensagens da loja (suave: só cede quando há mensagem de outro tipo na fila); a cota de tipo de 30% vale também para cupom. Pool: até 40 produtos de cupom por loja entram primeiro, por rodízio de tipo (`pool-diversidade.ts`).
- **Reconferência antes do envio** (`revalidateCandidate`): preço da oferta ao vivo na API oficial (ML/Shopee) e a agulha roda de novo com a hora do envio. Cupom que sumiu na releitura (leitura negativa mais nova), passou de 120 min, mudou de preço ou mudou de oferta: a linha expira e nada é enviado. Não há consulta de concorrentes (a mensagem não alega menor preço). Sem foto/cartão (o cartão mostraria o preço sem cupom).
- **Guardião**: ao enviar, a divulgação é registrada (`registrarDivulgacao`) e o guardião passa a acompanhar o fim do cupom.
- **Painel e log**: `/admin/mensagens` mostra "Cupom ativo (24 h): geradas, enviadas, na última hora"; o log do ciclo (`collector_runs` job `group-messages`, `meta`) grava `cupomGeradas`, `cupomEnviaveis`, `cupomNoPool`, `cupomPorLoja`, `cupomBarradas` (motivo da agulha -> quantidade) e `cupomEnviadas`; o resumo do ciclo traz `cupom`.
- **Kill-switch**: `GROUP_CUPOM=off` desliga o gatilho (pool e avaliação). Sem migration nova (o CHECK da 0031 já aceita `CUPOM` e `cupom`).
- **Operação**: simulação com dados reais, só SELECT: `npx tsx --conditions=react-server --env-file=.env.local scripts/simular-gatilho-cupom.ts`. Teste: `npx tsx --conditions=react-server scripts/test-gatilho-cupom.ts`.
- **Limite conhecido**: só o cupom do ANÚNCIO (preço com cupom lido na página) vira mensagem própria. Cupom de lista (loja/categoria) e código do dono continuam só no bloco das mensagens de preço, porque não têm preço final lido na página do item. O nome do cupom é o título da campanha quando a lista o trouxe; sem isso aparece "Cupom do anúncio".
