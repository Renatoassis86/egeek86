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

## Atualização 2026-11-15: causa geral aplicada (autorizada pelo dono)

Foto com mão passou a valer por OFERTA, e só mão REAL conta (mão ilustrada ou impressa na caixa oficial não conta). Isso substitui a seção "Causa geral e proposta (não aplicada)" acima.

- **Classificação visual:** 198 fotos distintas (as dos 84 masters rejeitados por `foto_com_mao` e as de suas 260 ofertas ativas), abertas em tamanho cheio por 6 classificadores em paralelo, com amostra conferida por mim: 98 `mao_real`, 100 `sem_mao_real`. Mapa por URL: `docs/backups/foto-mao-real-por-url-2026-11-15.json`. Oferta sem imagem própria herda a classe da foto do master.
- **Script:** `scripts/reclassificar-foto-mao-por-oferta.ts` (dry-run, `--apply --por`, backup NDJSON, log, `--rollback`, guarda otimista, lotes de 50). Backup `docs/backups/foto-mao-oferta-2026-11-15T06-42-09-729Z.ndjson`, log `docs/backups/foto-mao-oferta-log-2026-11-15T06-42-09-729Z.json`.
- **Resultado (conferido por SELECT antes/depois):**
  - masters rejeitados por foto: 84 -> 0 (o 85º, `b0996ccb`, já tinha sido liberado antes);
  - ofertas ativas nesses masters: 260; 99 foram para quarentena por mão real (motivo `foto_com_mao`, gravado no log e no backup, pois a tabela de ofertas não tem coluna de motivo);
  - 64 masters voltaram a visíveis, com 161 ofertas ativas liberadas;
  - 20 masters continuam barrados porque o veredito anterior deles já era `review`/`rejected` por outro motivo (19 pelo `catalogGateAnterior` do backup, 1 pelo porteiro: `4498f7f6`, `porta_cartao_organizador`). Usado/retrô continuam barrando; `catalogGate.manual` seria respeitado (nenhum caso).
  - confirmação: a oferta `469067d8` (Switch Lite turquesa, Webfones) está visível, master `approved`.
- **Fluxo futuro:** a regra mora em `scripts/reclassificar-foto-mao-por-oferta.ts` (cabeçalho documenta o critério). Para fotos novas: classificar por URL no mesmo formato de mapa e rodar sem `--liberar-masters`, o que só põe em quarentena as ofertas ativas cuja imagem é `mao_real` e nunca mexe no veredito do master. `scripts/aplicar-foto-com-mao.ts` (rejeição de master) só aplica com `--legado-master`. Não há classificador automático no código: a classificação visual continua sendo etapa manual/assistida.
- **Duplicados `4704eddc`, `374675ec`, `4013d841`** (todos Switch 2 + Mario Kart World, consoles aprovados, com ofertas Shopee/ML/Amazon): consolidação NÃO feita, aguarda autorização.

## Consolidação Switch 2 + Mario Kart World (autorizada pelo dono, 2026-11-15)

Canônico `4704eddc` ("Bundle Nintendo Switch 2 + Mario Kart World": aprovado, console, nome mais limpo, 32 ofertas ativas contra 10 e 2). Absorvidos `374675ec` e `4013d841`.

- **Identidade conferida:** 68 ofertas nos 3 masters, todas Switch 2 256 GB preto + Mario Kart World; nenhum título cita NSO/assinatura, outra região (Hong Kong/importado), outro jogo ou usado (o script aborta se houver). Os bundles com 3 meses de NSO (`613b1201`, `74ec16c4`) e Hong Kong (`f9502f26`) continuam masters separados.
- **Resultado (SELECT):** canônico 32 -> 44 ofertas ativas (36 -> 68 no total), menor preço R$ 3.639,23; os dois absorvidos ficam com 0 ofertas, arquivados (`attributes.mergedInto`, nada apagado). Estado diário de 15/11 recalculado (menor 3.639,23, média por oferta/dia 5.132,96, 26 ofertas, 18 lojas, qualidade `complete`); 15 dias recalculados (de 2026-11-01).
- **Histórico:** `price_daily_offer` das ofertas movidas passou para o canônico; `price_daily_state` do canônico foi recalculado pelo código do job; as linhas antigas de estado dos absorvidos ficam como histórico deles. Slugs: as páginas públicas são por slug de oferta (preservado); `/monitoramento/comparar/<id antigo>` agora redireciona ao canônico.
- **Script:** `scripts/consolidar-switch2-mkw-2026-11-15.ts` (dry-run, `--apply --por`, backup NDJSON, log, `--rollback`, transação curta por duplicado). Backup `docs/backups/consolidar-switch2-mkw-2026-11-15T07-35-13-185Z.ndjson` (+ `-price_daily_state` e `-price_daily_offer`), log `docs/backups/consolidar-switch2-mkw-log-2026-11-15T07-35-13-185Z.json`.
- Pendência de arrumação: o canônico mantém `attributes.identidade = nao_identificado` e o motivo `descoberta_duvida` no gate, de quando era "game"; não alterei.
