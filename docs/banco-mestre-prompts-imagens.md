# Banco Mestre de Prompts de Imagem — Espaço Geek 86 (Ilustração Retrô Estilo Quadrinho)

> Documento de trabalho consolidado para gerar as ilustrações da plataforma no ChatGPT (DALL-E 3).

**Nota de correção (2026-07-25)**: a versão anterior deste documento descrevia um estilo de "3D
concept art / render estilizado com fundo preto liso" — mas, conferindo as imagens REAIS já
publicadas no site (`public/images/sobre/hero-geracoes.png`,
`public/images/categorias/gamer-collage.png`, `public/images/categorias/hero-gamer-panel.png`,
`public/images/noticias/header-collage.png`), a identidade visual de verdade é outra: **ilustração
de linha desenhada à mão, estilo quadrinho/graphic novel, com traço preto grosso, cross-hatching e
paleta quente de pôr-do-sol** — não um render 3D minimalista. Todos os 14 prompts abaixo (os 11
originais + os 3 do hub de Notícias) foram reescritos pra bater com o estilo real. Se algum dos 11
originais já tiver sido gerado no estilo antigo, considerar regenerar.

---

## 0. Bloco de Estilo Mestre (colar antes de QUALQUER prompt abaixo, numa mensagem própria ou junto)

```
STYLE: Detailed hand-drawn comic/graphic-novel illustration. Bold black ink outlines, cross-hatched shading, rich painterly texture — not a flat vector, not a 3D render, not a photograph. Warm sunset-toned color grading: gold (#D4AF37), burnt orange (#E8721C), deep purple/indigo shadows. Contrast between warm light sources (lamps, sunsets, CRT glow) and cool blue-purple ambient shadow. Richly detailed, cluttered, lived-in environments — never an empty minimalist background.
RETRO-TONE: For content about the past — nostalgic 80s/90s gaming technology, bedrooms, CRT monitors, cartridges, vintage electronics. For content about the CURRENT market/present day — same illustration technique and palette, but a modern-day scene instead of retro gear.
```

```
NEGATIVE PROMPT: 3D render, CGI, matte plastic shader, photorealistic, real photography, live-action, flat 2D vector art, flat cartoon, minimalist empty background, plain solid background (except where a prompt explicitly asks for one, for masking purposes), childish style, text, logo, watermark, readable numbers, visible UI text, brand names.
```

---

## 📋 Os 14 Prompts para o ChatGPT

### 1. Imagem de Capa do Hero / Mosaico (Home)
* **Contexto**: Painel principal do hero representando a evolução dos games.
* **Proporção**: `16:9`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a classic 16-bit retro video game console and its cartridge resting on a wooden desk, thin glowing gold and burnt-orange energy trails flowing around the console like rising chart lines. Warm sunset-toned color grading (gold, orange, deep purple shadows), cinematic dramatic lighting, richly detailed environment. No text, no logos.`

### 2. Manifesto / Quem Somos (Home/Sobre)
* **Contexto**: Ilustração editorial para acompanhar a missão e visão da marca.
* **Proporção**: `4:3`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of two young friends sitting on the floor in a cluttered 90s bedroom in front of a glowing CRT TV, surrounded by game cartridges and posters on the wall. Warm sunset-toned color grading (gold, orange, deep purple shadows), cozy nostalgic candid mood, richly detailed environment. No text, no logos.`

### 3. Inteligência de Mercado / Gráficos
* **Contexto**: Gráficos dinâmicos na home remetendo a dados e computação antiga.
* **Proporção**: `16:9`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a vintage 80s computer terminal with a curved CRT monitor glowing green and gold, stylized trend lines and grid charts displayed on the screen, cluttered desk with cables and disks. Warm sunset-toned color grading (gold, orange, deep purple shadows), retro-futuristic data mood, richly detailed environment. No text, no logos, no readable numbers.`

### 4. Enquete & Pesquisa de Satisfação
* **Contexto**: Bloco de votação de hábitos gamer com a comunidade.
* **Proporção**: `3:2`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a pair of hands holding a classic 8-bit handheld game console, its screen glowing warm gold light onto the thumbs, cozy dim room in the background. Warm sunset-toned color grading (gold, orange, deep purple shadows), nostalgic analog gaming mood, richly detailed environment. No text, no logos.`

### 5. Hardware & Informática (Stock)
* **Contexto**: Capa para artigos sobre componentes clássicos e tecnologia.
* **Proporção**: `16:9`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a vintage 90s computer sound card and microchips resting on a circuit board, copper and gold traces glowing under warm dramatic light. Warm sunset-toned color grading (gold, orange, deep purple shadows), premium tech-editorial mood, richly detailed environment. No logos, no text.`

### 6. Hub de Universos & Franquias
* **Contexto**: Representação das categorias de sagas e universos catalogados.
* **Proporção**: `3:2`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a collection of 90s geek collectibles — a VHS tape case, a retro game cartridge, and an old comic book — arranged on a wooden table. Warm sunset-toned color grading (gold, orange, deep purple shadows), cozy nostalgic mood, richly detailed environment. No text, no logos.`

### 7. Hype Zone (Drops e Lançamentos)
* **Contexto**: Banner lateral do card de contagem regressiva para lançamentos.
* **Proporção**: `4:5`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of an unopened rare 90s game console box with retro geometric graphics, displayed inside a glass case lit by a dramatic warm spotlight from above, long shadows. Warm sunset-toned color grading (gold, orange, deep purple shadows), premium collector-showcase mood, richly detailed environment. No text, no logos.`

### 8. Coluna Editorial (Opiniões e Notícias)
* **Contexto**: Capa para artigos opinativos e colunistas.
* **Proporção**: `16:9`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of an early-90s desktop calculator and a vintage mechanical keyboard on a wooden desk, a glowing amber CRT screen visible in the background casting warm light. Warm sunset-toned color grading (gold, orange, deep purple shadows), quiet retro office mood, richly detailed environment. No text, no logos.`

### 9. Colecionáveis & Figures (Marketplace)
* **Contexto**: Capa para a categoria de action figures clássicos.
* **Proporção**: `3:2`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a vintage 80s action figure still sealed in its original blister card packaging, resting on a wooden pedestal lit by a warm spotlight from above. Warm sunset-toned color grading (gold, orange, deep purple shadows), premium toy-collector mood, richly detailed environment. No text, no logos.`

### 10. TCG & Board Games (Marketplace)
* **Contexto**: Capa de categoria para card games e jogos de mesa.
* **Proporção**: `3:2`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of nostalgic 90s trading cards and wooden board-game pieces scattered on a mahogany table, warm side-lighting casting long shadows. Warm sunset-toned color grading (gold, orange, deep purple shadows), cozy dim-room mood, richly detailed environment. No text, no logos.`

### 11. Recorte de Máscara (Controle Nintendo 64)
* **Contexto**: Foto interna para máscara em formato de cruz/D-pad — este único caso precisa de fundo liso de propósito (é pra recorte/máscara, não pra exibir como está).
* **Proporção**: `1:1`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a pair of hands holding a classic grey three-pronged Nintendo 64 controller, focused on the grip with yellow C-buttons and red Start button visible. Warm gold rim lighting on the controller edges, subtle cool tone on the skin. Solid flat dark background for clean masking, high contrast, richly detailed line work. No text, no logos.`

### 12. Setup Gamer Moderno (Hub de Notícias — mercado gamer)
* **Contexto**: Primeira imagem do mosaico documental no hub "Notícias e Pesquisas" (`/noticias`), abaixo do bloco de estatísticas de mercado — representa o gamer de hoje.
* **Proporção**: `4:3`
* **Salvar em**: `public/images/noticias-hub/gamer-setup.jpg`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a modern gaming den at night: a young adult silhouette seated at a desk in front of a curved monitor and RGB-lit PC tower, warm desk lamp glow mixing with cool blue-purple screen light, shelves with figures and consoles in the background, cozy cluttered detail. Warm sunset-toned color grading (gold, orange, deep purple shadows), cinematic mood, richly detailed environment. No text, no logos, no readable screen content.`

### 13. Evento de Esports / Torcida (Hub de Notícias — mercado gamer)
* **Contexto**: Segunda imagem do mosaico — representa a força competitiva e o público gamer.
* **Proporção**: `4:3`
* **Salvar em**: `public/images/noticias-hub/esports-event.jpg`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a packed arena crowd cheering with raised arms, silhouetted against a huge glowing stage screen in warm gold and orange light. Dramatic sunset-toned color grading (gold, orange, deep purple), sense of scale and energy, richly detailed crowd texture. No text, no logos, no readable screen content.`

### 14. Análise de Dados de Mercado (Hub de Notícias — mercado gamer)
* **Contexto**: Terceira imagem do mosaico — representa a inteligência de dados por trás da pesquisa de mercado.
* **Proporção**: `4:3`
* **Salvar em**: `public/images/noticias-hub/data-analysis.jpg`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of an analyst at a cluttered desk at night studying glowing bar charts and line graphs on a monitor, warm desk lamp light mixing with cool chart-glow light, papers and coffee mug on the desk, cozy detailed home-office scene. Warm sunset-toned color grading (gold, orange, deep purple shadows), cinematic mood. No readable numbers, no text, no logos.`

### 15. Observatório Gamer — Pesquisadores e Analistas (Home)
* **Contexto**: Ilustração de destaque da seção "Observatório Gamer" na Home (teaser pro portal de
  pesquisa/inteligência), ao lado do texto sobre pesquisas empíricas/teóricas/descritivas.
* **Proporção**: `16:9`
* **Salvar em**: `public/images/home/observatorio-gamer-hero.png`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of two researchers/data analysts in a modern office at night, studying floating holographic-style bar charts and line graphs projected above a cluttered desk full of papers, a laptop and a game controller resting nearby. Warm sunset-toned color grading (gold, orange, deep purple shadows), cinematic focused mood, richly detailed environment. No text, no logos, no readable numbers.`

### 16. Painel Analítico "86" — Colagem para Máscara de Texto (Home)
* **Contexto**: Preenche o glifo grande do número "86" (mesma técnica de `gamer-collage.png`/
  `geek-collage.png` — a imagem vira o "recheio" do texto via `background-clip: text`, não uma foto
  normal) na seção "Painel Analítico" da Home, ao lado do `PriceChartsShowcase`.
* **Proporção**: `1:1` (quadrada — cobre bem qualquer glifo largo)
* **Salvar em**: `public/images/home/painel-analitico-86.png`
* **Técnica**: colagem densa (mesmo espírito de `gamer-collage.png`), não cena única — precisa ter
  contraste e detalhe espalhados por toda a moldura pra ficar legível recortado dentro dos traços
  grossos do número.
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel collage illustration, bold black ink linework with cross-hatched shading, densely packed mosaic of market-research and data-engineering elements: a magnifying glass over a spreadsheet, a rising bar chart, a clipboard with a checklist, a desktop monitor showing a line graph, a game controller, a calculator, stacked research reports. Warm sunset-toned color grading (gold, orange, deep purple shadows), high contrast, richly detailed edge-to-edge composition with no empty space. No text, no logos, no readable numbers.`

### 17. Mercado Gamer em Números (Home)
* **Contexto**: Ilustração da seção "O mercado gamer em números" na Home (movida de `/noticias` pra
  cá, ao lado do Painel Analítico) — acompanha as estatísticas reais de faturamento/jogadores.
* **Proporção**: `4:3`
* **Salvar em**: `public/images/home/mercado-gamer-numeros.png`
* **Prompt**:
  > `Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a world map made of glowing gold and orange light points representing players connected worldwide, with a modern gaming controller and rising bar chart silhouette overlaid in the foreground. Warm sunset-toned color grading (gold, orange, deep purple shadows), cinematic global-scale mood, richly detailed environment. No text, no logos, no readable numbers.`

---

## Nota à parte — banners tipo colagem (mosaico com vários itens)

`public/images/categorias/gamer-collage.png`, `geek-collage.png` e
`public/images/noticias/header-collage.png` usam uma técnica diferente (colagem de vários itens
lado a lado — traço mais gráfico/cartaz, ou recorte de papel/jornal vintage com fita e clipes). Não
fazem parte deste banco de 14 (que é pra cena única, um assunto por imagem) e não precisam ser
regenerados — só documentando aqui pra não confundir com o estilo dos 14 acima na hora de revisar.
