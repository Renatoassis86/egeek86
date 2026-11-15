/**
 * #83/#55 (2026-11-15): destrava os masters parados em `review` pela política do dono ("a única restrição é usado e retrô; vamos colocando os itens no banco").
 * Reutiliza as regras de R2-11 e acrescenta as decisões do lote de semeadura (sem criar barreira nova: só aplica regras já decididas).
 *
 * REGRAS (cada master cai em exatamente uma):
 *   MANTER  manual (decisão humana) | motivo acessorio_plataforma_legada / porta_cartao_organizador / fisico_abaixo_do_piso (decisões anteriores)
 *           | sinal de usado/retrô/seminovo no nome ou nas ofertas | porteiro gamer REJEITA | item miúdo 'sim' ou 'ambiguo' (regra do dono) | power bank (decisão R2-16)
 *           | semeadura com parecer 'review' SEM oferta ativa (só ofertas inativas: sem efeito visível; relatado ao dono)
 *   LIBERAR o resto: verdict approved; dúvida de identidade (geração ambígua, chave fraca, sem plataforma...) vira `identidade.estado = nao_identificado` (grupo próprio).
 *
 *   DRY-RUN (padrão):  npx tsx --env-file=.env.local scripts/liberar-masters-review-2026-11-15.ts
 *   APLICAR:           ... --apply --por "Nome"      (lotes de 100, transação curta, guarda otimista, backup NDJSON + log JSON em docs/backups/)
 *   REVERTER:          ... --rollback docs/backups/liberar-review-log-<ts>.json [--apply]
 * Só grava master_products.attributes.catalogGate (+ identidade). Não funde, não apaga, não toca preço, oferta nem indicador.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { evaluateCatalogGate, GATE_VERSION, type PersistedGate } from '../src/lib/catalog/gate';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const POR = arg('--por') ?? '';
const ROLLBACK = arg('--rollback');
const AMOSTRA = arg('--amostra');
/** 2026-11-15, decisão 1 do dono: libera também a semeadura Shopee de identidade fraca sem oferta ativa (as demais regras de MANTER seguem). */
const LIBERAR_FRACA = argv.includes('--liberar-semeadura-fraca');
/** --excluir-ids arquivo.json: ids que ficam fora mesmo assim (conferência humana de peça/usado/retrô). */
const EXCLUIR = arg('--excluir-ids') ? new Set<string>(JSON.parse(fs.readFileSync(path.resolve(arg('--excluir-ids')!), 'utf8')) as string[]) : new Set<string>();
const LISTAR_FRACA = argv.includes('--listar-fraca');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const LOTE = 100;

const DUVIDA_IDENTIDADE = /geracao_ambigua|descoberta_duvida|sem_plataforma|sem_formato|plataforma|formato|chave_fraca/;
const USADO_RETRO = /\b(usad[oa]s?|seminov[oa]s?|recondicionad[oa]s?|renewed|refurbished|open ?box|vitrine|retro|retrô|vintage|lote|sucata|defeito|como novo|quase novo|warehouse)\b/i;
const POWER_BANK = /power ?bank|carregador port[aá]til/i;
const MANTIDOS = /^(acessorio_plataforma_legada|porta_cartao_organizador|fisico_abaixo_do_piso)/;
const SEMEADURA = 'semeadura_vertical_aguardando_conferencia';

type G = PersistedGate & { suggested?: string; suggestedReason?: string };
interface Row { id: string; name: string; vertical: string; tipo: string; gate: G | null; ofertas: string[]; preco: number | null; ativas: number }
interface Alvo { id: string; nome: string; vertical: string; gate: PersistedGate | null; novoGate: PersistedGate; naoIdentificado: boolean; motivo: string; ativas: number }
interface Mantido { id: string; nome: string; vertical: string; grupo: string; ativas: number }

function classificar(r: Row): { liberar: true } | { liberar: false; grupo: string } {
  const g = r.gate;
  if (EXCLUIR.has(r.id)) return { liberar: false, grupo: 'conferencia_humana_peca_usado_retro' };
  const reason = g?.reason ?? '';
  if (MANTIDOS.test(reason)) return { liberar: false, grupo: `decisao_anterior:${reason}` };
  if ([r.name, ...r.ofertas].some((t) => USADO_RETRO.test(t))) return { liberar: false, grupo: 'usado_ou_retro_no_titulo' };
  if (r.vertical === 'games') {
    const p = evaluateCatalogGate({ name: r.name, productType: r.tipo as never, offerTitles: r.ofertas, medianPriceCents: r.preco ?? undefined });
    if (p.verdict === 'rejected') return { liberar: false, grupo: `porteiro_rejeita:${p.reason}` };
  }
  const mi = avaliarItemMiudo(r.name, r.preco, r.tipo, r.vertical);
  if (mi.veredito !== 'nao') return { liberar: false, grupo: `item_miudo_${mi.veredito}:${mi.motivo}` };
  if (POWER_BANK.test(r.name)) return { liberar: false, grupo: 'power_bank_fora_R2-16' };
  if (reason === SEMEADURA) {
    if (g?.suggestedReason?.startsWith('lexico_fora_do_escopo')) return { liberar: false, grupo: 'semeadura_lexico_fora_do_escopo' };
    if (g?.suggested !== 'approved' && r.ativas === 0 && !LIBERAR_FRACA) return { liberar: false, grupo: 'semeadura_identidade_fraca_sem_oferta_ativa' };
  }
  return { liberar: true };
}

/** Dúvida de identidade (não é bloqueio): vira grupo próprio 'nao_identificado'. Semeadura só quando o parecer do departamento não era 'approved'. */
function ehNaoIdentificado(g: G | null): boolean {
  if (!g) return false;
  if (g.reason === SEMEADURA) return g.suggested !== 'approved';
  return DUVIDA_IDENTIDADE.test(g.reason ?? '');
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const sql = connect();
  try {
    if (ROLLBACK) return await doRollback(sql);
    const now = new Date().toISOString();
    const por = 'auto:liberar-review-2026-11-15';
    const rows = await sql<Row[]>`
      SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS tipo, m.attributes -> 'catalogGate' AS gate,
             COALESCE((SELECT array_agg(left(o.title, 200)) FROM (SELECT title FROM affiliate_offers WHERE master_product_id = m.id LIMIT 6) o), '{}') AS ofertas,
             (SELECT MIN(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0)::bigint::float8 AS preco,
             (SELECT count(*) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active')::int AS ativas
      FROM master_products m
      WHERE m.attributes -> 'catalogGate' ->> 'verdict' = 'review'
        AND COALESCE(m.attributes -> 'catalogGate' ->> 'manual', '') = ''
        AND (m.attributes ->> 'mergedInto') IS NULL`;
    if (LISTAR_FRACA) {
      for (const r of rows) if (r.gate?.reason === SEMEADURA && r.gate.suggested !== 'approved' && r.ativas === 0 && classificar(r).liberar === false && (classificar(r) as { grupo: string }).grupo === 'semeadura_identidade_fraca_sem_oferta_ativa') console.log(`${r.id}|${r.vertical.slice(0, 5)}|${r.preco ?? '-'}|${r.name.slice(0, 110)}`);
      return;
    }
    const alvos: Alvo[] = [];
    const mantidos: Mantido[] = [];
    for (const r of rows) {
      const c = classificar(r);
      if (!c.liberar) { mantidos.push({ id: r.id, nome: r.name, vertical: r.vertical, grupo: c.grupo, ativas: r.ativas }); continue; }
      const nao = ehNaoIdentificado(r.gate);
      const g = r.gate;
      const ng: PersistedGate = { verdict: 'approved', category: 'ok', reason: nao ? `nao_identificado:${g?.reason ?? 'revisao'}` : `liberado_r2_11:${g?.reason ?? 'revisao'}`, matched: g?.matched ?? null, version: g?.version ?? GATE_VERSION, at: now, previousVerdict: 'review', approvedBy: por };
      alvos.push({ id: r.id, nome: r.name, vertical: r.vertical, gate: g, novoGate: ng, naoIdentificado: nao, motivo: g?.reason ?? 'revisao', ativas: r.ativas });
    }
    const cont = (xs: string[]) => xs.reduce<Record<string, number>>((a, k) => { a[k] = (a[k] ?? 0) + 1; return a; }, {});
    console.log(`em review (sem manual): ${rows.length} | LIBERAR ${alvos.length} (nao_identificado ${alvos.filter((a) => a.naoIdentificado).length}; com oferta ativa ${alvos.filter((a) => a.ativas > 0).length}) | MANTER ${mantidos.length}`);
    console.log('liberar por vertical:', JSON.stringify(cont(alvos.map((a) => a.vertical))));
    console.log('manter por grupo:', JSON.stringify(cont(mantidos.map((m) => m.grupo))));
    if (AMOSTRA) {
      const n = Number(AMOSTRA);
      const passo = Math.max(1, Math.floor(alvos.length / n));
      console.log(`--- amostra ${n} (1 a cada ${passo}) ---`);
      for (let i = 0; i < alvos.length && i / passo < n; i += passo) { const a = alvos[i]!; console.log(`${a.vertical.slice(0, 6)}|ativas=${a.ativas}|${a.naoIdentificado ? 'NI|' : ''}${a.nome.slice(0, 100)}`); }
    }
    const plano = path.join(DIR, `liberar-review-plano-${stamp}.json`);
    fs.writeFileSync(plano, JSON.stringify({ criadoEm: now, alvos: alvos.map((a) => ({ id: a.id, nome: a.nome, vertical: a.vertical, motivo: a.motivo, naoIdentificado: a.naoIdentificado })), mantidos }, null, 2));
    if (!APPLY) return void console.log(`DRY-RUN: nada gravado. Plano: ${path.relative(process.cwd(), plano)}`);
    if (!POR) throw new Error('--por "Nome" é obrigatório com --apply');

    const bk = path.join(DIR, `liberar-review-${stamp}.ndjson`);
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
             WHERE id = ${a.id}::uuid AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${antes}::text::jsonb, 'null'::jsonb)
               AND COALESCE(attributes -> 'catalogGate' ->> 'manual', '') = ''`;
          if (u.count) gravados.push({ id: a.id, antes: a.gate, depois: a.novoGate, naoIdentificado: a.naoIdentificado }); else ignorados.push(a.id);
        }
      });
    }
    const logFile = path.join(DIR, `liberar-review-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: now, por: POR, backup: path.basename(bk), gravados, ignoradosGuardaOtimista: ignorados, rollback: `npx tsx --env-file=.env.local scripts/liberar-masters-review-2026-11-15.ts --rollback docs/backups/${path.basename(logFile)} --apply` }, null, 2));
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
          ? await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(g.antes)}::text::jsonb, true) WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`
          : await tx`UPDATE master_products SET attributes = attributes - 'catalogGate' WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
        if (r.count && g.naoIdentificado) await tx`UPDATE master_products SET attributes = attributes - 'identidade' WHERE id = ${g.id}::uuid AND attributes -> 'identidade' ->> 'estado' = 'nao_identificado'`;
        n += r.count;
      }
    });
  }
  console.log(`ROLLBACK aplicado: ${n}/${log.gravados.length}.`);
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
export {};
