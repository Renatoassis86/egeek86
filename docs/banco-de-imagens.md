# Banco de imagens gerais — Espaço Geek 86

> Diferente de `docs/image-generation-prompts.json` e `docs/dimensoes-imagens.md`
> (que são prompt + tamanho pra um espaço específico e já mapeado no
> código), este arquivo é um **estoque geral de prompts reutilizáveis**,
> pra puxar sempre que uma seção nova pedir imagem e ainda não tiver um
> prompt específico esperando por ela. Cobre tanto imagem atmosférica/still
> life quanto fotografia real de pessoas fazendo coisas geek (jogando,
> assistindo, colecionando, em evento). Princípio geral: **menos é mais** —
> composição limpa, um assunto central claro, nunca cena cheia/poluída.
>
> Todos os prompts já vêm com a paleta da marca e as instruções de estilo
> embutidas. Formato sugerido por padrão: **4:5 (retrato)**, mas qualquer um
> pode ser pedido em **16:9 (paisagem)** trocando só essa instrução de
> proporção no fim do prompt, se for usar como banner largo em vez de card.

## Categoria A — Pessoas reais fazendo coisas geek (lifestyle)

Fotografia natural, não posada de forma corporativa/genérica de banco de
imagem — rosto pode estar parcialmente visível, de perfil, ou fora de foco
em primeiro plano, o foco emocional é a atividade, não o sorriso pra câmera.

**A1. Jogando sozinho, à noite**
```
Natural lifestyle photograph of a person playing a video game alone at night, seen from behind or in profile (face not the focus), soft glow from the screen lighting their face, cozy dim room in warm dark tones, gold (#D4AF37) accent light from a nearby lamp, shallow depth of field, candid unposed moment, no visible screen content, no legible text, no logos, no brand names
```

**A2. Amigos jogando multiplayer no sofá**
```
Natural lifestyle photograph of two friends sitting on a couch playing video games together, laughing, controllers in hand, warm cozy living room at night with soft gold and ember ambient lighting, candid unposed moment, shallow depth of field, no visible screen content, no legible text, no logos, no brand names
```

**A3. Organizando prateleira de colecionáveis**
```
Natural lifestyle photograph of a person carefully placing a collectible figure on a shelf full of similar items, focus on their hands and the shelf, warm dark background with soft gold rim light, sense of pride and care in the action, shallow depth of field, no legible text, no logos, no brand names
```

**A4. Abrindo uma caixa de colecionável (unboxing)**
```
Natural lifestyle photograph of hands opening a plain unbranded collectible box, packaging paper visible, warm dim room lighting with a gold highlight, sense of anticipation, close-up shallow depth of field, no readable text or logos on the box, no brand names
```

**A5. Assistindo filme/série em casa**
```
Natural lifestyle photograph of a person relaxed on a couch watching a movie at night, popcorn bowl nearby, glow from an off-screen television lighting the room in cool blue mixed with warm gold lamp light, cozy candid moment, shallow depth of field, no visible screen content, no legible text, no logos
```

**A6. Lendo HQ/mangá**
```
Natural lifestyle photograph of a person reading a comic book or manga, curled up in a cozy chair, warm dim lighting with a gold desk lamp, pages visible but illustrations abstract/unreadable, candid relaxed moment, shallow depth of field, no legible text, no logos, no brand names
```

**A7. Em evento/convenção geek**
```
Natural lifestyle photograph of a small group of friends at a geek culture convention, walking among booths, soft cosplay-adjacent styling without depicting any specific copyrighted character, warm ambient event lighting with gold and ember accents, candid documentary feel, shallow depth of field, no legible text, no logos, no readable booth signage
```

**A8. Comprando numa loja física de games/colecionáveis**
```
Natural lifestyle photograph of a person browsing a shelf in a games and collectibles store, warm shop lighting in gold tones, blurred shelves of unbranded boxes in the background, candid moment of curiosity, shallow depth of field, no legible text, no logos, no readable packaging
```

**A9. Reagindo a uma notificação no celular**
```
Natural lifestyle photograph of a person smiling at their phone screen, soft warm indoor lighting with a gold glow, phone screen content abstract/unreadable, candid genuine reaction, shallow depth of field, no legible text, no logos, no readable UI on the screen
```

**A10. Mãos segurando um controle de video game**
```
Natural lifestyle macro photograph of a pair of hands holding a video game controller, warm dim lighting with dramatic gold rim light on the controller's edges, shallow depth of field, cinematic mood, no legible text, no logos, no brand names visible on the controller
```

## Categoria B — Still life / atmosfera (sem pessoas)

**B1. Setup gamer completo**
```
Atmospheric still life photograph of a gaming desk setup: mechanical keyboard, mouse, and headset arranged neatly, warm ambient lighting in gold and deep black tones, soft bokeh in the background, premium editorial product photography, minimal clean composition, no legible text, no logos, no brand names
```

**B2. Prateleira de colecionáveis organizada**
```
Atmospheric still life photograph of a neatly organized shelf of collectible figures and boxed items, dramatic warm gold spotlight from above, deep black background, premium curated retail feel, minimal clean composition (not cluttered), no legible text, no logos, no visible brand names
```

**B3. Pilha de jogos físicos**
```
Atmospheric still life photograph of a small stack of physical video game cases, warm gold rim lighting, dark graphite surface, shallow depth of field, premium product photography, minimal composition, no legible text, no logos, no visible brand names or cover art
```

**B4. Controle de video game em destaque (macro)**
```
Tight macro still life photograph of a video game controller resting on a dark surface, dramatic warm gold and ember rim lighting highlighting its contours, extreme shallow depth of field, premium product photography, no legible text, no logos, no brand names
```

**B5. Console em ambiente doméstico**
```
Atmospheric still life photograph of a video game console resting on a media console in a cozy dim living room, soft warm gold ambient light, blurred background, premium editorial photography, minimal composition, no legible text, no logos, no visible brand names
```

**B6. HQs/mangás empilhados**
```
Atmospheric still life photograph of a small neat stack of comic books or manga volumes, warm gold side lighting, dark background, shallow depth of field, premium editorial photography, minimal composition, no legible text, no logos, no readable covers
```

**B7. Vitrine de loja à noite (vista de fora)**
```
Atmospheric photograph of a small specialty store window at night, warm gold light spilling out onto a dark empty street, blurred unbranded collectible shapes visible through the glass, cinematic mood, premium editorial photography, no legible text, no logos, no readable signage
```

## Notas de uso

- Todos os prompts acima já embutem a paleta (dourado `#D4AF37`, laranja
  `#E8721C`, preto `#0B0908`) e o pedido de "sem texto/logo legível" — não
  precisa acrescentar nada, só colar.
- Categoria A (pessoas) é mais arriscada de sair "com cara de banco de
  imagem genérico" — prefira gerar 2-3 variações do mesmo prompt e escolher
  a mais natural, em vez de aceitar a primeira.
- Nenhum prompt aqui cita marca/franquia específica de propósito, mesmo
  princípio já aplicado nos mascotes e nos tiles de Universos.
- "Menos é mais": evite pedir pra IA adicionar múltiplos elementos na mesma
  cena (ex: pessoa + prateleira + tela + logo) — cada imagem tem um
  assunto central só.
