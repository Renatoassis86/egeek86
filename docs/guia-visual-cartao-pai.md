# Guia visual: cartão-pai "O que sabemos hoje" (Fase 1)

Data: 2026-11-05. Base: ata `docs/conselho/atas/2026-11-05-cartao-pai-bi-produto.md` (decisões do responsável, itens 1 a 6), `docs/plano-parecer-bi-produto.md`, `src/components/affiliate/price-metrics-v2-block.tsx`, tokens de `src/app/globals.css`, skill `padrao-visual-egeek`. Guia de UM slide/seção, antes de codar. Sem código, sem imagem nova.

Legenda: **dado real** vem do objeto de servidor `ParecerProduto` (a interface nunca recalcula); **decisão** já fechada pelo dono; **recomendação** é proposta deste guia, a validar no teste de 5 s.

## 1. Princípios (valem para os 3 estados)
- Título fixo do cartão: **"O que sabemos hoje"** (decisão 3). Nunca "parecer", "nossa leitura", "recomendamos", "compre". Nunca "afiliado/afiliada/affiliate" em texto, `aria-label` ou `title`.
- O número é o herói: preço agora em `heading-lg` (26/30), `tabular`, cor `--color-text-primary`.
- Cor só de marca e neutros. Verde `--color-accent-success` e vermelho `--color-accent-danger` ficam PROIBIDOS fora do estado juízo. O código atual usa `success` na frase de comparação (`cmpTone`); no cartão novo isso sai.
- Cantos retos (todos os `--radius-*` = 0; não escrever `rounded-*` nem raio inline). Tema escuro premium.
- Sem ícone de "bom/ruim", sem selo, sem barra de progresso, sem gauge, sem emoji.
- Jargão fora do texto principal: "oferta-dia", "mediana", "base de dados" só dentro do "i" (`InfoTip`, `<details>`), com rótulo acessível. Na frase principal, "mediana" vira **"valor do meio entre as lojas hoje"**; o "i" explica: "É o valor do meio: metade das lojas cobra menos, metade cobra mais. Muda a cada coleta."
- Identidade da mídia (edição, região, físico/digital) NÃO entra no cartão; vai no cabeçalho da camada, só se o dado já existe (ata D8).
- "Lojas" = vendedores distintos hoje. Se a rede é única, o texto diz a verdade: **"N vendedores no Mercado Livre"**. Se houver mais de uma rede: **"N lojas"**. Se N = 1: **"só 1 loja monitorada"**.

## 2. Tokens usados (todos já existem; nenhum valor avulso)
| Uso | Token | Valor | Contraste (cálculo próprio) |
|---|---|---|---|
| Fundo do cartão | `--color-bg-surface` | #161311 | base |
| Fundo de bloco interno (comparação) | `--color-bg-inset` | #060504 | base |
| Fundo da camada | `--color-bg-elevated` | #201C18 | base |
| Texto principal (preço, título) | `--color-text-primary` | #F2E9D8 | alto, AAA sobre surface |
| Texto de apoio | `--color-text-secondary` | #B8AD98 | cerca de 8:1 sobre surface, AA |
| Texto terciário (caption) | `--color-text-tertiary` | #8A8072 | cerca de 4,8:1 sobre surface (AA); cerca de 4,4:1 sobre `bg-elevated` (NÃO passa AA em texto pequeno) |
| Borda | `--color-border-default` / `--color-border-strong` | #2C2620 / #453C31 | decorativa |
| Foco | `--color-border-focus` | #E0A83B | cerca de 8,6:1 sobre surface |
| Fundo atrás da camada | `--color-bg-overlay` | rgb(6 5 4 / 0.72) | sólido no mobile |
| Sombra da camada | `--shadow-xl` | já definida | só desktop |
| Movimento | `--ease-out`, `--duration-base` (250 ms), `--duration-instant` (100 ms) | | |

**Contraste medido (razão WCAG 2.x, tokens reais de `globals.css`, 2026-11-05).** Tema escuro, sobre `bg-surface` / `bg-inset`: primary 15,35 / 16,90; secondary 8,34 / 9,18; tertiary 4,77 / 5,25 (AA). Tema claro, sobre `bg-surface` (#FFFFFF) / `bg-inset` (#F1ECE0): primary 19,11 / 16,21; secondary 12,05 / 10,22; tertiary 7,51 / 6,37 (AA). Todos os textos do cartão passam AA (4,5:1) nos dois temas. O foco `--color-border-focus` (#E0A83B) dá 8,66 sobre `bg-surface` no escuro (passa 3:1 de componente de interface), mas só 2,14 sobre #FFFFFF e 1,81 sobre `bg-inset` no claro (REPROVA 3:1). Correção no cartão: no tema claro o contorno de foco usa `--color-accent-cta` (#8F6A08): 4,96 sobre `bg-surface`, 4,21 sobre `bg-inset`. Pendência fora do cartão: o token global `--color-border-focus` não tem override no tema claro (todos os outros focos do site herdam o dourado claro, ~2:1).

Regra de contraste: texto `tertiary` só sobre `bg-surface`/`bg-canvas`/`bg-inset`. Dentro da camada (fundo `bg-elevated`) usar `secondary` para qualquer texto de 12 a 14 px. Conferir no QA com medição real, não só este cálculo.

Tipografia (tokens existentes): título do cartão `label` (13/18, caixa normal, cor tertiary); preço `heading-lg`; frase de estado `body-md` (15/22) em `primary`; apoio `caption` (12/16) em `tertiary`/`secondary`; ação "Ver detalhes" `body-sm` (14/20) peso 500.

## 3. Estrutura comum (de cima para baixo)
1. **Linha de título**: "O que sabemos hoje" (label, tertiary). À direita, o rótulo do estado (item 4/5/6). 
2. **Preço agora** (herói) e, abaixo, `caption`: "{Loja} · verificado há {X} h".
3. **Bloco de estado** (muda por estado).
4. **Linha de cobertura** (`caption`), UMA só e sem repetir informação (revisão 2026-11-05, Fase 1): em `formacao`, "Acompanhando há {N} dias (desde DD/MM) · {N vendedores no Mercado Livre | N lojas | só 1 loja monitorada}"; em `fato`, só "Acompanhando há {N} dias (desde DD/MM)", porque a quantidade de lojas já está na linha de apoio da comparação. O texto vem pronto do servidor (`cobertura.linha`).
5. **Rodapé de ação**: linha "Ver detalhes" com ícone de expandir (`Maximize2` do lucide, 16 px, `aria-hidden`) à direita, separada por borda superior `--color-border-subtle`.

Notas:
- "Verificado há X h": no servidor emitir `<time datetime="ISO">` com texto fixo "verificado em DD/MM HH:mm"; no cliente trocar por "há X min/h/dias" (resolve o texto congelado no cache, ponto 2 do presidente). Sem hidratação o texto fixo continua verdadeiro.
- Singular/plural: "1 dia", "N dias"; "1 vendedor", "N vendedores".
- Sem preço (nenhuma oferta nas últimas 48 h): no lugar do herói, `body-sm` tertiary: "Nenhuma oferta verificada nas últimas 48 h. Não mostramos preço para não exibir dado velho." Cobertura e "Acompanhando há..." continuam; "Ver detalhes" continua (decisão 2).
- Lacuna é lacuna: sem dado = texto "sem dado", nunca zero, nunca traço sozinho.
- Aviso de vendedor de baixa reputação, quando existir: uma linha `caption` secondary "Vendedor de baixa reputação: confira antes de comprar." sem cor de alerta.

## 4. Estado `formação`
Quando: poucos dias medidos e/ou menos de 3 vendedores distintos hoje (nenhuma comparação possível). É o estado principal de hoje, com desenho final, não um cartão vazio. Dado: `ParecerProduto.estado = formação`.

**Identidade própria:** contorno tracejado 1 px `--color-border-strong` (o tracejado é a mesma linguagem de "sem coleta" do gráfico: ainda em andamento) e, no canto direito da linha de título, o rótulo "Ainda juntando histórico" (`caption`, secondary, sem fundo colorido, sem ícone).

Hierarquia e textos exatos:
1. "O que sabemos hoje" | "Ainda juntando histórico"
2. **R$ 349,90** (heading-lg)
3. "Loja Exemplo · verificado há 3 h" (placeholders de formato, não dado)
4. Bloco de estado (`body-md`, secondary): "Ainda não dá para dizer se este preço é bom. Estamos acompanhando."
5. Cobertura: "Acompanhando há 5 dias (desde 31/10) · 3 vendedores no Mercado Livre". Variantes: "Acompanhando há 1 dia (desde 05/11) · só 1 loja monitorada"; mais de uma rede: "... · 4 lojas".
6. Rodapé: "Ver detalhes".

Em TODOS os estados, quando existe evento gravado (regra do dono, AGENTS.md: toda mudança do menor preço é visível), uma linha `caption`: "Última mudança do menor preço: R$ X em DD/MM às HH:mm, loja Y (antes R$ Z)" (sem valor anterior: "(primeiro registro)"; sem loja: omite a loja). Horário em America/Sao_Paulo. Sem evento, a linha não existe (lacuna, nunca inventada). Empate de preço sem como afirmar a loja: no lugar da loja, "N ofertas com este mesmo preço".

Regras:
- Sem meta de dias (decisão 1): nada de "N de 14", "liberado em", "previsão", barra de progresso.
- Sem comparação em % nem "valor do meio" (menos de 3 vendedores = sem base).
- Se houver preço mínimo já visto e 2+ dias medidos, pode entrar uma linha `caption` "Menor preço registrado em DD/MM: R$ X · {loja}" (revisão da Fase 2: "Menor desde" se confundia com o início do acompanhamento; o rótulo diz o que foi medido e nunca "menor de 90 dias/de sempre" com poucos dias). Só aparece se o menor registrado é MENOR que o preço agora; se coincide ou é maior, a linha é omitida (evita enfeite e "menor" falso).
- Cores: tudo neutro (primary/secondary/tertiary).

## 5. Estado `fato`
Quando: 3 ou mais vendedores distintos hoje (existe valor do meio das lojas), mas ainda sem juízo liberado (hoje, sempre). Dado: `estado = fato`.

**Identidade:** contorno sólido 1 px `--color-border-default`; rótulo no canto: "Comparado com as lojas de hoje" (`caption`, secondary).

Hierarquia e textos exatos:
1. "O que sabemos hoje" | "Comparado com as lojas de hoje"
2. **R$ 349,90**
3. "Loja Exemplo · verificado há 3 h"
4. **Bloco de comparação** (`bg-inset`, borda esquerda 2 px `--color-border-strong`, padding 12 px):
   - Frase factual (`body-md`, **primary**, mesma cor para abaixo, igual ou acima): "8% abaixo do valor do meio entre as lojas hoje" / "12% acima do valor do meio entre as lojas hoje" / "No mesmo valor do meio entre as lojas hoje" (diferença menor que 1%: "Praticamente igual ao valor do meio entre as lojas hoje (menos de 1% de diferença)").
   - Apoio (`caption`, secondary): "Valor do meio: R$ 380,00, entre 3 vendedores no Mercado Livre." com "i" explicando o termo.
   - Percentual arredondado ao inteiro; em R$ junto: "R$ 30,10 a menos" opcional na camada, não no cartão (cartão mantém UMA frase).
5. Cobertura (só os dias, sem repetir as lojas): "Acompanhando há 5 dias (desde 31/10)".
6. Rodapé: "Ver detalhes".

Regras:
- A direção ("abaixo", "acima") é dita só por palavra. PROIBIDO: verde/vermelho, seta colorida, selo, "ótimo/caro/barato/vale a pena/oportunidade".
- Não mostrar o percentual com menos de 3 vendedores (cai em `formação`).
- Se o preço agora é o menor entre as lojas (caso comum), a frase continua factual: "8% abaixo do valor do meio entre as lojas hoje" (o menor preço está por definição abaixo ou igual).

## 6. Estado `juízo` (SLOT DESLIGADO, só descrito)
Não construir, não renderizar, não ter texto. Existe apenas um slot reservado no contrato e no layout (`data-slot="juizo"`, oculto, sem altura) e uma regra de teste: com a flag de juízo desligada ou dados abaixo do mínimo (menos de 3 ofertas ou menos de 14 dias, conforme o método), o slot não pode ser visível.

Quando for liberado pelo backtest (depois de ~14/11, decisão do dono):
- Título passa a "Parecer" ou "Nossa leitura" (decisão 3); textos de rótulo a definir com o designer e o estatístico.
- O slot substitui o bloco de estado (item 4 dos estados anteriores) e é o ÚNICO lugar onde cor semântica pode entrar (verde/âmbar/vermelho com ícone e texto, nunca só cor).
- "N de M dias" só aqui, com M vindo do servidor (`measuredDaysNeeded`).
- Fora de escopo mesmo então: gauge, nota única, previsão.

## 7. Tamanhos
**Altura reservada (medida, Fase 1, `min-h` por estado e breakpoint):** `formacao` 332 px (mobile) / 272 px (desktop); `fato` 436 px (mobile) / 356 px (desktop) (valores revistos na Fase 2, com a linha da última mudança do menor preço). São os menores valores medidos; o conteúdo vem do servidor e pode crescer. CLS medido do cartão com a flag ligada: 0 (layout-shift observado; os únicos deslocamentos da página, 0,0008 a 0,007, vêm do cabeçalho do site).

**Moldura.** O cartão tem a própria borda (tracejada em `formacao`, sólida em `fato`) e NÃO fica dentro de um `Card` (sem borda dupla); o gráfico e o aviso do selo ficam abaixo dele, sem moldura.

**Mobile 360 px.** Gutter de página 16 px, logo cartão com cerca de 318 px de largura (sem `Card` em volta); padding interno 16 px; espaços verticais 8 px entre linhas e 12 px entre blocos. Preço em `heading-lg` (26/30). Frase de estado em até 3 linhas. Rodapé "Ver detalhes" com altura mínima de 44 px. Altura do cartão RESERVADA (mín-altura por estado) para CLS 0; texto longo nunca empurra o rodapé para fora (quebra de linha, sem corte com reticências no preço).
**Desktop (1024 px ou mais).** Largura da coluna do topo da página, mínimo 320 px e máximo 480 px; padding 20 px; mesma hierarquia (não vira duas colunas). Hover: borda passa para `--color-border-strong`; sem sombra pesada, sem elevar o cartão.
**Camada (resumo, detalhes na Fase 2).** Mobile: tela cheia, `100dvh`. Desktop: caixa centralizada, largura máxima 960 px, altura máxima `calc(100dvh - 64px)`, rolagem interna.

## 8. Affordance "abrir detalhes", acessibilidade e foco
- O cartão inteiro é clicável: um `<button type="button">` com a área expandida sobre todo o cartão (pseudo-elemento cobrindo o cartão), contendo o texto visível "Ver detalhes" do rodapé. O texto do cartão permanece fora do botão no DOM para leitura normal.
- Rótulo acessível (`aria-label`): "Abrir detalhes do preço de {nome curto do produto}". Sem a palavra parecer/afiliado. `aria-haspopup="dialog"` (verdadeiro: abre um `<dialog>` modal), `aria-expanded` refletindo a camada e `aria-controls` apontando o dialog enquanto ele existe.
- Alvo de toque: cartão inteiro (mínimo 44 px de altura no rodapé).
- Cursor pointer no cartão. Hover: ver item 7. Active: fundo `--color-bg-elevated` sem trocar a cor do texto tertiary (evitar queda de contraste; se necessário, tertiary vira secondary no active).
- **Foco visível:** contorno de 2 px sólido `--color-border-focus` (#E0A83B) no tema escuro, deslocado 2 px para fora do cartão (`outline-offset: 2px`), cantos retos; nunca removido. No tema claro o contorno usa `--color-accent-cta` (#8F6A08), porque o dourado do escuro dá só 2,14:1 sobre branco (ver contraste na seção 2).
- Ordem de leitura: título, preço, loja/verificado, frase de estado, cobertura, botão.
- Estados desabilitado: não existe (a camada abre em todos os produtos, decisão 2).
- Ao abrir: foco vai para o botão de fechar; Tab preso na camada; Esc, clique fora e "voltar" do aparelho fecham; ao fechar o foco volta ao cartão.

## 9. Camada "cresce do cartão" (descrição visual)
- Origem: o retângulo do próprio cartão (`getBoundingClientRect`). O cartão permanece no lugar, como espaço reservado, enquanto a camada cresce (sem deslocar a página).
- Duração 300 ms, curva `--ease-out`, sem rebote. Só `transform` (escala e translação) e `opacity`; `clip-path: inset()` apenas para revelar o conteúdo, de modo que o texto não fique esticado.
- Sequência: (1) fundo escurecido `--color-bg-overlay` surge em fade de 200 ms; (2) a caixa passa da geometria do cartão para a final (tela cheia no mobile, caixa centralizada no desktop); (3) cabeçalho e frase "o que sabemos e o que falta" aparecem já no começo; (4) o gráfico e demais painéis só montam ao fim dos 300 ms; enquanto isso, esqueletos retos em `--color-bg-inset` sem animação de brilho.
- Fechar é o inverso, em 250 ms, voltando à geometria do cartão.
- Mobile: fundo sólido (sem `backdrop-filter`), botão de fechar fixo de 44 px no topo.
- Desktop: `--shadow-xl`; sem blur obrigatório.
- **`prefers-reduced-motion: reduce`:** sem crescimento nem translação; apenas fade de opacidade de `--duration-instant` (100 ms) da camada já na posição final.
- A técnica (WAAPI + `<dialog>` nativo) é decisão da ata (D1); este guia só fixa o que se vê.

## 10. O que NÃO aparece (em nenhum estado)
- Botão ou texto de "avisar quando cair" / alerta de preço (slot `data-slot="alerta-preco"` existe oculto, sem altura, `aria-hidden`; sem botão desativado "em breve").
- Previsão, "liberado em X dias", "N de 14", barra de progresso, "melhor momento de compra".
- Nota, estrelas, pontuação, gauge/velocímetro, linha de tendência, sazonalidade.
- Verde, vermelho, âmbar de juízo, selo, ícone de "bom", verbos "compre/aproveite/vale a pena".
- A palavra "parecer", e "afiliado/afiliada/affiliate", em texto visível, `aria-label`, `title`.
- Média e mediana históricas, menor de 30/90 dias/de sempre como destaque (ficam na camada, em "Detalhes").
- "Menor de 90 dias" ou "posição na faixa" com poucos dias; frete estimado; tabela de uma só linha para comparar lojas.
- Imagem nova, ilustração, textura. Uma imagem, um lugar: o cartão não usa imagem.

## 11. Critérios de aceite visual (para o QA da Fase 4)
1. Estados `formação` e `fato` com contorno e rótulo distintos; nenhum pixel de cor semântica.
2. Contraste AA medido em cada texto, incluindo `tertiary` fora de `bg-elevated`.
3. 360 px sem rolagem horizontal; CLS 0 no cartão; foco visível a 2 px dourado.
4. Teste de 5 s com 5 gamers: pelo menos 4 dizem "ainda sem opinião, preço agora X" (e nenhum diz que recomenda comprar).
5. Reduced-motion = fade de 100 ms; tema claro e escuro conferidos em navegador real.
6. Paridade: cartão e camada leem o mesmo `ParecerProduto` (mesmo preço, mesma loja, mesmo N).

## 11b. Camada implementada (Fase 2, atrás de PRODUCT_CARD_V1)
- Componente genérico `src/components/ui/camada-sobreposta.tsx` (`<dialog>` + `showModal()` + FLIP em WAAPI a partir do `getBoundingClientRect` do cartão; 300 ms abrindo, 250 ms fechando, `--ease-out`; só `transform`/`opacity`; o conteúdo recebe a escala inversa para o texto não esticar). Reduced-motion: fade de 100 ms. Esc, clique fora, botão "Fechar" (44 px) e "voltar" do aparelho fecham; foco preso (nativo), devolvido ao botão do cartão; rolagem da página travada com `scrollbar-gutter: stable` (sem salto). Mobile: tela cheia (100dvw x 100dvh, fundo sólido); desktop: caixa centralizada de até 960 px com rolagem interna. Dentro da camada, texto `secondary`/`primary` (nunca `tertiary`, que não passa AA sobre o fundo elevado no escuro).
- Conteúdo (`camada-produto.tsx`, chunk dinâmico só ao abrir; mesmo objeto `ParecerProduto`): cabeçalho com o nome do produto e a identidade da mídia quando conhecida; painéis "O que sabemos e o que falta", "Preço agora", "Lojas de hoje" (só com 2+ lojas), "Última mudança do menor preço" (só com evento) e "Qualidade do dado e como calculamos"; rodapé fixo com "Ir à loja" (mesmo link de saída da página). Sem gráficos (Fase 3), sem alerta, sem cor semântica.
- Fase 3, painéis (ordem na camada: sabemos e o que falta, preço agora, lojas de hoje, última mudança, qualidade e método, histórico do menor preço). O gráfico passou a ser o ÚLTIMO painel de propósito: a altura real dele varia de 760 a 1.250 px (legenda, notas, eventos) e, sendo o último, ao terminar de carregar ele não desloca nada (reservar um valor fixo deixava espaço vazio ou deslocava os painéis abaixo). A caixa da camada tem altura fixa no desktop quando há gráfico. Decisão a confirmar com o dono: isto desvia da ordem D5 da ata (gráfico em segundo); para voltar, basta mover o bloco do gráfico em `camada-produto.tsx` e restaurar uma altura reservada.
- Painel "Histórico do menor preço" (`camada-grafico.tsx`): só com 2 ou mais dias acompanhados (`camada.graficoDisponivel`; abaixo disso fica oculto, sem texto). Dados por `GET /api/produtos/[id]/grafico` e chunk do gráfico pedidos só quando a camada abre; `PriceChartV2` existente em modo `neutro` (sem verde/vermelho; mesmos números). Skeleton, erro ("Tentar de novo") e gráfico partilham a caixa de no mínimo 24 rem; resumo textual para leitor de tela (`sr-only`) e lista de eventos do próprio gráfico.
- Painel "Lojas de hoje" (`camada-lojas.tsx`): só com 2 ou mais lojas distintas (`camada.lojasHoje`). Lista as ofertas elegíveis do dia (preço, vendedor, rede), do menor para o maior preço, por `GET /api/produtos/[id]/lojas` (somente leitura, cache de 60 s, só abre com PRODUCT_CARD_V1 + PRICE_METRICS_V2). Usa as mesmas consultas do "preço agora" (`loadLiveOffers` + `loadOfferMeta`, com `eligibleOfferSql`: sem quarentena, sem rascunho, sem placeholder redundante) e a mesma régua de frescor (48 h) e de faixa plausível; oferta fora da faixa aparece marcada e não entra na contagem. Linhas de altura fixa (56 px): o skeleton reserva exatamente as linhas esperadas (contrato `lojasHoje.ofertas`), 8 visíveis mais "Ver as outras N ofertas" recolhido. Neutro, sem cor semântica.
- Correções do QA da Fase 3: (R1) o painel do gráfico depende de DIAS MEDIDOS (`measuredDaysTotal`, regra única `isChartMeasuredDay`, a mesma do gráfico), não de dias de calendário. (R2) No gráfico da camada (modo `neutro`) a linha pontilhada padrão é a "Mediana das lojas hoje" (valor do meio entre as lojas com preço verificado agora, vindo de `getPriceMetricsV2`); a mediana histórica e a média histórica ficam atrás do botão "Camadas". O gráfico da página não mudou. (R3) No modo neutro o tom terciário vira secundário (rótulos do eixo e notas) e o link "Mudanças anteriores" usa o texto primário sublinhado (o dourado dava 3,25:1 no claro); contraste mínimo medido na camada: 7,63:1 no escuro e 6,11:1 no claro. Alvos de toque do gráfico da camada: 44 px. (R4) As rotas de dados checam a existência do produto por chave primária antes de qualquer métrica; 404 e 400 saem com `s-maxage=300` e nada vai para o cache em memória; `src/proxy.ts` não roda em `/api/produtos`.
- Painel "Qualidade e método" (`camada-produto.tsx`, dados em `camada.metodo` e `camada.qualidade` do `ParecerProduto`; sem rota nova, nada recalculado): explica ao cliente, em linguagem simples, de onde vem o número. Blocos: "De onde vem o preço agora" (menor preço entre as ofertas ativas verificadas nas últimas 48 horas, só item novo e aprovado no catálogo), "O que conta como loja" (vendedor distinto; o mesmo vendedor com duas ofertas conta uma vez; mostra o mesmo texto de lojas do cartão), "O número de cada dia" (cada oferta vale 1 por dia, com o valor do meio explicado entre parênteses), "Há quanto tempo acompanhamos" (o mesmo "Acompanhando há N dias (desde DD/MM)" do cartão, mais a data de corte de 31/10/2026 e, se houver, os dias anteriores do produto) e "Dias medidos" (`measuredDaysTotal` e os dias dos últimos 30 com 3 ou mais lojas, do DTO). A divisão completo/parcial dos dias NÃO existe no DTO e por isso não aparece. Bloco "O que pede cuidado" só com avisos que valem para o produto: poucos dias medidos (menos de 14), só 1 ou 2 lojas, a regra de preços muito fora do normal (limites vêm das constantes da regra, só com 3 ou mais ofertas), vendedor de baixa reputação com o menor preço e a nota de que o "menor preço registrado" ignora esses vendedores. Oculto quando não há preço, nem dia, nem loja. Texto estático vindo do servidor (altura previsível, sem busca de dados), tons primário e secundário, sem jargão ("oferta-dia", "mediana", "afiliado" e "parecer" estão proibidos por teste). Fica antes do gráfico, que segue como último painel. Contraste medido no Chrome: 7,63:1 no escuro e 12,05:1 no claro (mínimos).
- Ajustes do QA do painel "Qualidade e método": (1) o aviso de preços fora do normal só aparece quando há oferta de fato fora da faixa para o produto (`outOfBandOffers`, contagem do DTO pela mesma régua da lista de lojas; texto com a quantidade); (2) o aviso "o menor preço registrado ignora vendedores de baixa reputação" sai da mesma variável da linha do cartão (`menorIgnoraBaixaReputacao`): só quando a linha "Menor preço registrado" está visível; (3) a contagem de lojas passou a usar a mesma régua de frescor do preço agora (cotação e checagem de até 48 h, `ofertaFresca`): em dados reais não havia divergência (0 de 10.118 ofertas com checagem fresca e cotação velha), mas as duas regras agora têm uma única fonte; (4) o bloco "O número de cada dia" diz que, sem cotação no dia, vale o último preço por até 48 horas.
- Fora desta fase e ainda sem decisão do dono: o sinalizador `percentualExtremo` (comparação mais de 50% abaixo do valor do meio) existe no contrato, mas não muda texto nem esconde nada.

## 12. Pendências e riscos
- Rótulo final de `fato` ("Comparado com as lojas de hoje") e a expressão "valor do meio entre as lojas hoje" são recomendação; validar compreensão no teste de 5 s (ata, dúvida do gamer-veterano).
- Contagem de produtos com 3+ vendedores distintos hoje não está medida (Fase 0); define quantos cartões nascem em `fato`.
- Dado de identidade da mídia para o cabeçalho da camada a confirmar com o guardião de catálogo.
- Contraste calculado por razão WCAG com os valores reais dos tokens (script próprio); falta conferir com ferramenta no navegador.
- Tema claro: tokens lidos em `globals.css` e contraste medido (seção 2). Falta override global do foco no tema claro.
