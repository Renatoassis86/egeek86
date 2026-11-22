/** Teste do MENOR PREÇO REGISTRADO na mensagem (R-117, dono, 2026-11-22). Puro. Uso: npx tsx scripts/test-menor-preco.ts */
import { menorPrecoLigado, menorPrecoRegistrado } from '../src/lib/messaging/menor-preco-registrado';
import { comporMensagemV4, type EstadoMensagem, type MensagemV4Input } from '../src/lib/messaging/mensagem-v4';
import { captionVisibleLength } from '../src/lib/messaging/telegram-send';
import type { MsgOffer } from '../src/lib/messaging/group-messages';

let fails = 0;
let total = 0;
function ok(c: boolean, n: string, x?: unknown) {
  total++;
  if (!c) { fails++; console.error(`FALHOU: ${n}`, x ?? ''); }
}
const HOJE = '2026-11-22';
const serie = (...p: Array<[string, number]>) => p.map(([day, minCents]) => ({ day, minCents }));

// Núcleo puro
{
  const s = serie(['2026-11-01', 95000], ['2026-11-05', 82000], ['2026-11-10', 90000], ['2026-11-15', 82000]);
  const a = menorPrecoRegistrado(s, 89900, HOJE);
  ok(a?.situacao === 'acima' && a.cents === 82000 && a.day === '2026-11-05', 'mínimo < atual: data mais antiga do empate', a);
  ok(a?.acimaPct === 9.6, 'acima em %', a);
  const b = menorPrecoRegistrado(s, 82000, HOJE);
  ok(b?.situacao === 'igual', 'atual = mínimo', b);
  const c = menorPrecoRegistrado(s, 79900, HOJE);
  ok(c?.situacao === 'novo-minimo' && c.cents === 82000, 'atual abaixo do mínimo = novo mínimo (cita o anterior)', c);
  ok(menorPrecoRegistrado([], 79900, HOJE) === null && menorPrecoRegistrado(null, 79900, HOJE) === null, 'sem histórico = null');
  ok(menorPrecoRegistrado(serie([HOJE, 50000]), 79900, HOJE) === null, 'hoje não conta como histórico');
  // preço-isca: ponto de R$ 10 numa série de ~R$ 900 nunca é o mínimo
  const i = menorPrecoRegistrado(serie(['2026-11-01', 90000], ['2026-11-02', 91000], ['2026-11-03', 89000], ['2026-11-04', 1000], ['2026-11-05', 90500]), 89900, HOJE);
  ok(i?.cents === 89000, 'isca excluída', i);
  // Amazon: a série própria (preço cheio) é a que entra; o núcleo só usa o que recebe
  const amz = menorPrecoRegistrado(serie(['2026-11-03', 800000], ['2026-11-12', 807490]), 807490, HOJE);
  ok(amz?.cents === 800000 && amz.situacao === 'acima', 'Amazon: série cheia', amz);
}
for (const v of ['off', 'OFF', '0', 'false', 'nao']) ok(!menorPrecoLigado({ MENSAGEM_MENOR_PRECO: v }), `flag ${v}`);
ok(menorPrecoLigado({}), 'padrão ligado');

// Compositor
const NOW = new Date('2026-11-22T15:00:00Z');
const offer: MsgOffer = { slug: 'ml-1', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 89900, confirmedAt: NOW, affiliateUrl: 'https://meli.la/1AbCdEf', storeName: 'Loja X', seller: { reputation: '5_green', totalSales: 12000 } };
const entrada = (estado: EstadoMensagem, over: Partial<MensagemV4Input> = {}): MensagemV4Input => ({
  estado, vertical: 'tecnologia', titulo: 'Mouse Gamer Logitech G203 Lightsync', tipoLabel: 'Mouse', marca: 'Logitech', plataforma: null, formato: null, offer,
  messageKey: 'ac-261122-abc123', adTag: '#publicidade', avg: estado === 'novo' ? null : { cents: 102000, offers: 6 },
  veredito: estado === 'diagnostico' ? { degrau: 2, rotulo: 'Boa compra' } : null, faixa: null, ...over,
});
const s = serie(['2026-11-05', 82000], ['2026-11-10', 90000]);
for (const estado of ['monitoramento', 'diagnostico', 'novo'] as EstadoMensagem[]) {
  for (const canal of ['tg', 'wa'] as const) {
    const acima = comporMensagemV4(entrada(estado, { menor: menorPrecoRegistrado(s, 89900, HOJE) }), canal) as string;
    ok(/Menor preço registrado:/.test(acima) && /R\$\s?820,00 em 05\/11/.test(acima) && /agora \+9,6%/.test(acima), `${estado}/${canal}: acima com data e %`, acima);
    const igual = comporMensagemV4(entrada(estado, { menor: menorPrecoRegistrado(s, 82000, HOJE) }), canal) as string;
    ok(/Menor preço já registrado/.test(igual) && /iguala/.test(igual), `${estado}/${canal}: selo quando igual`);
    const novo = comporMensagemV4(entrada(estado, { menor: menorPrecoRegistrado(s, 79900, HOJE) }), canal) as string;
    ok(/Menor preço já registrado/.test(novo) && /anterior era R\$\s?820,00 em 05\/11/.test(novo), `${estado}/${canal}: selo quando novo mínimo`);
    const sem = comporMensagemV4(entrada(estado, { menor: null }), canal) as string;
    ok(!/Menor preço (já )?registrado/.test(sem), `${estado}/${canal}: sem histórico = sem linha`, sem);
  }
}
{
  // não duplica com a linha antiga do movimento/referência
  const t = comporMensagemV4(entrada('monitoramento', { refCents: 82000, sinceDay: '2026-11-05', menor: menorPrecoRegistrado(s, 89900, HOJE) }), 'tg') as string;
  ok((t.match(/Menor preço/g) ?? []).length === 1, 'uma só linha de menor preço', t);
  const semNovo = comporMensagemV4(entrada('monitoramento', { refCents: 82000, sinceDay: '2026-11-05', menor: null }), 'tg') as string;
  ok(/Menor preço registrado/.test(semNovo), 'sem o dado novo, a linha antiga continua (flag off)');
  // legenda <= 1024 com título longo e tudo ligado
  const longo = 'Smartphone Samsung Galaxy S24 Ultra 512GB 5G Titanium Black Tela 6.8 Camera 200MP Galaxy AI Snapdragon 8 Gen 3 Dual Chip Versao Global '.repeat(1).slice(0, 190);
  const g = comporMensagemV4(entrada('diagnostico', { titulo: longo, marca: 'Samsung', menor: menorPrecoRegistrado(s, 89900, HOJE), faixa: { minCents: 88000, maxCents: 120000, dias: 21 } }), 'tg') as string;
  ok(captionVisibleLength(g) <= 1024 && /Menor preço registrado/.test(g), 'legenda <= 1024 com a linha', captionVisibleLength(g));
  const ap = comporMensagemV4(entrada('diagnostico', { menor: menorPrecoRegistrado(s, 89900, HOJE) }), 'tg', 560) as string;
  ok(captionVisibleLength(ap) <= 560 || /Comprar/.test(ap), 'orçamento apertado preserva o link');
  ok(/https:\/\/meli\.la\/1AbCdEf/.test(t), 'link no corpo continua');
  ok(!/metodolog|rollup|série|isca/i.test(t), 'sem metodologia interna');
}
console.log(`${total - fails}/${total} ok`);
if (fails) process.exit(1);
