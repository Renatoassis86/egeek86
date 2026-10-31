# Relatorio de QA: nova experiencia de busca (2026-10-31)

Preview: https://egeek86-9uqx0pbh7-renatos-projects-a493f2df.vercel.app
Veredito: PARCIAL. A verificacao visual no navegador NAO foi feita (Vercel pediu login no Chrome); o resto foi verificado por HTML/HTTP (`vercel curl`), contra o banco (so SELECT) e por `tsc`. Nenhum arquivo de codigo foi alterado, nada gravado no banco, sem deploy, sem commit.

## Bloqueio

O Chrome do dono abriu a pagina "Log in to Vercel" (conta nao logada). Conforme instrucao, parei o uso do navegador. Print: `research/qa-prints/busca/00-bloqueio-login-vercel.jpg`. Nao ha prints da busca: itens 1 a 4 (visual), 6 (tema claro/escuro e mobile) NAO foram vistos. Nenhum clique em "Ir a loja" foi feito; a rota `/go/*` nao foi chamada.

## Resultado por item

| # | Item | Resultado | Evidencia |
|---|---|---|---|
| 1 | Home: hero, botao, chips, termos populares | PASSOU no HTML, nao visto | Texto "Buscar precos de jogos e consoles", botao "Buscar precos", chips PS5, Switch 2, Xbox Series, PS4, Switch, Xbox One, Xbox 360. Mais cotados: Gta 5 - Grand Theft Auto V, Resident Evil 3, Street Fighter 6, Super Mario Bros. Wonder, Street Fighter V (nenhum truncado, bundle ou livro/manga). Tamanho do campo (grande) e altura nao conferidos visualmente. |
| 2 | Autocomplete (`/api/search`) | PASSOU, com 1 falha | zelda: 4 jogos Switch; mario kart 8: so o "8 Deluxe" (nao traz o 7); resident evil: 6 itens, so Resident Evil; xyzabc: vazio. FALHA: `ps5` devolve vazio (ver F1). Dropdown nao visto. |
| 3 | Resultados | PASSOU no HTML, nao visto | zelda: 4 cartoes (um por jogo), menor preco, loja "Mercado Livre", "Ir a loja", "Ver historico"; abas Jogos 4 / Consoles 0 / Acessorios 1; aba acessorios (`tipo=accessory`) traz o controle Zelda; `ordenar=price_asc` ordena 316,15, 329,90, 337,00, 389,90; faixa 330 a 400 devolve so os 2 corretos; `ordenar=discount` mostra selos ("Abaixo da media (16%)", "Na media", media do produto em todas as lojas). Vazio (xyz123): mensagem + "Mais cotados agora". "Quis dizer" (zelsa): 3 titulos Zelda. Selos "carregando depois": so aparecem com `ordenar=discount`; no carregamento padrao nao ha selos no HTML (hidratacao no cliente, nao verificada). |
| 4 | Pagina do produto | PASSOU no HTML | Tabela "Menor preco por loja" (Mercado Livre, "Menor preco", "Atualizado ha menos de 1 h", R$ 337,00, -14%, "Ir a loja"). href do botao: `/go/zelda-breath-of-thewild-nintendo-switch-151218282`; cartoes da busca tambem usam `/go/<slug>` com `rel="noopener noreferrer nofollow sponsored"`. Rota existe em `src/app/go/[slug]/route.ts` (so conferido o arquivo; nao chamada). |
| 5 | Banco x tela | PASSOU | 5 produtos (4 Zelda + Mario Kart 8), SELECT via `searchProducts`, `getMasterProductPriceStats`, `getSearchInsights` e SQL direto. Menor preco, n de ofertas e n de lojas batem com o preview; medias batem (Echoes 377,43; Breath 393,73; Link's Awakening 315,63); "menor ja visto" 250,00 do Breath e `lowAll` 25000. Selos: Echoes e Breath "below" (elegiveis), Link's "inline", Tears of Kingdom e Mario Kart 8 "insufficient" (2 e 1 cotacoes, sem selo, correto). Nenhuma oferta publica de 2 lojas: so 1 rede por produto. |
| 6 | Temas e mobile | NAO VISTO | Fallback de CSS: nenhum hex/rgb em `src/components/search` (so tokens `var(--color-...)`); alvos de toque `min-h-11`; tabela de lojas com `overflow-x-auto`; ha prefixos `sm:`. Isso nao prova layout a 390 px nem contraste nos dois temas. |
| 7 | Grep de termos proibidos | PASSOU na busca | frete, prazo, estoque, parcel*, afiliad*, comiss*, cashback, entrega: 0 ocorrencias no texto visivel de `/ofertas?q=...` (6 variantes) e na pagina do produto. Na home idem (0). Atencao: o atributo `rel="... sponsored"` nos links e invisivel ao cliente. Imagens: `src/components/search` e `ofertas` nao referenciam imagens de `public/images`; na home ha repeticoes (ver P2). |
| 8 | `npx tsc --noEmit` | PASSOU | sem saida de erro |

## Falhas e achados

- F1 (media): autocomplete de `ps5` (so plataforma) vem vazio; o doc diz que busca por plataforma sem texto e navegacao. A rota exige 2+ caracteres e `suggestProducts` nao trata termo so de plataforma. Em `/ofertas?q=ps5` a lista funciona (51 jogos). Correcao fica em `src/server/queries/search-products.ts` (fora do escopo permitido).
- F2 (media): contagem das abas nao bate com a lista quando a plataforma vem do termo. `/ofertas?q=ps5`: subtitulo "51 jogos com preco atual", aba "Jogos 82". Causa provavel: `facets.types` e contado antes do filtro de plataforma (`search-products.ts` ~linha 852). Idem `resident evil`: "9 jogos", chips de plataforma somam 6 (5 PS5 + 1 PS4), sobram 3 sem plataforma no chip. Fora do escopo; decisao: contar por tipo apos o filtro de plataforma.
- F3 (baixa): titulo limpo ainda sujo para alguns itens: "Resident Evil Village Gold Edition –" (traco final) no autocomplete; "Zelda:breath Of Thewild" (titulo do catalogo, falta espaco e caixa); "Gta 5 - Grand Theft Auto V" na home. Vem do titulo do master; sugerimos limpeza no cleaner de titulos e revisao no guardiao-catalogo.
- F4 (baixa): selos nos cartoes nao aparecem no carregamento padrao do HTML; so com `ordenar=discount`. Se a hidratacao por `getSearchInsights` acontece so no cliente, precisa ser confirmada no navegador.
- F5 (info): home diz "536 produtos com preco atual em 2 lojas monitoradas"; banco tem ofertas ativas em Mercado Livre (2.238) e Shopee (39), mas todos os resultados testados tem 1 loja. Confirmar se Shopee e de fato publica (ADR 0002); se nao, o "2 lojas" pode estar inflado.
- Observacao do doc do motor: `/go/[slug]` bloqueia clique de oferta pendente; hoje nenhuma pendente ativa, entao nao foi exercitado.

## Corrigido

Nada. Nao houve erro simples de codigo em `src/components/search/**`, `src/app/(shop)/ofertas/**` ou `src/app/(shop)/page.tsx` que eu pudesse confirmar sem ver a tela. Nenhum arquivo alterado.

## Pendente

- P1: repetir itens 1 a 4 e 6 no navegador com prints em `research/qa-prints/busca/` (dono logar na Vercel no Chrome, ou desativar a Deployment Protection do preview), incluindo tema claro/escuro e 390 px.
- P2: imagens repetidas no site (regra "uma imagem, um lugar"), fora da busca mas na home e paginas vizinhas: `/images/home/por-que-geek86.png` e `/images/home/statement-band.png` (home e `inteligencia-gamer`); `/images/noticias-hub/news-gta6.png` (2 usos na home em `page.tsx` linhas ~825 e ~830, mais `noticias/page.tsx`).
- P3: corrigir F1, F2, F3 nos arquivos de servidor (fora do escopo desta verificacao).
- P4: `npm run build` nao rodado (so `tsc`).
