# Plano: cartão-pai de parecer + BI sobreposto na página de produto

Registrado em 2026-11-05 por pedido do responsável. Execução só depois de fechar as fases atuais de métricas (ata `docs/conselho/atas/2026-11-05-plano-metricas-decisao-cliente.md`). Antes de começar, passa pelo Conselho Geek (porte grande).

## Pedido
Em cada produto monitorado, além de gráficos e cartões, ter um **cartão-pai com o parecer sobre a decisão do consumidor**. Ao clicar, o cartão cresce em animação e se sobrepõe à tela. Na camada sobreposta aparece um **BI que explica por que daquela decisão**: gráficos, cartões, indicadores, métricas comparativas e outras informações com insight real para a compra.

## Referência (projeto DIEESE, C:\repositorio\dieese\conjuntura\frontend)
- `js/cartao-modal.js` (ADR 0007): clique em QUALQUER cartão abre modal ampliado; nunca girar o cartão pequeno com scrollbar. Foco preso dentro, Esc fecha, clique fora fecha, foco volta a quem abriu, respeita `prefers-reduced-motion`.
- `css/styles.css` linhas ~310–490: fundo escurecido com blur, caixa com borda no topo, cabeçalho (valor, badge, fechar), corpo em dois painéis (gráfico à esquerda, explicação à direita), empilhado no mobile.
- Diferença pedida aqui: a caixa deve **crescer a partir do próprio cartão** (origem da animação = posição do cartão), em vez de só subir do centro. Técnica a avaliar: transição FLIP / View Transitions API / animação de `transform` + `clip-path` a partir do `getBoundingClientRect` do cartão; fallback sem animação com `prefers-reduced-motion`.

## Conteúdo do cartão-pai (fechado)
Frase de decisão, rótulo (Abaixo do usual / Preço normal / Acima do usual / Histórico curto), preço agora com loja e "verificado há X h", comparação com a mediana das lojas hoje, cobertura ("N lojas"). Decisões já aprovadas: nenhum veredito com histórico curto; mediana das lojas como fato; juízo pela série dos mínimos diários após backtest.

## Conteúdo do BI sobreposto (proposta a validar no conselho)
1. Por que esta decisão: critérios que pesaram, em linguagem simples, com os números.
2. Gráfico de preço (degraus do menor preço, linhas de média e mediana históricas, marcadores de queda, trechos sem dado tracejados).
3. Cartões: preço agora, menor de 30 dias / 90 dias / de sempre (data e loja), média e mediana históricas com dias cobertos, última mudança do menor preço.
4. Comparativo entre lojas hoje (preço, reputação, estoque, verificado há X h), sem frete estimado.
5. Posição do preço na faixa observada, duração do menor preço atual, frequência de quedas.
6. Qualidade do dado: base de dados (ampla/média/pequena), dias medidos, aviso de histórico antigo, método ("como calculamos").
7. Ação: botão de comprar na melhor oferta e criar alerta de preço (fase própria, canais e-mail, site, Telegram e WhatsApp).
Tudo com dado real; lacuna fica lacuna; nada interpolado; cantos retos; tema escuro premium; cliente nunca vê "afiliado".

## Fases propostas
0. Fechar o que está em andamento: medição do legado, observabilidade (`collector_runs`, confirmação de preço), sombra de 3–5 dias.
1. Cartão-pai + frase de decisão na página (substitui o bloco do topo atual atrás da flag).
2. Camada sobreposta com animação (componente genérico reutilizável, acessível, mobile primeiro).
3. Painéis do BI, um por vez (gráfico, cartões, comparativo de lojas, qualidade do dado).
4. QA com navegador (mobile/desktop, claro/escuro, reduced-motion), desempenho (carregar o BI só ao abrir) e publicação atrás da flag.
5. Alerta de preço (reunião própria com jurídico/LGPD, integrador de APIs, backend).

## Restrições
Next 16 (ler a doc em node_modules antes de mexer em rotas); uma imagem, um lugar; sem scraping; sem commit/deploy sem autorização; a camada sobreposta deve carregar dados sob demanda para não pesar a página.
