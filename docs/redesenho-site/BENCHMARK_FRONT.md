# Benchmark de FRONT (landing e vitrines): 14 portais

Data da medição: 2026-11-13. Autor: pesquisador-benchmark, para o Conselho Geek (briefing em `BRIEFING.md`). Escopo: apresentação (home, vitrines, cartões, gráfico, peso, stack). Coleta e preço do egeek86 ficam fora.

Legenda de confiança: **[MEDIDO]** = contado/medido por mim nesta data; **[FICHA]** = vem de `research/benchmarks/fichas/*` (consulta de 2026-10-28, não remedido); **[HIPÓTESE]**; **[RECOMENDAÇÃO]**. "NÃO MEDIDO" = não consegui medir; nenhum número foi estimado.

## 0. Como medi (e o que isso limita)

- **Forma A, navegador headless (Chromium do Playwright já instalado em outro repositório do dono, nada instalado), viewport desktop 1440x900 e mobile 390x844 (isMobile)**, página pública sem login, aguarda 3,5 s, rola até 14.000 px em passos de 80% da altura para disparar lazy-load, e conta cartões (elemento com imagem + preço) agrupados por carrossel/lista. Portais: KaBuM!, Promobit, Steam, PlayStation Store, Nuuvem, IsThereAnyDeal, egeek86.
- **Forma B, aba NOVA do Chrome do dono (aba fechada ao terminar; abas existentes não tocadas), janela de 1536 px de largura (Amazon: 2304 px)**, mesmo método de contagem. Portais que bloqueiam o headless (HTTP 403 do CloudFront/Cloudflare, sem contorno): Mercado Livre, Zoom, Buscapé, Pelando, Magalu, Amazon BR, Shopee, PCPartPicker. **Atenção: essa aba usa o navegador do dono, que tem sessão em ML, Amazon e Shopee; as vitrines desses três são PERSONALIZADAS ("Inspirado no último visto", "Continuar comprando") e a home anônima pode ter outros números.** Não anotei nenhum dado da conta.
- **Forma C, curl** (cabeçalhos, tempo, tamanho do HTML, hosts de imagem): 2 amostras por URL, >= 5 s de intervalo entre repetições da mesma URL, 1 requisição de página por amostra, sem robots violado (só a rota `/`). Amostra 1 sem `Accept-Encoding` (bytes decodificados), amostra 2 com `gzip, br` (bytes na rede). Máquina do dono no Brasil.
- **Mobile em Chrome real não foi possível** (largura mínima da janela): mobile só existe para os 7 portais da Forma A. Os demais ficam "NÃO MEDIDO (mobile)".
- Contagem de "itens visíveis" = cartões inteiros dentro da largura do viewport sem rolar o carrossel. "Itens no DOM" = total já montado (inclui os fora da tela). Pós-rolagem, feeds infinitos (Promobit, ML) crescem; por isso o número de feed é "após rolar ~14.000 px".
- Peso de rede do headless = soma de `content-length` (subestima respostas sem esse cabeçalho). Serve para comparar ordem de grandeza, não valor exato.
- Prints: não gerei prints novos. Os prints desta rodada seriam de headless, não de aba nova do Chrome, e o pedido condicionava a aba nova; prints de desktop e mobile de Zoom, Promobit, Pelando, Keepa, ITAD etc. já existem em `research/benchmarks/prints/` (consulta de 2026-10-28). Nenhuma ficha nova criada (o método pede ficha por portal; sugiro fichas para KaBuM!, Nuuvem, ML e Magalu na próxima rodada, ver seção 9).

## 1. Quantidade de produtos por vitrine na home [MEDIDO, 2026-11-13]

Tabela detalhada na seção 8. Resumo por portal (vitrines de PRODUTO, fora hero/banners/categorias):

| Portal | Forma | Nº de vitrines de produto na home | Ordem (de cima para baixo) | Itens por vitrine (DOM) | Itens visíveis desktop / mobile | Tamanho do cartão (largura x altura px) |
|---|---|---|---|---|---|---|
| Zoom | B 1536 | 3 de produto + 3 tiles de categoria + hero de 8 banners (JSON da página) | hero; faixa de lojas (12 logos); 3 tiles (Celulares, TVs, Ar-condicionado); "Compre direto no Zoom!"; "Melhores ofertas em eletroportáteis"; "Explore o mundo gamer com as melhores ofertas"; reviews; app | 6, 6, 6 | 6 / NÃO MEDIDO | 213x328 a 213x408 |
| Buscapé | B 1536 | 3 de produto (mesmo CMS e mesmas 3 vitrines do Zoom) | idem Zoom, com "Categorias" no lugar do 2o bloco | 6, 6, 6 | 6 / NÃO MEDIDO | 213x328 a 213x408 |
| Promobit | A 1440/390 | feed + 4 destaques + 4 cupons + faixa de 26 lojas (JSON SSR) | destaques (4 cartões) > feed de ofertas (12 no HTML inicial, infinito) > lojas em destaque | 4 destaques; 12 ofertas SSR; 146 no DOM após rolar (desktop) | 4 destaques / 1 (mobile, 280x341) | destaque 245x397; item do feed mobile 358x198 |
| Pelando | B 1536 | 1 feed + 1 faixa de cupons | cupons de lojas (18 cartões) > feed de ofertas em lista de 1 coluna | 18 cupons; 21 ofertas carregadas após rolar ~9.000 px | 18 / NÃO MEDIDO | oferta 1076x216 (lista) |
| Mercado Livre | B 1536 (sessão do dono, personalizada) | 17+ carrosséis medidos; página cresce ao rolar (docH 7.745 e crescendo) | 4 tiles de acesso; "Inspirado no último visto"; "Relacionado com visitas em Games"; livros; favoritos; "Ofertas"; carrinho; esportes; "Mais vendidos em..." (repete por categoria) | 14 a 24 (maioria 20 a 24); "Ofertas" 23 | 7 (5 em "Ofertas") / NÃO MEDIDO | 173x340 a 173x412; "Ofertas" 182x384 |
| Shopee | B 1536 (sessão do dono) | 0 vitrines de produto lidas; 11 tiles de categoria + faixas de cupom | categorias principais (11 tiles, inclui "Jogos e Consoles") > cupons/frete | NÃO MEDIDO | NÃO MEDIDO | tile 100x108 |
| Amazon BR | B 2304 (sessão do dono) | 4 carrosséis de produto contados + ~10 cartões de tile por categoria ("Até 60% off em Beleza" etc.) | "Continuar comprando" (2); tiles de desconto por categoria; "Ofertas para descobrir"; "Ofertas recomendadas pra você"; "Em alta na Amazon" | 12 a 18 (contagem de imagens por carrossel, proxy de 1 por item) | 4 a 5 / NÃO MEDIDO | carrossel 554 px de altura por faixa; tile 362x122 a 362x197 |
| Magazine Luiza | B 1536 | 4 vitrines | "Para descobrir e aproveitar"; "Ofertas que você vai amar"; "Assista aos vídeos mais vistos"; "Têm tudo a ver com você" | 9, 6, 7, 9 | 5 / NÃO MEDIDO | 232x371 a 230x452 |
| KaBuM! | A 1440/390 | 9 | "11do11"; Recomendados; Produtos em oferta; Destaques ninja; Mais procurados; Acabaram de chegar; Seleção do ninja; Hardware para levar hoje; Produtos por até R$ 499 | 12, 10, 20, 12, 12, 12, 11, 8, 10 | 5 / 1 (mais espiada do próximo) | 230x366 (igual em desktop e mobile) |
| PCPartPicker | B 1536 | 0 (home é de ferramenta, não de preços) | guias de montagem (3) > build em destaque (1) > builds concluídas (6) | 3 guias; 6 builds | 3 / NÃO MEDIDO | NÃO MEDIDO |
| Steam | A 1440/390 | carrossel principal + "Popular" + 5 abas + marcadores | "Destaques e recomendados" (carrossel de 7 no DOM); "Popular"; abas (Lançamentos populares, Mais vendidos, Mais aguardados, Ofertas, Gratuitos populares); faixas por marcador ("Jogos de aventura" etc.); "Por até R$ 20" | 7 (destaque); 10 por lista de aba; 5 por faixa de marcador (x4 faixas) | destaque 1 por vez; 10 linhas por aba / 4 por faixa (mobile 10 linhas) | lista de aba 830x87 (desktop), faixa 230x160; mobile 374x209 |
| PlayStation Store | A 1440/390 | 3 | "10 melhores jogos no seu país"; "Novos jogos"; "Pré-venda"; depois PS Plus | 10, 11, 11 | 6 / 2 | 200x258 (desktop), 160x212 (mobile) |
| Nuuvem | A 1440/390 | 10 faixas de 4 + 1 lista "Mais populares" | 10 faixas curadas (cada uma com título de campanha) > "Mais populares" (12) | 4 por faixa; 12 | 4 / 4 em grade 2x2 | 320x360 (desktop); 173x279 (mobile) |
| IsThereAnyDeal | A 1440 | 1 hero de 5 + 3 listas | hero (5); lista de deals (55 linhas); "Most Waitlisted" (13); "Most Collected" (15) | 55, 13, 15 | todas visíveis (lista) / NÃO MEDIDO | linha 726x45 (lista densa) |
| egeek86 (hoje) | A 1440/390 | 1 faixa "queda" + 1 "melhores ofertas" + 5 de plataforma (6 no mobile, com "Consoles") + 6 de departamento | "Preço em queda essa semana" > "Melhores ofertas agora" > Switch 2 > Switch 1 > PS5 > PS4 > Xbox Series > Impressão 3D > Tecnologia > Livros > Casa > Eletrônicos > Esporte; depois Plus, WhatsApp, enquetes, Observatório | 3, 6, 6 (por plataforma), 8 (por departamento) | 3, 6, 6 / 8 dep: 5 desktop; mobile 3, 6, 6, 8 dep: 1 | 389x162 (queda), 193x414 a 546x566 (ofertas e plataformas, altura variável), 234x372 (departamento) |

Altura total da página (docH, px) [MEDIDO]: egeek86 16.402 desktop / 27.953 mobile; KaBuM! 7.195 / 8.274; Nuuvem 10.267 / 12.084; PlayStation Store 4.687 / 4.341; Steam 3.906 / 5.425; ITAD 5.951; Promobit 10.521 / 11.108 (cresce, feed infinito); ML 7.745 (cresce); Zoom 5.362; Buscapé 5.344; Pelando 5.690; Magalu 4.467; Shopee 5.794; Amazon 10.279; PCPartPicker 2.731.

Leitura: a home do egeek86 tem o dobro a o triplo da altura de KaBuM!/Zoom/Magalu, sobretudo no mobile (27.953 px), por causa de 11 faixas de 6 a 8 itens mais as seções editoriais.

## 2. Segmentação, plataforma de games e assinatura/clube

| Portal | Como segmenta a home | Destaque por plataforma de games | Assinatura/clube na home |
|---|---|---|---|
| Zoom / Buscapé | Faixa de 12 lojas parceiras no topo; tiles de categoria (Celulares, TVs, Ar-condicionado); menu de departamentos com 21 itens no primeiro nível (JSON `headerParams`). Vitrine curada "Explore o mundo gamer" [MEDIDO] | Não: uma vitrine de games genérica (6 itens), sem faixa por console | Não é assinatura: cashback (dezenas de menções no HTML) [MEDIDO] |
| Promobit | Feed por abas ("Destaques", "Em alta", "Menor preço" [FICHA]); 34 categorias no menu e 33 "landings" em destaque [MEDIDO no JSON]; faixa de 26 lojas | Não na home; landings por tema | Gamificação (Bitz/missões) [FICHA]; sem assinatura |
| Pelando | Feed único por temperatura; cupons por loja (18) | Não | Não |
| Mercado Livre | Vitrines por interesse/categoria (repetem "Mais vendidos em [categoria]"); 11 categorias em carrossel; "Lojas oficiais"; "Menos de R$100" | "Relacionado com as visitas em Games" é personalização, não segmentação por plataforma | Sim: widget de fidelidade/benefícios na home e seção "Benefícios em entretenimento" (HTML tem o widget `loyalty-widget`) [MEDIDO] |
| Shopee | 11 tiles de categoria, incluindo "Jogos e Consoles" | Não visível na home | Cupons e frete grátis como motor; sem assinatura vista |
| Amazon BR | Tiles de "Até X% off em [categoria]" (≈10), carrosséis | Não lido | Assinatura Prime: NÃO MEDIDO (não li a faixa) |
| Magalu | 4 vitrines genéricas + vídeos | Não | NÃO MEDIDO |
| KaBuM! | 9 vitrines temáticas, nenhuma por departamento fixo; "Hardware para levar hoje", "Produtos por até R$ 499"; faixas de banners (3 sob o banner, 3 laterais, 8 no principal [JSON]) | Dentro de `showcases` há campo `platforms` (JSON `showcases[].platforms`), mas a home mostra faixas por intenção, não por console [MEDIDO] | Não identificado |
| PCPartPicker | Menu de 11+ categorias de peça; home de ferramenta | Não se aplica | Não |
| Steam | Abas (5) + faixas por marcador + "Por até R$ 20" | A Steam é uma plataforma só | Não na home pública |
| PlayStation Store | Só 3 vitrines (top 10, novos, pré-venda) | A loja é de uma plataforma | Sim: bloco "Descubra o PlayStation Plus" abaixo das vitrines [MEDIDO, h2] |
| Nuuvem | 10 faixas de campanha (marca/publisher/tema) + "Mais populares" | Faixas por publisher (Capcom, Ubisoft), não por plataforma | Sem assinatura identificada |
| ITAD | Listas: deals, mais "waitlisted", mais "collected"; bloco "New in Subscriptions" | Sem (PC) | Sim: bloco "New in Subscriptions" (Game Pass, EA Play, Prime citados no HTML) [MEDIDO] |
| egeek86 (hoje) | 6 departamentos de 8 itens + faixas por plataforma | Sim: 5 faixas de 6 (Switch 2, Switch 1, PS5, PS4, Xbox Series) | Sim: bloco "Espaço Geek Plus" (título H2 na home) |

Leitura: **nenhum** dos portais de varejo/comparador medidos tem faixa por plataforma de games; o egeek86 já está à frente aqui. A referência de "faixa por intenção" (preço teto, "acabaram de chegar") é KaBuM!. A referência de assinatura em home é ML (benefícios) e PlayStation Store (bloco PS Plus, depois das vitrines).

## 3. Design gráfico: densidade, grid, cartão, selo, tema

- **Densidade de cartão**: KaBuM! e Magalu ficam em 230x370 a 232x452 com 5 visíveis; ML 173x340 a 412 com 7; Zoom 213x328 a 408 com 6; Nuuvem 320x360 com 4 (jogos precisam de capa maior); PS Store 200x258 com 6; Steam compacto 230x160. O egeek86 usa cartões de 193 px de largura mas com alturas de **414 a 566 px**, mais altos que qualquer outro portal medido (maior concorrente: Magalu 452). [MEDIDO] [RECOMENDAÇÃO]: limitar cartão de vitrine a <= 400 px de altura.
- **Grid**: carrossel horizontal com "espiada" do próximo (KaBuM! mobile: 1 cartão inteiro + resto; ML 7 em 1536) para vitrines de produto; **grade 2 colunas no mobile** para campanhas pequenas (Nuuvem 2x2, 173x279) e para ofertas (Deku Deals/PSprices [FICHA]); **lista de 1 coluna** para feed de comunidade (Pelando 1076x216, Promobit mobile 358x198).
- **Selo de desconto**: Steam 67 selos de % + preço original riscado na home (contagem de `.discount_pct`); Promobit/Pelando mostram a temperatura/votos em vez de %; Zoom tem selo "Menor preço" e "R$ X mais caro que o normal" [FICHA]; Deku "Lowest price ever" [FICHA]. KaBuM!/ML: não fotografei o selo, só contei cartões [NÃO MEDIDO como design].
- **Histórico de preço no cartão da home**: nenhum portal brasileiro medido mostra sparkline no cartão; só Keepa (lista de ofertas com sparklines [FICHA]) e SteamDB/PSprices em listas internas. Espaço aberto para o egeek86.
- **Tema**: IsThereAnyDeal `data-scheme="dark"` e egeek86 `data-theme="dark"` são escuros por padrão; Pelando e Steam também escuros pelo uso conhecido, mas **tema dos demais NÃO VERIFICADO nesta rodada** (Promobit tem classes `dark:` do Tailwind no HTML, ou seja, suporta tema escuro [MEDIDO no HTML]).
- Os dois ofertas com densidade de "terminal" são ITAD (linha de 45 px, 55 linhas por vitrine) e Steam (linha de 87 px). Uso: aba "Maiores quedas" do egeek86 em lista, não em carrossel.

## 4. Gráfico de histórico de preço (não remedido; vem das fichas de 2026-10-28)

| Portal | Tipo | Janelas | Lacunas e picos | Fonte |
|---|---|---|---|---|
| Zoom | linha/área (rampa entre pontos) | 40 d, 3 m, 6 m, 1 a | Rampa liga pontos distantes e perde fidelidade; frase "R$ X mais caro que o normal" | [FICHA] `fichas/zoom.md` |
| Buscapé | mesma plataforma do Zoom (mesmo CMS e stack, ver seção 6); gráfico de produto NÃO verificado | NÃO MEDIDO | NÃO MEDIDO | [HIPÓTESE] |
| Promobit | não tem gráfico de preço; só medidor de posição | n/a | n/a | [FICHA] |
| Pelando | não tem; temperatura | n/a | n/a | [FICHA] |
| Keepa | degrau multi-série (Amazon, terceiros, usados) | Dia a Todos | Degrau, cada série em cor; zoom e intervalo | [FICHA] |
| PCPartPicker | NÃO VERIFICADO nesta rodada (home 403 no curl; a home não tem gráfico) | NÃO MEDIDO | NÃO MEDIDO | n/a |
| ITAD | degrau + mini-mapa; log de mudanças | 1 m a All | degrau; picos preservados | [FICHA] |
| SteamDB | linha (jogadores) e tabela de preço por região | 48 h a máx | tabela como alternativa ao gráfico | [FICHA] |
| TCGplayer | linha de "market price" + barras de volume | 1M/3M/6M/1Y | volume mostra liquidez | [FICHA] |

Padrão forte (FICHA): **degrau, janelas em pílula, mínimo histórico em destaque, tabela de dados**. Anti-padrão: rampa do Zoom. Coerente com ADR 0004 (média oferta-dia e mudança do menor preço visível).

## 5. Tempo de resposta e peso do HTML da home (curl, 2 amostras) [MEDIDO, 2026-11-13]

TTFB em segundos; HTML em KB decodificado (amostra 1) e em KB na rede com compressão (amostra 2).

| Portal | Status | TTFB am.1 / am.2 | HTML decodificado | HTML na rede (gzip/br) | Observação |
|---|---|---|---|---|---|
| Zoom | 200 | 0,66 / 0,54 | 715 KB | 78 KB | CloudFront, `s-maxage=60` |
| Buscapé | 200 | 1,04 / 0,51 | 900 KB | 92 KB | CloudFront, `s-maxage=60` |
| Promobit | 200 | 0,86 / 0,67 | 443 KB | 33 KB | Next.js, cache `gocache` |
| Pelando | 200 | 0,31 / 0,16 | 275 KB | 41 KB | Cloudflare (header `Age` 3.498 s = servido de cache) |
| Mercado Livre | 200 | 0,54 / 0,50 | 536 KB | 123 KB | CloudFront, sem cache (`no-store`) |
| Shopee | 200 | 1,11 / 3,91 | 156 KB | 24 KB | HTML é casca de SPA; produtos vêm por JS |
| Amazon BR | 200 | 0,43 / NÃO MEDIDO | 2 KB | n/a | devolveu página de verificação anti-bot; **home NÃO MEDIDA por HTTP** |
| Magalu | 403 | 0,21 | n/a | n/a | bloqueio ao curl; **NÃO MEDIDO por HTTP** |
| KaBuM! | 200 | 0,69 / 0,54 | 77 KB | 18 KB | Next.js, `max-age=60`; vitrines hidratadas pelo cliente |
| PCPartPicker | 403 | 0,46 | n/a | n/a | Cloudflare; **NÃO MEDIDO por HTTP** |
| Steam | 200 | 0,85 / 0,47 | 987 KB | 137 KB | nginx, `no-cache` |
| PlayStation Store | 200 | 1,09 / 0,97 | 72 KB | 12 KB | Next.js + Apollo |
| Nuuvem | 200 | 0,84 / 0,28 | 169 KB | 169 KB (sem compressão vista) | Varnish `X-Cache: HIT` |
| ITAD | 200 | 1,48 / 0,90 | 328 KB | 49 KB | Cloudflare |
| **egeek86** | 200 | **0,40 / 0,40** (total 0,65 / **3,50**) | **687 KB** | **54 KB (br)** | Vercel, `Cache-Control: private, no-cache, no-store`, `X-Vercel-Cache: MISS` nas duas amostras: **nenhuma home é servida de cache de borda** |

Leitura: TTFB do egeek86 está na faixa dos melhores (0,40 s), **mas** (a) as duas respostas vieram sem cache de borda e uma delas levou 3,5 s para completar o corpo (variação a investigar, [HIPÓTESE]: streaming do RSC); (b) o HTML tem 687 KB decodificado, mais pesado que Zoom (715 KB) por pouco e muito maior que KaBuM!/PS Store (72 a 77 KB), porque o RSC inclui os dados de todas as 11 faixas.

Peso total da página em headless (soma de `content-length`; subestima) e nº de requisições, desktop / mobile [MEDIDO]:

| Portal | Rede (MB) desktop / mobile | Requisições desktop | JS (MB) desktop | Imagens vistas |
|---|---|---|---|---|
| KaBuM! | 7,5 / 5,1 | 457 | 1,8 | 130 webp |
| Steam | 18,0 / 14,9 | 197 | 5,3 | 77 jpeg |
| Nuuvem | 3,8 / 3,6 | 224 | 0,7 | 81 jpeg |
| PlayStation Store | 2,8 / 2,6 | 230 | 1,9 | 70 avif + 33 webp |
| ITAD | 4,5 | 207 | n/c | 106 jpeg |
| Promobit | 0,8 / 0,7 (subestimado) | 272 | 0,7 | 43 jpeg + 68 png |
| **egeek86** | **24,5 / 13,9** | 245 | n/c (sem content-length) | 85 jpeg + 6 png + 1 webp |

O egeek86 transfere 3x a KaBuM! e mais que a Steam em desktop. Causa provável [HIPÓTESE, verificar]: imagens de ML, Shopee e Amazon carregadas em tamanho original (hotlink, ver seção 6) sem redimensionamento.

## 6. Bibliotecas, frameworks, imagens [MEDIDO no HTML público e cabeçalhos]

| Portal | Stack visível | Hosts de imagem e formato | Lazy / srcset (HTML inicial) |
|---|---|---|---|
| Zoom / Buscapé | Next.js (Pages Router, `__NEXT_DATA__`), Redux, CMS de componentes (`hero-home`, `custom-showcase`...), mesmo código nos dois | `s.zst.com.br`, `image.zst.com.br` (CDN próprio); 368 refs `.webp` | 76 lazy; 0 srcset |
| Promobit | Next.js (Pages), Tailwind (`dark:`) | `i.promobit.com.br`; mistura png (238) e jpg (93) | 70 lazy; 15 srcset |
| Pelando | Astro (SSR/ilhas), Cloudflare | `assets.pelando.com.br`; muito SVG (68) | 7 lazy |
| Mercado Livre | framework próprio ("nordic") e UI "andes"; HTML renderizado no servidor, vitrines de produto hidratadas no cliente (HTML não traz preços) | `http2.mlstatic.com`; webp | 65 imagens com `preload` (peso inicial), 14 lazy |
| Shopee | SPA própria (casca de 156 KB), `SGW` | `susercontent.com` / `deo.shopeemobile.com` | NÃO MEDIDO |
| Amazon BR | Akamai, página de verificação anti-bot ao curl | NÃO MEDIDO | NÃO MEDIDO |
| Magalu | Cloudflare/similar; 403 ao curl | NÃO MEDIDO | NÃO MEDIDO |
| KaBuM! | Next.js (Pages) + jQuery residual; `showcases` e `banners` no JSON | `themes.kabum.com.br`, `static.kabum.com.br`; webp | 0 lazy no HTML inicial (cartões entram por JS) |
| PCPartPicker | Cloudflare, Vue citado no HTML da página de bloqueio | NÃO MEDIDO | NÃO MEDIDO |
| Steam | HTML tradicional + jQuery, nginx | `store.akamai.steamstatic.com`; jpeg | 0 lazy, 0 srcset |
| PlayStation Store | Next.js + Apollo GraphQL | `image.api.playstation.com`; **avif (70) e webp (33)** | poucas imagens no HTML, resto por JS |
| Nuuvem | HTML do servidor com Varnish | `assets.nuuvem.com`; jpeg | 71 lazy; 73 srcset |
| ITAD | Svelte, Cloudflare | `assets.isthereanydeal.com`; jpeg | 24 lazy; 82 srcset |
| **egeek86** | Next 16 (App Router, `__next_f`), Vercel, fontes Geist/Inter, tema escuro padrão | **hotlink**: `http2.mlstatic.com` (58), `cf.shopee.com.br` (29), `m.media-amazon.com` (12); jpeg | 103 lazy; **0 srcset** |

Imagem: **nenhum portal medido serve AVIF na home além da PlayStation Store**; webp é o padrão (Zoom, ML, KaBuM!, PS). O egeek86 serve imagens de terceiros diretamente (hotlink de marketplace), sem `srcset`, o que impede tamanho responsivo. Atenção a regras do projeto: "uma imagem, um lugar" (para imagens de `public/images`) e proibição de dado fake; esta observação é só de peso. Verificar se `next/image` já faz o redimensionamento antes de agir [HIPÓTESE].

## 7. Parecer: o que copiar, o que não copiar

### Copiar
1. **Vitrines de 10 a 12 itens com 5 a 6 visíveis em carrossel** (KaBuM!, Magalu, Zoom, PS Store) para "Melhores ofertas" e para departamentos; hoje o egeek86 mostra 6 a 8 e todos de uma vez em faixa fixa.
2. **Quadro de destaque em duas camadas** como Promobit/Zoom: 4 cartões grandes de "destaque" + feed denso abaixo.
3. **Faixas por intenção** do KaBuM!: "Produtos em oferta", "Acabaram de chegar", "Por até R$ X". No egeek86: "Menor preço já registrado", "Caiu essa semana", "Por até R$ 100".
4. **Mobile**: 2 cartões visíveis + espiada (PS Store 160x212, 2 visíveis) ou grade 2x2 (Nuuvem 173x279).
5. **Bloco de assinatura abaixo das vitrines e acima do rodapé de conteúdo** (PS Store: PS Plus depois das 3 vitrines; ML: benefícios) para o Geek Plus.
6. **Lista densa de 45 a 87 px por linha** (ITAD, Steam) para rankings (maiores quedas), não carrossel.
7. **Imagens webp/avif com `srcset`** (PS Store avif; Nuuvem e ITAD srcset).
8. **Cache de borda** (Zoom/Buscapé `s-maxage=60 stale-while-revalidate`, KaBuM! `max-age=60`, Pelando servido por cache): home pública com revalidação curta.
9. **Fonte do dado e "transparência de método"** (FICHA: PriceCharting, Zoom) no cartão: loja, hora, mínimo.

### NÃO copiar
1. Carrosséis infinitos personalizados repetidos por categoria (ML, 17+ faixas; página sem fim): conflita com "média única" e dilui a mensagem.
2. Vitrine de "mais vendidos" sem selo de preço relativo; cartão sem histórico.
3. Faixas de cashback e banners de app que ocupam a primeira tela (Zoom/Buscapé mobile, anti-padrão da ficha).
4. Rampa entre pontos no gráfico (Zoom): contradiz "sem interpolação".
5. Feed de comunidade com votos/temperatura (Pelando/Promobit) como substituto de preço: o egeek86 vende inteligência de preço, não comunidade.
6. Gamificação pesada (Bitz).
7. Uso de "afiliado" ou de aviso de comissão no texto ao cliente (regra do projeto).
8. Hero de tela cheia com carrossel automático (Steam principal), caro em peso (Steam: 18 MB).

## 8. Tabela: quantos produtos por vitrine [MEDIDO] e recomendação para o egeek86 [RECOMENDAÇÃO]

### 8.1 Medido

| Portal | Itens DOM por vitrine (faixa) | Visíveis desktop | Visíveis mobile | Vitrines de produto na home |
|---|---|---|---|---|
| Zoom | 6 | 6 | NÃO MEDIDO | 3 |
| Buscapé | 6 | 6 | NÃO MEDIDO | 3 |
| Promobit | 4 (destaque); 12 (feed SSR) | 4 | 1 (destaque), lista no feed | 2 + feed |
| Pelando | 18 cupons; 21 ofertas após rolar | 18 (cupons) | NÃO MEDIDO | 1 feed + 1 faixa |
| Mercado Livre | 14 a 24 | 7 (5 em Ofertas) | NÃO MEDIDO | 17+ (personalizado) |
| Shopee | NÃO MEDIDO | NÃO MEDIDO | NÃO MEDIDO | 0 lidas |
| Amazon BR | 12 a 18 (imagens por carrossel) | 4 a 5 | NÃO MEDIDO | 4 + tiles |
| Magalu | 6 a 9 | 5 | NÃO MEDIDO | 4 |
| KaBuM! | 8 a 20 (mediana 12) | 5 | 1 | 9 |
| PCPartPicker | 0 produtos; 3 guias + 6 builds | 3 | NÃO MEDIDO | 0 |
| Steam | 7 (destaque), 10 (lista por aba), 5 (faixa de marcador) | 1 (destaque) / 10 linhas | 10 linhas / 4 | 1 + 5 abas + 4 faixas |
| PS Store | 10 a 11 | 6 | 2 | 3 |
| Nuuvem | 4 (faixa); 12 (popular) | 4 | 4 (2x2) | 10 + 1 |
| ITAD | 55 / 13 / 15 (listas) | todas | NÃO MEDIDO | 3 listas |
| **egeek86 hoje** | 3 / 6 / 6 / 8 | 3 / 6 / 6 / 5 | 3 / 6 / 6 / 1 | 13 (desktop), 15 (mobile) |

### 8.2 Recomendação de quantidades para a landing do Espaço Geek 86

Critério: (a) alcançar o "tamanho" de KaBuM!/Magalu/ML (10 a 24 por carrossel); (b) peso: o egeek86 já está em 24,5 MB desktop; (c) alturas de cartão <= 400 px. Valores propostos [RECOMENDAÇÃO]; confirmar com o dono. "DOM" = montados; "visíveis" = sem rolar o carrossel.

| Tipo de vitrine (egeek86) | Itens no DOM | Visíveis desktop (>= 1280) | Visíveis tablet (768 a 1023) | Visíveis mobile (<= 430) | Formato | Referência |
|---|---|---|---|---|---|---|
| Quadro de destaques (hero deals: "Melhores ofertas do dia") | 12 (1 grande + 3 médios + 8 pequenos em grade) | 12 de uma vez | 6 (2x3) | 4 (2x2) + "ver mais" | grade assimétrica, não carrossel | Promobit (4 destaques + feed), Amazon (tiles) |
| Melhores ofertas por segmento (geral) | 12 | 6 | 4 | 2 + espiada | carrossel | KaBuM! (12, 5 visíveis), PS Store (11, 6) |
| Destaque por plataforma de games (Switch 2, PS5, Xbox Series, PS4, Switch 1): jogos | 10 | 5 | 4 | 2 + espiada | carrossel, uma faixa por plataforma, ordem fixa | KaBuM! 10, PS Store 10 |
| Destaque por plataforma: consoles (nas mesmas faixas, ou 1 faixa "Consoles") | 6 | 6 | 3 | 2 | grade ou carrossel | Zoom (6), Magalu (6 a 9) |
| Departamentos fora de games (Impressão 3D, Tecnologia, Livros, Casa, Eletrônicos, Esporte) | 10 | 5 | 4 | 2 + espiada | carrossel; **só 3 departamentos abertos na primeira carga**, demais atrás de abas ou "carregar mais" | KaBuM! 8 a 12; Nuuvem 4 |
| "Preço em queda essa semana" / maiores quedas | 10 (lista) | 10 linhas de 45 a 90 px | 10 | 6 + "ver todas" | lista densa com sparkline | ITAD (55), Steam (10 por aba) |
| "Menor preço já registrado" | 8 | 4 | 4 | 2 | carrossel curto | Deku (FICHA) |
| Geek Plus (assinatura) | 1 bloco de benefícios + 4 jogos/ofertas exclusivas (se existirem; nada fake) | 4 | 2 | 2 | 1 bloco largo, após as faixas de games | PS Store (bloco PS Plus), ML (benefícios) |
| Notícias | 4 | 4 | 2 | 2 | cards compactos | Zoom/Buscapé (reviews, 3 a 4 cartões) |

Total de produtos montados no DOM por visita: **cerca de 12 + 12 + 5x10 + 3x10 + 10 + 8 = 122 produtos** (hoje, contando as faixas medidas: 3 + 6 + 5x6 + 6x8 = 87, ou 99 no mobile com a faixa "Consoles"). Para manter peso sob controle, carregar faixas abaixo da dobra sob demanda (lazy por seção) e entregar cada imagem em `srcset` com <= 360 px de largura no mobile.

Orçamento [RECOMENDAÇÃO, hipótese de partida a validar com o engenheiro-performance-web]: HTML <= 300 KB decodificado; transferência total <= 8 MB desktop e <= 5 MB mobile na primeira carga (patamar KaBuM!, 7,5 / 5,1); cartão <= 400 px de altura; no máximo 10 seções antes do rodapé.

## 9. Riscos, dados que faltam e próximos passos

- **Riscos**: (1) ML, Amazon e Shopee foram lidos em sessão logada; contagens de ML (14 a 24) e Amazon são de vitrines personalizadas; na home anônima os números podem diferir [MEDIDO com ressalva]. (2) Headless é bloqueado (403) por Zoom, Buscapé, ML, Pelando; usei Chrome do dono, sem contornar bloqueio. (3) Contagem automática de cartões por heurística (imagem + preço): arquivos de saída em `scratchpad` (fora do repositório); pode contar tiles de banner com preço como cartão. (4) Amostras de TTFB: 2 por URL, de uma máquina só; a variação do egeek86 (0,65 s e 3,50 s de total) precisa de mais amostras espaçadas, feitas pelo engenheiro-performance-web.
- **Dado que falta**: mobile real de Zoom, Buscapé, ML, Magalu, Amazon, Shopee, Pelando, PCPartPicker (viewport 390 em Chrome real, ou emulação de dispositivo); HTML e peso de Amazon e Magalu (bloqueados no curl); histórico de preço de PCPartPicker e Buscapé; tema e selo de desconto de KaBuM!, ML e Magalu (design não fotografado); presença de assinatura em Amazon (Prime), Magalu e KaBuM!.
- **Pendência de ficha**: o método pede ficha por portal; KaBuM!, Nuuvem, Magalu, ML, Amazon, Shopee e PCPartPicker não têm ficha em `research/benchmarks/fichas`. Proposta: criar na Fase 2 com prints de aba nova, sem alterar o INDICE hoje.
- **Regras inegociáveis**: nenhuma sugestão inventa dado; "Geek Plus" só mostra ofertas exclusivas reais; "uma imagem, um lugar" vale para imagens de `public/images`; palavra "afiliado" fora do texto ao cliente.

## 10. Métrica de sucesso (para o redesenho da landing)

- Itens por vitrine conforme a tabela 8.2 verificados por contagem em desktop 1440 e mobile 390 (mesmo script).
- Transferência da home <= 8 MB desktop e <= 5 MB mobile; HTML <= 300 KB decodificado; home servida com cache de borda (`s-maxage` curto) em >= 90% das amostras.
- Altura da página mobile <= 14.000 px (hoje 27.953).
- 0 cartões com altura > 400 px nas vitrines de produto.
- Faixas por plataforma de games presentes (5) e bloco do Geek Plus acima do bloco de enquetes e do Observatório.
