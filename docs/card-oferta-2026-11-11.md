# Card de oferta (PNG 1080x1080) para Telegram e WhatsApp

Pedido do dono (2026-11-11): card na identidade do site, com logo, capa, valor e um insight. "O menos é mais."

## Arquivos
- `src/lib/pricing/offer-card-model.ts`: lógica pura (insight por prioridade, truncagem, moeda, carimbo, frescor, geometria).
- `src/server/messaging/offer-card.tsx`: `loadOfferCardInput(offerId, { now? })` e `renderOfferCard(input)` (`{ png, alt } | null`).
- `src/app/api/admin/card/[offerId]/route.ts`: visualização para o admin (`?alt=1` devolve o texto alternativo). `Cache-Control: no-store`.
- `scripts/test-card-oferta.ts`: testes puros + geração de 4 cards reais (somente leitura).

## Composição (ordem visual)
Logo oficial (`public/geek 86.png`, lida do disco e embutida como data URI; nada copiado para `public/images`), capa em painel escuro de cantos
quadrados (`contain`), título em até 2 linhas, preço dominante com "no Mercado Livre" ao lado, UMA linha de insight (acento dourado, única cor
de destaque), rodapé com `egeek86.com` e "Conferido em dd/mm às hh:mm (Brasília)". Sem gráfico, sem selos.

## Dados
- Preço: `current_price_cents` da própria oferta. Só se ativa, elegível, com link pronto e confirmada há até 6 h (Amazon até 24 h); senão `null`.
- Capa: `affiliate_offers.image_url` buscada na renderização (timeout 5 s, em memória). Falha ou formato ilegível: card sem capa, título em destaque.
- Série do insight: a mesma regra do site (`computeDayState`, oferta-dia, ADR 0004), sem Amazon. Amazon só compara com o último preço dela mesma.

## Insight (prioridade; só fato medido)
1. Novo menor registrado: preço abaixo do menor diário medido antes de hoje (série com 3 dias ou mais): "Menor preço desde 31/10".
2. Queda de 5% ou mais contra o último preço da própria oferta: "Caiu 9% desde ontem" (ou "desde dd/mm").
3. 10% ou mais abaixo da média única (3 ofertas ou mais): "R$ 187 abaixo da média das lojas".
4. Perto do menor (até 3% acima) ou igual: "A 2% do menor preço registrado".
5. Nenhum: a linha é omitida.
Amazon: só a regra 2. Nunca promessa de preço futuro, "de/por", "% OFF" de marketplace nem a palavra "afiliado".

## Limitações
- "Menor preço desde 31/10": a série medida começa em 31/10/2026 (início do regime oferta-dia); o texto cita essa data, não "de todos os tempos".
- Todas as ofertas da Amazon hoje não têm `image_url`; o card dela sai sempre sem capa (título em destaque).
- A fonte do satori é a Geist Regular embutida no Next (sem negrito); o destaque vem do tamanho.
- Quem liga ao envio deve tratar `null` (oferta inativa, inelegível ou sem preço fresco) como "não enviar".
