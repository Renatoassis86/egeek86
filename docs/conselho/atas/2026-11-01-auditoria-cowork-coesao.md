# Ata do Conselho Geek: auditoria externa (Cowork) e coesão da plataforma

- **Data:** 2026-11-01
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados (pareceres independentes, rodada 1):** estatistico-senior, especialista-precos, guardiao-catalogo, dba-postgres, estrategista-mercado, engenheiro-software-principal, gamer-veterano
- **Insumos:** `docs/auditoria-cowork-2026-11-01.md` (32 achados, de P0 a P3), `docs/inventario-funcionalidades-2026-11-01.md` (61 itens), pareceres em `docs/conselho/pareceres-2026-11-01/`

## Veredito de coesão
O núcleo de coleta, o histórico e o alerta são sólidos. A camada de apresentação vaza confiança: o mesmo número aparece com definições diferentes em telas diferentes, o veredito não segue a regra do modelo, e o catálogo ainda tem itens fora da cartela e duplicatas. Cinco módulos fora do blueprint (Hype Zone, leilões, curadoria, vendedor C2C, pesquisa) foram entregues antes de o núcleo estar confiável.

## Causas raiz confirmadas (por parecer)
| Achado | Causa raiz | Parecer |
|---|---|---|
| F-08 veredito | `computeVerdict` está certo; a tabela e o card ignoram a faixa de ±5% | estatístico |
| F-09 "Preço estável" | tendência usa o penúltimo snapshot; página do produto não exibe veredito | estatístico, engenharia |
| F-11 GT7 R$ 70 | piso na borda (`>=`) deixa passar por 3 centavos; vendedor com poucas vendas não pesa | estatístico, preços |
| F-13 R$ 15.500 | a mediana do produto já é alta; teto por múltiplo da mediana não resolve, o sinal certo é a dispersão | estatístico |
| F-14 mínimo > atual | duas medianas diferentes (`product-price-stats.ts:65` e `public-offers.ts:61`) | estatístico |
| F-15 contadores | mesma função, mas cache, coletor e definições concorrentes; "12" é amostra de 200, "167" é a tabela inteira | banco |
| F-18 lentidão | consultas sobre 3,25 M de snapshots (9 s e 18,7 s medidos), cache por deploy | banco |
| F-26 cotações | 3,25 M cotações para 67 mil pares oferta-dia; mudar a regra altera a média de 382 produtos | estatístico, banco |
| F-01 Nintendo Land | oferta ligada ao master errado; 65 ofertas ativas com título que contradiz o master | catálogo |
| F-02 duplicatas | fundir PS5 Slim 825 GB, PS4 Slim 1 TB, Xbox One S 1 TB, RE3; GTA V e Cyberpunk dependem de alias e plataforma | catálogo |
| F-07 altas e baixas | `getTopMovers` não aplica o filtro de cartela | catálogo |
| F-22 sinopse | script com codificação dobrada: sufixo de busca em português corrompido (caía no inglês) e crédito "WikipÃ©dia" | engenharia |

## Divergências e resolução
- **Cotação por oferta por dia (F-26):** estatístico, banco e estratégia apoiam; muda a definição de "cotação" da regra inegociável. Resolução: **não implementar**; rascunho de ADR 0004 como Proposta, aguardando decisão do responsável.
- **Hype Zone e leilões fora do menu:** estratégia recomenda; resolução pendente do responsável.
- **Lista de marcas permitidas para controles:** gamer-veterano propôs classes A/B/clone; guardião mediu que a lista marcaria 69 de 184 como clone. Resolução: regra por sinais de clone (sem marca, "compatível", "estilo"), sem lista fechada.
- **F-13:** o auditor propôs teto por múltiplo da mediana; o estatístico mostrou que não resolve. Resolução: sinal de dispersão.

## Decisões do responsável (2026-11-01)
- Gravar: arquivar notícia de teste de GTA 6 (feito, 1 de 5 do perfil de teste), corrigir crédito das sinopses (443 registros, feito), corrigir plataforma de 14 jogos de título inequívoco (feito; 122 títulos "Xbox One/Series X" ficaram de fora por serem cross-gen).
- Backup antes de cada gravação em `backup/dados` (`master_products.*.ndjson`, `news_articles.*.ndjson`).

## Execução (código, sem banco)
Quatro frentes em paralelo, arquivos disjuntos: A indicadores e contadores; B cartela e catálogo; C1 produto, monitoramento e sinopse; C2 notícias, SEO, imagens e mobile. Validação final (tsc, build, QA, dimensões) feita pelo presidente.

## Pendente de decisão do responsável
1. Fusões de duplicatas seguras (PS5 Slim 825 GB, PS4 Slim 1 TB, Xbox One S 1 TB, RE3) e religação das 65 ofertas com título contraditório.
2. Outras 4 notícias do perfil de teste ainda publicadas.
3. ADR 0004 (cotação por oferta por dia).
4. Hype Zone, leilões e pontos na navegação principal.
5. Texto jurídico de divulgação de comissão e de LGPD (revisão por advogado).
6. Obter Client ID e Secret da IGDB para ampliar a cobertura de sinopses.

## Retrospectiva
Preencher depois de entrar no ar.
