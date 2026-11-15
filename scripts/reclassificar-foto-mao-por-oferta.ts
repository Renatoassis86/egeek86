/**
 * FOTO COM MAO POR OFERTA (dono, 2026-11-15). Substitui a rejeicao do MASTER por `foto_com_mao` (scripts/aplicar-foto-com-mao.ts, 2026-11-14).
 *
 * Regra: so MAO REAL segurando/tocando o produto (foto de ambiente = sinal de seminovo) conta. Mao ILUSTRADA ou impressa na arte da caixa oficial
 * (ex.: caixa do Switch Lite) NAO conta. A marca vale para a OFERTA cuja foto tem a mao: `affiliate_offers.quarantined_at` (a oferta some de
 * ofertas publicas, medias, selo e historico; nada e apagado). O master nunca e rejeitado por foto: um master agrega varios vendedores.
 *
 * Entrada: mapa por URL de imagem { classes: { "<url>": { classe: "mao_real" | "sem_mao_real" | "erro", obs } } }, classificado em TAMANHO CHEIO
 * (visual). Exemplo: docs/backups/foto-mao-real-por-url-2026-11-15.json. Oferta sem imagem herda a classe da foto do master.
 *
 *   # DRY-RUN (padrao): contagens antes/depois, nada gravado
 *   npx tsx --env-file=.env.local scripts/reclassificar-foto-mao-por-oferta.ts <mapa.json> [--liberar-masters]
 *   # APLICAR
 *   npx tsx --env-file=.env.local scripts/reclassificar-foto-mao-por-oferta.ts <mapa.json> [--liberar-masters] --apply --por "Nome"
 *   # REVERTER (quarentenas e vereditos deste lote; guarda otimista)
 *   npx tsx --env-file=.env.local scripts/reclassificar-foto-mao-por-oferta.ts --rollback docs/backups/foto-mao-oferta-log-<ts>.json [--apply]
 *
 * Fluxo futuro (so oferta): classifique as fotos novas por URL (mao real x arte da caixa) e rode SEM --liberar-masters: so poe em quarentena as
 * ofertas ativas cuja imagem foi classificada mao_real. `--liberar-masters` e a migracao unica dos masters rejeitados por foto_com_mao: o veredito
 * volta ao anterior do porteiro (catalogGateAnterior dos backups foto-com-mao-*.ndjson) ou, sem backup, o porteiro roda; se o porteiro nao aprova
 * (usado/retro/outro risco), grava o veredito do porteiro. Decisao humana (catalogGate.manual) e respeitada. Motivo da quarentena: `foto_com_mao`
 * (registrado no log e no backup; a tabela de ofertas nao tem coluna de motivo).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { evaluateCatalogGate, toPersistedGate, type PersistedGate } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIBERAR = argv.includes('--liberar-masters');
const por = argv.indexOf('--por') >= 0 ? argv[argv.indexOf('--por') + 1] : '';
const rbIdx = argv.indexOf('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const MOTIVO = 'foto_com_mao';

type Classe = { classe: string; obs?: string };
type Log = {
  criadoEm: string; por: string; backup: string; motivo: string;
  quarentenados: Array<{ id: string; master: string; url: string | null; antes: string | null }>;
  masters: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate; origem: string }>;
};

async function contagens(sql: ReturnType<typeof connect>) {
  const [a] = await sql<{ masters: string; ofertas: string }[]>`
    SELECT count(*)::text AS masters,
      (SELECT count(*) FROM affiliate_offers o WHERE o.status = 'active' AND o.master_product_id IN (SELECT id FROM master_products WHERE attributes -> 'catalogGate' ->> 'reason' = ${MOTIVO}))::text AS ofertas
    FROM master_products WHERE attributes -> 'catalogGate' ->> 'reason' = ${MOTIVO}`;
  const [b] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM affiliate_offers WHERE status = 'active' AND quarantined_at IS NOT NULL`;
  return { mastersRejeitadosPorFoto: Number(a!.masters), ofertasAtivasEmMastersRejeitadosPorFoto: Number(a!.ofertas), ofertasAtivasEmQuarentena: Number(b!.n) };
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (rbIdx >= 0) {
      const log = JSON.parse(fs.readFileSync(argv[rbIdx + 1]!, 'utf8')) as Log;
      console.log(`rollback: ${log.quarentenados.length} quarentenas, ${log.masters.length} masters`);
      if (!APPLY) return void console.log('DRY-RUN: use --apply');
      for (let i = 0; i < log.quarentenados.length; i += 50) {
        const ids = log.quarentenados.slice(i, i + 50).map((q) => q.id);
        await sql`UPDATE affiliate_offers SET quarantined_at = NULL, updated_at = now() WHERE id = ANY(${ids}::uuid[]) AND quarantined_at IS NOT NULL`;
      }
      for (const g of log.masters) {
        if (g.antes) await sql`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(g.antes)}::text::jsonb, true) WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
        else await sql`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
      }
      return void console.log('ROLLBACK aplicado.', await contagens(sql));
    }

    const file = argv.find((a) => a.endsWith('.json') && argv[argv.indexOf(a) - 1] !== '--por');
    if (!file) throw new Error('informe o mapa de classes por URL (.json)');
    const mapa = (JSON.parse(fs.readFileSync(file, 'utf8')) as { classes: Record<string, Classe> }).classes;
    const mao = (u: string | null | undefined) => !!u && mapa[u]?.classe === 'mao_real';
    const now = new Date().toISOString();

    const antes = await contagens(sql);
    console.log('ANTES:', antes);

    // 1) Ofertas: so MAO REAL vai para quarentena. Vale para ofertas ativas de QUALQUER master cuja imagem esteja no mapa (fluxo futuro) e, de masters
    //    rejeitados por foto, tambem ofertas sem imagem herdando a foto do master.
    const ofertas = await sql<{ id: string; master: string; img: string | null; mimg: string | null; q: string | null; rejeitado: boolean }[]>`
      SELECT o.id::text AS id, o.master_product_id::text AS master, o.image_url AS img, m.default_images ->> 0 AS mimg, o.quarantined_at::text AS q,
             (m.attributes -> 'catalogGate' ->> 'reason' = ${MOTIVO}) AS rejeitado
      FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id
      WHERE o.status = 'active' AND (o.image_url = ANY(${Object.keys(mapa)}::text[]) OR (o.image_url IS NULL AND m.attributes -> 'catalogGate' ->> 'reason' = ${MOTIVO}))`;
    const log: Log = { criadoEm: now, por: por ?? '', backup: '', motivo: MOTIVO, quarentenados: [], masters: [] };
    for (const o of ofertas) {
      const url = o.img ?? o.mimg;
      if (mao(url) && !o.q) log.quarentenados.push({ id: o.id, master: o.master, url, antes: null });
    }
    console.log(`Ofertas ativas avaliadas: ${ofertas.length}; a pôr em quarentena (mao real): ${log.quarentenados.length}`);

    // 2) Masters rejeitados por foto: volta ao veredito anterior / porteiro
    if (LIBERAR) {
      const anteriores = new Map<string, PersistedGate | null>();
      for (const f of fs.readdirSync(DIR).filter((x) => /^foto-com-mao-\d.*\.ndjson$/.test(x)).sort()) {
        for (const l of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean)) {
          const j = JSON.parse(l) as { id: string; catalogGateAnterior: PersistedGate | null };
          if (!anteriores.has(j.id)) anteriores.set(j.id, j.catalogGateAnterior);
        }
      }
      const ms = await sql<{ id: string; name: string; pt: string; gf: string | null; gen: string | null; gate: PersistedGate; titles: string[] | null; med: string | null }[]>`
        SELECT m.id::text AS id, m.name, m.product_type::text AS pt, m.game_format::text AS gf, m.game_platform_gen::text AS gen, m.attributes -> 'catalogGate' AS gate,
          (SELECT array_agg(DISTINCT o.title) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS titles,
          (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0)::text AS med
        FROM master_products m WHERE m.attributes -> 'catalogGate' ->> 'reason' = ${MOTIVO}`;
      const cont: Record<string, number> = {};
      for (const m of ms) {
        if (m.gate.manual) { cont.manual_ignorado = (cont.manual_ignorado ?? 0) + 1; continue; }
        const res = evaluateCatalogGate({ name: m.name, productType: m.pt as never, gameFormat: m.gf, gamePlatformGen: m.gen, offerTitles: m.titles ?? [], medianPriceCents: m.med == null ? null : Math.round(Number(m.med)), manual: null } as never);
        let depois: PersistedGate; let origem: string;
        if (res.verdict !== 'approved') { depois = toPersistedGate(res, now); origem = `porteiro:${res.verdict}/${res.reason}`; }
        else if (anteriores.get(m.id)) { depois = { ...anteriores.get(m.id)!, at: now } as PersistedGate; origem = 'catalogGateAnterior'; }
        else { depois = { ...toPersistedGate(res, now), approvedBy: 'porteiro:foto-mao-oferta-2026-11-15' } as unknown as PersistedGate; origem = 'porteiro:approved'; }
        cont[origem.split('/')[0]!] = (cont[origem.split('/')[0]!] ?? 0) + 1;
        log.masters.push({ id: m.id, antes: m.gate, depois, origem });
      }
      console.log('Masters a liberar/reavaliar:', log.masters.length, cont);
      const naoAprovados = log.masters.filter((x) => x.depois.verdict !== 'approved');
      for (const x of naoAprovados) console.log(`  continua barrado: ${x.id.slice(0, 8)} ${x.origem}`);
    }

    const liberadosAprov = log.masters.filter((x) => x.depois.verdict === 'approved');
    const quarSet = new Set(log.quarentenados.map((q) => q.id));
    const ofertasLiberadas = ofertas.filter((o) => o.rejeitado && !quarSet.has(o.id) && !o.q && log.masters.some((m) => m.id === o.master && m.depois.verdict === 'approved')).length;
    console.log(`PREVISAO: masters liberados ${liberadosAprov.length}; ofertas ativas liberadas (visiveis) ${ofertasLiberadas}; ofertas em quarentena por mao real ${log.quarentenados.length}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. Use --apply --por "Nome".');
    if (!por) throw new Error('--por "Nome" e obrigatorio com --apply');

    const bk = path.join(DIR, `foto-mao-oferta-${stamp}.ndjson`);
    fs.writeFileSync(bk, [
      ...log.quarentenados.map((q) => JSON.stringify({ acao: 'quarentenar', ...q })),
      ...log.masters.map((g) => JSON.stringify({ acao: 'master', id: g.id, catalogGateAnterior: g.antes, origem: g.origem })),
    ].join('\n') + '\n');
    log.backup = path.basename(bk);

    // transacoes curtas: lotes de 50; quarentena primeiro (a mao real nunca fica visivel), depois os masters
    let q = 0; let g = 0;
    for (let i = 0; i < log.quarentenados.length; i += 50) {
      const ids = log.quarentenados.slice(i, i + 50).map((x) => x.id);
      const r = await sql`UPDATE affiliate_offers SET quarantined_at = now(), updated_at = now() WHERE id = ANY(${ids}::uuid[]) AND quarantined_at IS NULL AND status = 'active'`;
      q += r.count;
    }
    for (const m of log.masters) {
      const r = await sql`UPDATE master_products SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{catalogGate}', ${JSON.stringify(m.depois)}::text::jsonb, true)
                          WHERE id = ${m.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${m.antes!.at} AND attributes -> 'catalogGate' ->> 'reason' = ${MOTIVO}`;
      g += r.count;
    }
    const lf = path.join(DIR, `foto-mao-oferta-log-${stamp}.json`);
    fs.writeFileSync(lf, JSON.stringify({ ...log, gravados: { quarentenas: q, masters: g }, rollback: `npx tsx --env-file=.env.local scripts/reclassificar-foto-mao-por-oferta.ts --rollback docs/backups/${path.basename(lf)} --apply` }, null, 2));
    console.log(`GRAVADO: quarentenas ${q}/${log.quarentenados.length}, masters ${g}/${log.masters.length} | backup ${bk} | log ${lf}`);
    console.log('DEPOIS:', await contagens(sql));
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
