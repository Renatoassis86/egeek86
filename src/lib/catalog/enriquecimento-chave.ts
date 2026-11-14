// Sem 'server-only': função pura (sem banco, sem rede), importável por scripts tsx e testes.
import { attrValue, extractGtins, foldText, isbn10to13, isGenericBrand, isValidGtin, type MlCatalogPayload } from './vertical/identity';

/**
 * ENRIQUECIMENTO DE GTIN/MPN pelo catálogo oficial do Mercado Livre (C13 do checklist, aprovado pelo dono em 2026-11-14).
 *
 * Regras (todas de segurança; nada é estimado):
 *  - GTIN só entra se for ÚNICO no payload (dois GTINs diferentes = anúncio ambíguo, ignora) e tiver dígito verificador GS1 válido;
 *  - a MARCA do catálogo precisa ser compatível com o master (fabricante gravado ou nome); marca ausente nos dois lados ou marca genérica
 *    nunca autoriza gravar;
 *  - GTIN já gravado em OUTRO master NÃO é sobrescrito: vira candidato a duplicata (juntar só com chave forte, pelo fluxo de mescla);
 *  - MPN só entra junto de marca compatível e quando o master ainda não tem MPN.
 */

export interface MasterParaEnriquecer {
  id: string;
  nome: string;
  fabricante: string | null;
  gtin: string | null;
  mpn: string | null;
}

export type AcaoEnriquecimento =
  | { acao: 'gravar'; gtin: string | null; mpn: string | null; marca: string }
  | { acao: 'duplicata'; gtin: string; outroMasterId: string; marca: string }
  | { acao: 'ignorar'; motivo: string };

const norm = (s: string | null | undefined): string => foldText(s ?? '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Marca do catálogo compatível com o master: contida no fabricante ou no nome (ou o contrário), por palavras inteiras. */
export function marcaCompativel(marcaCatalogo: string | null, m: Pick<MasterParaEnriquecer, 'nome' | 'fabricante'>): boolean {
  const b = norm(marcaCatalogo);
  if (!b || isGenericBrand(b)) return false;
  const fab = norm(m.fabricante);
  const nome = ` ${norm(m.nome)} `;
  if (fab && (fab === b || ` ${fab} `.includes(` ${b} `) || ` ${b} `.includes(` ${fab} `))) return true;
  return nome.includes(` ${b} `);
}

export function avaliarEnriquecimento(
  m: MasterParaEnriquecer,
  payload: MlCatalogPayload,
  donoDoGtin: (gtin: string) => string | null,
): AcaoEnriquecimento {
  if (m.gtin && m.mpn) return { acao: 'ignorar', motivo: 'ja_tem_gtin_e_mpn' };
  const marca = attrValue(payload, 'BRAND');
  if (!marcaCompativel(marca, m)) return { acao: 'ignorar', motivo: marca ? 'marca_incompativel' : 'sem_marca_no_catalogo' };

  // MPN do catálogo que na prática é um UPC/EAN/ISBN válido (comum em jogos) é GTIN, não MPN.
  const mpnBruto = (attrValue(payload, 'MPN') ?? '').replace(/[-\s]/g, '');
  const mpnComoGtin = /^\d+$/.test(mpnBruto) && isValidGtin(mpnBruto) ? mpnBruto : isbn10to13(mpnBruto);

  let gtin: string | null = null;
  if (!m.gtin) {
    const gs = Array.from(new Set([...extractGtins(payload), ...(mpnComoGtin ? [mpnComoGtin] : [])])).sort();
    if (gs.length > 1) return { acao: 'ignorar', motivo: 'gtins_ambiguos' };
    if (gs.length === 1) {
      const dono = donoDoGtin(gs[0]!);
      if (dono && dono !== m.id) return { acao: 'duplicata', gtin: gs[0]!, outroMasterId: dono, marca: marca! };
      gtin = gs[0]!;
    }
  }
  let mpn: string | null = null;
  if (!m.mpn) {
    const raw = mpnComoGtin ? '' : (attrValue(payload, 'MPN') ?? '').trim();
    // MPN é um código único: sem espaços, sem lista (vírgula/ponto e vírgula) e sem frase.
    if (/^[A-Za-z0-9][A-Za-z0-9._\/-]{2,39}$/.test(raw) && /\d/.test(raw) && !/^(n\/?a|sem|nenhum|none|null|-+)$/i.test(raw)) mpn = raw;
  }
  if (!gtin && !mpn) return { acao: 'ignorar', motivo: 'catalogo_sem_gtin_nem_mpn' };
  return { acao: 'gravar', gtin, mpn, marca: marca! };
}

export interface MasterParaJuntar {
  id: string;
  nome: string;
  vertical: string;
  tipo: string;
  plataforma: string | null;
}

/** Tokens com dígito do nome (modelo, volume, geração): "g435", "1tb", "ps5", "v2". Conjuntos diferentes = modelos diferentes. */
export function tokensDeModelo(nome: string): string[] {
  return Array.from(new Set(norm(nome).split(' ').filter((t) => /\d/.test(t)))).sort();
}

/**
 * Dois masters com a MESMA chave forte (GTIN, ISBN) só podem ser juntados se, além da chave, forem do mesmo vertical, tipo e plataforma e
 * tiverem o MESMO conjunto de tokens de modelo no nome (sufixos parecidos, como G435 e G435s, ficam separados).
 */
export function podeJuntarPorChave(a: MasterParaJuntar, b: MasterParaJuntar): { ok: boolean; motivo: string } {
  if (a.id === b.id) return { ok: false, motivo: 'mesmo_master' };
  if (a.vertical !== b.vertical) return { ok: false, motivo: 'vertical_diferente' };
  if (a.tipo !== b.tipo) return { ok: false, motivo: 'tipo_diferente' };
  if ((a.plataforma ?? 'unknown') !== (b.plataforma ?? 'unknown')) return { ok: false, motivo: 'plataforma_diferente' };
  const ta = tokensDeModelo(a.nome);
  const tb = tokensDeModelo(b.nome);
  if (ta.join('|') !== tb.join('|')) return { ok: false, motivo: 'tokens_de_modelo_diferentes' };
  return { ok: true, motivo: 'chave_forte_e_modelo_igual' };
}
