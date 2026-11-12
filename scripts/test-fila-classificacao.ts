/**
 * Testes da FILA DE CLASSIFICACAO (dono, 2026-11-11).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-fila-classificacao.ts   (codigo 1 se algo falhar)
 * Parte A: pura (sem banco). Parte B: banco DENTRO DE UMA TRANSACAO REVERTIDA (a migration 0042 e executada na propria transacao; nada e gravado).
 * Cobre: geracao da fila a partir de incertezas, aprendizado por titulo, aplicacao da decisao (mover/criar/nao e este/preco), idempotencia e desfazer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { judgeObvio, type ObvioInput } from '../src/lib/identity-queue/obvio';
import type { MlEvidence } from '../src/lib/identity-queue/api-evidence';
import {
  axisLearnsByTitle, consoleCandidate, dispersionCandidates, dispersionOf, identifyConsole, titleNorm, titlesSimilar,
} from '../src/lib/identity-queue/model';

let fails = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

function parteA() {
  console.log('--- A: logica pura ---');
  const nd = 'Console Sony PlayStation 5 Digital Lacrado Frete Gratis';
  const c = consoleCandidate({ id: 'o1', title: nd, masterId: 'm1' }, []);
  check('PS5 sem Slim/Pro/Fat gera pergunta de MODELO (chave_nd)', c?.axis === 'modelo' && c.source === 'chave_nd', c?.axis);
  check('opcoes: original, Slim, Pro, nao sei, nao e este', c?.options.map((o) => o.value).join(',') === 'base,slim,pro,nao_sei,nao_e_este', c?.options.map((o) => o.value));
  check('opcao sem master existente traz dados para criar (com a chave)', !!c?.options[1].create?.key.includes('slim'), c?.options[1]);
  const m = [{ id: 'mS', name: 'Console PlayStation 5 Slim Digital' }];
  const c2 = consoleCandidate({ id: 'o1', title: nd, masterId: 'm1' }, m);
  check('opcao Slim aponta para o master existente da mesma identidade', c2?.options[1].targetMasterId === 'mS' && c2.options[1].create == null, c2?.options[1]);
  check('titulo que prova tudo (Slim Digital) NAO gera pergunta', consoleCandidate({ id: 'o2', title: 'Console PlayStation 5 Slim Digital 1TB', masterId: 'm1' }, m) == null);
  check('com a resposta de modelo ja dada, o item seguinte e outro eixo ou nenhum', consoleCandidate({ id: 'o1', title: nd, masterId: 'm1' }, m, { modelo: 'slim' })?.axis !== 'modelo');
  check('PS5 com leitor presumido pergunta MIDIA', consoleCandidate({ id: 'o3', title: 'Console PlayStation 5 Slim 1TB Sony', masterId: 'm' }, [])?.axis === 'midia');
  const xb = consoleCandidate({ id: 'o4', title: 'Console Xbox Series X Microsoft Digital', masterId: 'm' }, []);
  check('Xbox Series X sem armazenamento pergunta ARMAZENAMENTO', xb?.axis === 'armazenamento' && xb.options.length === 5, xb?.axis);
  check('usado/Open Box nao entra na fila (condicao propria)', consoleCandidate({ id: 'o5', title: 'Console PlayStation 5 Usado Digital', masterId: 'm' }, []) == null);
  check('identifyConsole aplica a resposta como palavra explicita', identifyConsole(nd, { modelo: 'slim' }).model === 'slim' && identifyConsole(nd).model === 'nd');

  check('titulos iguais (ruido comercial ignorado) sao similares', titlesSimilar('Console PS5 Slim Digital Lacrado', 'Console PS5 Slim Digital - Frete Gratis'));
  check('825gb x 1tb NUNCA se confundem', !titlesSimilar('Console PS5 825GB Digital', 'Console PS5 1TB Digital'));
  check('titulos diferentes nao sao similares', !titlesSimilar('Console PS5 Slim Digital', 'Controle DualSense PS5 Branco'));
  check('titleNorm tira ruido', titleNorm('Console PS5 Novo Lacrado Frete Gratis') === 'console ps5');
  check('preco nao aprende por titulo; identidade e console aprendem', !axisLearnsByTitle('preco') && axisLearnsByTitle('identidade') && axisLearnsByTitle('modelo'));

  const cents = (v: number) => v * 100;
  const offers = [3500, 3550, 3600, 3650, 3700, 8900, 9000].map((v, i) => ({ id: `x${i}`, price: cents(v), title: `Produto ${i}` }));
  const d = dispersionOf(offers);
  check('dispersao: grupo de preco separado e sinalizado (bimodal, minoria)', d.bimodal && d.flagged && d.suspects.map((s) => s.id).sort().join() === 'x5,x6', d);
  const homog = dispersionOf([3500, 3550, 3600, 3650].map((v, i) => ({ id: `h${i}`, price: cents(v) })));
  check('dispersao: produto homogeneo nao gera item', !homog.flagged && homog.suspects.length === 0);
  const imp = dispersionOf([...[100, 101, 102].map((v, i) => ({ id: `p${i}`, price: cents(v) })), { id: 'big', price: 100_000_000 }]);
  check('preco >= R$ 1 milhao e implausivel', imp.implausible.length === 1 && imp.implausible[0].id === 'big');
  const cs = dispersionCandidates({ id: 'm', name: 'Produto', vertical: 'livros' }, [...offers, { id: 'big', price: 100_000_000, title: 'Produto gigante' }]);
  check('candidatos: identidade (dispersao) e preco, com vertical do master', cs.some((x) => x.axis === 'identidade' && x.vertical === 'livros') && cs.some((x) => x.axis === 'preco' && x.offerId === 'big'));

  // ---- Casos OBVIOS (2026-11-12): criterio objetivo e conservador ----
  const SIM = { value: 'sim', label: 'E este produto', kind: 'escolha' as const };
  const NE = { value: 'nao_e_este', label: 'Nao e este produto', kind: 'nao_e_este' as const };
  const NS = { value: 'nao_sei', label: 'Nao sei', kind: 'nao_sei' as const };
  const ob = (over: Partial<ObvioInput> = {}): ObvioInput => ({
    axis: 'identidade', source: 'dispersao', options: [SIM, NE, NS], understood: { medianaCents: 10000, precoCents: 11000, bimodal: false },
    itemTitle: 'Filamento PLA Voolt3d 1kg 1.75mm Preto', masterName: 'Filamento PLA Voolt3d 1kg 1.75mm Preto', masterGtin: null, evidence: null, priceCents: 11000, ...over,
  });
  check('obvio: titulo igual ao master, preco na faixa => sim', judgeObvio(ob())?.criterio === 'titulo_igual_ao_master' && judgeObvio(ob())?.value === 'sim');
  check('obvio: preco 1,31x a mediana NAO libera', judgeObvio(ob({ priceCents: 13100 })) == null);
  check('obvio: preco 0,76x a mediana NAO libera', judgeObvio(ob({ priceCents: 7600 })) == null);
  check('obvio: dispersao bimodal (grupo de preco separado) NAO libera', judgeObvio(ob({ understood: { medianaCents: 10000, bimodal: true } })) == null);
  check('obvio: titulo diferente do master NAO libera', judgeObvio(ob({ itemTitle: 'Filamento PLA Voolt3d 1kg 2.85mm Preto' })) == null);
  check('obvio: capacidade/numero diferente (825gb x 1tb) NAO libera', judgeObvio(ob({ itemTitle: 'Console PS5 825GB Digital', masterName: 'Console PS5 1TB Digital' })) == null);
  check('obvio: usado/open box no titulo NAO libera', judgeObvio(ob({ itemTitle: 'Filamento PLA Voolt3d 1kg 1.75mm Preto Open Box', masterName: 'Filamento PLA Voolt3d 1kg 1.75mm Preto Open Box' })) == null);
  check('obvio: regiao/edicao diferente no titulo NAO libera', judgeObvio(ob({ itemTitle: 'Jogo Hokko Life Switch Europeu', masterName: 'Jogo Hokko Life Switch Europeu' })) == null);
  check('obvio: item de cobertura (origem amazon/plus) NAO libera', judgeObvio(ob({ understood: { origem: 'amazon_cobertura', medianaCents: 10000 } })) == null);
  check('obvio: midia (digital x disco) nunca e automatica', judgeObvio(ob({ axis: 'midia', source: 'confianca', options: [{ value: 'digital', label: 'Digital', kind: 'escolha' }, NS, NE] })) == null);
  check('obvio: sem mediana no item NAO libera (nada e inferido)', judgeObvio(ob({ understood: {}, priceCents: null })) == null);
  const evNew = (attrs: Record<string, string>, over: Partial<MlEvidence> = {}): MlEvidence => ({ fonte: 'mercado_livre', via: 'items', itemId: 'MLB1', consultadoEm: '2026-11-12T00:00:00Z', httpStatus: 200, condition: 'new', variations: 0, attrs, ...over });
  check('obvio: GTIN da API igual ao do master (condicao nova) => sim por gtin_igual', judgeObvio(ob({ itemTitle: 'Fone JBL Wave Beam 2 Preto', masterName: 'Fone Ouvido Sem Fio Jbl Wave Beam 2 Preto Cancelamento de Ruido', masterGtin: '6925281999999', evidence: evNew({ GTIN: '6925281999999' }), priceCents: 14000 }))?.criterio === 'gtin_igual');
  check('obvio: GTIN diferente NAO libera por gtin', judgeObvio(ob({ itemTitle: 'Fone JBL Wave Beam 2', masterName: 'Fone Jbl Wave Beam 2 Preto', masterGtin: '6925281999999', evidence: evNew({ GTIN: '6925281000000' }), priceCents: 14000 })) == null);
  check('obvio: marca+modelo da API presentes no nome do master => sim', judgeObvio(ob({ itemTitle: 'Caixa de Som Portatil', masterName: 'Caixa Som Jbl Go 5 Bluetooth Portatil', evidence: evNew({ BRAND: 'JBL', MODEL: 'Go 5' }), priceCents: 15000 }))?.criterio === 'marca_modelo_coerentes');
  check('obvio: marca ok mas modelo fora do nome do master NAO libera', judgeObvio(ob({ itemTitle: 'Caixa de Som Portatil', masterName: 'Caixa Som Jbl Go 5 Bluetooth Portatil', evidence: evNew({ BRAND: 'JBL', MODEL: 'Flip 6' }), priceCents: 15000 })) == null);
  check('obvio: evidencia de condicao usada NAO libera pelo caminho do sim', judgeObvio(ob({ itemTitle: 'Caixa de Som', masterName: 'Caixa Som Jbl Go 5', evidence: evNew({ BRAND: 'JBL', MODEL: 'Go 5' }, { condition: 'used' }), priceCents: 15000 }))?.value !== 'sim');
  check('obvio: API diz USADO => "nao e este" (evidencia_api, reaproveita judgeEvidence)', (() => { const v = judgeObvio(ob({ itemTitle: 'Caixa de Som', masterName: 'Caixa Som', evidence: evNew({}, { condition: 'used' }) })); return v?.criterio === 'evidencia_api' && v.value === 'nao_e_este'; })());
}

class Rollback extends Error {}

async function parteB() {
  const OBp = await import('../src/server/identity-queue/owner-blocks');
  const pb = OBp.ownerBlocksFromRows([{ offer_id: 'a', draft: true, quar: false }, { offer_id: 'b', draft: false, quar: true }]);
  check('ownerBlocksFromRows separa rascunho e quarentena', pb.draft.has('a') && !pb.draft.has('b') && pb.quarantine.has('b') && !pb.quarantine.has('a'));
  console.log('--- B: banco (transacao revertida) ---');
  if (!process.env.DATABASE_URL) { console.log('DATABASE_URL ausente: parte B ignorada.'); return; }
  const { db } = await import('../src/lib/db');
  const Q = await import('../src/server/identity-queue/queue');
  const mig = fs.readFileSync(path.resolve(process.cwd(), 'drizzle/migrations/0042_fila_classificacao.sql'), 'utf8');
  const one = async (tx: any, q: any) => (await tx.execute(q))[0] as any;
  const rnd = Math.random().toString(36).slice(2, 8);
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql.raw(mig));
      const net = await one(tx, sql`SELECT id::text AS id FROM affiliate_networks LIMIT 1`);
      if (!net) throw new Error('sem affiliate_networks para o fixture');
      const admin = await one(tx, sql`SELECT id::text AS id FROM profiles LIMIT 1`);
      const uid: string | null = admin?.id ?? null;
      const mk = async (name: string, slug: string) =>
        (await one(tx, sql`INSERT INTO master_products (name, slug, product_type, game_platform_gen, vertical, attributes)
          VALUES (${name}, ${slug}, 'console', 'ps5', 'games', '{}'::jsonb) RETURNING id::text AS id`)).id as string;
      const mkOffer = async (mid: string, title: string, slug: string, price: number) =>
        (await one(tx, sql`INSERT INTO affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, current_price_cents, status, vertical)
          VALUES (${mid}::uuid, ${net.id}::uuid, ${title}, ${slug}, 'https://exemplo.invalido/x', ${price}, 'active', 'games') RETURNING id::text AS id`)).id as string;
      const st = async (oid: string) => (await one(tx, sql`SELECT master_product_id::text AS m, status::text AS s, quarantined_at AS q FROM affiliate_offers WHERE id = ${oid}::uuid`)) as { m: string; s: string; q: unknown };

      const mSlim = await mk(`Console PlayStation 5 Slim Digital TESTE ${rnd}`, `teste-fila-slim-${rnd}`);
      const mWrong = await mk(`Console PlayStation 5 TESTE ${rnd}`, `teste-fila-errado-${rnd}`);
      const t1 = `Console Sony PlayStation 5 Digital Lacrado ${rnd}`;
      const t2 = `${t1} Frete Gratis`;
      const t3 = `Console Sony PlayStation 5 Digital Outro Anuncio ${rnd}`;
      const o1 = await mkOffer(mWrong, t1, `teste-fila-o1-${rnd}`, 400000);
      const o2 = await mkOffer(mWrong, t2, `teste-fila-o2-${rnd}`, 410000);
      const o3 = await mkOffer(mWrong, t3, `teste-fila-o3-${rnd}`, 420000);

      const masters = [{ id: mSlim, name: 'Console PlayStation 5 Slim Digital', identityKey: 'ps5|slim|digital|br|avulso' }];
      const cand = (id: string, title: string) => consoleCandidate({ id, title, masterId: mWrong }, masters)!;

      // Geracao + idempotencia
      const g1 = await Q.generateQueue(tx, [cand(o1, t1), cand(o3, t3)]);
      check('geracao cria 2 itens a partir das incertezas', g1.criados === 2 && g1.autoResolvidos === 0, g1);
      const g1b = await Q.generateQueue(tx, [cand(o1, t1), cand(o3, t3)]);
      check('geracao e idempotente (segunda rodada nao cria nada)', g1b.criados === 0 && g1b.jaExistentes === 2, g1b);
      const pend = await Q.getPendingCards(tx, 100000);
      const it1 = pend.find((c) => c.offerId === o1)!;
      check('item pendente traz titulo, preco, opcoes e produto atual', !!it1 && it1.priceCents === 400000 && it1.options.length === 5 && it1.masterName != null, it1);
      const smoke = await Q.collectCandidates(tx);
      check('coleta de candidatos no banco real roda (somente leitura)', Array.isArray(smoke), smoke.length);

      // Aplicacao automatica (sem dono) e desfazer
      const rules0 = await Q.countRulesLearned(tx);
      const a1 = await Q.applyInTx(tx, { itemId: it1.id, value: 'slim', userId: null });
      check('decisao move a oferta para o master da identidade escolhida', a1.ok && (await st(o1)).m === mSlim, a1);
      check('recalculo dos masters tocados e enfileirado', (a1.recalc ?? []).includes(mSlim) && (a1.recalc ?? []).includes(mWrong), a1.recalc);
      const a1b = await Q.applyInTx(tx, { itemId: it1.id, value: 'slim', userId: null });
      check('reaplicar o mesmo item e idempotente (already)', a1b.ok && a1b.already === true && (await st(o1)).m === mSlim, a1b);
      await Q.undoInTx(tx, { decisionId: a1.decisionId!, userId: null });
      check('desfazer devolve a oferta ao master anterior', (await st(o1)).m === mWrong);
      const undoAgain = await Q.undoInTx(tx, { decisionId: a1.decisionId!, userId: null });
      check('desfazer duas vezes e idempotente', undoAgain.ok && undoAgain.already === true);
      check('apos desfazer o item volta a fila', (await Q.getPendingCards(tx, 100000)).some((c) => c.offerId === o1));

      // Decisao do dono vira regra (precisa de um perfil real para decided_by; sem perfil, so a parte sem regra roda)
      const a2 = await Q.applyInTx(tx, { itemId: it1.id, value: 'slim', userId: uid });
      check('dono decide e a oferta vai ao master Slim', a2.ok && !a2.already && (await st(o1)).m === mSlim, a2);
      const rules1 = await Q.countRulesLearned(tx);
      check('a decisao do dono vira regra aprendida (+1)', uid ? rules1 === rules0 + 1 : true, { rules0, rules1, uid: !!uid });

      // Aprendizado: titulo muito parecido e resolvido sozinho
      const g2 = await Q.generateQueue(tx, [cand(o2, t2)]);
      check('titulo parecido ja decidido e resolvido SEM perguntar (regra)', uid ? g2.autoResolvidos === 1 && (await st(o2)).m === mSlim : true, { g2 });
      check('item resolvido por regra nao aparece na fila', uid ? !(await Q.getPendingCards(tx, 100000)).some((c) => c.offerId === o2) : true);
      const rd = await one(tx, sql`SELECT kind, rule_source_id IS NOT NULL AS tem_origem FROM identity_decisions WHERE offer_id = ${o2}::uuid`);
      check('decisao automatica registra a regra de origem', !uid || (rd?.kind === 'auto_regra' && rd.tem_origem === true), rd);
      const o3item = (await Q.getPendingCards(tx, 100000)).find((c) => c.offerId === o3)!;
      check('titulo diferente continua na fila (nao coberto pela regra)', !!o3item);

      // Nao sei: nao vira regra e adia
      const ns = await Q.applyInTx(tx, { itemId: o3item.id, value: 'nao_sei', userId: uid });
      const rulesNs = await Q.countRulesLearned(tx);
      check('"nao sei" nao muda a oferta, nao vira regra e adia a pergunta', ns.ok && (await st(o3)).m === mWrong && rulesNs === rules1 && !(await Q.getPendingCards(tx, 100000)).some((c) => c.offerId === o3), { rulesNs, rules1 });

      // Nao e este produto: sai da media (draft) e fica visivel; desfazer restaura
      const t4 = `Console Sony PlayStation 5 Digital Kit Estranho ${rnd}`;
      const o4 = await mkOffer(mWrong, t4, `teste-fila-o4-${rnd}`, 430000);
      await Q.generateQueue(tx, [cand(o4, t4)]);
      const it4 = (await Q.getPendingCards(tx, 100000)).find((c) => c.offerId === o4)!;
      const ne = await Q.applyInTx(tx, { itemId: it4.id, value: 'nao_e_este', userId: uid });
      const s4 = await st(o4);
      check('"nao e este produto": oferta vai para rascunho (fora da media), sem apagar', ne.ok && s4.s === 'draft' && s4.m === mWrong, s4);
      await Q.undoInTx(tx, { decisionId: ne.decisionId!, userId: null });
      check('desfazer restaura o status anterior', (await st(o4)).s === 'active');

      // Preco implausivel: quarentena e desfazer
      const t5 = `Console Sony PlayStation 5 Digital Preco Absurdo ${rnd}`;
      const o5 = await mkOffer(mWrong, t5, `teste-fila-o5-${rnd}`, 200_000_000);
      const pc = dispersionCandidates({ id: mWrong, name: 'Console PlayStation 5 TESTE', vertical: 'games' }, [
        { id: o5, price: 200_000_000, title: t5 },
        ...[o1, o2, o3].map((id, i) => ({ id, price: 400000 + i * 1000, title: `x${i}` })),
      ]).filter((c) => c.offerId === o5);
      await Q.generateQueue(tx, pc);
      const it5 = (await Q.getPendingCards(tx, 100000)).find((c) => c.offerId === o5)!;
      check('preco implausivel entra na fila (eixo preco)', !!it5 && it5.axis === 'preco');
      const rulesBeforePrice = await Q.countRulesLearned(tx);
      const pe = await Q.applyInTx(tx, { itemId: it5.id, value: 'preco_errado', userId: uid });
      check('"preco errado" poe a oferta em quarentena (sai de toda leitura)', pe.ok && (await st(o5)).q != null);
      check('decisao de preco nao vira regra por titulo', (await Q.countRulesLearned(tx)) === rulesBeforePrice);
      await Q.undoInTx(tx, { decisionId: pe.decisionId!, userId: null });
      check('desfazer tira da quarentena', (await st(o5)).q == null);

      // Recalculo das metricas (codigo existente) roda sem erro sobre os masters tocados
      const nrec = await Q.recalcMasters(tx, [mSlim, mWrong]);
      check('recalculo dos masters tocados executa', nrec === 2, nrec);

      // Criar master quando nao existe a identidade escolhida (Pro) e nao duplicar na segunda oferta
      const t6 = `Console Sony PlayStation 5 Digital Para Troca ${rnd}`;
      const t7 = `Console Sony PlayStation 5 Digital Para Troca Tambem ${rnd}`;
      const o6 = await mkOffer(mWrong, t6, `teste-fila-o6-${rnd}`, 440000);
      const o7 = await mkOffer(mWrong, t7, `teste-fila-o7-${rnd}`, 450000);
      await Q.generateQueue(tx, [cand(o6, t6), cand(o7, t7)]);
      const cards = (await Q.getPendingCards(tx, 100000)).filter((c) => c.offerId === o6 || c.offerId === o7);
      const r6 = await Q.applyInTx(tx, { itemId: cards.find((c) => c.offerId === o6)!.id, value: 'pro', userId: uid });
      const r7 = await Q.applyInTx(tx, { itemId: cards.find((c) => c.offerId === o7)!.id, value: 'pro', userId: uid });
      const m6 = (await st(o6)).m;
      const m7 = (await st(o7)).m;
      check('identidade sem master: cria UM master e a segunda oferta cai no mesmo (sem duplicata)', r6.ok && r7.ok && m6 === m7 && m6 !== mWrong, { m6, m7 });

      // Desfazer decisao que CRIOU master: master vazio e arquivado (nao fica solto); escolher de novo o reativa
      const dec6 = await one(tx, sql`SELECT id::text AS id, created_master_id::text AS cm FROM identity_decisions WHERE offer_id = ${o6}::uuid AND undone_at IS NULL`);
      const dec7 = await one(tx, sql`SELECT id::text AS id FROM identity_decisions WHERE offer_id = ${o7}::uuid AND undone_at IS NULL`);
      const arch = async (id: string) => (await one(tx, sql`SELECT attributes->>'archived' AS a FROM master_products WHERE id = ${id}::uuid`))?.a;
      if (dec6?.cm || m6 !== mWrong) {
        const createdId = dec6?.cm ?? (await one(tx, sql`SELECT created_master_id::text AS cm FROM identity_decisions WHERE offer_id = ${o7}::uuid`))?.cm;
        await Q.undoInTx(tx, { decisionId: dec6.id, userId: null });
        check('desfazer com outra oferta ainda no master criado NAO arquiva', !createdId || (await arch(createdId)) == null);
        await Q.undoInTx(tx, { decisionId: dec7.id, userId: null });
        check('desfazer a ultima oferta do master criado arquiva o master vazio', !createdId || (await arch(createdId)) === 'true', createdId);
      }


      // ---- Casos OBVIOS: aplica com autor 'auto_obvio', registra o motivo, aparece na lista e desfaz ----
      {
        const mO = await mk(`Console PlayStation 5 TESTE OBVIO ${rnd}`, `teste-fila-obvio-${rnd}`);
        const tO = `Console PlayStation 5 TESTE OBVIO ${rnd}`;
        const oO = await mkOffer(mO, tO, `teste-fila-obvio-o-${rnd}`, 450000);
        await tx.execute(sql`INSERT INTO identity_review_items (offer_id, master_id, vertical, axis, source, reason, understood, options, title, title_norm)
          VALUES (${oO}::uuid, ${mO}::uuid, 'games', 'identidade', 'dispersao', 'Preco destoa do produto (fora da cerca de preco do produto).',
                  ${JSON.stringify({ medianaCents: 440000, precoCents: 450000, bimodal: false })}::jsonb,
                  ${JSON.stringify([{ value: 'sim', label: 'E este produto', kind: 'escolha' }, { value: 'nao_e_este', label: 'Nao e este', kind: 'nao_e_este' }, { value: 'nao_sei', label: 'Nao sei', kind: 'nao_sei' }])}::jsonb,
                  ${tO}, ${titleNorm(tO)})`);
        const sel = await Q.selectObvious(tx);
        const mine = sel.picks.find((p) => p.title === tO);
        check('obvio (banco): o item entra na selecao pelo criterio', mine?.criterio === 'titulo_igual_ao_master' && mine.value === 'sim', mine);
        const ap = await Q.applyInTx(tx, { itemId: mine!.itemId, value: mine!.value, userId: null, via: 'auto_obvio', reason: `${mine!.criterio}: ${mine!.motivo}` });
        const dr = await one(tx, sql`SELECT kind, decided_via, is_rule, decided_by IS NULL AS sem_autor, value_label FROM identity_decisions WHERE offer_id = ${oO}::uuid AND undone_at IS NULL`);
        check('obvio (banco): decisao gravada como auto_regra/auto_obvio, nunca regra, com o motivo', ap.ok && dr?.kind === 'auto_regra' && dr.decided_via === 'auto_obvio' && dr.is_rule === false && dr.sem_autor === true && String(dr.value_label).startsWith('Auto (óbvio): titulo_igual_ao_master'), dr);
        const lst = await Q.getAutoResolved(tx, 500);
        check('obvio (banco): aparece na lista de resolvidos automaticamente', lst.recentes.some((x) => x.decisionId === ap.decisionId), lst.total);
        check('obvio (banco): item resolvido sai da fila e nao e reselecionado', !(await Q.getPendingCards(tx, 100000)).some((c) => c.offerId === oO) && !(await Q.selectObvious(tx)).picks.some((p) => p.itemId === mine!.itemId));
        await Q.undoInTx(tx, { decisionId: ap.decisionId!, userId: null });
        check('obvio (banco): desfazer reabre o item e tira da lista', (await Q.getPendingCards(tx, 100000)).some((c) => c.offerId === oO) && !(await Q.getAutoResolved(tx, 500)).recentes.some((x) => x.decisionId === ap.decisionId));
        check('obvio (banco): item desfeito pelo dono NAO e refeito pelo automatico', !(await Q.selectObvious(tx)).picks.some((p) => p.itemId === mine!.itemId));
      }

      // Coleta nao desfaz decisao do dono (nao e este / preco errado)
      const OB = await import('../src/server/identity-queue/owner-blocks');
      const t8 = `Console Sony PlayStation 5 Digital Bloqueio ${rnd}`;
      const o8 = await mkOffer(mWrong, t8, `teste-fila-o8-${rnd}`, 460000);
      await Q.generateQueue(tx, [cand(o8, t8)]);
      const it8 = (await Q.getPendingCards(tx, 100000)).find((c) => c.offerId === o8)!;
      const ne8 = await Q.applyInTx(tx, { itemId: it8.id, value: 'nao_e_este', userId: uid });
      await tx.execute(sql`UPDATE affiliate_offers SET status = 'expired' WHERE id = ${o8}::uuid`);
      const b1 = await OB.loadOwnerBlocks(tx, [o8, o1]);
      check('coleta enxerga "nao e este" do dono (bloqueia reativacao expired->active)', uid ? b1.draft.has(o8) && !b1.draft.has(o1) : true, [...b1.draft]);
      await Q.undoInTx(tx, { decisionId: ne8.decisionId!, userId: null });
      check('desfazer restaura ate oferta que a coleta expirou, e libera o bloqueio', (await st(o8)).s === 'active' && !(await OB.loadOwnerBlocks(tx, [o8])).draft.has(o8), { st: await st(o8), ne8 });
      const pq = await Q.applyInTx(tx, { itemId: it5.id, value: 'preco_errado', userId: uid });
      check('coleta enxerga "preco errado" do dono (nao libera quarentena)', uid ? (await OB.loadOwnerBlocks(tx, [o5])).quarantine.has(o5) : true, pq);
      const sqlGuard = (await one(tx, sql`SELECT count(*)::int AS n FROM affiliate_offers WHERE id = ${o5}::uuid AND NOT EXISTS (SELECT 1 FROM identity_decisions d WHERE d.offer_id = affiliate_offers.id AND d.undone_at IS NULL AND d.axis = 'preco' AND d.value = 'preco_errado')`)).n;
      check('guarda SQL do coletor de verticais exclui oferta com "preco errado"', uid ? sqlGuard === 0 : true, sqlGuard);

      // Geracao automatica (cron): lock + limite de tempo
      const gp = await Q.generateQueue(tx, [cand(o6, t6)], { deadlineAt: Date.now() - 1 });
      check('limite de tempo vencido interrompe a geracao sem erro (parcial)', gp.parcial === true && gp.criados === 0, gp);

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) check('parte B sem excecao', false, e instanceof Error ? (e.stack ?? e.message) : e);
    else console.log('transacao revertida (nada gravado).');
  }
}

async function main() {
  parteA();
  await parteB();
  console.log(`\n${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
