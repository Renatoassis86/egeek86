# Ata do Conselho Geek: cartão-pai de parecer + BI sobreposto na página de produto

- **Data:** 2026-11-05
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados (9, pareceres independentes e em paralelo, somente leitura):** key-user-gamer, bi-dataviz, engenheiro-frontend, engenheiro-performance-web, designer-marca, estatistico-senior, gamer-veterano, estrategista-mercado, qa-verificador.
- **Limitação registrada:** estatístico, estrategista e qa-verificador declararam ter lido só o plano e o briefing (não as atas, o ADR nem o código); performance leu só o gráfico e o plano. Nenhum rodou medição nova. Todo número de desempenho abaixo é meta ou hipótese, não medição.

## Briefing
**Objetivo.** Em cada produto monitorado, um cartão-pai com o parecer sobre a decisão de compra; ao clicar, ele cresce a partir da própria posição e se sobrepõe à tela; na camada, um BI que explica o porquê (gráficos, cartões, indicadores, comparativos, insights reais). Pedido do dono, registrado em `docs/plano-parecer-bi-produto.md`.

**Contexto medido (2026-11-05, atas do mesmo dia).** O regime novo de coleta começou em 31/10: nenhum produto tem 14 dias; 714 têm 5+ dias com 3 ofertas; 40% têm 3+ ofertas; 97% têm uma única rede (ML), 66 têm 2+ redes. O juízo (Abaixo do usual / Preço normal / Acima do usual) está desligado até o backtest (~14/11). Hoje o bloco do topo (`price-metrics-v2-block.tsx`) já mostra fatos, estado "histórico curto" e "Detalhes".

**Já decidido (não reaberto).** Sem veredito com <14 dias/<3 ofertas; mediana das lojas como fato; juízo só após backtest; média/mediana históricas em "Detalhes"; cantos retos, tema escuro premium; cliente nunca vê "afiliado"; dado real sem interpolação; uma imagem, um lugar; alerta de preço é fase própria; Next 16; atrás de flag, sem deploy sem autorização.

**Regras inegociáveis em jogo.** Sem dado fake (lacuna é lacuna); um jogo, uma média só (cartão e BI leem a mesma fonte); toda mudança do menor preço visível (evento com horário, valor e loja); uma imagem, um lugar.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| key-user-gamer | Apoia, mas "parecer" sem veredito frustra; BI com 3 painéis, não 7 | Cartão com fatos e contador; esconder painel sem base; comprar fixo no rodapé; animação curta com transform simples | Teste com 5 a 8 pessoas reais, em 3 tipos de produto |
| bi-dataviz | Favorável, com corte (3 dos 7 painéis são enfeite hoje) | Um gráfico em degraus + mediana das lojas pontilhada + marcadores só em mudança real; cor neutra sem juízo; um painel por vez no mobile | Produtos com 5+ dias e 2+ redes |
| engenheiro-frontend | Aprova, escopo reduzido: casca e fatos agora, juízo atrás da flag | View Transitions preferida, FLIP como alternativa; cartão no servidor, BI por `dynamic()`; foco preso, Esc, fechar de 44 px, tela cheia no mobile | Estabilidade de View Transitions; payload do BI; existência da rota de dados |
| engenheiro-performance-web | Favorável com 2 condições (BI só ao abrir; animação independente de suporte) | `<dialog>` nativo + FLIP em WAAPI (só transform/opacity); chunk dedicado pré-carregado em pointerenter/focus/touchstart; um payload; cache de 60 s | LCP/INP/CLS atuais, tamanho do chunk, latência do endpoint v2, perfil de dispositivos |
| designer-marca | A favor, com a condição de o estado "histórico curto" ter identidade própria | Neutro (sem verde/âmbar) até o backtest; número como herói; guia visual de um slide antes de codar; movimento de 250 a 350 ms sem rebote | Textos finais dos rótulos de juízo (dependem do backtest) |
| estatistico-senior | Aprova, com a condição de o cartão descrever fatos e não recomendar | Objeto único `ParecerProduto` com estado `formação / fato / juízo`; n e janela ao lado de todo número; faixa em vez de percentual com n=3 | Resultado do backtest; distribuição de dias medidos; proporção de séries com buraco |
| gamer-veterano | Apoia com ressalvas | Identidade da mídia (edição, região, físico/digital) no topo; esconder indicador sem base; "menor desde DD/MM" em vez de "menor de 90 dias" com 5 dias | Calendário promocional com fonte; duração típica do menor preço; se o cliente entende "mediana das lojas" |
| estrategista-mercado | Favorável se a camada disser "o que sabemos hoje" | BI enxuto de 3 painéis; abrir a camada só onde há conteúdo; priorizar os 714 produtos; transparência como diferencial | Tráfego por página de produto; saída da página; origem dos cliques de compra |
| qa-verificador | Favorável, com condição de aceite: nada sugere juízo antes do backtest | 10 critérios verificáveis (paridade, texto sem juízo, dado real, a11y, reduced-motion, zero "afiliado", uma imagem, desempenho, flag desligada = página idêntica) | Backtest; tamanho do bundle; INP atual no mobile real |

## Acordos (9 de 9, ou quase)
1. **O estado de hoje é o estado principal.** Nenhum produto tem veredito, então o cartão nasce em "formação" ou "fato", com desenho próprio e final (não um cartão vazio). Conteúdo: preço agora, loja, "verificado há X h", comparação com a mediana das lojas hoje (em R$ e %, só com 3+ lojas distintas) e cobertura ("N lojas", dias medidos).
2. **Sem cor de juízo antes do backtest.** Verde, âmbar, selo, ícone de "bom" e verbo "compre" ficam reservados à variante com juízo. Rótulo neutro. (designer, bi, estatístico, qa)
3. **Um único objeto de servidor alimenta cartão e BI** (proposta do estatístico: `ParecerProduto`, com estado `formação | fato | juízo`, n de ofertas, dias medidos e janelas). A interface nunca recalcula. Paridade por teste automatizado. Reaproveita `getPriceMetricsV2`. Cumpre "um jogo, uma média".
4. **Painel sem base mínima fica oculto ou mostra fato mais aviso, nunca zero, nunca derivação.** Enfeite hoje (6 de 9 citam): "frequência de quedas", "posição na faixa" e "menor de 90 dias/de sempre" quando coincidem com o menor de poucos dias. Quando aparecer, o rótulo diz o que foi medido ("menor desde DD/MM", "observado em N dias").
5. **"Por que esta decisão" não existe sem juízo.** Vira "O que sabemos hoje e o que ainda não sabemos" (funde com qualidade do dado) até o backtest liberar.
6. **Não fingir comparação.** Com 1 loja ou menos de 3 ofertas, o cartão diz "só 1 loja monitorada" e o painel de lojas não aparece (nunca uma tabela de uma linha, nunca um traço que o leitor leria como "preço normal").
7. **Camada sob demanda.** Cartão no HTML do servidor (sem JS novo além do botão); BI em chunk dinâmico fora do bundle inicial, com dados em uma chamada única, só ao abrir; altura do cartão reservada (CLS).
8. **Acessibilidade e mobile.** Foco movido ao abrir, Esc e clique fora fecham, foco volta ao cartão, rolagem do fundo travada; reduced-motion = abertura instantânea ou fade de até 100 ms; mobile em tela cheia (100dvh) com botão de fechar fixo de 44 px e "voltar" do aparelho fechando a camada; fundo sólido (sem `backdrop-filter`) no mobile.
9. **Fora de escopo:** velocímetro/gauge, nota única, previsão, linha de tendência, "melhor momento de compra", sazonalidade sem fonte oficial, frete estimado, alerta de preço, média/mediana históricas como destaque (continuam em "Detalhes").
10. **Dataviz.** Degraus do menor preço (step), mediana das lojas hoje como linha pontilhada, marcadores só em mudança real do menor preço (horário, valor, loja no tooltip), lacunas tracejadas rotuladas "sem coleta", rótulo direto em vez de legenda, marca do início do regime (31/10), sem linha de tendência, resumo textual e tabela alternativa para leitor de tela. Eixo: vale a decisão da ata de gráficos (nota "eixo não começa em zero" quando truncado).

## Divergências e resolução
- **D1. Técnica da animação.** View Transitions (frontend, designer, qa) contra FLIP manual (performance, key-user, mais o fallback do designer/qa). **Resolvida pela doc do projeto:** `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/viewTransition.md` marca `experimental.viewTransition` como experimental, e o guia trata de navegação entre rotas, não de "crescer do cartão". **Decisão da mesa: FLIP com Web Animations API (só `transform`/`opacity`; `clip-path: inset()` só para revelar o conteúdo) sobre `<dialog>` nativo com `showModal()`; View Transitions fica como melhoria progressiva futura, nunca como caminho principal.** Duração de até 300 ms, sem rebote. O gráfico monta quando a animação termina (pedido do bi-dataviz); o fetch e o chunk correm em paralelo com a animação (pedido da performance), então as duas condições se cumprem.
- **D2. Contador "N de 14 dias" no cartão.** Key-user, designer, estatístico, estrategista e gamer-veterano recomendam um contador de progresso como forma de transformar a espera em promessa. **O presidente registra um conflito com o código e com a decisão vigente:** `price-verdict-v2.ts` exige 10 dos últimos 14 dias medidos com 3+ lojas (não "14 dias"), e com o juízo desligado o bloco atual diz "Sem veredito por enquanto: o método está em validação". Prometer "liberado em X dias" antes de o backtest aprovar cria uma promessa que pode ser quebrada. **Recomendação:** enquanto o juízo estiver desligado, o cartão mostra "Acompanhando há N dias (desde DD/MM)", sem meta; o "N de M" só aparece com o juízo habilitado, e M vem do servidor (`measuredDaysNeeded`), nunca fixo no texto. Vai ao dono (decisão 1).
- **D3. O nome "parecer".** Key-user, designer, estatístico e qa: sem juízo, não chamar de parecer. O plano e o pedido do dono usam "parecer". **Recomendação:** sem juízo, o cartão se chama "O que sabemos hoje"; "Parecer" só na variante com juízo. Vai ao dono (decisão 3).
- **D4. Abrangência do clique.** O pedido do dono diz "em cada produto monitorado"; o estrategista e o key-user pedem a camada só onde há conteúdo. **Recomendação:** o cartão existe em todos os produtos; só é clicável quando há o mínimo para a camada valer (a definir com o bi-dataviz, por exemplo 2 ou mais dias medidos e 2 ou mais pontos no gráfico, ou ao menos um evento de mudança do menor preço). Os demais mostram o cartão informativo, sem promessa de BI. Vai ao dono (decisão 2).
- **D5. Ordem dos painéis.** Gráfico primeiro (bi, estrategista, key-user, estatístico) contra fatos de hoje e lojas primeiro (qa, frontend). **Resolvida:** abre com uma frase "o que sabemos e o que falta" (2 linhas, cobre os fatos de hoje), depois gráfico com eventos, lojas hoje (condicional), extremos observados, qualidade do dado e "como calculamos". O que o dono mais valoriza (toda mudança do menor preço visível) fica no segundo bloco, com a linha do tempo dos eventos.
- **D6. Duração do menor preço atual.** Insight real para designer e estatístico, enfeite para o bi-dataviz. **Resolvida:** não vira indicador próprio; já está coberta pelo "último evento do menor preço" (valor, horário, loja, valor anterior), que é regra do dono.
- **D7. Botão "avisar quando cair".** Key-user quer o botão desativado "em breve"; designer, frontend e estrategista preferem o espaço reservado e oculto (já existe `data-slot="alerta-preco"`); gamer-veterano quer só um botão de ação. **Recomendação:** não mostrar botão desativado (promete algo que não existe; a fase própria passa por LGPD) e manter o slot oculto. Comprar fica fixo no rodapé da camada. O dono pode vetar.
- **D8. Identidade da mídia (só o gamer-veterano).** Edição, região, cross-gen e físico/digital no cabeçalho da camada. **Aceita, como cabeçalho e não como painel, e só se o dado já existe** (regras de identidade da cesta). Dado a confirmar com o guardião de catálogo.
- **D9. Sucesso por clique de compra.** Frontend e estrategista medem saída para a loja; o bi-dataviz alerta que isso pode subir por empurrar, não por informar. **Resolvida:** a métrica primária é compreensão e abertura; saída para a loja é secundária.

## Pontos do presidente (não vieram dos pareceres)
1. **"Lojas" no código são vendedores distintos, não redes.** `storesToday` usa a chave vendedor (ou a rede se faltar). Vários pareceres trataram "97% com rede única" como "sem comparação entre lojas"; o comparativo, na verdade, depende de 3 ou mais vendedores distintos hoje (40% têm 3+ ofertas, mas não está medido quantos têm 3+ vendedores). O rótulo precisa dizer a verdade: quando a rede é única, "N vendedores no Mercado Livre", não "N lojas de marketplaces". A contagem é o dado a medir antes de dimensionar o painel.
2. **O "verificado há X h" fica congelado no cache.** `agoLabel` em `price-metrics-v2-block.tsx` calcula com `Date.now()` no servidor; com a página em cache o texto envelhece sem mudar (risco apontado também pelo estatístico). No cartão, passar o instante ISO e calcular "há X h" no cliente, ou garantir a revalidação; escolher na fase 1.
3. **A referência do DIEESE anuncia "foco preso", mas o código não o implementa** (`cartao-modal.js` só foca o botão fechar e devolve o foco; não há laço de Tab). Não copiar a implementação; usar `<dialog>` nativo (foco preso, Esc e `inert` de graça) e testar no iOS.
4. **Prefetch em pointerenter/focus** pode multiplicar leituras no banco (cada passada de mouse). Exige cache por produto (a performance sugere 60 s com `unstable_cache`; verificar antes se o Next 16 deste projeto mantém essa API ou pede `use cache`, conforme a doc em `node_modules/next/dist/docs`) e limite de uma busca por produto por sessão.
5. **Eventos de uso (abertura, clique) exigem checar** o que o site já mede e o que a revisão legal de 2026-11-03 permite; não está verificado se existe analytics.

## Vetos
Nenhum veto sobre regra inegociável. Condições de aceite registradas como bloqueio de entrega:
- Estatístico: nenhum rótulo de juízo com <3 ofertas ou <14 dias (teste que falha se acontecer).
- Designer: nenhuma cor semântica em estado de histórico curto (revisão de QA).
- QA: flag desligada = página idêntica à atual; cartão e BI saem da mesma função (teste de igualdade em 10 produtos reais); zero "afiliado/afiliada/affiliate" em texto visível, `aria-label` e `title`.

## Decisão (plano em fases)
Tudo atrás de flag própria, desligada por padrão; sem commit, migration nem deploy sem autorização; sem imagem nova (se houver, "uma imagem, um lugar"). O BI não aumenta a escrita no banco: lê as tabelas sombra e o que `getPriceMetricsV2` já entrega.

| Fase | O que | Responsáveis | Métrica de sucesso (aceite) |
|---|---|---|---|
| 0. Base | Medir antes de construir: LCP/INP/CLS atuais da `/ofertas/[slug]` (campo, se existir, e emulação mobile), latência e payload de `getPriceMetricsV2`, nº de produtos com 3+ vendedores distintos, com 5+ dias, com 2+ redes. Confirmar existência de analytics e o que a revisão legal permite. Confirmar dado de identidade da mídia. | performance-web, cientista-dados-tempo-real, guardiao-catalogo, qa | Linha de base registrada nesta ata. Sem ela, "não piora" não é verificável |
| 1. Cartão-pai | Contrato `ParecerProduto` no servidor; cartão renderizado no servidor nos estados `formação`/`fato` (variante `juízo` como slot desligado), substitui o bloco do topo atrás da flag; guia visual de um slide em `padrao-visual-egeek` com os 3 estados antes de codar | engenheiro-backend, estatistico-senior (revisão), designer-marca + bi-dataviz (guia), engenheiro-frontend | Paridade 100% cartão e BI; zero rótulo de juízo; CLS 0 no cartão; teste de 5 s com 5 gamers: pelo menos 4 de 5 dizem "ainda sem opinião, preço agora X" |
| 2. Camada | Componente genérico de camada que cresce do cartão (`<dialog>` + FLIP/WAAPI), a11y completa, mobile em tela cheia, reduced-motion; sem dado, só o esqueleto | engenheiro-frontend, engenheiro-performance-web | 60 fps em emulação com CPU 4x e em Android de baixa gama real; clique até o primeiro quadro p75 < 100 ms; INP < 200 ms; teste só de teclado e leitor de tela ok |
| 3. Painéis, um por vez | Rota de dados + chunk sob demanda; ordem: "o que sabemos e o que falta", gráfico com eventos, lojas hoje (condicional), extremos observados, qualidade e método; identidade da mídia no cabeçalho; comprar no rodapé | engenheiro-backend, bi-dataviz, engenheiro-frontend, performance-web | Chunk < ~60 kB gzip (meta, a validar); dados prontos p75 < 600 ms; painel sem base oculto; LCP/CLS p75 não pioram em relação à fase 0 |
| 4. QA e flag | Os 10 critérios do qa-verificador, captura de tela do estado "sem juízo" e dos casos de borda (1 oferta, 1 rede, lacuna, 5 dias), claro/escuro, 360 px, reduced-motion; ligar só com autorização do dono | qa-verificador, engenheiro-software-principal (revisão) | 100% dos critérios verdes antes de ligar a flag |
| Marco (depois de ~14/11) | Backtest libera ou não o juízo: variante com juízo, painel "Por que esta decisão", extremos 30/90 dias, textos dos rótulos | estatistico-senior, cientista-precos, designer-marca | Após liberar: acerto do rótulo contra o menor preço dos 7 dias seguintes, com intervalo de confiança |
| 5. Alerta de preço | Reunião própria (LGPD, integrador-apis, backend, dba) | geek-lead | Fora desta ata |

O que dá para construir antes do backtest (unânime): fases 0 a 4 completas no estado `formação`/`fato`. Só o juízo, o painel de critérios e os extremos 30/90 dias esperam.

**Fica de fora:** ver acordo 9. **ADR proposto (a escrever só depois da aprovação do dono):** ADR 0007 do Espaço Geek 86, "Camada sobreposta de produto: `<dialog>` + FLIP, estados do cartão e contrato `ParecerProduto`" (numeração do repositório, sem relação com o ADR 0007 do DIEESE).

## Métrica de sucesso
- **Primária:** compreensão (teste de 5 s: pelo menos 4 de 5 não dizem que o cartão "recomenda comprar") e taxa de abertura (aberturas por visita).
- **Guarda-corpo:** p75 de LCP, INP e CLS não pioram em relação à fase 0; CLS < 0,05; paridade cartão/BI 100%; zero juízo antes da liberação; zero reclamação de "preço enganoso".
- **Secundárias:** saída para a loja depois de abrir a camada contra sem abrir; retorno em 7 dias; abandono logo após ver o estado "formação" (sinal negativo); proporção de cartões em `formação`, `fato` e `juízo`, semanal.
- Conferir 14 dias depois de ligar a flag e registrar na retrospectiva.

## Decisões que cabem ao dono (uma pergunta por vez, com recomendação)
A ordem é a de dependência. **Respondidas pelo dono em 2026-11-05 (ver abaixo).**

1. **O que o cartão diz sobre prazo enquanto o juízo está desligado?** Opções: (a) "Acompanhando há N dias (desde DD/MM)", sem meta; (b) "N de 14 dias para opinar". **Recomendação: (a).** A (b) promete um veredito que depende de um backtest que pode reprovar; o "N de M" entra quando o juízo for habilitado, com M vindo do servidor.
2. **Em todo produto monitorado a camada abre?** (a) Cartão em todos, camada só onde há conteúdo mínimo; (b) camada em todos, mesmo vazia. **Recomendação: (a).** Cumpre "cada produto tem o cartão" e evita clicar para ver um gráfico quase vazio (risco do estrategista e do key-user).
3. **Nome do cartão sem juízo.** (a) "O que sabemos hoje", passando a "Parecer" quando houver juízo; (b) "Parecer" desde já. **Recomendação: (a).** Chamar de parecer algo que não opina é o erro que o conselho quer evitar.
4. **Botão "avisar quando cair" desativado "em breve"?** **Recomendação: não;** manter só o espaço reservado e oculto até a fase própria.
5. **Medição de uso.** Autoriza medir abertura e clique de forma agregada (sem identificar pessoas, sujeito à checagem de LGPD e do que já existe) e recrutar 5 gamers para o teste de 5 segundos? **Recomendação: sim.** Sem isso a métrica de sucesso não se confere.
6. **Autoriza iniciar a fase 0 e a fase 1 atrás de flag própria?** **Recomendação: sim**, começando pela fase 0 (somente leitura e medição), porque nenhuma meta de desempenho é verificável sem a linha de base.

## Decisões do responsável (2026-11-05)
1. **(a)** "Acompanhando há N dias (desde DD/MM)", sem meta de 14 dias. O "N de M" só entra quando o juízo for habilitado.
2. **Camada abre em TODOS os produtos** (diverge da recomendação). Cada painel aparece sozinho quando atinge a base mínima; sem base, fica oculto. No produto novo a camada abre só com o que tem base real: preço agora (loja, "verificado há X h"), lojas de hoje, qualidade do dado/método, "Acompanhando há N dias".
3. **(a)** Título "O que sabemos hoje"; vira "Parecer"/"Nossa leitura" só quando houver juízo liberado.
4. **(a)** Botão "avisar quando cair" oculto até a fase do alerta.
5. **(a)** Medição agregada de abertura e clique de compra (sem identificar pessoas, sujeita à checagem LGPD) e teste de 5 s com 5 gamers.
6. **(a)** Autorizadas a fase 0 (medição somente leitura) e a fase 1 (cartão-pai) atrás de flag própria, desligada. Sem deploy nem ligar a flag sem nova autorização. ADR 0007 do Espaço Geek 86 a escrever junto da fase 1.

## Execução e verificação
- Executores previstos: engenheiro-backend, engenheiro-frontend, bi-dataviz, designer-marca, engenheiro-performance-web (ver plano).
- QA: `qa-verificador` e `checklist-publicacao` antes de declarar concluído. Nada executado nesta reunião (somente leitura e esta ata).

## Retrospectiva
Preencher após a flag entrar no ar e 14 dias de medição.

## Fase 0: linha de base (2026-11-05)
Medição somente leitura (sem alterar código do app, sem commit, migration ou deploy). Os scripts temporários de leitura (`connect()` de `scripts/_dup-shared.ts`, `tsx --conditions=react-server`) foram apagados após o uso. `tsconfig.json` e `next-env.d.ts` intactos (hash do tsconfig conferido: AB4F655F).

### 1. Web Vitals da `/ofertas/[slug]` em produção (www.egeek86.com)
- **Método:** Chrome real da máquina do responsável (extensão), `PerformanceObserver` (LCP, layout-shift, longtask) e Navigation Timing, em 2 produtos: com 3+ ofertas (`resident-evil-revelations-xbox-one-fisico-153113631`) e com 1 oferta (`streets-of-rage-4-anniversary-edition-nintendo-switch-midia-fisica-shopee-f70d1f`). Uma carga fria (a primeira da sessão, só no produto com 3+ ofertas) e 2 repetições de cada produto.
- **Resultado (viewport de 1536 px, sem throttling de CPU nem de rede):**

| Produto | Carga | TTFB | FCP = LCP | CLS | Long tasks (TBT aprox.) |
|---|---|---|---|---|---|
| 3+ ofertas | 1ª (fria, sem cache de navegador) | 615 ms | 7192 ms | 0 | 4 (135 ms) |
| 3+ ofertas | 2 repetições | 78 / 104 ms | 1760 / 2388 ms | 0,0009 / 0 | 1 (44 ms) / 0 |
| 1 oferta | 2 repetições | 86 / 83 ms | 1524 / 1932 ms | 0 / 0 | 0 / 1 (84 ms) |

  Carga fria: documento de 17 KB, 44 requisições, cerca de 369 KB de JS e 834 KB no total (transferência). O elemento do LCP é um `DIV` absoluto e centralizado, com a mesma marca de tempo do FCP: parece uma camada de entrada ou animação, não a imagem do produto. **Hipótese, não verificada:** o LCP é ditado por essa camada; confirmar no código ou nas DevTools antes de atribuir meta ao cartão.
- **Limitações (não medido):** (a) redimensionar a janela para 412 px não mudou o viewport (`innerWidth` ficou 1536): **não há emulação mobile**; (b) **sem throttling de CPU 4x nem de rede**; (c) as repetições usaram cache do navegador (transferência de 6 a 525 KB), então não representam visita nova; (d) uma carga fria só, n = 1, **sem p75**; (e) **INP não foi medido** (exige interação real; só há long tasks como proxy); (f) a API do PageSpeed Insights respondeu 429 (cota diária sem chave), então não há Lighthouse mobile nem dados CrUX; instalar Lighthouse por `npx` exigiria baixar pacote, o que não foi feito sem autorização.
- **Para fechar a linha de base:** Lighthouse mobile (com autorização para o download ou uma chave de PSI) ou DevTools com emulação de celular e CPU 4x, 5 cargas por produto, e INP com uma interação real.

### 2. Latência e payload de `getPriceMetricsV2`
- **Método:** chamada direta da função (cache SWR em memória) para os **1692 produtos** com estado diário desde 31/10, de uma máquina local contra o banco de produção (pooler 6543), 4 chamadas concorrentes, todas a frio (chaves distintas); mais 20 chamadas sequenciais (12 produtos com 3+ lojas e 8 com 1 loja).
- **Resultado:** 1692 de 1692 sem erro. Concorrente (4 em paralelo, inflado por fila e por ida e volta local): p50 1380 ms, p75 1422 ms, p95 2056 ms, máx 2926 ms. **Sequencial (mais próximo do uso real):** p50 703 ms com 3+ lojas e 706 ms com 1 loja; máx 3060 ms (produto com 24 lojas) e 1443 ms (63 lojas). Chamada quente (cache): p50 0,06 ms, máx 0,65 ms. Payload JSON serializado: p50 1689 bytes, p95 1817, máx 1904 (cerca de 1,7 KB, quase independente do nº de lojas, pois só agrega).
- **Leitura:** o payload é desprezível; o custo é de idas e voltas ao banco (cerca de 7 consultas). Na Vercel a latência pode ser menor ou maior: **não medido lá**. A meta da fase 3 (dados prontos p75 < 600 ms) **não é atingida a frio** nesta medição (cerca de 700 ms). O produto de 1 loja custa o mesmo que o de várias.
- **Limitação:** a função não devolve a série do gráfico; o payload do BI (gráfico, eventos, lojas) terá de ser medido na rota de dados da fase 3.

### 3. Contagens no banco
Base: 1692 produtos com estado diário desde 31/10. "Lojas" = vendedores distintos hoje, como `storesToday` (saída exata do código, via `getPriceMetricsV2`).

| Critério | Produtos | % de 1692 |
|---|---|---|
| Preço agora disponível (oferta viva até 48 h) | 1625 | 96% |
| Sem preço agora (lacuna) | 67 | 4% |
| 3+ vendedores distintos hoje | **592** | 35% |
| Exatamente 2 vendedores | 250 | 15% |
| Exatamente 1 vendedor | 783 | 46% |
| 5+ dias de acompanhamento (`trackingDays`) | 1632 | 96% |
| 5+ dias com 3+ lojas no dia (`quality = complete`) | 714 | 42% |
| 3+ vendedores hoje e 5+ dias de acompanhamento | 569 | 34% |
| 5+ oferta-dias em 30 d e 3+ ofertas distintas (`period30`) | 801 | 47% |
| 2+ redes com oferta viva (SQL aproximado; 1626 produtos da base com oferta viva) | **65** (64 também com 3+ vendedores) | 4% |
| 14+ dias de acompanhamento | **0** | 0% |

Maior duração observada: 6 dias (regime novo desde 31/10). O 14+ só passa de zero em 14/11; o juízo exige 10 dos últimos 14 dias com 3+ lojas, então o primeiro produto só pode ficar apto por volta de 14 a 17/11. Qualidade do estado diário no regime novo: 4223 dias `complete`, 4826 `partial`, 7 `gap`.
- **Ressalva:** a contagem de redes (65) é por SQL aproximado (ativa, preço > 0, fora de quarentena, checada em 48 h), sem o portão do catálogo nem a faixa plausível; bate com os 66 da ata. As demais linhas vêm da própria `getPriceMetricsV2`.
- **Implicação para a camada em todos os produtos (decisão 2 do dono):** 46% têm 1 vendedor e 4% não têm preço agora, então "lojas de hoje" só aparece em 35%; nos demais a camada abre com preço agora, qualidade do dado e "Acompanhando há N dias". Rótulo correto com rede única: "N vendedores no Mercado Livre", não "N lojas".

### 4. Analytics, privacidade e consentimento (relato, não parecer jurídico)
- **Analytics de terceiros: não existe.** Sem `@vercel/analytics`, `@vercel/speed-insights`, `next/script`, gtag, Plausible, PostHog ou similar em `package.json` e em `src/app`. Igual à ata de 2026-11-03 (revisão legal). **Não há dado de campo de Web Vitals** (nem Speed Insights, nem RUM próprio). A ata de 03/11 cita "barra da Vercel ativa" como risco; não foi verificada nas configurações da Vercel (só o código foi lido).
- **Existe um log próprio:** tabela `analytics_events` (`src/db/schema/analytics.ts`), hoje só com o evento `affiliate_click`, gravado por `src/app/go/[slug]/route.ts` (propriedades: oferta, rede, slug, preço no clique; contexto: `referer` e `userAgent`; não grava IP, `user_id`, `anonymous_id` nem `session_id`; sem deduplicação, bots e prévias de link contam). Fonte: `docs/rastreio-cliques-e-conversoes-2026-10-31.md` e `docs/PROJECT_BLUEPRINT.md`. Leitura em `src/server/queries/affiliate-clicks.ts`.
- **O que a política diz** (`src/app/(shop)/privacidade/page.tsx`, atualização de 18/07/2026, e a ata de 03/11): cookies só de sessão de autenticação (`sb-...-auth-token`) e `theme`, "necessários para o funcionamento"; sem banner; dados coletados: e-mail de login, perfil, watchlist e lances; usos: alertas, leilões e prevenção a fraude. **A política não menciona** o log de cliques nem medição agregada de uso. A revisão de 03/11 tinha pendências (marcadores a preencher, validação por advogado, decisão do dono).
- **Para o dono e o jurídico decidirem (não decidido aqui):** (i) contagem agregada de abertura da camada e clique de compra, reaproveitando `analytics_events` sem identificador, é a rota técnica de menor impacto; (ii) a política não descreve essa finalidade, então talvez precise de uma linha antes de ligar; (iii) qualquer cookie ou ID persistente sairia do que a política diz hoje e pode exigir consentimento: a métrica "retorno em 7 dias" **não é medível** sem isso; (iv) a tabela não deduplica, então "aberturas por visita" exige regra própria (por exemplo, 1 evento por oferta por sessão sem identificador, a validar).

### 5. Identidade da mídia disponível no master (cabeçalho da camada)
- **Colunas em `master_products`:** `game_format` (physical, digital, unknown), `game_platform_gen` (ps4, ps5, switch_1, switch_2, xbox_one, xbox_series, xbox_360, unknown), `game_edition_type` (full_game, bundle, dlc, unknown, entre outros), `game_edition_source`, `product_type` (game, console, accessory), `release_year`, `manufacturer`, `gtin`. **Não existe coluna de região**; `attributes` (jsonb) só traz chaves alheias (`synopsis_source`, `formatEvidence`, `formatEvidenceAt`, `discovery`). Região só sairia do título (derivação); a ADR 0006 trata região como fator que separa produtos, mas não como campo.
- **Cobertura nos 1692 produtos:** 1270 jogos, 324 acessórios, 98 consoles. Entre os 1270 jogos: formato conhecido em 1255 (todos físicos; 15 `unknown`); plataforma conhecida em 1235 (35 `unknown`, 2,8%); **edição `unknown` em 382 (30%)**, `full_game` 885, bundle 2, DLC 1. Nenhum digital no recorte.
- **Leitura:** formato e plataforma estão prontos para o cabeçalho; edição só em 70% dos jogos (o restante fica sem o campo, sem inventar); região e cross-gen não existem como dado. Acessórios e consoles têm só tipo e plataforma quando aplicável. Confirmação final com o guardião de catálogo ainda pendente.

### O que impede cada meta (resumo)
- **"LCP/CLS p75 não pioram" (fase 3):** sem p75 nem emulação mobile, a base é só indicativa (n = 1 a frio, LCP de 7,2 s em desktop sem throttle; CLS próximo de 0). Precisa de Lighthouse mobile ou de ligar RUM; não há dado de campo.
- **"INP < 200 ms" (fase 2):** INP nunca foi medido; só long tasks (até 135 ms de TBT aproximado).
- **"Dados prontos p75 < 600 ms" (fase 3):** a leitura do v2 custa cerca de 700 ms a frio (p50), acima da meta; medido fora da Vercel.
- **Camada em todos os produtos:** 46% com 1 vendedor e 4% sem preço agora; "lojas de hoje" só em 35% (592); 2+ redes em 65.
- **Contador "N de 14 dias":** zero produtos com 14+ dias até 14/11 (a decisão 1 do dono já evita a meta).
- **Medição de uso:** possível via `analytics_events` sem identificador, mas a política não descreve a finalidade; "retorno em 7 dias" não é medível sem ID persistente.

## Retrospectiva parcial (Fases 0 a 3, 2026-11-05)
- **Feito (local, atrás de `PRODUCT_CARD_V1`):** contrato `ParecerProduto`, cartão, camada sobreposta, painel do gráfico (modo neutro), painel "Lojas de hoje", duas rotas de dados somente leitura. Registro: ADR 0007.
- **QA da Fase 3:** aprovado com ressalvas. R1 (painel de gráfico por dias medidos), R2 (mediana das lojas hoje como linha padrão), R3 (contraste) e R4 (existência por chave primária, cache negativo, proxy) corrigidos e conferidos. Testes: parecer 305, verdict-v2 113, chart-model 65, daily-state 64; `tsc` limpo.
- **Desvio da ata:** gráfico é o último painel da camada (D5 previa o segundo), para eliminar deslocamento de layout.
- **Métrica de sucesso:** ainda não medível; nada em produção. Conferir após o deploy: abertura da camada, 5-second test, LCP/CLS sem piora.
- **Pendências:** extremos 30/90 dias (histórico ~14 a 17/11), painel de qualidade/método, identidade da mídia, Lighthouse mobile (autorização), regra de percentual extremo (decisão de negócio), WAF por IP (dono), revisão jurídica da medição, S2 (título do painel de lojas), eventos de menor preço possivelmente desatualizados (investigar à parte).
- **Não autorizado ainda:** commit, deploy e ligar flags.
