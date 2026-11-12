/**
 * APLICACAO do plano de aumento da aprovacao das lojas Plus (dono, 2026-11-12). Padrao de aplicar-piloto-identidade.ts / aprovar-masters-nicho.ts.
 * Plano de origem: docs/backups/aprovacao-plus-plano-<ts>.json (gerado por scripts/simular-aprovacao-plus.ts).
 *
 *   # 1) DRY-RUN (padrao): reavalia TUDO ao vivo (so SELECT) e imprime o que faria. Nao escreve nada.
 *   npx tsx --env-file=.env.local scripts/aplicar-aprovacao-plus.ts --plano docs/backups/aprovacao-plus-plano-<ts>.json [--so livros,esporte]
 *   # 2) APLICAR (so o dono; exige --por; plano com ate 24 h)
 *   npx tsx --env-file=.env.local scripts/aplicar-aprovacao-plus.ts --plano <arquivo.json> --apply --por "Nome" [--so livros,esporte] [--sem-fila]
 *   # 3) REVERTER
 *   npx tsx --env-file=.env.local scripts/aplicar-aprovacao-plus.ts --rollback docs/backups/aplicar-aprovacao-plus-log-<ts>.json [--apply]
 *
 * O QUE GRAVA (e nada alem disso):
 *   a) master_products.attributes.catalogGate: verdict 'review' -> 'approved' (approvedBy 'bloco:plus-v3:<data>', criteriaVersion 3, previousVerdict) SO dos masters do plano
 *      que ainda estao em 'review' e que a reavaliacao ao vivo (criterios v3) ainda aprova. Nunca toca ofertas, cotacoes, snapshots ou historico.
 *   b) identity_review_items: um item por master 'fila' (eixo 'identidade', fonte 'confianca') apontando a oferta representativa. O master CONTINUA em 'review'
 *      (fora da vitrine e fora da media) ate o dono responder 'sim'; ON CONFLICT (offer_id, axis) DO NOTHING (idempotente).
 * SEGURANCA: backup NDJSON (linha completa dos masters) + log JSON ANTES; uma transacao; qualquer erro = rollback automatico do banco.
 * REVERSAO: restaura o catalogGate anterior so de quem ainda esta aprovado por este bloco; apaga os itens de fila criados que ainda estao 'pending'.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { CRITERIA_VERSION_V3 } from '../src/lib/catalog/aprovacao-nicho';
import { carregarEAvaliar, type ItemPlano } from './_aprovacao-plus-shared';
import { titleNorm, NAO_E_ESTE, NAO_SEI } from '../src/lib/identity-queue/model';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dia = new Date().toISOString().slice(0, 10);
const DIR = path.resolve('docs/backups');
export const APPROVED_BY_PREFIX = 'bloco:plus-v3';

const MOTIVO_TXT: Record<string, string> = {
  voltagem_ausente: 'a voltagem (110/220 V) não aparece no nome nem nos anúncios',
  voltagem_mista: 'os anúncios citam voltagens diferentes',
  genero_ausente: 'o gênero (masculino/feminino/unissex) não está claro',
  editora_ausente: 'a editora não veio da API',
  identidade_fraca: 'falta modelo ou part number para ter certeza de que é o mesmo produto',
  'amplitude_acima_de_2.5': 'os preços dos anúncios variam demais (pode haver versões misturadas)',
  outliers_acima_de_25pct: 'muitos anúncios estão com preço muito fora do usual',
  amplitude_total_acima_de_6: 'o menor e o maior preço diferem mais de 6 vezes',
  quarentena_acima_de_30pct: 'muitos anúncios estão em quarentena de preço',
  marca_generica: 'a marca cadastrada é só o nome da categoria (pode ser produto sem marca)',
};

function filaOptions() {
  return [
    { value: 'sim', label: 'É este produto, novo e em linha', hint: 'Libera o produto para a aprovação do dono; ainda não entra na média sozinho', kind: 'escolha' as const },
    NAO_E_ESTE,
    NAO_SEI,
  ];
}

async function main() {
  const rollback = arg('--rollback');
  if (rollback) return doRollback(rollback);
  const planFile = arg('--plano');
  if (!planFile) throw new Error('informe --plano <arquivo.json> (gerado por simular-aprovacao-plus.ts)');
  const por = arg('--por');
  if (APPLY && !por) throw new Error('--apply exige --por "<quem aprovou>"');
  const so = arg('--so') ? new Set(arg('--so')!.split(',')) : null;
  const plano = JSON.parse(fs.readFileSync(path.resolve(planFile), 'utf8')) as { geradoEm: string; aprovar: ItemPlano[]; fila: ItemPlano[] };
  const idadeH = (Date.now() - Date.parse(plano.geradoEm)) / 3_600_000;
  if (APPLY && idadeH > 24) throw new Error(`plano com ${idadeH.toFixed(1)} h (> 24 h): gere de novo com simular-aprovacao-plus.ts`);

  const sql = connect();
  try {
    const ids = [...new Set([...plano.aprovar, ...plano.fila].filter((x) => !so || so.has(x.vertical)).map((x) => x.id))];
    // Reavaliacao AO VIVO: o plano e so a lista candidata; vale o que o banco e o codigo dizem agora.
    const vivo = await carregarEAvaliar(sql, ids);
    const aprovar = vivo.filter((x) => x.verdictAntes === 'review' && x.destino === 'aprovar' && plano.aprovar.some((p) => p.id === x.id));
    const fila = flag('--sem-fila') ? [] : vivo.filter((x) => x.verdictAntes === 'review' && x.destino === 'fila' && plano.fila.some((p) => p.id === x.id));
    const descartados = ids.length - new Set([...aprovar, ...fila].map((x) => x.id)).size;
    const porV: Record<string, { aprovar: number; fila: number }> = {};
    for (const x of aprovar) (porV[x.vertical] ??= { aprovar: 0, fila: 0 }).aprovar++;
    for (const x of fila) (porV[x.vertical] ??= { aprovar: 0, fila: 0 }).fila++;
    console.log(`\nModo: ${APPLY ? 'APPLY' : 'DRY-RUN (somente leitura)'} | plano de ${idadeH.toFixed(1)} h | candidatos ${ids.length} | descartados na revalidacao ao vivo: ${descartados}`);
    console.log(`Aprovar: ${aprovar.length} | Fila de classificacao: ${fila.length} | por vertical: ${JSON.stringify(porV)}`);
    for (const x of aprovar) console.log(`APROVAR [${x.vertical}/${x.segment}] ${x.name.slice(0, 80)} | origem ${x.origem} | ${x.avisos.join(',')} | ${x.id}`);
    for (const x of fila) console.log(`FILA    [${x.vertical}/${x.segment}] ${x.name.slice(0, 80)} | ${x.motivosV3.join(',')} | ${x.id}`);
    if (!APPLY) return void console.log('\nDRY-RUN: nada foi escrito no banco.');
    if (!aprovar.length && !fila.length) return void console.log('Nada a aplicar.');

    fs.mkdirSync(DIR, { recursive: true });
    const completos = aprovar.length ? await sql`SELECT * FROM master_products WHERE id IN ${sql(aprovar.map((x) => x.id))}` : [];
    const nd = path.join(DIR, `aplicar-aprovacao-plus-${stamp}.ndjson`);
    fs.writeFileSync(nd, completos.map((r) => JSON.stringify(r)).join('\n') + (completos.length ? '\n' : ''));
    const logFile = path.join(DIR, `aplicar-aprovacao-plus-log-${stamp}.json`);
    const approvedAt = new Date().toISOString();
    const approvedBy = `${APPROVED_BY_PREFIX}:${dia}`;
    const log: Record<string, any> = {
      status: 'pending', stamp, por, approvedBy, approvedAt, criteriaVersion: CRITERIA_VERSION_V3, planFile: path.relative(process.cwd(), path.resolve(planFile)),
      backup: path.relative(process.cwd(), nd), aprovados: aprovar.map((x) => ({ id: x.id, name: x.name, vertical: x.vertical, before: x.gateAntes })), filaItens: [] as string[],
    };
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

    let nAprov = 0; let nFila = 0;
    await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '120s'`;
      for (const x of aprovar) {
        const novo = { ...(x.gateAntes ?? {}), verdict: 'approved', approvedBy, approvedAt, criteriaVersion: CRITERIA_VERSION_V3, previousVerdict: 'review', por };
        const r = await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(novo as never)}::jsonb, true), updated_at = now()
                           WHERE id = ${x.id} AND vertical = ${x.vertical} AND attributes -> 'catalogGate' ->> 'verdict' = 'review' AND (attributes ->> 'mergedInto') IS NULL`;
        nAprov += r.count;
      }
      for (const x of fila) {
        const o = x.ofertaRepresentativa!;
        const reason = `Produto novo em análise: ${x.motivosV3.map((m) => MOTIVO_TXT[m] ?? m).join('; ')}.`;
        const understood = { produto: x.name, segmento: x.segment, motivos: x.motivosV3, nOfertas: x.nOfertas, medianaCents: x.medianaCents, faixaCents: x.faixaCents, origem: 'aprovacao-plus-v3' };
        const r = await tx`INSERT INTO identity_review_items (offer_id, master_id, vertical, axis, source, reason, understood, options, title, title_norm)
          VALUES (${o.id}::uuid, ${x.id}::uuid, ${x.vertical}, 'identidade', 'confianca', ${reason}, ${tx.json(understood as never)}::jsonb, ${tx.json(filaOptions() as never)}::jsonb, ${o.title}, ${titleNorm(o.title)})
          ON CONFLICT (offer_id, axis) DO NOTHING RETURNING id::text AS id`;
        if (r[0]) { nFila++; (log.filaItens as string[]).push(r[0].id as string); }
      }
    });
    log.status = 'applied'; log.nAprovados = nAprov; log.nFila = nFila;
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    console.log(`\nAPLICADO: ${nAprov} master(s) aprovado(s), ${nFila} item(ns) novo(s) na fila. Backup ${path.relative(process.cwd(), nd)} | log ${path.relative(process.cwd(), logFile)}`);
    console.log(`Reverter: npx tsx --env-file=.env.local scripts/aplicar-aprovacao-plus.ts --rollback ${path.relative(process.cwd(), logFile)} --apply`);
  } finally {
    await sql.end();
  }
}

async function doRollback(file: string) {
  const l = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as { stamp: string; approvedBy: string; aprovados: Array<{ id: string; name: string; before: unknown }>; filaItens: string[] };
  const sql = connect();
  try {
    console.log(`\nROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} do log ${l.stamp}: ${l.aprovados.length} master(s), ${l.filaItens.length} item(ns) de fila`);
    const atuais = l.aprovados.length
      ? await sql<{ id: string; verdict: string | null; by: string | null }[]>`SELECT id, attributes -> 'catalogGate' ->> 'verdict' AS verdict, attributes -> 'catalogGate' ->> 'approvedBy' AS by FROM master_products WHERE id IN ${sql(l.aprovados.map((c) => c.id))}`
      : [];
    const mapa = new Map(atuais.map((a) => [a.id, a]));
    const alvo = l.aprovados.filter((c) => mapa.get(c.id)?.verdict === 'approved' && mapa.get(c.id)?.by === l.approvedBy);
    const itens = l.filaItens.length ? await sql<{ id: string }[]>`SELECT id::text AS id FROM identity_review_items WHERE id IN ${sql(l.filaItens)} AND status = 'pending'` : [];
    console.log(`Restaurar ${alvo.length} master(s) (os demais foram alterados depois e ficam como estao); remover ${itens.length} item(ns) de fila ainda pendentes.`);
    if (!APPLY) return void console.log('Dry-run: nada escrito.');
    await sql.begin(async (tx) => {
      for (const c of alvo) {
        if (c.before) await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${tx.json(c.before as never)}::jsonb, true), updated_at = now() WHERE id = ${c.id}`;
        else await tx`UPDATE master_products SET attributes = attributes - 'catalogGate', updated_at = now() WHERE id = ${c.id}`;
      }
      if (itens.length) await tx`DELETE FROM identity_review_items WHERE id IN ${tx(itens.map((i) => i.id))} AND status = 'pending'`;
    });
    console.log('RESTAURADO.');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('FALHA:', e instanceof Error ? e.message : e);
  process.exit(1);
});
