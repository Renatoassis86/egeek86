/**
 * Dry-run de duplicatas de master_products (EG-01). SOMENTE SELECT, dentro de
 * uma transação READ ONLY. Gera:
 *   docs/dup-report-2026-10-31.md
 *   docs/dup-report-2026-10-31.csv
 *
 * Uso: npx tsx scripts/dry-run-dup-report.ts
 * Nenhuma credencial é impressa; o relatório só contém nomes de produtos e contagens.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzeDuplicates } from '../src/lib/affiliate/dedup';
import { connect, countFkRows, csvCell, listMasterFks, loadMasterRows } from './_dup-shared';

const REPORT_DATE = '2026-10-31';

async function main() {
  const sql = connect();
  try {
    const { analysis, fkTotals, fks, rowsById } = await sql.begin('read only', async (tx) => {
      const rows = await loadMasterRows(tx);
      const analysis = analyzeDuplicates(rows);
      const fks = await listMasterFks(tx);
      const mergeIds = analysis.autoGroups.flatMap((g) =>
        g.members.filter((m) => m.role === 'merge').map((m) => m.id)
      );
      const counts = await countFkRows(tx, fks, mergeIds);
      const fkTotals = new Map<string, number>();
      for (const [k, m] of counts) fkTotals.set(k, [...m.values()].reduce((a, b) => a + b, 0));
      return { analysis, fkTotals, fks, rowsById: new Map(rows.map((r) => [r.id, r])) };
    });

    const groups = analysis.autoGroups;
    const mergeMembers = groups.flatMap((g) => g.members.filter((m) => m.role === 'merge'));
    const sum = (f: (m: (typeof mergeMembers)[number]) => number) =>
      mergeMembers.reduce((a, m) => a + f(m), 0);
    const groupsWithActiveSplit = groups.filter(
      (g) => g.members.filter((m) => m.activeOffers > 0).length > 1
    ).length;
    const reviewByKind = new Map<string, { clusters: number; masters: number }>();
    for (const c of analysis.reviewClusters) {
      const cur = reviewByKind.get(c.kind) ?? { clusters: 0, masters: 0 };
      cur.clusters++;
      cur.masters += c.members.length;
      reviewByKind.set(c.kind, cur);
    }

    // ---------- Markdown ----------
    const md: string[] = [];
    md.push(`# Relatório de duplicatas de master_products (${REPORT_DATE})`);
    md.push('');
    md.push('Gerado por `scripts/dry-run-dup-report.ts`. Somente SELECT (transação READ ONLY); nada foi escrito no banco. Regra aplicada: `normalizeTitle`/`analyzeDuplicates` em `src/lib/affiliate/dedup.ts`.');
    md.push('');
    md.push('## Resumo');
    md.push('');
    md.push('| Medida | Valor |');
    md.push('|---|---|');
    md.push(`| master_products no banco | ${analysis.totalMasters} |`);
    md.push(`| já arquivados (mergedInto) | ${analysis.archivedMasters} |`);
    md.push(`| Grupos de duplicata para fusão automática (só jogos, plataforma resolvida, mesma edição) | ${groups.length} |`);
    md.push(`| Masters a fundir (excedentes) | ${mergeMembers.length} |`);
    md.push(`| Grupos com oferta ativa em mais de um master (média hoje dividida) | ${groupsWithActiveSplit} |`);
    md.push(`| Ofertas que seriam reapontadas (total / ativas) | ${sum((m) => m.totalOffers)} / ${sum((m) => m.activeOffers)} |`);
    md.push(`| Snapshots que migrariam junto (pertencem às ofertas movidas; as linhas de snapshot não são alteradas) | ${sum((m) => m.snapshots)} |`);
    md.push(`| Quase-duplicatas e casos só para revisão manual (clusters / masters) | ${analysis.reviewClusters.length} / ${analysis.reviewClusters.reduce((a, c) => a + c.members.length, 0)} |`);
    md.push(`| Jogos com título multi-geração (PS4/PS5, Xbox One/Series), fora da fusão automática | ${analysis.ambiguousGenerationTitles} |`);
    md.push(`| Grupos com edições distintas mantidas separadas de propósito (Deluxe, GOTY, Gold, Collector, etc.) | ${analysis.distinctEditionGroups} |`);
    md.push(`| master_products com plataforma 'unknown' (total / jogos) | ${analysis.unknownPlatform.total} / ${analysis.unknownPlatform.games} |`);
    md.push(`| ... destes, plataforma derivável do título (total / jogos) | ${analysis.unknownPlatform.derivableFromTitle} / ${analysis.unknownPlatform.gamesDerivable} |`);
    md.push('');
    md.push('### Linhas em tabelas com FK para master_products que acompanhariam a fusão');
    md.push('');
    md.push('| Tabela.coluna | Linhas nos masters a fundir |');
    md.push('|---|---|');
    for (const fk of fks) md.push(`| ${fk.table}.${fk.column} | ${fkTotals.get(`${fk.table}.${fk.column}`) ?? 0} |`);
    md.push('');
    md.push('### Revisão manual por tipo');
    md.push('');
    md.push('| Tipo | Clusters | Masters |');
    md.push('|---|---|---|');
    for (const [kind, v] of reviewByKind) md.push(`| ${kind} | ${v.clusters} | ${v.masters} |`);
    md.push('');
    md.push('## Grupos para fusão automática');
    md.push('');
    md.push('Canônico = mais ofertas ativas, depois mais ofertas, mais snapshots, mais antigo. Formato: `ativas/total ofertas, snapshots`.');
    md.push('');
    groups.forEach((g, i) => {
      md.push(`### G${String(i + 1).padStart(3, '0')} ${g.platform} | ${g.coreTitle}${g.markers.length ? ' [' + g.markers.join(',') + ']' : ''}`);
      for (const m of g.members) {
        md.push(
          `- ${m.role === 'canonical' ? '**CANÔNICO**' : 'fundir'} \`${m.id}\` "${m.name}" (${m.activeOffers}/${m.totalOffers}, ${m.snapshots})`
        );
      }
      if (g.platformFixNeeded) md.push(`- nota: canônico tem plataforma 'unknown' no cadastro; fusão ajustaria para ${g.platform}`);
      md.push('');
    });
    md.push('## Casos para revisão manual (não serão fundidos automaticamente)');
    md.push('');
    analysis.reviewClusters
      .filter((c) => c.kind !== 'platform_conflict')
      .forEach((c, i) => {
        md.push(`### R${String(i + 1).padStart(3, '0')} ${c.kind}`);
        md.push(`_${c.note}_`);
        for (const m of c.members) {
          md.push(`- \`${m.id}\` [${m.productType}/${m.gamePlatformGen}] "${m.name}" (${m.activeOffers}/${m.totalOffers}, ${m.snapshots})`);
        }
        md.push('');
      });
    const conflicts = analysis.reviewClusters.find((c) => c.kind === 'platform_conflict');
    if (conflicts) {
      md.push('### Conflito entre plataforma do cadastro e do título');
      for (const m of conflicts.members) {
        md.push(`- \`${m.id}\` cadastro=${m.gamePlatformGen} "${m.name}" (${m.activeOffers}/${m.totalOffers})`);
      }
      md.push('');
    }
    const outDir = path.resolve(process.cwd(), 'docs');
    fs.writeFileSync(path.join(outDir, `dup-report-${REPORT_DATE}.md`), md.join('\n'), 'utf8');

    // ---------- CSV ----------
    const header = [
      'secao', 'grupo', 'papel', 'master_id', 'canonico_sugerido_id', 'nome', 'tipo', 'plataforma_cadastro',
      'plataforma_efetiva', 'ofertas_ativas', 'ofertas_total', 'snapshots', 'criado_em', 'obs',
    ];
    const lines = [header.join(';')];
    groups.forEach((g, i) => {
      for (const m of g.members) {
        lines.push(
          [
            'fusao_automatica', `G${String(i + 1).padStart(3, '0')}`, m.role, m.id, g.canonicalId, m.name,
            m.productType, m.gamePlatformGen, g.platform, m.activeOffers, m.totalOffers, m.snapshots,
            new Date(m.createdAt).toISOString(), g.coreTitle,
          ].map(csvCell).join(';')
        );
      }
    });
    analysis.reviewClusters.forEach((c, i) => {
      for (const m of c.members) {
        const r = rowsById.get(m.id)!;
        lines.push(
          [
            'revisao_manual', `R${String(i + 1).padStart(3, '0')}`, c.kind, r.id, '', r.name, r.productType,
            r.gamePlatformGen, analysis.derivedPlatformById.get(r.id) ?? r.gamePlatformGen, r.activeOffers,
            r.totalOffers, r.snapshots, new Date(r.createdAt).toISOString(), c.note,
          ].map(csvCell).join(';')
        );
      }
    });
    fs.writeFileSync(path.join(outDir, `dup-report-${REPORT_DATE}.csv`), '﻿' + lines.join('\n'), 'utf8');

    console.log(
      JSON.stringify(
        {
          totalMasters: analysis.totalMasters,
          archived: analysis.archivedMasters,
          autoGroups: groups.length,
          mastersToMerge: mergeMembers.length,
          groupsWithActiveSplit,
          offersMoved: sum((m) => m.totalOffers),
          activeOffersMoved: sum((m) => m.activeOffers),
          snapshotsFollowing: sum((m) => m.snapshots),
          reviewClusters: analysis.reviewClusters.length,
          reviewByKind: Object.fromEntries(reviewByKind),
          distinctEditionGroups: analysis.distinctEditionGroups,
          ambiguousGenerationTitles: analysis.ambiguousGenerationTitles,
          unknownPlatform: analysis.unknownPlatform,
          fkRowsToFollow: Object.fromEntries(fkTotals),
        },
        null,
        2
      )
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Falha no dry-run:', err instanceof Error ? err.message : 'erro desconhecido');
  process.exit(1);
});
