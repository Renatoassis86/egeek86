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
 * Destaque do departamento (dono, 2026-11-14): as impressoras Anycubic Kobra e Bambu Lab abrem a lista (a mais barata de cada modelo, em ordem de
 * preço), deixando até 2 vagas para os demais itens (diversidade, via `diversificar`). Só reordena o que já passou pelos filtros; sem selo e sem mediana.
 */
export function priorizarImpressao3d<T extends { name: string; min_cents?: unknown }>(
  vertical: string,
  itens: readonly T[],
  limite: number,
  diversificar: (vertical: string, itens: readonly T[], limite: number) => T[],
): T[] {
  if (vertical !== 'impressao3d' || !prioridade3dLigada()) return diversificar(vertical, itens, limite);
  const preco = (i: T) => Number(i.min_cents ?? 0) || Number.MAX_SAFE_INTEGER;
  const prio = itens.filter((i) => ehPrioridade3d(vertical, i.name)).sort((a, b) => preco(a) - preco(b));
  const resto = itens.filter((i) => !ehPrioridade3d(vertical, i.name));
  const vagasResto = Math.min(2, resto.length, Math.max(0, limite - 1));
  const nPrio = Math.min(prio.length, limite - vagasResto);
  const saida: T[] = prio.slice(0, nPrio);
  return saida.concat(diversificar(vertical, resto, limite - saida.length));
}
