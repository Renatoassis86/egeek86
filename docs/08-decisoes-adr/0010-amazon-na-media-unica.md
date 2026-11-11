# ADR 0010 (RASCUNHO): Amazon na média única oferta-dia

- Data: 2026-11-11. **Status: proposto, aguardando decisão D1 do dono.** Não implementado.
- Emenda a: regra "Um jogo, uma média só" do `AGENTS.md` (texto "TODAS as ofertas de TODAS as lojas") e ao ADR 0004 (peso por oferta-dia, mínimo de 3 ofertas); complementa o ADR 0009.
- Ata: `docs/conselho/atas/2026-11-11-amazon-na-media-unica.md`. Plano: `docs/plano-amazon-na-media-2026-11-11.md`.

## Contexto
Desde 2026-11-10 a coleta assistida grava preços da Amazon (351 ofertas, games). O cálculo diário já as inclui, mas cartões e mensagens as excluem (regra de 10/11). A régua nova de mensagens (>= 10% abaixo da média única) bloqueia a Amazon sem média. O dono decidiu que a Amazon não pode ficar fora do hub.

## Decisão proposta
1. A Amazon entra na média única oferta-dia (peso 1 por oferta, mediana do dia) de produtos `games` quando a identidade com o master (marca, linha, modelo, capacidade/tamanho, edição, plataforma, voltagem, região, condição nova) passa nos portões duros; identidade em dúvida = `draft`, fora da média.
2. Frescor: confirmada nas últimas 24 h e sem ausência na busca; sem leitura recente a oferta sai da média, não da loja.
3. Amazon-only: menor preço e histórico próprio; média só com 3+ ASIN; rótulos "Só na Amazon" e "média na Amazon".
4. Selo, gráfico, cabeçalho e mensagens usam a mesma média; mensagens da Amazon mantêm carimbo "Preço na Amazon em dd/mm às hh:mm, sujeito a alteração." e não citam outras lojas.
5. Flag `PRICE_AMAZON_MODE` = off | shadow | on; padrão off; voltar a off é a reversão.

## Riscos aceitos (a confirmar pelo dono)
Contrato da Amazon: 1(h) cache 24 h, 1(c)-(e) agregar/analisar, 6(z) outros varejistas, 6(y) alerta de preço, 2(b), 6(c), cláusula 5. Possível suspensão da conta de Associados e retenção de comissões.

## Reversão
`PRICE_AMAZON_MODE=off` (leitura exclui a Amazon; nenhum dado apagado). Reprocesso de dias fechados por script com backup e log.

## Emenda sugerida ao AGENTS.md (só após aceitar)
Incluir: "Ofertas da Amazon entram na média do produto quando a identidade é verificada; produto só na Amazon usa só as ofertas da Amazon, sem rótulo de média das lojas."

## Implementação da fase 1 (2026-11-11), atrás da flag, Amazon DESLIGADA por padrão
Decisões D1 a D5 aprovadas pelo dono (risco contratual aceito por ele). Nada ligado em produção.
- Flag `PRICE_AMAZON_MODE` (off | shadow | on, padrão off), lida SÓ em `src/lib/pricing/amazon-mode.ts` (`getAmazonMode`, `amazonScope`, `amazonCountsIn`).
- Leitura única das ofertas das métricas: `loadOffers` (`src/server/pricing/price-daily.ts`) com filtro SQL `amazonScopeSql`; cartões, "preço agora" e "lojas de hoje" usam a mesma regra.
- Frescor da Amazon: 24 h pela confirmação do preço (`last_price_confirmed_at`, que a coleta assistida atualiza a cada leitura) e `consecutive_miss_count = 0`; sem migration.
- Sombra: o job `refresh-price-daily` grava o resumo "média pública x média com Amazon" em `collector_runs.meta.amazonShadow` (via cron).
- Mensagens (modo on): Amazon com média passa na régua de 10%; Amazon-only (menos de 3 ASIN) usa a mediana de 14 dias do próprio ASIN (mínimo 7 dias); sem "média das lojas" e sem citar outra loja; carimbo obrigatório.
- Reprocesso dos dias fechados: `scripts/reprocess-amazon-state.ts` (dry-run por padrão, backup NDJSON e reversão).
- Teste: `scripts/test-amazon-media.ts` (paridade do modo off contra o SQL original).
