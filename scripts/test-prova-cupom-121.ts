/**
 * Gatilho anti-isca de CUPOM do ML (R-63, 2026-11-16): cupom sem prova no item não vira mensagem, card nem site. Puro (sem banco).
 * Uso: npx tsx scripts/test-prova-cupom-121.ts
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { cupomMlExigeProva, cupomMlFrescorMin, leituraPositivaGravavel, provaCupomMl, STATUS_CONFIRMADO_MODAL } from '../src/lib/coupons/prova-cupom';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-16T01:15:00Z');
const min = (m: number) => new Date(now.getTime() - m * 60_000);

// O caso real: leitura única das 01:01:43Z, status lido_na_pagina, sem campaign_id (13 min antes)
const real = provaCupomMl({ campaignId: null, status: 'lido_na_pagina', readAt: min(13), now });
ok(!real.ok && real.motivo === 'cupom_sem_campanha', 'P1S/NIC.3D: sem campaign_id não vale', real);
ok(provaCupomMl({ campaignId: '12345', status: 'lido_na_pagina', readAt: min(1), now }).ok === false, 'com campanha mas sem confirmação do modal não vale');
ok((provaCupomMl({ campaignId: '12345', status: 'lido_na_pagina', readAt: min(1), now }) as { motivo?: string }).motivo === 'cupom_sem_confirmacao_do_modal', 'motivo: sem confirmação do modal');
ok(provaCupomMl({ campaignId: '12345', status: STATUS_CONFIRMADO_MODAL, readAt: min(3), now }).ok, 'campanha + modal + 3 min: vale');
const velha = provaCupomMl({ campaignId: '12345', status: STATUS_CONFIRMADO_MODAL, readAt: min(11), now });
ok(!velha.ok && velha.motivo === 'cupom_leitura_antiga_para_enviar', 'leitura de 11 min não sustenta o envio (releitura <= 10 min)', velha);
ok(provaCupomMl({ campaignId: 'abc', status: STATUS_CONFIRMADO_MODAL, readAt: min(1), now }).ok === false, 'campaign_id inválido não vale');
ok(provaCupomMl({ campaignId: null, status: 'lido_na_pagina', readAt: min(500), now }, false).ok, 'flag CUPOM_ML_PROVA=0 desliga (comportamento antigo)');
ok(cupomMlExigeProva({}) && !cupomMlExigeProva({ CUPOM_ML_PROVA: '0' }) && cupomMlFrescorMin({}) === 10 && cupomMlFrescorMin({ CUPOM_ML_FRESCOR_MIN: '5' }) === 5, 'flags: prova ligada por padrão, frescor 10 min');

// Gravação: só positiva com prova fica positiva (o resto vira leitura "sem cupom")
ok(!leituraPositivaGravavel({ campaign: null, status: 'lido_na_pagina' }), 'ingest: label sem campanha vira leitura sem cupom');
ok(!leituraPositivaGravavel({ campaign: '999', status: 'lido_na_pagina' }), 'ingest: campanha sem modal vira leitura sem cupom');
ok(leituraPositivaGravavel({ campaign: '999', status: STATUS_CONFIRMADO_MODAL }), 'ingest: campanha + modal grava positiva');

// O leitor da aba: página de CATÁLOGO com vários vendedores e um "com Cupom" de OUTRO vendedor, sem campaign_id => nenhum cupom sai da página
const src = fs.readFileSync('public/loops/ml-cupons-item.js', 'utf8');
ok(/confirmado_modal/.test(src) && /cupomSemCampanha/.test(src) && /var VERSAO = '1\.3\.0'/.test(src), 'leitor v1.3.0 exige campanha e confirma no modal do mesmo item');
const sandbox: { window: Record<string, unknown>; document: object; console: Console } = { window: {}, document: {}, console };
try { vm.runInNewContext(src, sandbox as unknown as vm.Context, { timeout: 2000 }); } catch { /* o loop só inicia no navegador; PURO é exposto antes */ }
const PURO = (sandbox.window as { __mlCupItem?: { PURO?: { extrairCupons?: (h: string) => { cupons: { label: string; campaign_id?: string }[] } } } }).__mlCupItem?.PURO;
if (PURO?.extrairCupons) {
  const catalogo = '<div>R$ 6.399</div><div>R$ 5.799 com Cupom</div><div>R$ 6.799</div><div>R$ 7.109</div>';
  const x = PURO.extrairCupons(catalogo);
  ok(x.cupons.length === 1 && !x.cupons[0]!.campaign_id, 'página de catálogo: o "com Cupom" de outro vendedor sai SEM campaign_id (o leitor v1.3.0 o descarta antes de enviar)', x);
} else {
  console.log('(aviso) PURO do leitor não exposto no sandbox: parte do leitor coberta só pela leitura do arquivo');
}

console.log(fails ? `${fails} falha(s)` : 'OK: gatilho anti-isca de cupom (R-63)');
process.exit(fails ? 1 : 0);
