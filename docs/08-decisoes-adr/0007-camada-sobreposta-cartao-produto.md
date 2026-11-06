# ADR 0007: Cartão do produto com camada sobreposta ("O que sabemos hoje")

Data: 2026-11-05. Status: **Implementada nas Fases 0 a 3 (painéis gráfico e lojas), atrás da flag `PRODUCT_CARD_V1` (exige também `PRICE_METRICS_V2`). Nada em produção: commit, deploy e flag dependem de nova autorização do dono.**
Ata de origem: `docs/conselho/atas/2026-11-05-cartao-pai-bi-produto.md`. Guia visual: `docs/guia-visual-cartao-pai.md`.

## Contexto
A tela de produto entregava medição, não decisão. O dono pediu um cartão-pai por produto que cresce em animação e abre uma camada sobreposta com o porquê (referência: modal ampliado do DIEESE). Veredito/juízo ainda não pode ser emitido: faltam 14 dias de histórico e o backtest (~14/11).

## Decisão
1. **Cartão "O que sabemos hoje"** (sem a palavra "parecer" enquanto o juízo não for liberado). Texto de fato, sem juízo: preço agora, comparação com a mediana das lojas hoje, lojas, "Acompanhando há N dias (desde DD/MM)" sem meta de 14 dias.
2. **Contrato `ParecerProduto`** (`src/lib/pricing/parecer-produto.ts`): estados `formacao | fato | juizo`. `juizo` nunca é emitido (slot desligado por `VERDICT_JUDGEMENT_ENABLED=false`). `fato` exige 3+ vendedores distintos hoje, preço agora e comparação. "Lojas" = vendedores distintos. A UI só lê o contrato; não recalcula métrica.
3. **Camada** em `<dialog>` nativo com `showModal`, animação FLIP (Web Animations API; 300 ms abre, 250 ms fecha, só transform e opacity), Esc, clique fora, Fechar e voltar do histórico; foco devolvido ao botão; `prefers-reduced-motion` = fade de 100 ms; tela cheia no mobile; carregamento dinâmico com prefetch em hover/foco.
4. **Abre em TODOS os produtos; cada painel só aparece com a base mínima** (decisão do dono, 2026-11-05):
   - Gráfico: 2 ou mais **dias medidos** (não dias de calendário), mesma função do gráfico (`isChartMeasuredDay`).
   - Lojas de hoje: 2 ou mais lojas distintas.
5. **Dados sob demanda** por rotas GET somente leitura: `/api/produtos/[id]/grafico` e `/api/produtos/[id]/lojas`. Cache de 60 s, 404 com qualquer flag desligada, UUID validado, checagem de existência por chave primária antes de qualquer métrica, 404/400 com `s-maxage=300`. `api/produtos` fica fora do proxy de sessão.
6. **Elegibilidade única**: o painel de lojas usa as mesmas consultas do "preço agora" (`eligibleOfferSql`): fora quarentena, rascunho e placeholder redundante.
7. **Gráfico na camada** em modo neutro: sem cor semântica; linha pontilhada = mediana das lojas hoje; mediana e média históricas atrás de "Camadas". O gráfico da página não muda. O gráfico é o **último painel** (altura variável de 762 a 1.254 px; assim nada abaixo dele se desloca). Isto desvia da ordem D5 da ata (gráfico em segundo).
8. **Regras de texto e visual**: sem "parecer", sem "afiliado" ao cliente, sem botão de alerta (oculto por decisão), cantos quadrados, contraste AA (mín. medido 7,63:1 no escuro e 6,11:1 no claro na camada do teste).

## Consequências
- Sem analytics de terceiros e sem dado de campo de Web Vitals. A medição de abertura/clique agregada (reaproveitando `analytics_events` sem identificador) e o teste de 5 s com 5 gamers dependem de revisão jurídica da política de privacidade.
- Peso da camada estimado em ~27 kB gzip (esbuild; `next build` falha localmente no `next/font` do Google). Meta: 60 kB.
- Rotas públicas sem limite próprio: recomendado limite por IP no WAF da Vercel para `/api/produtos/*` (ação do dono).

## O que fica de fora
Juízo (Bom/Menor/Acima), alerta de preço (fase própria, com jurídico/LGPD), extremos de 30 e 90 dias (aguardam histórico, ~14 a 17/11), identidade da mídia no cabeçalho (o painel "Qualidade e método" já foi construído), previsão de preço, nota composta.

## Reversão
Desligar `PRODUCT_CARD_V1` restaura a tela anterior sem efeito colateral; as rotas voltam a dar 404.
