# Parecer do Engenheiro Frontend — Vitrine de Ofertas mobile (2026-11-01)

Método: leitura de código. Não reproduzi no navegador: `curl http://localhost:3101/ofertas` não respondeu em 120 s (servidor ausente ou travado); não mexi na porta nem rodei build. Tudo abaixo é **inferência do código**, com grau de confiança marcado. Os sintomas que dependem de medição estão marcados como "confirmar em 360/390/430".

## 1. Causa raiz por sintoma (imagem/card)

| Sintoma | Causa (arquivo:linha) | Confiança |
|---|---|---|
| Imagem "individualizada", fundo branco colado no escuro | `product-image.tsx:64` fixa `bg-[#f7f6f3]` (painel claro) dentro de cards/seções escuras (`ofertas/page.tsx:198,212,225` usam `data-theme="dark"` com gradiente esmeralda/roxo). O quadro claro contrasta com o `Card` escuro (`card.tsx:7` usa `--color-bg-surface`). É decisão de projeto (capas com fundo branco), mas sem moldura/respiro que a integre. | Alta |
| Imagem estoura a moldura / cortada à direita | Provável: `product-image.tsx:82` `size-full` (width/height 100%) sobre contêiner cuja altura vem só de `aspect-ratio` (linha 66-67) dentro de `flex items-center`. Em WebKit/iOS, `height:100%` em caixa com altura derivada de aspect-ratio nem sempre é tratada como definida, e a `<img>` assume proporção intrínseca (capa alta) e é cortada por `overflow-hidden` (linha 62). Correção estrutural: img `absolute inset-0 h-full w-full object-contain`. | Média (confirmar em iPhone) |
| Etiqueta da loja "Me…" coberta / badge de desconto coberto | Os selos são `absolute` filhos do mesmo quadro (`offer-card.tsx:73-92`), e o badge da loja é `right-3.5 bottom-3.5 max-w-[70%] truncate` sobre a imagem; com a imagem estourando ou com o painel claro, o selo `bg-canvas/90` fica sobre foto, não numa faixa própria. Na página de produto o selo da loja fica sobre a foto em `[slug]/page.tsx:149-158` e a faixa "Menor preço já registrado" em `:161` cobre o rodapé da foto. | Alta |
| Proporções diferentes quebram alinhamento | Intencional: `ratioForDimension` (`product-image.tsx:9-11`) dá 4:5 para jogo e 1:1 para o resto. O problema é que a mesma prateleira mistura tipos (Switch/PS-Xbox admitem console e jogo; só aceitam `game` físico e `console`, ver `ofertas/page.tsx:120-143`), então cards da mesma fileira ficam com alturas diferentes. Não há altura de mídia comum por prateleira. | Alta |
| "Faixas laranja atrás" | Não localizado com certeza. Candidatos: `Glow color="hype"` do hero (`marketplace-hero-banner.tsx:66`), badge `hype` "Menor já visto" (`offer-card.tsx:103`) e a faixa hype do `[slug]/page.tsx:161`. Confirmar com captura. | Baixa |
| Cantos | `rounded-*` nos arquivos é neutralizado por `globals.css:154-162` e `:473 border-radius: 0 !important`. Sem risco funcional, mas há resíduo de classes (`rounded-xl`, `rounded-full`, `rounded-md`) a limpar por higiene (`offer-filters.tsx:98,172`, hero `:64,94,112+`, `page.tsx:183,198,212,225,238`). | Alta |

Problemas adicionais encontrados no card:
- `offer-card.tsx:55` feature em mobile é `flex-col` com imagem `w-full`: a foto 4:5 ocupa ~390 px de altura num card de 1 coluna. Excessivo no celular.
- Alvo de toque e texto: selo da loja usa `Badge size="sm"` com `text-[11px]` (`badge.tsx:26`); `text-[12px]` no desconto. Abaixo do mínimo de 12 px na loja.

## 2. Desenho do card único (grid e feature)

Estrutura única `OfferCard`, sempre `block w-full min-w-0 overflow-hidden`:

```
<Link class="block min-w-0">
 <article class="flex h-full min-w-0 flex-col border bg-surface">
  <div class="relative aspect-[4/5 | 1/1] w-full overflow-hidden bg-[inset]">   // MÍDIA
     <img class="absolute inset-0 h-full w-full object-contain p-[6%]">
     [badge desconto]  top-0 left-0  (canto, sem raio, dentro do quadro)
  </div>
  <div class="flex min-w-0 flex-1 flex-col gap-2 p-3">                          // CORPO
     <span class="truncate text-[12px]">REDE · especificação</span>             // loja sai da foto
     <h3 class="line-clamp-2 text-[14px] min-h-[2.5rem]">título</h3>
     <preço> ... (mt-auto)
  </div>
 </article>
</Link>
```

Regras de robustez:
1. Proporção fixa por tipo na mídia (jogo `4/5`, demais `1/1`). Para prateleira mista, a mídia da prateleira inteira usa a proporção do tipo da prateleira (ver §3: prateleiras por tipo eliminam a mistura).
2. `object-contain` + fundo neutro: manter o painel claro `#f7f6f3` só dentro do quadro, com borda `border-b` e respiro `p-[6%]`; o corpo do card continua na superfície do tema. Para coerência, o painel claro vira token (`--color-media-bg`) em `globals.css`, em vez de hex avulso em `product-image.tsx:64`.
3. **Etiqueta da loja fora da foto**: vai para o corpo (linha de meta), nunca sobre a imagem. O desconto fica no canto superior esquerdo do quadro (ancorado em `left-0 top-0`, quadrado, igual ao selo "Bundle" já existente em `product-image.tsx:103`); "Menor já visto" fica no corpo. Assim nenhuma sobreposição é possível, mesmo com imagem estranha.
4. Texto: título `line-clamp-2`, meta `truncate`, preço `tabular`, nada abaixo de 12 px.
5. Feature no mobile: layout horizontal compacto (mídia 40% / corpo 60%, altura limitada) ou mesmo card da grade; só vira "grande" a partir de `md`.
6. Grade: `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4` já cabe em 360 px (célula ≈ 156 px) desde que o card seja `min-w-0` e a imagem não force largura. Sem texto `nowrap` no card.

### Carrossel horizontal mobile (prateleiras)

`GroupedOfferShelf`: abaixo de `md`, trilha `flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain -mx-4 px-4 pb-2`; item `w-[72vw] max-w-[280px] shrink-0 snap-start` (jogo/consoles) ou `w-[44vw]` se preferirem duas e meia por tela. Em `md+`, volta à grade. Mostrar o próximo card parcialmente (affordance); contador "n ofertas" e link "Ver todos" no cabeçalho. Definir utilitário `.no-scrollbar` em `globals.css` (hoje **não existe definição**; é usado em `offer-filters.tsx:109` e `price-table-board.tsx:142`, então a barra de rolagem aparece e some o efeito esperado).

## 3. Seções por tipo/plataforma (UI)

- Barra de seções `Jogos | Consoles | Acessórios` (3 chips, `min-h-11`, rolável, `aria-pressed`), sticky logo abaixo do header, alimentada por `VERTICALS.games` de `dimensions.ts:65-67` (não codificar à mão). Cada chip é âncora (`#jogos`, `#consoles`, `#acessorios`, com `scroll-mt-[calc(var(--header-mobile)+64px)]`) e também aceita `?tipo=` para compartilhar.
- Subfiltro por fabricante (Nintendo | Sony | Microsoft) como segunda linha de chips rolável, derivada de `gamePlatformGen` já existente (`ofertas/page.tsx:131-143`). Só mostrar fabricante com ≥1 oferta.
- Ordem das prateleiras: Destaques (curta, só um por tela), depois Jogos, Consoles, Acessórios (ordem de `rank` em `dimensions.ts`). "Menor preço histórico" vira marcador/filtro, não bloco separado de outro tipo.
- Cada prateleira com `id`, título, contagem real e "Ver todos" para `?tipo=`.
- Estado vazio por prateleira: se não houver oferta no recorte, **não** inventar item; mostrar linha curta ("Sem ofertas de acessórios para Nintendo agora") e ocultar fabricante inexistente. Nunca preencher com outro tipo.
- Respeitar o padrão: tema escuro padrão. Os cinco blocos com fundos distintos (creme, esmeralda, roxo, preto, creme; `page.tsx:183,198,212,225,238`) quebram a identidade (canvas `#0B0908`) e o anti-estereótipo; recomendo uma superfície única do tema com divisória fina, mantendo o claro só como painel da foto.

## 4. Auditoria de overflow horizontal em /ofertas (360 / 390 / 430)

Contexto: `globals.css:286-297` aplica `overflow-x:hidden` + `max-width:100vw` em `html` e `body`. Isso **mascara** o estouro: o excesso é cortado (dá o "cortado à direita") e no iOS ainda permite pan lateral do viewport. O reset `.flex > *{min-width:0}` (`globals.css:355`) está em `@layer base` e ajuda, mas qualquer utilitário vence.

| Ponto | Arquivo:linha | Risco |
|---|---|---|
| Wrappers das prateleiras `p-6 lg:p-10` | `ofertas/page.tsx:183,198,212,225,238` | `p-6` (24 px) + `px-4` da seção (16 px) = 40 px por lado: sobra ~310 px a 390 px para duas colunas; cada card ~150 px. Não estoura por si, mas é a causa do "recuo à esquerda". Reduzir para `px-4 py-5` no mobile ou remover o wrapper. |
| Filtros | `offer-filters.tsx:98,109-111,125,140,155` | Linha de chips rolável em `overflow-x-auto` com 4-5 selects `shrink-0` + "Limpar": soma ≈ 96+100+90+105+70+gaps > 390 px, então corta à direita **por design**, sem sinal de rolagem (barra escondida/inexistente) e sem fade. O contêiner externo tem `overflow-hidden` (`:98`). Alturas `h-8` (32 px) e `text-[11px]` violam alvo 44 px e 12 px. |
| Hero | `marketplace-hero-banner.tsx:64,68,86,105,147,184` | Pai com `overflow-hidden` (não vaza). Riscos: busca em coluna no mobile (ok), mas os "Atalhos" `px-3 py-1 text-xs` (~28 px de altura) abaixo de 44 px; métricas `gap-6` com 3 itens podem quebrar linha (ok, `flex-wrap`); `CouponCarousel` `w-full` em `lg:w-auto`. O cartão de cupom `border-2` + `shadow-2xl` ocupa largura cheia, ok. |
| SearchBox compact | `search-box.tsx:153-246` | Linha de chips de plataforma usa `-mx-4` (`:246`); correto só quando o pai tem `px-4`. Em `ofertas/page.tsx:148` o pai é `max-w-3xl` **dentro** de `px-4`, então funciona; se o SearchBox for movido para um contêiner sem padding, vaza 16 px por lado. Há também um segundo campo de busca duplicado no hero (`marketplace-hero-banner.tsx:86-100`) e outro no SearchBox: dois buscadores na mesma tela. |
| `GroupedOfferShelf` cabeçalho | `grouped-offer-shelf.tsx:35-58` | `w-full` + `flex-wrap` + `break-words`: corta se o título for um único token longo; "Tá Vendendo Muito · Destaques da Semana" cortado sugere o ancestral `p-6` somado ao título `heading-lg` sem `min-w-0` no `Text` (o `flex-1 min-w-0` está no pai, ok). Confirmar em captura. |
| Grids | `grouped-offer-shelf.tsx:62-67`, `sales-highlights.tsx:129` | Tailwind 4 `grid-cols-2` = `minmax(0,1fr)`: não deveria vazar. Se vaza, é conteúdo interno (imagem) e não a grade. |
| Card | `offer-card.tsx:96-108,142-147` | Linha `specLine` + selo `whitespace-nowrap`: truncada, ok. |
| Reveal | `reveal.tsx:29-37` | Só `opacity/translateY` (`fadeUp`), não causa overflow horizontal; confirmar que `fadeUp` não usa `x`. |
| Rodapé / sticky | `page.tsx:168` | Filtro sticky `z-20` sob header. Conferir que o contêiner pai não tenha `overflow` (quebra sticky). |

Padrão alvo (b):
- Contêiner da página: `mx-auto max-w-7xl px-4 lg:px-8`, **sem** wrappers coloridos com padding extra no mobile; seções "sangram" para a borda só dentro do carrossel (`-mx-4 px-4`).
- Remover o mascaramento como solução: manter `overflow-x:clip` no `body` por segurança, mas o teste de aceite é `document.documentElement.scrollWidth === innerWidth`.
- Filtros: no mobile, uma linha com **um botão "Filtros (n)"** abrindo gaveta (`Dialog`/sheet) com os selects em lista vertical e botões ≥44 px; fora do mobile, os selects em linha. Alternativa mínima: manter linha rolável com `.no-scrollbar` definido, fade na borda direita, `h-11` e `text-[12px]`.
- Alvos de toque (c): botões/chips/selects `min-h-11` (44 px), texto mínimo 12 px (corpo 14 px). Hoje violam: `offer-filters.tsx` (`h-8`, `11px`), atalhos do hero (`py-1`, `11px`), `Badge sm` (`11px`).

## 5. Arquivos a alterar e riscos

Alterar:
1. `src/components/ui/product-image.tsx` — img `absolute inset-0`, token de fundo, remover hex; manter API.
2. `src/components/affiliate/offer-card.tsx` — loja para o corpo, desconto no canto do quadro, feature compacto no mobile, tamanhos de texto.
3. `src/components/affiliate/grouped-offer-shelf.tsx` — carrossel `snap` no mobile, grade em `md+`, `id`/âncora, "Ver todos".
4. `src/app/(shop)/ofertas/page.tsx` — remover wrappers coloridos `p-6`, barra de seções Jogos/Consoles/Acessórios + subfiltro fabricante, ordem e estados vazios.
5. `src/components/affiliate/offer-filters.tsx` — gaveta no mobile ou linha com `h-11`; fade; limpar `rounded-*`.
6. `src/components/affiliate/marketplace-hero-banner.tsx` — atalhos `min-h-11`, uma só busca.
7. `src/app/(shop)/ofertas/[slug]/page.tsx` (`:147-168`) — loja e selo "menor preço" fora da foto (faixa abaixo do quadro), `lg:sticky` só em desktop.
8. `src/app/globals.css` — definir `.no-scrollbar`, token `--color-media-bg`, `overflow-x: clip`.
9. Novo componente de chips de seção (ex.: `src/components/affiliate/offer-section-nav.tsx`).

Riscos de regressão:
- `OfferCard` é reusado em `src/components/geek-deals/sales-highlights.tsx:131` (home, grade de 6 colunas em `lg`): a mudança de altura do corpo e da mídia afeta a home; testar lá.
- `ProductImage` é usado em outros pontos (busca, tabela, admin?); conferir com `grep -rn "ProductImage"` antes e manter `className` de tamanho fixo (`size-14`) funcionando: com `absolute inset-0` o contêiner precisa de `relative` (já tem) e dimensão definida.
- Tirar a etiqueta da loja da foto muda uma convenção visual; é decisão de produto — recomendo, mas o dono deve validar.
- A regra "uma imagem, um lugar" não é afetada (não adiciono imagem nova); as imagens de produto são externas.
- `data-theme="light"` dos wrappers hoje inverte tokens para o card; ao remover o wrapper, os cards passam a usar tokens escuros: checar contraste.
- Troca de grade por carrossel altera foco/teclado: itens são links, ok; garantir `scroll-padding`.

## 6. Como verificar

Larguras: 360, 390, 430 (e 768/1280 para não regredir). Navegador real (Chrome com emulação iPhone 14 e, se possível, Safari iOS).
Checklist por largura, em `/ofertas`, `/ofertas?tipo=accessory`, `/ofertas/[slug]` (jogo, console, acessório) e home (`SalesHighlights`):
1. `document.documentElement.scrollWidth <= window.innerWidth` e ausência de pan lateral (script em `javascript_tool`).
2. Nenhum elemento com `getBoundingClientRect().right > innerWidth + 0.5` (listar ofensores e retornar o seletor).
3. Imagens: `img.getBoundingClientRect()` dentro do quadro, nenhuma sobreposição de selos (checar interseção selo×imagem = 0 para a loja).
4. Cards da mesma fileira com a mesma altura de mídia; jogo 4:5, demais 1:1.
5. Carrossel: rolagem com snap, próximo card visível, sem scroll da página.
6. Filtros: todos alcançáveis; alvos ≥44 px; texto ≥12 px (consulta `getComputedStyle`).
7. Cantos: `getComputedStyle(...).borderRadius === '0px'` em amostra de cards, chips, imagens.
8. Capturas: topo, cada prateleira, página de produto; anexar em `docs/conselho/pareceres-2026-11-01-ofertas/capturas/` e conferir tema claro e escuro. Verificar também item com imagem ausente (fallback do `ProductImage`).
9. `tsc --noEmit` e passagem do QA antes de declarar pronto (sem rodar build enquanto o QA valida).
