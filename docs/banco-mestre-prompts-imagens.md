# Banco Mestre de Prompts de Imagem — Espaço Geek 86

> Documento de trabalho pra gerar, um a um, no ChatGPT (Image), Midjourney, Flux, Ideogram ou Firefly. Organizado por **prioridade real** — o que falta hoje na plataforma, conforme a radiografia técnica e o `PROJECT_BLUEPRINT.md`. Todo prompt usa o mesmo bloco de estilo mestre (seção 0), então gerar na ordem abaixo é o que garante que o site não vire uma colcha de retalhos visual.
>
> **Como usar**: cole o "PROMPT FINAL" de cada item, um de cada vez, peça 2–3 variações, escolha a mais sóbria (nunca a mais "bonitinha" — ver critério de curadoria na seção 6). Salve no caminho sugerido em cada item.
>
> Produzido a partir de `docs/radiografia-plataforma.md` e `docs/dimensoes-imagens.md`. Substitui/consolida os prompts soltos desses dois arquivos num único documento de trabalho.

---

## 0. Bloco de estilo mestre (embutido em todo prompt abaixo)

Isso já está dentro de cada prompt final — não precisa colar separado. Documentado aqui só pra você (e pra quem mexer nisso depois) entender a lógica e poder ajustar todos de uma vez se a paleta mudar.

```
STYLE: premium editorial photography, cinematic, minimalist, dark-mode brand
world. Controlled dramatic lighting (single key light + subtle gold rim
light), fine film grain, shallow depth of field, generous negative space,
one single clear subject per frame — never a busy or cluttered scene.
PALETTE: deep black background (#0B0908), graphite surfaces (#161311 /
#201C18), warm gold as primary accent (#D4AF37), burnt orange as secondary
occasional accent (#E8721C), cream (#F2E9D8) only as small highlight/rim
light, never as a dominant color.
MATERIALS: dark wood, brushed metal, glass, aluminum, leather, matte black
plastic. No plastic-toy shine, no glossy stock-photo look.
MOOD: confident, intelligent, nostalgic-but-not-old, curated, quiet
sophistication — never loud, never childish, never generic stock photography.
```

```
NEGATIVE PROMPT (padrão, sempre incluir): no text, no readable text, no
logo, no watermark, no brand names, no trademarks, no copyrighted
characters, no game cover art, no comic book cover art, no celebrity
likeness, no real recognizable faces in close-up, no cluttered composition,
no neon cyberpunk aesthetic, no cartoonish or toylike rendering, no
oversaturated colors, no low quality, no blurry focal subject, no visible
UI mockups with fake text
```

**Regra de ouro**: nenhuma imagem gerada deve conter a logomarca real (o
ícone inspirado em Pong + wordmark). Ela é aplicada depois, em código. Se
quiser um "easter egg" discreto da geometria (barras verticais curta-alta-
curta, linha pontilhada), é permitido *sugerir* essa forma em algum elemento
de cena (ex: reflexo, sombra, disposição de objetos) — nunca reproduzir o
símbolo literal.

---

## 1. PRIORIDADE MÁXIMA — falta no site inteiro hoje

### 1.1 — Imagem de Open Graph / Social Share

**Onde entra**: `og:image` / `twitter:image` em `src/app/layout.tsx`. É o que
aparece quando alguém cola o link do site no WhatsApp, Twitter/X, Discord,
LinkedIn. **Hoje o link do site aparece sem nenhum preview** — é a lacuna de
maior impacto de marca por ser a mais vista fora do site (todo compartilhamento
passa por ela).

- **Objetivo**: comunicar em 1 imagem, legível até em miniatura pequena
  (~300px de largura no card do WhatsApp), o que é o Espaço Geek 86: dado +
  cultura geek + confiança.
- **Storytelling**: um "instante" de inteligência de mercado geek — um
  gráfico de linha dourado de preço, elegante, flutuando sobre um fundo
  escuro com silhuetas discretas de objetos geek (controle, cartucho,
  figure), como se fosse a "capa" de um relatório de inteligência premium.
- **Composição**: horizontal (1.91:1), assunto central ocupando o terço
  central-esquerdo, dois terços à direita como espaço negativo generoso
  reservado pra texto/wordmark ser aplicado depois em código (não gerar
  texto nenhum).
- **Materiais**: vidro (linha de gráfico com leve glow), metal escovado
  (silhueta de controle), grafite de fundo.
- **Iluminação**: cinematográfica, key light dourada vinda de cima-esquerda,
  fundo quase preto, leve névoa/atmosfera.
- **Profundidade/lente**: profundidade rasa, sensação de lente 50mm, leve
  vinheta nas bordas.
- **Espaço negativo**: obrigatório — mínimo 55% do lado direito do frame
  limpo (superfície escura lisa), pra wordmark e tagline entrarem em CSS por
  cima sem brigar com a imagem.
- **Paleta**: ver bloco mestre.
- **Objetos obrigatórios**: uma linha/curva de gráfico de preço estilizada
  em dourado; ao menos uma silhueta discreta de objeto geek (controle de
  video game OU cartucho retrô OU action figure) em segundo plano, desfocada.
- **Objetos proibidos**: qualquer texto, qualquer logo, qualquer marca ou
  franquia reconhecível, qualquer personagem.

**PROMPT FINAL:**
```
A premium editorial composition for a data-intelligence brand in the geek
culture space. On the left third of the frame, an elegant glowing gold
price-chart line curves upward and downward like a stock market graph,
rendered as a thin luminous line floating in dark space, subtle particle
glow around it. Behind it, softly out of focus, a barely-visible silhouette
of a video game controller rests on a dark graphite surface. The right
two-thirds of the frame are deep matte black negative space with a very
subtle gold gradient glow bleeding in from the left, completely empty and
clean, reserved for text overlay. Cinematic single gold key light from the
upper left, fine film grain, shallow depth of field, extreme minimalism,
premium dark editorial mood, no clutter.

STYLE: premium editorial photography, cinematic, minimalist, dark-mode
brand world. Controlled dramatic lighting (single key light + subtle gold
rim light), fine film grain, shallow depth of field, generous negative
space, one single clear subject. PALETTE: deep black background (#0B0908),
graphite surfaces (#161311/#201C18), warm gold accent (#D4AF37), burnt
orange occasional accent (#E8721C), cream (#F2E9D8) only as tiny highlight.
MATERIALS: dark wood, brushed metal, glass, aluminum. MOOD: confident,
intelligent, curated, quiet sophistication.

Aspect ratio 1.91:1 (landscape social share image).

Negative prompt: no text, no readable text, no logo, no watermark, no
brand names, no trademarks, no copyrighted characters, no game cover art,
no celebrity likeness, no cluttered composition, no neon cyberpunk
aesthetic, no cartoonish rendering, no oversaturated colors, no low quality
```

- **Dimensão**: 1200×630 (1.91:1)
- **Arquivo sugerido**: `/public/images/system/og-cover.jpg`

---

### 1.2 — Estado vazio do `/monitoramento`

**Onde entra**: acima do H1, quando o usuário está deslogado ou não tem
nenhum jogo na watchlist. Container `max-w-3xl` centralizado — ilustração
pequena/média, não full-bleed.

- **Objetivo**: dar peso visual a uma tela que hoje é só texto, sem competir
  com o dashboard de dados real (que aparece quando há watchlist).
- **Storytelling**: um "cockpit de dados" abstrato — painéis de gráfico
  flutuando em camadas, como se fosse o momento antes de o usuário começar a
  monitorar (ainda vazio, mas cheio de potencial).
- **Composição**: 3–4 painéis/cartões translúcidos de gráfico em
  perspectiva leve, flutuando em profundidades diferentes, centralizados.
- **Materiais**: vidro fosco (painéis), leve reflexo dourado.
- **Iluminação**: glow dourado suave saindo de trás dos painéis, fundo
  praticamente preto.
- **Profundidade/lente**: sensação de grande angular suave, profundidade em
  camadas (parallax visual).
- **Espaço negativo**: bordas do frame limpas, composição concentrada no
  centro (ilustração pequena dentro de um container estreito).
- **Objetos obrigatórios**: painéis/cartões abstratos com linhas de gráfico
  (sem número real, sem texto).
- **Objetos proibidos**: qualquer texto/número legível, qualquer UI real
  reconhecível (nada que pareça screenshot de app existente).

**PROMPT FINAL:**
```
An abstract data-intelligence illustration: three to four translucent
frosted-glass panels floating at slightly different depths against a near-
black background, each panel showing a soft glowing gold abstract line
chart (no numbers, no labels, no readable text), arranged in a gentle
parallax composition centered in the frame. Subtle gold ambient glow
emanating from behind the panels, fine atmospheric haze, extreme
minimalism, no clutter, generous dark empty space around the panels.

STYLE: premium editorial photography/CG hybrid, cinematic, minimalist,
dark-mode brand world. Controlled dramatic lighting, subtle gold rim light,
fine grain, shallow depth of field, one clear composition. PALETTE: deep
black background (#0B0908), graphite (#161311/#201C18), warm gold accent
(#D4AF37), tiny cream highlights only (#F2E9D8). MATERIALS: frosted glass,
brushed metal edges. MOOD: intelligent, quiet, anticipatory — "empty but
full of potential", never sad or broken-looking.

Aspect ratio 8:5, small-to-medium illustration for a narrow content
container, not full-bleed.

Negative prompt: no text, no numbers, no readable labels, no logo, no
watermark, no brand names, no recognizable app UI, no cluttered
composition, no neon cyberpunk aesthetic, no cartoonish rendering, no
oversaturation, no low quality
```

- **Dimensão**: 1280×800 (8:5)
- **Arquivo sugerido**: `/public/images/monitoramento/empty-state.jpg`

---

### 1.3 — Estado vazio do `/conta`

**Onde entra**: painel de "você ainda não acompanha nenhum jogo", mesmo
container e espírito do item anterior, mas tom mais "comece a colecionar"
do que "monitore o mercado". Baixa prioridade, mas reaproveita a mesma
composição-base — vale gerar junto pra manter a família visual.

- **Objetivo**: convidar à ação (começar a acompanhar/colecionar) sem
  parecer um erro ou tela quebrada.
- **Storytelling**: a mesma linguagem de painéis flutuantes do
  Monitoramento, mas com um objeto colecionável (silhueta discreta) entrando
  na composição — a ponte entre "dado" e "colecionismo", que é o
  posicionamento central da marca.
- **Composição**: 2 painéis de gráfico abstrato ao fundo + 1 silhueta de
  objeto colecionável (case de jogo fechado, sem arte de capa, ou uma action
  figure genérica) em primeiro plano, levemente desfocada.
- **Demais parâmetros**: idênticos ao item 1.2 (mesma paleta, iluminação,
  materiais, restrições).

**PROMPT FINAL:**
```
An abstract illustration blending data intelligence with collecting: two
soft translucent glass panels with glowing gold abstract line charts
floating in the background (no numbers, no text), and in the foreground,
softly lit and slightly out of focus, the plain silhouette of a closed
video game case (no cover art, no text) resting at an angle, catching a
warm gold rim light. Near-black background, fine atmospheric haze,
generous negative space, extreme minimalism, one clear composition, no
clutter.

STYLE: premium editorial photography/CG hybrid, cinematic, minimalist,
dark-mode brand world. PALETTE: deep black background (#0B0908), graphite
(#161311/#201C18), warm gold accent (#D4AF37), tiny cream highlights only.
MATERIALS: frosted glass, matte case surface, brushed metal. MOOD:
inviting, "start your collection", warm and intelligent, never empty or
broken-looking.

Aspect ratio 8:5, small-to-medium illustration for a narrow content
container, not full-bleed.

Negative prompt: no text, no numbers, no readable labels or cover art, no
logo, no watermark, no brand names, no recognizable franchise, no
cluttered composition, no neon cyberpunk aesthetic, no cartoonish
rendering, no oversaturation, no low quality
```

- **Dimensão**: 1280×800 (8:5)
- **Arquivo sugerido**: `/public/images/conta/empty-state.jpg`

---

## 2. PRIORIDADE CONDICIONAL — depende de uma decisão de layout ainda não tomada

Só vale gerar se/quando a decisão de produto for tomada. Não bloqueiam nada
hoje — incluí porque, se a decisão vier, é bom já ter o prompt pronto e no
mesmo padrão.

### 2.1 — Painel lateral do `/entrar` (split-screen)

**Condição**: só relevante se decidirem sair do formulário centralizado
simples de hoje para um layout dividido (metade form, metade visual).

- **Objetivo**: dar um tom premium/editorial ao momento de login, sem
  distrair do formulário.
- **Storytelling**: continuidade direta da linguagem da Home/Hero — um
  "still life" atmosférico de objeto geek com luz dourada, mas mais
  contido, quase uma vinheta.
- **Composição**: um único objeto (controle ou console) centralizado
  verticalmente, bastante espaço negativo acima e abaixo.

**PROMPT FINAL:**
```
A tall vertical atmospheric still-life photograph: a single video game
controller resting on a dark graphite surface, centered in the frame,
dramatic warm gold rim lighting tracing its edges against a deep black
background, soft bokeh, extreme minimalism, generous empty space above and
below the object, premium editorial product photography mood, shallow
depth of field.

STYLE: premium editorial photography, cinematic, minimalist, dark-mode
brand world. PALETTE: deep black background (#0B0908), graphite surfaces,
warm gold accent (#D4AF37), burnt orange occasional accent. MATERIALS:
matte plastic, brushed metal, subtle leather texture on the surface below.
MOOD: quiet confidence, premium, welcoming.

Aspect ratio 2:3, tall vertical panel covering full viewport height on the
side of a login form.

Negative prompt: no text, no logo, no watermark, no brand names, no
trademarks visible on the controller, no cluttered composition, no neon
cyberpunk aesthetic, no cartoonish rendering, no oversaturation, no low
quality
```

- **Dimensão**: 1200×1800 (2:3)
- **Arquivo sugerido**: `/public/images/login/split-panel.jpg`

### 2.2 — Ilustração de página 404

**Condição**: só relevante se decidirem construir um `not-found.tsx`
próprio (hoje usa o padrão em branco do Next.js).

- **Objetivo**: transformar um momento de erro em algo consistente com a
  marca — nunca genérico, nunca infantil.
- **Storytelling**: um gráfico de preço que "sai do eixo"/se rompe
  suavemente, metáfora visual discreta de "esse caminho não existe" sem
  usar nenhum ícone clichê (sem robozinho triste, sem "404" gigante gerado
  pela IA).
- **Composição**: linha de gráfico dourada que se interrompe no ar, deixando
  um rastro de partículas, contra fundo escuro.

**PROMPT FINAL:**
```
An abstract editorial illustration: a glowing gold line chart that
gracefully breaks apart mid-air, dissolving into fine luminous particles,
floating against a deep black background, sense of an elegant interruption
rather than an error, extreme minimalism, generous negative space above
and below, cinematic single gold light source, fine film grain, shallow
depth of field.

STYLE: premium editorial photography/CG hybrid, cinematic, minimalist,
dark-mode brand world. PALETTE: deep black background (#0B0908), warm gold
accent (#D4AF37), burnt orange occasional accent. MOOD: sophisticated,
calm, "nothing to worry about" — never comedic, never a sad-robot cliché,
never a giant "404" rendered as text.

Aspect ratio 4:5, vertical illustration for a centered error page.

Negative prompt: no text, no numbers, no "404" rendered as an image, no
logo, no watermark, no brand names, no sad robot or broken-screen clichés,
no cluttered composition, no neon cyberpunk aesthetic, no cartoonish
rendering, no oversaturation, no low quality
```

- **Dimensão**: 1200×1500 (4:5)
- **Arquivo sugerido**: `/public/images/errors/404.jpg`

---

## 3. Templates de capa para `/noticias` (por categoria de matéria)

O conteúdo é dinâmico (cada matéria tem tema próprio), então não existe *um*
prompt fixo — mas sem um template, cada capa corre o risco de sair num tom
diferente (o "Frankenstein" que você quer evitar). Proposta: **5 templates
por categoria de conteúdo**, cada um com uma variável `[TEMA]` pra
preencher na hora de publicar. Todos usam a mesma dimensão e o mesmo bloco
de estilo — só muda o objeto/composição central.

Categorias sugeridas (mapeadas ao que a plataforma já cobre: games,
consoles, informática, hardware, periféricos, action figures, mangás/HQs,
TCG):

**3.1 — Notícia/lançamento (games, consoles)**
```
An atmospheric editorial still-life representing [TEMA], symbolized
abstractly through generic gaming hardware silhouettes (no visible brand
logos, no readable text, no recognizable console shape tied to a specific
real product) lit with dramatic warm gold and burnt orange rim lighting
against a deep black background, premium news-editorial photography mood,
shallow depth of field, fine film grain, minimal composition, one clear
subject.
[+ bloco de estilo mestre / negative prompt padrão]
```

**3.2 — Review/análise de produto**
```
An atmospheric editorial still-life symbolizing a critical review of
[TEMA]: a single generic product silhouette (unbranded) placed centered on
a dark graphite pedestal, dramatic gold spotlight from directly above like
a museum display, deep black surrounding space, premium curated retail
photography mood, shallow depth of field, fine grain.
[+ bloco de estilo mestre / negative prompt padrão]
```

**3.3 — Comparativo / "X vs Y"**
```
An atmospheric editorial still-life symbolizing a comparison related to
[TEMA]: two generic unbranded objects positioned symmetrically on opposite
sides of the frame, a thin glowing gold vertical line of light dividing
the composition down the middle, deep black background, premium editorial
photography mood, shallow depth of field, fine grain, balanced symmetrical
composition.
[+ bloco de estilo mestre / negative prompt padrão]
```

**3.4 — Colecionismo / action figures / TCG / mangás e HQs**
```
An atmospheric editorial still-life symbolizing collecting culture related
to [TEMA]: a small curated arrangement of generic unbranded collectible
objects (blank figure silhouette, closed trading card back, or plain book
spine — pick one, never combine more than two), warm gold spotlight, deep
black background, premium curated retail photography mood, shallow depth
of field, minimal composition, no clutter.
[+ bloco de estilo mestre / negative prompt padrão]
```

**3.5 — Tecnologia / informática / hardware**
```
An atmospheric editorial still-life symbolizing technology hardware
related to [TEMA]: a single generic PC component silhouette (graphics
card, mechanical keyboard, or cooling fan — pick one) resting on a dark
brushed-aluminum surface, dramatic cool-to-warm gradient lighting from
graphite to gold, deep black background, premium tech-editorial
photography mood, shallow depth of field, fine grain, minimal composition.
[+ bloco de estilo mestre / negative prompt padrão]
```

- **Dimensões**: card da listagem 1200×675 (16:9) · banner da matéria
  1600×900 (16:9) — mesma arte-base, apenas re-crop entre os dois usos.
- **Arquivo**: não vai para `/public` — é `coverImageUrl` dinâmico por
  artigo no banco (upload direto no admin de notícias).

---

## 4. Expansão do banco geral reutilizável (indo além do pedido)

O documento de "Banco de imagens gerais" já cobre bem lifestyle (categoria
A) e still life (categoria B), mas faltam alguns pilares que o próprio
escopo do projeto lista explicitamente — **informática/hardware**,
**TCG/board games** e **colecionáveis retrô** — sem os quais o catálogo de
imagens fica incompleto quando o marketplace geral (hoje só schema, sem UI)
for ligado. Proponho adicionar estes à biblioteca reutilizável, seguindo
exatamente a mesma lógica das categorias A/B já existentes:

**4.1 — Still life: peça de hardware isolada**
```
Tight macro still-life photograph of a single PC hardware component (a
graphics card or a mechanical keyboard switch cluster) resting on a dark
brushed-metal surface, dramatic warm gold rim lighting tracing its edges,
extreme shallow depth of field, premium tech-editorial product photography,
minimal composition, no legible text, no logos, no visible brand names or
model numbers
```

**4.2 — Still life: mesa de TCG / board game em jogo**
```
Atmospheric still-life photograph of a small arrangement of generic
trading cards with plain unprinted backs and a few wooden board-game
pieces on a dark wood table, warm gold side lighting, shallow depth of
field, premium editorial photography, minimal composition (not a full game
in progress, just a curated arrangement), no legible text, no logos, no
readable card faces
```

**4.3 — Lifestyle: montando um PC / trocando peça de hardware**
```
Natural lifestyle photograph of a person's hands installing a component
inside an open PC case, warm gold work-light illuminating the hands and
component, dark room around them, candid focused moment, shallow depth of
field, no legible text, no logos, no visible brand names on components
```

**4.4 — Lifestyle: mesa de jogo de tabuleiro/TCG entre amigos**
```
Natural lifestyle photograph of a small group of friends around a table
playing a card or board game at night, hands and cards in soft focus,
warm cozy ambient lighting in gold and ember tones, candid unposed moment,
shallow depth of field, no legible text, no logos, no readable card faces
```

**4.5 — Still life: cartucho retrô + console moderno lado a lado**
```
Atmospheric still-life photograph pairing a plain unbranded retro game
cartridge and a small modern game console side by side on a dark wood
surface, warm gold light bridging old and new, soft bokeh background,
premium editorial photography evoking nostalgia without looking outdated,
minimal composition, no legible text, no logos, no visible brand names
```

Essas 5 entram na mesma pasta/estoque do documento de banco geral já
existente — sugiro renomear a seção lá de "Categoria A/B" para incluir
**Categoria C — Hardware & Jogos de Mesa**, mantendo a mesma lógica de
reutilização (qualquer uma pode virar 16:9 trocando só a instrução de
proporção no fim).

---

## 5. Convenção de pastas e nomenclatura (`/public`)

Pra evitar arquivo solto sem padrão, sugiro esta estrutura — já alinhada ao
que existe hoje no código (`scene-image.tsx` com tons `gold`/`ember`/`ink`):

```
/public/images/
  system/
    og-cover.jpg
  hero/
    tile-back.jpg
    tile-main.jpg
    tile-accent.jpg
  universes/
    naruto.jpg, one-piece.jpg, marvel.jpg, star-wars.jpg, pokemon.jpg, dragon-ball.jpg
  hype-zone/
    banner.jpg
  mascots/
    runner.jpg, robot.jpg, space-hunter.jpg, ninja.jpg, explorer-creature.jpg
  monitoramento/
    empty-state.jpg
  conta/
    empty-state.jpg
  login/
    split-panel.jpg (condicional)
  errors/
    404.jpg (condicional)
  stock/
    lifestyle/  (A1–A10, mais A11–A12 novas de hardware/TCG)
    stilllife/  (B1–B7, mais B8–B9 novas de hardware/TCG)
```

Capas de notícia **não** entram em `/public` — ficam no banco de dados via
upload no admin, já que são por artigo.

---

## 6. Critério de curadoria (antes de aprovar qualquer imagem)

Checklist rápido pra rodar em cada imagem antes de salvar, pra manter a
consistência entre todas (isso é o que realmente evita o efeito
Frankenstein, mais do que o prompt em si):

1. **Um assunto central só?** Se tiver 2+ elementos competindo por atenção, descartar.
2. **Paleta bate?** Preto/grafite dominante, dourado como accent principal, laranja só como pontuação — nunca o inverso.
3. **Tem texto, número ou logo visível, mesmo que borrado?** Descartar.
4. **Parece foto de banco de imagem genérica?** Se sim, gerar de novo com mais especificidade de luz/ângulo.
5. **Combina com o "vizinho"?** Antes de aprovar, olhar lado a lado com a última imagem aprovada da mesma seção — se destoar de iluminação/tom, refazer.
6. **Espaço negativo suficiente?** Principalmente nas imagens condicionadas a receber texto por cima (OG image, estados vazios).

---

## 7. Recomendações adicionais (indo além do pedido original)

- **Prioridade real**: gere primeiro a imagem de OG (seção 1.1). É a única
  lacuna que afeta a marca *fora* do site — todo compartilhamento em
  WhatsApp/Discord/X hoje sai sem preview nenhum, o que passa despercebido
  no dia a dia mas pesa bastante em CAC/viralização orgânica.
- **Referência visual cruzada**: depois de aprovar as 3 primeiras imagens
  novas (seção 1), vale colar essas 3 como *imagem de referência* nos
  prompts seguintes (várias ferramentas de geração aceitam isso) — trava a
  consistência de tom muito melhor do que só repetir o texto do prompt.
- **Favicon / ícones de app**: não é gerado por IA generativa de imagem
  (deve nascer direto da logomarca vetorial que vocês já têm em `.ai`/
  `.svg`), mas é uma lacuna parecida com a do OG image — vale entrar no
  próximo sprint de identidade visual (Fase 4 do roadmap) junto com a
  migração de paleta.
- **Pipeline futuro de capas de notícia**: quando `/noticias` sair do
  "em construção", os 5 templates da seção 3 podem virar prompt gerado
  automaticamente por IA a partir da categoria + título do artigo no
  momento da publicação — reduz fricção editorial e é coerente com o
  próprio DNA de "inteligência de dados aplicada" da marca. Registrar como
  candidato de roadmap, não bloqueia nada hoje.
