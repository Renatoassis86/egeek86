/**
 * INVENTÁRIO (dono, 2026-11-14): por que os jogos da promoção Prime do concorrente NÃO aparecem no front nem nas mensagens.
 * Só SELECT e funções puras reais (nada é gravado ou enviado).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/inventario-jogos-promocao.ts
 * Para cada master-alvo: (a) está no pool das vitrines? Se está, o que `avaliarCandidato` diz (com e sem exigir base) e se `selecionar` o
 * deixa nas faixas de plataforma; (b) o ciclo real de detecção de mensagens (detectGroupCandidates): gerou candidato? foi barrado? por quê.
 */
import { sql } from 'drizzle-orm';

const ALVOS: { rot: string; like: string; plat?: string }[] = [
  { rot: 'Mega Man Star Force Legacy (Switch)', like: 'mega man star force%' },
  { rot: 'Pac-Man World 2 Re-Pac (Switch)', like: 'pac-man world 2%switch', plat: 'switch_1' },
  { rot: 'Pac-Man World 2 Re-Pac (Switch 2)', like: 'pac-man world 2%switch 2', plat: 'switch_2' },
  { rot: 'Octopath Traveler II (Switch 2)', like: 'octopath traveler ii%switch 2' },
  { rot: 'Sonic X Shadow Generations (Switch 2)', like: 'sonic x shadow%switch 2' },
  { rot: 'Star Wars Outlaws (Switch 2)', like: 'star wars outlaws%switch 2' },
  { rot: 'Octopath Traveler + II Bundle (Switch 2)', like: 'octopath traveler +%bundle%' },
];

async function main() {
  const { db } = await import('../src/lib/db');
  const { lerPoolVitrines, contextoDoPool } = await import('../src/server/vitrines/pool');
  const { avaliarCandidato, selecionar } = await import('../src/lib/vitrines');
  const { detectGroupCandidates } = await import('../src/server/messaging/group-offers');
  const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => (await db.execute<T>(s)) as unknown as T[];

  const masters: { rot: string; id: string; nome: string }[] = [];
  for (const a of ALVOS) {
    const r = await q<{ id: string; name: string }>(sql`SELECT id::text AS id, name FROM master_products WHERE name ILIKE ${a.like} ORDER BY name LIMIT 1`);
    if (r[0]) masters.push({ rot: a.rot, id: r[0].id, nome: r[0].name });
    else console.log(`(sem master) ${a.rot}`);
  }

  const pool = await lerPoolVitrines();
  const ctx = contextoDoPool(pool);
  console.log(`pool: ${pool.candidatos.length} candidatos`);
  console.log('\n## (a) FRONT / VITRINES');
  for (const m of masters) {
    const c = pool.candidatos.find((x) => x.masterProductId === m.id);
    if (!c) {
      const o = await q<{ n: number; ativas: number; fresca: number; amazon: number }>(sql`
        SELECT count(*)::int n, count(*) FILTER (WHERE status='active')::int ativas,
          count(*) FILTER (WHERE status='active' AND last_checked_at > now() - interval '24 hours')::int fresca,
          count(*) FILTER (WHERE status='active' AND network_id IN (SELECT id FROM affiliate_networks WHERE slug='amazon'))::int amazon
        FROM affiliate_offers WHERE master_product_id = ${m.id}::uuid`);
      console.log(`- ${m.rot}: FORA DO POOL (ofertas=${o[0]?.n} ativas=${o[0]?.ativas} frescas24h=${o[0]?.fresca} amazon=${o[0]?.amazon}; ocultoPeloPorteiro=${ctx.ocultos.has(m.id)})`);
      continue;
    }
    const comBase = avaliarCandidato(c, ctx);
    const presenca = avaliarCandidato(c, ctx, { exigirBase: false, presenca: true });
    console.log(`- ${m.rot}: no pool (loja=${c.lojaSlug} preco=${c.precoCentavos / 100}) | exigirBase=${comBase.ok ? 'OK' : comBase.motivo} | presenca=${presenca.ok ? 'OK' : presenca.motivo}`);
  }
  for (const chave of ['plataforma:switch_1:jogos', 'plataforma:switch_2:jogos', 'destaques'] as const) {
    const s = selecionar(chave, pool.candidatos, ctx);
    const ids = new Set(s.itens.map((i) => i.masterProductId));
    const dentro = masters.filter((m) => ids.has(m.id)).map((m) => m.rot);
    console.log(`  faixa ${chave}: elegiveis=${s.elegiveis} itens=${s.itens.length} alvos dentro: ${dentro.join(', ') || 'nenhum'}`);
  }

  console.log('\n## (b) MENSAGENS (ciclo real de detecção; só leitura)');
  const d = await detectGroupCandidates({ includeSimulated: false });
  console.log(`produtos avaliados=${d.counts.productsEvaluated} candidatos=${d.counts.candidates}`);
  for (const m of masters) {
    const cands = d.candidates.filter((c) => c.masterProductId === m.id);
    const bl = d.blocked.filter((b) => b.masterProductId === m.id);
    console.log(`- ${m.rot}: candidatos=${cands.map((c) => `${c.trigger}/${c.status}${c.sendable ? '' : '/nao-enviavel'}`).join(',') || 'nenhum'} | barrado=${bl.map((b) => `${b.trigger}:${b.reasons.join('+')}`).join(' ; ') || 'não consta'}`);
  }

  console.log('\n## (c) MENSAGENS forçando a avaliação dos alvos (productIds)');
  const d2 = await detectGroupCandidates({ includeSimulated: false, productIds: masters.map((m) => m.id) });
  console.log(`avaliados=${d2.counts.productsEvaluated} candidatos=${d2.counts.candidates} bloqueios=${d2.blocked.length}`);
  for (const m of masters) {
    const cands = d2.candidates.filter((c) => c.masterProductId === m.id);
    const bl = d2.blocked.filter((b) => b.masterProductId === m.id);
    console.log(`- ${m.rot}: candidatos=${cands.map((c) => `${c.trigger}/${c.status}${c.sendable ? '' : '/nao-enviavel'}`).join(',') || 'nenhum'} | barrado=${bl.map((b) => `${b.trigger}:${b.reasons.join('+')}`).join(' ; ') || 'não consta'}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
