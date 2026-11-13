# Checklist da nova versão do front — 2026-11-13

Regra: uma linha por entrega; só vira "pronto" com o critério verificado pelo `qa-verificador`. Estados: fila / em andamento / verificação / pronto. Prazo-guia: 100% no ar em 24/11, congelamento de 25 a 28/11. Esforço em horas (h) é estimativa dos pareceres (RECOMENDAÇÃO). Fases: A = antes de 20/11 (corte da Black Friday), B = 20 a 24/11 (rollout), C = depois de 27/11. Decisões do dono: D1 a D8 (ver ata e resumo).

| # | Fase | Entrega | Dono | h | Critério de pronto | Depende de |
|---|---|---|---|---|---|---|
| 1 | A | Limpeza: remover `SectionFallback`, `DividerEmblem`, `PriceIntelligence`, `UniversesSection`, 5 componentes órfãos (exceto `platform-showcase` até decidir), 6 dependências Radix sem uso | engenheiro-software-principal | 4 | `tsc --noEmit` saída 0; `page.tsx` < 700 linhas; commit separado | D (nenhuma) |
| 2 | A | Teste vigia `test-home-sem-orfaos` e script `test:front-regras` (afiliado, cantos retos, imagens únicas por caminho e hash, sem usado/retrô, sem dado hardcoded, preço com horário) | qa-verificador + engenheiro-software-principal | 10 | `npm run test:front-regras` verde; roda no pre-push | 1 |
| 3 | A | `app/error.tsx` e `app/global-error.tsx` com a marca; investigar a 500 em `/ofertas` nos logs | engenheiro-frontend + engenheiro-backend | 3 | forçar erro mostra página da marca em português; 0 página padrão do Next em 65 cargas | - |
| 4 | A | Link de `/black-friday` em header, drawer, rodapé e home; contagem regressiva até 27/11 | engenheiro-frontend | 3 | link a 1 clique da home em desktop e celular | - |
| 5 | A | Quebrar `page.tsx` em módulos por seção (sem mudança visual) | engenheiro-software-principal | 6 | `page.tsx` < 120 linhas de composição; HTML equivalente | 1 |
| 6 | A | Componente `VitrineOfertas` + tipo `VitrineItem` (sem `any`), variantes grade e faixa (embla, snap no celular), esqueleto de altura fixa | engenheiro-frontend + engenheiro-software-principal | 14 | usado em 3 vitrines; cartão <= 400 px; 0 CLS medido | 5 |
| 7 | A | Loaders `getVitrine(chave)` com `createPersistedQuery` (teto 3 a 5 s, `maxStale` 24 h), 1 leitura em lote por vitrine, `above` exclui, vendedor fraco exclui, 1 item por master, vitrine < 4 itens some | engenheiro-backend + dba-postgres | 12 | `test-vitrine-regras` verde; nenhuma consulta sem teto; home p95 < 3 s em 50 amostras | 6 |
| 8 | A | Filtros de elegibilidade da vitrine: piso 5 ofertas e 14 dias, queda máx. 50%, sem acessório com nome de jogo (encarte, capa, caixa), sem Xbox One/360/retrô/Open Box, plataforma `unknown` nunca entra | especialista-precos + guardiao-catalogo | 8 | auditoria: 0 ocorrência nas vitrines (consulta + HTML); `test-vitrine-plataforma` verde | 7, D2 |
| 9 | A | Rótulos fixos e cartão único (6 indicadores), horário de leitura no cartão (R-39), texto >= 12 px, alvo >= 44 px abaixo de `lg` | engenheiro-frontend + especialista-precos | 8 | 0 "Média Histórica"/"Maior Desconto vs. Média"; 100% dos cartões com horário; 0 alvo < 44 px | 6, D3 |
| 10 | A | Sessões da landing: Hero compacto, Quadro de destaques (12), Mudanças do menor preço (8) | engenheiro-frontend | 10 | primeira oferta sem rolar no desktop; contagem 12/8 verificada por script em 1440 e 390 | 7, 8, 9 |
| 11 | A | Faixas de plataforma (4 faixas, jogos 10 + consoles 6, sub-abas PS4/Switch 1) | engenheiro-frontend + gamer-veterano (curadoria) | 10 | cada faixa >= 4 itens ou some; 0 Xbox One/360; contagens 10/6 | 7, 8, 10; D4 |
| 12 | A | Faixa Geek Plus (consolidar `SecaoPlusHome` + `FaixasPlusHome`), 6 departamentos com 1 produto cada, sem selo nem média | engenheiro-frontend | 6 | 0 selo/média em loja Plus (R-36); links para `/mercado/<dept>` | 6 |
| 13 | A | Sessões Menor preço registrado, Acessórios e Colecionáveis | engenheiro-frontend | 6 | somem se < 4; corroboração de 2 vendedores | 7, 8 |
| 14 | A | Notícias na home: 4 matérias com data e fonte; some se < 3 nos últimos 14 dias | editor-noticias + engenheiro-frontend | 4 | 4 links `/noticias/<slug>` na home com fonte e data | D6 |
| 15 | A | Retirar `/inteligencia-gamer` (redirect 308 para `/noticias`), colunistas fixos, CTA "milhares", `news-ticker`, teaser do Observatório na home, enquete/Números/Benefits/StatementBand | engenheiro-frontend + editor-noticias | 5 | grep sem `INTEL_ITEMS`; 0 "retrô/usado" no HTML fora de `/termos` | D5 |
| 16 | A | Flag `REDESENHO_HOME` (percentual), `?v=2` só admin, home atual intacta | engenheiro-software-principal + engenheiro-infra-sre | 3 | liga/desliga sem deploy (confirmar se a Vercel lê em runtime); rollback < 5 min | - |
| 17 | A | Imagens: reexportar PNGs > 2 MB em WebP/AVIF no mesmo caminho; `sizes`/`priority` na dobra; cache imutável em `/images/*`; remover fundo de 2,5 MB e preload; logo 240x90 | engenheiro-performance-web | 8 | imagens locais da home < 600 KB; JS inicial medido; sem arquivo duplicado | D7 |
| 18 | A | Responsivo: ocultar barras fixas em paisagem curta; produto em paisagem com imagem <= 60% da altura útil; texto < 12 px; `rounded-*` no código | engenheiro-frontend | 8 | 844x390 com >= 280 px de conteúdo útil; 0 rolagem horizontal nas 65 células | - |
| 19 | A | Gráfico, mitigação mínima no antigo: parar de sobrescrever o último ponto; remover selo duplicado | bi-dataviz + engenheiro-frontend | 3 | no caso RE Village PS5 não há diagonal final; 1 selo | - |
| 20 | A | Imagens novas: dono gera IMG-01 a IMG-06 (e substitutas R-01 a R-03) a partir de `PROMPTS_IMAGENS.md`; engenheiro coloca em `public/images/` | dono + designer-marca | - | arquivos no repo, 1 uso cada (grep + SHA-1), sem texto/logo; até lá a faixa usa fundo sólido sem imagem | D7 |
| 21 | A | Duplicatas de imagem: 3 pares idênticos resolvidos; renomear `ferramenta-gestao-afiliados.png`; corrigir extensão de `painel-analitico-86-light.png` | designer-marca + engenheiro-frontend | 2 | 0 par com SHA-1 igual; 0 "afiliad" no HTML público | 20, D7 |
| 22 | A | `/entrar`: "Divulgador" no botão e texto | engenheiro-frontend | 1 | 0 "afiliado" em texto, alt e nome de arquivo | - |
| 23 | B | QA completo: tsc, build, `test:front-regras`, matriz 65 células re-medida, valores do cartão contra o banco em 3 produtos, rollback exercitado | qa-verificador | 8 | relatório do QA sem pendência grave | 1 a 22 |
| 24 | B | Rollout 10% (21/11), 50% (23/11), 100% (24/11); comparar LCP, 5xx e cliques de saída contra a home atual | engenheiro-infra-sre + estrategista-mercado | 4 | sem piora; senão desliga a flag | 23 |
| 25 | B | Telegram t.me/egeek86 no alto e no rodapé; JSON-LD Product/Offer nas páginas de produto com média | estrategista-mercado + engenheiro-frontend | 5 | link presente; JSON-LD só com preço real coletado | 24 (pode ir junto) |
| 26 | B | Congelamento 25 a 28/11: só correção de erro | geek-lead | - | nenhum deploy de funcionalidade nos 4 dias | 24 |
| 27 | A/B | Gráfico novo (V2 evoluído): contrato com campos novos (0,5 d), componente (1 d), troca nas 2 telas (0,5 d), flag ligada só depois da paridade #14 | bi-dataviz + engenheiro-backend | 16 | 0 diagonal fora de dias medidos; média do gráfico = cabeçalho = selo; todos os eventos listados; contraste 4,5:1 | fila #14, #13; D1, D8 |
| 28 | C | Remover `price-history-chart` e lightweight-charts; JS menos ~60 KB gzip | engenheiro-software-principal | 6 | 1 componente de gráfico; bundle medido | 27 |
| 29 | C | Notícias: feeds RSS oficiais com cron 2 h, alerta de frescor 48 h, vínculo notícia-produto, SEO por matéria, fim do scraping | editor-noticias + integrador-apis + engenheiro-backend | 24 | 100% das matérias com fonte, data, editoria, description, canonical, OG, JSON-LD | D6 |
| 30 | C | Layout raiz sem `cookies()`/`headers()` (ISR), tema via script inline | arquiteto-next + engenheiro-performance-web | 6 | HIT de cache >= 80% nas listas; sem flash de tema nos 2 temas | reunião do conselho |
| 31 | C | Ligar `PRICE_DAILY_SHADOW`, comparar 20 produtos lado a lado, trocar a leitura pública para oferta-dia, emendar AGENTS.md | cientista-precos + estatistico-senior | 16 | divergência < 2% em 90% dos 20 produtos; 4 médias viram 1 | fila #13, #14; D3 |
| 32 | C | Playwright como devDependency e teste responsivo automático | qa-verificador | 8 | 0 overflow horizontal nas 4 larguras em retrato e paisagem | D (autorização) |
| 33 | C | Fichas de benchmark faltantes (KaBuM!, Nuuvem, Magalu, ML, Amazon, Shopee, PCPartPicker) e mobile real dos portais | pesquisador-benchmark | 8 | 7 fichas em `research/benchmarks/fichas` | - |
| 34 | C | Tipagem: eliminar `any` de loaders e `metricsMap` | engenheiro-software-principal | 4 | `any` fora de `sales-highlights` e loaders de vitrine | 6 |
| 35 | C | Arquivar `platforms/*.png` e `PlatformShowcase` ou reaproveitar; apagar as 23 imagens sem uso após conferir `cover_image_url` no banco | designer-marca + dba-postgres | 3 | 0 imagem sem uso (ou justificativa) | 14, 29 |

Total estimado: Fase A cerca de 134 h de trabalho de agentes (mais 16 h do gráfico novo, item 27, que corre em paralelo); B cerca de 17 h; C cerca de 75 h. Em tempo corrido, A cabe em 6 a 7 dias com 3 agentes em paralelo (frontend, backend/dados, performance/QA); é o caminho crítico para 24/11.

## Decisões do dono (uma por vez, com recomendação)
- D1 Amazon no gráfico e no menor preço da ficha (ADR 0010 a põe na média; o cartão de histórico a tira da série). Recomendo incluir, com rótulo da loja.
- D2 Piso único de 5 ofertas e 14 dias em todo indicador público, teto de queda 50%. Recomendo sim.
- D3 Trocar a leitura pública para oferta-dia só depois da comparação em sombra (pós-27/11) e emendar o AGENTS.md. Recomendo sim; até lá, só rótulos e pisos.
- D4 Faixas de plataforma: 4 faixas (PlayStation, Nintendo, Xbox, PC e portáteis) com sub-abas. Recomendo sim.
- D5 `/inteligencia-gamer`: redirect 308 para `/noticias` agora. Recomendo sim.
- D6 Notícias: duas editorias, feed oficial semiautomático depois de 27/11, fim do scraping. Recomendo sim.
- D7 Visual: premium dark na landing (quadrinho só em páginas editoriais); gerar IMG-01 a IMG-06 e substitutas pelos prompts. Recomendo sim.
- D8 Congelamento de 25 a 28/11 e adiamento do que está na seção "fora" da proposta. Recomendo sim.

## Estado dos itens do agente frontend (Fase A, 2026-11-13)
Estados: fila / em andamento / verificação (feito, aguarda o qa-verificador) / pronto.
- #1 verificação: removidos `SectionFallback`, `DividerEmblem`, `PriceIntelligence`, `UniversesSection`; órfãos `delete-article-button`, `antibot-shield`, `news-ticker`, `price-charts-showcase`, `ui/index.ts` (`platform-showcase` mantido); 6 dependências Radix sem uso (checkbox, dropdown-menu, label, popover, tabs, tooltip). `tsc --noEmit` saída 0. `page.tsx` ainda > 700 linhas até o item #5. CSS `.news-ticker*` em `globals.css` ficou (arquivo da frente de performance).
- #3 verificação: `src/app/error.tsx` (dentro do layout, com tentar de novo, home e ofertas) e `src/app/global-error.tsx` (html/body e estilo inline) criados. Causa provável da 500 em `/ofertas` (HIPÓTESE forte, sem acesso a log da Vercel): `listNetworks()` usa `withTimeout` de 4 s que LANÇA e a página não tratava; em carga a frio de 4,6 s medida em 13/11 a 1ª de 5 chamadas passou do teto. Corrigido com `.catch` (segue sem o filtro de rede). QA: forçar erro e conferir a página da marca; 65 cargas sem página padrão.
