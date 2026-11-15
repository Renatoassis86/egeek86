// Prioridade de IMPRESSÃO 3D no fluxo de mensagens (dono, 2026-11-14): impressoras Anycubic Kobra e Bambu Lab passam à frente
// das demais da vertical impressao3d e ficam isentas da cota suave de tipo. PURO: sem banco, sem rede.
// Nunca passa por cima de bloqueio de segurança: só reordena candidatos que já passaram por oscilação, fora de linha, porteiro,
// cooldown, dedup e frescor (applyLimits aplica este desempate depois deles). Desligar: GROUP_PRIORIDADE_3D=off.

const MARCAS = /\b(?:kobra|anycubic|bambu(?:\s*lab)?)\b/;
const IMPRESSORA = /\bimpressora(?:s)?\b/;
/** Peça, filamento, resina e acessório com a marca no título não são a impressora. */
const NAO_IMPRESSORA = /\b(?:filamento|resina|bico|nozzle|hotend|extrusor|mesa|placa|correia|ventoinha|plate|spool|ams\s+(?:lite\s+)?avulso|kit|capa|case|enclosure|bobina|refil)\b/;

function dobrar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function prioridade3dLigada(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROUP_PRIORIDADE_3D ?? '').toLowerCase() !== 'off';
}

/** true = impressora 3D Kobra/Bambu da vertical impressao3d (o aparelho, não peça nem insumo). */
export function ehPrioridade3d(vertical: string | null | undefined, nome: string | null | undefined, tipo?: string | null): boolean {
  if (vertical !== 'impressao3d') return false;
  const t = dobrar(nome ?? '');
  if (!MARCAS.test(t)) return false;
  if (NAO_IMPRESSORA.test(t) && !/\bcombo\b/.test(t)) return false;
  return IMPRESSORA.test(t) || tipo === 'impressora-3d' || /\b(?:a1|a1 mini|p1s|p1p|p2s|x1c|x1 carbon|h2d|h2s|h2c|x2d|a2l|s1|kobra\s*\d?)\b/.test(t);
}

/**
 * Destaque do departamento (dono, 2026-11-14): as impressoras Anycubic Kobra e Bambu Lab abrem a lista (na ordem fixa do dono: combo primeiro; dentro do mesmo modelo, menor preço), deixando até 2 vagas para os demais itens (diversidade, via `diversificar`). Só reordena o que já passou pelos filtros; sem selo e sem mediana.
 */
export function priorizarImpressao3d<T extends { name: string; min_cents?: unknown }>(
  vertical: string,
  itens: readonly T[],
  limite: number,
  diversificar: (vertical: string, itens: readonly T[], limite: number) => T[],
): T[] {
  if (vertical !== 'impressao3d' || !prioridade3dLigada()) return diversificar(vertical, itens, limite);
  const preco = (i: T) => Number(i.min_cents ?? 0) || Number.MAX_SAFE_INTEGER;
  // Ordem fixa do dono (#111): combo primeiro (P2S, P1S, A1, A1 Mini), depois as avulsas, depois Kobra; dentro da mesma posição, menor preço.
  const prio = itens
    .filter((i) => ehPrioridade3d(vertical, i.name))
    .sort((a, b) => posicaoPrioridade3d(vertical, a.name) - posicaoPrioridade3d(vertical, b.name) || preco(a) - preco(b));
  const resto = itens.filter((i) => !ehPrioridade3d(vertical, i.name));
  const vagasResto = Math.min(2, resto.length, Math.max(0, limite - 1));
  const nPrio = Math.min(prio.length, limite - vagasResto);
  const saida: T[] = prio.slice(0, nPrio);
  return saida.concat(diversificar(vertical, resto, limite - saida.length));
}

// ---------------------------------------------------------------------------------------------------------------------
// ORDEM FIXA DO DONO (2026-11-15, #111): SEMPRE a impressora COM COMBO primeiro.
//   P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo; depois as sem combo: P2S, P1S, A1, A1 Mini; por último Anycubic Kobra.
// Valida para guia, front, fila/cota de mensagens e cobertura de coleta. PURO. Identidade: P1S != P1S Combo; A1 != A1 Mini.
// ---------------------------------------------------------------------------------------------------------------------

export interface ModeloGuia3d {
  slug: string;
  rotulo: string;
  /** Com combo (AMS) ou avulsa. */
  combo: boolean;
  /** Slug do modelo sem combo / com combo irmão (para a guia agrupar o combo e a avulsa na mesma coluna). */
  familia: 'p2s' | 'p1s' | 'a1' | 'a1-mini' | 'kobra' | 'outro-bambu';
}

/** Os 8 modelos prioritários, JÁ na ordem do dono. Kobra e demais Bambu vêm depois (posições 8 e 9 de `posicaoPrioridade3d`). */
export const MODELOS_GUIA_3D: readonly ModeloGuia3d[] = [
  { slug: 'p2s-combo', rotulo: 'Bambu Lab P2S Combo', combo: true, familia: 'p2s' },
  { slug: 'p1s-combo', rotulo: 'Bambu Lab P1S Combo', combo: true, familia: 'p1s' },
  { slug: 'a1-combo', rotulo: 'Bambu Lab A1 Combo', combo: true, familia: 'a1' },
  { slug: 'a1-mini-combo', rotulo: 'Bambu Lab A1 Mini Combo', combo: true, familia: 'a1-mini' },
  { slug: 'p2s', rotulo: 'Bambu Lab P2S', combo: false, familia: 'p2s' },
  { slug: 'p1s', rotulo: 'Bambu Lab P1S', combo: false, familia: 'p1s' },
  { slug: 'a1', rotulo: 'Bambu Lab A1', combo: false, familia: 'a1' },
  { slug: 'a1-mini', rotulo: 'Bambu Lab A1 Mini', combo: false, familia: 'a1-mini' },
];

/** Posição de qualquer outro Bambu Lab (H2D, X2D, A2L...) e da Anycubic Kobra, depois dos 8 modelos. */
export const POSICAO_OUTRO_BAMBU_3D = 8;
export const POSICAO_KOBRA_3D = 9;
/** Item que não é prioridade: depois de todos. */
export const POSICAO_NAO_PRIORIDADE_3D = 1000;

/** Modelo da guia (um dos 8) pelo título, ou null (Kobra, outro Bambu, peça, filamento...). Não exige a vertical: use com `ehPrioridade3d`. */
export function modeloGuia3d(nome: string | null | undefined): ModeloGuia3d | null {
  const t = dobrar(nome ?? '');
  if (!/\bbambu\b/.test(t)) return null;
  if (/\b(?:filamento|resina|bico|nozzle|hotend|extrusor|mesa|placa|correia|ventoinha|plate|spool|bobina|refil|capa|case|enclosure)\b/.test(t)) return null;
  // Outro modelo Bambu com sigla própria (H2D, X2D, A2L, X1C...) nunca é um dos 8, mesmo com "combo" no título.
  if (/\b(?:h2[a-z]|x2[a-z]|a2[a-z]?|x1[a-z]?|x1 carbon|p1p)\b/.test(t)) return null;
  const combo = /\bcombo\b/.test(t) || /\ba1mc\b/.test(t);
  let fam: ModeloGuia3d['familia'] | null = null;
  if (/\bp2s\b/.test(t)) fam = 'p2s';
  else if (/\bp1s\b/.test(t)) fam = 'p1s';
  else if (/\ba1\s*mini\b|\ba1m\w*\b/.test(t)) fam = 'a1-mini';
  else if (/\ba1\b/.test(t)) fam = 'a1';
  if (!fam) return null;
  return MODELOS_GUIA_3D.find((m) => m.familia === fam && m.combo === combo) ?? null;
}

/**
 * Posição na ordem do dono: 0 a 7 = os 8 modelos; 8 = outro Bambu Lab; 9 = Anycubic Kobra; 1000 = não é prioridade.
 * Menor primeiro. Só olha o título e a vertical; respeita a flag `GROUP_PRIORIDADE_3D=off` (tudo vira 1000, ordem de sempre).
 */
export function posicaoPrioridade3d(vertical: string | null | undefined, nome: string | null | undefined, tipo?: string | null, env: Record<string, string | undefined> = process.env): number {
  if (!prioridade3dLigada(env) || !ehPrioridade3d(vertical, nome, tipo)) return POSICAO_NAO_PRIORIDADE_3D;
  const m = modeloGuia3d(nome);
  if (m) return MODELOS_GUIA_3D.indexOf(m);
  return /\b(?:kobra|anycubic)\b/.test(dobrar(nome ?? '')) ? POSICAO_KOBRA_3D : POSICAO_OUTRO_BAMBU_3D;
}

/** Ordena estável por posição de prioridade (cobertura de coleta, listas). Fora da vertical ou com a flag off: devolve a ordem recebida. */
export function ordenarPorPrioridade3d<T extends { name: string }>(vertical: string, itens: readonly T[], env: Record<string, string | undefined> = process.env): T[] {
  if (vertical !== 'impressao3d' || !prioridade3dLigada(env)) return [...itens];
  return itens
    .map((i, idx) => ({ i, idx, p: posicaoPrioridade3d(vertical, i.name, null, env) }))
    .sort((a, b) => a.p - b.p || a.idx - b.idx)
    .map((x) => x.i);
}

// ---------------------------------------------------------------------------
// REFORCO BAMBU LAB no canal Impressao 3D (dono, 2026-11-15, #117): "aumentar o fluxo de todas as Bambus". Flag GROUP_REFORCO_BAMBU (padrao desligada).
// Liga: cooldown por OFERTA (nao por master) com queda real >= 2% ou R$ 50 depois de 30 min, cota extra por dia/hora so para Bambu e rodizio
// entre as ofertas (a menos enviada nas ultimas 24 h passa na frente; empate = ordem fixa do dono). So Bambu Lab; so produto novo, sem regra do dono quebrada.
// ---------------------------------------------------------------------------
export function reforcoBambuLigado(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|on|true)$/i.test((env.GROUP_REFORCO_BAMBU ?? '').trim());
}
export const REFORCO_BAMBU = { EXTRA_DIA: 24, EXTRA_HORA: 6, QUEDA_PCT: 2, QUEDA_MIN_CENTS: 5000, GAP_MIN: 30 } as const;

/** true = impressora 3D Bambu Lab (o aparelho) da vertical impressao3d. */
export function ehBambuLab3d(vertical: string | null | undefined, nome: string | null | undefined, tipo?: string | null): boolean {
  return ehPrioridade3d(vertical, nome, tipo) && dobrar(nome ?? '').includes('bambu');
}
