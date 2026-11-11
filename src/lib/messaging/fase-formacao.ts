// FASE DE FORMAÇÃO DE AMOSTRA das lojas que NÃO são Games (dono, 2026-11-11). PURO: sem banco, sem relógio, sem env.
// Ata: docs/conselho/atas/2026-11-11-fase-de-formacao-outras-lojas.md. Método: docs/03-metodologia/FASE_DE_FORMACAO.md.
//
// Antes da data de corte, impressão 3D, tecnologia, livros, casa (eletrodomésticos), eletroeletrônicos e esporte enviam
// mensagem de preço comparando com uma MÉDIA SIMPLES (uma vez cada oferta ativa), com mínimos relaxados ao mínimo seguro.
// A partir da data de corte (00:00 de Brasília) a MESMA estrutura dos games entra sozinha: régua de 10%, média por oferta-dia
// elegível (>= 3 ofertas, >= 5 oferta-dias, >= 14 dias) e mínimo de 3 lojas. Sem deploy: a função só olha o relógio.
//
// Games (e consoles, que moram na vertical games) NUNCA estão em formação: a estrutura deles não muda.

/**
 * DATA DE CORTE: primeiro dia (Brasília, 'AAAA-MM-DD') em que as lojas que não são games passam a usar a estrutura dos games.
 * Ponto ÚNICO de mudança. Para adiar ou antecipar basta editar esta linha (ou o dono pedir); o teste de virada lê daqui.
 */
export const DATA_DE_CORTE_FORMACAO = '2026-11-30';

/** Mínimos aplicados SÓ durante a formação (lojas que não são games). Depois da data de corte valem os de RULES (group-rules.ts). */
export const FORMACAO = {
  /** Lojas distintas (rede + vendedor) com oferta utilizável. Depois da corte: 3 (RULES.MIN_STORES). */
  MIN_LOJAS: 2,
  /** Ofertas na média simples. Abaixo disso não há média (e nenhuma mensagem de comparação). */
  MIN_OFERTAS_MEDIA: 3,
  /** Faixa de plausibilidade da média: oferta fora de 0,35x a 3x a mediana das ofertas não entra na média (mesma faixa de RULES.REVIEW_*). */
  FAIXA_MIN: 0.35,
  FAIXA_MAX: 3,
} as const;

/** Dia 'AAAA-MM-DD' em Brasília (UTC-3 fixo, sem horário de verão), igual a spDayStr de group-rules. Local para não criar import circular. */
function diaBrasilia(now: Date): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * A vertical está na fase de formação em `now`? Só as lojas que não são games, e só antes da data de corte (Brasília).
 * `corte` existe para teste; em produção usa-se sempre a constante.
 */
export function emFaseDeFormacao(vertical: string, now: Date, corte: string = DATA_DE_CORTE_FORMACAO): boolean {
  if (vertical === 'games') return false;
  return diaBrasilia(now) < corte;
}

/** Lojas mínimas para a mensagem de preço: relaxado na formação, o piso normal (`normal`, RULES.MIN_STORES) depois. */
export function minLojas(vertical: string, now: Date, normal: number): number {
  return emFaseDeFormacao(vertical, now) ? Math.min(FORMACAO.MIN_LOJAS, normal) : normal;
}

export interface MediaSimples {
  /** Média aritmética (centavos) das ofertas que entraram. */
  cents: number;
  /** Ofertas que entraram (cada oferta ativa vale 1). */
  ofertas: number;
  /** Ofertas deixadas de fora pela faixa de plausibilidade (para auditoria). */
  fora: number;
}

/**
 * MÉDIA SIMPLES da fase de formação: média aritmética do preço atual de cada oferta ativa, uma por oferta, sem série nem 14 dias.
 * Dado real apenas: o chamador passa os preços das ofertas ativas (já sem Open Box/usado/região, sem quarentena e SEM itens de
 * identidade 'incerta'). Aqui só se tira o que foge da faixa 0,35x a 3x a mediana (preço sentinela/ágio), para um anúncio
 * absurdo não decidir a média. Menos de `FORMACAO.MIN_OFERTAS_MEDIA` ofertas dentro da faixa = null (sem média, sem mensagem).
 */
export function mediaSimples(precosCents: number[]): MediaSimples | null {
  const precos = precosCents.filter((p) => Number.isFinite(p) && p > 0);
  if (precos.length < FORMACAO.MIN_OFERTAS_MEDIA) return null;
  const s = [...precos].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const mediana = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  const dentro = precos.filter((p) => p >= mediana * FORMACAO.FAIXA_MIN && p <= mediana * FORMACAO.FAIXA_MAX);
  if (dentro.length < FORMACAO.MIN_OFERTAS_MEDIA) return null;
  const soma = dentro.reduce((a, b) => a + b, 0);
  return { cents: Math.round(soma / dentro.length), ofertas: dentro.length, fora: precos.length - dentro.length };
}
