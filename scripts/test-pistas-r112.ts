// R-112 (pistas autonomas, Fase 1, sombra): admissao pura, cotas piso/teto, tipo, marca, repeticao, gates, contadores e paridade. Sem banco, sem rede.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { admitir, canaisSombra, gatesInegociaveis, horaBucket, pistaConfig, type EntradaAdmissao, type MasterPista } from '../src/lib/pistas/admissao';
import { ContadoresMem } from '../src/lib/pistas/contadores-mem';
import { resumoParidade, veredito } from './pista-paridade';
import type { SentRecord } from '../src/lib/messaging/group-rules';

const agora = new Date('2026-11-20T12:30:00.000Z');
const minAtras = (m: number) => new Date(agora.getTime() - m * 60_000).toISOString();
const LINK_ML = 'https://produto.mercadolivre.com.br/MLB-123?matt_tool=23952458';
const LINK_AMZ = 'https://www.amazon.com.br/dp/B0TESTE123?tag=manusmonteiro-20';

function master(o: Partial<MasterPista> = {}): MasterPista {
  return {
    masterProductId: 'm1', vertical: 'livros', name: 'Livro Teste de Programacao', priceCents: 5000, trigger: 'OK1', offerIds: ['o1'], networkSlug: 'mercado-livre',
    held: false, dropPct: 10, belowAvgPct: 12, sendable: true, notSendableReason: null, status: 'auto', confirmedAt: minAtras(5), cls: 'alerta',
    ofertaViva: true, affiliateUrl: LINK_ML, affiliateLinkPending: false, ...o,
  };
}
const est = (canalHora = 0, tipoHora = 0, marcaHora = 0) => ({ canalHora, tipoHora, marcaHora });
function entrada(o: Partial<EntradaAdmissao> & { m?: Partial<MasterPista> } = {}): EntradaAdmissao {
  return { canal: 'livros', tipo: 'livro-programacao', marca: null, master: master(o.m), agora, estado: est(), historico: [], config: pistaConfig({}), ...o, ...(o.m ? { master: master(o.m) } : {}) } as EntradaAdmissao;
}

// --- config e flag
const cfg = pistaConfig({});
assert.equal(cfg.pisoHora, 12); assert.equal(cfg.tetoHora, 30); assert.equal(cfg.marcaHora, 3);
assert.deepEqual([cfg.pisoHora, cfg.tetoHora], [12, 30]);
const cfg2 = pistaConfig({ PISTA_PISO_HORA: '8', PISTA_TETO_HORA: '20' });
assert.deepEqual([cfg2.pisoHora, cfg2.tetoHora], [8, 20]);
assert.equal(pistaConfig({ PISTA_PISO_HORA: '40', PISTA_TETO_HORA: '10' }).tetoHora, 40, 'teto nunca abaixo do piso');
assert.equal(pistaConfig({ PISTA_PISO_HORA: 'x' }).pisoHora, 12);
assert.deepEqual(canaisSombra({}), []); assert.deepEqual(canaisSombra({ PISTA_SOMBRA: 'off' }), []);
assert.deepEqual(canaisSombra({ PISTA_SOMBRA: 'livros, impressao3d' }), ['livros', 'impressao3d']);
assert.equal(horaBucket(agora).toISOString(), '2026-11-20T12:00:00.000Z');

// --- caminho feliz: piso
let r = admitir(entrada());
assert.equal(r.decisao, 'enviaria'); assert.equal(r.faixa, 'piso'); assert.equal(r.motivo, 'ok_piso_do_canal');

// --- gates inegociaveis (cada um barra e nomeia o motivo)
const barra = (m: Partial<MasterPista>) => admitir(entrada({ m })).motivo;
assert.match(barra({ trigger: 'RADAR' }), /sem_produto_unico/);
assert.match(barra({ masterProductId: '' }), /sem_produto_unico/);
assert.match(barra({ condicaoNova: false }), /condicao_nao_nova/);
assert.match(barra({ ofertaViva: false }), /oferta_inativa/);
assert.match(barra({ held: true }), /preco_isca/);
assert.match(barra({ dropPct: 65 }), /preco_isca/);
assert.match(barra({ belowAvgPct: 70 }), /preco_isca/);
assert.match(barra({ sendable: false, notSendableReason: 'sem_estoque' }), /nao_enviavel_sem_estoque/);
assert.match(barra({ status: 'review' }), /exige_revisao/);
// preco fresco R-81/R-101
assert.match(barra({ confirmedAt: minAtras(61), networkSlug: 'amazon', affiliateUrl: LINK_AMZ }), /preco_velho_61min_acima_de_/);
assert.match(gatesInegociaveis(entrada({ m: { confirmedAt: minAtras(61) } })) ?? '', /preco_velho_61min_acima_de_60/, 'o gate puro continua nomeando o preco velho');
// preco velho NA PROPOSTA (ML/Shopee): o envio real reconfere ao vivo; a admissao libera so com exigeConfirmacao (nunca preco velho dito)
r = admitir(entrada({ m: { confirmedAt: minAtras(68) } }));
assert.equal(r.decisao, 'enviaria'); assert.equal(r.exigeConfirmacao, true); assert.match(r.motivo, /^ok_apos_confirmacao_de_preco_68min_piso$/);
assert.equal(admitir(entrada({ m: { confirmedAt: minAtras(5) } })).exigeConfirmacao, undefined);
assert.match(admitir(entrada({ m: { confirmedAt: minAtras(68), held: true } })).motivo, /preco_isca/, 'preco velho nao abre porta para isca');
assert.match(admitir(entrada({ m: { confirmedAt: minAtras(68), affiliateUrl: null } })).motivo, /sem_link_de_afiliado/, 'nem para link fora do padrao (R-70)');
assert.equal(barra({ confirmedAt: minAtras(59) }), 'ok_piso_do_canal');
assert.match(barra({ confirmedAt: '' }), /sem_prova_de_preco_fresco/);
assert.match(barra({ networkSlug: 'amazon', affiliateUrl: LINK_AMZ, confirmedAt: minAtras(75) }), /preco_velho/);
assert.equal(barra({ networkSlug: 'amazon', affiliateUrl: LINK_AMZ, confirmedAt: minAtras(30) }), 'ok_piso_do_canal');
// R-70: link do dono
assert.match(barra({ affiliateUrl: null }), /sem_link_de_afiliado_valido/);
assert.match(barra({ affiliateUrl: 'https://produto.mercadolivre.com.br/MLB-123?matt_tool=999' }), /sem_link_de_afiliado/);
assert.match(barra({ networkSlug: 'amazon', affiliateUrl: 'https://www.amazon.com.br/dp/B0TESTE123?tag=alheia-20' }), /sem_link_de_afiliado/);
assert.match(barra({ affiliateLinkPending: true }), /sem_link_de_afiliado/);
assert.match(barra({ networkSlug: 'rede-sem-padrao', affiliateUrl: 'https://exemplo.com/x' }), /sem_link_de_afiliado/);
// item barrado (nao ofertavel) e fora de linha
assert.match(barra({ vertical: 'esporte', name: 'Coldre Tatico Pistola' }), /item_barrado/);
assert.match(barra({ vertical: 'games', platformLabel: 'Xbox 360', name: 'Jogo Teste' }), /fora_de_linha/);
// gates nunca dependem de vaga: mesmo com canal vazio, barrado continua barrado
assert.equal(gatesInegociaveis({ master: master({ held: true }), agora, config: cfg }), 'preco_isca_suspeito');
assert.equal(gatesInegociaveis({ master: master(), agora, config: cfg }), null);

// --- repeticao do master (>= 24 h)
const envio = (min: number, price: number, extra: Partial<SentRecord> = {}): SentRecord => ({ masterProductId: 'm1', priceCents: price, sentAt: new Date(agora.getTime() - min * 60_000), trigger: 'OK1', vertical: 'livros', ...extra });
assert.match(admitir(entrada({ historico: [envio(23 * 60, 5000)] })).motivo, /master_repetido_sem_novidade_/, 'repetido em 23 h sem novidade');
assert.equal(admitir(entrada({ historico: [envio(23 * 60, 5000)] })).decisao, 'descartaria');
assert.equal(admitir(entrada({ historico: [envio(23 * 60, 5200)] })).decisao, 'enviaria', 'queda >= 2% e novidade');
assert.equal(admitir(entrada({ historico: [envio(23 * 60, 6100)] })).decisao, 'enviaria', 'queda >= R$ 10 e novidade');
assert.equal(admitir(entrada({ historico: [envio(30 * 60, 5000)] })).decisao, 'descartaria', 'a janela padrao do projeto (72 h) vale; nunca menos de 24 h');
assert.equal(admitir(entrada({ historico: [envio(80 * 60, 5000)] })).decisao, 'enviaria', 'passou da janela');
assert.equal(admitir(entrada({ historico: [envio(2 * 60, 5000)], config: pistaConfig({ GROUP_MASTER_REPEAT_SEM_NOVIDADE_H: 'off' }) })).decisao, 'descartaria', 'repeticao desligada no env nao baixa de 24 h na pista');
assert.equal(admitir(entrada({ historico: [{ ...envio(60, 5000), masterProductId: 'outro' }] })).decisao, 'enviaria');
assert.match(admitir(entrada({ m: { confirmedAt: minAtras(68) }, historico: [envio(60, 5000)] })).motivo, /master_repetido/, 'preco velho confirmado nao fura a repeticao');

// --- vaga por tipo: TIPO_MAX_PER_HOUR (2) e teto especial R-106
assert.equal(admitir(entrada({ estado: est(1, 1) })).decisao, 'enviaria');
assert.match(admitir(entrada({ m: { trigger: 'G2' }, estado: est(2, 2) })).motivo, /teto_tipo_livro-programacao_2_por_hora/);
assert.equal(admitir(entrada({ estado: est(2, 2) })).decisao, 'enviaria', 'OK1 (novo minimo) e isento da cota de tipo, como no envio real');
assert.equal(admitir(entrada({ m: { trigger: 'G2', regua: { degrau: 4 } as never }, estado: est(2, 2) })).decisao, 'enviaria', 'degrau 4 da regua e isento');
assert.equal(admitir(entrada({ tipo: null, estado: est(2, 9) })).decisao, 'enviaria', 'sem tipo (games) nao tem vaga por tipo');
assert.match(admitir(entrada({ canal: 'tecnologia', tipo: 'mouse', m: { vertical: 'tecnologia', name: 'Mouse Gamer' }, estado: est(4, 5) })).motivo, /teto_tipo_mouse_5_por_hora/);
assert.equal(admitir(entrada({ canal: 'tecnologia', tipo: 'mouse', m: { vertical: 'tecnologia', name: 'Mouse Gamer' }, estado: est(4, 4) })).decisao, 'enviaria');
assert.match(admitir(entrada({ canal: 'esporte', tipo: 'bola', m: { vertical: 'esporte', name: 'Bola de Futebol Campo' }, estado: est(3, 2) })).motivo, /teto_tipo_bola_2_por_hora/);
assert.equal(admitir(entrada({ estado: est(1, 1), config: pistaConfig({ GROUP_TIPO_POR_HORA: '4' }) })).decisao, 'enviaria');

// --- R-112 ajuste (2026-11-20): a cota por tipo espelha o envio real. Os 4 casos de Livros medidos em 3 h (rpg 19:16 G2 e AC; repeticao por decisao simulada).
{
  const rpg = { tipo: 'rpg', m: { trigger: 'G2', name: 'Old Dragon 2 - Tu1' } as Partial<MasterPista> };
  // cota SUAVE (G2 com 2 do tipo na hora): sem alternativa de outro tipo na fila o envio real nao segura; com alternativa segura
  assert.equal(admitir(entrada({ ...rpg, estado: est(3, 3), alternativaOutroTipo: false })).decisao, 'enviaria', 'caso Livros: G2 rpg sem alternativa sai');
  assert.match(admitir(entrada({ ...rpg, estado: est(3, 3), alternativaOutroTipo: true })).motivo, /teto_tipo_rpg_2_por_hora/);
  assert.match(admitir(entrada({ ...rpg, estado: est(3, 3) })).motivo, /teto_tipo_rpg_2_por_hora/, 'sem informacao de fila: conservador');
  // achado (AC): teto DURO adaptativo (piso 3, share 30% de max(20, volume/24) = 6), nao 2
  const ac = { tipo: 'rpg', m: { trigger: 'AC', cls: 'insight', name: 'Pathfinder 2 Escudo' } as Partial<MasterPista> };
  assert.equal(admitir(entrada({ ...ac, estado: est(3, 3), alternativaOutroTipo: true })).decisao, 'descartaria', 'AC acima do limite adaptativo 6 nao ha: 3 < 6 mas a cota suave segura com alternativa');
  assert.equal(admitir(entrada({ ...ac, estado: est(3, 3), alternativaOutroTipo: false })).decisao, 'enviaria', 'caso Livros: AC rpg (3 na hora < 6) sem alternativa sai');
  assert.match(admitir(entrada({ ...ac, estado: est(7, 6), alternativaOutroTipo: false })).motivo, /teto_tipo_rpg_achado_6_por_hora/, 'o teto do achado e duro, com ou sem alternativa');
  assert.match(admitir(entrada({ ...ac, estado: est(13, 13), alternativaOutroTipo: false, volume24h: 1000 })).motivo, /teto_tipo_rpg_achado_13_por_hora/, 'volume alto da loja sobe o teto (30% de 41,7 = 13)');
  // repeticao: so a decisao SIMULADA de outra proposta do mesmo master e "coberto" (a pista ja teria enviado); envio real continua repeticao
  const sim = { ...envio(20, 5000), simulado: true };
  assert.match(admitir(entrada({ historico: [sim] })).motivo, /^coberto_pela_pista_master_repetido_sem_novidade_\d+h/);
  assert.equal(admitir(entrada({ historico: [sim] })).decisao, 'descartaria');
  assert.match(admitir(entrada({ historico: [envio(20, 5000)] })).motivo, /^master_repetido_sem_novidade_\d+h/, 'envio real nunca vira coberto');
  assert.match(admitir(entrada({ historico: [sim, envio(20, 5000)] })).motivo, /^master_repetido/, 'real + simulado: vale o real');
  assert.equal(admitir(entrada({ historico: [{ ...sim, priceCents: 5000 }], m: { priceCents: 4000 } })).decisao, 'enviaria', 'novidade de preco continua valendo');
}

// --- teto por marca
assert.match(admitir(entrada({ marca: 'novatec', estado: est(3, 0, 3) })).motivo, /teto_marca_novatec_3_por_hora/);
assert.equal(admitir(entrada({ marca: 'novatec', estado: est(3, 0, 2) })).decisao, 'enviaria');
assert.equal(admitir(entrada({ marca: null, estado: est(3, 0, 99) })).decisao, 'enviaria', 'sem marca nao ha teto de marca');

// --- cota do canal: piso garante vaga, sobra so com oferta fresca, teto fecha
r = admitir(entrada({ estado: est(11, 0) }));
assert.equal(r.faixa, 'piso'); assert.equal(r.cotaUsada, 11);
r = admitir(entrada({ estado: est(12, 0), m: { confirmedAt: minAtras(10) } }));
assert.equal(r.decisao, 'enviaria'); assert.equal(r.faixa, 'sobra'); assert.equal(r.motivo, 'ok_sobra_oferta_fresca');
r = admitir(entrada({ estado: est(12, 0), m: { confirmedAt: minAtras(40) } }));
assert.equal(r.decisao, 'descartaria'); assert.match(r.motivo, /acima_do_piso_sem_oferta_fresca_40min/);
r = admitir(entrada({ estado: est(29, 0), m: { confirmedAt: minAtras(3) } }));
assert.equal(r.decisao, 'enviaria');
r = admitir(entrada({ estado: est(30, 0), m: { confirmedAt: minAtras(1) } }));
assert.equal(r.decisao, 'descartaria'); assert.equal(r.motivo, 'teto_canal_30_por_hora');
// piso/teto configuraveis
assert.equal(admitir(entrada({ estado: est(7, 0), config: pistaConfig({ PISTA_PISO_HORA: '8', PISTA_TETO_HORA: '9' }) })).faixa, 'piso');
assert.equal(admitir(entrada({ estado: est(9, 0), config: pistaConfig({ PISTA_PISO_HORA: '8', PISTA_TETO_HORA: '9' }) })).motivo, 'teto_canal_9_por_hora');
// o piso NAO fura os gates: sem vaga ocupada mas isca continua barrada
assert.equal(admitir(entrada({ estado: est(0, 0), m: { held: true } })).decisao, 'descartaria');
// o piso NAO fura a repeticao
assert.equal(admitir(entrada({ estado: est(0, 0), historico: [envio(60, 5000)] })).decisao, 'descartaria');

// --- contadores em memoria: atomicos, por canal/hora/tipo/marca, lote agregado e devolucao
const c = new ContadoresMem();
const h0 = horaBucket(agora), h1 = new Date(h0.getTime() + 3_600_000);
c.incrementar('livros', h0, 'livro-rpg', 'devir'); c.incrementar('livros', h0, 'livro-rpg', 'devir'); c.incrementar('livros', h0, 'mangas', null);
c.incrementar('impressao3d', h0, 'filamentos', 'sunlu'); c.incrementar('livros', h1, 'livro-rpg', 'devir');
assert.deepEqual(c.ler('livros', h0, 'livro-rpg', 'devir'), { canalHora: 3, tipoHora: 2, marcaHora: 2 });
assert.deepEqual(c.ler('livros', h0, 'mangas', null), { canalHora: 3, tipoHora: 1, marcaHora: 0 });
assert.deepEqual(c.ler('livros', h1, 'livro-rpg', 'devir'), { canalHora: 1, tipoHora: 1, marcaHora: 1 }, 'hora nova zera as cotas');
assert.deepEqual(c.ler('impressao3d', h0, 'x', null), { canalHora: 1, tipoHora: 0, marcaHora: 0 });
const lote = c.coletarLote();
assert.equal(lote.length, 4, 'agregado por chave (canal, hora, tipo, marca): 5 incrementos viram 4 linhas');
assert.equal(lote.find((l) => l.tipo === 'livro-rpg' && l.horaMs === h0.getTime())!.n, 2);
assert.equal(c.pendentes, 0); assert.equal(c.coletarLote().length, 0, 'lote entregue uma vez');
c.devolver(lote); assert.equal(c.pendentes, 4, 'falha na gravacao devolve os deltas');
c.incrementar('livros', h0, 'livro-rpg', 'devir', 1, false); assert.equal(c.pendentes, 4, 'reconstrucao nao gera delta');
assert.equal(c.ler('livros', h0, 'livro-rpg', 'devir').canalHora, 4);
c.limpar(); assert.equal(c.ler('livros', h0, null, null).canalHora, 0);

// --- simulacao de uma hora: 40 ofertas validas de 14 tipos; piso 12, teto 30, vaga por tipo 2
{
  const cont = new ContadoresMem(); const hist: SentRecord[] = []; let ok = 0; const motivos: Record<string, number> = {};
  for (let i = 0; i < 40; i++) {
    const tipo = `tipo-${i % 14}`; const t = new Date(h0.getTime() + i * 60_000);
    const m = master({ masterProductId: `mm${i}`, confirmedAt: new Date(t.getTime() - (i < 20 ? 3 : 45) * 60_000).toISOString() });
    const res = admitir({ canal: 'livros', tipo, marca: null, master: m, agora: t, estado: cont.ler('livros', h0, tipo, null), historico: hist, config: cfg });
    if (res.decisao === 'enviaria') { ok++; cont.incrementar('livros', h0, tipo, null); hist.push({ masterProductId: m.masterProductId, priceCents: 5000, sentAt: t, vertical: 'livros', tipo }); }
    else motivos[res.motivo.replace(/\d+.*/, '')] = (motivos[res.motivo.replace(/\d+.*/, '')] ?? 0) + 1;
  }
  assert.ok(ok <= 30 && ok >= 12, `envios simulados na hora ${ok}`);
  assert.ok(Object.values(Object.fromEntries([...Array(14)].map((_, k) => [k, 1]))).length === 14);
  assert.ok(cont.ler('livros', h0, 'tipo-0', null).tipoHora <= 2, 'nenhum tipo acima da vaga');
}

// --- paridade: resumo e criterios
{
  const dec = [
    { canal: 'livros', mensagem_id: 'a', master_id: 'm1', tipo: 't', decisao: 'enviaria' as const, motivo: 'ok_piso_do_canal', janela: '2026-11-20T12:00:00Z', status: 'enviada', sent_at: 'x' },
    { canal: 'livros', mensagem_id: 'b', master_id: 'm2', tipo: 't', decisao: 'descartaria' as const, motivo: 'teto_tipo_t_2_por_hora', janela: '2026-11-20T12:00:00Z', status: 'enviada', sent_at: 'x' },
    { canal: 'livros', mensagem_id: 'c', master_id: 'm3', tipo: 'u', decisao: 'enviaria' as const, motivo: 'ok_piso_do_canal', janela: '2026-11-20T12:00:00Z', status: 'expirada', sent_at: null },
  ];
  const reais = [
    { id: 'a', canal: 'livros', sent_at: 'x', trigger: 'OK1', master_id: 'm1' }, { id: 'b', canal: 'livros', sent_at: 'x', trigger: 'OK1', master_id: 'm2' },
    { id: 'z', canal: 'livros', sent_at: 'x', trigger: 'RADAR', master_id: 'm9' }, { id: 'y', canal: 'livros', sent_at: 'x', trigger: 'OK1', master_id: 'm8' },
  ];
  const p = resumoParidade(dec, reais)[0];
  assert.equal(p.realEmEscopo, 3, 'radar fora do escopo'); assert.equal(p.comDecisao, 2, 'sem decisao nao entra no acordo');
  assert.equal(p.acordo, 1); assert.equal(p.taxaAcordo, 0.5); assert.equal(p.aMais, 1); assert.equal(p.aMenos, 1);
  assert.deepEqual(p.statusAMais, { expirada: 1 }); assert.equal(p.maxHora, 2);
  assert.equal(veredito([p], 0, 0, cfg).c1, false); assert.equal(veredito([{ ...p, acordo: 4, comDecisao: 5 }], 0, 0, cfg).c1, true);
  assert.equal(veredito([p], 1, 0, cfg).c2, false); assert.equal(veredito([p], 0, 0, cfg).c2, true);
  assert.equal(veredito([{ ...p, maxHora: 31 }], 0, 0, cfg).c4, false);
}

console.log('OK: R-112 (admissao, gates R-70/R-81/isca/novo/barrado, repeticao 24 h, vagas tipo/marca/canal piso e teto, contadores, paridade).');

// Regressao: SET LOCAL nao aceita parametro ($1) no Postgres; o cron de sombra falhou em silencio por isso em 2026-11-20.
{

  for (const f of ['src/server/pistas/sombra.ts', 'src/server/pistas/contadores.ts']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/sql`SET LOCAL [a-z_]+ = \$\{/.test(src), `${f}: SET LOCAL parametrizado`);
  }
}
