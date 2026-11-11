# Fase de formação das lojas que não são games

Decisão do dono em 2026-11-11 (ata: `docs/conselho/atas/2026-11-11-fase-de-formacao-outras-lojas.md`). Vale para impressão 3D, tecnologia, livros, casa (eletrodomésticos), eletroeletrônicos e esporte. Games e consoles (vertical `games`) não mudam.

## Onde mudar a data
Uma linha: `DATA_DE_CORTE_FORMACAO` em `src/lib/messaging/fase-formacao.ts` (hoje `2026-11-30`, dia em Brasília). A função `emFaseDeFormacao(vertical, now)` só olha o relógio: na virada (00:00 de Brasília) a estrutura dos games entra sozinha, sem deploy.

## Antes da data de corte
| Item | Formação | Depois (= games) |
|---|---|---|
| Média | simples: preço atual de cada oferta ativa, uma por oferta (Mercado Livre e Shopee; sem Amazon) | média oferta-dia do selo, elegível |
| Amostra mínima da média | 3 ofertas (dentro da faixa 0,35x a 3x a mediana, para um anúncio absurdo não decidir) | 3 ofertas, 5 oferta-dias, 14 dias |
| Lojas distintas | 2 | 3 |
| Régua de queda | só "abaixo da média" (piso 0,1%) | 10% |
| Fora da média | Open Box/usado/região/edição diferente no título, quarentena, preço fora da faixa, identidade `incerta` | idem, com a trava de identidade validada |

Mantido nas duas fases: dado real (nada sintético), 1 h entre reenvios do mesmo produto, só produto novo e em linha, frescor e reconfirmação do preço, faixas de risco (retido/aprovação).

## Texto ao cliente
Com menos de 5 ofertas na média (`MIN_AVG_OFFERS_CLAIM`) o texto nunca diz "X% abaixo da média" nem "abaixo da média": mostra "Média simples: R$ Y (N ofertas ativas; amostra pequena)". Nunca aparece a palavra "afiliado".

## Identidade incerta
`OfferFact.identidade = 'incerta'` (a ser preenchido pela fila de classificação, que outro agente cria) tira o item da média simples e da escolha da oferta durante a formação. Enquanto o campo não for preenchido pelo carregador, nada muda (ausente = certa).

## Aceleração da coleta
Ver a ata (números antes/depois). Freios de quota mantidos: teto horário de 3000 chamadas do job Shopee (somado de `collector_runs`), pacer de 480 ms, parada em 10030/auth/access, cap de chamadas do ML por execução.

## Testes
`scripts/test-regua-adaptativa.ts` (virada antes/depois com `now`), `test-mensagens-grupo`, `test-mensagens-motor-v2`, `test-mensagens-onda2`, `test-ampliar-amostra-params`.
