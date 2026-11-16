/**
 * Gatilho anti-isca de CUPOM do ML (R-63, 2026-11-16): cupom sem prova no item não vira mensagem, card nem site. Puro (sem banco).
 * Uso: npx tsx scripts/test-prova-cupom-121.ts
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { motivoDeFim } from '../src/lib/coupons/prova-cupom';
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
const vers = /var VERSAO = '(\d+)\.(\d+)\.(\d+)'/.exec(src);
ok(/confirmado_modal/.test(src) && /cupomSemCampanha/.test(src) && !!vers && Number(vers[1]) === 1 && Number(vers[2]) >= 3, `leitor ${vers ? vers.slice(1).join('.') : '?'} (versão lida do arquivo) exige campanha e confirma no modal do mesmo item`);
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

// ---- Caso Soundbar (R-68): cupom do carrossel de relacionados nunca vira cupom do item
const PUROLOOP = createRequire(import.meta.url)(process.cwd() + '/public/loops/ml-cupons-item.js') as { extrairCupons: (h: string) => { cupons: { label: string; campaign_id?: string; status: string; name?: string }[] }; filtrarConfirmados: (c: unknown[], m: unknown) => { confirmados: unknown[]; semCampanha: number; naoConfirmados: number } };
const soundbar = fs.readFileSync('scripts/fixtures/ml-soundbar-carrossel.html', 'utf8');
const lido = PUROLOOP.extrairCupons(soundbar);
ok(lido.cupons.length === 1 && /1\.709/.test(lido.cupons[0]!.label), 'o leitor ainda LÊ o "R$ 1.709 com Cupom" do carrossel (é a razão do filtro)', lido);
// modal do item Soundbar sem campanha: mapa vazio
const f1 = PUROLOOP.filtrarConfirmados(lido.cupons, {});
ok(f1.confirmados.length === 0, 'Soundbar: modal do item sem campanha => nenhum cupom confirmado (sem cupom)', f1);
const f2 = PUROLOOP.filtrarConfirmados(lido.cupons, null);
ok(f2.confirmados.length === 0, 'modal não consultado/inconclusivo => nada confirmado', f2);
const f3 = PUROLOOP.filtrarConfirmados([{ label: 'R$ 1.709 com Cupom', campaign_id: '987654', status: 'lido_na_pagina' }], { '111': { name: 'outro' } });
ok(f3.confirmados.length === 0 && f3.naoConfirmados === 1, 'campanha do carrossel que não está no modal do item não é confirmada', f3);
const f4 = PUROLOOP.filtrarConfirmados([{ label: 'R$ 5.799 com Cupom', campaign_id: '111', status: 'lido_na_pagina' }], { '111': { name: 'Cupom real', acao: 'apply' } });
ok(f4.confirmados.length === 1 && (f4.confirmados[0] as { status: string }).status === 'confirmado_modal', 'campanha presente no modal do item: confirmada', f4);

// ---- R-68: "Cupom encerrado" de cupom NUNCA provado => silêncio
ok(motivoDeFim('sumiu_da_pagina', 'anuncio', false) === 'nunca_provado', 'encerrado de cupom nunca provado: fecha em silêncio (nunca_provado)');
ok(motivoDeFim('venceu', 'anuncio', false) === 'nunca_provado', 'venceu sem prova: silêncio');
ok(motivoDeFim('sumiu_da_pagina', 'anuncio', true) === 'sumiu_da_pagina', 'cupom que teve prova e sumiu: segue o fluxo do card');
ok(motivoDeFim('sumiu_da_pagina', 'campanha', false) === 'sumiu_da_pagina', 'campanha/loja seguem o fluxo próprio');
ok(motivoDeFim('cancelado_pelo_dono', 'anuncio', false) === 'cancelado_pelo_dono', 'cancelado pelo dono continua valendo');

console.log(fails ? `${fails} falha(s)` : 'OK: gatilho anti-isca de cupom (R-63)');
process.exit(fails ? 1 : 0);
