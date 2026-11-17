// PURO. Seção "Compare e ache o menor preço" da home (dono, 2026-11-17: busca no molde do Buscapé, ranking do menor ao maior preço com link para cada oferta).
import { verdictLabel, type VerdictKind } from '@/lib/affiliate/price-verdict';

export const RANKING_MIN_CHARS = 2;
export const RANKING_MAX_TOKENS = 6;
export const RANKING_MAX_PRODUTOS = 8;

const SEM_ACENTO_DE = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const SEM_ACENTO_PARA = 'aaaaaeeeeiiiiooooouuuucn';

/** Termos da busca: minúsculos, sem acento, só letras/números, no máximo RANKING_MAX_TOKENS. Vazio = não busca. */
export function tokensDaBusca(q: string): string[] {
  const t = q.toLowerCase().split('').map((c) => { const i = SEM_ACENTO_DE.indexOf(c); return i >= 0 ? SEM_ACENTO_PARA[i] : c; }).join('')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((x) => x.length >= 1);
  return t.length && t.join('').length >= RANKING_MIN_CHARS ? t.slice(0, RANKING_MAX_TOKENS) : [];
}

export interface Classificacao { rotulo: string; tom: 'good' | 'neutral' | 'warn' | 'muted'; diagnostico: boolean }

/**
 * Mesma classificação dos canais: produto novo = "Novo em monitoramento"; já com mais de uma oferta = "Em monitoramento";
 * diagnóstico (abaixo/em linha/acima do normal) SÓ com histórico elegível (R-91: 5+ cotações e 14+ dias).
 */
export function classificar(i: { nOfertas: number; elegivel: boolean; veredito?: VerdictKind | null }): Classificacao {
  if (i.elegivel && i.veredito && i.veredito !== 'insufficient') {
    const v = verdictLabel(i.veredito);
    return { rotulo: v.label, tom: v.tone, diagnostico: true };
  }
  return i.nOfertas > 1 ? { rotulo: 'Em monitoramento', tom: 'muted', diagnostico: false } : { rotulo: 'Novo em monitoramento', tom: 'muted', diagnostico: false };
}
