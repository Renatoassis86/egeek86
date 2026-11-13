# Prompts das fotos dos cartões do Espaço Geek Plus (versão com itens reais)

Versão de 2026-11-13, pedida pelo dono: objetos que existem de verdade e que o público geek reconhece (action figures, placa de vídeo, mangás, air fryer, TV, chuteira). Esta versão **substitui** a anterior (engrenagem, carretel, chaleira genérica), que foi recusada.

Quem gera: o dono, no ChatGPT, um prompt por vez. Quem salva e liga no código: o engenheiro-frontend, depois do `git grep` de "um arquivo, um uso".

## Como usar

1. Cole **um prompt por vez** no ChatGPT, pedindo formato horizontal **3:2 (1536x1024)**.
2. Gere **3 variações** de cada e escolha a mais escura e sóbria.
3. Exporte em **WebP 1200x800**, qualidade 75 a 82, menos de 150 KB, no nome indicado em cada item.
4. Os seis devem parecer uma família: mesma luz dourada vinda do alto à esquerda, mesmo preto de fundo, mesmo tamanho aparente do objeto.

## Atenção: marcas e personagens

- Estes prompts citam personagens (Homem-Aranha, Darth Vader, Grogu, Batman) e produtos (NVIDIA, Samsung, Sony, Nike, Adidas, Philips, JBL etc.) **só para você ver como ficaria**.
- O ChatGPT pode recusar, trocar por algo parecido ou errar o desenho. Se acontecer, descarte e gere de novo, ou peça a troca do item.
- **Uso comercial:** logotipo de marca e personagem protegido numa loja pode render reclamação dos donos dos direitos. A decisão final é sua. Se for publicar, apague os nomes entre parênteses e deixe só a descrição do produto.

---

## 1. Impressão 3D → `public/images/plus/plus-impressao-3d.webp`

```
Generate a photorealistic image, horizontal 3:2 (1536x1024). Premium dark product photography, modern and current, real objects, shot like a professional catalog still life. Matte-black environment, background #0B0908 deepening to warm graphite #161311, dark stone surface with a faint reflection. One dominant warm gold-amber key light (#D4AF37) from the upper left plus a faint ember-orange (#E8721C) rim light from behind; cream highlights only on edges. Muted natural material colors only, high contrast, deep blacks, shallow depth of field, crisp detail, very fine film grain. Straight rectilinear framing, no rounded frames. LEFT third of the frame and BOTTOM 25% stay calm dark negative space; keep the subject in the central 70% of the height, slightly right of center.

SUBJECT: Real 3D-printed geek collectibles, finished and hand-painted, on a dark stone base. In the foreground three 3D-printed action figures with visible fine layer lines on the unpainted parts and muted painted details: Spider-Man in a crouching pose, Darth Vader standing with his cape, and Grogu (Baby Yoda) sitting. Behind them, slightly blurred, a real enclosed desktop FDM 3D printer (generic black box with a glass door) with another figure mid-print on the bed, and two filament spools on the side. Gold-amber light skimming across the figures.

AVOID: text, letters, numbers, people, hands, fingers, retro look, neon, RGB light, cartoon style, clutter, bright white background, rounded frames, a brand name on the printer.
```

## 2. Tecnologia → `public/images/plus/plus-tecnologia.webp`

```
Generate a photorealistic image, horizontal 3:2 (1536x1024). Premium dark product photography, modern and current, real objects, shot like a professional catalog still life. Matte-black environment, background #0B0908 deepening to warm graphite #161311, dark glossy surface with a faint reflection. One dominant warm gold-amber key light (#D4AF37) from the upper left plus a faint ember-orange (#E8721C) rim light from behind; cream highlights only on edges. Muted natural material colors only, high contrast, deep blacks, shallow depth of field, crisp detail, very fine film grain. Straight rectilinear framing, no rounded frames. LEFT third of the frame and BOTTOM 25% stay calm dark negative space; keep the subject in the central 70% of the height, slightly right of center.

SUBJECT: Real PC hardware and peripherals. In the foreground a NVIDIA GeForce RTX 4090 Founders Edition style graphics card lying at a slight diagonal, next to a Samsung 990 Pro style M.2 NVMe SSD with its black heatsink and two Corsair Vengeance style DDR5 memory sticks. Behind them, slightly blurred, a Logitech G Pro style wireless gaming mouse and a compact mechanical keyboard with blank black keycaps. Gold-amber light sliding along the fan blades, the heatsink and the memory contacts.

AVOID: readable text on any part, RGB or rainbow lighting, purple-blue gradient, cyberpunk neon, retro look, people, hands, fingers, tangled cables, bright white background, rounded frames.
```

## 3. Livros → `public/images/plus/plus-livros.webp`

```
Generate a photorealistic image, horizontal 3:2 (1536x1024). Premium dark product photography, modern and current, real objects, shot like a professional catalog still life. Matte-black environment, background #0B0908 deepening to warm graphite #161311, dark stone surface with a faint reflection. One dominant warm gold-amber key light (#D4AF37) from the upper left plus a faint ember-orange (#E8721C) rim light from behind; cream highlights only on edges. Muted natural material colors only, high contrast, deep blacks, shallow depth of field, crisp detail, very fine film grain. Straight rectilinear framing, no rounded frames. LEFT third of the frame and BOTTOM 25% stay calm dark negative space; keep the subject in the central 70% of the height, slightly right of center.

SUBJECT: Real geek books. A row of five manga volumes standing upright (One Piece and Berserk style small-format paperbacks with illustrated covers), a short stack of large hardcovers beside them (Dungeons & Dragons Player's Handbook and a Lord of the Rings hardcover edition, dark covers with gold foil), and one big graphic novel lying open in front showing Batman style comic panels. Gold-amber light grazing the page edges so they glow like thin gold lines.

AVOID: readable or misspelled lettering (if text appears keep it small and unreadable), people, hands, fingers, antique or old-looking books, classic library shelves, retro look, neon, clutter, bright white background, rounded frames.
```

## 4. Casa / Eletrodomésticos → `public/images/plus/plus-casa.webp`

```
Generate a photorealistic image, horizontal 3:2 (1536x1024). Premium dark product photography, modern and current, real objects, shot like a professional catalog still life. Matte-black environment, background #0B0908 deepening to warm graphite #161311, dark stone countertop with a faint reflection. One dominant warm gold-amber key light (#D4AF37) from the upper left plus a faint ember-orange (#E8721C) rim light from behind; cream highlights only on edges. Muted natural material colors only, high contrast, deep blacks, shallow depth of field, crisp detail, very fine film grain. Straight rectilinear framing, no rounded frames. LEFT third of the frame and BOTTOM 25% stay calm dark negative space; keep the subject in the central 70% of the height, slightly right of center.

SUBJECT: Real everyday home appliances, the kind people actually buy. A black digital air fryer (Philips Walita Airfryer style) with its basket drawer slightly open in the foreground, a round black robot vacuum cleaner (Roomba style) slightly blurred behind it, and a black capsule coffee machine (Nespresso style) far in the back, all on a dark stone counter. Gold-amber light sliding along the matte surfaces.

AVOID: readable text or display on the appliances, people, hands, fingers, a full catalog kitchen, food, fruit, flowers, rustic decoration, retro look, neon, clutter, bright white background, rounded frames.
```

## 5. Eletrônicos → `public/images/plus/plus-eletronicos.webp`

```
Generate a photorealistic image, horizontal 3:2 (1536x1024). Premium dark product photography, modern and current, real objects, shot like a professional catalog still life. Matte-black environment, background #0B0908 deepening to warm graphite #161311, dark glossy console surface with a faint reflection. One dominant warm gold-amber key light (#D4AF37) from the upper left plus a faint ember-orange (#E8721C) rim light from behind; cream highlights only on edges. Muted natural material colors only, high contrast, deep blacks, shallow depth of field, crisp detail, very fine film grain. Straight rectilinear framing, no rounded frames. LEFT third of the frame and BOTTOM 25% stay calm dark negative space; keep the subject in the central 70% of the height, slightly right of center.

SUBJECT: Real home entertainment electronics. A large ultra-thin Samsung style OLED smart TV with slim bezels seen at a slight angle, its screen showing only a soft abstract warm gold glow (no image, no interface), a slim black soundbar below it on the dark console, a Sony WH-1000XM5 style pair of matte-black over-ear headphones leaning at the side, and a small JBL Flip style portable speaker in front. Gold-amber light tracing the TV edge, the soundbar grille and the headband.

AVOID: readable screen content, game or movie scenes, gaming RGB, people, hands, fingers, tangled cables, retro look, neon, clutter, bright white background, rounded frames.
```

## 6. Esporte → `public/images/plus/plus-esporte.webp`

```
Generate a photorealistic image, horizontal 3:2 (1536x1024). Premium dark product photography, modern and current, real objects, shot like a professional catalog still life. Matte-black environment, background #0B0908 deepening to warm graphite #161311, dark stone surface with a faint reflection. One dominant warm gold-amber key light (#D4AF37) from the upper left plus a faint ember-orange (#E8721C) rim light from behind; cream highlights only on edges. Muted natural material colors only, high contrast, deep blacks, shallow depth of field, crisp detail, very fine film grain. Straight rectilinear framing, no rounded frames. LEFT third of the frame and BOTTOM 25% stay calm dark negative space; keep the subject in the central 70% of the height, slightly right of center.

SUBJECT: Real sports gear, the kind sold in Brazil. A matte-black Nike Mercurial style football boot (chuteira) with visible studs in the foreground in side profile, an Adidas style official match football with a classic black and white panel pattern resting behind it, and a black Nike Pegasus style running shoe slightly blurred at the side. Gold-amber light along the studs, the sole and the ball panels. No stadium, no gym, no outdoor scene.

AVOID: readable text, athletes, people, hands, fingers, vivid colors, retro look, neon, clutter, bright white background, rounded frames.
```

---

## Versão sem marcas nem personagens (alternativa segura para publicar)

Se a versão acima for recusada pelo ChatGPT ou o dono preferir evitar direitos de terceiros, trocar só o bloco **SUBJECT** (mantendo o restante do prompt) por estes:

- **Impressão 3D:** três miniaturas de RPG de mesa impressas em 3D e pintadas à mão, de design original (anão guerreiro com escudo redondo, mago de manto com cajado, dragão pequeno), com linhas de camada visíveis nas partes sem pintura; ao fundo, desfocada, uma impressora 3D FDM fechada, genérica, com uma peça em impressão e dois carretéis.
- **Tecnologia:** placa de vídeo moderna de três ventoinhas (carcaça preta, sem logotipo), SSD M.2 com dissipador preto e dois pentes de memória DDR5 com dissipador liso; ao fundo, desfocados, um mouse sem fio e um teclado mecânico de teclas pretas em branco.
- **Livros:** cinco volumes de mangá em formato pequeno com lombadas ilustradas e sem texto, pilha de livros grandes de capa dura escura com bordas douradas e sem título, e um livro de arte aberto à frente com paisagens pintadas abstratas.
- **Casa:** air fryer digital preta com a gaveta entreaberta, aspirador robô redondo preto desfocado atrás e cafeteira de cápsulas preta ao fundo, tudo sem logotipo.
- **Eletrônicos:** TV inteligente ultrafina de bordas finas com a tela mostrando só um brilho dourado suave, soundbar preta embaixo e um fone over-ear preto encostado ao lado, sem marca.
- **Esporte:** chuteira preta com travas de perfil, bola de futebol clássica preto e branco sem logotipo ao fundo e um tênis de corrida preto desfocado ao lado, sem listras nem símbolos.

---

## Depois de gerar

1. Salvar exatamente no nome indicado em cada item. Imagem nova = nome novo, nunca sobrescrever (cache imutável de 1 ano em `/images/*`).
2. Conferir as 6 lado a lado e ao lado de `public/images/home/hero-watermark.webp`: mesma luz, mesmo preto, mesmo tamanho aparente do objeto.
3. Antes de ligar no código: `git grep -F "images/plus/<arquivo>" src` deve dar 0 usos (uma imagem, um lugar).
4. Texto alternativo (alt) sugerido, sem a palavra "afiliado": descrever o que aparece (ex.: "Miniaturas coloridas impressas em 3D diante de uma impressora, sob luz dourada em fundo escuro").

### Rejeitar e gerar de novo se aparecer

- Texto, letra ou número errado em qualquer parte
- Logotipo deformado ou marca mal desenhada
- Pessoa, mãos ou dedos
- Aspecto retrô, neon, luz RGB ou fundo claro
- Objeto deformado, cabo impossível ou botão derretido
- Luz diferente das outras (sem dourado, vinda da direita)
- Assunto fora dos 70% centrais ou ocupando o terço esquerdo e o rodapé

## Controle

| Departamento | Arquivo | Proporção | Onde entra | Estado |
|---|---|---|---|---|
| Impressão 3D | `public/images/plus/plus-impressao-3d.webp` | 3:2 (1200x800) | `CartaoLojaPlus` | aguardando geração pelo dono |
| Tecnologia | `public/images/plus/plus-tecnologia.webp` | 3:2 | idem | aguardando geração pelo dono |
| Livros | `public/images/plus/plus-livros.webp` | 3:2 | idem | aguardando geração pelo dono |
| Casa / Eletrodomésticos | `public/images/plus/plus-casa.webp` | 3:2 | idem | aguardando geração pelo dono |
| Eletrônicos | `public/images/plus/plus-eletronicos.webp` | 3:2 | idem | aguardando geração pelo dono |
| Esporte | `public/images/plus/plus-esporte.webp` | 3:2 | idem | aguardando geração pelo dono |
