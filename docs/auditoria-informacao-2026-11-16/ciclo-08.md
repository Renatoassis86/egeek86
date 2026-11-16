# Ciclo 08: selo/régua independente, contadores, links, painel privado

## Selo/régua recomputado (mensagens)
`ciclo08.ts`: 2.285 mensagens G2/OK/G3/G4 desde 13/11; degrau pelo "% abaixo da média" (limites 3/6/12/20/30) x rótulo impresso. Rótulo MAIOR que a queda: 0. Rótulo MENOR que a queda: 737 (rebaixe por cautela, desenho do `calcularVeredito`, sem engano). "Compre agora" com 4 ofertas no dia anterior: 16 (mesma família de AUD-04: a função exige >= 5).

## Selo/régua nas páginas
`/ofertas` e `/black-friday` (HTML): 77 e 68 cards "Degrau N de 5". O crachá "-N%" é "% abaixo da média" em 100% dos 139 pares (nunca é queda da própria oferta).

| Id | Sev. | Achado | Evidência |
|---|---|---|---|
| AUD-25 | MÉDIA | O card diz "Degrau 3 de 5 pela queda sobre a média das lojas" mas a queda mostrada (20 a 29,8%) é degrau 4 pela tabela. O rebaixe por cautela (poucas ofertas/histórico) não é dito, então a frase explica uma conta que não foi a feita. | 8 de 77 cards em `/ofertas`; 15 de 68 em `/black-friday` (ex.: God of War 2 PS4 -28,0% "Degrau 3") |
| AUD-26 | MÉDIA | Lista/painel privado de impressoras não é auditável: o texto enviado não é guardado (`collector_runs.meta` só tem ids do Telegram, contagens e erros). Sem como reconstruir o que o dono leu nem comparar preço/frete com a página. | 46 execuções `lista-impressoras-privado`, 0 texto |
| AUD-27 | MÉDIA | Auditoria de link (`offer_link_audit`, agente de links): 126 `preco_divergente` (média 6,6%), 5 `item_diferente` (Bambu A1 Combo, A2L, X2D, P1S Combo, P2S Combo: o link mostra OUTRO anúncio) e 12 `pausado`, todos ainda ATIVOS e visíveis; 111 mensagens dos últimos 7 dias citam ofertas hoje marcadas com um desses vereditos. Só confirmar depois (agente a3d8edc1f26191e8f). | SQL |

## Contadores de /ofertas (definição lida no código)
Chips "Jogos 2.030 / Consoles 154 / Acessórios 456": `countRankedOffers(tipo)` (mesma lista de `listRankedOffers`, mesmo porteiro e filtros; o limite só recorta a exibição). O tipo é o EFETIVO (`classifyCatalogItem`), não o `product_type` do banco; por isso não bate com a contagem crua (consoles aprovados: 115 masters, 846 ofertas). As abas "Menor preço já visto" contam só ofertas "editoriais" (`editorialOk`: vendedor elegível e métrica existente). Não é erro provado; "Consoles 154" > 115 masters sugere ~39 itens reclassificados como console por título (conferir se acessório/peça é contado como console). BAIXA (AUD-22 atualizado).

## Cartão/Pix da Amazon e cupons (confirmação, sem duplicar os agentes)
Em 7 dias: 0 mensagens com "com o desconto", "Itaú" ou "Mastercard"; `offer_card_benefits` vazia. CUPOM: 31 mensagens nas últimas 12 h, todas ANTES do cofre (a trilha começa 01:38 UTC; último envio 01:05); desde então 0 liberados e 18 barrados. `medir-cofre-cupons.ts`: invariante [2] FALHA (6 avisos abertos sem prova), já sob o dono do cofre.
