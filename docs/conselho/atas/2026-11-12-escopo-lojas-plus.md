# Ata do Conselho Geek: escopo de compra real nas lojas Plus

- **Data:** 2026-11-12
- **Porte:** grande (muda o que o público vê em todas as lojas Plus, home e Telegram)
- **Presidente:** geek-lead
- **Convocados:** estrategista-mercado, especialista-precos, gamer-veterano, qa-verificador (mesa fixa), key-user-gamer, guardiao-catalogo
- **Status:** recomendação ao dono; nada foi executado, nenhum arquivo de código ou dado foi alterado.

## Briefing
Pedido do dono (2026-11-12): não colocar nas lojas itens baratos e de poucas vendas (cabos, acessórios) que fogem do que as pessoas costumam comprar; ao mesmo tempo, o MÁXIMO de itens por loja e por tipo (Smart TV, geladeira, notebook, tênis), sem tetos artificiais.

Restrições e regras em jogo: sem dado fake (demanda só com dado coletado); só produto novo e em linha; um master por produto (excluir apagando o master reabre cadastro duplicado); coleta só por API oficial; nada destrutivo; o porteiro (`src/lib/catalog/vertical/scope.ts`, `gate.ts`, `aprovacao-nicho.ts`) está sendo relaxado por outro agente e não foi tocado.

Pergunta: que critérios definem "escopo de compra real" em cada loja Plus, e o que acontece com o que ficar fora.

## Dados reais (SELECT somente leitura, 923 masters Plus aprovados, tipo derivado de `tipos-produto.ts`)
Fonte bruta: `c:/tmp/escopo-plus-dados.txt` (preço p10/p50/p90, ofertas ativas, vendedores distintos e vendas totais do vendedor, por loja e tipo).

- O banco NÃO guarda `sold_quantity` do anúncio. Só há `affiliate_sellers.total_sales` (porte do vendedor, não demanda do item), nº de ofertas ativas e nº de vendedores distintos.
- Tipos que o dono citou: cabos-acessorios 8 masters (p50 R$44, 1 vendedor), carregadores 9 (p50 R$45), fones 16 (p50 R$100, vendas do vendedor mediana 3, ou seja, vendedor sem histórico). No total, 33 de 923 (3,6%).
- Baixo valor em Esporte é bem maior que em Eletrônicos: bola 85 (p10 R$28, p50 R$119), proteção 27 (p50 R$44), fitness 22 (p50 R$62), bolsas 16, meias/roupas 11 (p50 R$40, p90 R$49), garrafas 7 (p50 R$73).
- Exemplos que dominam "menor preço": Cabo HDMI R$8 e R$12, Fone M19 TWS R$28, Caneleira R$17 a R$23, Corda de pular R$16 a R$28, Bola R$23 a R$25, Meia R$22 a R$28. Quase todos com 2 a 3 ofertas.
- A mediana de ofertas é 2 a 4 e a de vendedores 1 a 2 em quase todo tipo, inclusive nos de ticket alto: Smart TV (19 masters, p50 R$2.670, mediana de 1 vendedor), geladeira (22, R$3.356, 2 vendedores), esteira (27, R$1.832, 1 vendedor). Um filtro de demanda aplicado a tudo esconderia justamente o ticket alto.
- Legítimos de baixo valor: Livros RPG com 40 ofertas a R$22 (Call of Cthulhu), 23 ofertas a R$26 (Tormenta); filamento 41 masters, p50 R$133, p10 R$105, 6 ofertas, 3 vendedores.
- Lacunas de cobertura (problema de alcance, não de filtro): tênis só 3 masters, notebook 0, ar-condicionado 6.
- Anomalia de dado: lavadora-secadora com p90 de R$1,8 milhão (preço quebrado; auditar e pôr em revisão).

## Pareceres (rodada 1, independentes)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estrategista-mercado | Apoia com ressalvas; sem piso único em R$ | Cortar por tipo (cabos, carregadores); pisos só por tipo (fones R$80, bola R$60, proteção/fitness/garrafas R$40); filtro de qualidade 2 ofertas + vendedor >=500 vendas; ticket alto sobe na vitrine | cliques e comissão por tipo; `sold_quantity` |
| especialista-precos | Corta por tipo; contra piso global e contra "menor preço" como único destaque | Selo de menor preço só com >=2 vendedores ou >=3 ofertas e preço >=40% da mediana do tipo; piso por tipo (esporte R$40, livros R$30); preço >10x a mediana do tipo vai para quarentena; ordenar ticket alto por preço absoluto | `sold_quantity`; distribuição de ofertas por master |
| gamer-veterano | Corta por tipo; livro de RPG e filamento intocáveis | Fora: cabos, carregadores (exceto GaN/gamer >R$120), meias, corda, garrafa comum, luva avulsa; pisos: fones R$80 (+vendedor >1.000 vendas), bola R$60, proteção R$40, fitness R$50, filamento R$70; manter se >=3 ofertas ou >=2 vendedores; sem teto por tipo | volume de busca/clique por tipo; taxa de erro do tipo por título |
| qa-verificador | Corta por tipo e na camada de exibição, não no porteiro | Flag de exibição reversível (não mexe em master nem no porteiro); fora: cabos, carregadores, fones <R$150, caneleira/luva <R$25; sem piso em livros/filamento/resina; vendas do vendedor só desempate, nunca filtro (seria tratar venda do vendedor como venda do produto) | `sold_quantity` via API oficial (consultar integrador-apis) |
| key-user-gamer | Corta por função, não por R$; piso só como segundo critério | Fora: cabos, carregadores, fones TWS sem marca; Esporte proteção/meias/garrafas/fitness; bola só >R$80; pisos de vitrine Eletrônicos R$150, Casa R$200, Tecnologia R$150, Esporte R$60; demanda: >=3 ofertas ou >=2 vendedores ou vendedor >=1.000 vendas; fora-de-escopo continua pesquisável; alerta de que tênis e notebook estão rasos | vendas por anúncio; buscas sem resultado |
| guardiao-catalogo | Corta tipo inteiro `cabos-acessorios`; pisos por tipo; nunca apagar master | Piso: carregadores R$100, fones TWS R$80, protecao/meias/fitness/garrafas R$50, bola R$40; exceção se >=5 ofertas e >=3 vendedores; gravar `attributes.vertical.foraDeEscopo={motivo,tipo,versaoRegra,em}`; regexes frágeis (`protetor` pega protetor solar, `saco`/`mala` largos, `ferro`) | amostra de `outros` em Eletrônicos e Casa |

## Divergências e resolução
Todos convergem em: (1) excluir por TIPO e não por piso global em R$ (piso global derrubaria livros, filamento e bola de marca); (2) fora-de-escopo é marca de exibição reversível, nunca apagar master (reabriria duplicata); (3) ticket alto não pode ser barrado por demanda nem por piso; (4) a demanda real só existe como proxy até coletar `sold_quantity`; (5) auditar o preço de R$1,8 milhão.

Divergências e como o presidente resolve (sem réplica extra, porque o impacto medido é pequeno e reversível; o dono pode reabrir):
- Esporte por tipo ou por piso: key-user quer tirar tipos inteiros; qa-verificador quer só ordenar; estrategista, gamer e guardião querem piso por tipo. Resolução: piso por tipo (mantém bola e proteção de marca, tira o lixo barato). Meias/roupas, com p90 de R$49, na prática ficam fora com piso R$50.
- Valor do piso de fones: R$80 (3 membros) a R$150 (qa). Resolução: R$80, mais o sinal de demanda; mediana do tipo é R$100, então R$150 cortaria mais da metade.
- Bola: R$40 a R$80. Resolução: R$60 (estrategista e gamer). Bola de marca de R$100 a R$240 permanece.
- Piso de Casa e Eletrônicos: key-user R$150 a R$200, precos R$100, guardião nenhum. Resolução: R$100 como rede de segurança (Casa tem p10 de R$129 a R$290 nos tipos principais, então praticamente nada some); não usar R$150 a R$200, que mexeria em air fryer, ventilador e cafeteira legítimos.
- Uso de vendas do vendedor: gamer e key-user aceitam como filtro; qa e precos só como desempate. Resolução: só como sinal auxiliar em itens de baixo valor, nunca como prova de demanda do produto, e com o rótulo correto na documentação ("porte do vendedor").

## Decisão recomendada (regras objetivas)
Arquitetura: uma camada de ESCOPO DE VITRINE, separada do porteiro. Função pura `escopoVitrine({departamento, tipo, precoMediano, nOfertas, nVendedores, maxVendasVendedor})` que devolve `{dentro: boolean, motivo, versaoRegra}`. Persistência: `attributes.vertical.foraDeEscopo` no master (ou cálculo na leitura); reverter = apagar a marca ou desligar a flag `PLUS_ESCOPO_VITRINE=0`. O porteiro, a aprovação, a coleta, o dedup e a busca não mudam.

Onde a marca vale: faixas da home, páginas de loja (listagem padrão), seleção de mensagens e Telegram, "menor preço do dia". Onde NÃO vale: o master continua aprovado, coletado (histórico de preço preservado), entra no dedup, aparece na busca direta e em link direto, e vai para a fila "revisar escopo" no admin. Item volta sozinho se passar a atender os limiares.

R1. Tipo excluído integral (preço não importa):
- Eletroeletrônicos: `cabos-acessorios` (cabo, hub, adaptador, controle remoto, película, capa, suporte). Antes de aplicar, corrigir a regex para não capturar "suporte" de TV de marca e "capa" de produto principal.
- Tecnologia: nenhum tipo inteiro (mouse, teclado, headset, webcam são núcleo gamer).
- Casa, Livros, Impressão 3D: nenhum tipo inteiro.

R2. Piso por tipo (preço mediano das ofertas clicáveis, em R$; abaixo do piso o item fica fora de vitrine/mensagem, salvo exceção R4):
| Loja | Tipo | Piso |
|---|---|---|
| Eletrônicos | carregadores | 100 |
| Eletrônicos | fones | 80 |
| Eletrônicos | demais tipos | 100 (rede de segurança) |
| Casa | todos | 100 (rede de segurança) |
| Tecnologia | mouse, teclado, headset | 80 |
| Tecnologia | demais tipos | sem piso |
| Esporte | bola | 60 |
| Esporte | protecao, fitness, garrafas, meias-roupas, bones | 50 |
| Esporte | halter-peso, bolsas-mochilas, tênis, esteira, bicicleta, raquete | sem piso |
| Livros | todos | sem piso (RPG, HQ, guias de games intocáveis) |
| Impressão 3D | filamentos, resinas, impressoras | sem piso |
| Impressão 3D | pecas | 50 (hipótese; hoje 0 aprovados) |

R3. Sinal de demanda (só para itens com mediana abaixo de R$300, fora de Livros e de filamentos/resinas): para entrar em faixa, mensagem ou "menor preço", exige (ofertas ativas >=3) OU (vendedores distintos >=2). Vendas totais do vendedor >=1.000 podem substituir o critério apenas em fones, mouse e headset (porque o vendedor sem histórico é o risco ali). Itens com mediana >=R$300 NUNCA são barrados por demanda: Smart TV, geladeira, notebook, tênis de marca, placa de vídeo seguem 100%.

R4. Exceção ao piso: item abaixo do piso permanece se tiver >=5 ofertas ativas e >=3 vendedores distintos (demanda observada, p. ex. Livro RPG com 40 ofertas já é isento por R2, mas vale para bola e fitness populares).

R5. Selo e destaque "menor preço" (especialista-precos): só com >=2 vendedores ou >=3 ofertas e preço >=40% da mediana do tipo (anti-isca). Fora disso o item aparece, sem selo e sem entrar em mensagem de "menor preço". Preço >10x a mediana do tipo ou valor absurdo (caso lavadora R$1,8 milhão) vai para revisão de dado e sai das vitrines até conferir.

R6. Ordem das faixas e mensagens: não só menor preço. Ordenar por nº de vendedores e ofertas, com cota por tipo no rodízio (um tipo não ocupa a faixa inteira) e ticket alto sem penalização (ordenar por preço absoluto dentro do tipo quando houver empate de demanda). Sem teto de quantidade por tipo nas páginas de loja.

R7. Tipo gravado com versão: gravar `tipo` e `versaoRegra` junto da marca (hoje o tipo é derivado a cada leitura). Revisar regexes frágeis antes de ligar: `protetor` (protetor solar), `saco`, `mala`, `ferro`, `capa`, `suporte`, `mesa`, `fita`; fone existe em dois departamentos.

Fora de escopo desta ata (encaminhar à parte): (a) ampliar a cobertura dos tipos que o dono citou (tênis 3 masters, notebook 0, ar-condicionado 6) é trabalho de semeadura/descoberta, não de filtro, e deve ser pedido ao guardiao-catalogo e ao engenheiro-coleta; (b) coletar `sold_quantity` por anúncio na API oficial do Mercado Livre (integrador-apis dirá se é possível e se a Shopee devolve algo equivalente); (c) auditar a lavadora-secadora.

- Decisão do responsável do projeto: pendente

## Métrica de sucesso
Conferir 7 dias após ligar (e um dry-run antes):
- Dry-run: lista, por loja e tipo, de quantos masters seriam marcados e quantos reentram por R4; meta de marcados abaixo de 5% de cada loja e abaixo de 10% no total (qa-verificador confere com SELECT que `master_products` não mudou).
- Itens fora de escopo em faixas, mensagens e "menor preço do dia": meta zero.
- Participação de itens com ticket >=R$300 nas faixas: sem queda em relação ao dia anterior ao corte; contagem de masters por tipo de ticket alto (Smart TV 19, geladeira 22, soundbar 31, placa de vídeo 70) sem queda.
- Falsos positivos na revisão do admin: abaixo de 2%; zero RPG, HQ ou filamento excluídos.
- Resultado de negócio: cliques de saída por impressão e por tipo, antes e depois (Telegram e site); fração de itens abaixo de R$40 na primeira dobra de cada loja.
- Cobertura: evolução de masters por tipo para tênis, notebook e ar-condicionado.

## O que o dono precisa decidir (uma pergunta por vez)
1. (principal) Aprova a abordagem "exclusão por tipo + piso por tipo + sinal de demanda só para itens abaixo de R$300, como marca de exibição reversível, sem apagar nada e sem mexer no porteiro"? Se sim, o próximo passo é um dry-run que mostra quantos itens saem por loja.
2. Depois: pisos de Esporte (bola R$60; proteção, fitness, garrafas, meias R$50) e de fones (R$80), ou prefere mais rígido/mais frouxo.
3. Depois: autoriza pedir ao integrador-apis a coleta de `sold_quantity` oficial para trocar o proxy por demanda real.
4. Depois: prioridade de ampliar a cobertura de tênis, notebook e ar-condicionado.

## Execução e verificação
- Executores previstos: guardiao-catalogo (regexes e `tipo`), engenheiro-backend (função de escopo e flag), engenheiro-frontend (listagens), engenheiro-coleta/integrador-apis (`sold_quantity`).
- QA: qa-verificador antes de concluir, com teste unitário da função de escopo por tipo e limiar, SELECT provando que nenhum master foi alterado além da marca, e conferência das faixas da home e do Telegram.

## Retrospectiva
Preencher após entrar no ar.
