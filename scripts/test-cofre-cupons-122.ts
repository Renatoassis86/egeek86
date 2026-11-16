/**
 * COFRE DE VALIDAÇÃO OBRIGATÓRIA (R-64 a R-67). Puro; com --db também falha se existir rede ATIVA sem validador registrado.
 * Uso: npx tsx --env-file=.env.local scripts/test-cofre-cupons-122.ts [--db]
 */
import { podeDivulgar, provaDoBeneficio, provaDoCupomAmazon, provaDoCupomMl, redesSemValidador, TTL_PROVA_MIN, VALIDADORES, type Prova } from '../src/lib/coupons/cofre';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-16T02:00:00Z');
const min = (m: number) => new Date(now.getTime() - m * 60_000);
const ped = (over: Partial<Parameters<typeof podeDivulgar>[0]>) => ({ rede: 'mercado-livre', tipoItem: 'cupom' as const, uso: 'mensagem' as const, provas: [] as Prova[], now, ...over });

// Padrão NEGADO
ok(podeDivulgar(ped({ rede: 'rede-nova' })).motivo === 'rede_sem_validador', 'rede nova sem validador: bloqueada');
ok(podeDivulgar(ped({ rede: 'shopee', tipoItem: 'beneficio', provas: [{ tipo: 'bloco_de_compra_escopado', validadaEm: min(1) }] })).motivo === 'tipo_sem_validador', 'tipo novo sem validador (benefício na Shopee): bloqueado');
ok(podeDivulgar(ped({})).motivo === 'sem_prova', 'sem prova: bloqueado');
ok(podeDivulgar(ped({ provas: [{ tipo: 'bloco_de_compra_escopado', validadaEm: min(1) }] })).motivo === 'prova_de_tipo_nao_aceito_pela_rede', 'ML não aceita prova de bloco de compra para cupom');

// O caso real: P1S/NIC.3D (sem campanha, sem modal)
ok(provaDoCupomMl({ campaignId: null, status: 'lido_na_pagina', readAt: min(13) }).length === 0, 'P1S/NIC.3D: leitura sem campanha não gera prova');
ok(!podeDivulgar(ped({ provas: provaDoCupomMl({ campaignId: null, status: 'lido_na_pagina', readAt: min(13) }) })).ok, 'P1S/NIC.3D barrado');
// ML com prova
const mlOk = podeDivulgar(ped({ provas: provaDoCupomMl({ campaignId: '12345', status: 'confirmado_modal', readAt: min(2) }) }));
ok(mlOk.ok && mlOk.estado === 'divulgavel' && !!mlOk.expiraEm, 'ML com campanha + modal + 2 min: divulgável', mlOk);
const mlRev = podeDivulgar(ped({ provas: provaDoCupomMl({ campaignId: '12345', status: 'confirmado_modal', readAt: min(7) }) }));
ok(mlRev.ok && mlRev.estado === 'revalidando', 'passou da metade do TTL (5 de 10 min): revalidando, ainda divulgável', mlRev);
const mlVenc = podeDivulgar(ped({ provas: provaDoCupomMl({ campaignId: '12345', status: 'confirmado_modal', readAt: min(11) }) }));
ok(!mlVenc.ok && mlVenc.estado === 'revogado' && mlVenc.motivo === 'prova_vencida', 'TTL de 10 min vencido: revogado', mlVenc);
ok(TTL_PROVA_MIN.modal_oficial_do_item === 10 && TTL_PROVA_MIN.simulacao_de_checkout === 30 && TTL_PROVA_MIN.bloco_de_compra_escopado === 120, 'TTL por tipo de prova');
ok(podeDivulgar(ped({ provas: [{ tipo: 'modal_oficial_do_item', validadaEm: min(1), revogada: true }] })).motivo === 'prova_revogada', 'prova revogada por leitura mais nova: barrado');

// Amazon: bloco de compra escopado
ok(podeDivulgar(ped({ rede: 'amazon', provas: provaDoCupomAmazon({ verificado: true, readAt: min(30) }) })).ok, 'Amazon: selo verificado no bloco de compra, 30 min: divulgável');
ok(!podeDivulgar(ped({ rede: 'amazon', provas: provaDoCupomAmazon({ verificado: false, readAt: min(1) }) })).ok, 'Amazon: selo não verificado: barrado');
ok(podeDivulgar(ped({ rede: 'amazon', provas: provaDoCupomAmazon({ verificado: true, readAt: min(121) }) })).motivo === 'prova_vencida', 'Amazon: 121 min vence');

// Benefício de cartão: a página imprime = bloco de compra; % de cartão = nenhuma prova
const kinds: [string, boolean][] = [['parcelas', true], ['preco_a_vista', true], ['cartao_pct', false], ['pix_pct', false], ['cashback', false]];
for (const [k, esperado] of kinds) ok(podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'card', provas: provaDoBeneficio({ kind: k, lastSeenAt: min(5) }), now }).ok === esperado, `benefício ${k}: ${esperado ? 'sai' : 'barrado'}`);
// PREÇO FINAL: só prova de valor final ("Itaú 15%" -> R$ 6.716 nunca)
const blocoSo: Prova[] = [{ tipo: 'bloco_de_compra_escopado', validadaEm: min(1) }];
ok(podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'preco_final', provas: blocoSo, now }).motivo === 'preco_final_sem_prova_de_valor', 'preço final sem prova de valor: barrado (Itaú 15% -> R$ 6.716,00)');
ok(podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'mensagem', valorFinalDito: 671600, provas: blocoSo, now }).motivo === 'preco_final_sem_prova_de_valor', 'valor final dito sem prova de valor: barrado');
const sim: Prova[] = [{ tipo: 'simulacao_de_checkout', validadaEm: min(5), valorFinalCents: 770000 }];
ok(podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'preco_final', provas: sim, now }).ok, 'simulação de checkout sustenta o preço final');
ok(podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'mensagem', valorFinalDito: 671600, provas: sim, now }).motivo === 'valor_dito_diverge_do_provado', 'valor dito diverge do simulado: barrado');
ok(podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'mensagem', valorFinalDito: 770001, provas: sim, now }).ok, 'tolerância de R$ 0,02');
ok(!podeDivulgar({ rede: 'amazon', tipoItem: 'beneficio', uso: 'preco_final', provas: [{ tipo: 'simulacao_de_checkout', validadaEm: min(31), valorFinalCents: 770000 }], now }).ok, 'simulação de 31 min vence (TTL 30)');
ok(podeDivulgar(ped({ provas: [{ tipo: 'simulacao_de_checkout', validadaEm: min(20) }] })).ok, 'simulação libera cupom do ML mesmo sem modal');

// Registro: toda rede com validador tem leitor; cobertura
ok(VALIDADORES.every((v) => v.leitor.length > 3 && Object.values(v.aceita).every((a) => !a || a.length > 0)), 'todo validador registrado tem leitor e tipos aceitos');
ok(redesSemValidador(['mercado-livre', 'amazon', 'shopee']).length === 0 && redesSemValidador(['mercado-livre', 'rede-x']).join() === 'rede-x', 'redesSemValidador aponta a rede sem registro');

(async () => {
  if (process.argv.includes('--db')) {
    const { connect } = await import('./_dup-shared');
    const sql = connect();
    try {
      const redes = (await sql`SELECT DISTINCT n.slug FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active'`).map((r) => String(r.slug));
      const sem = redesSemValidador(redes);
      ok(sem.length === 0, `existe rede ATIVA sem validador registrado: ${sem.join(', ')} (registre em src/lib/coupons/cofre.ts, VALIDADORES)`);
      console.log('redes ativas:', redes.join(', '));
    } finally { await sql.end(); }
  }
  console.log(fails ? `${fails} falha(s)` : 'OK: cofre de validação obrigatória');
  process.exit(fails ? 1 : 0);
})();
