# Queda falsa por tipo de preço da Amazon (causa raiz) - 2026-11-16

Caso: Telegram privado "Queda de preço, Impressora 3D Bambu Lab P2SC P2S+AMS (Combo) 220V: R$ 8.074,90 (era R$ 8.499,90, queda de 5%)" (oferta f2dadb6c, ASIN B0G87M7V8Z, 01:21Z). **Não foi queda**: 8.499,90 x 0,95 = 8.074,905.

## Prova (leitura da página e dos cards reais, aba logada, só leitura)
| Tipo de card | O que a Amazon mostra | O que o leitor v1.0.0 gravava |
|---|---|---|
| com Pix (P2S 220V hoje) | `a-price` R$ 9.499,05 (destaque = Pix) + `a-text-price` R$ 9.999,00 (cheio, sem "De:") + "à vista no Pix e NuPay" + "em até 12x de R$ 933,24 com juros" | p = 9.499,05 (Pix) como "o preço", l = 9.999,00 |
| sem Pix | `a-price` R$ 8.499,90 + "em até 12x de R$ 793,32" (a ÚNICA a-text-price é a PARCELA) | p = 8.499,90, **l = 793,32 (parcela gravada como "lista", o `list_price_cents = 79332` do histórico)** |
| promoção "De:" | `a-price` R$ 8.459,10 + "De: R$ 9.999,00", sem texto de Pix | p = 8.459,10, l = 9.999,00 (correto) |

Histórico real da oferta: 15/11 16:30 8.499,90 (l = parcela) -> 19:41 8.074,99 (l = 8.499,99) -> 22:52 8.499,90 -> 16/11 01:17 8.074,90 (l = 8.499,90). O vendedor do buybox também rotaciona (WEMAK 8.499,90, TNTinfoLoja 8.499,99, 3D MARKET 9.999,00 hoje), mas a diferença de 5% é o Pix.

## Por que passou
Nenhum elo perguntava "o preço lido é de que TIPO?": o leitor não olhava o texto "à vista no Pix"; o ingest gravava p sem tipo; `recordPriceSnapshot` chama toda diferença de "mudança"; o painel compara ciclo a ciclo; testes (#120) cobriam "qual linha da sanfona", não "Pix x cheio".

## Correção (R-69)
Série da Amazon = preço CHEIO; Pix = atributo (`pix_cents`); queda só entre leituras do mesmo tipo; Pix sem cheio legível não grava. Detalhes, números da varredura e pendências: `FLUXO_MESTRE.md` R-69, `docs/varredura-tipo-preco-2026-11-16.md`, fila #129.
