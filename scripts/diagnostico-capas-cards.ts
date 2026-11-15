/**
 * Diagnóstico das capas dos cards v2 (fila #65). SOMENTE LEITURA (SELECT + GET leve nas imagens, ritmo educado).
 * Reproduz a busca da capa como o envio faz e agrupa por rede e causa.
 *   npx tsx --conditions=react-server scripts/diagnostico-capas-cards.ts [--horas 48] [--conc 4] [--max 3000]
 */
import { connect } from './_dup-shared';
export {};
const argv = process.argv.slice(2);
const arg = (k: string, d: number) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const HORAS = arg('--horas', 48);
const CONC = arg('--conc', 4);
const MAX = arg('--max', 3000);
const hostOk: Record<string, RegExp> = { 'mercado-livre': /mlstatic\.com|mercadolivre/i, shopee: /shopee|susercontent|shp\.ee/i, amazon: /media-amazon|ssl-images-amazon/i };

async function probe(url: string, slug: string): Promise<{ causa: string; detalhe?: string; ms: number }> {
  const t0 = Date.now();
  const okRe = hostOk[slug];
  if (!/^https:\/\//i.test(url)) return { causa: 'url_sem_https', ms: 0 };
  if (okRe && !okRe.test(url)) return { causa: 'host_de_outra_loja', detalhe: new URL(url).host, ms: 0 };
  let buf: Buffer; let type = '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (!res.ok) return { causa: `http_${res.status}`, ms: Date.now() - t0 };
    type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return { causa: 'content_type_invalido', detalhe: type, ms: Date.now() - t0 };
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    const m = e instanceof Error ? e.name + ':' + e.message : String(e);
    return { causa: /timeout|abort/i.test(m) ? 'timeout_5s' : 'rede', detalhe: m.slice(0, 60), ms: Date.now() - t0 };
  }
  if (buf.length < 200) return { causa: 'menor_que_200_bytes', ms: Date.now() - t0 };
  if (buf.length > 6 * 1024 * 1024) return { causa: 'maior_que_6mb', ms: Date.now() - t0 };
  try {
    const sharp = (await import('sharp')).default;
    const m = await sharp(buf, { failOn: 'none' }).metadata();
    if (!m.width || !m.height) return { causa: 'sharp_sem_dimensao', detalhe: type, ms: Date.now() - t0 };
    if (m.width < 200 || m.height < 200) return { causa: `miniatura_${m.width}x${m.height}`, detalhe: type, ms: Date.now() - t0 };
  } catch (e) {
    return { causa: 'sharp_erro', detalhe: `${type}:${(e as Error).message.slice(0, 50)}`, ms: Date.now() - t0 };
  }
  return { causa: 'ok_' + type.replace('image/', ''), ms: Date.now() - t0 };
}

async function main() {
  const sql = connect();
  const rows = await sql<{ offer_id: string; slug: string; url: string | null; n: number }[]>`
    SELECT gm.offer_id::text AS offer_id, n.slug, o.image_url AS url, count(*)::int AS n
    FROM group_messages gm JOIN affiliate_offers o ON o.id = gm.offer_id JOIN affiliate_networks n ON n.id = o.network_id
    WHERE gm.status = 'enviada' AND gm.has_card AND gm.sent_at > now() - make_interval(hours => ${HORAS})
    GROUP BY 1, 2, 3 ORDER BY max(gm.sent_at) DESC LIMIT ${MAX}`;
  await sql.end();
  console.log(`ofertas distintas: ${rows.length}`);
  const res: Array<{ slug: string; causa: string; detalhe?: string; ms: number; url: string | null; offer_id: string; n: number }> = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < rows.length) {
      const r = rows[i++]!;
      const p = r.url ? await probe(r.url, r.slug) : { causa: 'oferta_sem_image_url', ms: 0 };
      res.push({ ...r, ...p });
      await new Promise((ok) => setTimeout(ok, 120));
    }
  }));
  const tab: Record<string, Record<string, number>> = {};
  for (const r of res) { const c = r.causa.startsWith('ok_') ? r.causa : r.causa; (tab[r.slug] ??= {})[c] = (tab[r.slug]![c] ?? 0) + 1; }
  console.log(JSON.stringify(tab, null, 1));
  const lentas = res.filter((r) => r.ms > 3000).length;
  console.log('mais de 3 s:', lentas, ' mediana ms:', res.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(res.length / 2)]);
  const ruins = res.filter((r) => !r.causa.startsWith('ok_'));
  console.log('sem capa utilizável:', ruins.length, 'ofertas,', ruins.reduce((s, r) => s + r.n, 0), 'mensagens');
  for (const r of ruins.slice(0, 25)) console.log(r.slug, r.causa, r.detalhe ?? '', (r.url ?? '').slice(0, 110));
  const fs = await import('node:fs');
  fs.writeFileSync(process.env.TEMP + '/diag-capas.json', JSON.stringify(res));
}
main().catch((e) => { console.error(e); process.exit(1); });
