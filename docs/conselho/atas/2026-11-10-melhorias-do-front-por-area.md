# Ata do Conselho Geek: melhorias do front por área, com a chegada dos novos nichos

- **Data:** 2026-11-10 (Black Friday em 2026-11-27: faltam 17 dias; congelamento de regras, coleta e esquema em 2026-11-20)
- **Porte:** grande. SOMENTE LEITURA E PLANEJAMENTO: nenhum código, banco, Vercel, commit ou deploy foi alterado. Nenhuma ferramenta do Chrome foi usada (abas do dono com coleta rodando).
- **Presidente:** geek-lead
- **Convocados (pareceres independentes, em paralelo):** engenheiro-frontend, designer-marca, key-user-gamer, engenheiro-performance-web, estrategista-mercado, especialista-precos, bi-dataviz, arquiteto-next, qa-verificador (pedidos pelo dono), mais gamer-veterano (mesa fixa) e guardiao-catalogo (identidade do produto no front). Conselho consultivo; decisão de negócio é do dono.

Convenção: **[D]** medido (curl ou contagem desta sessão ou das atas de 08 e 10/11), **[C]** visto no código, **[H]** hipótese, **[R]** recomendação.

## Briefing
Pergunta do dono: como melhorar o front em cada área, principalmente com a subida de novos nichos (tecnologia, eletroeletrônicos, livros, eletrodomésticos, esporte) além de games. Prioridade já declarada pelo dono: receber comissão. Não se reabrem decisões tomadas (ADR 0004, 0007, 0008; Shopee na média pública; Black Friday só com Mercado Livre e Shopee).

Regras que nenhuma proposta pode quebrar: cantos quadrados; uma imagem, um lugar; zero dado fake ou sintético; cliente nunca vê "afiliado"; um jogo = um master = uma média (oferta-dia); Next 16 (ler `node_modules/next/dist/docs` antes de codar); `PRICE_METRICS_V2` e `PRODUCT_CARD_V1` OFF até decisão do dono por volta de 20/11; superfícies públicas só `vertical='games'` (as 5 novas ocultas); preço da Amazon sempre com data e hora.

Critério de corte para a Onda A (fixado pelo presidente): só entra o que **protege conversão ou confiança na Black Friday** e não mexe em regra de preço, esquema ou coleta.

## Estado medido hoje (insumo dos pareceres)
- [D] TTFB 0,45 a 1,67 s nas rotas amostradas (2 amostras cada); **todas** as rotas respondem `Cache-Control: private, no-store` e `X-Vercel-Cache: MISS`: não há cache de borda. HTML: home 470 KB, `/ofertas` 1.020 KB (145 `<img>`, 1.458 links de oferta; `?page=2` devolve o mesmo tamanho, sem paginação real), `/tabela-de-precos` 419 KB, `/pesquisa` 96 KB, oferta 114 KB (performance-web, estrategista).
- [C] `images.unoptimized: true` em `next.config.ts` (confirmado agora); fotos do ML e da Shopee entram sem redimensionar; logo `geek 86.webp` 4220x1568 exibido a ~30 px; `SceneImage` é componente de cliente.
- [C] `/go/[slug]` espera um INSERT em `analytics_events` antes de redirecionar e **não bloqueia `affiliate_link_pending`** (4 ofertas games levam à loja sem comissão). `after()` existe na documentação do Next 16 (`docs/01-app/03-api-reference/04-functions/after.md`).
- [C] `src/proxy.ts` roda `updateSession` do Supabase em toda página pública; isso, somado a `force-dynamic`, é o que impede o cache de CDN (arquiteto-next não separou as duas causas).
- [C] Aviso de comissão (`commission-notice.tsx`, fonte única, sem a palavra "afiliado") está no rodapé, carrinho, tabela de lojas e `/oferta-encerrada`; **não está na página da oferta nem junto ao botão "Ir à loja"**.
- [C] `price-table-board.tsx` (linhas ~340-355) mostra a média própria com `line-through` e "-X%": é um "de/por" feito com média própria, o ponto mais perigoso do front (CDC e coerência com a regra de uma média só).
- [C] `price-verdict.ts` exige 5 cotações e 14 dias; a regra aprovada é 14 dias e 3 ofertas distintas.
- [C] Nenhum componente aceita configuração por vertical: `offer-card.tsx`, `offer-filters.tsx`, `price-table-board.tsx`, `results-grid.tsx` usam `GAME_*_LABELS`. Há 55 usos fixos de `GAMES` em `src/server/queries/*.ts`; `publicOffersCtes(vertical)` já exige o parâmetro (bom), mas as páginas não o passam.
- [D] Nenhuma imagem repetida em `src` (única repetição: `og-cover.png` em OpenGraph e Twitter, mesma meta, não é violação). 77 arquivos em `public/images`, 20 sem nenhuma referência (todas gamer), **0 imagens de tecnologia, livros, eletro ou esporte**. Busca cobre só caminhos literais.
- [D] "afiliad" no HTML publicado: 0 em `/`, `/ofertas`, `/pesquisa`; 3 em `/sobre`, todas no nome do arquivo `ferramenta-gestao-afiliados.png` e no `id` da seção (não é texto visível). Em `/entrar` o texto visível é "Divulgador"; "afiliado" é só identificador de código (`entrar/page.tsx:166,361`), não aparece ao cliente. Oferta individual não foi varrida.
- [D] Não há teste de componente, rota, e2e nem CI (`.github/workflows` ausente). Existe `scripts/test-vertical-isolation.ts`, que confere SQL e código, não o HTML.
- [D] Dados que o front mostra: 4.523 masters games visíveis, 2.469 sem oferta ativa, 1.914 com 1 rede, 140 com 2 ou mais; 102 jogos e 161 acessórios visíveis em plataforma `unknown`. Verticais novas: 52 masters, 0 visíveis; ofertas ML ativas: tecnologia 106, livros 152, eletroeletrônicos 28, eletrodomésticos 13, esporte 0 (ata de 10/11).
- Não há analytics de funil no HTML. A única medição própria é o evento `affiliate_click` (servidor, sem cookie) gravado em `/go`.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| engenheiro-frontend | Home e oferta prontas, sem BF e sem aviso no botão | Aviso no CTA, "link em ativação", faixa BF, menu com constante única; `/mercado/[vertical]` só em C | Cliques por oferta; LCP/INP medidos |
| designer-marca | Marca 100% gamer, zero imagem para nichos | BF tipográfica sem imagem nova; tinta secundária por departamento em C; 8 imagens novas só após liberar | Imagens vindas do banco; prints mobile e tema claro |
| key-user-gamer | Primeira dobra institucional, comparação rasa (140 masters com 2+ redes) | Aviso e expectativa de saída no botão, faixa BF, esconder sem-loja e `unknown`, tirar `/ranking` do menu | Funil e abandono do clique extra do ML |
| engenheiro-performance-web | Aguenta tráfego normal; pico da BF exposto em 4 pontos | `/ofertas` paginada, cache de borda anônimo, imagens, `/go` sem bloqueio, BF pré-calculada | RUM de Web Vitals; cota de imagem da Vercel; conexões no pico |
| estrategista-mercado | Medir funil antes de otimizar; departamentos só após BF | Peso de `/ofertas`, frase antes do clique do ML, BF só ML+Shopee, Amazon como referência | Funil real, comissão por clique |
| especialista-precos | Incoerência de média e "de/por" próprio na tabela | Remover `line-through`/"-X%", frescor com "desatualizado", "menor já visto" com data e loja | Idade real do dado exibido; masters com 14 dias e 3 ofertas |
| bi-dataviz | Gráfico V2 é a melhor base; canvas legado sem alternativa acessível | Tabela alternativa e janela 1A no V2; paridade selo/gráfico/tabela é o teste de ligar a flag | GTIN por master; série mais longa que 18 dias |
| arquiteto-next | Helpers já tipados; páginas não passam `vertical` | Registro único de departamento; `vertical` parametrizado em C; `/mercado/[vertical]` privada; cuidado com proxy e `cacheComponents` | Valor real das flags na Vercel; causa do `no-store` |
| qa-verificador | Sem rede de proteção automatizada do front | `test-html-publico`, `test-imagens-unicas`, isolamento no HTML, teste de flag em preview | Navegador, `build`, varredura de links incompleta |
| gamer-veterano | Contra abrir esporte e eletro no público; nichos geek (setup, livros) em camada à parte | Edição/mídia/região no cartão, "quedas do dia", renomear menu, nichos só após BF | Cobertura de edição e região por master |
| guardiao-catalogo | Identidade só existe para games; `unknown` inconsistente | Corrigir os 263 `unknown` na origem (nunca rotular no front); allow-list de veredito nas rotas; selo de edição limitada e região | Onde ISBN/MPN/voltagem ficam no master |

## Divergências e réplica (rodada 2)
1. **Quando entra a página Black Friday.** estrategista-mercado e especialista-precos a colocaram na Onda B; frontend, designer, key-user e gamer-veterano, na A. Réplica: a Onda B é congelada e só aceita correção, então nada novo pode nascer nela. **Resolvido: Onda A, pronta e em produção até 19/11**; o conteúdo dela é lido de consultas existentes, sem regra nova. Ponto aceito do estrategista: sem número de funil não se mede, então a medição por SQL do `affiliate_click` começa já.
2. **Cache de borda para páginas anônimas (performance-web, A) contra risco do proxy e do congelamento (arquiteto-next, qa).** O cabeçalho `s-maxage` exige tirar a leitura de cookies do corpo da página e contornar o `updateSession`; errar isso pode servir sessão ou carrinho de um usuário a outro, ou preço velho. **Resolvido por escopo:** na Onda A, cache de borda **só na página Black Friday (anônima por construção)**, paginação da `/ofertas` (reduz o banco sem tocar cache), `/go` sem bloqueio e aquecimento pós-deploy; para home, `/ofertas`, `/pesquisa` e `/tabela-de-precos` faz-se um **ensaio em preview** e o go/no-go é em 17/11 junto da decisão da Amazon. Sem go, fica para a Onda C. Nunca ligar `cacheComponents` antes de 27/11.
3. **Refatorar as 55 queries para receber `vertical` agora (arquiteto-next, janela 10 a 19/11) contra risco de regressão (qa, designer).** Não protege conversão e mexe em leitura pública. **Resolvido: Onda C.** Na A entra apenas o arquivo inerte do registro de departamento (sem uso em produção), para que a C comece sem retrabalho.
4. **Renomear o menu e o chrome (gamer-veterano, A) contra "não mexer no chrome depois de 20/11" (designer, key-user).** Resolvido: mudança de menu cabe na A (até 18/11) e é limitada a constante única, rótulos claros, filtro de plataforma e saída do `/ranking`; nada de novo eixo de departamento antes de dezembro.
5. **Imagens otimizadas (`unoptimized: false`).** performance-web a quer em A; falta a cota de transformações da Vercel (dado que ninguém tem). **Resolvido:** na A, só o que não custa nada (logo reduzido, `fetchpriority` nas 2 a 4 primeiras, `remotePatterns` restrito aos hosts reais, `sizes` real); ligar o otimizador depende de o dono conferir a cota (decisão listada).
6. **Aviso de comissão.** frontend, designer, key-user, estrategista, qa e especialista pedem; o dono já decidiu "não precisa" e a decisão foi reapresentada na ata de 10/11. Nada a reabrir aqui: o item está desenhado (A1) e só entra se o dono aprovar a decisão 2 daquela ata.
7. **Sinal desencontrado a esclarecer:** o parecer do QA sugeriu renomear o papel "Afiliado" em `/entrar`. Conferido no código: o texto ao cliente já é "Divulgador"; resta só o nome do arquivo e o `id` em `/sobre` (item A9). Não há decisão do dono a pedir sobre isso.

## Quadros por área
Esforço em dias de trabalho do executor. "Dono" é o agente que executa; a decisão é sempre do responsável do projeto. Prioridade: P1 protege conversão/confiança na BF; P2 importante; P3 pode esperar.

### Área 1. Home e primeira dobra
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica de sucesso |
|---|---|---|---|---|---|
| [C] `(shop)/page.tsx`, 930 linhas, `force-dynamic`, caminhos de imagem fixos no código; 1ª dobra institucional ("Informação real sobre games"); sem BF. [H] contador "3 cotações registradas 3.366.807" mistura lojas e cotações | Faixa Black Friday (ver área 7) acima do conteúdo; revisar microcópia do contador para não confundir lojas com cotações | P1 | 0,5 (faixa já contada na área 7) | engenheiro-frontend | Faixa visível sem rolagem em 390 px; 0 número sem origem no banco |
| Bloco "quedas do dia" ausente, embora existam 580 eventos de menor preço nas últimas 24 h [D] | Bloco "Quedas do dia" com eventos reais (hora, valor, loja), marcando eventos `reconstructed` (84%) ou omitindo-os | P2 | 2 a 3 | engenheiro-frontend, cientista-precos | Só eventos com origem em `price_min_events`; reconstruídos rotulados |
| Primeira dobra trocada para "menor preço agora" (key-user) | Reavaliar após medir funil | P3 | 1 | key-user-gamer | Cliques `/go` por visita da home +X% (X definido após linha de base) |

### Área 2. Navegação e menu
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| [C] itens em constante dentro de `app-header.tsx`; `mobile-nav-drawer.tsx` e `bottom-tab-bar.tsx` com listas próprias (3 listas); rótulos "Bolsa Gamer", "Observatório Gamer" sem explicar; `/ranking` (placeholder) exposto; rodapé diz "Loja"; barra mobile destaca Hype em vez de Ofertas | Constante única de navegação; rótulos descritivos com subtítulo; tirar `/ranking` do menu (ou rotular "em construção" se o dono preferir manter); trocar "Loja" no rodapé; destacar Ofertas na barra mobile | P1 | 1,5 | engenheiro-frontend, key-user-gamer | 0 link para rota placeholder; 3 listas viram 1; varredura de links 100% 200 |
| Sem plataforma no menu | Filtro de plataforma (PS5, Switch, Xbox) no topo de `/ofertas` e `/tabela-de-precos`, ligado ao menu; molde do futuro filtro de departamento | P2 | 2 | engenheiro-frontend | Filtro usa só valores existentes; 0 plataforma `unknown` na lista |
| Eixo de departamento ausente | Seletor de departamento só em dezembro (Onda C), a partir do registro único | P3 | 3 a 4 | arquiteto-next, designer-marca | Ver área 3 |

### Área 3. Entrada dos novos nichos (arquitetura de informação, páginas, filtros, cartão, imagens)
Posição da rodada 1: nada de nicho ao público antes da Onda C (52 masters em revisão, 0 visíveis [D]; esporte com 0 ofertas). **Superada pela decisão do dono relatada durante a reunião ("pode subir eles por enquanto"):** vale a EMENDA (seção "publicação mínima e reversível"), com abertura faseada de tecnologia, livros e eletroeletrônicos, atrás de flag no banco, sem tocar games; eletrodomésticos e esporte seguem fechados por falta de base. Os quadros abaixo descrevem a versão completa (Onda C).

| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| [C] `verticais.ts` com `VERTICALS`, `verticalSql`; helpers exigem `vertical`; não há registro de departamento; menu e sitemap gamer fixos; sem `/mercado/[vertical]` | **Registro único de departamento** (`src/lib/catalog/departamentos.ts`): slug, rótulo, visibilidade (pública/privada), tipo de cartão, atributos, filtros, unidades. Na A, só o arquivo, sem uso em produção. Menu, sitemap, 404 e tabela derivam dele na C | P2 (A: arquivo; C: uso) | 1,5 | arquiteto-next | Arquivo compila; 0 mudança de comportamento (contagens games idênticas) |
| 55 usos fixos de `GAMES` em queries; páginas não passam `vertical` | `vertical` obrigatório e sem default em toda query pública; `GAMES` explícito no chamador games | P1 na C | 3 a 4 | arquiteto-next, dba-postgres | Teste de vazamento verde; contagens e médias games antes/depois com diferença zero |
| Rota inexistente (curl em `/mercado/livros` dá 404, esperado) | `/mercado/[vertical]` com `dynamicParams = false`, `notFound()` fora do registro público, `noindex`, atrás de flag privada; paginada desde o dia 1 | P2 | 2 | arquiteto-next, engenheiro-frontend | Departamento desligado devolve 404; fora de sitemap, menu e busca |
| Cartão e filtros assumem jogo (`GAME_*_LABELS`, `classifyCatalogItem`, `specLine`) | **Cartão por tipo** com a mesma estrutura do cartão-pai e uma linha de identidade por tipo: jogo (plataforma, formato, edição, região); livro (ISBN-13, edição, formato); eletro (voltagem, capacidade, modelo); tecnologia (modelo, part number); esporte (tamanho, variação como seletor da oferta, média única do master). Linha ausente quando o dado não existe | P2 | 3 | engenheiro-frontend, guardiao-catalogo, designer-marca | Nenhum cartão fora de games usa rótulo de jogo; 0 atributo sem origem no master |
| Campo legível de identidade no master não confirmado (ISBN, MPN, voltagem, polegada ficam na chave do coletor) | Campo `identity` legível e preenchido na semeadura; sem dado, sem linha | P2 | 3 a 4 | guardiao-catalogo, engenheiro-backend | % de masters novos com identidade forte visível; 0 estimativa |
| Média: games não se mistura com eletro | Grade, média, selo e busca sempre por departamento; sem busca global entre departamentos até a C; teste automático no HTML | P1 na C | (no item de queries) | qa-verificador | Teste de isolamento no HTML publicado: 0 slug com `vertical<>'games'` em superfície games |
| Imagens: 77 arquivos, 20 órfãs (todas gamer), 0 de nichos | **8 imagens novas** (1 cabeçalho de departamento + 1 de vitrine para tecnologia, livros, eletro, esporte), tratamento abstrato por cor, `contain` em foto de produto; nenhuma órfã reaproveitada; gerar só após liberação. Tinta secundária por token `--dept-accent` (filete e rótulo), sem paleta nova | P3 | 2 (+ geração) | designer-marca | `grep` de cada caminho novo = 1 uso; contraste AA nos dois temas |
| Marca: gamer-veterano contra esporte e eletro no público | Home 100% games; nichos em camada separada ("Mais do mundo geek", nome a decidir); ordem: tecnologia e setup, eletroeletrônicos, livros geek, depois eletro; esporte fora do primeiro semestre | P2 | decisão | geek-lead, dono | Condição de abertura por departamento: ≥14 dias de oferta-dia, ≥3 ofertas por master, mínimo de masters com oferta ativa (definido pelo dono), 0 vazamento |
| `unknown` em 102 jogos e 161 acessórios visíveis; filtro tira `unknown`; cartão omite o rótulo | Corrigir **na origem** (derivar do título; o que não resolver vai para revisão e some do público), nunca rotular "plataforma não identificada" no front | P1 | 2 a 3 | guardiao-catalogo (apply com dry-run e backup) | 0 master visível em `unknown`; nenhuma duplicata nova (passa por `findExistingMasterProduct`) |

### Área 4. Lista de ofertas e pesquisa
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| [D] `/ofertas` com 1.020 KB, 145 imagens, limites 250/120/120 (600/200/300 com filtro), `?page=2` sem paginação real; [C] filtros de tipo, fabricante, geração, formato, rede, ordem; sem região, edição, pré-venda, "caiu esta semana" | **Paginar** 24 a 48 cards por seção e carregar o resto sob demanda; chips de contagem já são reais e independentes do limite | P1 | 1,5 a 2 | engenheiro-frontend, engenheiro-performance-web | HTML de `/ofertas` ≤ 200 KB; contagens dos chips idênticas |
| [D] 2.469 de 4.523 masters visíveis sem oferta ativa (54%) | Rebaixar na ordenação padrão e não listar na vitrine quem não tem loja ativa (continuam acessíveis por busca/URL, com aviso) | P1 | 1 | engenheiro-frontend | 0 card sem loja ativa na primeira tela |
| Filtros sem edição e região, que o colecionador procura | Filtros de edição (steelbook, colecionador, deluxe), região e mídia física/digital, apenas onde o dado existe | P2 | 3 a 4 | engenheiro-frontend, guardiao-catalogo | Filtro só exibe valores com ≥1 master real |
| `/pesquisa` delega a `search-results-view.tsx`; estado vazio não auditado | Auditoria de estado vazio e erro (axe e mobile) | P2 | 1 | qa-verificador | Estado vazio com caminho de saída em 100% das listas |

### Área 5. Página do produto e da oferta
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| [C] `(detalhe)/ofertas/[slug]/page.tsx` mostra "Ir à loja" para qualquer `affiliateUrl`; sem `CommissionNotice`; botão igual para `affiliateLinkPending`; Amazon já mostra data e hora (linha ~387) | **Botão com contexto:** frase de saída ("Você será levado ao <loja>; confirme o preço lá"), aviso curto de comissão (sem "afiliado") se o dono aprovar, e rótulo "link em ativação" nas pendentes | P1 | 1,5 | engenheiro-frontend | 100% das páginas de oferta com a frase; 0 "afiliad" no HTML |
| Fluxo do link oficial do ML (meli.la): abre a página de afiliado e exige um clique extra, fora do nosso controle | Mitigar só a **expectativa** (frase acima); não tentar esconder o intermediário. Medir abandono por rede com `affiliate_click` | P1 | (no item acima) + 0,5 SQL | engenheiro-frontend, estrategista-mercado | Taxa de clique `/go` por visita da oferta, por rede, antes e depois |
| `/go` espera o INSERT e não trata link pendente | `after()` para gravar o evento depois do redirect; cache de 30 a 60 s do SELECT por slug; pendente: não destacar "Ir à loja" e contar `linkPending` por dia (política final é decisão do dono, ata de 10/11 item 4) | P1 | 1 | engenheiro-backend | p95 do redirect < 500 ms sob carga; 0 clique perdido por pool saturado |
| Selo "Menor já visto" sem data nem loja; tabela com `line-through` e "-X%" sobre média própria | Selo só aparece com data e loja ("R$ X, <loja>, em dd/mm"); trocar `line-through` e "-X%" por "Média das lojas: R$ X" em texto neutro, com percentual só se passar 14 dias e 3 ofertas; rótulo de escopo sempre ("média das N lojas, 30 dias") | P1 | 2 | engenheiro-frontend, especialista-precos | 0 "de/por" com média própria; todo selo com data e loja |
| Frescor sem limite de "desatualizado"; V2 mostra "nenhuma oferta verificada nas últimas 48 h" só quando ligada | "Verificado há X" no cartão e na tabela (reaproveita `verificadoHaTexto`); acima do limite que o dono definir (sugestão 24 h) mostrar "desatualizado" em cinza e retirar selo e "% abaixo"; Amazon sempre com dd/mm hh:mm | P1 | 2 | engenheiro-frontend | 0 preço sem carimbo de tempo; 0 selo em oferta desatualizada |
| Gráfico legado (canvas, `lightweight-charts`, 635 linhas) sem tabela alternativa; V2 (SVG) com janelas sem 1A e `role="img"` sem tabela | Na V2: `<details>` com tabela dia, menor preço, loja e "coletando desde DD/MM"; incluir 1A; paridade de selo, gráfico, cabeçalho, monitoramento, ranking e tabela com a média oferta-dia como **condição para ligar a flag** | P1 (paridade) / P2 (tabela) | 2 + 1,5 | bi-dataviz, cientista-precos | Diferença zero no paralelo em ≥30 produtos; tabela alternativa presente |
| Edição limitada e região somem do cartão | Selo de edição limitada e região visíveis; mídia física/digital no topo | P2 | 2 | engenheiro-frontend, guardiao-catalogo | 0 par "mesmo jogo, dois produtos" sem diferenciador visível |
| `oferta-encerrada` genérica | "Esgotado", último preço visto com data e "ver similares" (referência Pelando) | P3 | 1 | engenheiro-frontend | Taxa de saída da página encerrada |

### Área 6. Monitoramento, acompanhar preço e carrinho
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| [C] `WatchToggleButton` e `CartToggleButton` na oferta; visitante vai a `/entrar?next=`; botão de alerta oculto por decisão; carrinho com `CommissionNotice`; `/monitoramento` usa `top-movers-table.tsx`; estado vazio não visto | Texto antes do login ("para acompanhar é preciso entrar") e volta à mesma oferta; auditar estado vazio de `/monitoramento` e `/carrinho` | P2 | 0,5 a 1 | engenheiro-frontend | Retorno à oferta após login 100% |
| Alerta exige login; concorrentes permitem e-mail | Alerta só por e-mail sem login | P3 | 3 a 4 | engenheiro-backend, jurídico | Depende de LGPD e de decisão do dono; fora da BF |
| `/monitoramento` e tabela usam a média legada (flags OFF) | Alinhar à média oferta-dia no mesmo ato que ligar a V2 | P1 (junto da flag) | 1 | cientista-precos | Mesma média em página, cartão e tabela |

### Área 7. Black Friday (só Mercado Livre e Shopee; Amazon tratada à parte)
Hoje: zero ocorrência no código público [C]. Proposta consolidada: **página `/black-friday` e faixa na home e em `/ofertas`**, tipográfica (sem imagem nova), em dourado e ember, contagem regressiva discreta e factual.

| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| Ausente | Página lendo **consultas já existentes**, filtrada por rede ML e Shopee, ofertas com oferta ativa fresca (< 6 h), cada uma com loja, valor e "verificado há X"; "menor preço medido desde DD/MM" só com `price_min_events` e `price_daily_offer` cobrindo o intervalo, com ≥14 dias e ≥3 ofertas; senão "coletando desde DD/MM" e só o preço. Sem selo de desconto, sem "de/por" do marketplace, sem cupom, sem contagem de lojas inventada. Páginas servidas com cache de borda 60 s (anônima por construção) | P1 | 2 a 3 | engenheiro-frontend, designer-marca, key-user-gamer | Página no ar até 19/11; 0 número sem origem no banco; 0 imagem nova ou repetida; 0 menção a AliExpress, Magalu ou cupom |
| Amazon: 138 ofertas ativas por raspagem assistida, decisão do dono de 10/11; recomendação do especialista-precos de ficar fora de média, histórico e alerta | Fora da campanha e das médias da BF; se o dono mantiver a Amazon visível no site, como **"consulta de referência"** com preço e dd/mm hh:mm e a frase exigida pelo contrato; decisão 3 da ata de 10/11 | P1 | 0,5 | engenheiro-frontend | 0 preço Amazon sem data e hora; 0 Amazon na página BF |
| Dependência de dado: 84% dos eventos de menor preço são `reconstructed`; 68 eventos com min = prev_min e 936 masters sem evento (ata de 10/11, não remedidos hoje) | O bloco de eventos só exibe após a correção prevista na ata de 10/11 (12 a 14/11); eventos reconstruídos com marca | P1 | (dependência) | cientista-precos, dba-postgres | 0 evento min = prev_min exibido |
| Poucas ofertas reais por loja podem deixar a página vazia | Mostrar só o que existe; se houver pouco, dizer a data e a regra, sem preencher | P1 | (incluído) | key-user-gamer | Nunca "vitrine vazia" nem número fixo |

### Área 8. Confiança e transparência
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| Aviso de comissão no rodapé, carrinho, tabela de lojas, encerrada; não no botão nem na vitrine; decisão do dono: "não precisa" | Versão curta junto ao botão da oferta e do cartão (texto: "Podemos receber comissão se você comprar"), fonte única em `commission-notice.tsx`; frase da Amazon junto das ofertas Amazon. **Depende da decisão 2 da ata de 10/11** | P1 | 1 | engenheiro-frontend, revisão jurídica | Aviso em 100% das ofertas; 0 "afiliad" |
| Selo sem fonte clara; sem página de método | Rótulo de escopo ("menor entre lojas" vs "este anúncio"), fonte e hora junto do número; **página "Como calculamos"** (oferta-dia, janelas, o que é reconstruído) quando a V2 estiver ligada | P2 (rótulo A) / P2 (página C) | 1 + 1 | bi-dataviz, especialista-precos | 100% dos números com escopo e hora |
| `/sobre` expõe `ferramenta-gestao-afiliados.png` e `id` "ferramenta-gestao-afiliados" no HTML | Renomear arquivo e `id` (atualizando o `src`) | P1 | 0,25 | engenheiro-frontend | 0 "afiliad" no HTML público de `/`, `/ofertas`, `/pesquisa`, `/sobre`, `/entrar`, oferta |
| Dois sistemas de média visíveis (legado e V2) se a flag alternar | Ligar V2 e CARD numa só virada (ou não ligar); nunca lado a lado | P1 | (regra) | qa-verificador | Página = cartão = tabela na mesma média |

### Área 9. Mobile, acessibilidade, Core Web Vitals e custo de renderização
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| Todas as rotas `private, no-store` (cache de borda nulo); vitrines `force-dynamic`; cache só em memória por instância (`swr.ts`), cada instância fria recomputa; banco com 60 conexões e pool de 10 por processo | **Aquecimento pós-deploy** (home, `/ofertas`, BF, 20 ofertas principais) com custo de conexões vigiado; ensaio em preview de `s-maxage=60, stale-while-revalidate` em anônimos, com decisão em 17/11 | P1 (aquecimento) / P2 (ensaio) | 1 + 1 | engenheiro-performance-web, engenheiro-infra-sre | Leitura fria < 5 s; conexões < 40 de 60 no ensaio de carga |
| `images.unoptimized: true`, `remotePatterns` com `**`; logo 4220x1568 a 30 px com `max-age=0`; nenhuma `<img>` com `fetchpriority="high"`; 3 famílias de fonte em preload | Logo em ~300 px com cache longo; `fetchpriority="high"` nas 2 a 4 primeiras imagens; `sizes` real; restringir `remotePatterns` aos hosts reais (`http2.mlstatic.com`, hosts da Shopee e Amazon). Ligar `next/image` otimizado só com a cota conferida | P1 (sem custo) / P2 (otimizador) | 1 | engenheiro-performance-web | LCP da home e de `/ofertas` medido em preview antes e depois; peso de imagem da primeira tela -X% |
| 140 usos de `text-[10px]`/`text-[11px]`; alvos de toque da barra inferior; tema claro (dourado `#B8860B`) não medido | Piso de 12 px, alvos de 44 px, revisão do tema claro | P2 | 1 | designer-marca, engenheiro-frontend | 0 texto < 12 px em informação de preço; alvos ≥ 44 px |
| `SceneImage` é `'use client'` e hidrata em cada card | Versão de servidor para o caso sem fallback interativo, ou limitar a cards acima da dobra | P3 | 2 | engenheiro-performance-web | INP medido na lista |
| Sem RUM de Web Vitals | Medição agregada sem identificador (reaproveitar `analytics_events`) após revisão da política de privacidade | P2 | 1,5 | engenheiro-performance-web, jurídico | LCP/INP/CLS p75 por rota e aparelho |
| `cacheComponents`/`use cache` | **Não ligar antes de 27/11** (troca a semântica de `dynamic` e `revalidate`); decidir em dezembro | P3 | decisão | arquiteto-next | ADR registrado antes |

### Área 10. Conta, entrar, sobre, institucional
| Hoje | Melhoria | Prior. | Esforço | Dono | Métrica |
|---|---|---|---|---|---|
| `/sobre` com 604 linhas e imagens fixas no código (histórico de repetição de 29/07); `/entrar` com cadastro por papel ("Divulgador"); `/termos`, `/privacidade`, `/contatos` | Renomear a imagem e o `id` de `/sobre` (acima); revisar rodapé ("Loja"); reduzir `/sobre` para o que o visitante da busca precisa (âncoras) em dezembro; revisar `/termos` e `/privacidade` para cobrir medição de cliques e aviso de comissão | P1 (rename) / P2 (resto) | 0,25 + 1 | engenheiro-frontend, revisão jurídica | `test-imagens-unicas` verde; textos jurídicos revisados antes da BF |
| Painel da conta sem eixo de departamento | Quando houver departamentos, o acompanhamento mostra o departamento do produto; nunca mistura | P3 | 1 | engenheiro-frontend | n/a até a C |

## PLANO EM 3 ONDAS

### Onda A, até 20/11 (10 a 19/11 de construção; 19 a 20/11 de verificação e subida). Só o que protege conversão e confiança
Capacidade realista: cerca de 25 dias de trabalho somados, em 3 trilhas paralelas (frontend, backend/dados, performance e QA). Cortar pela ordem abaixo se faltar tempo; o corte é decisão do presidente em 16/11.

**Núcleo (não se corta):**
1. `/go` com `after()` e política de link pendente (1 dia, backend); botão da oferta com frase de saída e "link em ativação" (1,5, frontend).
2. Página e faixa Black Friday ML + Shopee (2 a 3, frontend + designer + key-user), cache de borda 60 s só nela.
3. Tabela de preços sem `line-through`/"-X%" sobre média própria; selo "menor já visto" com data e loja (2, frontend + especialista-precos).
4. Carimbo de frescor "verificado há X" e "desatualizado" (2, frontend), limite definido pelo dono.
5. `/ofertas` paginada e sem card sem loja ativa na primeira tela (2 a 3, frontend + performance).
6. `unknown` corrigido na origem (2 a 3, guardiao-catalogo, com dry-run e backup NDJSON).
7. Rename da imagem e `id` em `/sobre` (0,25); aquecimento pós-deploy (1).
8. Testes novos: `test-html-publico`, `test-imagens-unicas`, isolamento no HTML (2,5, qa-verificador).
9. Aviso de comissão no botão (1, frontend), **somente se o dono aprovar a decisão 2 da ata de 10/11**; se não, o item sai e o risco fica registrado.

**Desejável (entra se sobrar capacidade):** constante única de navegação, `/ranking` fora do menu e rótulos (1,5); filtro de plataforma (2); selo de edição limitada e região no cartão (2); logo, `fetchpriority`, `remotePatterns` (1); arquivo inerte do registro de departamento (1,5); paridade de gráfico e tabela alternativa no V2 (3,5, **obrigatório se a V2 for ligada**); ensaio de cache de borda em preview (1).

**Marcos:** 14/11 base de testes pronta; 17/11 go/no-go do cache de borda e da Amazon; 18/11 código congelado para QA; 19/11 deploy com reversão ensaiada; 20/11 baseline de HTML salvo e congelamento.

### Onda B, 20 a 27/11 (congelada). Apenas correção
- Vale correção de bug, texto, link quebrado, regressão visual e erro de contraste. **Não vale** novo componente, novo eixo de menu, novo gráfico, mudança de regra de preço, flag nova, `cacheComponents`.
- Cada correção roda os mesmos scripts e um `diff` de HTML contra o baseline de 20/11; vigília diária de 429, frescor, conexões, `/go` e eventos do menor preço.
- A página Black Friday só recebe correção de dado, nunca desenho novo.

### Onda C, dezembro em diante
1. (Parte já antecipada para a Onda A pela EMENDA: registro, consultas de departamento, páginas mínimas, `/go`, flag no banco.) Falta na C: passagem de `vertical` obrigatória nas 55 queries games; `/mercado/[vertical]` privada, depois pública por departamento conforme a condição de dado (≥14 dias de oferta-dia, ≥3 ofertas por master, 0 vazamento, mínimo de masters ativos definido pelo dono).
2. Cartão e filtros por tipo (livro, eletro, tecnologia, esporte), campo `identity` legível, variante de oferta (tamanho, voltagem) sem criar master.
3. Identidade por departamento (tinta secundária, 8 imagens novas, nome de grupo), neutralizar "Gamer" no chrome compartilhado onde o contexto não for games.
4. Parecer + BI por produto (cartão-pai que cresce e camada sobreposta, ADR 0007): tabela alternativa, eventos do menor preço, depois "juízo" só com backtest e base.
5. Design system documentado (tokens, estados vazios, tipos de cartão), piso tipográfico, CI mínimo (typecheck, testes `test:*`, scripts novos) e Playwright com 6 rotas.
6. Alerta de preço por e-mail sem login (com LGPD); página "Como calculamos"; nova ordem de SEO (`generateSitemaps` por departamento público); decisão de `cacheComponents`; cache de borda geral se o ensaio aprovar; RUM de Web Vitals.
7. Hype Zone com pré-venda e lançamento por data (depende de calendário confiável); aposentar ou preencher `/ranking`.

## EMENDA (10/11, durante a reunião): publicação mínima e reversível dos nichos nesta semana
**Origem:** decisão do dono relatada pelo coordenador da sessão durante a reunião: "pode subir eles por enquanto também"; o foco passa a ser **vender** e criar **mensagens automáticas para grupos**. Esta emenda **substitui** a posição das seções acima de que nenhum nicho iria ao público antes de dezembro (áreas 3 e Onda C, item 1, e a primeira linha de "O que fica de fora"). Continua somente leitura: nada foi executado. Cada passo em produção (aprovar masters, ligar flag, deploy) ainda pede a autorização expressa do dono no momento, no padrão de "aprovação ampla com backup e log".

Medições desta emenda: [D] um conjunto de SELECTs em transação READ ONLY sobre `master_products` e `affiliate_offers` (10/11, ~21h40 local; script temporário apagado, nada escrito); [C] código de `src/lib/catalog/vertical/*`, `src/server/queries/public-offers.ts`, `src/app/go/[slug]/route.ts`, `src/db/schema/ops.ts`.

### E.0 Fatos que decidem o desenho
- [D] 52 masters fora de games, **todos** com `catalogGate.verdict='review'` gravado pela semeadura (rede de segurança), e **51 com `suggested='approved'`** (o porteiro por departamento acha a evidência positiva suficiente); 1 já `rejected` (TV LG 75", R$ 98.919, retirada a pedido do dono). Todos têm foto; todos só têm 1 rede (Mercado Livre).
- [D] Livros: 24 masters, todos com ISBN (campo `gtin`), 152 ofertas ativas (17 em quarentena, 24 com link pendente). Tecnologia: 17 masters, 106 ofertas ativas (**62 com link pendente**). Eletroeletrônicos: 5 masters válidos, 28 ofertas (5 pendentes). Eletrodomésticos: 5 masters (4 por marca+modelo sem GTIN, 1 com GTIN), 13 ofertas (5 pendentes). **Esporte: 0 masters, 0 ofertas** (a semeadura de bola parou em HTTP 429).
- [D] Todo master tem 1 oferta pendente que é a placeholder do catálogo; em tecnologia 23 de 25 ofertas do master Zotac RTX 5060 e todas as de 5 placas de vídeo e 2 impressoras são pendentes: **sem link rastreado não há comissão**, e o dono quer vender.
- [C] Os helpers `publicOffersCtes(vertical)` e `priceQuotesCtes(scope, vertical)` **já aceitam qualquer `Vertical`**; as páginas games chamam com `GAMES` fixo (55 usos em `src/server/queries`). Logo é possível criar consultas novas para departamento **sem editar nenhuma consulta de games**.
- [C] `catalogGateVisibleSql` é lista de exclusão: fora `review` e `rejected`, ausência de veredito vale aprovado. O mesmo filtro alimenta `eligibleOfferSql` das métricas oferta-dia. Consequência: enquanto estão em `review`, **estes masters não entram em `price_daily_offer`/`price_daily_state`**; ao aprovar, a série derivada começa a ser calculada (a partir dos snapshots, que existem desde 08/11). [H] Conferir que os jobs diários e `refresh-snapshots` não filtram só games.
- [C] `/go/[slug]` filtra `vertical = GAMES` e devolve `/oferta-encerrada` para qualquer outro departamento; **não bloqueia link pendente**.
- [C] Existe a tabela `feature_flags` (`key`, `enabled`, `rules`, `rollout_percentage`) sem nenhum uso no código. [C] As flags atuais são variáveis de ambiente (`PRICE_METRICS_V2`, `PRODUCT_CARD_V1`), que só mudam com novo deploy.

### E.1 O que precisa mudar no código (mínimo, por inclusão, sem tocar games)
Princípio: **construir ao lado, não por dentro.** Nenhuma consulta, página, média ou grade de games é editada; o departamento tem módulo, rotas e consultas próprias. Esforço total estimado: **6 a 8 dias de trabalho** (3 trilhas), que entram na Onda A **no lugar** de itens "desejável" (ver E.5).

| # | Mudança | Arquivos (novos, salvo indicação) | Esforço | Dono |
|---|---|---|---|---|
| 1 | **Chave de publicação por departamento no banco**, lida com cache de 30 a 60 s: linha em `feature_flags` por departamento (`dept_tecnologia`, `dept_livros`, `dept_eletroeletronicos`, `dept_eletrodomesticos`, `dept_esporte`), todas `enabled=false`. Reversão = `UPDATE ... enabled=false`, sem deploy. Mais a variável `MERCADO_UI=1` como trava mestra (precisa de deploy; só para esconder rota por inteiro) | `src/lib/catalog/departamentos.ts` (registro único: slug, rótulo, flag, tipo de cartão, atributos exibidos, mínimo de masters), leitor da flag; 1 linha por departamento inserida por script com dry-run | 1,5 | arquiteto-next, dba-postgres |
| 2 | **Consultas públicas de departamento** que reutilizam `publicOffersCtes(vertical)` e `priceQuotesCtes(scope, vertical)` e **exigem inclusão explícita**: `vertical = <dept>` E `catalogGate.verdict = 'approved'` (não a ausência de `review`) E oferta ativa, não quarentenada, **link não pendente**, checada há menos de 6 h. Sem busca global entre departamentos | `src/server/queries/departamento.ts` | 2 | engenheiro-backend, arquiteto-next |
| 3 | **Páginas mínimas**: `/mercado/[vertical]` (lista paginada com 24 cards, busca interna, ordenação por menor preço), `/mercado/[vertical]/[slug]` (produto), `dynamicParams=false` + `notFound()` quando a flag do departamento está desligada ou há menos de 3 masters elegíveis; `noindex`, fora do `sitemap.ts`, sem entrada em `generateStaticParams` (renderização sob demanda) | `src/app/(shop)/mercado/[vertical]/page.tsx`, `.../[slug]/page.tsx` | 2 | engenheiro-frontend |
| 4 | **Cartão e página do produto por tipo** com uma linha de identidade que **só aparece com dado do master**: livro = ISBN-13 (`gtin`), editora/marca (`manufacturer`); tecnologia = marca, part number (`mpn`), modelo; eletroeletrônico = marca, modelo, polegada; eletro = marca, modelo, **voltagem somente se o atributo existir**. Foto com `contain`, sem arquivo novo de `public/images`; cabeçalho tipográfico (nenhuma imagem nova). Cantos quadrados pelos tokens existentes | `src/components/mercado/*` (cartão, linha de identidade, tabela de vendedores) | 1,5 | engenheiro-frontend, designer-marca |
| 5 | **Exibição de preço sem selo e sem histórico**: "Menor preço agora", "N vendedores", "verificado há X", "mediana dos N anúncios do Mercado Livre hoje" **só com 3 ou mais vendedores distintos**, rótulo explícito "apenas Mercado Livre". Sem "% abaixo", sem selo, sem "de/por", sem gráfico e sem "menor preço desde" (14 dias e os termos do ML sobre exibir histórico não foram atendidos nem lidos) | no cartão e na página do item 4 | (incluído) | especialista-precos |
| 6 | **`/go` aceita departamento liberado**: a allow-list passa de `vertical = games` para `games` OU departamento com flag ligada, **e** continua exigindo oferta ativa, não quarentenada, URL http(s) válida; **bloqueia link pendente** (rótulo "em ativação", sem redirecionar sem rastreio) também para games | `src/app/go/[slug]/route.ts` (editar, único arquivo existente de runtime tocado) | 1 | engenheiro-backend |
| 7 | **Menu**: um único item "Departamentos" (nome provisório; decisão do dono) que **só existe se houver departamento aberto**, listando só os abertos; o menu games não muda. Usa o registro do item 1. Atrás da mesma flag, para reverter junto | edição mínima de `app-header.tsx`, `mobile-nav-drawer.tsx`, `site-footer.tsx` | 0,5 | engenheiro-frontend |
| 8 | **Aviso de comissão e frase de saída** junto ao botão (mesmo componente de A1), "link em ativação" nas pendentes | `commission-notice.tsx` (existente, reuso) | (A1) | engenheiro-frontend |
| 9 | **Testes**: isolamento nos dois sentidos (games não vê departamento, departamento não vê games), snapshot do SQL das consultas novas exigindo `vertical` e `verdict='approved'`, HTML de games idêntico antes e depois, `affiliate_link_pending` nunca clicável, 404 com flag desligada | `scripts/test-departamentos.ts`, extensão de `test-vertical-isolation.ts` | 1,5 | qa-verificador |

Fica deliberadamente fora (para não tocar games): `price-table-board`, `offer-filters`, `results-grid`, `search-results-view`, `OfferCard`, `sitemap.ts`, `/api/produtos`, flags V2/CARD. A busca do cabeçalho segue só games.

### E.2 Masters hoje em `review`: quais podem ser aprovados e quais ficam
Aprovar = gravar `catalogGate.verdict='approved'` com `approvedBy`, `approvedAt`, `criteriaVersion` e o valor anterior guardado; feito por `apply-aprovar-vertical.ts` (dry-run por padrão, backup NDJSON em `backup/dados/`, log em `backup/logs/`), em lote pequeno por departamento. **Critérios (todos precisam valer):**
1. O porteiro do departamento sugere `approved` (evidência positiva: livro = ISBN-13 brasileiro 978-65/978-85 com dígito verificador; tecnologia e eletroeletrônico = GTIN GS1 válido ou MPN+marca; marca+modelo só vale com o atributo que separa a variante: voltagem, polegada, capacidade).
2. Produto novo (sem usado, Open Box, recondicionado, reembalado, importado).
3. Pelo menos **1 oferta clicável**: ativa, não quarentenada, link não pendente, checada há menos de 6 h.
4. Preço coerente: máximo/mínimo ≤ 2,5 entre as ofertas clicáveis e quarentena abaixo de 30% das ativas (sinal de edição ou item misturado).
5. Nome específico e legível (marca e modelo ou título completo), sem nome genérico ou duplicado; **conferência humana de 100% do lote** (são cerca de 30 itens; guardiao-catalogo prepara a lista com título, foto, ISBN/GTIN e faixa de preço, o dono confirma).
6. Sem duplicata (mesmo GTIN/ISBN/chave, `findExistingMasterProduct`); foto presente.

**Resultado provisório pelos dados medidos** (recalcular na hora de aplicar, os preços se movem):

| Departamento | Masters | Aprovar (proposta) | Ficam em revisão e motivo |
|---|---|---|---|
| Tecnologia | 17 | **10**: SSD Kingston NV3 1 TB, Zotac RTX 5060 Twin Edge, Epson EcoTank L3250, Bambu Lab P1S Combo, Bambu Lab A1 Combo, Bambu Lab A1, Kingston NV2 250 GB, SSD Asgard AN4 1 TB, SSD Kingspec 1 TB, Kingston NV2 500 GB | **7**, todos sem nenhuma oferta clicável (só link pendente): Epson L4360, HP Smart Tank 581, Radeon RX 580 Red Devil, Palit RTX 3060 Dual, Radeon RX 7600, Galax RTX 5060, Zotac RTX 5060 (variante). Voltam quando o dono fornecer os links das pendentes |
| Eletroeletrônicos | 5 válidos (+1 rejeitado) | **3**: JBL Bar 500, Samsung B450, LG Nano77SRA | **2**: JBL Cinema SB595 (preço de R$ 1.565 a R$ 4.999, amplitude 3,2x) e "Smart TV LG 4k" (nome genérico sem modelo, identidade fraca). A LG 75UR8750 segue `rejected` |
| Livros | 24 | **18** | **6**: "Ficção científica capitalista" (R$ 52 a 163, 3,1x), "Relações Perigosas" (R$ 12 a 80, 6,7x), "Livro Aberto" (8 de 14 ofertas em quarentena e título defeituoso), "Manga" (nome genérico), "Box Trinca Literária" (box separa de livro avulso, 2,6x), "Livro Tarô..." (40% em quarentena, fora do recorte) |
| Eletrodomésticos | 5 | **0 a 1** (o único com GTIN e voltagem explícita no nome, "Mondial AFO-25L 127V", se a conferência confirmar) | **4 a 5**: voltagem não consta no nome nem na chave (voltagem separa produto), identidade só por marca+modelo |
| Esporte | 0 | **0** | Sem master nem oferta. Não existe o que publicar; a rota fica 404 e nada é preenchido |

Total proposto: **31 a 32 aprovados de 52**; 19 a 20 em revisão; 1 rejeitado. Os números estão em dados do banco de 10/11 (script apagado); a lista nominal final sai do dry-run.

**Limites de honestidade:** só Mercado Livre (1 rede), então "mediana" significa mediana de vendedores do ML e é rotulada assim; histórico de 3 dias (desde 08/11), por isso sem selo, gráfico ou "menor preço desde". Departamento só entra no menu com 3 ou mais masters elegíveis hoje: **tecnologia, livros e eletroeletrônicos (exatos 3) abririam; eletrodomésticos e esporte ficam 404 até haver base.**

### E.3 O que o qa-verificador exige antes de abrir ao público (gate de abertura; qualquer falha bloqueia)
1. `tsc --noEmit` exit 0; `next build` completo; todos os `test:*` existentes verdes (incluindo `test:vertical`, `test-plausibilidade` com `--conditions=react-server`) mais `scripts/test-departamentos.ts`.
2. **Games intocado:** contagens de masters e ofertas visíveis, médias e menor preço de 20 masters amostrados e contagem do sitemap **idênticos** antes e depois (diferença zero); HTML de `/`, `/ofertas`, `/pesquisa`, `/tabela-de-precos` e uma oferta igual ao baseline salvo antes da mudança.
3. **Isolamento nos dois sentidos** no HTML publicado e nas APIs: nenhum slug ou título de departamento em superfície games e nenhum de games em `/mercado/*`; `/api/produtos/*` e a busca do cabeçalho continuam só games.
4. **Regras:** 0 "afiliad" no HTML e nos textos novos; 0 arquivo novo em `public/images` e 0 imagem repetida; cantos quadrados (computed style no navegador); nenhum número sem origem no banco; nenhum selo, "% abaixo", "de/por" ou gráfico nos departamentos; "apenas Mercado Livre" visível; "verificado há X" em 100% dos cards.
5. **Receita:** 0 oferta pendente ou quarentenada clicável; teste de redirecionamento do `/go` por departamento (oferta válida redireciona com o parâmetro de rastreio, pendente não); evento `affiliate_click` gravado com a vertical.
6. **Aprovação:** dry-run revisado, backup NDJSON e log gerados, lista nominal conferida pelo dono, `criteriaVersion` gravado; contagem aprovada = contagem exibida.
7. **Reversão ensaiada** (E.4) em preview antes do dia de abrir, com o HTML voltando ao baseline.
8. **Navegador** (depois, quando o Chrome for liberado): 390 px e 1440 px, tema claro e escuro, foco por teclado, estado vazio, 404 do departamento fechado.
9. Abertura **faseada**: primeiro só com acesso do dono (regra de `feature_flags.rules` ou preview) por 24 h, depois público e `noindex`; sitemap e SEO só depois de 27/11.

### E.4 Como reverter em um passo
- **Passo único e imediato (sem deploy):** `UPDATE feature_flags SET enabled=false WHERE key LIKE 'dept_%'`. Em até 60 s (cache) as rotas `/mercado/*` voltam a 404, o item "Departamentos" some do menu, `/go` deixa de aceitar departamento e as mensagens automáticas deixam de ter link válido. Games não é afetado porque nunca foi editado.
- **Se for preciso desligar também a aprovação:** `apply-aprovar-vertical.ts --rollback <log>` restaura o `catalogGate` anterior (os 52 voltam a `review`) a partir do backup NDJSON; é inerte se a flag está desligada (superfícies de games filtram `vertical='games'`).
- **Trava mestra:** remover `MERCADO_UI` e redeploy, ou Instant Rollback da Vercel para o deployment anterior. Os dados coletados (snapshots) nunca são apagados.
- Ensaio obrigatório antes de abrir (item 7 do E.3).

### E.5 Efeito na Onda A e no calendário
- **Custo novo:** 6 a 8 dias de trabalho somados aos cerca de 25 da Onda A. Não cabe tudo. Corte decidido pelo presidente: **saem da A os "desejável"** (constante única de navegação, filtro de plataforma, selo de edição/região, ensaio de cache de borda, otimizações de imagem sem custo) e passam para a B apenas se forem correção, ou para a C. **O núcleo da A permanece**, e os itens E.1 #6 (`/go`) e A1 (botão com frase e aviso) são compartilhados com o núcleo.
- **Calendário (proposta):** 11 a 13/11 código (E.1) e testes; 13/11 dry-run de aprovação e lista nominal ao dono; 14/11 QA completo e ensaio de reversão em preview; 15/11 aprovação em produção (com backup) e abertura **só para o dono**; 16 a 17/11 abertura pública e `noindex` de tecnologia, livros e eletroeletrônicos, com go/no-go em 17/11; 20/11 congelamento. Abrir antes de 14/11 significaria pular o gate E.3, e por isso o conselho **não recomenda** publicar em menos de 4 dias úteis.
- Congelamento: depois de 20/11 só entra correção; um departamento novo (ex.: eletrodomésticos quando houver base) só abre com a mesma lista de gates e nunca de 20 a 27/11.

### E.6 Mensagens automáticas para grupos (dependências desta emenda; desenho fica para ata própria)
- Só podem usar **masters aprovados e ofertas clicáveis e frescas**, sempre com o link do `/go` (rastreado) e o aviso curto de comissão, sem a palavra "afiliado"; texto factual: "menor preço agora", loja, valor, "verificado há X"; sem "de/por", sem % de desconto e sem cupom sem origem no banco. A mensagem para de sair quando o departamento é desligado pela flag (mesma chave).
- Risco a decidir antes: automação em grupos do WhatsApp fora da API oficial pode levar a bloqueio do número; Telegram já tem integração (integrador-apis). Quais canais e a revisão dos termos de cada plataforma ficam para a ata de mensagens.
- O volume de mensagens nos nichos está limitado pelo que é clicável: hoje 62 das 106 ofertas de tecnologia estão pendentes; sem os links das pendentes, o que se vende de tecnologia se resume a poucos masters.

### E.7 Riscos desta emenda
1. Contrato: os termos do ML sobre armazenar e exibir histórico de preço não foram lidos; por isso os departamentos não exibem histórico (só preço atual e carimbo de tempo).
2. Vitrine rala: eletroeletrônicos abre com 3 masters; parece vazio. Mitigação: só abre com 3 ou mais; honestidade em vez de enchimento.
3. Marca: gamer-veterano é contra esporte e eletrodoméstico no público; nesta semana nenhum dos dois abre (sem dado), o que adia a divergência. Nome do menu "Departamentos" é neutro e provisório.
4. Editar `/go` (caminho de receita) pode quebrar o rastreio: teste de redirecionamento por departamento e comparação do evento `affiliate_click` antes e depois.
5. Aprovar muda elegibilidade: os 31 masters entram nos jobs oferta-dia e nos snapshots de vitrine; checar que nenhum job agregue cross-vertical ([H] a verificar no QA, E.3 item 2).
6. Cache de borda e `private, no-store` das páginas novas: sem mudança de cache nesta semana; as páginas são dinâmicas e leves (24 cards).
7. Congelamento: esta emenda empurra construção para 11 a 14/11; qualquer atraso passa a data de abertura, nunca o gate de QA.

## O que fica de fora
- (Revisado pela emenda) Departamentos no sitemap e na busca global, selo, gráfico, "menor preço desde", média misturada, eletrodomésticos e esporte enquanto não houver base (1 e 0 masters), `noindex` retirado antes de 27/11. Tecnologia, livros e eletroeletrônicos podem abrir ao público sob a emenda acima.
- Selo de desconto, veredito e "de/por" do marketplace; qualquer percentual sem 14 dias e 3 ofertas; previsão ou modelo de ML.
- Imagens novas na Onda A (a página BF é tipográfica); reaproveitar as 20 imagens órfãs em nichos.
- Amazon na campanha, na média ou no alerta; AliExpress, Magalu; cupom ou contagem de lojas sem origem.
- Alerta de preço, `cacheComponents`, migração para PPR, refatoração das 55 queries, troca do proxy de sessão, novos gráficos.

## Riscos de regressão
1. Mexer em home, menu e oferta sem testes de componente: a rede de proteção é revisão humana e os scripts novos. Mitigação: item 8 do núcleo antes de qualquer outro.
2. Cache de borda servindo preço velho ou sessão de outro usuário. Mitigação: TTL de 60 s, só em páginas anônimas, ensaio em preview, reversão por cabeçalho.
3. Paginar `/ofertas` altera contagens percebidas e links. Mitigação: chips de contagem independentes do limite, sitemap e `?page` conferidos.
4. Botão e `/go`: erro quebra o rastreio e a comissão. Mitigação: teste de redirecionamento por rede, evento `affiliate_click` conferido antes e depois.
5. Ligar V2/CARD junto com as mudanças de front impede achar a causa de regressão. Mitigação: ligar só em 18 a 20/11, depois do baseline do front, com reversão ensaiada.
6. Vazamento de vertical: SQL cru fora dos helpers e "ausência de veredito vale aprovado". Mitigação: teste de isolamento no HTML e allow-list de veredito antes de qualquer flag pública.
7. Conexões no pico (aquecimento + crons + coleta). Mitigação: teto de conexões < 40 de 60 no ensaio.
8. Imagem repetida ou "afiliad" reintroduzidos. Mitigação: `test-imagens-unicas` e `test-html-publico` em todo PR.

## Como o qa-verificador valida cada onda
| Etapa | Onda A (cada entrega e antes do deploy) | Onda B (congelada) | Onda C |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` exit 0 a cada PR | idem, em cada correção | idem |
| Testes | `test:vertical`, `test:parecer`, `test:gate`, `test:dimensions`, `test-plausibilidade` (com `--conditions=react-server`) e os scripts novos (`test-html-publico`, `test-imagens-unicas`, isolamento no HTML) | os mesmos, mais `diff` de HTML contra o baseline de 20/11 | idem + CI e Playwright |
| Build | `next build` completo local ou em preview (hoje não rodado; falha local conhecida no `next/font` do Google a investigar) | build do preview por correção | build em CI |
| Navegador | **Depois**, quando o dono liberar o Chrome (abas de coleta fora de risco): foco, labels, cantos computados (`border-radius: 0`), 390 px e 1440 px, tema claro e escuro, estado vazio; o QA não usa o Chrome sem liberação | smoke de 6 rotas em preview e produção | axe e e2e |
| Dado | Contagens games antes e depois idênticas; 0 vertical `<>` games no HTML; nenhum número da BF sem origem no banco (SQL de conferência por amostra) | vigília diária | por departamento |
| Flags | Ensaio de reversão de `PRICE_METRICS_V2`/`PRODUCT_CARD_V1` em preview: ON e OFF, HTML comparado com o baseline | proibido ligar novas | por decisão do dono |
| Checklist-publicacao | Carregar a skill e preencher por entrega | por correção | por entrega |

Vetos do QA (qualquer um bloqueia): "afiliad" visível; imagem repetida; vertical diferente de games em superfície games; preço Amazon sem data e hora; Amazon, AliExpress ou Magalu na campanha BF; número ou cupom sem origem; flag ligada sem reversão ensaiada; `cacheComponents` ligado; mudança de layout entre 20 e 27/11.

## Decisões que cabem ao dono (uma por vez, com recomendação)
1. **Aviso de comissão junto ao botão** (reapresentação da decisão 2 de 10/11). Recomendação: aprovar o texto curto, por Amazon, CONAR e CDC.
2. **Limite de "desatualizado" (24 h?) e o que o cartão faz depois dele (rebaixar e tirar selo).** Recomendação: 24 h, rebaixar e sem selo.
3. **Black Friday: página própria `/black-friday` mais faixa na home.** Recomendação: sim, tipográfica, sem imagem nova.
4. **Amazon visível no site como "consulta de referência", ou oculta durante a BF.** Recomendação: fora da campanha e das médias; se visível, só preço com data e hora.
5. **Cota de transformação de imagem da Vercel**: conferir antes de ligar `next/image` otimizado. Recomendação: conferir; sem a cota, manter `unoptimized`.
6. **`/ranking`: esconder do menu ou rotular "em construção".** Recomendação: tirar do menu.
7. **(Atualizada pela emenda)** Autorizar, em etapas e com backup, log e reversão: (a) aprovar os ~31 masters da lista nominal; (b) inserir as flags `dept_*` desligadas; (c) abrir tecnologia, livros e eletroeletrônicos só ao dono em 15/11 e ao público (`noindex`) em 16 a 17/11, com go/no-go em 17/11. Recomendação: sim, sem abrir antes de 14/11. Nome do item de menu ("Departamentos" ou outro) e do grupo. Eletrodomésticos e esporte ficam fechados até haver base.
7b. **Fornecer os links das ofertas pendentes** (tecnologia 62 de 106, prioridade placas de vídeo e impressoras): sem eles, 7 masters de tecnologia não podem ser aprovados e a maioria das ofertas não gera comissão. Recomendação: sim, tecnologia primeiro.
7c. **Canais das mensagens automáticas** (Telegram, WhatsApp) e revisão dos termos: ata própria depois desta.
8. **Liberar o Chrome para o QA depois que as coletas pararem de depender das abas**, ou autorizar um preview isolado.
9. **Ligar V2 e CARD por volta de 20/11 só como fatos** (já na ata de 10/11, decisão 5); aqui acrescenta-se: ligar numa só virada, com a tabela alternativa do V2 pronta.
- Decisão do responsável do projeto: **pendente**

## Métrica de sucesso
Até 20/11: núcleo da Onda A em produção; 0 "afiliad" no HTML público; 0 imagem repetida; 0 vertical diferente de games em superfície games; `/ofertas` ≤ 200 KB de HTML; leitura fria < 5 s; redirecionamento do `/go` p95 < 500 ms; 100% das ofertas com carimbo de tempo. Até 27/11: 0 regressão na onda B, página BF com 0 número sem origem e 100% das ofertas ML e Shopee com oferta fresca (< 6 h). Linha de base de funil (cliques `/go` por rede, por visita) medida por SQL desde 11/11 para comparar antes e depois. Conferir em 17/11, 20/11 e 27/11.

## Execução e verificação
- Executores previstos: engenheiro-frontend, engenheiro-backend, engenheiro-performance-web, designer-marca, guardiao-catalogo, cientista-precos, bi-dataviz, arquiteto-next, dba-postgres; qa-verificador com poder de bloquear o "concluído".
- QA desta etapa: somente leitura. Medições: `curl` (TTFB e tamanho, 2 amostras por rota), `grep` de imagens e do termo "afiliad", leitura de `next.config.ts`, `entrar/page.tsx` e `sobre/page.tsx`. **Não verificados:** navegador (foco, labels, cantos computados, mobile, tema claro), `next build`, `typecheck` desta sessão, varredura completa dos 64 links, página de oferta individual no HTML, valor real das flags na Vercel, cota de imagem da Vercel, Web Vitals de campo, funil e abandono do clique extra do ML, causa exata do `no-store` (`force-dynamic` ou proxy). Nenhum dado fake foi criado.

## Retrospectiva
Preencher em 17/11, 20/11 e após a Black Friday.
