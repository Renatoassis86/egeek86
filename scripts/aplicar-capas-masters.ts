/**
 * CAPAS QUE FALTAM (fila #65, dono 2026-11-15): acha masters aprovados SEM nenhuma foto utilizável nos cards e grava uma capa REAL em
 * master_products.default_images (nunca imagem gerada). Fontes permitidas, em ordem:
 *   1. foto de QUALQUER oferta do mesmo master (inclusive expirada/pausada) ou do mesmo external_ref, com endereço da CDN da própria loja;
 *   2. og:image da página pública do anúncio (quando o link não é encurtado meli.la).
 * Cada candidata é validada por GET real (resolveCover: formato legível, lado >= 240 px).
 *
 *   # DRY-RUN (padrão): lista os alvos e o que seria gravado
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-capas-masters.ts [--horas 72] [--top 300]
 *   # APLICAR (backup NDJSON + log em docs/backups/)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-capas-masters.ts --apply --por "Nome" [--so-sem-foto = pula a varredura de rede (b), ~12 min]
 *   # REVERTER (restaura default_images anterior só de quem ainda tem o valor gravado por este lote)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-capas-masters.ts --rollback docs/backups/capas-masters-log-<ts>.json [--apply]
 *
 * Alvos: (a) masters aprovados com oferta ativa e nenhuma foto de oferta ativa com endereço válido; (b) masters das mensagens enviadas nas
 * últimas --horas e os --top com mais ofertas ativas (proxy de "mais vistos") cuja busca real de capa falha em TODAS as candidatas.
 * Só acrescenta no INÍCIO de default_images (nada é apagado); master com decisão de rejeição fica fora.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { coverUrlOk, orderCoverCandidates, type CoverSource } from '../src/lib/pricing/card-cover-urls';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const num = (k: string, d: number) => {
  const i = argv.indexOf(k);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const HORAS = num('--horas', 72);
const TOP = num('--top', 300);
const POR = argv.includes('--por') ? argv[argv.indexOf('--por') + 1] : '';
const rb = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Alvo { id: string; name: string; vertical: string; ativas: number; motivo: string; defaults: string[] }
interface Plano { id: string; name: string; motivo: string; fonte: string; url: string | null; antes: unknown[]; depois: unknown[] | null; obs?: string }

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  const { resolveCover } = await import('../src/server/messaging/card-cover');
  try {
    if (rb >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rb + 1]!, 'utf8')) as { gravados: Array<{ id: string; antes: unknown[]; depois: unknown[] }> };
      console.log('a restaurar:', log.gravados.length);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      let n = 0;
      for (const g of log.gravados) {
        const r = await sql`UPDATE master_products SET default_images = ${sql.json(g.antes as never)} WHERE id = ${g.id}::uuid AND default_images = ${sql.json(g.depois as never)} RETURNING id`;
        n += r.length;
      }
      return void console.log(`ROLLBACK aplicado em ${n} de ${log.gravados.length} (os demais mudaram depois do lote e foram preservados).`);
    }

    // (a) sem nenhuma foto de oferta ativa com endereço válido
    const semFoto = await sql<{ id: string; name: string; vertical: string; ativas: number; di: string[] }[]>`
      SELECT mp.id::text AS id, mp.name, mp.vertical, (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = mp.id AND o.status = 'active') AS ativas,
             ARRAY(SELECT jsonb_array_elements_text(mp.default_images)) AS di
      FROM master_products mp
      WHERE mp.attributes -> 'catalogGate' ->> 'verdict' = 'approved'
        AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = mp.id AND o.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.master_product_id = mp.id AND o.status = 'active' AND (
          (n.slug = 'mercado-livre' AND o.image_url ~* '^https://.*(mlstatic|mercadolivre)') OR (n.slug = 'shopee' AND o.image_url ~* '^https://.*(shopee|susercontent|shp.ee)')
          OR (n.slug = 'amazon' AND o.image_url ~* '^https://.*(media-amazon|ssl-images-amazon)') OR (n.slug NOT IN ('mercado-livre','shopee','amazon') AND o.image_url ~* '^https://')))
      ORDER BY 4 DESC`;
    const alvos = new Map<string, Alvo>();
    for (const r of semFoto) alvos.set(r.id, { id: r.id, name: r.name, vertical: r.vertical, ativas: r.ativas, motivo: 'sem_foto_em_oferta_ativa', defaults: r.di });
    console.log(`(a) sem foto em oferta ativa: ${semFoto.length}`);

    // (b) masters das mensagens recentes + top por ofertas ativas, com a busca real de capa
    const pool = argv.includes('--so-sem-foto') ? [] : await sql<{ id: string; name: string; vertical: string; ativas: number }[]>`
      SELECT id, name, vertical, ativas FROM (
        SELECT mp.id::text AS id, mp.name, mp.vertical, (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = mp.id AND o.status = 'active') AS ativas
        FROM master_products mp WHERE mp.id IN (SELECT master_product_id FROM group_messages WHERE status = 'enviada' AND sent_at > now() - make_interval(hours => ${HORAS}))
        UNION
        SELECT * FROM (SELECT mp.id::text, mp.name, mp.vertical, count(*)::int FROM master_products mp JOIN affiliate_offers o ON o.master_product_id = mp.id AND o.status = 'active'
          WHERE mp.attributes -> 'catalogGate' ->> 'verdict' = 'approved' GROUP BY mp.id ORDER BY 4 DESC LIMIT ${TOP}) t) u`;
    console.log(`(b) masters a verificar na rede: ${pool.length}`);
    let i = 0;
    let feitos = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < pool.length) {
        const m = pool[i++]!;
        if (alvos.has(m.id)) continue;
        const offs = await sql<{ image_url: string; slug: string; official: boolean }[]>`
          SELECT o.image_url, n.slug, (o.store_name ILIKE '%oficial%') AS official FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
          WHERE o.master_product_id = ${m.id}::uuid AND o.status = 'active' AND COALESCE(o.image_url, '') <> '' ORDER BY o.last_checked_at DESC NULLS LAST LIMIT 12`;
        const dflt = await sql<{ di: string[] }[]>`SELECT ARRAY(SELECT jsonb_array_elements_text(default_images)) AS di FROM master_products WHERE id = ${m.id}::uuid`;
        const others: CoverSource[] = offs.flatMap((o) => { const u = coverUrlOk(o.image_url, o.slug); return u ? [{ url: u, networkSlug: o.slug, official: o.official }] : []; });
        const cands = orderCoverCandidates(null, others, (dflt[0]?.di ?? []).slice(0, 3));
        const r = await resolveCover(cands);
        if (!r.cover) alvos.set(m.id, { ...m, motivo: `nenhuma_candidata_baixa (${r.diag.slice(0, 2).join(' | ') || 'sem candidata'})`, defaults: dflt[0]?.di ?? [] });
        if (++feitos % 200 === 0) console.log(`  verificados ${feitos}/${pool.length}`);
        await sleep(100);
      }
    }));
    console.log(`alvos totais: ${alvos.size}`);

    // busca de capa real para cada alvo
    const planos: Plano[] = [];
    for (const a of alvos.values()) {
      const antes = a.defaults;
      const imgs = await sql<{ image_url: string; slug: string }[]>`
        SELECT DISTINCT o.image_url, n.slug FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
        WHERE (o.master_product_id = ${a.id}::uuid OR o.external_ref IN (SELECT external_ref FROM affiliate_offers WHERE master_product_id = ${a.id}::uuid AND external_ref IS NOT NULL))
          AND COALESCE(o.image_url, '') <> ''`;
      const cands = imgs.flatMap((x) => { const u = coverUrlOk(x.image_url, x.slug); return u ? [u] : []; });
      let r = cands.length ? await resolveCover(cands) : { cover: null, diag: ['sem_foto_em_nenhuma_oferta'] };
      let fonte = 'foto de outra oferta do mesmo produto';
      if (!r.cover) {
        const pg = await sql<{ u: string }[]>`SELECT DISTINCT o.affiliate_url AS u FROM affiliate_offers o WHERE o.master_product_id = ${a.id}::uuid AND o.affiliate_url ~* '^https://(www|produto)\\.mercadolivre\\.com\\.br/' LIMIT 3`;
        for (const p of pg) {
          try {
            const res = await fetch(p.u.split('?')[0]!, { signal: AbortSignal.timeout(9000), redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; EspacoGeek86-card/1.0; +https://www.egeek86.com)', 'accept-language': 'pt-BR' } });
            if (!res.ok) continue;
            const html = await res.text();
            const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
            const u = coverUrlOk(og, 'mercado-livre');
            if (u) {
              r = await resolveCover([u]);
              if (r.cover) { fonte = 'og:image da página do anúncio'; break; }
            }
          } catch { /* próxima */ }
          await sleep(800);
        }
      }
      const url = r.cover?.url ?? null;
      planos.push({ id: a.id, name: a.name, motivo: a.motivo, fonte: url ? fonte : '-', url, antes, depois: url ? [url, ...antes.filter((x) => x !== url)] : null, obs: url ? undefined : r.diag.slice(0, 2).join(' | ') });
      await sleep(300);
    }
    for (const p of planos) console.log(`${p.id.slice(0, 8)} | ${p.url ? 'ACHOU' : 'SEM CAPA'} | ${p.fonte} | ${p.name.slice(0, 60)} | ${p.url ?? p.obs ?? ''}`);
    fs.writeFileSync(path.join(DIR, `capas-masters-plano-${stamp}.json`), JSON.stringify(planos, null, 1));
    const achados = planos.filter((p) => p.depois);
    console.log(`com capa encontrada: ${achados.length}; sem capa (depende do dono): ${planos.length - achados.length}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');
    const nd = fs.createWriteStream(path.join(DIR, `capas-masters-${stamp}.ndjson`));
    const gravados: Array<{ id: string; antes: unknown[]; depois: unknown[] }> = [];
    for (const p of achados) {
      nd.write(JSON.stringify({ id: p.id, antes: p.antes, depois: p.depois, por: POR, at: new Date().toISOString() }) + '\n');
      const r = await sql`UPDATE master_products SET default_images = ${sql.json(p.depois as never)} WHERE id = ${p.id}::uuid AND default_images = ${sql.json(p.antes as never)} RETURNING id`;
      if (r.length) gravados.push({ id: p.id, antes: p.antes, depois: p.depois! });
    }
    nd.end();
    fs.writeFileSync(path.join(DIR, `capas-masters-log-${stamp}.json`), JSON.stringify({ por: POR, at: new Date().toISOString(), gravados, semCapa: planos.filter((p) => !p.depois).map((p) => ({ id: p.id, name: p.name, motivo: p.motivo, obs: p.obs })) }, null, 1));
    console.log(`GRAVADOS: ${gravados.length}. Log: docs/backups/capas-masters-log-${stamp}.json`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
