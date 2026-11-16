/**
 * R-69 (dono, 2026-11-16): TIPO DE PRECO DA AMAZON. Caso fundador: P2S Combo B0G87M7V8Z, "Queda de preco R$ 8.074,90 (era R$ 8.499,90, queda de 5%)" = a
 * mesma oferta lida ora como preco cheio, ora como "a vista no Pix" (8.499,90 x 0,95). Fixtures: scripts/fixtures-amazon-124 (esqueletos de cards e pagina
 * reais lidos em 2026-11-16). Cobre: leitor da aba (amazon-assistida.js v1.1.0) -> definicao unica do preco (cheio + Pix como atributo) -> queda so entre o
 * mesmo tipo -> reconhecimento do historico -> guardas que quebram se o gancho sair do codigo.
 * Uso: npx tsx --env-file=.env.local scripts/test-tipo-preco-amazon-124.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assinaturaTrocaPixCheio, classificarSerieAmazon, definirPrecoAmazon, mesmaBaseDePreco, razaoPixValida } from '../src/lib/pricing/tipo-preco';
import { parseBrl } from '../src/lib/affiliate/amazon-identity';

export {};
const req = createRequire(import.meta.url);
const A = req('../public/loops/amazon-assistida.js');
const dir = path.join(process.cwd(), 'scripts', 'fixtures-amazon-124');
const fx = (n: string) => fs.readFileSync(path.join(dir, n), 'utf8');
const src = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

let fails = 0;
let n = 0;
function ok(c: boolean, nome: string, x?: unknown) { n++; if (!c) { fails++; console.error('FALHOU:', nome, x ?? ''); } }

/** leitor -> servidor: o que a oferta gravaria como preco da serie */
function gravaria(html: string, anterior?: number | null, semMarca = false) {
  const c = A.parseBusca(html).candidatos[0];
  const px = semMarca ? undefined : c.px === 1 ? true : c.px === 0 ? false : undefined;
  return definirPrecoAmazon({ pCents: parseBrl(c.p) as number, lCents: parseBrl(c.l), px, cheioAnteriorCents: anterior ?? null });
}

// 1) leitor v1.1.0: marca o tipo do destaque e nao confunde parcela nem "De:" com o cheio do Pix
const cPix = A.parseBusca(fx('card-pix.html')).candidatos[0];
ok(cPix.p === 'R$ 9.499,05' && cPix.l === 'R$ 9.999,00' && cPix.px === 1, 'card com Pix: destaque 9.499,05, lista 9.999,00 (cheio), px=1', cPix);
const cSem = A.parseBusca(fx('card-cheio-sem-pix.html')).candidatos[0];
ok(cSem.p === 'R$ 8.499,90' && cSem.l === null && cSem.px === 0, 'card sem Pix: a unica a-text-price e a PARCELA (12x R$ 793,32), nao e lista', cSem);
const cPro = A.parseBusca(fx('card-promocao-de.html')).candidatos[0];
ok(cPro.p === 'R$ 8.459,10' && cPro.l === 'R$ 9.999,00' && cPro.px === 0, 'promocao com "De:" e sem Pix: px=0, lista = preco antigo', cPro);
const cDe = A.parseBusca(fx('card-pix-e-de.html')).candidatos[0];
ok(cDe.px === 1 && cDe.l === null, 'Pix com "De:" no card: o De NAO e o cheio, lista descartada', cDe);
const pg = A.parsePagina(fx('pagina-pix.html'), 'B0G87M7V8Z');
ok(pg.ok && pg.p === 'R$ 9.499,05' && pg.px === 1, 'pagina: "5% off a vista no Pix" no bloco de pagamento marca px=1; Pix do carrossel nao conta', pg);
ok(A.validarPayload([{ id: '11111111-1111-4111-8111-111111111111', r: [cPix, cSem] }]).rows[0].r.map((c: { px?: number }) => c.px).join() === '1,0', 'payload leva px 1/0');
ok(/\bVERSAO = '1\.1\.0'/.test(src('public/loops/amazon-assistida.js')), 'leitor v1.1.0');

// 2) definicao unica: preco da serie = CHEIO; Pix = atributo
const dPix = gravaria(fx('card-pix.html'));
ok(dPix.ok && dPix.cheioCents === 999900 && dPix.pixCents === 949905 && dPix.tipoLido === 'a_vista_pix', 'Pix: serie 9.999,00, Pix 9.499,05 como atributo', dPix);
const dSem = gravaria(fx('card-cheio-sem-pix.html'));
ok(dSem.ok && dSem.cheioCents === 849990 && dSem.pixCents === null && dSem.listaCents === null, 'sem Pix: serie = destaque, parcela nunca vira lista', dSem);
const dPro = gravaria(fx('card-promocao-de.html'));
ok(dPro.ok && dPro.cheioCents === 845910 && dPro.pixCents === null && dPro.listaCents === 999900, 'promocao "De:": preco de venda e o destaque; lista so informativa', dPro);
const dDe = gravaria(fx('card-pix-e-de.html'));
ok(!dDe.ok && dDe.motivo === 'pix_sem_cheio', 'Pix sem cheio legivel: NAO grava (nunca inventa)', dDe);
const dSj = gravaria(fx('card-pix-sem-juros.html'));
ok(dSj.ok && dSj.cheioCents === 877910 && dSj.pixCents === 790118, 'B0GPFC29F2: Pix 7.901,18 sobre cheio 8.779,10 (10%)', dSj);
ok(razaoPixValida(790118, 877910) && !razaoPixValida(877910, 790118) && !razaoPixValida(500000, 999900), 'razao de Pix valida so entre 0,70 e 0,9995');

// 3) CASO FUNDADOR: a serie real do P2S (15:30 cheio, 19:41 Pix, 22:52 cheio, 01:17 Pix) vira UMA serie de cheio, sem queda
const real = [
  { p: 849990, l: 79332, esperado: 849990 }, // 15:30 cheio; a-text-price = parcela
  { p: 807499, l: 849999, esperado: 849999 }, // 19:41 Pix 8.074,99 (lista = cheio 8.499,99)
  { p: 849990, l: 79332, esperado: 849990 }, // 22:52 cheio
  { p: 807490, l: 849990, esperado: 849990 }, // 01:17 Pix 8.074,90 (lista = cheio 8.499,90): a "queda de 5%"
];
let ant: number | null = null;
const serie: number[] = [];
for (const r of real) {
  // leitor ANTIGO (sem a marca px): a parcela entra como lista, so a oferta prova o Pix
  const d = definirPrecoAmazon({ pCents: r.p, lCents: r.l, px: undefined, cheioAnteriorCents: ant });
  ok(d.ok && Math.abs(d.cheioCents - r.esperado) === 0, `serie real: leitura ${r.p} -> cheio ${r.esperado}`, d);
  if (d.ok) { serie.push(d.cheioCents); ant = d.cheioCents; }
}
const maiorVariacao = Math.max(...serie.slice(1).map((v, i) => Math.abs(v - serie[i]) / serie[i]));
ok(maiorVariacao < 0.001, 'serie do P2S sem salto de 5%: maior variacao entre leituras < 0,1% (centavos de vendedor)', serie);
const dNovo = definirPrecoAmazon({ pCents: 807490, lCents: 849990, px: true });
ok(dNovo.ok && dNovo.cheioCents === 849990 && dNovo.pixCents === 807490, 'leitor novo (px=1) no caso fundador: cheio 8.499,90, Pix 8.074,90', dNovo);

// 4) queda so entre leituras do MESMO tipo; troca de tipo nunca e queda
ok(assinaturaTrocaPixCheio(807490, 849990) && assinaturaTrocaPixCheio(790118, 877910, 877910), 'assinatura de troca Pix x cheio: 5%, 10% e lista igual ao outro');
ok(!assinaturaTrocaPixCheio(781990, 849990) && !assinaturaTrocaPixCheio(500000, 849990), 'queda real (8% ou 41%) nao e troca de tipo');
ok(!mesmaBaseDePreco({ cents: 807490 }, { cents: 849990 }) && mesmaBaseDePreco({ tipo: 'cheio', cents: 807490 }, { tipo: 'cheio', cents: 849990 }) && !mesmaBaseDePreco({ tipo: 'a_vista_pix', cents: 1 }, { tipo: 'cheio', cents: 1 }), 'mesma base: tipos iguais; sem tipo, nunca com a assinatura de troca');

// 5) historico: o leitor antigo gravou a serie real; so com PROVA vira Pix; promocao real em curso fica ambigua
const t0 = Date.parse('2026-11-15T16:30:00Z');
const h = (min: number) => t0 + min * 60000;
const c1 = classificarSerieAmazon([
  { id: 1, p: 849990, l: 79332, at: h(0) }, { id: 2, p: 807499, l: 849999, at: h(190) }, { id: 3, p: 849990, l: 79332, at: h(380) }, { id: 4, p: 807490, l: 849990, at: h(525) },
]);
ok(c1.provadas.length === 2 && c1.provadas.every((p) => p.cheioCents >= 849990) && c1.ambiguas.length === 0, 'historico real do P2S: 2 cotacoes Pix provadas (19:41 e 01:17)', c1);
const c2 = classificarSerieAmazon([{ id: 1, p: 999900, l: null, at: h(0) }, { id: 2, p: 845910, l: 999900, at: h(60) }, { id: 3, p: 845910, l: 999900, at: h(1500) }]);
ok(c2.provadas.length === 0 && c2.ambiguas.length === 1, 'promocao real em curso (cai e fica) NAO e corrigida: ambigua', c2);
const c3 = classificarSerieAmazon([{ id: 1, p: 36906, l: 64737, at: h(0) }, { id: 2, p: 35045, l: 64737, at: h(60) }, { id: 3, p: 36906, l: 64737, at: h(120) }]);
ok(c3.provadas.length === 1 && c3.provadas[0].cheioCents === 36906, 'card com De + Pix: retorno exato de 5% prova o Pix (cheio = vizinho)', c3);
const c4 = classificarSerieAmazon([{ id: 1, p: 100000, l: null, at: h(0) }, { id: 2, p: 90000, l: null, at: h(60) }, { id: 3, p: 100000, l: null, at: h(120) }]);
ok(c4.provadas.length === 1, 'retorno exato de 10% tambem e Pix provado (documentado: A->X->A com 5% ou 10%)');
const c5 = classificarSerieAmazon([{ id: 1, p: 100000, l: null, at: h(0) }, { id: 2, p: 93000, l: null, at: h(60) }, { id: 3, p: 100000, l: null, at: h(120) }]);
ok(c5.provadas.length === 0, 'oscilacao de 7% (nao 5% nem 10%) nao e tratada como Pix');

// 6) guardas de integracao: quebram se o gancho sair do codigo
ok(src('src/server/collector/amazon-assisted.ts').includes('decidirPrecoAmazon') && src('src/server/collector/amazon-assisted.ts').includes('pixCents: pixAttr'), 'GUARDA: coleta assistida usa a definicao unica de preco');
ok(src('src/server/collector/amazon-vitrine.ts').includes('decidirPrecoAmazon') && src('src/server/collector/amazon-vitrine.ts').includes('pixCents: dec0.pixCents'), 'GUARDA: vitrine usa a definicao unica de preco');
ok(src('src/server/collector/record-price-snapshot.ts').includes('pixCents') && src('src/server/collector/record-price-snapshot.ts').includes("priceType: 'cheio'"), 'GUARDA: recordPriceSnapshot grava o tipo e o Pix como atributo');
ok(src('scripts/medir-integridade-preco.ts').includes("add('n.1'") && src('scripts/medir-integridade-preco.ts').includes("add('n.2'"), 'GUARDA: invariantes n.1 e n.2 no medidor de integridade');
ok(fs.existsSync('drizzle/migrations/0062_tipo_preco_amazon.sql') && fs.existsSync('drizzle/migrations/0062_tipo_preco_amazon.rollback.sql'), 'GUARDA: migration 0062 e rollback existem');
ok(!/\.px\b/.test(src('src/server/collector/amazon-assisted.ts')), 'GUARDA: o ingest nao le px direto (so por decidirPrecoAmazon)');

console.log(`${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
