// R-119: LEITOR DE PAGINAS DA SHOPEE (verdade viva da vitrine). PURO (sem banco, sem rede): priorizacao da fila e regra de ritmo.
// Quem le a pagina e a aba logada do dono (public/loops/shopee-vivo.js); o servidor so diz QUAIS itens ler e QUANDO, e recusa tudo acima do ritmo seguro.
import { VIVO_JANELA_VITRINE_MIN } from '@/lib/messaging/verdade-viva';

/** A vitrine de jogos roda no cron a cada 30 min (vercel.json: a cada 30 min, marcas :00 e :30 UTC = tambem :00/:30 em Brasilia). */
export const VITRINE_CRON_MIN = 30;
/** Abre a janela de leitura esta quantidade de minutos ANTES da marca do cron: a leitura mais velha chega ao envio com <= 14 min (< 15 da regra). */
export const FILA_ANTES_MIN = 14;
/** Tolerancia depois da marca (cron atrasado). Passou disso, a fila fecha ate a proxima janela. */
export const FILA_DEPOIS_MIN = 3;
/** Quantos itens da Shopee por plataforma entram na fila (os mais baratos da ordem da vitrine). */
export const FILA_POR_PLATAFORMA = 8;
/** Teto absoluto de paginas lidas por hora (ritmo humano; o servidor fecha a fila ao atingir). */
export const FILA_MAX_POR_HORA = 90;
/** Depois de uma verificacao anti-robo registrada, a fila fica FECHADA por este tempo (o dono resolve; nada tenta contornar). */
export const FILA_PAUSA_VERIFICACAO_MIN = 90;

export interface CandidatoShopee {
  offerId: string;
  /** itemId da Shopee (external_ref `shopee-<itemId>`). */
  itemId: string;
  plataforma: string;
  /** Posicao (0 = mais barato) na ordem que a vitrine usa para a plataforma. */
  posicao: number;
  precoCents: number;
  /** Idade da ultima leitura de pagina em minutos (null = nunca lida). */
  idadeMin: number | null;
}

export interface ItemFila extends CandidatoShopee { prioridade: number }

/** Minutos ate a proxima marca do cron da vitrine (0 = agora na marca). */
export function minutosAteProximaVitrine(now: Date): number {
  const m = now.getUTCMinutes() + now.getUTCSeconds() / 60;
  const resto = m % VITRINE_CRON_MIN;
  return resto === 0 ? 0 : VITRINE_CRON_MIN - resto;
}

export interface JanelaLeitura { aberta: boolean; minAteVitrine: number; motivo: string }

/** Janela de leitura: de FILA_ANTES_MIN antes ate FILA_DEPOIS_MIN depois de cada marca. Fora dela a fila fica vazia (nada e lido sem uso). */
export function janelaDeLeitura(now: Date): JanelaLeitura {
  const resto = (now.getUTCMinutes() + now.getUTCSeconds() / 60) % VITRINE_CRON_MIN;
  const ate = minutosAteProximaVitrine(now);
  if (resto <= FILA_DEPOIS_MIN && resto > 0) return { aberta: true, minAteVitrine: 0, motivo: 'cron_atrasado' };
  if (ate <= FILA_ANTES_MIN) return { aberta: true, minAteVitrine: ate, motivo: 'antes_da_vitrine' };
  return { aberta: false, minAteVitrine: ate, motivo: 'fora_da_janela' };
}

/** Precisa ler agora? Sim se nunca foi lido ou se a leitura chegaria ao envio com mais de (janela - 1) min. */
export function precisaLer(idadeMin: number | null, minAteVitrine: number): boolean {
  if (idadeMin == null) return true;
  return idadeMin + minAteVitrine > VIVO_JANELA_VITRINE_MIN - 1;
}

/**
 * PRIORIZACAO: so Shopee, so os N mais baratos de cada plataforma, so quem precisa de leitura; intercala as plataformas (1o de cada, depois 2o de cada...),
 * dentro do mesmo degrau lê primeiro quem nunca foi lido e depois o mais velho. Corta em `limite`.
 */
export function priorizarFila(cands: readonly CandidatoShopee[], o: { minAteVitrine: number; porPlataforma?: number; limite: number }): ItemFila[] {
  const n = o.porPlataforma ?? FILA_POR_PLATAFORMA;
  const vistos = new Set<string>();
  const sel = cands
    .filter((c) => c.posicao < n && /^\d{1,19}$/.test(c.itemId) && precisaLer(c.idadeMin, o.minAteVitrine) && !vistos.has(c.offerId) && !!vistos.add(c.offerId))
    ;
  // degrau de posicao primeiro (intercala as plataformas); no degrau, nunca lido antes do lido, e o mais velho antes do mais novo
  sel.sort((a, b) => a.posicao - b.posicao || Number(a.idadeMin != null) - Number(b.idadeMin != null) || (b.idadeMin ?? 0) - (a.idadeMin ?? 0) || a.plataforma.localeCompare(b.plataforma));
  return sel.slice(0, Math.max(0, o.limite)).map((c, i) => ({ ...c, prioridade: i + 1 }));
}

export interface EstadoRitmo {
  now: Date;
  /** Paginas lidas na ultima hora (somatorio dos lotes gravados). */
  lidasUltimaHora: number;
  /** Minutos desde a ultima verificacao anti-robo registrada (null = nenhuma na janela de busca). */
  minDesdeVerificacao: number | null;
  desligado?: boolean;
}

export type DecisaoFila = { servir: true; limite: number; minAteVitrine: number } | { servir: false; motivo: 'desligado' | 'verificacao_antirrobo' | 'fora_da_janela' | 'teto_por_hora'; reabreEmMin?: number };

/** REGRA DE RITMO do servidor (a do loop e mais estrita ainda). Ordem: desligado > verificacao > janela > teto por hora. */
export function decidirFila(e: EstadoRitmo): DecisaoFila {
  if (e.desligado) return { servir: false, motivo: 'desligado' };
  if (e.minDesdeVerificacao != null && e.minDesdeVerificacao < FILA_PAUSA_VERIFICACAO_MIN) return { servir: false, motivo: 'verificacao_antirrobo', reabreEmMin: Math.ceil(FILA_PAUSA_VERIFICACAO_MIN - e.minDesdeVerificacao) };
  const j = janelaDeLeitura(e.now);
  if (!j.aberta) return { servir: false, motivo: 'fora_da_janela', reabreEmMin: Math.max(0, Math.ceil(j.minAteVitrine - FILA_ANTES_MIN)) };
  const resta = FILA_MAX_POR_HORA - e.lidasUltimaHora;
  if (resta <= 0) return { servir: false, motivo: 'teto_por_hora' };
  return { servir: true, limite: Math.min(resta, FILA_POR_PLATAFORMA * 5), minAteVitrine: j.minAteVitrine };
}

export function shopeeVivoLigado(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.SHOPEE_VIVO ?? '').trim());
}

/** URL publica do anuncio (sem tag, sem afiliado: e so leitura na aba do dono). Sem shopId: a Shopee resolve `/product/<itemId>`; o loop confere o itemId na URL final. */
export function urlLeituraShopee(itemId: string): string | null {
  return /^\d{1,19}$/.test(itemId) ? `https://shopee.com.br/product/${itemId}` : null;
}
