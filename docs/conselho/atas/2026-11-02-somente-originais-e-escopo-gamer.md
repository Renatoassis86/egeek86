# Ata do Conselho Geek: somente itens originais e escopo gamer

- **Data:** 2026-11-02
- **Porte:** grande (muda regra de negócio, dado, vitrine e indicadores)
- **Presidente:** geek-lead
- **Convocados:** guardiao-catalogo, gamer-veterano, especialista-precos, estatistico-senior, engenheiro-backend; qa-verificador na verificação

## Briefing
Pedido literal do dono (com prints do celular): "Veja se todos os jogos e consoles são originais. Só trabalho com itens originais. Veja que está colocando itens que não estão no rol de jogos, consoles e acessórios para os games. Corrija isso."

Prints: (1) home "Geek Deals" com God of War II PS2 a R$ 19,90, God of War PS2 e Silent Hill Shattered Memories a R$ 22,00; (2) "Adicionar à sua lista" com "Mario" listando Lego 71374, Kit Mantinha com Balde, Jogo Playset Jakks, Porta Cartão, bundles de console e Controle D-Pad Hori.

Regras em jogo: sem dado fake; um jogo, uma média só; nunca apagar ofertas/cotações; coleta só por API oficial; cantos retos; nunca "afiliado" ao cliente.

## Dados medidos (banco real, 2026-11-02)
- 6.155 masters (sem fundidos), 2.439 com oferta ativa; 9.447 ofertas ativas. Antes: 2.009 masters e 8.375 ofertas ativas passavam como públicos.
- Vazamentos no público antes do porteiro (todos tipados `game`): Lego 71374 (R$ 4.500), Kit Mantinha, Playset Jakks, caderno Jandaia/Tilibra "God of War", livros Ultimania/guias, capacete, deck Magic, Neca/Totaku/Revoltech/Q Posket, ioiô, kit manta com balde. "Pacote de console Switch 2 + Mario Kart World" estava tipado como jogo.
- PS2 a R$ 19,90: o master "God of War II Standard Edition PS2" tem 8 ofertas, 7 entre R$ 19,90 e R$ 23,00 (vendedores com 0 a 815 vendas) e 1 a R$ 581,90. Várias ofertas baratas iguais puxam a mediana para baixo e o piso de 35% da mediana (ADR 0002) deixa de funcionar.
- O coletor do Mercado Livre só aceita `condition = new`; portanto "usado original barato" não explica esses preços.
- `game_platform_gen` não tem PS1/PS2/PSP/Wii: 222 masters `game/unknown`.

## Pareceres (rodada 1, independentes)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| guardiao-catalogo | "Original" não é lexical; regex sozinha não basta | Porteiro de 3 estados com evidência positiva; lista de rejeição lexical; dúvida vai à revisão | Contagem real por veredito (feita depois) |
| gamer-veterano | Léxico de cópia/clone cobre pouco; PS2/PS1/PSP novos abaixo de R$ 60 são cópia quase certa | Classe A (léxico) bloqueia; classe B (preço/contexto) só revisão; piso R$ 60-70 | Faixa real de preço por plataforma (hipótese dele) |
| especialista-precos | Preço é sinal auxiliar; o piso de 35% da mediana é circular | Marca persistente de revisão; indicadores filtram por ela; mediana sem os suspeitos | Taxa de falso positivo de cada indício |
| estatistico-senior | Rejeição só por identidade; preço só prioriza fila; remoção por preço enviesa a média para cima | Série dupla na transição; amostra estratificada de auditoria; IC de Wilson | Amostra rotulada pelo dono |
| engenheiro-backend | Estado em `attributes.catalogGate`, sem migration; quarentena no master | Predicado SQL barato nas saídas; guarda nas entradas; `paused` não serve (coletor recria oferta) | `EXPLAIN` com o join (medido: JOIN 10x mais lento, usar NOT IN) |

## Divergências e réplica
- guardiao x gamer sobre porta-cartão: guardião quer fora, gamer quer dentro (acessório licenciado). Decisão: **revisão** (nunca público) até o dono decidir.
- estatístico x gamer/preços sobre preço: gamer aceita piso como gatilho de revisão; estatístico exige que preço nunca rejeite sozinho. Decisão: preço **só envia à revisão**, nunca rejeita (convergência).
- backend (quarentena no master) x preços (marca por oferta): adotado master agora; **marca por oferta fica como próxima etapa** (ver limitações).

## Decisão (executada)
1. **Porteiro único** `src/lib/catalog/gate.ts` (`evaluateCatalogGate`, função pura): aprovado / em revisão / rejeitado, com categoria, motivo e trecho. Camadas: override humano; `classifyCatalogItem`; léxico NÃO ORIGINAL (pirata, cópia, réplica, paralelo, ISO/gravada, destravado, "mil jogos", clones de hardware, repro, cartucho "N em 1", capa/caixa avulsa); léxico FORA DO ESCOPO (brinquedo, Lego de set, playset, enxoval, papelaria, guias, colecionáveis de marca, deck, vestuário, peças internas, adesivos); evidência positiva para jogo (plataforma ou formato físico); sinal auxiliar de preço (físico novo < R$ 30 em qualquer plataforma, < R$ 60 em plataforma legada: só revisão). "Original" no anúncio nunca libera nada. Nome ambíguo (Lego Star Wars, Hot Wheels, Pirates, Steam Deck, Visual Novel) é protegido por plataforma de console.
2. **Estado** em `master_products.attributes.catalogGate` (`verdict, category, reason, matched, version, at, manual`). Sem migration. Reversão: remover a chave ou rodar `--revert` com o log.
3. **Saídas:** `catalogGateVisibleSql` (NOT IN, não JOIN) em `publicOffersCtes` e `priceQuotesCtes` (cobre vitrine, tabela, busca, monitorar, home, métricas e TODA média/mediana); `catalogDimensionFilter` (busca, monitorar, tabela); `getOfferBySlug` (detalhe vira 404); sitemap.
4. **Entradas:** `isNonProductAccessory` agora inclui `isRejectedByGate` (coleta ML, Shopee, Magalu, cadastro manual e extração no admin); masters novos em revisão nascem com `catalogGate` gravado (`entryGateAttributes`).
5. **Aplicação ao dado:** `scripts/apply-catalog-gate.ts` (dry-run padrão, `--apply`, `--revert`), 1.552 + 7 masters gravados em transação; backup e log em `backup/dados/catalog-gate-*`. Nenhum DELETE; ofertas, cotações e histórico intocados. Relatório de auditoria: `docs/porteiro-catalogo-aplicado-2026-11-02.csv`.
6. Testes: `scripts/test-gate.ts` (53 casos com os títulos dos prints e legítimos) e `scripts/test-dimensions.ts` (209 casos) verdes.

## Resultado medido (dado real)
- Fora do público com oferta ativa: 510 masters (382 fora do escopo, 84 não original, 22 sem evidência positiva, 17 por preço, 6 porta-cartão). Públicos: 4.623 masters / 8.259 ofertas ativas.
- Print 1: os três PS2 (God of War II, God of War, Silent Hill Shattered Memories) saíram da home e da busca. Print 2: busca "Mario" no Monitorar não traz mais Lego, Mantinha, Playset nem Porta Cartão; ficam jogos, controles e os dois bundles de console (decisão abaixo).
- Detalhe de master rejeitado abre a página de "não encontrada".

## Limitações conhecidas (não escondidas)
1. A marca é por **master**: o master "God of War II PS2" tem uma oferta de R$ 581,90 possivelmente legítima que ficou escondida junto com as de R$ 20. Solução: quarentena por oferta (precisa de coluna ou tabela; migration) ou separar o master.
2. Cópia com título limpo e preço alto é invisível para qualquer regra textual; só marca de revisão humana ou atributo do marketplace pega. Acessório genérico (grips, mini volante) não é detectável sem lista de marcas.
3. `acessorio_sem_plataforma` (regra de 2026-10-31) barra acessório de marca legítima sem plataforma no título (Corsair, Thrustmaster...). Pré-existente; decisão do dono.
4. O piso de preço (R$ 30 / R$ 60) é hipótese de especialista, não dado medido; por isso só envia à revisão.
5. Indicadores históricos passam a excluir o que foi barrado: há quebra de série (documentada em `docs/modelo-indicadores.md`, seção 10).

## Decisões do dono (com recomendação)
1. **Usado original** (PS2 usado a R$ 20): recomendação **continuar fora** (regra "só novos" já vigente e coletor `condition=new`); se quiser, criar vitrine "Usados verificados" depois.
2. **Bundles originais de console** (Switch 2 + Mario Kart): recomendação **manter** na aba Consoles com selo Bundle, fora da média do console puro (regra de 2026-10-31).
3. **Amiibo e colecionáveis licenciados**: recomendação **fora** (não são jogo, console nem acessório).
4. **Porta-cartão/estojo de cartuchos**: recomendação **entrar como acessório** só com plataforma no título e marca conhecida; hoje em revisão.
5. **Hardware de emulação de marca** (Anbernic, Retroid): recomendação **fora**; hoje em revisão.
6. **Piso de preço** de legado físico novo: R$ 60 (atual) ou R$ 70.
7. **Item em revisão fica invisível** (como está) ou aparece com selo: recomendação invisível.
8. **Tela admin de revisão** (aprovar/rejeitar com `manual`): recomendação construir na próxima rodada; hoje só por script/SQL.

## Métrica de sucesso
Zero item de brinquedo/papelaria/guia/pôster na vitrine, busca e monitorar em amostra aleatória de 100 masters aprovados (alvo: <= 3 falsos negativos; IC de Wilson reportado); nenhum legítimo conhecido barrado (lista de legítimos em `scripts/test-gate.ts`). Conferir após 7 dias de coleta.

## Execução e verificação
- Executores: geek-lead (código, script, aplicação), pareceres dos 5 especialistas.
- QA (qa-verificador): testes e tsc limpos; rotas na 3102 limpas para os prints; achados corrigidos nesta rodada: detalhe de master rejeitado (agora 404), "Faça" casando com "faca" (corrigido), adesivo/peça interna (cobertos). Pendente conforme limitações 2 e 3.
- Verificação em navegador real (extensão Chrome) não foi possível (extensão desconectada); verificado por HTML e API na porta 3102.

## Retrospectiva
Preencher após 7 dias.
