/** Testes da vitrine da Amazon e da exceção de hardware retrô NOVO. Rodar: npx tsx --conditions=react-server --env-file=.env.local scripts/test-amazon-vitrine.ts */
import { vitrineQueries, vitrineQueue, isVitrineId, VITRINE_PREFIX, chaveSimplesGame } from '../src/server/collector/amazon-vitrine';
import { isNewRetroStyleHardware, mentionsRetroPlatformOnly, evaluateCatalogGate } from '../src/lib/catalog/gate';
import { foldTitle } from '../src/lib/catalog/dimensions';
import { rejectionOf } from '../src/lib/catalog/vertical/identity';

let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.log('FALHA', m); } else console.log('ok  ', m); };

const qs = vitrineQueries();
ok(qs.length > 60, `consultas da vitrine geradas (${qs.length})`);
ok(new Set(qs.map((q) => q.id)).size === qs.length, 'ids únicos');
ok(qs.every((q) => /^[0-9a-f-]{36}$/i.test(q.id) && q.id.startsWith(VITRINE_PREFIX) && isVitrineId(q.id)), 'ids no formato UUID aceito pelo laço e pela rota');
ok(!isVitrineId('11111111-1111-4111-8111-111111111111'), 'id de master não é vitrine');
const verts = new Set(qs.map((q) => q.vertical));
ok(['games', 'impressao3d', 'tecnologia', 'livros', 'esporte', 'eletrodomesticos', 'eletroeletronicos'].every((v) => verts.has(v as never)), `todas as 7 lojas têm consulta (${[...verts].join(',')})`);
const cap = 60;
const vistos = new Set<string>();
for (let h = 0; h < 24; h++) vitrineQueue(0, 200, new Date(Date.UTC(2026, 10, 12, h))).items.forEach((i) => vistos.add(i.id));
ok(vistos.size === qs.length, `rotação por hora cobre todas as consultas no dia (${vistos.size}/${qs.length})`);
const f = vitrineQueue(0, 200, new Date(Date.UTC(2026, 10, 12, 5)));
ok(f.total === Math.min(cap, qs.length) && f.items.length === f.total, 'teto do ciclo respeitado');

// Guarda anti-duplicata de games (incidente 'NBA 2K27')
ok(chaveSimplesGame('NBA 2K27 - PlayStation 5') === chaveSimplesGame('NBA 2K27 - PS5'), 'chave simples: NBA 2K27 PlayStation 5 = NBA 2K27 PS5');
ok(chaveSimplesGame('Resident Evil Village – Gold Edition - Playstation 5') !== chaveSimplesGame('Resident Evil Village - PS5'), 'chave simples: edição Gold NÃO junta com a padrão');
ok(chaveSimplesGame('Street Fighter 6 - PlayStation 5') !== chaveSimplesGame('Street Fighter 6 - Year 1-2 Fighters Edition PS5'), 'chave simples: edição diferente separa');

// Exceção do retrô novo (dono, 2026-11-12)
const t = (s: string) => foldTitle(s);
ok(isNewRetroStyleHardware(t('Hyperkin SupaBoy S Handheld Game Boy portátil')), 'SupaBoy (Hyperkin, novo) entra');
ok(mentionsRetroPlatformOnly(t('Hyperkin SupaBoy S Handheld Game Boy portátil')) === null, 'SupaBoy não é "plataforma retrô" para a Amazon');
ok(!isNewRetroStyleHardware(t('Hyperkin SupaBoy usado')), 'Hyperkin USADO continua fora');
ok(!isNewRetroStyleHardware(t('Hyperkin SupaBoy recondicionado')), 'Hyperkin recondicionado continua fora');
ok(!isNewRetroStyleHardware(t('Console Game Boy Color Nintendo original')), 'Game Boy Nintendo de época continua fora (marca fora da lista)');
ok(mentionsRetroPlatformOnly(t('Console Game Boy Color Nintendo original')) !== null, 'Game Boy Nintendo continua retrô');
ok(isNewRetroStyleHardware(t('8BitDo Retro Receiver SNES')) && isNewRetroStyleHardware(t('Analogue Pocket')) && isNewRetroStyleHardware(t('Retro-Bit Super Retro Trio')), '8BitDo, Analogue e Retro-Bit entram (novo)');
ok(rejectionOf({ id: 'x', name: 'Hyperkin SupaBoy S Handheld retro portátil' }) === null, 'identidade: SupaBoy não cai no léxico "retro"');
ok(rejectionOf({ id: 'x', name: 'Console retro 400 jogos' }) !== null, 'identidade: console retro genérico continua rejeitado');
const g = evaluateCatalogGate({ name: 'Hyperkin SupaBoy S Handheld Game Boy portátil', productType: 'console' } as never);
ok(g.verdict !== 'rejected' || !/retro|emulacao/.test(String(g.reason)), `porteiro: SupaBoy não é barrado por retrô (${g.verdict}/${g.reason})`);
const g2 = evaluateCatalogGate({ name: 'Console Game Boy Advance Nintendo', productType: 'console' } as never);
ok(g2.verdict === 'rejected', `porteiro: Game Boy Advance segue rejeitado (${g2.verdict}/${g2.reason})`);
console.log(`\n${n - fail}/${n} ok`);
process.exit(fail ? 1 : 0);
