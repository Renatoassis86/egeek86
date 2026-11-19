/**
 * Harness de simulacao de diversidade (dono, 2026-11-19). LE UMA VEZ um snapshot leve da fila pendente e do que saiu em 24 h
 * e roda varias metodologias de selecao offline (N por loja), medindo tipos/marcas/familias distintos, topo de um tipo e perda de qualidade.
 * Nao escreve nada. npx tsx --conditions=react-server --env-file=.env.local scripts/sim-diversidade.ts [N=60]
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { familiaDoItem, ehMarcaPreferida, normalizaNome } from '../src/lib/messaging/cota-item';
import { marcaDoItem } from '../src/lib/messaging/marcas-lojas';
import { METODOS, histVazio, medir, type Hist, type ItemSel } from '../src/lib/messaging/diversidade-selecao';

const N = Number(process.argv[2] ?? 60);
const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r.rows ?? []));

function paraItem(r: any): ItemSel {
  const nome = String(r.name ?? '');
  const norm = normalizaNome(nome).replace(/\s+/g, ' ').trim();
  const v = String(r.vertical);
  return {
    id: String(r.id ?? Math.random()),
    vertical: v,
    tipo: String(r.tipo ?? '-'),
    marca: marcaDoItem(v, norm),
    fam: familiaDoItem(nome),
    q: Number(r.degrau ?? 0) * 100 + (r.trigger === 'AC' ? 0 : 50),
    prefer: ehMarcaPreferida(v, nome),
    created: new Date(r.created_at ?? Date.now()).getTime() / 1e9,
  };
}

(async () => {
  await db.execute(sql`SET statement_timeout = 25000`);
  const pend = rowsOf(
    await db.execute(sql`SELECT id, vertical, trigger, created_at, candidate->>'name' AS name, candidate->>'tipo' AS tipo, (candidate->'regua'->>'degrau')::int AS degrau
      FROM group_messages WHERE channel='tg' AND status IN ('proposta','proposta_auto') AND claimed_at IS NULL ORDER BY created_at DESC LIMIT 3000`)
  );
  const env = rowsOf(
    await db.execute(sql`SELECT vertical, trigger, candidate->>'name' AS name, candidate->>'tipo' AS tipo FROM group_messages
      WHERE channel='tg' AND status='enviada' AND sent_at > now() - interval '24 hours' LIMIT 4000`)
  );
  const porV = new Map<string, ItemSel[]>();
  for (const r of pend) { const it = paraItem(r); (porV.get(it.vertical) ?? porV.set(it.vertical, []).get(it.vertical)!).push(it); }
  const histV = new Map<string, Hist>();
  for (const r of env) {
    const it = paraItem(r);
    const h = histV.get(it.vertical) ?? histV.set(it.vertical, histVazio()).get(it.vertical)!;
    h.tipo.set(it.tipo, (h.tipo.get(it.tipo) ?? 0) + 1);
    if (it.marca) h.marca.set(it.marca, (h.marca.get(it.marca) ?? 0) + 1);
    h.fam.set(it.fam, (h.fam.get(it.fam) ?? 0) + 1);
  }
  console.log(`snapshot: ${pend.length} pendentes, ${env.length} enviadas em 24 h; N=${N} por loja\n`);
  const resumo = new Map<string, { t: number; m: number; f: number; perda: number; lojas: number }>();
  for (const [v, itens] of [...porV.entries()].sort()) {
    console.log(`== ${v}  (fila ${itens.length}; tipos na fila ${new Set(itens.map((i) => i.tipo)).size}; marcas ${new Set(itens.filter((i) => i.marca).map((i) => i.marca)).size}; familias ${new Set(itens.map((i) => i.fam)).size})`);
    for (const [nome, fn] of METODOS) {
      const sel = fn(itens, histV.get(v) ?? histVazio(), N);
      const m = medir(sel, itens, N);
      console.log(`  ${nome.padEnd(32)} tipos ${String(m.tipos).padStart(2)} | marcas ${String(m.marcas).padStart(2)} | familias ${String(m.familias).padStart(2)} | topo-tipo ${String(m.topoTipoPct).padStart(3)}% | perda-qual ${String(m.perdaQualidadePct).padStart(3)}%`);
      const r = resumo.get(nome) ?? { t: 0, m: 0, f: 0, perda: 0, lojas: 0 };
      r.t += m.tipos; r.m += m.marcas; r.f += m.familias; r.perda += m.perdaQualidadePct; r.lojas++;
      resumo.set(nome, r);
    }
  }
  console.log('\n== SOMA em todas as lojas');
  for (const [nome, r] of resumo) console.log(`  ${nome.padEnd(32)} tipos ${r.t} | marcas ${r.m} | familias ${r.f} | perda-qual media ${Math.round(r.perda / r.lojas)}%`);
  process.exit(0);
})().catch((e) => { console.error(String(e.cause?.message ?? e.message).slice(0, 300)); process.exit(1); });
