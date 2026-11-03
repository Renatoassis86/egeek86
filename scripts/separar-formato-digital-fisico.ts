/**
 * SEPARAR JOGO DIGITAL x FÍSICO (decisão do dono, 2026-11-03). Ata: docs/conselho/atas/2026-11-03-digital-x-fisico.md.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/separar-formato-digital-fisico.ts            # dry-run (só SELECT, grava CSVs em docs/)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/separar-formato-digital-fisico.ts --apply    # grava (exige backup <= 12 h)
 *
 * O que faz, por master de JOGO vivo:
 *   1. Formato do master = o que o NOME prova (deriveGameFormat), senão `game_format` gravado, senão desconhecido.
 *   2. Cada oferta: formato provado pelo próprio título; sem prova herda o do master.
 *   3. Master de formato conhecido com ofertas que provam o formato OPOSTO: o master fica com o formato MAJORITÁRIO,
 *      as ofertas do outro formato (e o histórico de cotações delas, que acompanha a oferta) vão para o master do
 *      formato certo (existente, achado pelo mesmo motor de identidade, ou novo: nome limpo, plataforma resolvida).
 *   4. Master de formato desconhecido cujas ofertas provam um formato majoritário: o master assume esse formato.
 *   5. `game_format` gravado passa a refletir a prova (nome); divergência nome x coluna é corrigida (log guarda o antigo).
 *   6. O que NÃO dá para provar não é tocado (nem inventado): sai das médias pela camada SQL/TS (formato desconhecido)
 *      e é LISTADO em docs/formato-nao-provado-review-2026-11-03.csv.
 * Escreve SÓ: affiliate_offers.master_product_id/status, master_products.game_format e INSERT de masters novos.
 * Nunca apaga. Log reversível: backup/dados/separar-formato-log-*.json. Desfazer: scripts/revert-separar-formato.ts <log>.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, describeBackup, readBackupIds } from './_dup-shared';
import { normalizeTitle, isSameProduct, type NormalizedTitle } from '../src/lib/affiliate/dedup';
import { titleHardwareKind } from '../src/lib/catalog/dimensions';
import { deriveGameFormat, derivePlatformFromTitle, mentionsMultipleGenerations, resolveGameFormat, type TitleGameFormat } from '../src/lib/affiliate/game-classification';
import { entryGateAttributes, evaluateCatalogGate } from '../src/lib/catalog/gate';
import { slugify } from '../src/lib/slugify';

const APPLY = process.argv.includes('--apply');
const STAMP = '2026-11-03';

const csv = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file: string, header: string[], rows: unknown[][]) =>
  fs.writeFileSync(file, '﻿' + [header.join(';'), ...rows.map((r) => r.map(csv).join(';'))].join('\n') + '\n', 'utf8');

/** Nome limpo para o master do formato novo: tira o ruído de formato/estado do vendedor e carimba o formato. */
function cleanMasterName(name: string, fmt: 'physical' | 'digital'): string {
  const base = name
    .replace(/[®™©]/g, '')
    .replace(/\bjogos?\b/gi, ' ')
    .replace(/\(\s*(?:digital|m[ií]dia\s+(?:digital|f[ií]sica)|f[ií]sic[oa])\s*\)/gi, ' ')
    .replace(/\b(?:m[ií]dia\s+(?:digital|f[ií]sica)|formato\s+f[ií]sico|f[ií]sic[oa]s?|digital|digitais|lacrad[oa]s?|novo|nova|original|c[oó]digo|psn|download)\b/gi, ' ')
    .replace(/\s*[-–—|]\s*(?=[-–—|]|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*:\s+(?:do|da|de|dos|das)\s+/gi, ': ')
    .replace(/[\s\-–—|,.]+$/g, '')
    .trim();
  return `${base} ${fmt === 'digital' ? 'Mídia Digital' : 'Mídia Física'}`.replace(/\s{2,}/g, ' ');
}

interface MasterR {
  id: string; name: string; slug: string; plat: string; col: TitleGameFormat; edition: string; edSource: string | null;
  brand_id: string | null; category_id: string | null; franchise_id: string | null; attributes: any;
}
interface OfferR { id: string; master: string; title: string; status: string; quarantined: boolean; price: number; snaps: number }

async function main() {
  const sql = connect();
  try {
    await sql`SET statement_timeout = '300s'`;
    const masters: MasterR[] = (
      await sql<any[]>`select id, name, slug::text slug, game_platform_gen::text plat, game_format::text col, game_edition_type::text edition, game_edition_source::text ed_source,
                       brand_id, category_id, franchise_id, attributes
                       from master_products where product_type = 'game' and attributes->>'mergedInto' is null`
    ).map((m) => ({ ...m, edSource: m.ed_source }));
    const allSlugs = new Set((await sql<{ slug: string }[]>`select slug::text slug from master_products`).map((r) => r.slug));
    const offers: OfferR[] = (
      await sql<any[]>`select o.id, o.master_product_id master, o.title, o.status::text status, (o.quarantined_at is not null) quarantined, o.current_price_cents price,
                       (select count(*) from affiliate_price_snapshots s where s.offer_id = o.id)::int snaps
                       from affiliate_offers o join master_products m on m.id = o.master_product_id
                       where m.product_type = 'game' and m.attributes->>'mergedInto' is null`
    ).map((o) => ({ ...o, price: Number(o.price) }));
    const [{ n: offersBefore }] = await sql`select count(*)::int n from affiliate_offers`;
    const [{ n: snapsBefore }] = await sql`select count(*)::bigint n from affiliate_price_snapshots`;
    const [{ n: mastersBefore }] = await sql`select count(*)::int n from master_products`;

    const meliIds = new Set((await sql<{ id: string }[]>`select id from master_products where meli_catalog_id is not null`).map((r) => r.id));
    const offersByMaster = new Map<string, OfferR[]>();
    for (const o of offers) (offersByMaster.get(o.master) ?? offersByMaster.set(o.master, []).get(o.master)!).push(o);

    // --- formato efetivo de cada master (nome vence coluna) e base de comparação ---------------------------------
    const effFmt = new Map<string, TitleGameFormat>();
    const norm = new Map<string, NormalizedTitle>();
    const plat = new Map<string, string>();
    for (const m of masters) {
      const f = resolveGameFormat(m.name, m.col);
      effFmt.set(m.id, f);
      norm.set(m.id, normalizeTitle(m.name, { productType: 'game', gameFormat: f }));
      plat.set(m.id, m.plat !== 'unknown' ? m.plat : derivePlatformFromTitle(m.name));
    }

    // --- plano -----------------------------------------------------------------------------------------------------
    type Move = { offer: OfferR; from: MasterR; fmt: 'physical' | 'digital'; toId?: string; toNewKey?: string };
    const colChanges: Array<{ m: MasterR; from: TitleGameFormat; to: TitleGameFormat; why: string }> = [];
    const moves: Move[] = [];
    const drafts: Array<{ offer: OfferR; m: MasterR; why: string }> = [];
    const newMasters = new Map<string, { key: string; name: string; fmt: 'physical' | 'digital'; plat: string; origin: MasterR; offers: OfferR[] }>();
    const unprovable: Array<{ m: MasterR; active: number; total: number; twin: string; gate: string; meli: boolean }> = [];
    const noDest: Array<{ offer: OfferR; m: MasterR; fmt: string; why: string }> = [];
    const liveByFmtPlat = new Map<string, MasterR[]>();
    for (const m of masters) {
      const k = `${plat.get(m.id)}|${effFmt.get(m.id)}`;
      (liveByFmtPlat.get(k) ?? liveByFmtPlat.set(k, []).get(k)!).push(m);
    }
    const findTwin = (name: string, fmt: TitleGameFormat, p: string, excludeId: string): MasterR | null => {
      const n = normalizeTitle(name, { productType: 'game', gameFormat: fmt });
      if (!n.coreTitle) return null;
      for (const c of liveByFmtPlat.get(`${p}|${fmt}`) ?? []) {
        if (c.id === excludeId) continue;
        if (isSameProduct(n, norm.get(c.id)!, 0.8)) return c;
      }
      return null;
    };

    const stats = { mastersGame: masters.length, formatKnown: 0, formatUnknown: 0, mixed: 0, colFix: 0, adopted: 0 };
    const wrongType: MasterR[] = [];
    for (const m of masters) {
      // Console/acessório cadastrado como 'game' (tipo errado): formato não se aplica; fica fora desta rotina e é listado.
      if (titleHardwareKind(m.name) !== 'game') { wrongType.push(m); continue; }
      const list = offersByMaster.get(m.id) ?? [];
      let M = effFmt.get(m.id)!;
      const proven = list.map((o) => ({ o, f: deriveGameFormat(o.title) }));
      const cntP = proven.filter((x) => x.f === 'physical').length;
      const cntD = proven.filter((x) => x.f === 'digital').length;

      if (M === 'unknown') {
        stats.formatUnknown++;
        if (cntP + cntD > 0 && cntP !== cntD) {
          // o master assume o formato que as ofertas provam em maioria (títulos de vendedor são evidência direta)
          M = cntP > cntD ? 'physical' : 'digital';
          colChanges.push({ m, from: m.col, to: M, why: `ofertas provam ${cntP} físico x ${cntD} digital` });
          stats.adopted++;
        } else {
          const active = list.filter((o) => o.status === 'active').length;
          let twin = '';
          const tw = findTwin(m.name, 'physical', plat.get(m.id)!, m.id) ?? findTwin(m.name, 'digital', plat.get(m.id)!, m.id);
          if (tw) twin = `${tw.id} | ${tw.name} | ${effFmt.get(tw.id)}`;
          const gate = evaluateCatalogGate({ name: m.name, productType: 'game' as any, gamePlatformGen: m.plat, gameFormat: m.col, offerTitles: list.filter((o) => o.status === 'active').map((o) => o.title) });
          unprovable.push({ m, active, total: list.length, twin, gate: gate.verdict, meli: meliIds.has(m.id) });
          continue;
        }
      } else {
        stats.formatKnown++;
        if (m.col !== M) {
          colChanges.push({ m, from: m.col, to: M, why: deriveGameFormat(m.name) !== 'unknown' ? 'nome prova o formato' : 'coluna' });
          stats.colFix++;
        }
      }

      // Master tem formato M. Ofertas que provam o formato OPOSTO saem.
      const wrong = proven.filter((x) => x.f !== 'unknown' && x.f !== M);
      if (cntP + cntD > 0 && wrong.length > 0) {
        stats.mixed++;
        // O master fica com o formato MAJORITÁRIO das ofertas que provam; se o nome prova o formato, o nome decide.
        const nameFmt = deriveGameFormat(m.name);
        let keep: TitleGameFormat = M;
        if (nameFmt === 'unknown' && cntP !== cntD) keep = cntP > cntD ? 'physical' : 'digital';
        if (keep !== M) {
          const prev = colChanges.findIndex((c) => c.m.id === m.id);
          if (prev >= 0) colChanges.splice(prev, 1);
          colChanges.push({ m, from: m.col, to: keep, why: `formato majoritário das ofertas (${cntP} físico x ${cntD} digital)` });
        }
        for (const x of proven) {
          if (x.f === 'unknown' || x.f === keep) continue;
          const fmt = x.f as 'physical' | 'digital';
          const cleaned = cleanMasterName(m.name, fmt);
          const p = plat.get(m.id)!;
          if (p === 'unknown' || mentionsMultipleGenerations(m.name)) {
            noDest.push({ offer: x.o, m, fmt, why: 'plataforma não resolvida/cross-gen: sem master de destino seguro' });
            if (x.o.status === 'active') drafts.push({ offer: x.o, m, why: `formato ${fmt} sem destino seguro` });
            continue;
          }
          const twin = findTwin(cleaned, fmt, p, m.id);
          if (twin) {
            moves.push({ offer: x.o, from: m, fmt, toId: twin.id });
          } else {
            const key = `${p}|${fmt}|${normalizeTitle(cleaned, { productType: 'game', gameFormat: fmt }).coreTitle}|${normalizeTitle(cleaned, { productType: 'game', gameFormat: fmt }).markers.join(',')}`;
            const g = newMasters.get(key) ?? { key, name: cleaned, fmt, plat: p, origin: m, offers: [] as OfferR[] };
            g.offers.push(x.o);
            newMasters.set(key, g);
            moves.push({ offer: x.o, from: m, fmt, toNewKey: key });
          }
        }
      }
    }

    // --- relatório -------------------------------------------------------------------------------------------------
    const docs = path.resolve(process.cwd(), 'docs');
    const suffix = APPLY ? 'aplicado' : 'dryrun';
    const planCsv = path.join(docs, `separacao-formato-${suffix}-${STAMP}.csv`);
    const rows: unknown[][] = [];
    for (const c of colChanges) rows.push(['coluna_game_format', c.m.id, c.m.name, plat.get(c.m.id), c.from, c.to, '', '', c.why]);
    for (const mv of moves) {
      const g = mv.toNewKey ? newMasters.get(mv.toNewKey)! : null;
      const dest = g ? `NOVO: ${g.name}` : `${mv.toId} | ${masters.find((x) => x.id === mv.toId)?.name}`;
      rows.push(['mover_oferta', mv.from.id, mv.from.name, plat.get(mv.from.id), effFmt.get(mv.from.id), mv.fmt, mv.offer.id, `${mv.offer.status} | ${mv.offer.snaps} cotacoes | ${mv.offer.title.slice(0, 80)}`, dest]);
    }
    for (const d of drafts) rows.push(['oferta_para_revisao', d.m.id, d.m.name, plat.get(d.m.id), effFmt.get(d.m.id), '', d.offer.id, `${d.offer.status} | ${d.offer.title.slice(0, 80)}`, d.why]);
    writeCsv(planCsv, ['acao', 'master_id', 'master_nome', 'plataforma', 'formato_master', 'formato_alvo', 'oferta_id', 'oferta', 'destino_ou_motivo'], rows);

    const reviewCsv = path.join(docs, `formato-nao-provado-review-${STAMP}.csv`);
    writeCsv(
      reviewCsv,
      ['master_id', 'nome', 'plataforma', 'game_format_gravado', 'ofertas_ativas', 'ofertas_total', 'veredito_porteiro', 'tem_catalogo_ml', 'possivel_gemeo_de_formato_conhecido'],
      unprovable.sort((a, b) => b.active - a.active).map((u) => [u.m.id, u.m.name, plat.get(u.m.id), u.m.col, u.active, u.total, u.gate, u.meli ? 'sim' : 'nao', u.twin])
    );

    const mixedMasters = new Set(moves.map((m) => m.from.id)).size;
    console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Masters de jogo vivos: ${stats.mastersGame} (fora da rotina por título de console/acessório com tipo 'game': ${wrongType.length})`);
    console.log(`  formato provado (nome ou coluna): ${stats.formatKnown}; desconhecido: ${stats.formatUnknown} (adotaram formato pelas ofertas: ${stats.adopted}; sem prova alguma: ${unprovable.length})`);
    console.log(`  coluna game_format a gravar: ${colChanges.length} (${colChanges.filter((c) => c.from === 'unknown').length} saem de 'unknown')`);
    console.log(`  masters MISTOS (ofertas de formato oposto): ${mixedMasters}; ofertas a mover: ${moves.length} (p/ master existente: ${moves.filter((m) => m.toId).length}; p/ master NOVO: ${moves.filter((m) => m.toNewKey).length} em ${newMasters.size} masters novos)`);
    console.log(`  ofertas ativas p/ revisão (draft): ${drafts.length}; sem destino seguro: ${noDest.length}`);
    const unprovActive = unprovable.reduce((s, u) => s + u.active, 0);
    console.log(`  masters SEM prova de formato (ficam fora das médias): ${unprovable.length} com ${unprovActive} ofertas ativas; com possível gêmeo de formato conhecido: ${unprovable.filter((u) => u.twin).length}`);
    const legit = unprovable.filter((u) => u.gate === 'approved');
    console.log(`    destes, aprovados pelo porteiro (jogo legítimo, o que realmente sai das médias): ${legit.length} masters, ${legit.reduce((s, u) => s + u.active, 0)} ofertas ativas; com catálogo ML (provável via API): ${legit.filter((u) => u.meli).length}; sem catálogo ML: ${legit.filter((u) => !u.meli).length}`);
    for (const g of newMasters.values()) console.log(`  CRIAR [${g.plat}/${g.fmt}] ${g.name}  <- ${g.origin.name.slice(0, 60)} (${g.offers.length} ofertas)`);
    console.log('CSV:', path.relative(process.cwd(), planCsv), '|', path.relative(process.cwd(), reviewCsv));

    const backup = describeBackup(process.cwd(), 12);
    const bo = readBackupIds(path.join(backup.dir, 'affiliate_offers.ndjson'));
    const bm = readBackupIds(path.join(backup.dir, 'master_products.ndjson'));
    const touchedOffers = [...moves.map((m) => m.offer.id), ...drafts.map((d) => d.offer.id)];
    const touchedMasters = [...colChanges.map((c) => c.m.id), ...moves.map((m) => m.from.id)];
    const missing = touchedOffers.filter((id) => !bo.has(id)).length + touchedMasters.filter((id) => !bm.has(id)).length;
    const backupOk = backup.ok && missing === 0;
    console.log(`Backup <=12h cobrindo o plano: ${backupOk} (idade ${backup.info.map((i) => i.file + ':' + i.ageHours.toFixed(1) + 'h').join(' ')}; ids ausentes ${missing})`);
    if (!APPLY) return;
    if (!backupOk) throw new Error('Backup ausente/antigo/incompleto. Rode: node --env-file=.env.local backup/backup-pre-fusao.mjs');

    const logFile = path.resolve(process.cwd(), 'backup', 'dados', `separar-formato-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const log: any = { criado_em: new Date().toISOString(), masters_criados: [], movimentos: [], rascunhos: [], colunas: [] };
    await sql
      .begin(async (tx) => {
        await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`; // a coleta viva insere ofertas durante a execução: contar sobre um snapshot só
        await tx`SET LOCAL statement_timeout = '300s'`;
        const [{ n: offersAtStart }] = await tx`select count(*)::int n from affiliate_offers`;
        const ids = [...new Set(touchedOffers)];
        const snapB = await tx`select count(*)::bigint n from affiliate_price_snapshots where offer_id = any(${ids}::uuid[])`;
        const createdId = new Map<string, string>();
        for (const g of newMasters.values()) {
          let slug = slugify(g.name);
          let i = 2;
          while (allSlugs.has(slug)) slug = `${slugify(g.name)}-${i++}`;
          allSlugs.add(slug);
          const gate = entryGateAttributes(g.name, 'game', { gameFormat: g.fmt, gamePlatformGen: g.plat });
          const attrs = { ...gate, splitFromFormat: { from: g.origin.id, at: new Date().toISOString() } };
          const [row] = await tx`insert into master_products (name, slug, product_type, game_platform_gen, game_format, game_edition_type, game_edition_source, brand_id, category_id, franchise_id, attributes, classified_at)
            values (${g.name}, ${slug}, 'game', ${g.plat}::game_platform_gen, ${g.fmt}::game_format, ${g.origin.edition}::game_edition_type, ${g.origin.edSource}::game_edition_source, ${g.origin.brand_id}, ${g.origin.category_id}, ${g.origin.franchise_id}, ${tx.json(attrs)}, now()) returning id`;
          createdId.set(g.key, row.id);
          log.masters_criados.push({ id: row.id, name: g.name, slug, platform: g.plat, formato: g.fmt, origem: g.origin.id });
        }
        for (const c of colChanges) {
          const u = await tx`update master_products set game_format = ${c.to}::game_format, updated_at = now() where id = ${c.m.id} and game_format = ${c.from}::game_format`;
          if (u.count !== 1) throw new Error('coluna mudou desde o plano: ' + c.m.id);
          log.colunas.push({ master_id: c.m.id, nome: c.m.name, de: c.from, para: c.to, motivo: c.why });
        }
        for (const mv of moves) {
          const to = mv.toId ?? createdId.get(mv.toNewKey!)!;
          if (mv.toId) {
            const [d] = await tx`select attributes->>'mergedInto' mi from master_products where id=${mv.toId}`;
            if (!d || d.mi) throw new Error('destino arquivado');
          }
          const u = await tx`update affiliate_offers set master_product_id=${to}, updated_at=now() where id=${mv.offer.id} and master_product_id=${mv.from.id}`;
          if (u.count !== 1) throw new Error('falha ao mover ' + mv.offer.id);
          log.movimentos.push({ offer_id: mv.offer.id, status: mv.offer.status, master_antigo: mv.from.id, master_novo: to, formato: mv.fmt, titulo: mv.offer.title, cotacoes: mv.offer.snaps });
        }
        for (const d of drafts) {
          const u = await tx`update affiliate_offers set status='draft', updated_at=now() where id=${d.offer.id} and status='active'`;
          if (u.count !== 1) throw new Error('falha ao rascunhar ' + d.offer.id);
          log.rascunhos.push({ offer_id: d.offer.id, status_antigo: 'active', master: d.m.id, titulo: d.offer.title, motivo: d.why });
        }
        const [{ n: oa }] = await tx`select count(*)::int n from affiliate_offers`;
        const snapA = await tx`select count(*)::bigint n from affiliate_price_snapshots where offer_id = any(${ids}::uuid[])`;
        if (oa !== offersAtStart) throw new Error('contagem de ofertas mudou');
        if (String(snapA[0].n) !== String(snapB[0].n)) throw new Error('cotações das ofertas afetadas mudaram');
        log.contagens = { ofertas_antes: offersAtStart, ofertas_depois: oa, masters_antes: mastersBefore, masters_criados: newMasters.size, cotacoes_total_antes: String(snapsBefore), cotacoes_das_ofertas_afetadas: String(snapB[0].n) };
        fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
      })
      .catch((e) => {
        if (fs.existsSync(logFile)) fs.renameSync(logFile, logFile + '.invalido');
        throw e;
      });
    console.log('Log:', path.relative(process.cwd(), logFile));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error('Falha:', e instanceof Error ? e.message : e);
  process.exit(1);
});
