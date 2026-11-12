/**
 * Testes da regra de expiracao/reativacao das ofertas Shopee (funcoes puras, sem banco/rede).
 * Uso: npx tsx scripts/test-shopee-expiracao.ts
 */
import { decideMiss, hourBucket, podeReativar, SHOPEE_MAX_MISSES, SHOPEE_MISS_RECHECK_MS, type MissInput } from '../src/lib/affiliate/shopee-expiry';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const at = (iso: string) => new Date(iso);
const base = (o: Partial<MissInput>): MissInput => ({ status: 'active', missCount: 0, lastCheckedAt: null, now: at('2026-11-12T10:05:00Z'), reason: 'not_returned', ...o });

check('constante: 3 faltas', SHOPEE_MAX_MISSES === 3);
check('uma resposta vazia NAO expira', (() => { const d = decideMiss(base({})); return d.counted && d.missCount === 1 && !d.expire; })());

// Oferta ativa que some: checagens a cada 1 h (intervalo de reconsulta com falta pendente)
{
  let st = { status: 'active', missCount: 0, lastCheckedAt: null as Date | null };
  let now = at('2026-11-12T10:05:00Z');
  const hist: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = decideMiss({ ...st, now, reason: 'not_returned' });
    hist.push(`${d.missCount}${d.expire ? 'E' : ''}`);
    st = { status: d.expire ? 'expired' : 'active', missCount: d.missCount, lastCheckedAt: now };
    now = new Date(now.getTime() + SHOPEE_MISS_RECHECK_MS);
  }
  check('3 faltas em horas diferentes (10h, 11h, 12h) expiram so na 3a', hist.join(',') === '1,2,3E', hist);
}

// Duas checagens na mesma hora cheia contam uma so
{
  const d1 = decideMiss(base({ now: at('2026-11-12T10:05:00Z') }));
  const d2 = decideMiss(base({ missCount: d1.missCount, lastCheckedAt: at('2026-11-12T10:05:00Z'), now: at('2026-11-12T10:40:00Z') }));
  check('2a falta na MESMA hora nao conta', !d2.counted && d2.missCount === 1 && !d2.expire, d2);
  const d3 = decideMiss(base({ missCount: 1, lastCheckedAt: at('2026-11-12T10:40:00Z'), now: at('2026-11-12T11:02:00Z') }));
  check('falta na hora seguinte conta', d3.counted && d3.missCount === 2, d3);
  const d4 = decideMiss(base({ missCount: 2, lastCheckedAt: at('2026-11-12T11:30:00Z'), now: at('2026-11-12T11:55:00Z') }));
  check('3a falta na mesma hora da 2a NAO expira', !d4.expire && d4.missCount === 2, d4);
}
check('hourBucket distingue 10:59 de 11:00', hourBucket(at('2026-11-12T10:59:59Z')) !== hourBucket(at('2026-11-12T11:00:00Z')));

// Casos especiais
check('preco ambiguo nao e falta e nunca expira', (() => { const d = decideMiss(base({ missCount: 2, lastCheckedAt: at('2026-11-12T08:00:00Z'), reason: 'ambiguous_price' })); return !d.counted && !d.expire && d.missCount === 2; })());
check('preco implausivel conta como falta', decideMiss(base({ reason: 'implausible_price' })).counted);
check('sem preco (no_price) conta como falta', decideMiss(base({ reason: 'no_price' })).counted);
check('oferta ja expirada nao expira de novo nem muda contador', (() => { const d = decideMiss(base({ status: 'expired', missCount: 3 })); return !d.expire && !d.counted && d.missCount === 3; })());
check('rascunho tambem segue a regra das 3 faltas', decideMiss(base({ status: 'draft', missCount: 2, lastCheckedAt: at('2026-11-12T08:00:00Z') })).expire);
check('contador zerado (preco valido anterior) conta a falta mesmo com checagem recente', decideMiss(base({ missCount: 0, lastCheckedAt: at('2026-11-12T10:01:00Z') })).counted);

// Reativacao
check('expirada com preco valido reativa', podeReativar({ status: 'expired', temPerguntaPendente: false, bloqueadaPeloDono: false }));
check('expirada com pergunta pendente NAO reativa (duvida de identidade)', !podeReativar({ status: 'expired', temPerguntaPendente: true, bloqueadaPeloDono: false }));
check('expirada bloqueada pelo dono NAO reativa', !podeReativar({ status: 'expired', temPerguntaPendente: false, bloqueadaPeloDono: true }));
check('ativa nao "reativa"', !podeReativar({ status: 'active', temPerguntaPendente: false, bloqueadaPeloDono: false }));
check('rascunho nao reativa por esta via', !podeReativar({ status: 'draft', temPerguntaPendente: false, bloqueadaPeloDono: false }));

console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
