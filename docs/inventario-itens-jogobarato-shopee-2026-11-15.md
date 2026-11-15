# Inventário: 3 ofertas Shopee do Jogo Barato (2026-11-15)

Pedido do dono: comparar três ofertas do concorrente (Shopee, "cupom de 5%") com o nosso rastreio e colocá-las no fluxo se faltarem.

## Limite da medição (item A)

A API de afiliados da Shopee não pôde ser consultada nesta sessão: `SHOPEE_AFFILIATE_APP_ID/SECRET` são variáveis "Sensitive" na Vercel (o `env pull` devolve só o marcador) e não existem no `.env.local`; o navegador está desconectado. Logo não achei o anúncio do concorrente pelo `itemId` na API. O casamento abaixo é por aritmética do preço contra o nosso banco (preços e histórico lidos pela própria API em coletas anteriores).

## Como o preço do print se decompõe

Os três preços batem ao centavo com: `preço no 12x = preço Shopee × 0,95` (voucher de 5% no carrinho) e `preço no pix = preço no 12x × 0,92` (8% do pix). Portanto o preço que a Shopee mostra (e a API devolve) é o preço cheio, não o preço do pix. A premissa "R$ 3.999 / 1.747 / 1.231 não estão no rastreio" vinha de dividir o preço do pix por 0,95, o que está errado.

| Item | 12x | pix | Preço cheio Shopee | Oferta nossa |
|---|---|---|---|---|
| Switch Lite Turquesa | 1.272,05 | 1.170,29 | 1.339,00 (1.339 × 0,95 = 1.272,05 exato) | `469067d8`, Webfones, `shopee-58265581125`, master `b0996ccb` |
| OLED + Mario Wonder | 1.804,05 | 1.659,73 | 1.899,00 (× 0,95 = 1.804,05 exato) | `4678cc90`, Webfones, `shopee-58215579449`, master `a4ff041e` |
| Switch 2 + Mario Kart + NSO | 3.999,00 | 3.679,08 | 4.199,00 se o voucher tem teto de R$ 200 (5% = 209,95; 4.199 − 200 = 3.999); hipótese, não confirmada | `5b30e8ea` (NegociuN, R$ 4.199, master `4013d841`) ou `dc6f00cb` (RB Global, R$ 4.199, master `c8366787`) |

## Item a item: por que parecia fora do fluxo

1. **Switch Lite Turquesa (Webfones, R$ 1.339).** Estava rastreado (coletado a cada 30 min, último preço 1.339 em 2026-11-15) mas ESCONDIDO: o master `b0996ccb` (8 ofertas Shopee ativas e 12 do Mercado Livre) tinha sido rejeitado em 2026-11-14 11:53 por `foto_com_mao` (lote `foto-com-mao-2026-11-14T11-53-53-158Z`). Conferi as imagens: a foto do master e a da Webfones não têm mão; várias ofertas (inclusive 7 do ML) usam a arte impressa da caixa oficial, que traz mãos ilustradas, e isso é falso positivo. Só a oferta da ARgames (`95ea41a5`, "Novinho", R$ 1.200) tem mão real segurando a caixa.
2. **OLED + Wonder (Webfones, R$ 1.899).** Estava rastreado e visível (master aprovado). Nosso preço atual é 1.999 porque o preço da oferta alterna na API: 1.899 às 2026-11-15 03:11 e 2026-11-14 04:45, 1.999 às 05:23 e 10:47, 2.699 em 11-13 20:40. O concorrente pegou a janela de 1.899. Nada a corrigir na identidade.
3. **Switch 2 + Mario Kart + NSO (R$ 3.999 no 12x).** Não achei oferta Shopee de R$ 3.999 com Mario Kart no banco. Hipótese acima: o item é o de R$ 4.199 (NegociuN tem título "Switch 2 + Mario Kart World", sem citar a assinatura NSO). Não dá para confirmar sem a API ou o `itemId`. Nada foi criado "no chute".

## O que NÃO é a causa (medido)

- Teto de resultados/busca ranqueada/cota: o catálogo Shopee já tem dezenas de ofertas de Switch (Lite, OLED, Switch 2) e os três itens estavam nele; a cobertura não foi o gargalo aqui.
- `catalogGate` NULL: 104 masters ativos (de 8.227 com oferta ativa), todos de games (76 jogos, 11 consoles, 17 com oferta ativa em acessórios), todos criados em 2026-11-14/15 pela cobertura Shopee de games (`criarMasterGame`; por convenção o porteiro devolve `{}` quando aprova). NULL NÃO esconde: `catalogGateVisibleSql` só exclui `review`/`rejected`, e a mensagem do grupo só bloqueia `review`/`rejected`. Os departamentos (`masterAprovadoSql`, aprovação por inclusão) não incluem games. Só o sitemap trata NULL como aprovado.
- Voucher: a API de afiliados não devolve preço com voucher. O projeto já tem a regra (`src/lib/coupons/page-read.ts`: leitura do rótulo na página do item, status `derivado_do_rotulo`, com teto de desconto via `finalPriceByRule`), mas `offer_coupon_reads` tem 0 leituras da Shopee (só ML, Amazon). Falta o loop de leitura na aba logada da Shopee, que depende do Chrome do dono. Decisão/operação para o dono: ligar a leitura Shopee e então o preço com voucher aparece por regra existente; nenhum preço foi inventado.

## Correções aplicadas (script com dry-run, backup e rollback)

`scripts/corrigir-itens-jogobarato-2026-11-15.ts`, aplicado em 2026-11-15; backup `docs/backups/itens-jogobarato-2026-11-15T06-33-48-570Z.ndjson`, log com comando de rollback `docs/backups/itens-jogobarato-log-2026-11-15T06-33-48-570Z.json`.

- `4704eddc` retipado de `game` para `console` (título "Bundle Nintendo Switch 2 + Mario Kart World", ~35 ofertas ML e 1 Amazon; `classifyCatalogItem` = console/bundle). Continua como estava o fato de ser mais um master do mesmo produto de `374675ec` e `4013d841`: consolidar é decisão à parte.
- `b0996ccb` restaurado para `approved` (veredito anterior do bloco q4q5), liberando a oferta da Webfones e as outras 7 da Shopee.
- Oferta `95ea41a5` (ARgames, mão real) em quarentena por oferta, em vez de derrubar o master inteiro.
- Porteiro nos masters sem veredito do caso (`89177877`, `613b1201`, `f9502f26`, `20980d7b`, `96b98a87`): todos `approved/sem_sinal_de_risco`, gravados como aprovados (`approvedBy: porteiro:jogobarato-2026-11-15`).

## Causa geral e proposta (não aplicada)

`foto_com_mao` é gravado no MASTER, mas a foto é de UMA oferta; um master agrega vários vendedores. Hoje: 85 masters rejeitados por foto com mão (3 consoles, 82 jogos), com 260 ofertas ativas escondidas (inclui as 168 de jogos e 12 de consoles da Shopee). A classificação visual confunde arte impressa da caixa oficial com mão real (conferido em `b0996ccb` e em `9045adf9`, Switch Lite 32GB com 3 ofertas Shopee, que continua rejeitado). Proposta: (1) aplicar `foto_com_mao` por oferta (quarentena da oferta cuja própria imagem tem mão), nunca no master com 2+ vendedores; (2) o classificador deve ignorar mão ilustrada na caixa. Isso afrouxa, não cria barreira, mas desfaz decisão de lote do dono em 85 masters; por isso espera o aval dele. Também sugerido: gravar `approved` explícito em `criarMasterGame` para fechar os NULL (opcional, sem efeito visível).
