# Dimensões de imagem — Espaço Geek 86

> Manifesto único com toda imagem (existente ou planejada) que o site usa,
> com a dimensão exata recomendada pra gerar cada uma. Complementa
> `docs/radiografia-plataforma.md` (onde cada imagem entra) e
> `docs/image-generation-prompts.json` (o texto do prompt de cada uma já
> entregue). As dimensões aqui valem tanto pras já entregues quanto pras
> novas ainda sem prompt.
>
> Todas usam `object-cover` (preenchem e cortam o excesso) exceto onde
> marcado `object-contain` (nunca corta, obrigatório em foto de produto
> real). Por isso a PROPORÇÃO importa mais que o pixel exato — as
> resoluções abaixo já têm margem de sobra pra qualidade em tela retina.

## Home (`/`)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 1 | Hero — tile de trás (mosaico) | 3:4 | 1200×1600 | Já entregue. Cortado nas bordas, composição pode ser mais solta. |
| 2 | Hero — tile principal (mosaico) | 4:5 | 1600×2000 | Já entregue. Carrega com prioridade, é o mais visível dos 3 — composição mais centrada. |
| 3 | Hero — tile de acento (mosaico) | 1:1 | 800×800 | Já entregue. Pequeno (canto inferior), pode ser um close/macro. |
| 4 | Hype Zone — banner do teaser | 4:5 | 1600×2000 | Já entregue. Painel lateral do card, altura variável (~450-550px no desktop) — retrato cobre melhor que quadrado. |
| 5-10 | Universos — 6 tiles (Naruto, One Piece, Marvel, Star Wars, Pokémon, Dragon Ball) | 3:4 | 1200×1600 cada | Já entregues. Tratamento abstrato por cor (ver aviso de marca registrada na seção 7 da radiografia). Tile 1 (Naruto) é o mais largo no desktop — prefira composição centralizada nele. |

## Mascotes originais (uso livre, sem local fixo ainda)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 11-15 | 5 mascotes (corredora, robô, caçadora espacial, ninja, exploradora+criatura) | 4:5 | 1600×2000 cada | Já entregues. Formato versátil pra recorte futuro (card, social, banner). |

## Monitoramento (`/monitoramento`)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 16 | Estado vazio (deslogado ou sem watchlist) — ilustração decorativa acima do texto | 8:5 | 1280×800 | Container é `max-w-3xl` (768px) centralizado, texto puro hoje. Ilustração pequena/média acima do H1, não full-bleed — algo como painéis de gráfico/dado flutuantes em dourado sobre fundo escuro, remetendo a "cockpit de dados" sem ser genérico demais. **Prompt ainda não escrito, só a dimensão.** |

O dashboard em si (gráfico + watchlist, quando há dado) é 100% interface de
dado — sem imagem decorativa nele.

## Conta do cliente (`/conta`)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 20 | Estado vazio ("você ainda não acompanha nenhum jogo") — ilustração decorativa acima do texto | 8:5 | 1280×800 | Mesmo container (`max-w-6xl`, card centralizado) e mesmo espírito do estado vazio do Monitoramento — pode reaproveitar composição parecida (dado/gráfico), mudando o tom pra algo mais "comece a colecionar" do que "monitorar mercado". Baixa prioridade. **Prompt ainda não escrito.** |

## Compartilhamento social (todo o site)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 21 | Imagem de Open Graph / Twitter Card (`og:image`, usada quando alguém cola o link do site no WhatsApp, Twitter, Discord etc) | 1.91:1 | 1200×630 | **Faltava no site inteiro** — `src/app/layout.tsx` já declara `openGraph`/`twitter: summary_large_image`, mas sem nenhuma imagem associada hoje (link do site aparece sem preview). Dimensão é o padrão universal de OG image (Facebook/Twitter/LinkedIn/WhatsApp todos leem esse tamanho). Deve trazer a logomarca + slogan de forma legível mesmo em miniatura pequena (como aparece no card de link). **Prompt ainda não escrito — prioridade alta, é o que representa o site quando é compartilhado.** |

## Página de erro (404)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 22 | Ilustração de "página não encontrada" | 4:5 | 1200×1500 | Hoje **não existe página 404 customizada** (usa o padrão em branco do Next.js). Item opcional — só vale a pena gerar se decidirmos construir um `not-found.tsx` próprio. **Prompt ainda não escrito, condicional.** |

## Login (`/entrar`)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 17 | Painel visual lateral (se migrar de formulário centralizado pra split-screen) | 2:3 | 1200×1800 | Cobre a altura cheia do viewport num painel lateral (~50% da largura em desktop). Não construído ainda — é uma reformulação futura, hoje o form é centralizado sem imagem. **Prompt ainda não escrito, só a dimensão, condicional a essa mudança de layout acontecer.** |

## Notícias (`/noticias`, em construção)

| # | Local | Proporção | Dimensão (px) | Observação |
|---|---|---|---|---|
| 18 | Capa de artigo — card na listagem (`/noticias`) | 16:9 | 1200×675 | Mesmo tratamento por card em toda a grade, independente da categoria. |
| 19 | Capa de artigo — banner no topo da página de leitura (`/noticias/[slug]`) | 16:9 | 1600×900 | Mais larga que o card da listagem — é o hero da matéria, estilo banner editorial de portal de notícia (IGN/Kotaku). Mesma imagem-base do card pode ser reaproveitada/re-crop se for a mesma arte. |

Como cada matéria tem tema diferente (sinopse de jogo, cultura pop,
tecnologia...), **não existe um prompt fixo aqui** — cada capa é gerada na
hora de publicar aquela matéria específica, sempre nessas duas dimensões e
na paleta/tom da marca (ver seção 2 da radiografia).

## Resumo rápido (todas as dimensões distintas usadas no site)

| Proporção | Dimensão | Onde |
|---|---|---|
| 1:1 | 800×800 | Hero tile de acento |
| 3:4 | 1200×1600 | Hero tile de trás, 6 tiles de Universos |
| 4:5 | 1600×2000 | Hero tile principal, banner Hype Zone, 5 mascotes |
| 8:5 | 1280×800 | Ilustração de estado vazio do Monitoramento e da Conta |
| 2:3 | 1200×1800 | Painel lateral do Login (condicional) |
| 16:9 | 1200×675 / 1600×900 | Capas de artigo de Notícias (card / banner) |
| 1.91:1 | 1200×630 | Imagem de Open Graph / redes sociais (prioridade alta, faltava) |
| 4:5 | 1200×1500 | Ilustração de página 404 (opcional, condicional) |
