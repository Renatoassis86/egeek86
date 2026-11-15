/**
 * R2-11 e R2-16 (dono, 2026-11-14): "a única restrição é usado e retrô; precisamos ir colocando os itens em nosso banco".
 *
 *   --fase revisao    (R2-11) libera os masters em REVISÃO do porteiro que não têm sinal de usado/retrô (nem miúdo/console-não-aparelho já decididos pelo dono).
 *                     Dúvida de identidade (geração ambígua, sem plataforma/formato, descoberta com dúvida) vira grupo PRÓPRIO 'nao_identificado' (R2-6): nunca funde com outro.
 *   --fase caneleira  (R2-16) devolve ao catálogo (Esporte) as caneleiras/tornozeleiras/munhequeiras rejeitadas pela limpeza de itens miúdos; power bank segue fora.
 *
 *   # DRY-RUN (padrão): só SELECT, contagens e amostra de 30; grava o plano em docs/backups/r2-<fase>-plano-<ts>.json
 *   npx tsx --env-file=.env.local scripts/aplicar-r2-liberacoes-2026-11-14.ts --fase revisao
 *   # APLICAR (lotes de 20, transação curta, guarda otimista: só grava se o catalogGate ainda é o lido)
 *   npx tsx --env-file=.env.local scripts/aplicar-r2-liberacoes-2026-11-14.ts --fase revisao --apply --por "Nome"
 *   # REVERTER (restaura o catalogGate anterior só de quem ainda tem a marca deste lote)
 *   npx tsx --env-file=.env.local scripts/aplicar-r2-liberacoes-2026-11-14.ts --rollback docs/backups/r2-<fase>-log-<ts>.json [--apply]
 *
 * Só grava master_products.attributes.catalogGate (e `identidade` nos não identificados). Não funde, não apaga, não toca preço, oferta nem indicador.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { evaluateCatalogGate, GATE_VERSION, type PersistedGate } from '../src/lib/catalog/gate';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const FASE = arg('--fase');
const POR = arg('--por') ?? '';
/** #60 (2026-11-15): restringe a liberação a UM departamento (ex.: --vertical tecnologia) e só aos que o porteiro do departamento sugeriu 'approved'. */
const VERT = arg('--vertical') ?? null;
const SO_SUGERIDO = argv.includes('--so-sugerido-aprovado');
const ROLLBACK = arg('--rollback');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const LOTE = 20;

/** Motivos de revisão que significam dúvida de IDENTIDADE (viram grupo próprio 'nao_identificado'). */
const DUVIDA_IDENTIDADE = /geracao_ambigua|descoberta_duvida|sem_plataforma|sem_formato|plataforma|formato|headset_sem_plataforma|acessorio_marca_sem_plataforma|chave_fraca/;
const USADO_RETRO_TEXTO = /\b(usad[oa]s?|seminov[oa]s?|recondicionad[oa]s?|renewed|refurbished|open ?box|vitrine|retro|retrô|vintage|lote|sucata|defeito|como novo|quase novo|warehouse)\b/i;

interface Alvo { id: string; nome: string; vertical: string; tipo: string; gate: PersistedGate | null; novoGate: PersistedGate; naoIdentificado: boolean; motivo: string }
interface Pulado { id: string; nome: string; motivo: string }

function liberar(g: PersistedGate | null, razao: string, por: string, now: string, nao: boolean): PersistedGate {
  return { verdict: 'approved', category: 'ok', reason: nao ? `nao_identificado:${g?.reason ?? 'revisao'}` : razao, matched: g?.matched ?? null, version: g?.version ?? GATE_VERSION, at: now, previousVerdict: (g?.verdict ?? 'review') as PersistedGate['verdict'], approvedBy: por };
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (ROLLBACK) return await doRollback(sql);
    if (FASE !== 'revisao' && FASE !== 'caneleira') throw new Error('use --fase revisao|caneleira (ou --rollback <log>)');
    const now = new Date().toISOString();
    const por = `auto:r2-${FASE === 'revisao' ? '11' : '16'}`;
    const alvos: Alvo[] = [];
    const pulados: Pulado[] = [];

    if (FASE === 'revisao') {
      const rows = await sql<{ id: string; name: string; vertical: string; tipo: string; gate: PersistedGate | null; ofertas: string[]; preco: number | null }[]>`
        SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS tipo, m.attributes -> 'catalogGate' AS gate,
               COALESCE((SELECT array_agg(left(o.title, 200)) FROM (SELECT title FROM affiliate_offers WHERE master_product_id = m.id LIMIT 6) o), '{}') AS ofertas,
               (SELECT MIN(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0)::bigint::float8 AS preco
        FROM master_products m
        WHERE m.attributes -> 'catalogGate' ->> 'verdict' = 'review'
          AND COALESCE(m.attributes -> 'catalogGate' ->> 'manual', '') = ''
          AND (m.attributes ->> 'mergedInto') IS NULL
          AND (${VERT}::text IS NULL OR m.vertical = ${VERT}::text)
          AND (NOT ${SO_SUGERIDO}::boolean OR m.attributes -> 'catalogGate' ->> 'suggested' = 'approved')`;
      for (const r of rows) {
        const g = r.gate;
        const titulos = [r.name, ...r.ofertas];
        // Mantidos em revisão (decisões anteriores do dono, não são barreira nova): retrô (acessório de plataforma legada), item miúdo (porta-cartão/organizador) e preço de jogo físico abaixo do piso (provável código/digital).
        if (/^(acessorio_plataforma_legada|porta_cartao_organizador|fisico_abaixo_do_piso)/.test(g?.reason ?? '')) { pulados.push({ id: r.id, nome: r.name, motivo: `mantido_em_revisao:${g?.reason}` }); continue; }
        if (titulos.some((t) => USADO_RETRO_TEXTO.test(t))) { pulados.push({ id: r.id, nome: r.name, motivo: 'sinal_de_usado_ou_retro_no_titulo' }); continue; }
        // O porteiro é o de GAMES: nos departamentos não-games ele não julga (TV, soundbar etc. dariam 'fora de escopo' errado); lá valem só usado/retrô e o miúdo já decidido.
        if (r.vertical === 'games') {
          const porteiro = evaluateCatalogGate({ name: r.name, productType: r.tipo as never, offerTitles: r.ofertas, medianPriceCents: r.preco ?? undefined });
          if (porteiro.verdict === 'rejected') { pulados.push({ id: r.id, nome: r.name, motivo: `porteiro_rejeita:${porteiro.reason}` }); continue; }
        }
        const mi = avaliarItemMiudo(r.name, r.preco, r.tipo, r.vertical);
        if (mi.veredito === 'sim') { pulados.push({ id: r.id, nome: r.name, motivo: `item_miudo:${mi.motivo}` }); continue; }
        const nao = DUVIDA_IDENTIDADE.test(g?.reason ?? '');
        alvos.push({ id: r.id, nome: r.name, vertical: r.vertical, tipo: r.tipo, gate: g, novoGate: liberar(g, `liberado_r2_11:${g?.reason ?? 'revisao'}`, por, now, nao), naoIdentificado: nao, motivo: g?.reason ?? 'revisao' });
      }
    } else {
      const bk = fs.readdirSync(DIR).filter((f) => /^revisoes-ambiguas-2026-11-14.*\.ndjson$/.test(f));
      const ids = new Set<string>();
      for (const f of bk) for (const l of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean)) {
        try { const o = JSON.parse(l) as { id?: string; titulo?: string; vertical?: string }; if (o.id && /\b(caneleiras?|tornozeleiras?|munhequeiras?)\b/i.test(o.titulo ?? '') && (o.vertical ?? 'esporte') === 'esporte') ids.add(o.id); } catch { /* linha inválida */ }
      }
      if (!ids.size) return void console.log('nenhuma caneleira nos backups da limpeza.');
      const rows = await sql<{ id: string; name: string; vertical: string; tipo: string; gate: PersistedGate | null; ofertas: string[] }[]>`
        SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS tipo, m.attributes -> 'catalogGate' AS gate,
               COALESCE((SELECT array_agg(left(o.title, 200)) FROM (SELECT title FROM affiliate_offers WHERE master_product_id = m.id LIMIT 6) o), '{}') AS ofertas
        FROM master_products m WHERE m.id = ANY(${[...ids]}::uuid[])`;
      for (const r of rows) {
        if (r.gate?.manual) { pulados.push({ id: r.id, nome: r.name, motivo: 'decisao_humana' }); continue; }
        if (r.gate?.verdict === 'approved') { pulados.push({ id: r.id, nome: r.name, motivo: 'ja_aprovado' }); continue; }
        if ([r.name, ...r.ofertas].some((t) => USADO_RETRO_TEXTO.test(t))) { pulados.push({ id: r.id, nome: r.name, motivo: 'sinal_de_usado_ou_retro_no_titulo' }); continue; }
        alvos.push({ id: r.id, nome: r.name, vertical: r.vertical, tipo: r.tipo, gate: r.gate, novoGate: liberar(r.gate, 'liberado_r2_16:caneleira_esporte', por, now, false), naoIdentificado: false, motivo: 'caneleira_esporte' });
      }
    }

    const porMotivo: Record<string, number> = {};
    for (const a of alvos) porMotivo[a.motivo] = (porMotivo[a.motivo] ?? 0) + 1;
    const porPuladoMotivo: Record<string, number> = {};
    for (const p of pulados) { const k = p.motivo.split(':')[0]!; porPuladoMotivo[k] = (porPuladoMotivo[k] ?? 0) + 1; }
    console.log(`fase=${FASE}: a liberar ${alvos.length} (não identificados: ${alvos.filter((a) => a.naoIdentificado).length}); pulados ${pulados.length}`);
    console.log('por motivo de origem:', JSON.stringify(porMotivo));
    console.log('pulados por motivo:', JSON.stringify(porPuladoMotivo));
    console.log('--- amostra 30 a liberar ---');
    for (const a of alvos.slice(0, 30)) console.log(`  [${a.vertical}/${a.tipo}] ${a.naoIdentificado ? '(nao_identificado) ' : ''}${a.nome.slice(0, 90)} <- ${a.motivo}`);
    console.log('--- amostra 10 pulados ---');
    for (const p of pulados.slice(0, 10)) console.log(`  (${p.motivo}) ${p.nome.slice(0, 90)}`);
    const plano = path.join(DIR, `r2-${FASE}-plano-${stamp}.json`);
    fs.writeFileSync(plano, JSON.stringify({ criadoEm: now, fase: FASE, alvos: alvos.length, pulados, porMotivo }, null, 2));
    if (!APPLY) return void console.log(`DRY-RUN: nada gravado. Plano: ${path.relative(process.cwd(), plano)}. Use --apply --por "Nome".`);
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');

    const bk = path.join(DIR, `r2-${FASE}-${stamp}.ndjson`);
    fs.writeFileSync(bk, alvos.map((a) => JSON.stringify({ id: a.id, nome: a.nome, catalogGateAnterior: a.gate })).join('\n') + '\n');
    const gravados: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate; naoIdentificado: boolean }> = [];
    const ignorados: string[] = [];
    for (let i = 0; i < alvos.length; i += LOTE) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL statement_timeout = '60s'`;
        await tx`SET LOCAL lock_timeout = '5s'`;
        for (const a of alvos.slice(i, i + LOTE)) {
          const antes = a.gate ? JSON.stringify(a.gate) : null;
          const ident = a.naoIdentificado ? JSON.stringify({ estado: 'nao_identificado', motivo: a.motivo, desde: a.novoGate.at }) : null;
          const u = await tx`
            UPDATE master_products
               SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{catalogGate}', ${JSON.stringify(a.novoGate)}::text::jsonb, true)
                                || CASE WHEN ${ident}::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('identidade', ${ident}::text::jsonb) END
             WHERE id = ${a.id}::uuid AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${antes}::text::jsonb, 'null'::jsonb)`;
          if (u.count) gravados.push({ id: a.id, antes: a.gate, depois: a.novoGate, naoIdentificado: a.naoIdentificado }); else ignorados.push(a.id);
        }
      });
    }
    const logFile = path.join(DIR, `r2-${FASE}-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: now, fase: FASE, por: POR, backup: path.basename(bk), gravados, ignoradosGuardaOtimista: ignorados, rollback: `npx tsx --env-file=.env.local scripts/aplicar-r2-liberacoes-2026-11-14.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
    console.log(`GRAVADOS: ${gravados.length}/${alvos.length} (guarda otimista ignorou ${ignorados.length}) | backup: ${path.relative(process.cwd(), bk)} | log: ${path.relative(process.cwd(), logFile)}`);
  } finally {
    await sql.end();
  }
}

async function doRollback(sql: ReturnType<typeof connect>) {
  const log = JSON.parse(fs.readFileSync(path.resolve(ROLLBACK!), 'utf8')) as { gravados: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate; naoIdentificado: boolean }> };
  console.log('a restaurar:', log.gravados.length);
  if (!APPLY) return void console.log('DRY-RUN: use --apply');
  let n = 0;
  for (let i = 0; i < log.gravados.length; i += LOTE) {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '60s'`;
      for (const g of log.gravados.slice(i, i + LOTE)) {
        const r = g.antes
          ? await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(g.antes)}::text::jsonb, true) - 'identidade_tmp' WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`
          : await tx`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
        if (r.count && g.naoIdentificado) await tx`UPDATE master_products SET attributes = attributes - 'identidade' WHERE id = ${g.id}::uuid AND attributes -> 'identidade' ->> 'estado' = 'nao_identificado'`;
        n += r.count;
      }
    });
  }
  console.log(`ROLLBACK aplicado: ${n}/${log.gravados.length}.`);
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
