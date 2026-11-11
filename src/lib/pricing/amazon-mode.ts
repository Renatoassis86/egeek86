// PONTO ÚNICO da flag `PRICE_AMAZON_MODE` (ADR 0010, decisões D1 a D5 do dono, 2026-11-11). Módulo PURO (sem server-only, sem banco).
//
//   off    (PADRÃO) a Amazon NÃO entra na média única, no menor preço, no selo, no gráfico, no cabeçalho nem no cartão. Leitura e
//                   gravação dos indicadores públicos ignoram a Amazon. As mensagens seguem como hoje (alerta da Amazon só contra o
//                   histórico dela, e a régua de 10% a bloqueia por falta de média).
//   shadow           o público lê EXATAMENTE como `off`; o job diário calcula a versão COM Amazon ao lado e a registra (resumo do job,
//                   gravado em collector_runs.meta pelo cron). Nada é exibido nem muda mensagem.
//   on               a média única passa a incluir a Amazon (peso 1 por oferta-dia por ASIN, ADR 0004), só `games`, com frescor de 24 h
//                   por confirmação de preço. Mensagens: Amazon com média passa na régua normal; Amazon-only (menos de 3 ASIN) usa a
//                   mediana de 14 dias do próprio ASIN.
//
// Reverter = voltar para `off` (nenhum dado é apagado; os dias já gravados com Amazon se corrigem com
// `scripts/reprocess-amazon-state.ts`). Para LIGAR/DESLIGAR: variável de ambiente `PRICE_AMAZON_MODE` (Vercel e também onde roda o job
// `refresh-price-daily`/o cron) e novo deploy/reinício. Qualquer valor desconhecido vale `off` (falha fechada).

export type AmazonMode = 'off' | 'shadow' | 'on';
export type AmazonScope = 'include' | 'exclude';

export const AMAZON_NETWORK_SLUG = 'amazon';
/** D2: a oferta da Amazon só pesa na média se o preço foi CONFIRMADO nas últimas 24 h (teto de cache da licença de PI da Amazon). */
export const AMAZON_FRESH_MAX_AGE_MS = 24 * 3_600_000;
/** D5: só estes departamentos têm Amazon na média até a Black Friday (27/11). */
export const AMAZON_MODE_VERTICALS: readonly string[] = ['games'];
/** D3: régua da Amazon-only usa a mediana oferta-dia dos últimos 14 dias do próprio ASIN, com no mínimo 7 dias de série. */
export const AMAZON_OWN_WINDOW_DAYS = 14;
export const AMAZON_OWN_MIN_DAYS = 7;
/** D3: média só com 3 ou mais ASIN (mesma regra do ADR 0004). */
export const AMAZON_ONLY_MIN_ASIN_FOR_AVG = 3;

export function parseAmazonMode(v: string | undefined | null): AmazonMode {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'on' || s === 'shadow' ? s : 'off';
}

/** LÊ a flag. É a ÚNICA função que toca em `process.env.PRICE_AMAZON_MODE`; todo consumidor chama esta (ou recebe o modo por parâmetro). */
export function getAmazonMode(): AmazonMode {
  return parseAmazonMode(process.env.PRICE_AMAZON_MODE);
}

/** O que o PÚBLICO enxerga: só `on` inclui a Amazon. `shadow` e `off` excluem. */
export function amazonScope(mode: AmazonMode = getAmazonMode()): AmazonScope {
  return mode === 'on' ? 'include' : 'exclude';
}

/** A Amazon deste departamento pode compor a média no modo dado? (`on` e vertical liberada.) */
export function amazonCountsIn(mode: AmazonMode, vertical: string | null | undefined): boolean {
  return mode === 'on' && AMAZON_MODE_VERTICALS.includes(vertical ?? '');
}

export function isAmazonSlug(slug: string | null | undefined): boolean {
  return (slug ?? '').toLowerCase() === AMAZON_NETWORK_SLUG;
}
