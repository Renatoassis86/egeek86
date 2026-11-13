# Prompts de imagem do Espaço Geek Plus (Designer de Marca, 2026-11-13)

Pedido do dono: os 6 cartões do Plus na home (hoje só ícone e texto) passam a ter foto contextualizada. Nenhuma imagem foi gerada nem ligada no código. Quem gera é o dono, no ChatGPT; quem salva e liga é o engenheiro-frontend, depois do grep "um arquivo, um uso".

Requisitos do dono: (1) contemporâneo, limpo, sem aspecto retrô (o Plus não é games); (2) sem descaracterizar o site: escuro premium, dourado/âmbar, cantos retos, "cofre da cultura geek", em família com `public/images/home/hero-watermark.webp` (a imagem de referência do estilo premium dark).

Nomes de arquivo conferidos: `public/images/plus/` não existe e `git grep "images/plus"` só acha as reservas de `PROMPTS_IMAGENS.md` (`plus-hero.png` e `dept-<slug>.png`, IMG-06 e IMG-09). Os nomes abaixo (`plus-<departamento>.webp`) são diferentes de todos eles. Se o dono aprovar estas fotos, a IMG-09 daquele documento fica substituída por este arquivo (não gerar as duas).

## Medida do cartão (código atual)

`SecaoPlusHome` (`src/components/plus/secao-plus-home.tsx`) renderiza `CartaoLojaPlus` (`src/components/plus/cartao-loja-plus.tsx`) numa grade 1 / 2 / 3 colunas (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `gap-4`), contêiner `max-w-7xl` com `px-8`.
- Desktop (lg): cartão de cerca de 394 px de largura. De 640 a 1023 px: duas colunas, cerca de 300 a 480 px. Celular (390 px): uma coluna, cerca de 358 px.
- O cartão não tem altura fixa (`h-full`, o conteúdo define). Hoje: ícone + contagem, título, chamada, tipos e botão "Ver produtos de ...".
- Encaixe recomendado: foto no TOPO do cartão (largura total, `aspect-[3/2]`, `object-cover`), texto e botão ABAIXO, sem texto sobre a foto, exceto o selo de contagem ("104 produtos") pequeno no canto inferior esquerdo. Assim o contraste do texto não depende da imagem.
- Proporção recomendada: **3:2**. Gerar em 1536x1024 (formato nativo do ChatGPT), exportar em 1200x800 (cobre o cartão de 394 px em tela 3x). NÃO precisa de versão mobile: a mesma foto 3:2 serve nas três larguras; o assunto fica nos 70% centrais da altura para aguentar um corte mais baixo.
- Se o frontend preferir texto sobre a foto, a zona segura já está embutida em cada prompt: terço esquerdo e faixa inferior de 25% calmos e escuros.

## A. DNA visual comum (colar no começo de TODO prompt)

```
STYLE FAMILY: Contemporary premium dark product photography, modern editorial still life, clean and current (2025 look, not retro, not vintage, no pixel art, no 80s or 90s neon). Pure matte-black environment, background #0B0908 deepening to warm graphite #161311, a dark glossy or matte-stone surface with a faint reflection. One dominant warm key light in gold-amber (#D4AF37) from the upper left, plus a faint ember-orange (#E8721C) kicker from behind; cream-white (#F2E9D8) only as soft highlights on edges, never as a flat bright area. No other colors except the natural material colors of the object, kept muted and desaturated. Soft haze, shallow depth of field, crisp fine detail on the subject, very fine film grain, high contrast with deep blacks, restrained and expensive, like a vault displaying one prized object. Straight rectilinear framing, hard right-angle geometry, no rounded frames, no rounded vignette. One hero object plus at most two supporting objects. Horizontal 3:2 composition. LEFT third of the frame and the BOTTOM 25% stay calm dark negative space (safe zone for the card badge and text); keep the subject inside the central 70% of the image height, slightly right of center.
NEGATIVE: text, letters, numbers, captions, watermark, logo, brand names, recognizable brands or product designs, trademarked shapes, recognizable faces, people, hands, fingers, stock-photo look, generic office or living-room staging, retro or vintage look, pixel art, arcade, neon cyberpunk, purple-blue gradient, rainbow RGB light, 3D cartoon, mascot, game characters, floating glowing icons, fake screenshots, readable screen content, clutter, bright white background, wide-angle distortion, rounded card frames.
```

Paleta de referência (hex reais do projeto): canvas `#0B0908`, superfície `#161311`, elevado `#201C18`, creme `#F2E9D8`, dourado `#D4AF37`, âmbar `#E8721C`. Verde `#10B981` e vermelho `#EF4444` ficam FORA das fotos (codificam preço no site).

Sem pessoas e sem mãos de propósito: a IA deforma mãos, e a ausência dá a sensação de vitrine de cofre, coerente com o resto do site.

## B. Os 6 prompts finais

Para cada um: colar o bloco A e depois o prompt. Gerar 3 variações e escolher a mais sóbria e mais escura.

### 1. Impressão 3D
- Arquivo: `public/images/plus/plus-impressao-3d.webp`
- Cena: peça funcional contemporânea impressa em 3D (mecanismo articulado, grafite fosco, camadas finas visíveis), com um carretel de filamento escuro desfocado ao fundo.
- Prompt: `A single articulated helical gear-and-lattice mechanical part, 3D printed in matte graphite filament with crisp fine layer lines visible on its surface, resting on a dark stone plate slightly right of center. A blurred dark filament spool far behind it in the upper right. Gold-amber key light skimming across the layer lines to reveal their texture, faint ember-orange rim from behind. Nothing else on the surface.`
- Composição: peça a 45 graus, câmera na altura da superfície.
- Zona segura: terço esquerdo e 25% inferior vazios (névoa leve).
- Proporção/resolução: 3:2, gerar 1536x1024, exportar 1200x800.
- Alt: `Peça mecânica articulada impressa em 3D, em grafite fosco, com as camadas finas iluminadas por luz dourada sobre fundo escuro.`
- Prompt negativo: sem impressora desenhada com marca, sem figurinha de personagem, sem peça colorida, sem texto no carretel, sem mãos.

### 2. Tecnologia
- Arquivo: `public/images/plus/plus-tecnologia.webp`
- Cena: relógio inteligente genérico de tela apagada ao lado de uma placa de circuito aberta, só silhuetas escuras e cobre dourado.
- Prompt: `A modern compact smart watch with a blank dark screen and a plain matte-black strap, unbranded, lying flat beside a bare dark circuit board whose copper traces catch the gold light, both on a dark glossy surface slightly right of center, seen from a low three-quarter angle. Gold-amber key light along the copper traces, ember-orange kicker from behind, deep blacks elsewhere.`
- Composição: relógio à frente, placa em diagonal atrás, desfocada.
- Zona segura: terço esquerdo e 25% inferior em preto limpo.
- Proporção/resolução: 3:2, 1536x1024, exportar 1200x800.
- Alt: `Relógio inteligente de tela apagada ao lado de uma placa de circuito com trilhas de cobre iluminadas em dourado, sobre fundo escuro.`
- Prompt negativo: sem logotipo no relógio, sem tela acesa com interface, sem circuito verde ou colorido, sem hologramas, sem estética cyberpunk.

### 3. Livros
- Arquivo: `public/images/plus/plus-livros.webp`
- Cena: pilha curta de livros de capa dura modernos, lombadas lisas, e um livro aberto à frente com as páginas em leque, sem texto legível.
- Prompt: `A short stack of three contemporary hardcover books with plain blank spines in matte charcoal, deep olive-black and muted cream linen, one more book lying open in front with its pages gently fanned and no readable text, on a dark stone surface slightly right of center. Gold-amber light grazing the page edges so they glow like thin gold lines, ember-orange kicker from behind, rest of the scene in deep shadow.`
- Composição: câmera baixa, bordas das páginas em primeiro plano.
- Zona segura: terço esquerdo e 25% inferior escuros.
- Proporção/resolução: 3:2, 1536x1024, exportar 1200x800.
- Alt: `Pilha de livros de capa dura com um livro aberto à frente, páginas iluminadas por luz dourada sobre fundo escuro.`
- Prompt negativo: sem título ou letras nas lombadas e nas páginas, sem capas ilustradas, sem estante de biblioteca clássica, sem aspecto de livro antigo.

### 4. Casa / Eletrodomésticos
- Arquivo: `public/images/plus/plus-casa.webp`
- Cena: chaleira elétrica de design atual, linhas retas em aço escovado preto, com uma xícara ao lado, em bancada de pedra escura.
- Prompt: `A modern minimalist electric kettle in brushed black steel with a straight geometric body and no brand marking, with one plain matte ceramic cup beside it, on a dark stone countertop slightly right of center. Gold-amber key light sliding along the brushed metal, a thin line of steam rising softly into the dark, ember-orange kicker from behind. Clean architectural simplicity.`
- Composição: leve ângulo de cima, pedra com reflexo suave.
- Zona segura: terço esquerdo e 25% inferior vazios.
- Proporção/resolução: 3:2, 1536x1024, exportar 1200x800.
- Alt: `Chaleira elétrica moderna de aço escovado preto com uma xícara ao lado, sobre bancada de pedra escura e luz dourada.`
- Prompt negativo: sem cozinha completa de catálogo, sem marca ou botão com texto, sem fruteira ou flores, sem decoração rústica.

### 5. Eletrônicos
- Arquivo: `public/images/plus/plus-eletronicos.webp`
- Cena: caixa de som sem fio cilíndrica e um fone de ouvido de linhas atuais, ambos pretos e sem marca.
- Prompt: `A modern cylindrical wireless speaker with a fine blank metal mesh grille, unbranded, and a pair of sleek matte-black over-ear headphones leaning against it, both on a dark glossy surface slightly right of center. Gold-amber key light tracing the mesh texture and the headband edge, faint ember-orange rim from behind, no other color.`
- Composição: caixa de som em primeiro plano, fone apoiado atrás, câmera à altura do objeto.
- Zona segura: terço esquerdo e 25% inferior em preto limpo.
- Proporção/resolução: 3:2, 1536x1024, exportar 1200x800.
- Alt: `Caixa de som sem fio cilíndrica com um fone de ouvido preto encostado, iluminados em dourado sobre fundo escuro.`
- Prompt negativo: sem logotipo, sem tela de TV com imagem, sem cabos soltos bagunçados, sem luz RGB, sem fone gamer com microfone (o hero já tem um).

### 6. Esporte
- Arquivo: `public/images/plus/plus-esporte.webp`
- Cena: tênis de corrida atual de perfil, em preto e grafite, como peça de museu, com um halter compacto desfocado atrás.
- Prompt: `A single modern performance running shoe in matte black and graphite knit with a clean sculpted midsole, unbranded and with no stripes or symbols, seen in side profile on a dark stone pedestal slightly right of center, with one compact matte-black dumbbell blurred behind it. Gold-amber key light along the sole and the knit texture, ember-orange kicker from behind. No gym, no outdoor scene.`
- Composição: perfil puro, sola bem definida, halter desfocado ao fundo.
- Zona segura: terço esquerdo e 25% inferior escuros.
- Proporção/resolução: 3:2, 1536x1024, exportar 1200x800.
- Alt: `Tênis de corrida moderno preto e grafite em perfil, com um halter ao fundo, sob luz dourada em fundo escuro.`
- Prompt negativo: sem marca, listras ou símbolo no tênis, sem atleta, sem academia ou quadra, sem cores vivas, sem aspecto de calçado antigo.

## C. Variações alternativas (mesma família; usar se a primeira não sair boa)

Colar o bloco A e usar o prompt abaixo no lugar do principal. Arquivo, alt e negativo seguem os do departamento.

1. Impressão 3D: `A small architectural scale model of a geometric tower, 3D printed in matte dark resin with fine visible layer lines, standing on a dark stone slab slightly right of center, with a plain hex key lying beside it. Gold-amber light skimming the layers, ember-orange kicker from behind.`
2. Tecnologia: `A slim unbranded wireless numeric keypad with blank keycaps and a small unbranded USB-C power adapter with a neatly coiled black cable, on a dark glossy surface slightly right of center. Gold-amber light along the key edges and the cable coil.` (Se saírem teclas legíveis, descartar.)
3. Livros: `A single hardcover book standing upright with a plain blank dark cover and a thin gold ribbon bookmark hanging out, next to a small unlit reading lamp of modern straight design, on a dark surface slightly right of center. Gold-amber light on the page edges and the ribbon.`
4. Casa: `A straight-edged matte-black stand blender with an empty clear jar, unbranded, on a dark stone counter slightly right of center, gold-amber light running down the glass edge, ember-orange kicker from behind.`
5. Eletrônicos: `A modern slim soundbar in matte black with a fine blank grille lying horizontally on a dark glossy console, with a small plain remote control beside it, unbranded, slightly right of center. Gold-amber light along the grille edge.`
6. Esporte: `A matte-black yoga mat rolled tight standing on its end next to a minimalist graphite water bottle with no label, on a dark stone floor slightly right of center. Gold-amber key light on the roll's edge and the bottle's metal, ember-orange kicker from behind.`

## D. Depois de gerar (curto)

1. Exportar: WebP, 1200x800, qualidade 75 a 82, sem metadados. Peso alvo abaixo de 150 KB por foto no desktop (fundo escuro comprime bem; se passar, baixar a qualidade antes de reduzir o tamanho). Salvar exatamente no nome da tabela. Imagem nova = nome novo, nunca sobrescrever (cache imutável de 1 ano em `/images/*`).
2. Conferir as 6 lado a lado em um só quadro: mesma temperatura de luz (dourado vindo do alto à esquerda), mesmo preto de fundo, mesma altura de horizonte, mesmo tamanho aparente do objeto, grão parecido. Se uma destoar, regerar só ela, com a variação.
3. Conferir também ao lado de `public/images/home/hero-watermark.webp` e sobre o fundo `#161311` do cartão: deve parecer parte do mesmo site.
4. Antes de ligar: `git grep -F "images/plus/<arquivo>" src` deve dar 0 usos. Texto alternativo: o da seção B (sem a palavra "afiliado").

### Checklist de rejeição (qualquer item marcado = descartar e regerar; não "consertar" no editor)

- [ ] Texto, letra, número ou logotipo em qualquer parte da imagem
- [ ] Marca ou design de produto reconhecível (tênis com listras, fone ou relógio com forma de marca conhecida)
- [ ] Aspecto retrô, vintage, pixel, neon antigo ou RGB colorido
- [ ] Rosto ou pessoa; mãos ou dedos (mesmo bem feitos)
- [ ] Objeto deformado, parafuso ou botão derretido, cabo impossível
- [ ] Luz inconsistente com as outras (branca fria, sem dourado, vinda da direita)
- [ ] Fundo cinza claro ou branco; verde ou vermelho de destaque; roxo
- [ ] Objeto fora dos 70% centrais ou ocupando o terço esquerdo/rodapé (sem zona segura)
- [ ] Cara de banco de imagem (cena arrumada de sala ou cozinha, plantinha)

## E. Tabela de controle

| Departamento | Arquivo | Proporção | Onde entra no código | Estado |
|---|---|---|---|---|
| Impressão 3D | `public/images/plus/plus-impressao-3d.webp` | 3:2 (1200x800) | `CartaoLojaPlus` (`src/components/plus/cartao-loja-plus.tsx`), via `SecaoPlusHome` (`dept` `impressao3d`) | aguardando geração pelo dono |
| Tecnologia | `public/images/plus/plus-tecnologia.webp` | 3:2 | idem (`dept` `tecnologia`) | aguardando geração pelo dono |
| Livros | `public/images/plus/plus-livros.webp` | 3:2 | idem (`dept` `livros`) | aguardando geração pelo dono |
| Casa / Eletrodomésticos | `public/images/plus/plus-casa.webp` | 3:2 | idem (`dept` `eletrodomesticos`) | aguardando geração pelo dono |
| Eletrônicos | `public/images/plus/plus-eletronicos.webp` | 3:2 | idem (`dept` `eletroeletronicos`) | aguardando geração pelo dono |
| Esporte | `public/images/plus/plus-esporte.webp` | 3:2 | idem (`dept` `esporte`) | aguardando geração pelo dono |

Mudança de código (para o engenheiro-frontend, só depois das imagens): mapa `dept -> arquivo` ao lado de `ICONES`; `SceneImage` (`cover`, `aspect-[3/2]`, `sizes="(min-width:1024px) 394px, (min-width:640px) 50vw, 100vw"`) no topo do cartão; ícone mantido como fallback quando não houver foto. `CartaoLojaPlus` também é usado em `/plus` (`src/app/(shop)/plus/page.tsx`): a foto aparece nos dois lugares com o MESMO arquivo, que é um componente e não duas imagens; se o dono quiser fotos diferentes em `/plus`, é pedido novo. A nova home (`src/components/home/secoes-v2/faixa-plus.tsx`) tem cartões próprios de produto e fica fora deste pedido.
