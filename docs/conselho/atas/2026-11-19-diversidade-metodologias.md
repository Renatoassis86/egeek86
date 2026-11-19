# Diversidade por loja: metodologias testadas (2026-11-19)

Pedido do dono: "poucos itens por loja, fica mandando a mesma coisa" (Esporte so bola, Casa so air fryer) e "as marcas de Beleza nunca apareceram".
Harness: `scripts/sim-diversidade.ts` (so le; snapshot de 790 propostas pendentes + 1.586 enviadas em 24 h; N = 60 por loja). Metodos puros em `src/lib/messaging/diversidade-selecao.ts`.

## Causa raiz medida (nao e a ordem da fila)
`pickProductIds` so aceita oferta com preco confirmado nos ultimos 180 min (`DETECT_MAX_AGE_MIN`). Com os coletores `collect-vertical:*` e a semeadura pausados (incidente de I/O de 18/11), so o que ainda e atualizado entra no pool:

| Loja | Ofertas ativas | Confirmadas em 3 h | Em 24 h |
|---|---|---|---|
| games | 14.978 | 13.648 | 13.969 |
| eletroeletronicos | 9.070 | 50 | 7.778 |
| tecnologia | 6.721 | 549 | 6.298 |
| eletrodomesticos (Casa) | 3.267 | 543 | 2.801 |
| livros | 2.597 | 6 | 2.422 |
| esporte | 2.586 | 724 | 2.244 |
| beleza | 2.058 | **0** | 2.057 |
| impressao3d | 1.845 | 41 | 1.661 |

Fila pendente: Casa 5 tipos / 57 itens, Esporte 10 tipos (bola 56%), Impressao 3D 1 tipo / 6 itens, Livros 6 tipos / 18 itens, Beleza 0.

**Beleza:** 264 masters e 2.058 ofertas ativas (todas Mercado Livre), ultima confirmacao 18/11 18:13 UTC, coletor pausado => 0 oferta "viva" => 0 proposta (a detecao dry de Beleza avaliou 0 produtos). Marcas do dono no catalogo: **Medicube 26 masters (601 ofertas)**; **Tsubaki, Schwarzkopf, L'Oreal, Biore: 0 masters** (nunca foram semeadas). Mesmo religando o coletor, so Medicube sobe; as outras 4 exigem semeadura por termo de marca.

## Rodadas
Metricas por loja (N=60): tipos, marcas, familias distintas, maior parte de um tipo, perda de qualidade (soma de degrau/gatilho vs. os 60 melhores).

| Metodo | Tipos | Marcas | Familias | Perda de qualidade media |
|---|---|---|---|---|
| M0 qualidade pura | 44 | 44 | 209 | 0% |
| M1 rodizio por tipo (deficit 24 h) | 47 | 45 | 214 | 0% |
| M2 deficit ponderado tipo+marca+familia | 47 | 40 | 227 | 12% |
| M3 marca primeiro | 41 | 32 | 212 | 9% |
| M4 penaliza familia | 34 | 42 | 241 | 22% |
| M5 preferida + M2 | 47 | 40 | 227 | 12% |
| M6 aninhado tipo>marca>familia | 47 | 39 | 227 | 12% |
| M7 aninhado + preferida | 47 | 40 | 227 | 12% |
| M8 tipo>marca (games fora) | 47 | 45 | 213 | 0% |
| M9 tipo>preferida>marca>familia | 47 | 45 | 227 | 10% |

Rodada 1 (M0-M7): rodizio por tipo (M1) ja da o teto de tipos; mexer em marca/familia ganha ~6% em familias e perde 9-22% de qualidade; M3/M4 pioram (tecnologia cai para 6-12 tipos).
Rodada 2 (M8-M9): games fora do criterio de marca zera a perda; M9 e o unico que sobe familias (+13) com perda moderada, e so em Esporte (29%) e Games.

## Decisao
- A ordem atual de `listPendingForSend` ja equivale a M1/M8 (rodizio por tipo por deficit 24 h, marca e familia como desempate). **Nao ha ganho material em trocar a ordem**: o teto (47 tipos somados) e a oferta da fila, nao o criterio. Nada foi alterado em `group-queue.ts`.
- O que aumenta tipos/itens/marcas e **oferta viva**: religar `collect-vertical` por loja (e a semeadura por tipo/marca) com medicao de banco entre cada passo. Ver relatorio.
