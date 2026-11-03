/**
 * Identidade da cesta, ETAPA 2 (dados). Ver docs/conselho/atas/2026-11-03-identidade-da-cesta-etapa-codigo.md.
 *
 *   npx tsx scripts/apply-identidade-etapa2.ts <dir-com-plan-c.json>            # dry-run (só SELECT)
 *   npx tsx scripts/apply-identidade-etapa2.ts <dir-com-plan-c.json> --apply    # grava (exige backup <= 12 h)
 *
 * Escreve SÓ: affiliate_offers.master_product_id / status (oferta divergente -> 'draft') e INSERT de masters novos.
 * Nunca apaga; cotações acompanham a oferta. Log reversível: backup/dados/identidade-etapa2-log-*.json.
 * Desfazer: npx tsx scripts/revert-identidade-etapa2.ts <log>
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, describeBackup, readBackupIds } from './_dup-shared';
import { evaluateOfferIdentity } from '../src/lib/affiliate/offer-identity';
import { normalizeTitle, isSameProduct, mentionsMultipleGenerations } from '../src/lib/affiliate/dedup';
import { derivePlatformFromTitle } from '../src/lib/affiliate/game-classification';
import { evaluateCatalogGate } from '../src/lib/catalog/gate';
import { slugify } from '../src/lib/slugify';

const APPLY = process.argv.includes('--apply');
const SP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';

/** Criação de master curada (nome limpo derivado do título real do anúncio, sem ruído de vendedor). */
const CREATE: Array<{ re: RegExp; name: string; why: string }> = [
  { re: /^Jogo Mídia Física Doom Para Xbox One$/i, name: 'Doom Xbox One Mídia Física', why: 'geração (Xbox One)' },
  { re: /^Jogo Midia Fisica Dark Pictures House Of Ashes Xbox Series$/i, name: 'Dark Pictures House of Ashes Xbox Series Mídia Física', why: 'geração (Xbox Series)' },
  { re: /^Jogo Street Fighter 30th Anniversary Collection - Xbox One$/i, name: 'Street Fighter 30th Anniversary Collection Xbox One Mídia Física', why: 'geração (Xbox One)' },
  { re: /^Jogo Xbox One Mídia Física LEGO Star Wars The Skywalker Saga/i, name: 'Lego Star Wars The Skywalker Saga Xbox One Mídia Física', why: 'geração (Xbox One)' },
  { re: /^Jogo Forza Horizon 5 Midia Fisica Standard Edition- Xbox One$/i, name: 'Forza Horizon 5 Standard Edition Xbox One Mídia Física', why: 'geração (Xbox One)' },
  { re: /^Jogo Scribblenauts Showdown Xbox One$/i, name: 'Scribblenauts Showdown Xbox One Mídia Física', why: 'geração (Xbox One)' },
  { re: /^Jogo Assassin's Creed para Xbox 360$/i, name: "Assassin's Creed Xbox 360 Mídia Física", why: 'geração (Xbox 360)' },
  { re: /^Liga de Batalha de Mario Strikers Euro Nintendo Switch$/i, name: 'Mario Strikers Liga de Batalha Euro Nintendo Switch Mídia Física', why: 'região (EUR)' },
  { re: /^JOGO SONIC FORCES NINTENDO SWITCH ENVIO IMEDIATO$/i, name: 'Sonic Forces Nintendo Switch Mídia Física', why: 'região (nacional x EUR)' },
  { re: /^(Jogo )?The Legend of Zelda: Breath of the Wild Edição Especial/i, name: 'The Legend of Zelda Breath of the Wild Edição Especial Nintendo Switch Mídia Física', why: 'edição especial' },
  { re: /^Mídia Física Original Nacional Zelda Tears of Kingdom Nintendo Switch$/i, name: 'The Legend of Zelda Tears of the Kingdom Nintendo Switch Mídia Física', why: 'formato (físico x digital)' },
  { re: /^Gran Turismo Sport PS4 Mídia Física PT BR$/i, name: 'Gran Turismo Sport PS4 Mídia Física', why: 'relançamento (Hits) x padrão' },
  { re: /^\[New Price Edition\] FINAL FANTASY VII REMAKE INTERGRADE/i, name: '[New Price Edition] Final Fantasy VII Remake Intergrade PS5 Japão Importado', why: 'região (Japão)' },
];
/** Divergência que é ruído do motor ou decisão pendente do dono (Remake): a oferta NÃO é alterada. */
const LEAVE: RegExp[] = [/^conteudo: remake só no título A$/, /^titulo: palavras diferentes: anúncio \{formato\}/];
const LEAVE_TITLE: RegExp[] = [/^Super Mario Bros \.U Deluxe/i];

async function main() {
  if (!SP) throw new Error('Informe o diretório do plan-c.json como 1º argumento.');
  const plan: any[] = JSON.parse(fs.readFileSync(path.join(SP, 'plan-c.json'), 'utf8')).filter((r: any) => r.reason === 'divergencia');
  const sql = connect();
  try {
    const masters: any[] = await sql`select id,name,slug::text slug,product_type::text pt,game_platform_gen::text plat,game_format::text fmt,brand_id,category_id,franchise_id,attributes from master_products`;
    const liveMasters = masters.filter((m) => !m.attributes?.mergedInto);
    const byId = new Map(masters.map((m) => [m.id, m]));
    const slugs = new Set(masters.map((m) => m.slug));
    const [{ n: offersBefore }] = await sql`select count(*)::int n from affiliate_offers`;
    const [{ n: snapsBefore }] = await sql`select count(*)::bigint n from affiliate_price_snapshots`;
    const [{ n: mastersBefore }] = await sql`select count(*)::int n from master_products`;

    const moves: any[] = [];
    const drafts: any[] = [];
    const leave: any[] = [];
    const createdMap = new Map<string, any>();
    const failed: any[] = [];
    for (const r of plan) {
      const cur = await sql`select status::text st, master_product_id mid from affiliate_offers where id=${r.offer}`;
      if (!cur[0] || cur[0].st !== 'active' || cur[0].mid !== r.master) { failed.push({ ...r, why: 'estado mudou desde o plano' }); continue; }
      if (LEAVE.some((x) => x.test(r.sum)) || LEAVE_TITLE.some((x) => x.test(r.title))) { leave.push(r); continue; }
      if (r.action === 'mover') { moves.push({ ...r, to: r.dest[0].id, toName: r.dest[0].name }); continue; }
      const c = CREATE.find((x) => x.re.test(r.title.trim()));
      if (c && r.action === 'sem_destino') {
        const m = byId.get(r.master);
        const plat = mentionsMultipleGenerations(c.name) ? 'unknown' : derivePlatformFromTitle(c.name);
        const ev = evaluateOfferIdentity(r.title, { name: c.name, productType: 'game' });
        const gate = evaluateCatalogGate({ name: c.name, productType: 'game' as any, gameFormat: 'physical', gamePlatformGen: plat });
        const nOfferPlat = mentionsMultipleGenerations(r.title) ? 'unknown' : derivePlatformFromTitle(r.title);
        const nn = normalizeTitle(c.name, { productType: 'game' });
        const twin = liveMasters.find((x) => x.pt === 'game' && x.plat === plat && x.fmt !== 'digital' && isSameProduct(nn, normalizeTitle(x.name, { productType: 'game' }), 0.8));
        const ok = plat !== 'unknown' && plat === nOfferPlat && !ev.excluded && gate.verdict === 'approved';
        if (!ok) { failed.push({ ...r, why: `validação da criação falhou (plat ${plat}/${nOfferPlat}, ident ${ev.summary}, gate ${gate.verdict})` }); drafts.push(r); continue; }
        if (twin) {
          if (evaluateOfferIdentity(r.title, { name: twin.name, productType: 'game' }).excluded) { drafts.push(r); continue; }
          moves.push({ ...r, to: twin.id, toName: twin.name });
          continue;
        }
        let g = createdMap.get(c.name);
        if (!g) {
          let slug = slugify(c.name);
          let i = 2;
          while (slugs.has(slug)) slug = `${slugify(c.name)}-${i++}`;
          slugs.add(slug);
          g = { name: c.name, slug, plat, why: c.why, from: m.id, brand_id: m.brand_id, category_id: m.category_id, franchise_id: m.franchise_id, id: null };
          createdMap.set(c.name, g);
        }
        moves.push({ ...r, createName: c.name, toName: c.name });
        continue;
      }
      drafts.push(r);
    }
    console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Divergentes analisadas: ${plan.length}; mover p/ master existente: ${moves.filter((m) => m.to).length}; mover p/ master NOVO: ${moves.filter((m) => m.createName).length} (${createdMap.size} masters a criar); em revisão (draft): ${drafts.length}; deixadas como estão (ruído/Remake pendente): ${leave.length}; falhas/estado mudou: ${failed.length}`);
    for (const g of createdMap.values()) console.log('  CRIAR', g.plat, '|', g.name, '|', g.why);
    for (const m of moves.filter((x) => x.to)) console.log('  MOVER', m.title.slice(0, 60), '->', m.toName.slice(0, 60));
    for (const d of drafts) console.log('  DRAFT', d.net.slice(0, 3), d.title.slice(0, 70), '|', d.sum.slice(0, 70));
    for (const f of failed) console.log('  FALHA', f.title.slice(0, 60), f.why);

    const backup = describeBackup(process.cwd(), 12);
    const bo = readBackupIds(path.join(backup.dir, 'affiliate_offers.ndjson'));
    const bm = readBackupIds(path.join(backup.dir, 'master_products.ndjson'));
    const missing = [...moves, ...drafts].filter((x) => !bo.has(x.offer) || !bm.has(x.master)).length;
    const backupOk = backup.ok && missing === 0;
    console.log(`Backup <=12h cobrindo plano: ${backupOk}`);
    if (!APPLY) return;
    if (!backupOk) throw new Error('Backup ausente/antigo/incompleto.');

    const logFile = path.resolve(process.cwd(), 'backup', 'dados', `identidade-etapa2-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const log: any = { criado_em: new Date().toISOString(), masters_criados: [], movimentos: [], rascunhos: [], deixadas: leave.map((l) => ({ offer_id: l.offer, titulo: l.title, motivo: l.sum })) };
    await sql
      .begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '300s'`;
        for (const g of createdMap.values()) {
          const [row] = await tx`insert into master_products (name, slug, product_type, game_platform_gen, game_format, game_edition_type, game_edition_source, brand_id, category_id, franchise_id, attributes, classified_at)
            values (${g.name}, ${g.slug}, 'game', ${g.plat}::game_platform_gen, 'physical', 'full_game', 'keyword_rule', ${g.brand_id}, ${g.category_id}, ${g.franchise_id}, '{}'::jsonb, now()) returning id`;
          g.id = row.id;
          log.masters_criados.push({ id: g.id, name: g.name, slug: g.slug, platform: g.plat, motivo: g.why });
        }
        const ids = [...moves, ...drafts].map((x) => x.offer);
        const snapB = await tx`select count(*)::bigint n from affiliate_price_snapshots where offer_id = any(${ids}::uuid[])`;
        for (const m of moves) {
          const to = m.to ?? createdMap.get(m.createName).id;
          if (m.to) {
            const [d] = await tx`select attributes->>'mergedInto' mi from master_products where id=${to}`;
            if (!d || d.mi) throw new Error('destino arquivado');
          }
          const u = await tx`update affiliate_offers set master_product_id=${to}, updated_at=now() where id=${m.offer} and master_product_id=${m.master} and status='active'`;
          if (u.count !== 1) throw new Error('falha ao mover ' + m.offer);
          log.movimentos.push({ offer_id: m.offer, status: 'active', master_antigo: m.master, master_novo: to, titulo: m.title, motivo: m.sum });
        }
        for (const d of drafts) {
          const u = await tx`update affiliate_offers set status='draft', updated_at=now() where id=${d.offer} and status='active'`;
          if (u.count !== 1) throw new Error('falha ao rascunhar ' + d.offer);
          log.rascunhos.push({ offer_id: d.offer, status_antigo: 'active', master: d.master, titulo: d.title, motivo: d.sum });
        }
        const [{ n: oa }] = await tx`select count(*)::int n from affiliate_offers`;
        const snapA = await tx`select count(*)::bigint n from affiliate_price_snapshots where offer_id = any(${ids}::uuid[])`;
        if (oa !== offersBefore) throw new Error('contagem de ofertas mudou');
        if (String(snapA[0].n) !== String(snapB[0].n)) throw new Error('cotações mudaram');
        log.contagens = { ofertas_antes: offersBefore, ofertas_depois: oa, masters_antes: mastersBefore, cotacoes_total_antes: String(snapsBefore) };
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
