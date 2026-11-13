# Ata do Conselho Geek: reorganização do front e nova landing

- **Data:** 2026-11-13
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados (rodada 1, independentes, em paralelo):** engenheiro-frontend, engenheiro-performance-web, pesquisador-benchmark, bi-dataviz, key-user-gamer, gamer-veterano, estrategista-mercado, especialista-precos, engenheiro-software-principal, designer-marca, editor-noticias, qa-verificador. Estatístico-senior e cientista-precos: perguntas de método incorporadas pelo bi-dataviz; parecer pleno pendente (ver "Dado que falta").

## Briefing
Fase 1 (diagnóstico e plano, sem mudança em produção). Pedido do dono: varredura do front (qualidade, coerência com os objetivos, responsividade em retrato e paisagem), benchmark, reorganização de sessões/segmentações/indicadores/notícias, landing por segmentação de melhores ofertas com quadro de destaques comparável aos grandes marketplaces, destaques por plataforma de games (jogos e consoles), sessão Geek Plus, inventário, proposta, checklist, diagnóstico do gráfico de preços e prompts de imagens. Regras em jogo: sem dado fake, um jogo uma média (ADR 0004), só novo e em linha, só API oficial, sem "afiliado" ao cliente, cantos retos, uma imagem um lugar, R-36 (Plus sem selo/média até 27/11), R-39, R-49. Evidências em `docs/redesenho-site/`.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| engenheiro-frontend | Base responsiva boa (0 overflow em 65 células); 6 correções | `error.tsx`, barras fixas em paisagem, imagens, link da Black Friday, `/inteligencia-gamer`, imagem duplicada em `/sobre` | LCP e bytes por célula; causa da 500 em `/ofertas` |
| engenheiro-performance-web | Apoio com ressalvas: TTFB bom, cauda da home 4,7 a 5,0 s em 3 de 5 amostras | imagens (172 MB, `unoptimized`), cauda por seção, JS < 200 KB, cache | LCP/CLS/INP; log por seção; amostra de 30 a 50 |
| pesquisador-benchmark | Home do egeek86 tem menos itens por faixa que KaBuM!/ML/Magalu, mas é a mais pesada e alta; única com faixa por plataforma | 12 destaques, 10 por plataforma, 6 consoles, Plus 4; HTML <= 300 KB, 8 MB, 14.000 px | mobile real dos portais; fichas faltantes |
| bi-dataviz | Produção roda o gráfico antigo; V2 existe atrás de flag | evoluir V2 (SVG), degraus + marcadores + tabela de eventos, nunca interpolar; aposentar lightweight-charts | flags reais na Vercel; captura da diagonal; Amazon (dono) |
| key-user-gamer | Home é revista institucional, não landing de ofertas | 9 sessões, oferta no topo, 1 clique por plataforma, notícias visíveis, tirar ruído | ofertas por plataforma/tipo/faixa |
| gamer-veterano | Apoio com ressalvas | abas de plataforma, critério de "melhor oferta" em 7 pontos, Plus como clube, 4 colunas de notícia | produtos ativos por plataforma; data oficial de lançamentos |
| estrategista-mercado | Apoio com ressalvas: só corte enxuto, atrás de flag | landing em 14 dias (plataformas, melhores ofertas, Plus, Telegram, JSON-LD); notícias/indicadores/Observatório para depois de 27/11 | linha de base de cliques; ofertas com meli.la por plataforma |
| especialista-precos | Apoio com ressalvas: dois sistemas de número | 6 indicadores, piso 5 ofertas, teto 50%, rótulos fixos, filtro de acessório com nome de jogo | comparação lado a lado de 20 produtos |
| engenheiro-software-principal | Apoio com ressalvas: `tsc` limpo, `page.tsx` monólito | `VitrineOfertas` + loaders R-49 + flag + testes; ~65 h | peso do JS por biblioteca |
| designer-marca | Falta direção visual única; roxo/esmeralda fora da paleta | premium dark, cor de plataforma só em contorno de luz, 11 imagens obrigatórias com prompts | confirmação do dono do estilo |
| editor-noticias | Sem processo editorial; `/inteligencia-gamer` e colunistas violam regra | 14 categorias viram 2, fonte e data obrigatórias, feeds oficiais, fim do scraping | matérias por status no banco; data da última |
| qa-verificador | Limpo em "afiliado" (texto); falhas em editorial à mão, horário de preço e imagens | 10 testes automatizados e critério por entrega | typecheck/build; Playwright (autorização) |

## Divergências e réplica
1. **Escopo até 27/11.** estrategista-mercado quer cortar (notícias, indicadores e Observatório depois); key-user, editor e designer querem reorganizar tudo. Resolução do presidente (posições compatíveis por fase, sem réplica adicional): Fase A entrega landing, plataformas, Plus, vitrines com regras, correções de erro/responsivo/imagem e retirada do que viola regra (`/inteligencia-gamer`, colunistas); Fase C faz o que exige processo novo (RSS, vínculo notícia-produto, ISR do layout, média oferta-dia pública).
2. **Observatório/enquete/Números do site na home.** gamer-veterano e key-user os rebaixam; risco registrado de contrariar quem os vê como diferencial. Proposta: saem da home até o dono decidir onde viverão.
3. **Piso de ofertas.** especialista-precos: 5 em tudo; V2 usa 3. Proposta: 5 para o público, 3 só interno (decisão do dono, D2).
4. **Gráfico.** bi-dataviz: SVG próprio; software-principal: unificar em um componente. Convergem em `price-chart-v2`; a troca só entra com paridade da fila #14 (mitigação mínima no antigo antes).
5. **Fallback de "acima do normal" em `sales-highlights`.** key-user e software-principal pedem remoção; é correção de comportamento atual, alinhada à regra do dono; incluída na Fase A.

## Decisão
Plano em `docs/redesenho-site/PROPOSTA_NOVA_VERSAO.md` e `CHECKLIST_NOVA_VERSAO.md` (35 itens, fases A, B, C). Ordem: A (limpeza, testes, páginas de erro, link da Black Friday, componente de vitrine + loaders, regras de elegibilidade, landing, Plus, imagens, responsivo, mitigação do gráfico), depois B (QA, rollout 10/50/100% em 21, 23 e 24/11, congelamento de 25 a 28/11), depois C. Fica de fora até 27/11: média oferta-dia pública, feeds RSS, ISR do layout, Playwright, remoção do lightweight-charts.
- Decisão do responsável do projeto: **pendente** (D1 a D8 no checklist). Nenhuma mudança de produção foi feita.

## Métrica de sucesso
Primeira oferta sem rolar no desktop; home p95 < 3 s (50 amostras); altura mobile <= 14.000 px; JS < 200 KB brotli; 0 imagem repetida; 0 oferta acima do normal/Xbox One/retrô/Open Box em vitrine; 100% dos cartões com horário; 1 média por produto em todas as telas; rollback exercitado; `test:front-regras` verde.

## Execução e verificação
- Executores: engenheiro-frontend, engenheiro-backend, dba-postgres, engenheiro-performance-web, designer-marca, bi-dataviz, editor-noticias. QA: qa-verificador antes de cada rollout. ADR proposto: `docs/08-decisoes-adr/0012-redesenho-landing-vitrines-e-flag.md`.

## Observações de operação
- O pesquisador-benchmark abriu, por `tabs_context_mcp` com `createIfEmpty`, um grupo e uma aba novos (aba 1311993717, fechada por ele); o bi-dataviz deixou aberta a aba 1311993383 (aba nova dele, não fechada por mim, conforme o aviso do operador). O operador deve conferir o grupo de abas dos loops. Depois do aviso, os demais agentes receberam a proibição de navegador.
- Sem dado fake: os números dos pareceres são medidas por HTTP ou leitura de código; onde não medido, está marcado.

## Retrospectiva
A preencher após o rollout (24/11).
