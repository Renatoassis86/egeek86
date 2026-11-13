# Auditoria responsiva do front (2026-11-13)

Autor: engenheiro-frontend do Conselho Geek. Fase 1, sem alteração de código.

## 1. Método e limites

DADO REAL. Medido no navegador: Chrome headless (instalação local, perfil temporário, sem tocar nas abas existentes) controlado por script via protocolo CDP, contra https://www.egeek86.com. Emulação de métrica de dispositivo (mobile com user agent móvel). 13 páginas x 5 células = 65 cargas, 1 por célula, 6 s de espera pós-navegação e 1,5 s entre cargas (cada URL só se repete a cada ~13 cargas, bem acima de 5 s). Cada célula grava 1 captura da primeira dobra (JPEG) em `docs/redesenho-site/evidencias/<pagina>__<viewport>.jpg` e mede por script no DOM: largura de rolagem contra largura da janela, elementos que vazam à direita, alvos de toque, texto, imagens.

Células: mobile-retrato 390x844; mobile-paisagem 844x390; tablet-retrato 820x1180; tablet-paisagem 1180x820; desktop 1440x900 (desktop só existe em paisagem).
Páginas: `/`, `/ofertas`, `/ofertas/resident-evil-4-2023-ps5-br-midia-fisica-shopee-b46af5` (produto real, escolhido do HTML de `/ofertas`), `/monitoramento`, `/pesquisa`, `/noticias`, `/plus`, `/black-friday`, `/ranking`, `/tabela-de-precos`, `/sobre`, `/hype-zone`, `/entrar`.

Limites declarados: (a) a captura mostra só a primeira dobra; a altura total e as medidas cobrem a página inteira; (b) visitante deslogado: telas de conta e monitoramento logado não medidas; (c) alvo de toque pequeno = altura < 44 e largura < 44, ou altura < 24 (critério heurístico, conta também links de texto em linha); (d) texto pequeno medido a < 12 px (o briefing pede < 14 px; ver análise estática na seção 5); (e) as medidas são do dia, com cache e dado do momento; (f) 1 amostra por célula, não é estatística de variação. O script ficou no scratchpad da sessão, não no repositório.

## 2. Matriz (resultado por célula)

Código: OK = sem achado grave na célula; AJ = ajuste (texto pequeno, alvo de toque pequeno, página longa); ERRO = falha de servidor; 404 = rota fechada por trava (esperado).

| Página | mobile retrato | mobile paisagem | tablet retrato | tablet paisagem | desktop |
|---|---|---|---|---|---|
| `/` | AJ (27.851 px, texto 11 px) | AJ (22.002 px; 31% da altura ocupada por barras fixas) | AJ (21.834 px) | AJ (17.081 px) | AJ (16.923 px) |
| `/ofertas` | AJ (11.673 px; 7 textos < 12 px) | AJ (29.540 px) | ERRO (1 carga: "This page couldn't load") | AJ (18.653 px) | AJ (19.451 px) |
| `/ofertas/[slug]` | AJ (alvo "1D" 38x32, "Ofertas" 71x20) | AJ (imagem do produto ocupa toda a área útil; preço fora da dobra) | AJ | OK | OK |
| `/monitoramento` | AJ (visitante sem gráfico na dobra, lista vazia) | AJ | AJ | OK | OK |
| `/pesquisa` | AJ (botões de nota 37x38) | AJ | AJ | OK | OK |
| `/noticias` | AJ (14 textos < 12 px; carrossel 38x38) | AJ (4 imagens com naturalWidth 0, ver 4.5) | AJ (idem) | AJ | AJ (idem) |
| `/plus` | OK | AJ (cabeçalho de 120 px fixo) | OK | OK | OK |
| `/black-friday` | AJ (10.023 px, 118 imagens) | AJ (18.365 px) | AJ (18.242 px) | AJ (15.735 px) | AJ (15.907 px) |
| `/ranking` | OK (estado vazio honesto) | AJ (933 px, cabe) | OK | OK | OK |
| `/tabela-de-precos` | AJ (9.819 px, 14 textos < 12 px) | AJ (33 textos < 12 px) | AJ | AJ | AJ |
| `/sobre` | AJ (11.093 px, 15 imagens) | AJ (12.086 px) | AJ (11.972 px) | AJ (8.566 px) | AJ (8.903 px) |
| `/hype-zone` | 404 (fechada, `MARKETPLACE_PUBLIC=false`) | 404 | 404 | 404 | 404 |
| `/entrar` | OK (cabe exato em 844 px) | AJ (conteúdo 564 px > 390 px, rola) | OK | OK | OK |

Resultado central (DADO REAL, 65 de 65 células): nenhuma célula teve rolagem horizontal (largura de rolagem igual à da janela) e nenhum elemento vazando fora da janela sem corte por um contêiner. Responsividade horizontal está sólida.

## 3. Medidas por página (DADO REAL, cargas de 2026-11-13)

| Página | Altura mobile retrato (px) | Imagens no DOM | Alvos pequenos / total | Textos < 12 px |
|---|---|---|---|---|
| `/` | 27.851 | 106 | 25 / 213 | 25 |
| `/ofertas` | 11.673 | 115 | 12 / 176 | 7 |
| `/ofertas/[slug]` | 3.471 | 4 | 17 / 36 | 7 |
| `/monitoramento` | 2.068 | 3 | 14 / 29 | 0 |
| `/pesquisa` | 2.700 | 2 | 17 / 49 | 1 |
| `/noticias` | 3.271 | 9 | 16 / 48 | 14 |
| `/plus` | 4.791 | 2 | 13 / 61 | 0 |
| `/black-friday` | 10.023 | 118 | 13 / 170 | 0 |
| `/ranking` | 1.436 | 2 | 12 / 26 | 0 |
| `/tabela-de-precos` | 9.819 | 82 | 20 / 122 | 14 |
| `/sobre` | 11.093 | 15 | 12 / 28 | 1 |
| `/entrar` | 844 | 1 | 2 / 6 | 0 |

A home tem ~33 telas de rolagem em celular e 106 imagens; `/ofertas` e `/black-friday` carregam mais de 115 imagens. Com `images.unoptimized: true` (ver INVENTARIO_FRONT seção 5.4) isso pesa na rede móvel (HIPÓTESE: não medi bytes transferidos).

## 4. Achados graves e relevantes (com arquivo:linha)

4.1 GRAVE, paisagem curta no celular (844x390): header sticky de 56 px (`src/app/globals.css:193`, `app-header.tsx:183`) + barra inferior fixa de 64 px (`globals.css:195`, `bottom-tab-bar.tsx:35`) tiram 120 de 390 px, 31% da janela, de forma permanente; antes da primeira rolagem, as barras Arkos e tagline somam ~54 px a mais. Evidência: `evidencias/noticias__mobile-paisagem.jpg` (só ~220 px de conteúdo útil) e `home__mobile-paisagem.jpg`. RECOMENDAÇÃO: em `(orientation: landscape) and (max-height: 500px)` esconder a barra inferior (ou o header) e a barra Arkos.

4.2 GRAVE, produto em paisagem no celular: a área da imagem do produto toma toda a altura útil e o preço e o selo ficam abaixo da dobra (`evidencias/oferta-slug__mobile-paisagem.jpg`; imagem em `(detalhe)/ofertas/[slug]/page.tsx:199`, `ProductImage ... priority`). RECOMENDAÇÃO: limitar a altura da imagem a ~40 vh em paisagem curta e colocar preço ao lado (duas colunas já em `sm` paisagem).

4.3 GRAVE, falha de servidor em `/ofertas`: 1 das 5 cargas de `/ofertas` (tablet retrato) devolveu a página "This page couldn't load / A server error occurred" (`evidencias/ofertas__tablet-retrato.jpg`). As outras 4 cargas da mesma URL responderam bem. Não existe nenhum `error.tsx` nem `global-error.tsx` em `src/app` (listagem do diretório), então o visitante vê a página padrão do Next, branca, em inglês, fora da marca. RECOMENDAÇÃO: criar `app/error.tsx` e `app/global-error.tsx` com a identidade do site e botão "Tentar de novo"; investigar a causa da 500 nos logs (HIPÓTESE: estouro de tempo de banco, itens #45 e #46 da fila).

4.4 RELEVANTE, tamanho de alvo de toque (heurística): rodapé com ícones sociais de 20x20 (`site-footer.tsx:76,85`, `size-5`); link "Arkos Intelligence" de 142x16 na barra superior (`top-utility-bar.tsx:19`, `h-7`, texto `text-xs`); setas dos carrosséis 38x38 (`featured-articles-carousel.tsx`); seletor de período do gráfico "1D" 38x32 (`monitoring/timeframe-selector.tsx:23`, `py-1`); botões de nota da pesquisa 37x38; links "Ver ofertas" 73x20 no monitoramento. O restante dos botões principais já usa h-11/h-12 (`offer-filters.tsx:128`, `bottom-tab-bar.tsx:48` com 48 px). RECOMENDAÇÃO: mínimo 44x44 em `<lg`.

4.5 RELEVANTE, imagens em `/noticias`: em 4 células (mobile paisagem, tablet retrato, desktop) 4 imagens ficaram com `naturalWidth = 0`, sem ter completado (HIPÓTESE: carregamento preguiçoso ainda não disparado, não necessariamente quebrada; não conferi por recarga). Na captura desktop (`noticias__desktop.jpg`) a mesma imagem (X-Men) aparece duas vezes na dobra: carrossel e cartão principal logo abaixo (conteúdo repetido, não é violação da regra de imagem do código porque vem do banco).

4.6 RELEVANTE, texto pequeno (medido < 12 px): home 25 ocorrências (`(shop)/page.tsx:375` rótulos do `StatementBand` em `text-[11px]`, `:627`, `:879`); tabela de preços 14 a 33 (selos "Acima do normal", "+53,1%"); notícias 12 a 15 (etiqueta "Cultura Pop", legenda "Foto institucional"); `/ofertas` selo "Bundle" a 10 px. Em componentes há 104 usos de `text-[9px|10px|11px]` fora do admin (grep). O briefing pede 14 px como piso de leitura; abaixo disso o dado de preço, que é o produto, fica pequeno.

4.7 RELEVANTE, páginas muito longas no celular: ver seção 3 (home 27.851 px). Para o redesenho, o quadro de destaques e as prateleiras horizontais (já existentes em `grouped-offer-shelf.tsx:99`, cards de 72 vw) são o caminho para reduzir altura.

4.8 MENOR, `/monitoramento` para visitante: na dobra mobile só há o banner de convite e a lista vazia "Você ainda não está acompanhando nenhum jogo" (`evidencias/monitoramento__mobile-retrato.jpg`); o gráfico, a razão de existir da página, não aparece sem login ou sem `?jogo=` (`(shop)/monitoramento/page.tsx:96-108`).

4.9 MENOR, `/hype-zone` devolve a página 404 (esperado, rota fechada), mas continua linkada em partes do código só atrás de `MARKETPLACE_PUBLIC`; nada a corrigir agora.

4.10 Pontos sem problema medido: sem overflow horizontal; `grid-cols-3` sem base em `(shop)/page.tsx:372` funciona em 390 px (rótulos 11 px, ver 4.6); tabela de lojas do produto usa `min-w-[320px]` dentro de contêiner com rolagem (`product-stores-table.tsx:42`); SVGs de 450 a 600 px do hype-zone ficam em contêiner com `overflow-hidden` (`hype-zone/page.tsx:57`). 19 usos de `overflow-x-auto` (rolagem controlada).

## 5. Auditoria estática complementar (breakpoints)
- Breakpoints Tailwind padrão (sm 640, md 768, lg 1024). Tablet retrato (820) cai no ramo `md`; BottomTabBar e drawer valem até `lg` (<1024), então o tablet paisagem 1180 já vê o header desktop. Tablet retrato usa navegação móvel, coerente.
- Grid sem base responsiva: apenas `(shop)/page.tsx:372` e `curation-panel.tsx:269` (admin). Ok.
- Hero em paisagem curta: o hero da home não usa `vh` (`page.tsx:452-489`, só padding), então não estoura; mas com as barras fixas (4.1) a busca do hero fica abaixo de ~190 px.
- `min-h-screen` em `/inteligencia-gamer` (`page.tsx:275`): ok; `loading.tsx` com `min-h-[75vh]`: gera espaço vazio em paisagem curta (291 px), pequeno.

## 6. Pendências de medição
- Bytes transferidos e LCP por célula (fora do escopo, ver parecer do engenheiro-performance-web).
- Telas logadas (`/conta`, `/monitoramento` com lista, `/carrinho`) e `/noticias/[slug]`, `/mercado/*`, `/inteligencia-gamer` não entraram nas 65 células; `/inteligencia-gamer` foi vista só por leitura de código.
- Reteste de `/ofertas` em tablet retrato para saber se a 500 se repete (1 recarga espaçada) fica para a verificação do QA.
