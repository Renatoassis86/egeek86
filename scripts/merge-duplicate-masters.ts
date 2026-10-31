/**
 * Fusão de master_products duplicados (EG-01).
 *
 *   npx tsx scripts/merge-duplicate-masters.ts                 # dry-run (padrão): só SELECT
 *   npx tsx scripts/merge-duplicate-masters.ts --apply         # ESCREVE (exige autorização do dono)
 *
 * Opções:
 *   --limit-groups N        fundir só os N primeiros grupos (comece por lotes pequenos)
 *   --only-canonical ID     fundir só o grupo cujo canônico é ID
 *   --backup-max-age-hours  idade máxima do backup em backup/dados (padrão 12)
 *
 * Garantias:
 *  - Reaponta TODAS as FKs para master_products (descobertas no catálogo do
 *    Postgres) do duplicado para o canônico. Nunca deleta ofertas, snapshots
 *    ou masters. O duplicado é arquivado: attributes.mergedInto = canônico.
 *  - Watches: move onde o usuário não monitora o canônico; onde monitora,
 *    desativa (is_active=false) o do duplicado, sem apagar.
 *  - Tudo numa única transação; ao final, verifica que o total de ofertas não
 *    mudou e que nenhuma oferta restou nos duplicados, senão ROLLBACK.
 *  - --apply exige backup recente (backup/dados) cobrindo os masters do plano.
 *  - Grava um log reversível (backup/dados/merge-log-*.json) com cada oferta
 *    e watch movido.
 *  - Só jogos com plataforma resolvida, mesma edição e núcleo de título
 *    idêntico (analyzeDuplicates). Quase-duplicatas NÃO são fundidas.
 *
 * Nenhuma credencial é impressa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzeDuplicates, type AutoGroup } from '../src/lib/affiliate/dedup';
import {
  connect,
  countFkRows,
  describeBackup,
  listMasterFks,
  loadMasterRows,
  readBackupIds,
  type FkRef,
  type Tx,
} from './_dup-shared';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = argValue('--limit-groups') ? Number(argValue('--limit-groups')) : undefined;
const ONLY = argValue('--only-canonical');
const MAX_AGE = argValue('--backup-max-age-hours') ? Number(argValue('--backup-max-age-hours')) : 12;

const OFFERS_FK = 'affiliate_offers.master_product_id';
const WATCHES_FK = 'affiliate_price_watches.master_product_id';

interface GroupLog {
  canonicalId: string;
  canonicalName: string;
  platformFix?: { from: string; to: string };
  merged: Array<{
    masterId: string;
    name: string;
    movedRows: Record<string, string[]>; // "tabela.coluna" -> ids das linhas movidas
    deactivatedWatchIds: string[];
  }>;
}

function selectGroups(groups: AutoGroup[]): AutoGroup[] {
  let out = groups;
  if (ONLY) out = out.filter((g) => g.canonicalId === ONLY);
  if (LIMIT !== undefined) out = out.slice(0, LIMIT);
  return out;
}

async function main() {
  const sql = connect();
  try {
    // 1. Plano (sempre read-only).
    const { groups, fks, totals } = await sql.begin('read only', async (tx) => {
      const rows = await loadMasterRows(tx);
      const analysis = analyzeDuplicates(rows);
      const groups = selectGroups(analysis.autoGroups);
      const fks = await listMasterFks(tx);
      const mergeIds = groups.flatMap((g) => g.members.filter((m) => m.role === 'merge').map((m) => m.id));
      const counts = await countFkRows(tx, fks, mergeIds);
      const totals: Record<string, number> = {};
      for (const [k, m] of counts) totals[k] = [...m.values()].reduce((a, b) => a + b, 0);
      return { groups, fks, totals };
    });

    const mergeCount = groups.reduce((a, g) => a + g.members.length - 1, 0);
    console.log(`Modo: ${APPLY ? 'APPLY (escreve)' : 'DRY-RUN (nenhuma escrita)'}`);
    console.log(`Grupos selecionados: ${groups.length}; masters a arquivar: ${mergeCount}`);
    console.log('Linhas a reapontar por FK:', JSON.stringify(totals));

    const planFile = path.resolve(process.cwd(), 'backup', 'dados', 'merge-plan-2026-10-31.json');
    fs.writeFileSync(
      planFile,
      JSON.stringify(
        groups.map((g) => ({
          canonicalId: g.canonicalId,
          platform: g.platform,
          coreTitle: g.coreTitle,
          platformFixNeeded: g.platformFixNeeded,
          members: g.members.map((m) => ({
            id: m.id, role: m.role, name: m.name, activeOffers: m.activeOffers, totalOffers: m.totalOffers, snapshots: m.snapshots,
          })),
        })),
        null,
        2
      ),
      'utf8'
    );
    console.log(`Plano gravado em ${path.relative(process.cwd(), planFile)}`);

    // 2. Backup.
    const backup = describeBackup(process.cwd(), MAX_AGE);
    for (const i of backup.info) {
      console.log(
        `Backup ${i.file}: ${i.exists ? `${i.ageHours.toFixed(1)}h de idade, ${i.bytes} bytes` : 'AUSENTE'}`
      );
    }
    const backupMasterIds = readBackupIds(path.join(backup.dir, 'master_products.ndjson'));
    const planIds = groups.flatMap((g) => g.members.map((m) => m.id));
    const missingInBackup = planIds.filter((id) => !backupMasterIds.has(id)).length;
    console.log(`Masters do plano ausentes no backup: ${missingInBackup} de ${planIds.length}`);
    const backupOk = backup.ok && missingInBackup === 0;

    if (!APPLY) {
      console.log(
        backupOk
          ? 'Backup OK para --apply.'
          : `ATENÇÃO: --apply seria RECUSADO (backup precisa ter <= ${MAX_AGE}h e conter todos os masters do plano). Rode backup/exportar.mjs ou backup/delta.mjs antes.`
      );
      console.log('Dry-run concluído. Nada foi escrito no banco.');
      return;
    }

    if (!backupOk) {
      throw new Error(
        `Backup ausente, antigo (> ${MAX_AGE}h) ou sem todos os masters do plano. Atualize backup/dados e rode de novo.`
      );
    }
    if (groups.length === 0) {
      console.log('Nada a fundir.');
      return;
    }

    // 3. Escrita: uma transação para tudo.
    const logs: GroupLog[] = [];
    const logFile = path.resolve(process.cwd(), 'backup', 'dados', `merge-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

    await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '300s'`;
      const [{ n: offersBefore }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM affiliate_offers`;
      const [{ n: mastersBefore }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM master_products`;

      for (const g of groups) {
        logs.push(await mergeGroup(tx, g, fks));
      }

      const [{ n: offersAfter }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM affiliate_offers`;
      const [{ n: mastersAfter }] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM master_products`;
      if (offersBefore !== offersAfter) throw new Error('Contagem de ofertas mudou: rollback.');
      if (mastersBefore !== mastersAfter) throw new Error('Contagem de masters mudou: rollback.');

      // Log escrito ANTES do commit: se o commit falhar o arquivo é renomeado como .invalido.
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf8');
    }).catch((err) => {
      if (fs.existsSync(logFile)) fs.renameSync(logFile, `${logFile}.invalido`);
      throw err;
    });

    console.log(`Fusão concluída: ${groups.length} grupos. Log reversível: ${path.relative(process.cwd(), logFile)}`);
    console.log('Lembrete: o cache (unstable_cache 60-300s) das vitrines precisa expirar ou ser revalidado.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function mergeGroup(tx: Tx, g: AutoGroup, fks: FkRef[]): Promise<GroupLog> {
  const dupIds = g.members.filter((m) => m.role === 'merge').map((m) => m.id);
  const allIds = g.members.map((m) => m.id);

  // Trava e revalida: ninguém foi arquivado desde o plano, e o canônico segue ativo.
  const locked = await tx<{ id: string; merged_into: string | null; name: string; game_platform_gen: string }[]>`
    SELECT id, attributes ->> 'mergedInto' AS merged_into, name, game_platform_gen::text
    FROM master_products WHERE id = ANY(${allIds}::uuid[]) FOR UPDATE`;
  if (locked.length !== allIds.length) throw new Error(`Grupo ${g.canonicalId}: master sumiu desde o plano.`);
  if (locked.some((l) => l.merged_into)) throw new Error(`Grupo ${g.canonicalId}: master já arquivado desde o plano.`);
  const canon = locked.find((l) => l.id === g.canonicalId)!;
  const nameById = new Map(locked.map((l) => [l.id, l.name]));

  const log: GroupLog = { canonicalId: g.canonicalId, canonicalName: canon.name, merged: [] };

  // Plataforma resolvida pelo título quando o cadastro do canônico está 'unknown'.
  if (canon.game_platform_gen === 'unknown' && g.platform !== 'unknown') {
    await tx`UPDATE master_products SET game_platform_gen = ${g.platform}::game_platform_gen, updated_at = now()
             WHERE id = ${g.canonicalId} AND game_platform_gen = 'unknown'`;
    log.platformFix = { from: 'unknown', to: g.platform };
  }

  for (const dupId of dupIds) {
    const moved: Record<string, string[]> = {};
    const deactivated: string[] = [];

    // Watches: o unique (user, master) impede mover quando o usuário já monitora o canônico.
    const watches = await tx<{ id: string; user_id: string }[]>`
      SELECT id, user_id FROM affiliate_price_watches WHERE master_product_id = ${dupId}`;
    for (const w of watches) {
      const [existing] = await tx`
        SELECT id FROM affiliate_price_watches WHERE user_id = ${w.user_id} AND master_product_id = ${g.canonicalId}`;
      if (existing) {
        await tx`UPDATE affiliate_price_watches SET is_active = false WHERE id = ${w.id}`;
        deactivated.push(w.id);
      } else {
        await tx`UPDATE affiliate_price_watches SET master_product_id = ${g.canonicalId} WHERE id = ${w.id}`;
        (moved[WATCHES_FK] ??= []).push(w.id);
      }
    }

    // Todas as demais FKs (ofertas, products, ...). Um unique violado aborta a transação inteira.
    for (const fk of fks) {
      const key = `${fk.table}.${fk.column}`;
      if (key === WATCHES_FK) continue;
      const rows = await tx<{ id: string }[]>`
        UPDATE ${tx(fk.table)} SET ${tx(fk.column)} = ${g.canonicalId}
        WHERE ${tx(fk.column)} = ${dupId}
        RETURNING id::text AS id`;
      if (rows.length) moved[key] = rows.map((r) => r.id);
    }

    // Arquiva (sem DELETE): redirect + trilha para reverter.
    const note = {
      mergedInto: g.canonicalId,
      archived: true,
      mergedAt: new Date().toISOString(),
      mergedOfferIds: moved[OFFERS_FK] ?? [],
      mergedWatchIds: moved[WATCHES_FK] ?? [],
      deactivatedWatchIds: deactivated,
    };
    const upd = await tx`
      UPDATE master_products
      SET attributes = attributes || ${tx.json(note)}, updated_at = now()
      WHERE id = ${dupId} AND (attributes ->> 'mergedInto') IS NULL`;
    if (upd.count !== 1) throw new Error(`Falha ao arquivar ${dupId}.`);

    // Pós-condição: nenhuma linha restou apontando para o duplicado (exceto watch desativado).
    for (const fk of fks) {
      const [{ n }] = await tx<{ n: string }[]>`
        SELECT count(*) AS n FROM ${tx(fk.table)} WHERE ${tx(fk.column)} = ${dupId}`;
      const allowed = `${fk.table}.${fk.column}` === WATCHES_FK ? deactivated.length : 0;
      if (Number(n) !== allowed) throw new Error(`Restaram linhas em ${fk.table} apontando para ${dupId}.`);
    }

    log.merged.push({ masterId: dupId, name: nameById.get(dupId) ?? '', movedRows: moved, deactivatedWatchIds: deactivated });
  }
  return log;
}

main().catch((err) => {
  console.error('Falha:', err instanceof Error ? err.message : 'erro desconhecido');
  process.exit(1);
});
