/**
 * COFRE: testes de COMPORTAMENTO (QA R-67, 2ª validação). Chamam as funções e rotas de verdade, sem checar texto de código.
 *  - endpoint /api/ingest/cofre-simulacao (token, origem por rede, comprado recusado, limite por hora, piso de 30%, coupon_ref);
 *  - consultarCupom (G1): campanha e loja/categoria só saem com prova vigente;
 *  - vitrine: preço final derivado x simulação do mesmo cupom e veto;
 *  - leitor ML: classificação do modal e resolução dos cupons (descartar x sem cupom);
 *  - ingest do ML: desconto do rótulo x modal; guardião: "encerrado" só com prova (banco real, linha de teste removida no fim).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-cofre-integracao-123.ts
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { decidirPrecoFinalPrime, type Prova } from '../src/lib/coupons/cofre';
import { avaliarLinhaSimulacao, excedeLimite } from '../src/lib/coupons/simulacao';
import { selecionarProvados } from '../src/lib/coupons/prova-cupom';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date();
const min = (m: number) => new Date(now.getTime() - m * 60_000);

(async () => {
  // ------------------------------------------------------------------ endpoint (rota real)
  const { POST } = await import('../src/app/api/ingest/cofre-simulacao/route');
  const TOKEN = 'T'.repeat(40);
  const OFERTA = '00000000-0000-4000-8000-000000000001';
  const req = (over: { auth?: string | null; origin?: string; rows?: unknown[] } = {}) => new NextRequest('https://www.egeek86.com/api/ingest/cofre-simulacao', {
    method: 'POST',
    headers: { origin: over.origin ?? 'https://www.mercadolivre.com.br', ...(over.auth === null ? {} : { authorization: `Bearer ${over.auth ?? TOKEN}` }), 'content-type': 'application/json' },
    body: JSON.stringify({ rows: over.rows ?? [{ offer_id: OFERTA, coupon_ref: '12345', resultado: 'aplicado', valor_final_cents: 100 }] }),
  });
  const saved = { a: process.env.COUPON_INGEST_TOKEN, b: process.env.ASSISTED_INGEST_TOKEN, c: process.env.AMAZON_INGEST_TOKEN, s: process.env.SIMULACOES_POR_HORA };
  delete process.env.ASSISTED_INGEST_TOKEN; delete process.env.AMAZON_INGEST_TOKEN;
  delete process.env.COUPON_INGEST_TOKEN;
  ok((await POST(req())).status === 503, 'endpoint sem token configurado: 503 (kill-switch)');
  process.env.COUPON_INGEST_TOKEN = TOKEN;
  ok((await POST(req({ auth: null }))).status === 401, 'endpoint sem Authorization: 401');
  ok((await POST(req({ auth: 'errado'.repeat(8) }))).status === 401, 'endpoint com token errado: 401');
  ok((await POST(req({ origin: 'https://evil.example.com' }))).status === 403, 'endpoint com origem desconhecida: 403');
  const comprado = await POST(req({ rows: [{ offer_id: OFERTA, coupon_ref: '12345', resultado: 'comprado', valor_final_cents: 100 }] }));
  ok(comprado.status === 400, 'endpoint recusa resultado "comprado" (a simulação nunca compra): 400', comprado.status);
  process.env.SIMULACOES_POR_HORA = '1';
  const limite = await POST(req({ rows: [{ offer_id: OFERTA, coupon_ref: '12345', resultado: 'nao_aplicado' }, { offer_id: OFERTA, coupon_ref: '67890', resultado: 'nao_aplicado' }] }));
  ok(limite.status === 429, 'endpoint acima do limite por hora: 429 (nada gravado)', limite.status);
  // pura: piso, teto, referência, rede, resultado
  const base = { resultado: 'aplicado', valorFinalCents: 570000, couponRef: '12345', redeOferta: 'mercado-livre', redeAba: 'mercado-livre', precoOfertaCents: 599900, refExiste: true } as const;
  ok(avaliarLinhaSimulacao(base).ok, 'linha válida');
  ok(!avaliarLinhaSimulacao({ ...base, valorFinalCents: 100000 }).ok, 'piso de 30%: R$ 1.000 em R$ 5.999 recusado');
  ok(avaliarLinhaSimulacao({ ...base, valorFinalCents: 180000 }).ok, 'R$ 1.800 (30%) aceito');
  ok(!avaliarLinhaSimulacao({ ...base, valorFinalCents: 599900 }).ok && !avaliarLinhaSimulacao({ ...base, valorFinalCents: 700000 }).ok, 'valor final >= preço da oferta recusado');
  ok(!avaliarLinhaSimulacao({ ...base, valorFinalCents: undefined }).ok && !avaliarLinhaSimulacao({ ...base, valorFinalCents: 1.5 }).ok, 'valor final ausente ou fracionado recusado');
  ok(!avaliarLinhaSimulacao({ ...base, resultado: 'comprado' }).ok, 'resultado "comprado" recusado');
  ok(!avaliarLinhaSimulacao({ ...base, refExiste: false }).ok, 'coupon_ref inexistente na oferta recusado');
  ok(!avaliarLinhaSimulacao({ ...base, couponRef: 'sem_campanha', refExiste: false }).ok, '"sem_campanha" não vale no ML');
  ok(avaliarLinhaSimulacao({ ...base, couponRef: 'sem_campanha', refExiste: false, redeOferta: 'amazon', redeAba: 'amazon' }).ok, '"sem_campanha" vale na Amazon');
  ok(!avaliarLinhaSimulacao({ ...base, redeAba: 'amazon' }).ok, 'aba da Amazon não simula oferta do ML');
  ok(avaliarLinhaSimulacao({ ...base, resultado: 'nao_aplicado', valorFinalCents: undefined }).ok, 'nao_aplicado não exige valor');
  ok(excedeLimite(29, 2, 30) && !excedeLimite(29, 1, 30), 'limite por hora: 29 + 1 cabe, 29 + 2 não');
  Object.assign(process.env, { COUPON_INGEST_TOKEN: saved.a }); if (saved.a === undefined) delete process.env.COUPON_INGEST_TOKEN;
  if (saved.b !== undefined) process.env.ASSISTED_INGEST_TOKEN = saved.b; if (saved.c !== undefined) process.env.AMAZON_INGEST_TOKEN = saved.c;
  if (saved.s === undefined) delete process.env.SIMULACOES_POR_HORA; else process.env.SIMULACOES_POR_HORA = saved.s;

  // ------------------------------------------------------------------ G1: consultarCupom
  const { consultarCupom } = await import('../src/server/messaging/agente-cupons');
  const info = (verificadoMinAtras: number) => ({ code: 'CUPOM-X', conditions: 'c', expiresAt: null, verifiedAt: min(verificadoMinAtras).toISOString(), couponRef: 'ref' });
  const nunca = async () => null;
  const semAudit = async () => undefined;
  const reg: unknown[] = [];
  const dep = (over: Record<string, unknown>) => ({ item: nunca, campanha: nunca, lojaCategoria: nunca, audit: semAudit, redeDaOferta: async () => 'mercado-livre', registrar: async (x: unknown) => { reg.push(x); }, ...over });
  const camp = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ campanha: async () => info(60) }) as never);
  ok(camp?.source === 'campanha', 'G1: cupom de campanha confirmado há 1 h passa pelo cofre', camp);
  const campVelha = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ campanha: async () => info(25 * 60) }) as never);
  ok(campVelha === null, 'G1: cupom de campanha com prova de 25 h (TTL 24 h) é BARRADO', campVelha);
  const campSemData = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ campanha: async () => ({ ...info(1), verifiedAt: '' }) }) as never);
  ok(campSemData === null, 'G1: cupom de campanha sem data de verificação é barrado');
  const loja = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ lojaCategoria: async () => info(60) }) as never);
  ok(loja?.source === 'loja_categoria', 'G1: cupom de loja/categoria conferido há 1 h passa', loja);
  const lojaVelha = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ lojaCategoria: async () => info(130) }) as never);
  ok(lojaVelha === null, 'G1: cupom de loja/categoria com conferência de 130 min (TTL 120) é BARRADO', lojaVelha);
  const redeNova = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ lojaCategoria: async () => info(1), redeDaOferta: async () => 'rede-nova' }) as never);
  ok(redeNova === null, 'G1: rede sem validador não divulga cupom de loja/categoria', redeNova);
  const cai = await consultarCupom('00000000-0000-4000-8000-000000000002', dep({ campanha: async () => info(25 * 60), lojaCategoria: async () => info(10) }) as never);
  ok(cai?.source === 'loja_categoria', 'G1: campanha barrada cai para loja/categoria, que passa por si mesma', cai);
  ok(reg.length >= 5, 'G1: cada decisão do cofre é registrada (trilha)', reg.length);

  // ------------------------------------------------------------------ vitrine: preço final derivado x simulação
  const sim = (cents: number, extra: Partial<Prova> = {}): Prova => ({ tipo: 'simulacao_de_checkout', validadaEm: min(3), valorFinalCents: cents, ...extra });
  ok(!decidirPrecoFinalPrime({ finalDerivadoCents: 749900, confirmadoEm: min(1), simulacoes: [], now }).ok, 'vitrine: sem simulação o preço derivado não sai');
  ok(decidirPrecoFinalPrime({ finalDerivadoCents: 749900, confirmadoEm: min(1), simulacoes: [sim(749900)], now }).ok, 'vitrine: simulação com o mesmo valor libera');
  ok(!decidirPrecoFinalPrime({ finalDerivadoCents: 749900, confirmadoEm: min(1), simulacoes: [sim(700000)], now }).ok, 'vitrine: simulação de R$ 7.000 NÃO libera derivado de R$ 7.499');
  ok(decidirPrecoFinalPrime({ finalDerivadoCents: 749950, confirmadoEm: min(1), simulacoes: [sim(749900)], now }).ok, 'vitrine: diferença de R$ 0,50 aceita (arredondamento)');
  ok(!decidirPrecoFinalPrime({ finalDerivadoCents: 749900, confirmadoEm: min(1), simulacoes: [sim(749900), sim(0, { revogada: true, valorFinalCents: null })], now }).ok, 'vitrine: simulação revogada do mesmo cupom VETA');
  ok(!decidirPrecoFinalPrime({ finalDerivadoCents: 749900, confirmadoEm: min(1), simulacoes: [sim(749900, { validadaEm: min(31) })], now }).ok, 'vitrine: simulação de 31 min venceu');

  // ------------------------------------------------------------------ leitor ML (PURO exportado por require)
  const L = createRequire(import.meta.url)(`${process.cwd()}/public/loops/ml-cupons-item.js`) as {
    classificarModal: (c: string) => string; resolverCupons: (c: { label: string; campaign_id?: string }[], m: Record<string, unknown> | null) => { descarte: string | null; confirmados: unknown[] };
    cuponsDoModal: (c: string) => Record<string, unknown>;
  };
  const fx = (n: string) => fs.readFileSync(`scripts/fixtures/${n}`, 'utf8');
  ok(L.classificarModal(fx('ml-modal-sem-cupons.html')) === 'vazio_explicito', 'modal "Você não tem cupons disponíveis": negativo EXPLÍCITO');
  ok(L.classificarModal(fx('ml-modal-outra-campanha.html')) === 'cupons', 'modal com outra campanha: estrutura de cupons');
  ok(L.classificarModal(fx('ml-modal-erro.html')) === 'inconclusivo', 'modal 200 com HTML de erro: INCONCLUSIVO');
  ok(L.classificarModal('') === 'inconclusivo' && L.classificarModal('   ') === 'inconclusivo', 'modal vazio: INCONCLUSIVO');
  const rc = (c: { label: string; campaign_id?: string }[], m: Record<string, unknown> | null) => L.resolverCupons(c, m);
  ok(rc([{ label: 'R$ 5.799 com Cupom' }], null).descarte === 'cupom_sem_campanha' && rc([{ label: 'R$ 5.799 com Cupom' }], {}).descarte === 'cupom_sem_campanha', 'N2: rótulo sem campaign_id e nada confirmado: DESCARTA a leitura (não é "sem cupom")');
  ok(rc([{ label: 'R$ 1.709 com Cupom', campaign_id: '987654' }], null).descarte === 'modal_inconclusivo', 'modal não consultado/inconclusivo: DESCARTA (não derruba cupom real)');
  const vazio = rc([{ label: 'R$ 1.709 com Cupom', campaign_id: '987654' }], {});
  ok(vazio.descarte === null && vazio.confirmados.length === 0, 'modal que disse explicitamente "sem cupons": leitura sem cupom (o único caso negativo)', vazio);
  const outra = rc([{ label: 'R$ 1.709 com Cupom', campaign_id: '987654' }], L.cuponsDoModal(fx('ml-modal-outra-campanha.html')));
  ok(outra.descarte === null && outra.confirmados.length === 0, 'modal com OUTRA campanha: o cupom do carrossel não é confirmado');
  ok(rc([], null).descarte === null && rc([], null).confirmados.length === 0, 'página sem cupom nenhum: leitura sem cupom normal');
  const bom = rc([{ label: 'R$ 5.799 com Cupom', campaign_id: '111222' }], { '111222': { name: 'R$ 200 OFF em Impressoras' } });
  ok(bom.confirmados.length === 1, 'campanha presente no modal do mesmo item: confirmada');

  // ------------------------------------------------------------------ ingest do ML: desconto do rótulo x modal (N4)
  const leitura = (cents: number, name: string, status = 'confirmado_modal', campaign: string | null = '111222') => ({ campaign, status, name, cents, label: 'x' });
  ok(selecionarProvados([leitura(579900, 'R$ 200 OFF em Impressoras')], 599900).length === 1, 'ingest: R$ 200 confere com "R$ 200 OFF"');
  ok(selecionarProvados([leitura(170900, 'R$ 50 OFF em Casa')], 229900).length === 0, 'ingest: "R$ 590" calculado não confere com "R$ 50 OFF": vira sem prova');
  ok(selecionarProvados([leitura(579900, 'R$ 200 OFF em Impressoras', 'lido_na_pagina')], 599900).length === 0, 'ingest: sem confirmado_modal: sem prova');
  ok(selecionarProvados([leitura(579900, 'x', 'confirmado_modal', null)], 599900).length === 0, 'ingest: sem campaign_id: sem prova');
  ok(selecionarProvados([leitura(579900, 'x', 'lido_na_pagina', null)], 599900, false).length === 1, 'ingest: flag CUPOM_ML_PROVA=0 volta ao antigo');

  // ------------------------------------------------------------------ guardião: "encerrado" só com prova (banco real; linhas de teste removidas no fim)
  const { connect } = await import('./_dup-shared');
  const sql = connect();
  const { dbGuardiaoStore } = await import('../src/server/messaging/guardiao-cupons');
  const refs: string[] = [];
  const validRefs: string[] = [];
  try {
    const [of] = await sql`SELECT o.id::text AS id, o.vertical FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre' WHERE o.status = 'active' LIMIT 1`;
    const novoAviso = async (): Promise<string> => {
      const ref = crypto.randomUUID(); refs.push(ref);
      const [a] = await sql`INSERT INTO coupon_announcements (network_slug, kind, coupon_ref, label, offer_id, vertical) VALUES ('mercado-livre', 'anuncio', ${ref}, 'TESTE QA cofre', ${of.id}::uuid, ${of.vertical}) RETURNING id::text AS id`;
      return a.id;
    };
    const fim = async (id: string) => (await sql`SELECT end_reason FROM coupon_announcements WHERE id = ${id}::uuid`)[0]!.end_reason as string;
    const ja = await sql`SELECT count(*)::int AS n FROM coupon_validations WHERE offer_id = ${of.id}::uuid`;
    if (ja[0]!.n > 0) console.log('(aviso) a oferta escolhida já tem linhas no cofre; o caso "nunca provado" pode ser mascarado');
    // 1) nunca provado => silêncio
    const a1 = await novoAviso();
    await dbGuardiaoStore.end(a1, 'sumiu_da_pagina', new Date());
    const r1 = await fim(a1);
    // 2) só simulação que NÃO aplicou (linha revogada) não conta como prova
    const refSim = `teste-qa-${Date.now()}`; validRefs.push(refSim);
    await sql`INSERT INTO coupon_validations (offer_id, coupon_ref, kind, network_slug, proof_type, state, motivo, validated_at, expires_at) VALUES (${of.id}::uuid, ${'sim:' + refSim}, 'cupom', 'mercado-livre', 'simulacao_de_checkout', 'revogado', 'simulacao_nao_aplicou', now(), now() + interval '30 minutes')`;
    const a2 = await novoAviso();
    await dbGuardiaoStore.end(a2, 'sumiu_da_pagina', new Date());
    const r2 = await fim(a2);
    // 3) teve prova (divulgável) => segue o fluxo normal (card)
    const refProva = `teste-qa-ok-${Date.now()}`; validRefs.push(refProva);
    await sql`INSERT INTO coupon_validations (offer_id, coupon_ref, kind, network_slug, proof_type, state, validated_at, expires_at) VALUES (${of.id}::uuid, ${refProva}, 'cupom', 'mercado-livre', 'modal_oficial_do_item', 'divulgavel', now(), now() + interval '10 minutes')`;
    const a3 = await novoAviso();
    await dbGuardiaoStore.end(a3, 'sumiu_da_pagina', new Date());
    const r3 = await fim(a3);
    ok(r1 === 'nunca_provado' || ja[0]!.n > 0, 'guardião: cupom NUNCA provado fecha em silêncio (nunca_provado)', r1);
    ok(r2 === 'nunca_provado', 'guardião: só simulação "não aplicada" NÃO conta como prova (fecha em silêncio)', r2);
    ok(r3 === 'sumiu_da_pagina', 'guardião: cupom que teve prova segue o fluxo do card de encerrado', r3);
  } finally {
    for (const r of refs) await sql`DELETE FROM coupon_announcements WHERE coupon_ref = ${r}`.catch(() => undefined);
    for (const r of validRefs) await sql`DELETE FROM coupon_validations WHERE coupon_ref IN (${r}, ${'sim:' + r})`.catch(() => undefined);
    await sql.end();
  }

  console.log(fails ? `${fails} falha(s)` : 'OK: cofre, testes de comportamento');
  process.exit(fails ? 1 : 0);
})();
