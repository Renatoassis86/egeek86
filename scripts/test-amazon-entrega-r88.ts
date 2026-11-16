/**
 * R-88 (dono, 2026-11-16, P2S Combo B0G87M7V8Z): a lista do privado dizia "chega até qua, 25/11" e a página da Amazon mostrava "Entrega GRÁTIS Sexta-feira, 20 de Novembro".
 * Causa: a entrega da Amazon (volátil: 19/11 -> 25/11 -> 20/11 em 26 h) era aceita por até 12 h e só o loop de cupons a gravava.
 * Cobre: (1) validade da entrega da Amazon = a do preço (R-81) [teste-frete-prazo-118 também]; (2) o loop rápido (amazon-assistida.js 1.3.0) lê a entrega do HTML da página e a CEP da conta;
 * (3) o contrato leva `ent` só com pg=1 e saneado; (4) o servidor grava a entrega pelo ASIN da oferta; (5) guardas que quebram se o gancho sair do código.
 * Fixture: esqueleto de pagina-pix.html (2026-11-16) + bloco de entrega com os MESMOS ids/texto medidos na página real (mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE, glow-ingress-block).
 * Uso: npx tsx scripts/test-amazon-entrega-r88.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseEntregaAmazon } from '../src/lib/shipping/frete-prazo';

export {};
const req = createRequire(import.meta.url);
const A = req('../public/loops/amazon-assistida.js');
const fx = (n: string) => fs.readFileSync(path.join(process.cwd(), 'scripts', 'fixtures-amazon-124', n), 'utf8');
const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
let fails = 0;
let n = 0;
function ok(c: boolean, nome: string, x?: unknown) { n++; if (!c) { fails++; console.error('FALHOU:', nome, x ?? ''); } }

const ASIN = 'B0G87M7V8Z';
const BLOCO = '<div id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE" class="a-row"><span><span class="a-text-bold">Entrega GRÁTIS</span> <span class="a-text-bold">Sexta-feira, 20 de Novembro</span> <a>Ver detalhes</a></span></div>';
const GLOW = '<div id="glow-ingress-block"><span id="glow-ingress-line1">Enviar para Renato</span><span id="glow-ingress-line2">João Pessoa 58035090&zwnj;</span></div>';
const pagina = (extra: string) => fx('pagina-pix.html').replace('</body>', `${GLOW}${extra}</body>`);

// 1) leitor: layout simples
const p1 = A.parsePagina(pagina(BLOCO), ASIN);
ok(p1.ok && p1.ent && /Entrega GRÁTIS Sexta-feira, 20 de Novembro/.test(p1.ent.t), 'leitor: lê o texto da entrega da página', p1.ent);
ok(p1.ent && p1.ent.z === '58035090', 'leitor: lê o CEP da conta (58035090)', p1.ent);
ok(p1.ok && p1.p === 'R$ 9.499,05', 'leitor: o preço segue o mesmo (a entrega não mexe no preço)', p1.p);
// sem bloco de entrega: sem ent (nunca inventa)
const p0 = A.parsePagina(pagina(''), ASIN);
ok(p0.ok && p0.ent === undefined, 'leitor: sem bloco de entrega, sem ent', p0.ent);
// 2) candidato e contrato
const cand = A.candidatoDePagina({ a: ASIN, t: 'Bambu Lab P2S Combo' }, p1);
ok(cand.ent && cand.ent.t === p1.ent.t && cand.pg === 1, 'candidatoDePagina leva ent', cand);
const v = A.validarPayload([{ id: '11111111-1111-4111-8111-111111111111', r: [{ ...cand, a: ASIN, s: 1 }] }]);
ok(v.rows[0].r[0].ent && v.rows[0].r[0].ent.z === '58035090' && v.rows[0].r[0].ent.t.length <= 300, 'contrato: ent vai com pg=1 e saneado', v.rows[0].r[0]);
const vSem = A.validarPayload([{ id: '11111111-1111-4111-8111-111111111111', r: [{ a: ASIN, t: 'X', p: 'R$ 1.000,00', l: null, s: 0, ent: { t: 'Entrega GRÁTIS amanhã', z: '58035090' } }] }]);
ok(vSem.rows[0].r[0].ent === undefined, 'contrato: ent de card da busca (sem pg) é descartado', vSem.rows[0].r[0]);
const vLixo = A.validarPayload([{ id: '11111111-1111-4111-8111-111111111111', r: [{ ...cand, ent: { t: 'x'.repeat(900), z: 'abc' } }] }]);
ok(vLixo.rows[0].r[0].ent && vLixo.rows[0].r[0].ent.t.length === 300 && vLixo.rows[0].r[0].ent.z === undefined, 'contrato: texto cortado em 300 e CEP inválido some', vLixo.rows[0].r[0].ent);
// 3) o servidor interpreta o mesmo texto como a data da página
const e = parseEntregaAmazon(p1.ent.t, new Date('2026-11-16T23:40:00Z'), { cepTexto: p1.ent.z });
ok(!!e && e.free && e.etaTo === '2026-11-20' && e.zip === '58035090', 'servidor: "Entrega GRÁTIS Sexta-feira, 20 de Novembro" = grátis, 2026-11-20, CEP 58035090', e);
// 4) guardas
ok(/VERSAO = '1\.(3|[4-9])\.\d+'|VERSAO = '[2-9]\./.test(src('public/loops/amazon-assistida.js')), 'guarda: loop rápido na versão 1.3.0 ou superior');
ok(/gravarEntregasPorAsin\(/.test(src('src/server/collector/amazon-assisted.ts')), 'guarda: a ingestão do loop rápido grava a entrega');
ok(/export async function gravarEntregasPorAsin/.test(src('src/server/shipping/frete-prazo.ts')), 'guarda: função do servidor existe');
ok(/ent\?: \{ t: string; z\?: string \}/.test(src('src/lib/affiliate/amazon-identity.ts')), 'guarda: AmzCand declara ent');

console.log(`${n - fails}/${n} verificações ok (R-88 entrega da Amazon)`);
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
