# Varredura do tipo de preco (R-69) - 2026-11-16

Somente leitura (nada apagado nem postado). Regra e causa: ver `docs/03-metodologia/FLUXO_MESTRE.md` R-69 e `docs/causa-raiz-tipo-preco-2026-11-16.md`.

> Residuo conhecido (NAO e tipo de preco): na Amazon o card da busca mostra a oferta em destaque (buybox) e o vendedor ROTACIONA (ex.: WEMAK x TNTinfoLoja x 3D MARKET no P2S Combo); o card nao informa o vendedor e `affiliate_offers.seller_id` esta vazio nas 2.894 ofertas ativas da Amazon. Por isso restam ofertas oscilando entre vendedores com a assinatura abaixo. Pendencia da fila #128 (gravar o vendedor do buybox por cotacao a partir da leitura de pagina, que ja o le).

## (a) Queda/alta falsa por troca de tipo de preco, por rede (45 dias de cotacoes)

Assinatura: cotacoes consecutivas com razao 0,95 ou 0,90 (ou igual a lista do outro lado), com RETORNO ao valor anterior em ate 2 leituras. ML so ofertas com vendedor (placeholder fora).

| rede | ofertas com troca | pares de troca | leitura |
|---|---|---|---|
| amazon | 22 | 44 | Pix x cheio: CAUSA PROVADA (card com "a vista no Pix" x card sem); corrigido na origem e no historico provado |
| mercado-livre | 346 | 129251 | a coleta grava o campo unico `price` da API; nao existe leitura Pix/meli+ separada: a assinatura aqui e PROMOCAO real que liga e desliga (preco que volta ao original), nao tipo de preco |
| shopee | 36 | 82 | a coleta grava o menor preco entre os modelos do anuncio: a assinatura e variacao real de preco, nao tipo; sem leitura de preco Pix |

Amazon, historico PROVADO e corrigido (cheio como preco da serie, Pix como atributo, backup NDJSON `docs/backups/tipo-preco-amazon-124-2026-11-16T01-52-50-355Z.ndjson`): **29 cotacoes em 18 ofertas**.

| oferta | cotacao | preco gravado (era Pix) | preco cheio (agora) | lida em |
|---|---|---|---|---|
| c1615e04 | 3512722 | R$ 1.804,21 | R$ 1.899,99 | 2026-11-11 21:20Z |
| c1615e04 | 3514848 | R$ 1.799,99 | R$ 1.899,05 | 2026-11-11 23:48Z |
| c2d63b06 | 3515532 | R$ 284,04 | R$ 298,99 | 2026-11-12 00:25Z |
| e6b0594c | 3516190 | R$ 161,90 | R$ 170,90 | 2026-11-12 01:12Z |
| 810b84ab | 3516193 | R$ 989,10 | R$ 1.099,00 | 2026-11-12 01:13Z |
| 3cc983e3 | 3521757 | R$ 1.799,05 | R$ 1.899,00 | 2026-11-12 04:53Z |
| e6b0594c | 3525133 | R$ 161,90 | R$ 170,90 | 2026-11-12 07:50Z |
| c2d63b06 | 3528117 | R$ 284,04 | R$ 298,99 | 2026-11-12 10:53Z |
| fe98832d | 3540161 | R$ 2.564,04 | R$ 2.698,99 | 2026-11-12 16:26Z |
| 424c8a1b | 3547171 | R$ 142,02 | R$ 149,87 | 2026-11-12 19:18Z |
| 70708089 | 3551819 | R$ 4.084,05 | R$ 4.299,00 | 2026-11-12 21:24Z |
| 97f7db5c | 3555338 | R$ 4.019,00 | R$ 4.249,00 | 2026-11-13 00:02Z |
| b3dd51c1 | 3558263 | R$ 2.658,10 | R$ 2.798,00 | 2026-11-13 02:19Z |
| c3eaeea4 | 3559465 | R$ 1.495,31 | R$ 1.574,02 | 2026-11-13 03:02Z |
| b3dd51c1 | 3563100 | R$ 2.649,17 | R$ 2.789,07 | 2026-11-13 04:51Z |
| 5f5ab3ea | 3563613 | R$ 806,55 | R$ 849,00 | 2026-11-13 05:24Z |
| c2d63b06 | 3576559 | R$ 284,04 | R$ 298,99 | 2026-11-13 13:58Z |
| bad53f23 | 3580475 | R$ 1.519,05 | R$ 1.599,00 | 2026-11-13 15:19Z |
| e70622bc | 3580861 | R$ 107,90 | R$ 113,90 | 2026-11-13 15:26Z |
| 5d8c9706 | 3595129 | R$ 232,41 | R$ 259,00 | 2026-11-13 21:21Z |
| bda115f6 | 3597940 | R$ 1.034,10 | R$ 1.090,59 | 2026-11-13 22:45Z |
| 424c8a1b | 3599191 | R$ 142,02 | R$ 149,87 | 2026-11-13 23:37Z |
| cb9bb296 | 3599473 | R$ 210,51 | R$ 233,90 | 2026-11-13 23:49Z |
| fe98832d | 3604263 | R$ 2.429,10 | R$ 2.699,00 | 2026-11-14 03:10Z |
| c2d63b06 | 3624553 | R$ 284,04 | R$ 298,99 | 2026-11-14 15:14Z |
| e70622bc | 3635976 | R$ 107,90 | R$ 113,90 | 2026-11-14 20:09Z |
| f2dadb6c | 3679268 | R$ 8.074,99 | R$ 8.499,99 | 2026-11-15 19:41Z |
| c2d63b06 | 3681321 | R$ 284,04 | R$ 298,99 | 2026-11-15 20:24Z |
| f2dadb6c | 3688713 | R$ 8.074,90 | R$ 8.499,90 | 2026-11-16 01:17Z |

## (b) "Abaixo da media", "minimo de 15 dias", "novo minimo" e queda calculados sobre cotacao de tipo diferente: mensagens PUBLICADAS (7 dias)

Ofertas da Amazon com troca de tipo (provada ou pela assinatura): **38**. Mensagens enviadas dessas ofertas nos ultimos 7 dias: **22**; dessas, com o PRECO da mensagem = lado Pix da troca (a media, o minimo e o "abaixo da media" saem do mesmo tipo misturado): **9**; outras 1 mensagens com preco no lado cheio mas cuja media/minimo de 15 dias saiu de serie com Pix misturado (oferta com cotacao Pix provada).

Nada foi apagado nem corrigido no Telegram. Lista para o dono decidir:

| group_message_id | canal | gatilho | enviado | oferta | preco da mensagem | e o preco Pix da troca? | texto |
|---|---|---|---|---|---|---|---|
| f67139c8 | tg | G2 | 2026-11-12 03:00Z | c1615e04 Impressora 3D Bambu Lab A1 Mini - A1M, Bivolt | R$ 1.799,99 | SIM | [Impressão 3D] Impressora 3d Bambu Lab A1 Mini R$ 1.799,99 na Amazon • Vs. média do mercado: 26,3% abaixo (R$ 643,72); média R$ 2.443,71 Comprar: https://www.amazon.com.br/dp/B0DMQKNPR8?tag=manusmonteiro-20 Monitoramento • Leitura: favorável (abaixo da média e |
| 2967e319 | tg | G2 | 2026-11-12 07:06Z | 3cc983e3 Impressora 3D Bambu Lab A1 Mini Automática Prata Bivolt | R$ 1.799,05 | SIM | [Impressão 3D] Impressora 3d Bambu Lab A1 Mini R$ 1.799,05 na Amazon • Vs. média do mercado: 27,6% abaixo (R$ 684,88); média R$ 2.483,93 Comprar: https://www.amazon.com.br/dp/B0H6BT1ZRQ?tag=manusmonteiro-20 Monitoramento • Leitura: favorável (abaixo da média e |
| f9493937 | tg | G2 | 2026-11-12 08:31Z | e70622bc Filamento PLA Voolt3D Linha Sólida 1,75mm High Speed – Para  | R$ 107,90 | SIM | [Impressão 3D] Voolt3D PLA Filamento Pla 1.75mm 1kg R$ 107,90 na Amazon • Vs. média do mercado: 15,8% abaixo (R$ 20,23); média R$ 128,13 Comprar: https://www.amazon.com.br/dp/B09HMWYBN7?tag=manusmonteiro-20 Monitoramento • Leitura: abaixo da média do mercado • |
| 8367550c | tg | G2 | 2026-11-12 09:37Z | e70622bc Filamento PLA Voolt3D Linha Sólida 1,75mm High Speed – Para  | R$ 107,90 | SIM | [Impressão 3D] Voolt3D PLA Filamento Pla 1.75mm 1kg R$ 107,90 na Amazon • Vs. média do mercado: 17,2% abaixo (R$ 22,36); média R$ 130,26 Comprar: https://www.amazon.com.br/dp/B09HMWYBN7?tag=manusmonteiro-20 Monitoramento • Leitura: abaixo da média do mercado • |
| 2b1c466b | tg | G2 | 2026-11-12 10:38Z | e70622bc Filamento PLA Voolt3D Linha Sólida 1,75mm High Speed – Para  | R$ 107,90 | SIM | Voolt3D PLA Filamento Pla 1.75mm 1kg R$ 107,90 na Amazon • Vs. média do mercado: 17,2% abaixo (R$ 22,36); média R$ 130,26 Comprar: https://www.amazon.com.br/dp/B09HMWYBN7?tag=manusmonteiro-20 Monitoramento • Leitura: abaixo da média do mercado • Menor registra |
| 8ef57f77 | tg | G2 | 2026-11-13 00:17Z | 9079c8a4 Teclado Mecânico Gamer Sem Fio Redragon Kumara PRO RGB Bluet | R$ 239,40 | SIM | Teclado Mecanico Kumara Pro Wireless Sw Blue Redragon Branco R$ 239,40 na Amazon • Vs. média do mercado: 29,9% abaixo (R$ 102,16); média R$ 341,56 Comprar: https://www.amazon.com.br/dp/B0C1QFVYQJ?tag=manusmonteiro-20 Monitoramento • Leitura: favorável (abaixo  |
| 0328ca01 | tg | G2 | 2026-11-13 08:18Z | 9079c8a4 Teclado Mecânico Gamer Sem Fio Redragon Kumara PRO RGB Bluet | R$ 239,40 | SIM | Teclado Mecanico Kumara Pro Wireless Sw Blue Redragon Branco R$ 239,40 na Amazon • Vs. média do mercado: 28,3% abaixo (R$ 94,26); média R$ 333,66 Comprar: https://www.amazon.com.br/dp/B0C1QFVYQJ?tag=manusmonteiro-20 Monitoramento • Leitura: favorável (abaixo d |
| d41c2de3 | tg | G2 | 2026-11-13 23:39Z | ac14c27a GARRAFA SQUEEZE TERMICA 700ML PTK ICE VERMELHA | R$ 34,75 | SIM | GARRAFA SQUEEZE TERMICA 700ML PTK ICE R$ 34,75 na Amazon Comprar: https://www.amazon.com.br/dp/B0FPZPF8XW?tag=manusmonteiro-20 Monitoramento • Black Friday: faltam 14 dias (27/11); acompanhamos este produto desde 12/11 para conferir se o desconto é real Preço  |
| 0ea35e3f | tg | G2 | 2026-11-14 01:43Z | 5d8c9706 Until Dawn - PS5 | R$ 232,41 | SIM | Until Dawn - PS5 - Original PS5 · mídia física R$ 232,41 na Amazon • Vs. média do mercado: 10,6% abaixo (R$ 27,44); média R$ 259,85 Comprar: https://www.amazon.com.br/dp/B0DDCV6P9C?tag=manusmonteiro-20 Monitoramento • Leitura: abaixo da média do mercado • Meno |

## (b2) Painel privado (impressoras): avisos de queda dos ultimos 8 dias

Avisos de queda/gatilho registrados: **18**; da Amazon: **2**. Para cada um da Amazon, a oferta e o preco do aviso (chave `oferta|q|centavos`) contra a serie corrigida:

| quando | oferta | chave | preco do aviso e Pix? (cotacao provada) |
|---|---|---|---|
| 2026-11-16 00:39Z | 400ef656 Impressora 3D Bambu Lab P2SC - P2S + AMS (Combo) - 220V | card|2e4a5bd1-27d7-42c6-bc62-dfa1d5eace45|amazon|Itaú Mastercard 15% | nao provado |
| 2026-11-16 01:21Z | f2dadb6c Impressora 3D Bambu Lab P2SC - P2S + AMS (Combo) - 220V | f2dadb6c-324e-495f-8347-ed19b7dd2a05|q|807490 | SIM: aviso falso (troca Pix x cheio) |

Caso do dono: aviso `f2dadb6c...|q|807490` (R$ 8.074,90, 2026-11-16 01:21Z) = cotacao Pix provada do P2S Combo (8.499,90 x 0,95): aviso falso.

## (c) Cupom/beneficio lido de texto de pagina (coordenado com o cofre de cupons, R-64 a R-68)

Mensagens CUPOM enviadas no Telegram em 7 dias: **232**; sem leitura com campaign_id nos 30 min anteriores ao envio: **177**. A lista nominal dos avisos de anuncio sem prova (46 em 48 h, com group_message_id, canal, horario e texto) e do agente do cofre: `docs/avisos-cupom-sem-prova-2026-11-16.md`. Esta varredura NAO a duplica nem edita `src/lib/coupons`, `src/server/coupons`.

## (d) Preco-isca (R-61): sobrou mensagem?

Mensagens enviadas em 7 dias com preco igual a uma cotacao marcada como isca VIGENTE, enviadas DEPOIS da marca: **0**. Mensagens (qualquer horario) de ofertas hoje em quarentena por isca: **27** (enviadas antes da marca; historico, nao reabre).

