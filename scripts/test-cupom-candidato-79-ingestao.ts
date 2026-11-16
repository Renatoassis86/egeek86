/**
 * R-79: o cupom ACEITO pela loja com escopo "Em todo o Mercado Livre" gera um lote que o validador do pipeline aceita (sem gravar nada).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-cupom-candidato-79-ingestao.ts
 */
import { lerResultadoCodigo } from '../src/lib/coupons/candidato';
import { loteParaIngestao } from '../src/server/coupons/candidatos';
import { validateBatch } from '../src/server/coupons/normalize';

let fails = 0;
const ok = (c: boolean, n: string, x?: unknown) => { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } };
const now = new Date('2026-11-16T02:00:00Z');
const r = lerResultadoCodigo('Cupom de R$ 15 OFF no carrinho Em todo o Mercado Livre Compra mínima R$ 149 Vence 30 de novembro', now);
if (r.resultado !== 'aceito') throw new Error('leitura do cartão falhou');
const v = validateBatch(loteParaIngestao('TESTE1511', r, now), now);
ok(v.ok && v.coupons.length === 1 && v.rejected.length === 0, 'lote válido', v);
if (v.ok) {
  const c = v.coupons[0]!;
  ok(c.scopeKind === 'loja_inteira' && c.minOrderCents === 14900 && c.valueNum === 15 && c.valueUnit === 'reais' && c.validUntil === '2026-12-01T02:59:59.000Z' && c.code === 'TESTE1511', 'campos do cupom', c);
}
const sel = lerResultadoCodigo('R$ 220 OFF TODO O SITE Em produtos selecionados Compra mínima R$ 1.499 Limite de R$ 220 Vence hoje', now);
ok(sel.resultado === 'aceito' && sel.escopo === 'selecionados', 'selecionados nunca vira loja_inteira (a ingestão só roda com escopo todo_o_site)');
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
console.log('test-cupom-candidato-79-ingestao: OK');
