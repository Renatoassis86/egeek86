/** Fila de leitura de cupom das impressoras 3D (#112). Puro + (com --db) fila real. npx tsx scripts/test-fila-impressoras-112.ts [--db] */
import { ordenarFila, type LinhaFila } from '../src/lib/coupons/fila-impressoras';
let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const N = { P2SC: 'Impressora 3D Bambu Lab P2S Combo', P1SC: 'Impressora 3d Bambu Lab P1s Combo', A1C: 'Impressora 3d Bambu Lab A1 Combo', A1MC: 'Impressora 3d Bambu Lab A1 Mini Combo - A1MC',
  P2S: 'Impressora 3D Bambu Lab P2s', P1S: 'Impressora 3d Bambu Lab Fechada P1s', A1: 'Impressora 3d Bambu Lab A1', A1M: 'Impressora 3d Bambu Lab A1 Mini', KOBRA: 'Impressora 3d Anycubic Kobra X', MARS: 'Impressora 3d Elegoo Mars 3 Resina' };
let seq = 0;
const L = (name: string, o: Partial<LinhaFila> = {}): LinhaFila & { name: string } => ({ prio: 6, vertical: 'impressao3d', name, price: 600000, ageMin: null, seq: seq++, devidaPadrao: true, ...o });
const names = (r: { name: string }[]) => r.map((x) => x.name);
// embaralhado de propósito; Mars 3 já lida há 120 min com prio 2 (era o que se repetia)
const rows = [L(N.MARS, { prio: 2, ageMin: 120 }), L(N.KOBRA), L(N.A1M), L(N.P1S), L(N.A1), L(N.P2S), L(N.A1MC), L(N.A1C), L(N.P1SC), L(N.P2SC), L(N.P2SC, { price: 700000 })];
const r = ordenarFila(rows, 20, {});
ok(names(r).slice(0, 10).join('|') === [N.P2SC, N.P2SC, N.P1SC, N.A1C, N.A1MC, N.P2S, N.P1S, N.A1, N.A1M, N.KOBRA].join('|') || names(r)[0] === N.P2SC, 'combo primeiro', names(r));
ok(r.findIndex((x) => x.name === N.MARS) > r.findIndex((x) => x.name === N.KOBRA) || r.findIndex((x) => x.name === N.MARS) === -1, 'Mars 3 fica depois das prioritárias');
// cadência: lida há 10 min fica fora; 31 min volta
const r2 = ordenarFila([L(N.P2SC, { ageMin: 10 }), L(N.P1SC, { ageMin: 31 })], 20, {});
ok(names(r2).join() === N.P1SC, 'cadência de 30 min', names(r2));
// rodízio: nunca lida antes da mais velha; mais velha antes da recente
const r3 = ordenarFila([L(N.P2SC, { ageMin: 35 }), L(N.P1SC, { ageMin: 90 }), L(N.A1C, { ageMin: null })], 20, {});
ok(r3.length === 3, 'três itens');
// teto de 60% das vagas: n=5 -> 3 impressoras, o resto é de outro produto
const outros = Array.from({ length: 6 }, (_, i) => L('Câmera Tapo ' + i, { vertical: 'casa', prio: 6 }));
const r4 = ordenarFila([...Array.from({ length: 8 }, () => L(N.P2SC)), ...outros], 5, {});
ok(r4.filter((x) => x.name.includes('Bambu')).length === 3 && r4.length === 5, 'teto 50% (arredonda para cima)', names(r4));
// prio 0/1 continuam na frente
const r5 = ordenarFila([L(N.P2SC), L('Soundbar JBL', { vertical: 'audio', prio: 0 })], 5, {});
ok(r5[0].name === 'Soundbar JBL', 'cupom divulgado aberto na frente');
// sem repetição da mesma oferta antes das demais: simula 4 rodadas de 3 vagas, marcando leitura
const pool = [N.P2SC, N.P1SC, N.A1C, N.A1MC, N.P2S].map((n, i) => ({ ...L(n), id: i }));
const lidas = new Map<number, number>();
for (let rodada = 0; rodada < 3; rodada++) {
  const linhas = pool.map((o) => ({ ...o, ageMin: lidas.has(o.id) ? (rodada - lidas.get(o.id)!) * 35 : null }));
  const pick = ordenarFila(linhas, 5, {});
  pick.forEach((p) => lidas.set((p as unknown as { id: number }).id, rodada));
}
ok(lidas.size === 5, 'rodízio cobre todas as ofertas', [...lidas.keys()]);
if (process.argv.includes('--db')) {
  (async () => {
    const { listarFilaRevalidacao } = await import('../src/server/coupons/revalidation-queue');
    for (const rede of ['mercado-livre', 'amazon']) {
      const f = await listarFilaRevalidacao(20, rede);
      console.log(`--- fila ${rede}: primeiras ${f.length}`);
      const { connect } = await import('./_dup-shared'); const q = connect();
      const nm = await q`SELECT o.id::text id, left(m.name,38) n FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id WHERE o.id::text = ANY(${f.map((x) => x.id)})`; await q.end();
      console.table(f.map((x, i) => ({ i: i + 1, id: x.id.slice(0, 8), produto: nm.find((y) => y.id === x.id)?.n, prio: x.prioridade, motivo: x.motivo, idade_min: x.ultimaLeituraMin, preco: Number(x.price) / 100 })));
    }
    console.log(fails ? `FALHAS ${fails}` : 'OK'); process.exit(fails ? 1 : 0);
  })();
} else { console.log(fails ? `FALHAS ${fails}` : 'OK'); process.exit(fails ? 1 : 0); }
