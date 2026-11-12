/**
 * Carga + avaliacao (SO LEITURA) compartilhada por simular-aprovacao-plus.ts e aplicar-aprovacao-plus.ts.
 * Avalia cada master das lojas Plus (nao-games, nao fundido) com os criterios v2 e v3, e devolve onde ele cairia:
 * aprovar | fila | permanecem | (aprovado/rejeitado hoje fora do escopo do plano).
 */
import type { Sql } from './_dup-shared';
import { avaliarCandidato, CLICAVEL_MAX_HORAS, normalizarNome, type CandidatoMaster } from '../src/lib/catalog/aprovacao-nicho';
import { avaliarImpressao3d, type CandidatoI3d } from '../src/lib/catalog/aprovacao-impressao3d';
import { REDES_DEPARTAMENTO } from '../src/lib/catalog/departamentos';
import { normalizeTitleKey } from '../src/lib/catalog/vertical/identity';

export interface ItemPlano {
  id: string; name: string; vertical: string; segment: string | null;
  verdictAntes: string; gateAntes: Record<string, unknown> | null; gtin: string | null;
  motivosV2: string[]; motivosV3: string[]; avisos: string[];
  destino: 'aprovar' | 'fila' | 'permanecem' | 'fora';
  origem?: 'ja_passava_v2' | 'relaxamento_v3' | 'confirmado_pelo_dono';
  nOfertas: number; faixaCents: [number, number] | null; titulos: string[];
  ofertaRepresentativa: { id: string; title: string; priceCents: number } | null;
  medianaCents: number | null;
}

export async function carregarEAvaliar(sql: Sql, ids?: string[]): Promise<ItemPlano[]> {
  await sql`SET statement_timeout = '200s'`;
  const masters = await sql<any[]>`
    SELECT m.id, m.name, m.vertical, m.gtin, m.mpn, m.default_images ->> 0 AS image, m.attributes -> 'catalogGate' AS gate,
           m.attributes -> 'vertical' -> 'catalogAttributes' AS cat, m.attributes -> 'vertical' ->> 'segment' AS segment,
           m.attributes -> 'vertical' ->> 'identityKey' AS ikey, m.manufacturer
    FROM master_products m WHERE m.vertical <> 'games' AND (m.attributes ->> 'mergedInto') IS NULL`;
  const ofertas = await sql<any[]>`
    SELECT o.id oid, o.master_product_id mid, o.title, o.current_price_cents AS price, n.slug, (o.quarantined_at IS NOT NULL) quarentena,
      s.reputation_level rep, s.total_sales vendas,
      (o.affiliate_link_pending = false AND o.quarantined_at IS NULL AND n.slug IN ${sql([...REDES_DEPARTAMENTO])} AND o.affiliate_url ~* '^https?://' AND o.current_price_cents > 0
        AND o.last_checked_at >= now() - make_interval(hours => ${CLICAVEL_MAX_HORAS})) AS clicavel
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.status = 'active' AND o.master_product_id IN (SELECT id FROM master_products WHERE vertical <> 'games' AND (attributes ->> 'mergedInto') IS NULL)`;
  // Respostas 'sim' do dono na fila de classificacao (identidade) para o master: resolvem so os motivos de julgamento.
  const sims = await sql<{ from_master_id: string }[]>`
    SELECT DISTINCT from_master_id::text AS from_master_id FROM identity_decisions
    WHERE axis = 'identidade' AND value = 'sim' AND kind = 'escolha' AND undone_at IS NULL AND from_master_id IS NOT NULL AND vertical <> 'games'`;
  const confirmados = new Set(sims.map((x) => x.from_master_id));
  const byM = new Map<string, any[]>();
  for (const o of ofertas) byM.set(o.mid, [...(byM.get(o.mid) ?? []), o]);
  const nomes = new Map<string, number>(); const tit = new Map<string, number>(); const chv = new Map<string, number>(); const gt = new Map<string, number>();
  for (const m of masters) {
    const k = `${m.vertical}|${normalizarNome(m.name)}`; nomes.set(k, (nomes.get(k) ?? 0) + 1);
    const t = normalizeTitleKey(m.name); if (t) tit.set(t, (tit.get(t) ?? 0) + 1);
    if (m.ikey) chv.set(m.ikey, (chv.get(m.ikey) ?? 0) + 1);
    if (m.gtin) gt.set(m.gtin, (gt.get(m.gtin) ?? 0) + 1);
  }
  const alvo = ids ? new Set(ids) : null;
  const out: ItemPlano[] = [];
  for (const m of masters) {
    if (alvo && !alvo.has(m.id)) continue;
    const v: string = m.gate?.verdict ?? 'approved';
    const of = byM.get(m.id) ?? [];
    const prices = of.filter((o) => o.price > 0).map((o) => Number(o.price));
    const sorted = [...prices].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const rep = of.filter((o) => !o.quarentena && o.price > 0).sort((a, b) => Math.abs(Number(a.price) - (med ?? 0)) - Math.abs(Number(b.price) - (med ?? 0)))[0];
    const base = {
      id: m.id, name: m.name, vertical: m.vertical, segment: m.segment, verdictAntes: v, gateAntes: m.gate ?? null, gtin: m.gtin,
      nOfertas: of.length, faixaCents: prices.length ? ([Math.min(...prices), Math.max(...prices)] as [number, number]) : null,
      titulos: [...new Set(of.map((o) => o.title as string))].slice(0, 4),
      ofertaRepresentativa: rep ? { id: rep.oid as string, title: rep.title as string, priceCents: Number(rep.price) } : null, medianaCents: med,
    };
    if (v !== 'review') { out.push({ ...base, motivosV2: [], motivosV3: [], avisos: [], destino: 'fora' }); continue; }
    let v2: string[]; let v3: string[]; let avisos: string[] = []; let fila = false; let origem: ItemPlano['origem'];
    if (m.vertical === 'impressao3d') {
      const c: CandidatoI3d = { id: m.id, name: m.name, segment: m.segment, vertical: m.vertical, manufacturer: m.manufacturer, mpn: m.mpn, hasImage: !!m.image, gate: m.gate, catalogAttributes: m.cat, identityKey: m.ikey,
        ofertas: of.map((o) => ({ priceCents: Number(o.price), networkSlug: o.slug, quarentena: o.quarentena, sellerReputation: o.rep, sellerSales: o.vendas, title: o.title })),
        duplicado: (tit.get(normalizeTitleKey(m.name) ?? '') ?? 0) > 1 || (m.ikey != null && (chv.get(m.ikey) ?? 0) > 1) };
      const a = avaliarImpressao3d(c); v2 = a.motivos; v3 = a.motivos; avisos = a.avisos;
    } else {
      const c: CandidatoMaster = { id: m.id, name: m.name, vertical: m.vertical, gtin: m.gtin, mpn: m.mpn, hasImage: !!m.image, gate: m.gate, catalogAttributes: m.cat,
        precosClicaveis: of.filter((o) => o.clicavel).map((o) => Number(o.price)), ofertasAtivas: of.filter((o) => !o.quarentena).length, ofertasQuarentena: of.filter((o) => o.quarentena).length,
        titulosOfertas: of.map((o) => o.title), nomeDuplicado: (nomes.get(`${m.vertical}|${normalizarNome(m.name)}`) ?? 0) > 1, segment: m.segment, manufacturer: m.manufacturer };
      v2 = avaliarCandidato(c, { relaxado: false }).motivos;
      const a3 = avaliarCandidato(c, { relaxado: true, confirmadoDono: confirmados.has(m.id) });
      v3 = a3.motivos; avisos = a3.avisos; fila = a3.fila;
      if (confirmados.has(m.id) && a3.aprovavel && !avaliarCandidato(c, { relaxado: true }).aprovavel) origem = 'confirmado_pelo_dono';
    }
    // Duplicata por GTIN/ISBN em outro master (um produto, uma media): nunca aprova.
    if (m.gtin && (gt.get(m.gtin) ?? 0) > 1) { v3 = [...v3, 'gtin_duplicado']; fila = false; }
    let destino: ItemPlano['destino'];
    if (v3.length === 0) { destino = 'aprovar'; origem ??= v2.length === 0 ? 'ja_passava_v2' : 'relaxamento_v3'; }
    else if (fila && base.ofertaRepresentativa) destino = 'fila';
    else destino = 'permanecem';
    out.push({ ...base, motivosV2: v2, motivosV3: v3, avisos, destino, origem });
  }
  return out;
}
