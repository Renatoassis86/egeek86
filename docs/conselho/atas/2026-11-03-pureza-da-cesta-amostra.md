# Ata do Conselho Geek: pureza da cesta e tabela de amostra

- **Data:** 2026-11-03
- **Porte:** médio (auditoria somente leitura; nenhuma escrita no banco, nenhum commit)
- **Presidente:** geek-lead
- **Convocados:** guardiao-catalogo, estatistico-senior, cientista-precos, gamer-veterano (pareceres independentes em paralelo); qa-verificador na verificação final

## Briefing
Pedido do dono: organizar uma amostra para ver se há problema na construção dos indicadores; a cesta de cada produto precisa conter exatamente o mesmo produto (edição, marca, plataforma segmentadas). Perguntou se já fazemos isso.

## Pareceres (resumo)
| Membro | Posição |
|---|---|
| guardiao-catalogo | Parcial. Edição EN, condição, bundle e DLC separam. Capacidade de console e Series S x X FUNDEM (PLATFORM_STRIP). Cor, romanos e ano dependem de Jaccard. Console de núcleo vazio nunca deduplica. A oferta não é rechecada contra o master depois de ligada. |
| cientista-precos | A entrada tem uma checagem de identidade; o cálculo nenhuma. Filtros 35%/2x/3x só mascaram a ponta extrema. Série histórica não aplica piso nem porteiro. Sem invalidação por id do cache SWR (10 min, até 6 h vencido). Sugere `family_id` só para navegação. |
| estatistico-senior | Medir sobre ofertas brutas, não sobre a cesta já limpa. Sinal de preço só com n>=4; preço nunca decide CONTAMINADO sozinho; rótulo de verificabilidade para n<4. Amostra intencional não estima prevalência. Contaminante barato fere mínimo e selo; caro fere média e veredito. |
| gamer-veterano | Separar sempre: digital x físico, novo x usado, Slim/Digital/Pro, capacidade, OLED/Lite/Switch 2, bundle, Edge, steelbook, região. Cor comum pode juntar. Ambíguo vai à quarentena, não à média. |

## Divergência
Cor e Day One: gamer aceita juntar cor comum; preços pode preferir juntar mais. Fica como decisão do dono.

## Decisão
Auditar sem alterar. Entregas: `docs/amostra-pureza-cesta-2026-11-03.xlsx` e `.csv`. Correções ficam como proposta (relatório final), dependentes de autorização do dono.

## Método
Universo: 1.952 masters ativos, aprovados e com oferta pública. Amostra de 353 (semente 20261103). Estatísticas do site obtidas pelas funções reais, em leitura. Scripts temporários removidos ao final.

## Verificação
Ver relatório final; QA separado a cargo do `qa-verificador`.
