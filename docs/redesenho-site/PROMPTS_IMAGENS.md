# Prompts de imagem para a landing nova (Designer de Marca, 2026-11-13)

Parecer independente. Nenhuma imagem foi gerada, copiada ou movida. Quem gera é o operador no ChatGPT; quem salva e liga no código é o engenheiro-frontend, com o grep "um arquivo, um uso" antes de cada ligação.

## Como usar (instruções em português)

1. Em cada conversa nova do ChatGPT, cole primeiro o BLOCO MESTRE (secção A) e só depois o prompt da imagem. Um prompt por imagem; gere 3 variações e escolha a mais sóbria.
2. O ChatGPT só entrega 1536x1024 (paisagem), 1024x1536 (retrato) ou 1024x1024. Por isso o campo "gerar em" abaixo usa esses tamanhos. A faixa larga do site (21:9) é corte da paisagem: o código corta com `object-cover`, então mantenha o assunto dentro dos 60% centrais da altura (regra repetida em cada prompt).
3. Salvar como PNG em `public/images/<pasta>/<nome>` exatamente como indicado. Antes de ligar no código: `grep -rF "<caminho>" src` deve dar 0 usos.
4. Conferência de aceite (todas): sem texto desenhado, sem logo, sem marca de console, sem rosto reconhecível, sem número legível, fundo quase preto, dourado e laranja como únicas cores quentes. Se o ChatGPT desenhar qualquer letra, descarte e gere de novo; não "corrija" no editor.

## A. Bloco mestre (colar antes de todo prompt da secção B)

```
STYLE: Premium dark cinematic product still life, editorial photography look with subtle illustrated texture. Background almost pure black (#0B0908) fading to deep warm graphite. Single dominant warm key light in gold (#D4AF37) with a faint ember-orange (#E8721C) kicker; one cool or colored rim light only where the prompt says so. Shallow depth of field, soft haze, fine film grain, dark glossy surface with a subtle reflection. Minimal composition, one clear subject, large areas of calm dark negative space. Straight rectilinear framing, hard right-angle geometry, no rounded frames, no vignettes with rounded corners.
NEGATIVE: text, letters, numbers, watermark, logo, brand name, console brand design, platform symbols, game characters, licensed characters, faces, people, neon cyberpunk, purple-blue gradient, 3D cartoon, mascot, stock-photo look, clutter, rounded UI cards, floating glowing icons, fake screenshots, readable screen content.
```

Por que este bloco e não o do `docs/banco-mestre-prompts-imagens.md`: aquele bloco pede ilustração de quadrinho com roxo e pôr-do-sol, que é o estilo de `/sobre` e `/universos`. A única imagem existente no estilo "premium dark" da skill padrao-visual-egeek é `public/images/home/hero-watermark.png`. A landing nova usa esse estilo; o quadrinho fica para as páginas editoriais.

## B. Imagens que FALTAM (novas)

### IMG-01 Faixa PlayStation
- Onde: faixa "PlayStation" da landing (fundo da faixa, texto e vitrine por cima, à esquerda). Prioridade P1.
- Proporção: 3:2 gerado, usado em 21:9 (desktop) e 4:3 (mobile). Gerar em 1536x1024.
- Salvar em: `public/images/platforms/faixa-playstation.png`
- Prompt (colar depois do bloco mestre):
```
A single generic modern wireless gamepad with a neutral original design (no brand shapes, no symbols on the buttons, plain dark matte buttons) standing slightly angled on a dark glossy surface, placed in the RIGHT third of the frame. Cool cobalt-blue rim light (#2F5BD3) sculpting its outline from behind, with a faint gold key light from the upper left. The LEFT 55% of the frame stays almost empty dark space with soft haze (text will be placed there). Keep the subject inside the central 60% of the image height. Nothing else in the scene.
```
- NÃO fazer: o desenho do controle da Sony, os quatro símbolos, o logo, o azul chapado de fundo, mascote, personagem, luz azul espalhada por toda a imagem (o azul é só reflexo de contorno).

### IMG-02 Faixa Xbox
- Onde: faixa "Xbox". P1.
- Proporção: 3:2 gerado, uso 21:9 e 4:3. Gerar em 1536x1024.
- Salvar em: `public/images/platforms/faixa-xbox.png`
- Prompt:
```
A single generic modern wireless gamepad with a neutral original design (no brand shapes, no sphere logo, plain dark matte buttons) resting on a dark glossy surface, placed in the RIGHT third of the frame, seen from slightly above. Muted emerald-green rim light (#3E9B4F, low saturation) outlining the edges, faint gold key light from the upper left. The LEFT 55% of the frame is calm dark negative space with soft haze. Keep the subject inside the central 60% of the image height. Nothing else in the scene.
```
- NÃO fazer: esfera ou "X" da marca, controle com formato idêntico ao oficial, verde neon, verde de fundo chapado, qualquer aspecto de "ok/sucesso" (o verde do site também significa queda de preço, então aqui ele é só contorno discreto).

### IMG-03 Faixa Nintendo
- Onde: faixa "Nintendo". P1.
- Proporção: 3:2 gerado, uso 21:9 e 4:3. Gerar em 1536x1024.
- Salvar em: `public/images/platforms/faixa-nintendo.png`
- Prompt:
```
A generic hybrid handheld game device, original neutral design (no brand shapes, no detachable-controller look-alike), screen dark and blank, standing on its edge on a dark glossy surface in the RIGHT third of the frame, next to one small blank game cartridge case with no label art. Warm red rim light (#D6343E, slightly desaturated) outlining the edges, faint gold key light from the upper left. The LEFT 55% of the frame is calm dark negative space. Keep everything inside the central 60% of the image height.
```
- NÃO fazer: Joy-Con, tela com jogo, personagem, cartucho com arte, logo, caixa de jogo com capa, vermelho chapado de fundo, vermelho que pareça alerta de queda.

### IMG-04 Faixa PC
- Onde: faixa "PC" (plataforma que hoje não tem imagem nenhuma). P1.
- Proporção: 3:2 gerado, uso 21:9 e 4:3. Gerar em 1536x1024.
- Salvar em: `public/images/platforms/faixa-pc.png`
- Prompt:
```
A compact mechanical keyboard lying diagonally on a dark glossy desk next to a plain gaming mouse, both unbranded with blank keycaps, placed in the RIGHT third of the frame. Cold steel rim light (#8FA6B5) along the edges, faint gold key light from the upper left. The LEFT 55% of the frame is calm dark negative space with soft haze. Keep the subject inside the central 60% of the image height.
```
- NÃO fazer: teclas com letra legível, luz RGB arco-íris, monitor com tela, logo de fabricante, torre com luzes, estética cyberpunk. Atenção: `hero-watermark.png` já tem teclado e mouse; esta imagem deve ser claramente outra composição (sem cadeira, sem gráfico, sem fone).

### IMG-05 Faixa Acessórios
- Onde: faixa "Acessórios" (fones, controles extras, cadeira). Substitui `platforms/acessorios.png` (mascote sobre roxo chapado). P1.
- Proporção: 3:2 gerado, uso 21:9 e 4:3. Gerar em 1536x1024.
- Salvar em: `public/images/platforms/faixa-acessorios.png`
- Prompt:
```
A pair of over-ear gaming headphones, unbranded, standing upright on a small matte stand on a dark glossy surface, with one plain gamepad lying in front of it, in the RIGHT third of the frame. Gold and ember-orange rim light (#D4AF37 and #E8721C) outlining both objects, no other color. The LEFT 55% of the frame is calm dark negative space. Keep the subject inside the central 60% of the image height.
```
- NÃO fazer: cadeira gamer, mascote, personagem de roupa de mecânico (como no arquivo atual), roxo, logo no fone, mais de dois objetos.

### IMG-06 Bloco Geek Plus (cabeçalho)
- Onde: bloco de destaque do Geek Plus na landing (a seção `SecaoPlusHome` hoje não tem imagem). P1.
- Proporção: 3:2 gerado, uso 21:9. Gerar em 1536x1024.
- Salvar em: `public/images/plus/plus-hero.png`
- Prompt:
```
A neat horizontal row of six small unbranded objects on a long dark glossy shelf, evenly spaced, each lit by the same warm gold key light: a small matte 3D-printed geometric figure, a closed hardcover book with a blank spine, a compact blank-faced smart device, a ceramic mug, a plain pair of running shoes seen from the side, a small plain desk gadget. Dark background, shallow depth of field, ember-orange faint kicker from behind. Objects occupy the central 50% of the image height; the top and bottom are dark negative space.
```
- NÃO fazer: caixa de produto com marca, logo de tênis, texto na lombada do livro, etiquetas de preço, selo "VIP", moedas, troféus, painéis de pontos ou nível (o arquivo `home/newsletter-vip-club.png` faz exatamente isso e não serve: tem texto desenhado e números de nível que parecem dado de usuário).

### IMG-07 Faixa de Notícias
- Onde: cabeçalho da seção "Últimas notícias" da landing. P2.
- Proporção: 3:2 gerado, uso 21:9. Gerar em 1536x1024.
- Salvar em: `public/images/noticias/faixa-editorial.png`
- Prompt:
```
Editorial still life of a dark writing desk seen from slightly above: a closed matte laptop, a notebook with blank pages, a pen, and one plain gamepad, lit by a single warm gold desk lamp, deep black surroundings, ember-orange kicker from the left. Objects in the central 55% of the image height, calm dark negative space above and below.
```
- NÃO fazer: manchete, jornal com letras, colagem de recortes, roxo, personagens, rosto de jornalista, tela com notícia. O `noticias/header-collage.png` existente (colagem roxa com carro, skate, astronauta, futebol) não serve: não é de games e quebra a paleta.

### IMG-08 Imagem de compartilhamento (Open Graph) premium dark
- Onde: `src/app/layout.tsx` (og:image). Substitui `system/og-cover.png` (cena retrô roxa sem marca, 1536x1024, fora do formato 1,91:1). P2.
- Proporção: gerar 3:2 1536x1024 e cortar para 1200x630 (1,91:1) mantendo o centro. O nome ESPAÇO GEEK 86 e o lema entram por composição de design (HTML/Figma), NUNCA pela IA.
- Salvar em: `public/images/system/og-cover-dark.png` (após ligar, remover o antigo)
- Prompt:
```
Wide cinematic dark scene: a long dark glossy desk receding into the distance, a single plain gamepad on the right third, thin gold luminous line chart floating faintly in the dark air behind it (abstract, no axes, no numbers, no labels), gold key light and a faint ember glow. The LEFT 50% of the frame is empty dark space reserved for a wordmark that will be added later. Subject inside the central 60% of the image height.
```
- NÃO fazer: texto, logo, o nome da marca, números no gráfico, roxo.

### IMG-09 Capas dos 6 departamentos Plus (OPCIONAL, P3)
Hoje os cartões Plus são só ícone (`cartao-loja-plus.tsx`, decisão de design anterior). Só gerar se o dono aprovar capas nos cartões. Cada uma: 4:3, gerar em 1536x1024, bloco mestre antes, destino `public/images/plus/dept-<slug>.png`.

| Arquivo | Assunto (usar no lugar de [SUBJECT]) |
|---|---|
| dept-impressao-3d.png | a small matte 3D-printed geometric sculpture with visible fine layer lines on a dark surface |
| dept-tecnologia.png | a plain unbranded compact desk gadget and a coiled cable, dark surface |
| dept-livros.png | two closed hardcover books with blank spines stacked, one open page fan with no readable text |
| dept-casa.png | a plain ceramic pitcher and a folded textile on a dark shelf |
| dept-eletronicos.png | a plain unbranded compact speaker with blank grille, dark surface |
| dept-esporte.png | a plain unbranded running shoe seen from the side and a small water bottle, dark surface |

Prompt-modelo (colar depois do bloco mestre):
```
[SUBJECT], centered in the frame, warm gold key light with a faint ember-orange kicker, deep black background, shallow depth of field, large dark negative space around the subject, no text, no logo, no brand, no packaging.
```
- NÃO fazer: caixa de produto, etiqueta, logo, mão ou rosto, mais de um assunto.

## C. Substitutas por repetição ou violação (imagens que EXISTEM mas não podem ficar)

### Pares de arquivos com conteúdo idêntico (DADO REAL, `md5sum` em `public/images`)
| Par idêntico | Situação | Ação |
|---|---|---|
| `sobre/aluguel-tv.png` = `sobre/quarto-retro.png` | os dois estão ligados em `src/app/(shop)/sobre/page.tsx` (linhas 168 e 291) | manter `aluguel-tv` (alt "crianças jogando numa TV de tubo" bate com a cena) e gerar substituta R-01 para `quarto-retro` |
| `noticias-hub/esports-event.png` = `sobre/snes-caixa.png` | `esports-event` está ligada em `inteligencia-gamer/page.tsx:85`; `snes-caixa` tem 0 usos | `esports-event` mostra a caixa do Super Nintendo e não "arena de esports": gerar R-02; apagar `snes-caixa` (órfã) |
| `categorias/gamer-collage.png` = `sobre/pilha-controles.png` | os dois com 0 usos em `src` | apagar um dos dois depois de confirmar que nenhum dado do banco os cita |

### R-01 Substituta de `sobre/quarto-retro.png`
- Onde: `sobre/page.tsx:291`, secção "Justificativa e inteligência de dados". O texto trata de dados; a imagem atual é de crianças na TV (igual a outra da mesma página).
- Estilo: quadrinho do Banco Mestre (`docs/banco-mestre-prompts-imagens.md`), porque `/sobre` inteira é nesse estilo. Colar antes o "Bloco de Estilo Mestre" e o "Negative prompt" daquele documento (NÃO o bloco A deste arquivo).
- Proporção: 4:3. Gerar em 1536x1024. Salvar em `public/images/sobre/justificativa-dados.png`.
- Prompt:
```
Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of an empty late-night home office: a desk with a wall of pinned paper sheets connected by red string, a monitor showing an abstract line chart without numbers, a stack of printed reports, a desk lamp, a game controller resting on the desk, a window with a dusk skyline. No people. Warm sunset-toned color grading (gold, orange, deep purple shadows), richly detailed environment. No text, no logos, no readable numbers.
```
- NÃO fazer: crianças, TV de tubo, console, rosto, palavra em post-it ou parede.

### R-02 Substituta de `noticias-hub/esports-event.png`
- Onde: `inteligencia-gamer/page.tsx:85`. Hoje exibe a caixa do Super Nintendo com logo e texto de terceiros e a tag "INSERT COIN". Viola "sem logo de terceiros, sem texto desenhado".
- Estilo: quadrinho do Banco Mestre (mesmo procedimento de colar o bloco mestre do outro documento). Proporção 4:3. Gerar em 1536x1024. Salvar em `public/images/noticias-hub/arena-esports.png`.
- Prompt (o 13 do Banco Mestre, endurecido):
```
Detailed hand-drawn comic/graphic-novel illustration, bold black ink linework with cross-hatched shading, of a packed arena crowd seen from behind with raised arms, silhouetted against a huge blank glowing stage screen in warm gold and orange light, wide stage with truss lights. Dramatic sunset-toned color grading (gold, orange, deep purple), sense of scale and energy. No text, no logos, no banners, no readable screen content, no recognizable faces.
```
- NÃO fazer: placar, logotipo de time, camisa com nome, telão com imagem de jogo.

### R-03 Substituta de `hype-zone/banner.png`
- Onde: `src/app/(shop)/hype-zone/page.tsx:103`. A imagem atual tem "SUPER NINTENDO ENTERTAINMENT SYSTEM", selo "Official Nintendo Seal of Quality", texto de caixa e uma revista com "GEEK DEALS / OS MELHORES PREÇOS PRA VOCÊ!". Logo de terceiro e texto desenhado: viola a regra. Também é paisagem 1536x1024, enquanto o manifesto prevê 4:5.
- Estilo: bloco A (premium dark). Proporção 4:5. Gerar em 1024x1536 e cortar 4:5 (1024x1280). Salvar em `public/images/hype-zone/vitrine-lancamento.png`.
- Prompt:
```
A single sealed plain matte-black collector box with a thin gold edge line and no artwork, standing on a dark glossy plinth inside a glass display case, lit from above by one dramatic warm gold spotlight with long soft shadows, ember-orange faint kicker. Subject centered in the central 70% of the image, dark negative space above. Portrait composition.
```
- NÃO fazer: console desenhado, selo, texto na caixa, moldura de vitrine com logo, fita, laço.

## D. Imagens existentes que NÃO devem entrar na landing (para ninguém reaproveitar por engano)

| Arquivo | Motivo |
|---|---|
| `home/newsletter-vip-club.png` | texto desenhado ("GEEK POINTS", "PASSE VIP", "LVL 28", "XP 15.680 / 25.000") parece dado real de usuário; viola "sem dado fake" na aparência |
| `noticias-hub/news-xmen.png` | pôster falso com título, data "Summer 2024" e créditos inventados, parece notícia verdadeira |
| `hero/tile-main.png` (0 usos) | pôsteres e mascotes de franquias de terceiros (Street Fighter, Zelda, Metroid, Mario, Donkey Kong, Yoshi) e caixas com nome |
| `platforms/playstation.png`, `xbox.png`, `nintendo.png`, `acessorios.png` | só são referenciadas por `PlatformShowcase`, que nenhuma página importa; mascote sobre cor chapada saturada (azul, verde, vermelho, roxo) fora da paleta; o personagem do PlayStation lembra o design de um herói de terceiros com canhão-controle (risco de derivação) |
| `noticias/header-collage.png`, `ofertas/header-collage.png` (0 usos) | colagem roxa com assuntos sem relação com games |
| `home/painel-analitico-86-light.png` | é um JPEG com extensão .png; confirmar o tipo servido ou renomear |

## E. Resumo para o operador

- Imagens novas obrigatórias (P1): IMG-01 a IMG-06 (6 imagens).
- Importantes (P2): IMG-07, IMG-08, R-03.
- Correção de repetição e de violação (P1 por regra inegociável): R-01, R-02.
- Opcional (P3): IMG-09 (6 capas de departamento).
- Total mínimo para a Black Friday: 6 + 3 + 2 = 11 imagens; com o opcional, 17.
- Reaproveitamento sem gerar nada: `home/hero-watermark.png` vai para o topo da landing (hoje está na `StatementBand`, que deixa de existir na versão nova; mover, nunca duplicar). Cartões do quadro de destaques usam a foto do produto (`contain`), sem imagem decorativa.
