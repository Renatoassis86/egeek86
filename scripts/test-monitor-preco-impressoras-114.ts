/**
 * #114: monitor de preço das impressoras 3D. Puro (decisão, texto, ordem) + com --db: DRY-RUN contra o banco real (nunca envia, nunca grava).
 * Uso: NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/test-monitor-preco-impressoras-114.ts [--db]
 */
import { decidir, textoAvisoPreco, monitorPrecoLigado, posicaoModelo, quedaMinimaCents, type EntradaDecisao, type MenorPreco } from '../src/lib/coupons/monitor-preco-impressoras';
import { modeloGuia3d } from '../src/lib/messaging/prioridade-3d';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }

const now = new Date('2026-11-15T12:00:00Z');
const m = (cents: number, rede = 'mercado-livre'): MenorPreco => ({ chave: 'p2s-combo', rotulo: 'Bambu Lab P2S Combo', cents, rede, loja: 'HDSTORE_OFICIAL', slug: 'p2s-combo-abc' });
const e = (cents: number, over: Partial<EntradaDecisao> = {}): EntradaDecisao => ({ atual: m(cents), base: { cents: 833000, rede: 'mercado-livre' }, min14: 833000, ultimoAvisoEm: null, now, ...over });

// Limiar: 2% ou R$ 50, o que for maior.
ok(quedaMinimaCents(833000) === 16660, '2% de 8330 = 166,60 (maior que 50)');
ok(quedaMinimaCents(100000) === 5000, 'preço de R$ 1000: R$ 50 vale mais que 2%');
ok(decidir(e(833000 - 16660)) === 'queda', 'queda de exatamente 2% avisa');
ok(decidir(e(833000 - 16659, { min14: 0 })) === 'nada', 'um centavo abaixo de 2% não avisa (sem novo mínimo)');
ok(decidir(e(100000 - 5000, { base: { cents: 100000, rede: 'mercado-livre' } })) === 'queda', 'R$ 50 em produto barato avisa');
// Novo mínimo de 14 dias (queda pequena, mas abaixo de tudo que já se viu).
ok(decidir(e(830000, { min14: 831000 })) === 'minimo', 'novo mínimo de 14 dias avisa');
ok(decidir(e(830000, { min14: 820000 })) === 'nada', 'acima do mínimo antigo e queda pequena: nada');
// Rede nova mais barata.
ok(decidir({ ...e(832000), atual: m(832000, 'amazon'), min14: 800000 }) === 'rede-nova', 'rede nova mais barata avisa');
ok(decidir({ ...e(834000), atual: m(834000, 'amazon'), min14: 800000 }) === 'nada', 'rede nova mais cara não avisa');
// Alta não avisa; primeira execução = linha de base.
ok(decidir(e(900000)) === 'nada', 'subir não avisa');
ok(decidir(e(700000, { base: null, min14: null })) === 'baseline', '1ª execução grava base sem avisar');
// Dedup de 2 h.
ok(decidir(e(700000, { ultimoAvisoEm: new Date(now.getTime() - 119 * 60_000) })) === 'nada', 'dentro de 2 h: nada');
ok(decidir(e(700000, { ultimoAvisoEm: new Date(now.getTime() - 121 * 60_000) })) === 'queda', 'após 2 h: avisa');

// Texto.
const t = textoAvisoPreco('queda', m(799000), 833000);
ok(/Bambu Lab/.test(t) === false && /P2S Combo/.test(t) && /R\$ 8\.330 → <b>R\$ 7\.990<\/b>/.test(t) && /Mercado Livre \(HDSTORE_OFICIAL\)/.test(t) && /\/go\/p2s-combo-abc/.test(t), 'texto', t);
ok(!/prazo|entrega|comiss/i.test(t), 'sem prazo nem comissão');
ok(/novo mínimo/.test(textoAvisoPreco('minimo', m(799000), 833000)), 'texto de novo mínimo');
ok(!/<script/i.test(textoAvisoPreco('queda', { ...m(1000), loja: '<script>' }, 2000)), 'escapa HTML');

// Ordem: combo primeiro, Kobra por último; combo e avulsa em grupos distintos.
const ordem = ['kobra:x', 'a1-mini', 'p2s', 'a1-combo', 'p1s-combo', 'a1-mini-combo', 'p2s-combo', 'p1s', 'a1'].sort((a, b) => posicaoModelo(a) - posicaoModelo(b));
ok(ordem.join(',') === 'p2s-combo,p1s-combo,a1-combo,a1-mini-combo,p2s,p1s,a1,a1-mini,kobra:x', 'ordem combo primeiro', ordem);
ok(modeloGuia3d('Impressora 3D Bambu Lab P2S Combo AMS')?.slug === 'p2s-combo' && modeloGuia3d('Impressora 3D Bambu Lab P2S')?.slug === 'p2s', 'combo nunca se mistura com avulsa');

// Flag.
ok(!monitorPrecoLigado({}) && monitorPrecoLigado({ PRIVADO_IMPRESSORAS: 'on' }) && !monitorPrecoLigado({ PRIVADO_IMPRESSORAS: 'on', PRINTER_PRICE_ALERT: 'off' }), 'padrão desligada (2026-11-25, impressoras fora do privado); PRIVADO_IMPRESSORAS=on liga, off desliga');

async function db() {
  // Sem variáveis de envio: dry-run garantido (não envia, não grava).
  process.env.COLLECTOR_ALERTS = '0';
  const { monitorarPrecoImpressoras } = await import('../src/server/coupons/monitor-preco-impressoras');
  const r = await monitorarPrecoImpressoras(new Date());
  ok(r.dryRun && r.enviados === 0, 'dry-run não envia');
  console.log(`modelos com oferta elegível: ${r.modelos}; baselines (1ª execução): ${r.baselines}; enviaria agora: ${r.enviaria}`);
  for (const l of r.linhas) console.log(`${l.chave.padEnd(16)} R$ ${(l.atual.cents / 100).toFixed(2).padStart(9)}  ${l.atual.rede.padEnd(13)} ${l.atual.loja ?? '-'}  [${l.acao}]  /go/${l.atual.slug}`);
  for (const a of r.avisos) console.log('AVISO:', a);
}

(async () => {
  if (process.argv.includes('--db')) await db();
  console.log(fails ? `${fails} falha(s)` : 'OK');
  process.exit(fails ? 1 : 0);
})();
export {};
