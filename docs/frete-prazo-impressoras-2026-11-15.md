# Frete e prazo das impressoras 3D até o CEP 58035090 (#118, 2026-11-15)

## Fontes escolhidas (medidas em 15/11)
- **Mercado Livre: API oficial no servidor.** `GET /items/{item_id}/shipping_options?zip_code=58035090` responde 200 com o token OAuth do app (terceiros). Campos usados: `options[].cost` (o que ESTE comprador paga; 0 = grátis), `display=recommended`, `estimated_delivery_time.date` (mais cedo) e `.offset.date` (mais tarde). `GET /items/{id}` devolve 403 (não serve); o anúncio vem de `/products/{catalogo}/items` (já usado pela coleta), que traz `shipping.logistic_type` (fulfillment = Full, cross_docking, xd_drop_off, drop_off, self_service = Flex). Zero requisição nova na aba do Chrome (sem risco de captcha).
- **Amazon: texto da própria página do produto**, lido pelo loop `public/loops/cupons-24h.js` (v1.1.0), que já abre o produto; sem requisição extra. Lê `#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE` (ou `#deliveryBlockMessage`), `#glow-ingress-block` (CEP) e o vendedor. Só leitura.
- **Ressalva do ML**: o custo e o prazo vêm para a conta do dono (a resposta traz `buyer.loyalty_level`); "grátis" pode refletir benefício da conta (Meli+). Sempre é o que o dono veria.
- **Ressalva da Amazon**: o CEP da conta do dono é **58035000**, não 58035090 (mesmo bairro). Guardamos o CEP lido e a linha mostra "(CEP lido 58035000)"; nunca se diz 58035090 sem ser. Endereço da conta não foi alterado.

## Tabela `offer_shipping_quotes` (migration 0054, rollback `0054_offer_shipping_quotes.rollback.sql`)
PK (offer_id, zip), uma linha por oferta e CEP, upsert (guarda só a última leitura): `offer_id uuid`, `zip text`, `cost_cents int` (0 = grátis), `free bool`, `eta_from date`, `eta_to date`, `eta_days_min/max int` (dias corridos desde a leitura), `logistic text` (tipo do ML), `carrier`, `sold_by` (Amazon), `item_id` (ML), `source` ('ml_api'|'amazon_pagina'), `raw_text` (Amazon), `read_at timestamptz`. Aplicada com `scripts/aplicar-migration-0054.ts` (--apply / --rollback; backup em `docs/backups/`).

## Contrato de leitura (para as mensagens)
- Puro: `src/lib/shipping/frete-prazo.ts` — `linhaFretePrazo(cotacao, now)`, `detalhesEntrega(cotacao, now)`, `cotacaoValida`, `melhorCotacao`, `CEP_ALVO`.
- Servidor: `src/server/shipping/frete-prazo.ts` — `linhasFretePrazoPorOferta(offerIds, now)` devolve `Map<offerId, string>`; `cotacoesPorOferta(offerIds)` devolve `Map<offerId, Cotacao>`.
- Linhas: "Frete grátis · chega de 26/11 a 27/11 (CEP 58035090)", "Frete grátis · chega até qui, 19/11 (CEP 58035090)", "Frete R$ 201,00 · chega de 24/11 a 26/11 (CEP lido 58035000)", **"Prazo ainda não lido"** (sem leitura ou leitura com mais de 12 h; nunca inventa). `detalhesEntrega`: "Full", "Envio Flex", "Mercado Envios (agência)", "vendido e enviado por <loja>".
- A leitura NÃO depende da flag; a flag só liga a captura.

## Captura e cadência
- ML: `capturarFreteMl` dentro do cron `group-messages` (depois dos painéis; usa só o tempo que sobra, até 15 s e 40 chamadas por minuto; 250 ms entre chamadas; 429 pausa 10 min). P2S Combo e P1S Combo a cada 30 min, demais impressoras em rodízio a cada 3 h (mais antigas primeiro). Registra em `collector_runs` job `frete-prazo-impressoras` (meta: candidatas, lidas, sem_anuncio, erros, chamadas, limitado_429, pausa_ate).
- Amazon: gravação no POST de `/api/ingest/cupons-revalidar?rede=amazon` (campo `entrega` da linha). Só passa a gravar quando o dono reinjetar o loop v1.1.0 na aba da Amazon.
- Flag **`FRETE_PRAZO_IMPRESSORAS`** (1/on/true liga; padrão desligada). Desligar = remover/zerar na Vercel; rollback total = `scripts/aplicar-migration-0054.ts --rollback`.

## Cobertura medida (15/11, 1 rodada manual de 102 chamadas)
Anúncios ML ativos de impressora: 1.071. P2S Combo + P1S Combo: 55 de 68 lidas. Demais: 24 de 1.003 (o rodízio de 3 h completa). Sem leitura: ofertas sem vendedor/anúncio identificável (links meli.la sem vendedor) ou anúncio ambíguo no catálogo; ficam "Prazo ainda não lido".
