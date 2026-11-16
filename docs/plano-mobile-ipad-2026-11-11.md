# Plano: responsividade mobile e iPad, e caminho do aplicativo

- **Data:** 2026-11-11. Black Friday: 2026-11-27 (16 dias). Congelamento de regras, coleta e esquema: 2026-11-20 (9 dias).
- **Origem:** reunião do Conselho Geek, ata `docs/conselho/atas/2026-11-11-responsividade-mobile-ipad-e-app.md` (porte grande, 8 pareceres independentes).
- **Natureza:** auditoria POR CÓDIGO. Nenhum navegador foi aberto, nada foi alterado no código, no banco ou na Vercel.
- **Convenção:** **[D]** medido, **[C]** visto no código nesta sessão, **[H]** hipótese a validar, **[V]** verificar em fonte oficial ou com navegador. Gravidade: **Alta** quebra a jornada ou a conversão; **Média** degrada a experiência; **Baixa** polimento.
- **Regras que valem para tudo aqui:** cantos quadrados; uma imagem, um lugar (ícones de app contam); zero dado fake; nunca a palavra "afiliado" ao cliente; refatoração só de CSS e marcação (não toca `src/lib/pricing/*`, queries de média, coleta nem esquema).

## 1. Resumo executivo
1. O problema é de sistema, não de uma tela: não existe padrão de breakpoints, os títulos são de tamanho fixo, os campos têm 14-15 px, os alvos de toque têm 32-36 px, e `overflow-x: hidden` em três camadas esconde os estouros em vez de revelá-los.
2. Os três defeitos que mais derrubam a jornada: (a) página do produto sem botão de compra fixo e em uma coluna até 1024 px; (b) header de cerca de 100 px no celular com tarja que quebra em duas linhas; (c) menu do iPad paisagem que abre e fecha no toque e menu do usuário só por hover.
3. Hipótese forte a verificar primeiro com navegador: `overflow-x: hidden` em `html`, `body` e no `AppShell` pode desativar `position: sticky` (header e coluna do produto), porque vira contêiner de rolagem.
4. O acordo do conselho sobre aplicativo: **PWA primeiro** (manifest e ícones antes de 20/11), **Web Push a partir de 28/11**, **Capacitor só em janeiro e só com dados**, **Expo/nativo descartado por ora**. Alerta de preço por push é o único diferencial real de um app; o canal Telegram é o "push" da Black Friday.
5. Esforço: cerca de 15 a 17 dias-agente em duas trilhas (front e performance), 9 de calendário se paralelas. Cabe parcialmente até 20/11 (P0) e termina até 24/11 (P1), se o congelamento não valer para CSS e marcação (pergunta 2).

## 2. Padrão único de breakpoints e componentes

### 2.1 Breakpoints (nomes e larguras)
Hoje [C]: 290 usos de `lg:`, 266 de `sm:`, 133 de `md:`, 7 de `xl:`; `globals.css` não declara breakpoints. Proposta: declarar no `@theme` e documentar em ADR (0010 após aprovação). Mobile first, um único vocabulário.

| Nome | Largura mínima | Alvo verificado | Layout |
|---|---|---|---|
| base | 0 | 360 e 390 (celular) | 1 coluna, barra inferior, header de 1 linha, CTA fixo |
| `sm` | 640 | celular grande e paisagem | 2 colunas só em grades de cartão; sem mudar a navegação |
| `md` | 768 | iPad retrato | 2 a 3 colunas; página do produto em 2 colunas; tabela de preços ainda em cartões |
| `lg` | 1024 | iPad paisagem e notebook pequeno | navegação desktop SÓ com `hover-supported`; barra inferior some; tabelas |
| `xl` | 1280 | desktop | container `max-w-7xl` |

Regras de uso:
- Nenhum componente novo usa largura de tela fora desses cinco; larguras arbitrárias (`min-[...]`) só com comentário.
- Cartões e blocos de gráfico usam `@container` (Tailwind 4) para se adaptar ao espaço onde estão (prateleira, busca, sidebar) em vez de depender da tela.
- Variante `pointer-coarse` (`@media (pointer: coarse)`) para alvo de 44 px; `hover-supported` (já existe em `globals.css:16`) para qualquer efeito de hover.
- `viewport` estático em `layout.tsx` (já correto: `viewportFit: 'cover'`, `maximumScale: 5`; manter o zoom liberado por acessibilidade); acrescentar `colorScheme` e `interactiveWidget: 'resizes-content'` conforme `generate-viewport.md`.
- `dvh`/`svh` para alturas de camada; nunca `100vh` nem `max-w-[100vw]` (inclui a barra de rolagem).

### 2.2 Componentes base a criar ou ajustar
| # | Componente | Hoje [C] | Alvo |
|---|---|---|---|
| 1 | Sheet/Dialog único | `ui/dialog.tsx:39` centralizado sem `max-h`, sem rolagem interna, `p-6`; `header-search-modal.tsx:109` `fixed` com `pt-16` sem `dvh`; drawer próprio em `mobile-nav-drawer.tsx:77`; `ui/drawer.tsx` e `ui/camada-sobreposta.tsx` (este último já é tela cheia com `dvh`, ADR 0007) | Um só Sheet: tela cheia no celular, bottom sheet com `max-h-[85dvh]` e `overflow-y-auto`, caixa centralizada a partir de `md`; `pb-safe`; foco preso; reaproveitar a base da camada do cartão |
| 2 | Button / Select / Chip | `button.tsx:56,61` (36 px); `select.tsx:41` (xs, 32 px); chips `py-1 text-xs` em `header-search-modal.tsx:144-172` | Alvo mínimo de 44 px em `pointer-coarse` (a área clicável pode ser maior que o visual, com padding invisível) |
| 3 | Input / Select / Textarea | `input.tsx:20-21` (14 e 15 px), `select.tsx:42-43`, `header-search-modal.tsx:127` (`text-sm`), `offer-filters.tsx:114,128,143,158` (13 px) | 16 px na base e `md:text-sm` onde precisar; elimina o zoom do iOS ao focar |
| 4 | ResponsiveTable | tabelas com `overflow-x-auto` em 8 arquivos; cartões só em `price-table-board.tsx:220` e admin abaixo de `lg` | Componente que vira lista de cartões abaixo de `lg` (ou `md` conforme a tabela) com a coluna principal sempre visível |
| 5 | Text fluido | `globals.css` ~45-70: display-2xl 76, xl 60, lg 44, md 36 px fixos; home sobrescreve só um título (`page.tsx:462`) | `clamp()` nos tokens: sugestão do designer `display-xl: clamp(2rem, 7vw + 0.5rem, 3.75rem)`, `display-lg: clamp(1.75rem, 5vw + 0.5rem, 2.75rem)`, line-height 1,05 a 1,1; piso de 12 px para texto informativo, 11 px só para rótulo mono curto |
| 6 | Cabeçalho | `app-header.tsx:198-211` tarja + barra; hex fixos (`#0C0A08`, `#E0A83B`, `#F3EFE6`) em 20+ ocorrências; `top-utility-bar.tsx:18-19` | Uma linha de até 56 px no celular; tokens no lugar de hex (corrige tema claro); tarja e barra utilitária somem do celular |
| 7 | CTA fixo de produto | `(detalhe)/ofertas/[slug]/page.tsx:393-398` botão no fim da coluna | Barra fixa acima da barra inferior: "Ir à loja · R$ X (menor agora, loja, hora)" |

## 3. Achados da auditoria por código, agrupados por breakpoint

Legenda de IDs: **T** transversal (vale em todos os tamanhos), **A** 360 e 390, **B** 768 (iPad retrato), **C** 1024 (iPad paisagem).

### 3.1 Transversais (todos os breakpoints)
| ID | Grav. | Achado [C] | Onde | Correção sugerida |
|---|---|---|---|---|
| T1 | Alta | `overflow-x: hidden` em `html`, `body` e `AppShell` (e `max-w-[100vw]`): esconde estouro horizontal em vez de corrigir. [H] Cria contêiner de rolagem que desliga `position: sticky` do header e da coluna do produto. [V] confirmar em navegador | `globals.css:289-306`, `app-shell.tsx:43,66` | Trocar por `overflow-x: clip` (suporte moderno); remover `max-w-[100vw]`; no teste, desligar o clip para revelar os estouros reais e corrigir a causa |
| T2 | Alta | Campos abaixo de 16 px: iOS Safari dá zoom ao focar | `ui/input.tsx:20-21`, `ui/select.tsx:42-43`, `header-search-modal.tsx:127`, `offer-filters.tsx:114,128,143,158` | 16 px na base (componente 3) |
| T3 | Alta | Alvos de toque de 32-36 px no header, filtros, chips e gráfico | `button.tsx:56,61`; `select.tsx:41`; `app-header.tsx:102,126` (`h-9`); `header-search-modal.tsx:144-172`; `price-chart-v2.tsx:111` (`min-h-8` fora do modo neutro) | Variante `pointer-coarse` e `min-h-11` (componente 2) |
| T4 | Média | Texto pequeno: 170 usos de `text-[9\|10\|11px]` (maiores: `geek-deals/curation-panel.tsx` 23, `(shop)/noticias/page.tsx` 12, `(shop)/hype-zone/page.tsx` 12, `geek-deals/live-bid-room.tsx` 9, `admin/usuarios/page.tsx` 9) e 231 de `text-xs` (12 px); SVG do gráfico em 11 px; rótulo da barra inferior 12 px | `price-chart-v2.tsx:323-415`, `bottom-tab-bar.tsx:66` | Piso de 12 px para informação; 13 px no gráfico; admin pode manter 12 |
| T5 | Média | Tipografia de título fixa em 44-76 px | `globals.css` ~45-70; `(shop)/page.tsx:263,285,521,588,655,763,855,900`; `sobre/page.tsx:86` | `clamp()` nos tokens (componente 5) |
| T6 | Alta | Modal/dialog sem limite de altura nem rolagem interna: some o botão de fechar com teclado ou em paisagem | `ui/dialog.tsx:39`, `header-search-modal.tsx:109,179` | Sheet único (componente 1) |
| T7 | Alta | Imagens sem otimização: `unoptimized: true`, `remotePatterns` com `**`, `<img>` cru para fotos de marketplace, só 12 de 41 `<Image>` com `sizes`; 75 arquivos >1 MB em `public/` (PNG de 3 a 3,8 MB em home e `/sobre`: `noticias/header-collage.png`, `universos/star-wars.png`, `categorias/geek-collage.png`, `home/divider-emblem.png`, `hero/tile-back.png`, `sobre/pilha-controles.png`, `sobre/arcade-anos-90-noite.png` etc.) [D] | `next.config.ts:5-11`, `ui/product-image.tsx:~72` | Lote 5 (secção 4); não ligar o otimizador sem confirmar cota (risco de custo e de proxy aberto) |
| T8 | Média | Hex fixo no header quebra o tema claro | `app-header.tsx` (várias linhas, ex.: 102-106, 126-129, 152, 199-211) | Tokens `--color-*` |
| T9 | Média | `backdrop-blur-xl` em barras fixas (header e barra inferior) e animações permanentes: custo de GPU em Android fraco [H] | `app-header.tsx:200`, `bottom-tab-bar.tsx:30`, `news-ticker.tsx:78`, `NeuralWatermarkBackground` | Fundo opaco no celular; pausar ticker fora da viewport; marca d'água só em `lg` |
| T10 | Média | Efeitos só por hover, sem equivalente por toque: setas do carrossel de mídia (`opacity-0 group-hover`), "Ver oferta" no cartão feature, seta no preço do monitoramento | `hype-media-carousel.tsx:54,61`, `offer-card.tsx:174`, `monitoring-board.tsx:137` | `hover-supported:` e visível por padrão no toque quando é função (setas); decorativos podem ficar |
| T11 | Média | Sem manifest, ícones nem tela de instalação [D] | `src/app` | PWA mínimo (secção 6) |

### 3.2 360 e 390 (celular)
| ID | Grav. | Achado [C] | Onde | Correção sugerida |
|---|---|---|---|---|
| A1 | Alta | Header sticky de cerca de 100 px: tarja `font-mono text-xs uppercase tracking-widest` com 47 caracteres (quebra em 2 linhas em 360 e 390) + barra de 56 px; a barra utilitária (28 px) ainda vem antes. Perde cerca de 12% da altura de um 390x844 e 16% de um 360x640 | `app-header.tsx:204-211`, `top-utility-bar.tsx:18-19`, `globals.css:195` (`--header-mobile: 56px`) | Header de 1 linha (menu, logo, busca); tarja e utilitária ocultas no celular; `--header-height` única usada pelos `top-*` sticky |
| A2 | Alta | Botão "Ir à loja" é o último item da coluna, depois de preço, cupom, aviso da Amazon e antes da tabela de lojas; não é fixo. O preço grande é o da oferta aberta; o menor entre as lojas aparece só em legenda (visitante vindo de Telegram/WhatsApp pode ver preço que não é o melhor) | `(detalhe)/ofertas/[slug]/page.tsx:237-245,393-398` | CTA fixo (componente 7); menor preço entre lojas junto ao botão com loja e hora. Sem alterar cálculo, só apresentação |
| A3 | Média | Busca só como ícone no header; a barra inferior (Início, Ofertas, Monitorar, Hype, Perfil) não tem busca; "Monitorar" e "Hype" são termos internos | `bottom-tab-bar.tsx:9-15`, `header-search-modal.tsx:100-110` | Campo/atalho de busca no header e/ou aba "Buscar" (pergunta 5) |
| A4 | Média | Home: bloco com `min-h-[460px]` consome mais de meia tela; vitrine de gráficos com `min-h-[360px]`; estatísticas em `grid-cols-3` sem breakpoint (3 colunas em 360 px); painel de curadoria com `grid-cols-3` | `(shop)/page.tsx:335,363`, `home/price-charts-showcase.tsx:66`, `geek-deals/curation-panel.tsx:269` | `min-h-[60svh]` com teto; empilhar 3 estatísticas em `sm`; primeiro cartão de oferta na primeira dobra de 390x844 |
| A5 | Média | `/ofertas` com 1.020 KB de HTML, 145 `<img>`, 1.458 links e sem paginação real [D, ata 10/11] | `(shop)/ofertas/page.tsx` | Paginar 24 a 48 cards (compartilhado com a Onda A e com performance); manter contagens dos chips |
| A6 | Média | Cartão: preço 20 px (`text-[20px]`), selo de desconto 12 px, rótulos de 12 px; botão de filtro e `Select` 13 px | `offer-card.tsx:82,95,109,126`, `offer-filters.tsx:114-158` | Preço 24 px; mínimo 12 px; o conteúdo imprescindível em 360 px é foto, título, plataforma/formato, preço, selo de menor preço e loja (gamer-veterano); histórico, outras lojas e frete atrás de um toque |
| A7 | Média | Gráfico: caixas fixas de 360 px; texto SVG de 11 px; botões `min-h-8` fora do modo neutro; `monitoring-board` com `overflow-hidden` pode cortar tooltip/legenda; leitura por toque já existe (`touch-action: pan-y`, `onPointerDown`) | `product-price-chart-section.tsx:68`, `price-history-chart.tsx:536`, `price-chart-v2.tsx:111,317,323-415,427`, `monitoring-board.tsx:112` | Altura fluida (`clamp`/aspect), texto 12-13 px, alvo 44 px, tirar `overflow-hidden` do grid ou prever o tooltip dentro; manter `ResizeObserver` (mínimo 280 px) |
| A8 | Média | `/sobre`: muitas imagens 16:7 e 21:9 em tela estreita e PNG de 3 MB | `(shop)/sobre/page.tsx:96,266,506,534` | Proporção `aspect-[4/3]` no celular e variantes WebP; sem repetir arquivo (regra de imagem única) |
| A9 | Baixa | Prateleira horizontal bem resolvida (`w-[72vw] max-w-[280px]`, snap, `scroll-px-4`); filtros com máscara de fade | `grouped-offer-shelf.tsx:91-99`, `offer-filters.tsx:112` | Manter como padrão |

### 3.3 768 (iPad retrato)
| ID | Grav. | Achado [C] | Onde | Correção sugerida |
|---|---|---|---|---|
| B1 | Alta | Página do produto só vira 2 colunas em `lg`: em 768 a foto ocupa a largura toda (quadrada, cerca de 700 px) antes do preço | `(detalhe)/ofertas/[slug]/page.tsx:197-198` e `ui/product-image.tsx:66` | `md:grid-cols-[minmax(0,320px)_1fr]` (já usado em `mercado/[vertical]/[slug]/page.tsx:32`); limitar altura da foto |
| B2 | Média | Header em 768: hambúrguer + barra inferior ainda ativos (`lg:hidden`), ícone de usuário visível (`sm:block`) mas seu menu só abre por hover | `app-header.tsx:240-277` | Menu do usuário por toque (Radix DropdownMenu ou Sheet) |
| B3 | Média | Home e blocos institucionais ficam em 1 coluna até `lg` (grids `lg:grid-cols-*`), com texto e imagem empilhados em uma tela larga | `(shop)/page.tsx:168,254,515,641,894`, `sobre/page.tsx:135,242,287` | Duas colunas em `md` onde texto + imagem couberem |
| B4 | Média | Grade de resultados: 2 colunas até `xl` (1280); no iPad há espaço para 3 | `search/results-grid.tsx:54`, `search-results-view.tsx:193` | `md:grid-cols-3` quando não houver sidebar de filtros |
| B5 | Média | Tabela de preços aparece em `md` com muitas colunas dentro de `overflow-x-auto` | `price-table-board.tsx:297-319` | Manter cartões até `lg` ou reduzir colunas em `md` (confirmar nº de colunas com navegador) |
| B6 | Baixa | Admin vira cartões abaixo de `lg`: em 768 funciona; tabelas de `usuarios` e `colecionadores` têm rolagem horizontal própria | `admin/usuarios/page.tsx:107`, `admin/colecionadores/page.tsx:129` | Aceitável; prioridade P1 |

### 3.4 1024 (iPad paisagem)
| ID | Grav. | Achado [C] | Onde | Correção sugerida |
|---|---|---|---|---|
| C1 | Alta | Menu desktop abre em `onMouseEnter` e alterna em `onClick` no mesmo elemento: o toque dispara os dois e o menu abre e fecha | `app-header.tsx:114-123` | Hover só com `hover-supported`; toque alterna só no clique; fechar ao tocar fora (hoje só `mousedown`) |
| C2 | Alta | Em `lg` o menu lateral some e o menu do usuário só abre por hover (`group-hover/user`): "Sair", "Meus drops" e "Painel administrativo" sem caminho por toque. [V] checar se `/conta` oferece "Sair" | `app-header.tsx:277` | Mesmo conserto de B2 |
| C3 | Média | Coluna da foto `lg:sticky lg:top-24` (96 px) menor que o header (tarja 28 + barra 72 = cerca de 100 px); [H] com T1 pode nem grudar | `(detalhe)/ofertas/[slug]/page.tsx:198` | `top` derivado da variável de altura do header |
| C4 | Média | Admin: sidebar de 240 px + tabelas com muitas colunas em `lg` (cerca de 780 px úteis em 1024) | `admin/ofertas/page.tsx:161`, `admin/noticias/page.tsx:61`, `admin-shell.tsx:29-45` | Tabela só a partir de `xl`, ou colunas secundárias ocultas em `lg` |
| C5 | Baixa | Monitoramento com coluna lateral de 300 px (gráfico com cerca de 680 px): ok; `overflow-hidden` do grid pode cortar tooltip | `monitoring-board.tsx:112` | Ver A7 |

## 4. Ordem de correção por impacto, lotes e prazo

Ordem pedida pelo dono (home, busca, produto com gráfico, cartão, menu) reorganizada pelo impacto na conversão e pela dependência técnica: a fundação vem antes porque as telas herdam dela.

| Lote | Conteúdo | Itens | Dias | Executor | Janela |
|---|---|---|---|---|---|
| 0 | Rede de segurança: `scripts/test-responsivo.ts` (baseline) e `scripts/test-vetos.ts`; scripts de peso por rota | seção 5 | 0,5 | qa-verificador | 12/11 |
| 1 | Fundação: `overflow-x: clip` e sticky; breakpoints no `@theme`; tokens fluidos; campos 16 px; alvo 44 px; Sheet único | T1, T2, T3, T5, T6 | 1,5 | engenheiro-frontend, designer-marca (tokens) | até 13/11 |
| 2 | Header, menu e busca: 1 linha; menu por toque; menu do usuário; busca em primeiro plano; tokens no lugar de hex | A1, A3, B2, C1, C2, T8 | 1,5 | engenheiro-frontend | até 14/11 |
| 3 | Página do produto e gráfico: 2 colunas em `md`; CTA fixo com menor preço; gráfico fluido; sticky correto | A2, A7, B1, C3, C5 | 2,5 | engenheiro-frontend, bi-dataviz (revisão) | até 17/11 |
| 5a | Peso: script de variantes WebP dos assets próprios (originais ficam em backup, referências trocadas, `grep` de uso antes e depois); `sizes` e dimensões nas imagens; restringir `remotePatterns` | T7 (parte) | 1,5 | engenheiro-performance-web | em paralelo, até 17/11 |
| PWA | `app/manifest.ts`, ícones 192/512/maskable, apple-touch-icon, orientação de instalação; sem service worker | T11 | 1 a 1,5 | arquiteto-next, designer-marca (ícones) | até 18/11 |
| 4 | Home, busca, cartão e `/ofertas` paginada: preço 24 px; primeira dobra; 3 colunas no iPad; paginação | A4, A5, A6, B3, B4 | 3 | engenheiro-frontend + performance-web | até 20/11 (**P0 termina aqui**) |
| 5b | Blur opaco no celular, ticker e marca d'água condicionais; um só gráfico carregado por vez | T9 | 0,5 a 1 | engenheiro-performance-web | 21 a 22/11 (P1) |
| 6 | Admin, tabelas, `/sobre`, `/monitoramento`; efeitos de hover | A7 resto, A8, B5, B6, C4, T10 | 2 | engenheiro-frontend | 21 a 24/11 (P1) |
| 7 | Varredura de fontes abaixo de 12 px; encolher o baseline até o possível | T4 | 1 | engenheiro-frontend, qa-verificador | 24/11 |

Total: cerca de 15 a 17 dias-agente em duas trilhas; P0 (lotes 0 a 4 mais PWA mínimo e 5a) em 9 dias corridos exige as duas trilhas em paralelo. Última janela de deploy de interface proposta: **24/11**; nenhuma mudança de interface de 25 a 27/11 (pergunta 2).

Regra de execução de cada lote: (1) `test:responsivo` e `test:vetos` antes; (2) mudança; (3) `typecheck` e `build`; (4) contagem do baseline não pode subir; (5) `grep` de `src=` confirma que nenhuma imagem passou a ser usada em dois lugares; (6) nada em `src/lib/pricing/*`, queries de média, coleta ou esquema; (7) deploy só com autorização do dono.

## 5. Critérios de aceite mensuráveis

### 5.1 Por breakpoint (aplicam-se às rotas `/`, `/ofertas`, `/pesquisa`, `/ofertas/[slug]`, `/monitoramento`, `/tabela-de-precos`, `/sobre`, `/admin`)
| Critério | 360 | 390 | 768 | 1024 |
|---|---|---|---|---|
| Rolagem horizontal da página (`scrollWidth <= clientWidth`) | 0 | 0 | 0 | 0 |
| Alvo interativo com menos de 44x44 px (exceto link dentro de texto corrido) | 0 | 0 | 0 | 0 (em `pointer-coarse`) |
| Campo com fonte abaixo de 16 px | 0 | 0 | 0 | 0 |
| Texto informativo abaixo de 12 px | 0 | 0 | 0 | 0 (admin: 12) |
| Altura do header sticky | até 56 px, 1 linha | até 56 px | até 72 px | até 72 px |
| Primeiro cartão de oferta com preço na primeira dobra da home | sim (360x640: título e busca; cartão ao rolar 1 vez) | sim (390x844) | sim | sim |
| Produto: menor preço e botão de compra visíveis sem rolar | sim (CTA fixo) | sim | sim | sim |
| Menu e menu do usuário abrem por toque | sim | sim | sim | sim |
| Colunas da página do produto | 1 | 1 | 2 | 2 |
| Colunas da grade de resultados | 1 | 1 | 3 | 2 a 3 |

### 5.2 Desempenho e instalação (celular de gama média em 4G simulado)
| Rota | LCP p75 | INP p75 | CLS | Peso | `<img>` |
|---|---|---|---|---|---|
| Home | até 2,5 s | até 200 ms | até 0,1 | até 1,5 MB | até 40 |
| `/ofertas` | até 2,5 s | até 200 ms | até 0,1 | HTML até 200 KB; total até 1,5 MB | até 48 |
| Oferta | até 2,5 s | até 200 ms | até 0,1 | até 1,5 MB | até 40 |

Valores propostos pelo performance-web, são [H] até serem medidos. Demais: nenhum arquivo servido acima de 300 KB; contraste AA nos dois temas; Lighthouse de acessibilidade igual ou maior que 90; manifest válido e app instalável.

### 5.3 Negócio e regras
- Linha de base de cliques `/go` por visita mobile medida antes do primeiro deploy, comparada em 24/11 e 30/11. Sem meta numérica até haver base [H].
- Zero ocorrência da palavra "afiliado" em texto visível; zero imagem usada em mais de um lugar; zero alteração em `src/lib/pricing/*`.

## 6. Como o QA verifica

### 6.1 Agora, sem navegador
Entrega: `npm run test:responsivo` e `npm run test:vetos` (estilo `scripts/test-*.ts`, função `check()`, saída 1 em falha).

`scripts/test-responsivo.ts`, regras por expressão regular sobre `src/**/*.tsx`, cada uma imprime `arquivo:linha` e aceita `// responsivo-ok: motivo`:
| Regra | Falha quando |
|---|---|
| R1 | `text-[<12px]` em texto de conteúdo |
| R2 | elemento interativo (`button`, `a`, `role=button`) com `h-` ou `size-` menor que 11 sem `min-h-11` |
| R3 | `grid-cols-N` com N maior ou igual a 3 sem prefixo `sm:`, `md:` ou `lg:` |
| R4 | largura fixa `w-[>=360px]` sem `max-w-` |
| R5 | `<table` sem ancestral com `overflow-x-auto` nem versão em cartões |
| R6 | `input`, `select`, `textarea` com `text-xs` ou `text-sm` sem `text-base md:text-sm` |
| R7 | `<img>` ou `<Image fill>` sem `sizes`, sem largura/altura e sem `aspect` |
| R8 | `group-hover:opacity-100` sem equivalente de foco/toque |
| R9 | dialog ou drawer sem `max-h` em `dvh` e `overflow-y-auto` |
| R10 | cor `#hex` em `header*.tsx` em vez de token |

Baseline em `scripts/responsivo-baseline.json`, chaveado por arquivo + regra + contagem; só falha quando a contagem sobe ou aparece arquivo novo; `--update-baseline` só com autorização do QA. O baseline inicial será grande (já se sabe: 170 R1, `curation-panel` com 23); o objetivo é só impedir regressão e ver a contagem cair a cada lote.

`scripts/test-vetos.ts`, antes e depois de cada lote: imagem usada em mais de um `src` (varre `public/images/` e as referências); "afiliad" em texto JSX visível (separando nomes internos de código); `Math.random`, arrays de preço literais ou fallback numérico em componente de preço; alteração em `src/lib/pricing/*` ou queries de média.

Complementos estáticos (sem navegador): script `fetch` que lista, por rota em produção, bytes de HTML, nº de `<img>` e `Cache-Control` (somente GET em páginas públicas, sem tocar APIs de coleta); script que lista arquivos de `public/images` acima de 300 KB (meta zero); `renderToStaticMarkup` de header e cartão de oferta, conferindo presença de `md:`, `min-h-11` e ausência de hex, desde que `react-dom/server` rode sob `tsx` sem `--conditions=react-server` [V].

Limite explícito: o guarda estático impede piora, não prova que o layout está bom. O item 3 do `checklist-publicacao` (tela em desktop e mobile, tema claro e escuro) não é cumprível hoje e fica registrado como lacuna; deploy antes disso é risco assumido pelo dono.

### 6.2 Depois, com navegador (quando o dono liberar)
- Playwright (`@playwright/test`, `@axe-core/playwright`, `@lhci/cli` como dependências de desenvolvimento) com **Chromium próprio** (`npx playwright install chromium`), nunca o Chrome nem as abas do dono; contra `next start` após `build`, não contra `dev`.
- Quatro projetos: 360x740 e 390x844 (`isMobile`, `hasTouch`), 768x1024 e 1024x768 (iPad, `hasTouch`).
- `e2e/responsivo.spec.ts`, para cada uma das 8 rotas (32 combinações): `scrollWidth <= clientWidth` (com o `clip` desligado em ambiente de teste para revelar estouros); `boundingBox()` de 44x44 nos alvos; AxeBuilder sem violação serious ou critical; `toHaveScreenshot` por rota e viewport nos dois temas.
- Verificações dirigidas: header sticky de fato gruda (T1); menu abre por toque em 1024 (C1); CTA fixo não cobre a barra inferior; campo focado não dá zoom; teclado aberto no modal de busca mantém o botão de fechar visível.
- Lighthouse CI, perfil celular e 4G, 3 execuções, orçamento da seção 5.2; depois, RUM `web-vitals` gravado em `analytics_events` sem identificador, após revisão da política de privacidade.
- Pronto = `typecheck` + `build` + `test:responsivo` sem regressão + `test:vetos` verde + Playwright verde nas 32 combinações + registro no `checklist-publicacao`. `qa-verificador` e `seguranca-db` podem bloquear o "concluído" nas violações de regra inegociável.

## 7. Aplicativo de celular: debate e recomendação

### 7.1 Comparativo
| | PWA instalável | Capacitor (wrapper) | Nativo / Expo |
|---|---|---|---|
| O que é | O próprio site com manifest, ícones, SW e push web (`progressive-web-apps.md` do Next 16) | Casca nativa carregando o site (WebView) ou um build estático | Segundo app com UI própria |
| Reuso de código | 100% | Alto (WebView remota), mas SSR e cookies Supabase exigem origem remota | Baixo: duplica UI, auth, gráficos e camada de dados; dois deploys |
| Prazo [H] | Manifest 1 a 1,5 dia; SW + push + tabela + QA iOS cerca de 6 dias (4 + 2) | 8 a 10 dias mais revisão de loja (1 a 2 semanas, estimativa do estrategista) | Semanas |
| Custo | Zero de licença | Apple Developer 99 USD/ano e Google Play 25 USD (pagamento único) [V, de memória]; mais tempo de revisão | Idem Capacitor, mais manutenção de duas bases |
| Push de alerta | Web Push (VAPID). Android: ok. iOS 16.4 ou superior: só com o app instalado na tela inicial (doc do Next) | Push nativo: FCM/APNs, tokens por dispositivo, segundo canal de envio no backend | Idem Capacitor |
| Lojas | Não publica nas lojas (instala pelo navegador) | Publica | Publica |
| Dependência de afiliados | Links externos funcionam como no site (`/go/[slug]`) | Risco de política das lojas [V] | Idem |
| Risco principal | SW mal feito servir preço velho (linha vermelha); iOS exige instalação para push | Rejeição Apple por "site embrulhado" (guideline 4.2, funcionalidade mínima) [V]; cookie Supabase só na mesma origem | Estoura a capacidade antes da Black Friday |

Pontos que o conselho trouxe sobre lojas, todos [V] (nenhum texto oficial foi lido nesta sessão): a guideline 4.2 da Apple sobre funcionalidade mínima para apps que apenas encaminham a sites; as políticas de Apple e Google sobre divulgação de links de afiliado; a política de Google Play sobre apps que só redirecionam a sites. O aplicativo leva o usuário a links externos de marketplaces, então a política de afiliados e o texto de "comissão" precisam ser lidos nas fontes oficiais antes de qualquer investimento em loja. Os termos de Mercado Livre, Shopee e Amazon sobre alertas e histórico também não foram todos lidos (ata de 10/11); push de preço amplifica esse risco.

### 7.2 Onde o conselho concordou
- Responsividade vem primeiro e é independente de qualquer opção de app.
- Nenhum app de loja antes de 27/11: sem capacidade (Onda A consome o prazo) e sem dado que sustente a aposta.
- Quem retém é o alerta de preço, não o app em si; a loja de aplicativos é um canal de descoberta fraco para este nicho frente a SEO, Telegram e WhatsApp [H].
- O service worker nunca cacheia HTML de rota com preço, `/go`, `/api`, `/admin` nem dados de selo e gráfico; só estáticos com hash. Página offline, se houver, genérica e sem preço.
- Push com preço sempre leva loja, valor e horário da última coleta; plataforma, formato, edição e região corretos (alerta com plataforma errada derruba a confiança de uma vez); Open Box fora; cooldown (ADR 0002); silêncio de 23h às 8h; teto de 3 a 5 por dia em Black Friday [H]; resumo acima disso; só item da lista do próprio usuário fura o limite.
- Ícones do app são arquivos novos e únicos (por exemplo `public/app-icons/`), sem nenhum outro uso no código; não reaproveitar `geek 86.webp`.

### 7.3 Recomendação em fases
| Fase | Quando | Entrega | Critério para avançar |
|---|---|---|---|
| F0 Responsividade | até 20/11 (P0), 24/11 (P1) | Seções 2 a 5 | Critérios da seção 5 |
| F1 PWA mínimo | até 18/11 | `app/manifest.ts` (`theme_color` e `background_color` `#0B0908`, `display: standalone`, `start_url: '/'`), ícones 192, 512 e maskable em dourado sobre preto, apple-touch-icon, orientação de instalação no iOS ("Compartilhar" e "Adicionar à Tela de Início"). Excluir `manifest` do matcher do `proxy.ts` se necessário. Sem SW | Lighthouse "instalável" |
| F1b Instrumentação | até 20/11 | Rotular `affiliate_click` por origem (web, PWA instalado, Telegram, WhatsApp) e começar a medir cliques por visita mobile | Linha de base disponível |
| F2 Janela de Black Friday | 20 a 27/11 | Só correção. O canal Telegram (`t.me/egeek86`, envio aprovado em `/admin/mensagens`) é o "push" da BF | Nada novo de interface em 25 a 27/11 |
| F3 Web Push | a partir de 28/11 (4 dias + 2 de QA em iOS real) | `public/sw.js` só com `push` e `notificationclick` (sem cache de fetch), `Cache-Control: no-cache` e `Content-Type: text/javascript` em `/sw.js` via `headers()`; registro com `scope: '/'` e `updateViaCache: 'none'`; chaves VAPID em segredo; tabela `push_subscriptions` (`user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`, `last_ok_at`) com RLS e remoção em 404/410; preferências por canal; disparo a partir de `detectQualifyingWatches`; ADR; fora do matcher do `proxy.ts` | Opt-out abaixo de 5% [H]; entrega acima de 90% nos instalados; zero resposta com preço vinda de cache de SW |
| F4 Decisão sobre loja | janeiro de 2027 | Capacitor só se os dados de F1b e F3 mostrarem base mobile recorrente e a leitura das políticas Apple e Google [V] autorizar | Decisão do dono com dados |
| Fora do plano | | Expo/nativo; contas de desenvolvedor; app com UI própria | Reavaliar só se Capacitor for aprovado e falhar |

Observação sobre esquema: a tabela de assinaturas é mudança de esquema; por isso F3 fica depois do congelamento de 20/11. Se o dono quiser Web Push já na Black Friday, seria preciso migrar a tabela vazia antes de 20/11 e manter o envio desligado atrás de flag (não recomendado: sem QA em iOS real e sem usuários com alerta ativo medidos).

Experiência do app instalado (designer-marca): mesma identidade do site (paleta, tokens, imagens); linguagem de navegação própria (barra inferior com no máximo 5 posições, bottom sheets de cantos retos para filtros e detalhes). Atalhos do manifest candidatos (gamer-veterano): lista de desejos, "quedas de hoje", buscar. Ideias futuras, não escopo: escanear código de barras de jogo físico para comparar, compartilhar oferta com imagem pronta, alerta por plataforma.

## 8. Dados que faltam (pedir ou instrumentar)
1. Participação de celular e iPad nos acessos e nos cliques `/go`, por origem (Telegram, WhatsApp, busca) e por iOS x Android.
2. Prints do dono em iPhone e iPad das telas que ele vê erradas (valida a lista da seção 3 e a prioriza).
3. Cota de transformação de imagem da Vercel.
4. Web Vitals reais por rota; causa do `no-store` em todas as rotas.
5. Quantos usuários têm alerta (`watches`) ativo e quantos o abrem.
6. Se o dono tem Mac e iPhone para testar iOS e Web Push.
7. Textos oficiais das políticas Apple e Google sobre apps que encaminham a sites e sobre links de afiliado.

## 9. Decisões que dependem do dono (uma pergunta por vez)
Respondidas em ordem; a pergunta seguinte só é feita depois da resposta anterior.

**Pergunta 1 (a primeira, agora).** Você aprova a ordem "primeiro consertar a responsividade do site (lotes 0 a 7), depois um PWA mínimo (ícone, instalar na tela inicial, sem service worker) até 18/11, e deixar qualquer aplicativo de loja (Capacitor/nativo) para uma decisão em janeiro com dados"?
**Recomendação do conselho: sim.** O app de loja não cabe antes de 27/11, depende de políticas das lojas ainda não lidas e o diferencial (alerta por push) pode ser entregue por PWA depois da Black Friday.

Fila (serão perguntadas depois, uma a uma):
2. O congelamento de 20/11 vale para CSS e marcação, ou só para regras de preço, coleta e esquema? Recomendação: só para regras, coleta e esquema; interface segue até 24/11 com deploy em janela e rollback pronto; nada de interface em 25 a 27/11.
3. Web Push na Black Friday ou depois? Recomendação: depois (a partir de 28/11), por exigir tabela nova (esquema congelado), QA em iOS real e dados de usuários com alerta ativo.
4. Autoriza instalar Playwright com Chromium próprio (dependências de desenvolvimento, sem tocar o Chrome nem as abas abertas) e rodar a verificação em 4 larguras? Recomendação: sim, assim que as abas de coleta puderem ser dispensadas para o teste, porque ele roda em navegador separado.
5. Aprova a barra inferior com 5 posições (Início, Buscar, Ofertas, Monitorar, Mais), com Hype e Perfil dentro de "Mais"? Recomendação: sim, com busca em primeiro plano; Hype continua acessível no menu e na home. É decisão de navegação sua.
6. Autoriza gerar variantes WebP dos assets próprios pesados (originais preservados em backup, referências trocadas, conferência de uso único antes e depois)? Recomendação: sim, em linha com a aprovação ampla com backup que você já deu.
7. Quando for a hora do app de loja: você tem Mac e iPhone para testes e aceita abrir as contas Apple (99 USD/ano) e Google (25 USD)? Valores a conferir. Recomendação: só responder depois de janeiro.

## 10. O que fica de fora
Service worker e Web Push antes de 28/11; Capacitor, Expo e contas de loja; redesenho de marca ou novas imagens (exceto ícones do app); qualquer mudança em preço, média, selo, coleta, catálogo ou esquema; deploy sem autorização.

## 11. Arquivos relevantes
- Ata: `c:\repositorio\egeek86\docs\conselho\atas\2026-11-11-responsividade-mobile-ipad-e-app.md`
- Base citada: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/{app-header,app-shell,bottom-tab-bar,header-search-modal,mobile-nav-drawer,top-utility-bar,admin-shell}.tsx`, `src/components/ui/{button,input,select,dialog,drawer,camada-sobreposta,product-image}.tsx`, `src/components/affiliate/{offer-card,offer-filters,grouped-offer-shelf}.tsx`, `src/components/monitoring/{price-chart-v2,price-history-chart,monitoring-board}.tsx`, `src/app/(shop)/page.tsx`, `src/app/(shop)/sobre/page.tsx`, `src/app/(detalhe)/ofertas/[slug]/page.tsx`, `src/proxy.ts`, `next.config.ts`, `vercel.json`
- Documentação do Next 16 consultada: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`, `.../03-file-conventions/01-metadata/manifest.md`, `.../generate-viewport.md`
