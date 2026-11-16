# Auditoria independente de informação: plano (Fase 0), 2026-11-16

Papel: auditor independente (não edita código de outros agentes; só lê produção com SELECT em transação `READ ONLY` via `scripts/auditoria-informacao/q.ts`). Pergunta de cada linha: **o que um comprador entenderia, e isso é verdade agora?** Severidade: ALTA = número ou afirmação falsa que induz compra ou fere regra do dono; MÉDIA = informação enganosa ou incoerente entre telas, ou falha sistemática sem prova de dano; BAIXA = cosmético, rótulo, texto.

Método por ciclo: (1) escolher linhas do catálogo; (2) modelar classes de falha; (3) testar contra o banco inteiro, contra `group_messages` (7 dias) e, por amostragem estratificada, contra páginas reais (Chrome, 1 aba extra, só leitura); (4) registrar achado com SQL reproduzível; (5) propor invariante. Parada: 2 ciclos consecutivos sem achado novo médio/alto, catálogo inteiro coberto e 1 ciclo adversarial ("o que o comprador entenderia errado?").

## Catálogo de afirmações (fonte de verdade, hipóteses, teste, invariante)

| # | Afirmação (site ou mensagem) | Fonte de verdade | Hipóteses de erro | Teste | Invariante |
|---|---|---|---|---|---|
| C01 | Preço atual da oferta | último snapshot confirmado (`affiliate_price_snapshots`, `last_price_confirmed_at`) | preço de outro anúncio/vendedor/variante; placeholder; cotação velha; isca | recomputar último snapshot x `current_price_cents`; idade | `current_price_cents` = último snapshot ativo; idade dentro do R-21 |
| C02 | "Conferido em dd/mm às HH:MM", "conferido há X" | carimbo da leitura (BRT) | UTC no lugar de BRT; carimbo do envio no lugar da leitura; leitura de horas atrás | texto x snapshot x `sent_at` | hora do texto = leitura em America/Sao_Paulo e <= sent_at |
| C03 | Preço com cupom / cartão / Pix | cofre de cupons, `offer_card_benefits` | cupom inexistente, empilhamento | (outros agentes) auditar só a saída final | todo preço derivado tem prova vigente (R-64/R-66) |
| C04 | Queda / alta % | snapshot anterior da MESMA oferta | desconto à vista contado como queda; base diferente; oferta trocada | recomputar dos snapshots | queda = (anterior-atual)/anterior, mesma oferta e condição |
| C05 | "% abaixo da média", "Média das lojas" | `price_daily_state.avg_cents` (R-17) | média por cotação x oferta-dia; poucas ofertas (R-19); outlier | recomputar de `price_daily_offer` | média da mensagem = média única do dia; n >= 5 para texto com % |
| C06 | Mínimo/Máximo "últimos 14/15 dias", "novo mínimo", "menor registrado" | `price_daily_offer`, `price_min_events` | isca; 14 x 15 no mesmo texto; mínimo de oferta inativa | recomputar min/max por janela | janela citada = janela calculada; mínimo de oferta ativa e plausível |
| C07 | Selo/régua (Compre agora, Ótima compra) | `regua.ts` sobre a média única | selo sem 5 ofertas; média provisória | recomputar selo | selo = f(preço, média) com amostra R-19 |
| C08 | "Preço anterior" / riscado | `previous_price_cents`, snapshots | anterior de outra oferta; "de/por" proibido | cruzar | anterior = último preço distinto da mesma oferta |
| C09 | Contagem de anúncios/ofertas por modelo, "a partir de" | ofertas ativas elegíveis do master | conta draft/expirada/openbox/velha | contar x listar | contagem = ofertas ativas, frescas, novas, elegíveis |
| C10 | "Menor preço agora", ordenação | menor preço ativo, fresco, plausível | pausada/velha/isca no topo | página x consulta | topo = mínimo das elegíveis |
| C11 | Frete grátis / valor / prazo | `offer_shipping_quotes`, CEP 58035090 | frete de outro bloco; leitura velha; CEP diferente | idade, CEP, coerência free/cost | leitura <= 24 h do mesmo item e CEP |
| C12 | Vendedor, reputação, loja oficial, "vendido por" | `affiliate_sellers` | vendedor trocado; reputação velha; nickname vazio | mensagem x oferta.seller_id | texto = vendedor da oferta na leitura |
| C13 | Estoque ("Somente N") | leitura | estoque de outro anúncio | buscar o texto | só se lido e fresco |
| C14 | Identidade (110/220 V, bivolt, combo, região, cross-gen, edição, cor) | `master_products`, R-12 | master mistura variantes | spread por master; títulos divergentes | um master = um produto |
| C15 | Agrupamento em master (só iguais) | R-11, R-13 | duplicados; jogo errado | spread p90/p10; títulos | spread explicado por mercado, não por produto |
| C16 | Categoria/departamento, loja | `vertical`, `product_type` | produto na loja errada; console com peça | tipo x título | tipo coerente com título |
| C17 | Condição novo x usado/openbox/retrô/fora de linha | R-10 | marcadores de usado em ativo | regex no banco | zero ativo com marcador de usado |
| C18 | Foto (real, sem mão, do produto certo) | `image_url`, `default_images` | vazia, placeholder, repetida em masters diferentes | ativas sem imagem; imagem repetida | toda oferta ativa elegível tem foto própria |
| C19 | Título | `title`, `master.name` | truncado, curto, lixo | títulos curtos/truncados em mensagens | título completo e identificador |
| C20 | Datas e horas (fuso, hoje/ontem, validade) | `America/Sao_Paulo` | UTC exibido; virada às 21 h | textos x sent_at | toda data civil em BRT |
| C21 | Links (afiliado, tag, /go, meli.la, destino) | `affiliate_url`, `offer_link_audit` | destino diferente do preço; sem tag | links x auditoria | destino = anúncio cujo preço foi dito |
| C22 | Métricas do site (contadores, rankings, Black Friday) | consultas | contador conta draft; ranking por base legada | recomputar | contador = consulta independente |
| C23 | Comissão / "afiliado" só em /admin | R-36 | texto vazado | grep em páginas e mensagens | zero ocorrência fora de /admin |
| C24 | Textos proibidos (BANNED) | R-24 | frase nova | regex nas mensagens | zero ocorrência |
| C25 | Moeda e formatação | `format.ts` | vírgula, centavos | regex | R$ 1.234,56 |
| C26 | Estatística (poucas cotações, outliers, dias abertos, price_daily) | R-19, R-20 | média com 1 oferta; dia aberto | recomputar `price_daily_state` | n_offers/min reproduzíveis |
| C27 | E-mails, contatos, canal | páginas | contato fora de /contatos | grep | só /contatos |
| C28 | Coerência entre superfícies (site x mensagem x loja) | as acima | três valores para o mesmo fato | pares no mesmo instante | mesmo fato, mesmo número |
| C29 | Texto por gatilho (G2/G3/G5/OK/P1 a P4/N1/AC/CUPOM) | cada gerador | rótulo promete mais que o dado ("Mesmo produto" com preços 50% distintos) | amostrar por gatilho | cada frase tem dado que a sustenta |
| C30 | Alertas privados e painel (impressoras) | `painel-impressoras` | lista com preço de outro anúncio | cruzar | idem C01 |

## Ordem dos ciclos
1. Ciclo 01: mensagens enviadas em 7 dias (C01, C02, C04 a C06, C20, C24, C25, C29).
2. Ciclo 02: base de preços reconstruída e comparada (C01, C05, C06, C26).
3. Ciclo 03: identidade, agrupamento, condição, categoria, foto, título (C14 a C19).
4. Ciclo 04: vendedor, frete, links, estoque, contadores, comissão (C09 a C13, C21 a C23, C27).
5. Ciclo 05: páginas reais por amostragem estratificada (C28).
6. Ciclos 06+: reteste, adversarial, parada.
