# Ata do Conselho Geek: vitrine de ofertas segmentada e operação dos indicadores

- **Data:** 2026-11-01
- **Porte:** grande
- **Presidente:** geek-lead
- **Pareceres:** `docs/conselho/pareceres-2026-11-01-ofertas/` (guardiao-catalogo, gamer-veterano, engenheiro-frontend, especialista-precos, estatistico-operacao-indicadores, cientista-dados-pipeline-indicadores)

## Regra nova do responsável (2026-11-01)
Todos os itens são efetivamente separados; só se junta item idêntico (título, plataforma, edição, tipo, composição). Misturar contamina média e mediana.

## Achados que ordenam o trabalho
1. **Pureza antes de estimador.** Estimador robusto não conserta mistura: 21 de 23 ofertas com numeral divergente do master têm preço normal; 4 ofertas de Switch 2 (R$ 2.906 a 3.225) têm título idêntico ao do master e só o preço as separa.
2. **Master "Resident Evil 3 PS5" tem 6 ofertas de RE2** (cerca de 12 mil cotações). Há 3 masters de RE3 PS5.
3. **Tipo errado:** 464 de 2.086 masters com oferta (22,2%) têm `product_type` contradito pela cartela; a página usa o tipo cru do banco. 19 itens na prateleira errada, entre eles stand de PS5, memory card de PS2 e ventoinha de PS4.
4. **Plataforma:** 180 visíveis `unknown`; enum sem PS3, PS2, Wii, 3DS, retrô e PC; nenhuma coluna de fabricante usada.
5. **Frescor:** o Mercado Livre é recoletado a cada 2,4 h (não 15 min); provável dobro de disparadores e lote medido por oferta, não por grupo.
6. **Leitura lenta:** tudo recalculado em cache frio sobre 3,25 M de cotações. Separar preço atual (por coleta) de base estatística (diária, pré-computada).
7. **Visual mobile:** imagem estoura o quadro (`product-image.tsx`), selos cobertos, wrappers `p-6` somam recuo, `overflow-x:hidden` mascara estouro, filtros cortados e abaixo de 44 px, prateleiras de cores diferentes.
8. **Bloqueio do QA:** página do produto do GT7 e do Switch 2 não termina de renderizar (servidor ocioso, sem consulta ativa). Em diagnóstico.

## Decisões do conselho
- Tipo efetivo (cartela) lido em queries e página; prateleiras por tipo e, dentro, por fabricante derivado da plataforma. Bundle e clone fora das prateleiras comuns, com selo e média própria.
- "Tá vendendo muito" só existe com métrica real de venda/clique; sem ela o rótulo muda.
- Seções só aparecem com 3+ itens (4 em prateleiras), sem preencher com fake. Um produto por seção e no máximo 2 aparições na página.
- Selo de menor preço exige 10+ oferta-dias e 3+ lojas. Oferta suspeita vai para quarentena (nunca apagada).
- Retrô e PC: depois de persistir a dimensão de plataforma.

## Divergências em aberto
- Acessório universal: `multi` (gamer) ou `unknown` (catálogo).
- Média do controle original e do clone: separadas (regra nova resolve).
- Veredito pela média (oficial) e mediana como confirmação.

## Plano de execução
**Fase 0, destravar publicação (hoje):** corrigir travamento da página do produto; relink das ofertas com título contraditório (RE3/RE2 primeiro) com dry-run, backup e log; quarentena de preços absurdos (4 acima de R$ 50 mil, Switch 2 importado); `NEXT_PUBLIC_APP_URL` no sitemap e robots; reteste de QA.
**Fase 1, só código:** tipo efetivo na página e queries; novas seções e filtro `?fabricante=`; card único e carrossel mobile; correções de regras da cartela (Halo + baralho, 110GB).
**Fase 2, grava com backup:** tabelas diárias e estatística por produto, identidade da oferta (item_id), relink, quarentena, chave canônica do produto.
**Fase 3, decisão do dono:** ADR 0004, política de quarentena, retrô/PC, bundle na vitrine, orçamento de API.

## Retrospectiva
Preencher depois de entrar no ar.
