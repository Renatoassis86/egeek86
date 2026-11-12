// Sem 'server-only': regras PURAS da fila de links meli.la (sem banco, sem rede), testáveis.
import { classificarTipo } from '@/lib/catalog/tipos-produto';

/**
 * Prioridade da fila de links de afiliado do Mercado Livre (ordem do dono, 2026-11-12): lojas Plus (qualquer vertical que não seja
 * games) antes de games; dentro de cada bloco, a oferta MAIS BARATA de cada produto primeiro (rn = 1); depois, tipos de ticket alto,
 * depois preço maior. Os tipos vêm do título do master (src/lib/catalog/tipos-produto.ts); nada é gravado.
 */

/** Tipos de ticket alto por departamento (slugs de tipos-produto.ts). */
export const TIPOS_TICKET_ALTO: Readonly<Record<string, readonly string[]>> = {
  eletroeletronicos: ['smart-tv', 'projetor', 'soundbar', 'tablet-leitor', 'camera-foto', 'camera-acao'],
  eletrodomesticos: ['geladeira-freezer', 'lavadora-secadora', 'fogao-cooktop', 'ar-condicionado', 'micro-ondas', 'forno'],
  tecnologia: ['notebook', 'monitor', 'placa-de-video', 'impressora', 'processador'],
  esporte: ['esteira-eliptico', 'bicicleta'],
  impressao3d: ['impressoras'],
};
/** Preço a partir do qual um item fora desses tipos ainda conta como ticket médio-alto (centavos). */
export const TICKET_MEDIO_CENTS = 150_000;

export type FilaRow = { id: string; masterId: string; vertical: string; nome: string; priceCents: number; rn: number };

/** 0 = tipo de ticket alto; 1 = preço >= R$ 1.500 de outro tipo; 2 = demais. */
export function faixaTicket(vertical: string, nome: string, priceCents: number): 0 | 1 | 2 {
  const alto = TIPOS_TICKET_ALTO[vertical];
  if (alto && alto.includes(classificarTipo(vertical, nome))) return 0;
  return priceCents >= TICKET_MEDIO_CENTS ? 1 : 2;
}

/** Rótulo do bloco de prioridade (para o resumo da fila). */
export function rotuloPrioridade(r: FilaRow): string {
  const bloco = r.vertical === 'games' ? 'games' : 'plus';
  return `${bloco}/${r.rn === 1 ? 'mais-barata' : 'demais-ofertas'}/ticket-${faixaTicket(r.vertical, r.nome, r.priceCents)}`;
}

export function chaveOrdem(r: FilaRow): [number, number, number, number, string, string] {
  return [r.vertical === 'games' ? 1 : 0, r.rn === 1 ? 0 : 1, faixaTicket(r.vertical, r.nome, r.priceCents), -r.priceCents, r.masterId, r.id];
}

export function ordenarFilaLinks<T extends FilaRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ka = chaveOrdem(a), kb = chaveOrdem(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

/** URL de página de catálogo (/p/MLB..., /up/MLB...): o gerador de links não aceita (não é anúncio). */
export function ehUrlDeCatalogo(url: string): boolean {
  return /^https:\/\/(www\.)?mercadolivre\.com\.br\/(p|up)\/MLBU?\d+/i.test(url);
}

/** URL do anúncio para o gerador: MLB-id do item quando existe; senão o affiliate_url, se NÃO for de catálogo; senão null. */
export function urlDoAnuncio(externalItemId: string | null, affiliateUrl: string): string | null {
  if (externalItemId && /^MLB[0-9]+$/.test(externalItemId)) return `https://produto.mercadolivre.com.br/MLB-${externalItemId.slice(3)}`;
  const limpa = String(affiliateUrl ?? '').split('?')[0].split('#')[0];
  if (!/^https:\/\/(produto|www)\.mercadolivre\.com\.br\//.test(limpa) || ehUrlDeCatalogo(limpa)) return null;
  return limpa;
}

export const MOTIVOS_SKIP = ['nao_elegivel', 'sem_resultado', 'erro_pagina'] as const;
export type MotivoSkip = (typeof MOTIVOS_SKIP)[number];
export const TETO_TENTATIVAS = 3;
/** Dias até reentrar na fila, por motivo (nao_elegivel muda raramente). */
export const REINTENTO_DIAS: Record<MotivoSkip, number> = { nao_elegivel: 30, sem_resultado: 3, erro_pagina: 1 };

export function motivoValido(m: unknown): m is MotivoSkip {
  return typeof m === 'string' && (MOTIVOS_SKIP as readonly string[]).includes(m);
}

/** true = a falha registrada ainda mantém a oferta FORA da fila. */
export function falhaBloqueia(motivo: string, tentativas: number, diasDesdeUltima: number): boolean {
  if (tentativas >= TETO_TENTATIVAS) return true;
  const dias = REINTENTO_DIAS[motivo as MotivoSkip] ?? 3;
  return diasDesdeUltima < dias;
}
