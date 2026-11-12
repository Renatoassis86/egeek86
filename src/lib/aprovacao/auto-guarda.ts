// PURO (sem banco, sem 'server-only'): guarda da APROVACAO CONTINUA AUTOMATICA (dono, 2026-11-12). Decide se um cartao da /admin/aprovacao pode ser
// aprovado sem fila humana. Camada EXTRA sobre as guardas de decidir() (usado/Open Box, duas geracoes, quarentena, sem preco, master rejeitado,
// duplicata de jogo). PRODUTO UNICO E BEM-VINDO: nenhum minimo de ofertas por produto entra aqui.
import type { Motivo } from './motivos';

/** Motivos que o servico decide sozinho. Midia, modelo, armazenamento e preco sao respostas FACTUAIS do dono e nunca entram. */
export const MOTIVOS_AUTO: ReadonlySet<Motivo> = new Set<Motivo>(['produto_novo', 'rascunho', 'cobertura', 'fronteira']);
/** Redes cujo rascunho/master novo entra sem fila (a Shopee aprova na criacao do master, em cobertura-shopee.ts). */
export const REDES_AUTO: ReadonlySet<string> = new Set(['amazon']);

/** Retro-estilo NOVO so vale dessas marcas (ordem do dono, 2026-11-12). */
export const MARCAS_RETRO_PERMITIDAS = /\b(hyperkin|analogue|retro[\s-]?bit|8\s?bitdo)\b/i;
const RETRO_ESTILO = /\b(retr[oô]|game\s?stick|mini\s?console|emulador|\d{3,}\s*(?:jogos|games|in\s?1)|\d+\s*em\s*1)\b/i;

export interface EntradaAuto {
  motivo: Motivo;
  rede: string;
  title: string;
  vertical: string;
  plataforma: string | null;
  priceCents: number | null;
  refCents: number | null;
  nRefs: number | null;
}

/** null = pode aprovar sozinho; texto = motivo de ficar para o dono. */
export function guardaAuto(c: EntradaAuto): string | null {
  if (!MOTIVOS_AUTO.has(c.motivo)) return `motivo_factual:${c.motivo}`;
  if (!REDES_AUTO.has(c.rede)) return `rede_fora:${c.rede}`;
  if (!(c.priceCents != null && c.priceCents > 0)) return 'sem_preco_lido';
  if (c.vertical === 'games' && !c.plataforma) return 'plataforma_desconhecida';
  if (RETRO_ESTILO.test(c.title) && !MARCAS_RETRO_PERMITIDAS.test(c.title)) return 'retro_sem_marca_permitida';
  // Preco absurdo frente a media unica do produto (so com 3+ ofertas de referencia; produto unico nao tem referencia e nao e barrado por isso).
  if (c.refCents != null && c.nRefs != null && c.nRefs >= 3 && c.refCents > 0) {
    const r = c.priceCents / c.refCents;
    if (r < 0.35 || r > 3) return 'preco_fora_da_faixa_da_media';
  }
  return null;
}
