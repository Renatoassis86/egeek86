# Cartão de histórico de preço (2026-11-10)

Imagem PNG 1200x675 com a linha do tempo do preço de um produto, para o Telegram (`sendPhoto`, upload) e para o WhatsApp (o dono baixa e cola). Origem: ata `docs/conselho/atas/2026-11-10-mensagens-24h-cupons-storytelling-cobertura.md`, seção 4.

## Arquivos
- `src/lib/pricing/price-card-model.ts`: lógica pura (formatação, truncagem, escala e ticks, elegibilidade, modelo, geometria, legenda). Sem banco.
- `src/server/messaging/price-card.tsx`: leitura do banco e desenho (`next/og`). Exporta `renderHistoryCard(masterProductId, { now? })` -> `{ png, caption, alt } | null`.
- `src/app/api/admin/cartao/[masterProductId]/route.ts`: PNG para o admin (401 sem admin, 404 sem dado, `Cache-Control: no-store`). `?legenda=1` devolve a legenda e o texto alternativo em JSON.
- `scripts/test-cartao-historico.ts`: testes (puros + banco somente leitura).

## De onde vem cada número
- **Série**: `computeDayState` (a regra única do site, ADR 0004), recalculado em memória a partir de `price_daily_offer` **sem as ofertas da rede Amazon** (contrato: cache de preço da Amazon até 24 h; ela nunca entra no histórico). Cada dia medido (`complete` ou `partial`) vira um degrau com o menor preço do dia. Dia sem medição fica em branco e não recebe ligação vertical. Nada é interpolado ou suavizado. Janela: no máximo os últimos 90 dias.
- **Média única**: `computePeriodMetrics` sobre os mesmos dias desenhados (cada oferta vale 1 por dia). Só aparece com 3 ou mais ofertas distintas; sem isso a linha some e a legenda diz que falta base.
- **Menor registrado**: o menor valor entre os dias desenhados (data = primeiro dia em que foi atingido). Se o preço atual for menor que todo o histórico, ele vira o menor registrado ("hoje").
- **Atual**: menor preço hoje entre ofertas ativas, elegíveis (`eligibleOfferSql`), com link pronto, confirmadas há no máximo 6 h, só Mercado Livre e Shopee, com a mesma faixa plausível do site (`computeLiveMinFromOffers`). O carimbo "Atualizado em" é o instante dessa confirmação, não o da geração.

## Quando devolve null
Produto inexistente ou id malformado; menos de 3 dias medidos (constante `CARD_MIN_DAYS`; a ata falava em 5, o pedido de implementação em 3, valeu o pedido); sem preço atual fresco de Mercado Livre ou Shopee. Nunca desenha curva sem dado.

## Visual
Paleta do padrão (canvas `#0B0908`, superfície `#161311`, creme `#F2E9D8`, dourado `#D4AF37` na linha, laranja `#E8721C` só no marcador atual), cantos quadrados, marcadores quadrados, eixo Y com início explícito e nota "Eixo de valores não parte do zero", eixo X com datas reais, rótulo de escopo "menor preço entre as lojas monitoradas", dia com 1 a 2 ofertas em traço mais claro (nota só quando existe). Rodapé: carimbo e `egeek86.com`. Sem emoji, sem seta, sem imagem de `public/images` (gerado em memória).

## Legenda (HTML do Telegram)
Três linhas factuais: menor registrado com data e janela; média entre as lojas; preço de hoje com a rede, a distância ao menor e à média, e o carimbo. Sem previsão, sem "afiliado", sem "de/por". `#publicidade` e o link ficam a cargo de quem monta a mensagem (outra frente).

## Como rodar
- Testes: `npx tsx --conditions=react-server --env-file=.env.local scripts/test-cartao-historico.ts [pasta]` (gera 3 cartões reais e confere assinatura PNG, 1200x675, ausência de Amazon e igualdade da série com `price_daily_state` nos produtos sem Amazon).
- Uso: `const card = await renderHistoryCard(id); if (card) bot.sendPhoto(chat, card.png, { caption: card.caption, parse_mode: 'HTML' })`.

## Limitações
- Fonte única: a Geist Regular embutida no `next/og` (sem negrito). A hierarquia vem de tamanho e cor. Fonte própria exigiria arquivo `.ttf` no repositório (verificar licença e o teto de 500 KB do pacote).
- Custo medido: 0,8 a 2,7 s por cartão (a primeira chamada carrega o wasm do renderizador); PNG de 80 a 90 KB. Dentro do orçamento de 4 cartões por dia e do teto de 60 s do cron.
- Média e mínimo dependem de `price_daily_offer`; o regime de séries confiáveis começa em 31/10 (11 dias hoje).
- Preço atual pode ficar acima do degrau de hoje (o degrau é o menor valor medido no dia; o atual é o menor preço vivo agora). Os dois são reais e aparecem separados.
- A rota admin abre o PNG no navegador; copiar para a área de transferência junto do texto ainda não existe (a ata previa).
