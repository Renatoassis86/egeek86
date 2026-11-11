/**
 * Testes do Agente de Cupons / Guardião (2026-11-11). SEM rede e SEM banco: lookups, armazenamento e fetch são injetados.
 * Uso: npx tsx --conditions=react-server scripts/test-guardiao-cupons.ts  (código 1 se algo falhar)
 * Cobre: consulta única (ordem e auditoria), cada motivo de encerramento, envio do card (silencioso, HTML, sem palavra proibida),
 * limite de 3 por hora por grupo, não-reenvio, canal não verificado, falha temporária x definitiva e renderização real do PNG.
 */
import {
  ENDED_CARD_MAX_PER_HOUR,
  cardLabel,
  decideEnd,
  endedCaption,
  shouldNotifyEnd,
  type Announcement,
  type AnnKind,
  type EndReason,
  type Evidence,
} from '../src/lib/coupons/guardiao-model';

let fails = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

const NOW = new Date('2026-11-11T15:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const fut = (min: number) => new Date(NOW.getTime() + min * 60_000);

const baseAnn = (kind: AnnKind, over: Partial<Announcement> = {}): Announcement => ({
  id: `ann-${Math.random().toString(36).slice(2, 8)}`, networkSlug: 'mercado-livre', kind, couponRef: '11111111-1111-4111-8111-111111111111',
  label: kind === 'anuncio' ? 'R$ 315,46 com cupom' : 'TODOSITE1111', offerId: '22222222-2222-4222-8222-222222222222', vertical: 'games',
  storeId: 'store-games', firstSentAt: ago(60), lastSentAt: ago(30), ...over,
});

async function main() {
  const { consultarCupom } = await import('../src/server/messaging/agente-cupons');
  const { rodarGuardiao } = await import('../src/server/messaging/guardiao-cupons');
  const { renderEndedCouponCard } = await import('../src/server/messaging/ended-coupon-card');
  type Store = import('../src/server/messaging/guardiao-cupons').GuardiaoStore;
  type Pending = import('../src/server/messaging/guardiao-cupons').PendingNotice;

  // ---------------------------------------------------------------- 1) decisão pura: cada motivo
  const item = (over: Partial<Extract<Evidence, { kind: 'anuncio' }>> = {}): Evidence => ({
    kind: 'anuncio', offerActive: true, currentPriceCents: 40000,
    lastRead: { readAt: ago(20), priceWithCents: 31546 }, lastPositive: { readAt: ago(20), priceWithCents: 31546 }, ...over,
  });
  const a = baseAnn('anuncio');
  check('anuncio: leitura positiva recente e preço com cupom < preço atual => segue válido', decideEnd(a, item(), NOW).end === false);
  check(
    'anuncio: leitura mais nova que a divulgação sem cupom => sumiu_da_pagina',
    JSON.stringify(decideEnd(a, item({ lastRead: { readAt: ago(5), priceWithCents: null } }), NOW)) === JSON.stringify({ end: true, reason: 'sumiu_da_pagina' })
  );
  check(
    'anuncio: leitura sem cupom ANTERIOR à divulgação não encerra',
    decideEnd(a, item({ lastRead: { readAt: ago(40), priceWithCents: null } }), NOW).end === false
  );
  check(
    'anuncio: preço com cupom não é mais menor que o preço atual => sumiu_da_pagina',
    JSON.stringify(decideEnd(a, item({ currentPriceCents: 31000 }), NOW)) === JSON.stringify({ end: true, reason: 'sumiu_da_pagina' })
  );
  check(
    'anuncio: 3 h sem nova leitura positiva (e leituras < 6 h) => venceu (janela de 2 h)',
    JSON.stringify(decideEnd(a, item({ lastRead: { readAt: ago(180), priceWithCents: 31546 }, lastPositive: { readAt: ago(180), priceWithCents: 31546 } }), NOW)) === JSON.stringify({ end: true, reason: 'venceu' })
  );
  check(
    'anuncio: 7 h sem NENHUMA leitura => sem_leitura_recente',
    JSON.stringify(decideEnd(a, item({ lastRead: { readAt: ago(420), priceWithCents: 31546 }, lastPositive: { readAt: ago(420), priceWithCents: 31546 } }), NOW)) === JSON.stringify({ end: true, reason: 'sem_leitura_recente' })
  );
  check('anuncio: oferta inativa => oferta_inativa', JSON.stringify(decideEnd(a, item({ offerActive: false }), NOW)) === JSON.stringify({ end: true, reason: 'oferta_inativa' }));

  const camp = baseAnn('campanha');
  const row = (state: string, over: Record<string, unknown> = {}): Evidence => ({
    kind: 'campanha', row: { state, stateReason: null, validUntil: fut(600), lastSeenAt: ago(10), ...over } as never,
  });
  check('campanha: ativa com validade futura segue (mesmo sem confirmação de 24 h)', decideEnd(camp, row('verificado', { lastSeenAt: ago(3000) }), NOW).end === false);
  check('campanha: validade passou => venceu', JSON.stringify(decideEnd(camp, row('verificado', { validUntil: ago(1) }), NOW)) === JSON.stringify({ end: true, reason: 'venceu' }));
  check(
    'campanha: dono encerrou => cancelado_pelo_dono',
    JSON.stringify(decideEnd(camp, row('vencido', { stateReason: 'encerrado_pelo_dono' }), NOW)) === JSON.stringify({ end: true, reason: 'cancelado_pelo_dono' })
  );
  check('campanha: linha apagada => cancelado_pelo_dono', JSON.stringify(decideEnd(camp, { kind: 'campanha', row: null }, NOW)) === JSON.stringify({ end: true, reason: 'cancelado_pelo_dono' }));

  const loja = baseAnn('loja');
  const rowL = (state: string, over: Record<string, unknown> = {}): Evidence => ({
    kind: 'loja', row: { state, stateReason: null, validUntil: fut(600), lastSeenAt: ago(60), ...over } as never,
  });
  check('loja: verificada, vista na varredura, validade futura => segue', decideEnd(loja, rowL('verificado'), NOW).end === false);
  check('loja: marcada vencida por ausência na varredura => sumiu_da_pagina', JSON.stringify(decideEnd(loja, rowL('vencido', { stateReason: 'ausente_na_leitura' }), NOW)) === JSON.stringify({ end: true, reason: 'sumiu_da_pagina' }));
  check('loja: validade lida passou => venceu', JSON.stringify(decideEnd(loja, rowL('verificado', { validUntil: ago(2) }), NOW)) === JSON.stringify({ end: true, reason: 'venceu' }));
  check('loja: 7 h sem ser vista => sem_leitura_recente', JSON.stringify(decideEnd(loja, rowL('verificado', { lastSeenAt: ago(420) }), NOW)) === JSON.stringify({ end: true, reason: 'sem_leitura_recente' }));
  check('loja: perdeu a verificação (< 6 h) fica aberta e vira divergência', (() => { const d = decideEnd(loja, rowL('nao_verificado'), NOW); return d.end === false && d.note === 'nao_verificado'; })());

  // card só com prova
  const notif = (k: AnnKind, r: EndReason) => shouldNotifyEnd(k, r);
  check('card: anuncio que a página deixou de mostrar => sim', notif('anuncio', 'sumiu_da_pagina'));
  check('card: anuncio que só passou a janela de 2 h => NÃO (ruído)', !notif('anuncio', 'venceu'));
  check('card: campanha/loja/categoria vencida => sim', notif('campanha', 'venceu') && notif('loja', 'venceu') && notif('categoria', 'venceu'));
  check('card: cancelado pelo dono => sim', notif('campanha', 'cancelado_pelo_dono'));
  check('card: sem leitura recente e oferta inativa => NÃO (não afirma que acabou)', !notif('loja', 'sem_leitura_recente') && !notif('anuncio', 'oferta_inativa'));

  // legenda
  const cap = endedCaption({ kind: 'campanha', label: 'TODOSITE1111', networkSlug: 'mercado-livre', adTag: '#publicidade' }, (s) => s);
  check('legenda: negrito, rede, rótulo e #publicidade', cap.includes('<b>Cupom encerrado</b>') && cap.includes('TODOSITE1111') && cap.includes('Mercado Livre') && cap.includes('#publicidade'));
  check('legenda: sem a palavra "afiliado" e sem preço', !/afiliad/i.test(cap) && !/R\$/.test(cap));
  check('legenda de anúncio não repete o preço do rótulo', !/315/.test(endedCaption({ kind: 'anuncio', label: 'R$ 315,46 com cupom', networkSlug: 'mercado-livre', adTag: '' }, (s) => s)) && cardLabel('anuncio', 'R$ 315,46 com cupom') === 'Cupom no anúncio');

  // ---------------------------------------------------------------- 2) consulta única do motor
  const audits: unknown[] = [];
  const audit = async (r: unknown) => void audits.push(r);
  const info = (code: string) => ({ code, conditions: '', expiresAt: null, verifiedAt: NOW.toISOString() });
  const calls: string[] = [];
  const mk = (n: string, v: ReturnType<typeof info> & Record<string, unknown> | null) => async () => (calls.push(n), v);
  let c = await consultarCupom('off-1', { item: mk('item', { ...info('R$ 10 com cupom'), couponRef: 'off-1', annKind: 'anuncio' }), campanha: mk('camp', info('X')), lojaCategoria: mk('loja', info('Y')), audit });
  check('consulta: item vence e não chama os outros', c?.source === 'item' && c.couponRef === 'off-1' && c.annKind === 'anuncio' && calls.join() === 'item');
  calls.length = 0;
  c = await consultarCupom('off-2', { item: mk('item', null), campanha: mk('camp', { ...info('TODOSITE1111'), couponRef: 'ci-1', annKind: 'campanha' }), lojaCategoria: mk('loja', info('Y')), audit });
  check('consulta: sem item, campanha do dono', c?.source === 'campanha' && c.code === 'TODOSITE1111' && c.couponRef === 'ci-1' && calls.join() === 'item,camp');
  c = await consultarCupom('off-3', { item: mk('item', null), campanha: mk('camp', null), lojaCategoria: mk('loja', { ...info('10% OFF em games'), couponRef: 'ci-2', annKind: 'categoria' }), audit });
  check('consulta: por último loja/categoria', c?.source === 'loja_categoria' && c.annKind === 'categoria');
  c = await consultarCupom('off-4', { item: mk('item', null), campanha: mk('camp', null), lojaCategoria: mk('loja', null), audit });
  check('consulta: nada achado => null (nunca inventa)', c === null);
  c = await consultarCupom('off-5', { item: async () => { throw new Error('banco fora'); }, campanha: mk('camp', null), lojaCategoria: mk('loja', null), audit });
  check('consulta: falha de uma fonte não derruba a consulta', c === null);
  check('consulta: cada chamada grava auditoria (5)', audits.length === 5 && (audits[0] as { found: boolean }).found === true && (audits[3] as { found: boolean }).found === false);
  c = await consultarCupom('off-6', { item: mk('item', info('A')), campanha: mk('camp', null), lojaCategoria: mk('loja', null), audit: async () => { throw new Error('tabela ausente'); } });
  check('consulta: falha na auditoria é ignorada', c?.code === 'A');

  // ---------------------------------------------------------------- 3) guardião com armazenamento em memória
  type St = { ann: Announcement; ended?: { at: Date; reason: EndReason }; notifiedAt?: Date | null; checked?: Date };
  const mkStore = (rows: St[], evidence: Record<string, Evidence>): Store & { rows: St[] } => ({
    rows,
    async listOpen() { return rows.filter((r) => !r.ended).map((r) => r.ann); },
    async evidence(ann) { return evidence[ann.id]; },
    async touch(id, now) { const r = rows.find((x) => x.ann.id === id); if (r) r.checked = now; },
    async end(id, reason, now) { const r = rows.find((x) => x.ann.id === id && !x.ended); if (!r) return false; r.ended = { at: now, reason }; return true; },
    async listPending(now) {
      return rows
        .filter((r) => r.ended && !r.notifiedAt && (r.ended.reason === 'sumiu_da_pagina' || r.ended.reason === 'cancelado_pelo_dono' || (r.ended.reason === 'venceu' && r.ann.kind !== 'anuncio')))
        .map((r): Pending => ({ ...r.ann, endedAt: r.ended!.at, reason: r.ended!.reason }));
    },
    async notifiedLastHour(ann, now) { return rows.filter((r) => r.ann.storeId === ann.storeId && r.notifiedAt && now.getTime() - r.notifiedAt.getTime() < 3_600_000).length; },
    async claimNotify(id, now) { const r = rows.find((x) => x.ann.id === id); if (!r || r.notifiedAt) return false; r.notifiedAt = now; return true; },
    async releaseNotify(id) { const r = rows.find((x) => x.ann.id === id); if (r) r.notifiedAt = null; },
  });

  type Req = { url: string; method?: string; body?: unknown };
  const fetchOk = (log: Req[], mode: 'ok' | '500' | '403' = 'ok') => async (url: string, init?: { method?: string; body?: string | FormData }) => {
    log.push({ url, method: init?.method, body: init?.body });
    return mode === 'ok'
      ? { status: 200, json: async () => ({ ok: true, result: { message_id: 900 + log.length } }) }
      : { status: mode === '500' ? 500 : 403, json: async () => ({ ok: false, description: mode === '500' ? 'Internal' : 'Forbidden: bot was kicked' }) };
  };
  const channel = async () => ({ slug: 'games', chatId: '-100123' });
  const photo = async () => new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const baseDeps = { token: 'TKN:secret', adTag: '#publicidade', now: NOW, canSend: true, render: photo, resolveChannel: channel };

  // 3a) cada motivo de encerramento, de ponta a ponta no guardião
  {
    const A = baseAnn('anuncio'), B = baseAnn('anuncio', { couponRef: '33333333-3333-4333-8333-333333333333' }), C = baseAnn('campanha'), D = baseAnn('loja'), E = baseAnn('categoria'), F = baseAnn('anuncio', { couponRef: '44444444-4444-4444-8444-444444444444' });
    const ev: Record<string, Evidence> = {
      [A.id]: item({ lastRead: { readAt: ago(5), priceWithCents: null } }), // sumiu_da_pagina (card)
      [B.id]: item({ lastRead: { readAt: ago(180), priceWithCents: 1 }, lastPositive: { readAt: ago(180), priceWithCents: 31546 } }), // venceu (sem card)
      [C.id]: { kind: 'campanha', row: { state: 'vencido', stateReason: 'encerrado_pelo_dono', validUntil: fut(100), lastSeenAt: ago(10) } }, // cancelado_pelo_dono (card)
      [D.id]: { kind: 'loja', row: { state: 'verificado', stateReason: null, validUntil: ago(3), lastSeenAt: ago(10) } }, // venceu (card)
      [E.id]: { kind: 'categoria', row: { state: 'verificado', stateReason: null, validUntil: fut(100), lastSeenAt: ago(500) } }, // sem_leitura_recente (sem card)
      [F.id]: item({ offerActive: false }), // oferta_inativa (sem card)
    };
    const store = mkStore([A, B, C, D, E, F].map((ann) => ({ ann })), ev);
    const log: Req[] = [];
    const res = await rodarGuardiao({ ...baseDeps, store, fetchImpl: fetchOk(log) as never });
    const reason = (x: Announcement) => store.rows.find((r) => r.ann.id === x.id)?.ended?.reason;
    check('guardião: sumiu_da_pagina', reason(A) === 'sumiu_da_pagina');
    check('guardião: venceu (anúncio, janela de 2 h)', reason(B) === 'venceu');
    check('guardião: cancelado_pelo_dono', reason(C) === 'cancelado_pelo_dono');
    check('guardião: venceu (loja, prazo lido)', reason(D) === 'venceu');
    check('guardião: sem_leitura_recente (6 h)', reason(E) === 'sem_leitura_recente');
    check('guardião: oferta_inativa', reason(F) === 'oferta_inativa');
    check('guardião: 6 encerrados, 3 cards (sumiu, cancelado, loja vencida)', res.ended.length === 6 && res.notified === 3 && log.length === 3, { ended: res.ended.length, n: res.notified, log: log.length });
    const notifiedIds = store.rows.filter((r) => r.notifiedAt).map((r) => r.ann.id).sort();
    check('guardião: só quem tem prova foi avisado', JSON.stringify(notifiedIds) === JSON.stringify([A.id, C.id, D.id].sort()));

    // formato do envio
    const first = log[0];
    const form = first.body as FormData;
    check('envio: sendPhoto com upload multipart', first.url.endsWith('/sendPhoto') && form instanceof FormData && form.get('photo') instanceof Blob);
    check('envio: SILENCIOSO (disable_notification)', form.get('disable_notification') === 'true');
    check('envio: HTML do Telegram e chat da loja', form.get('parse_mode') === 'HTML' && form.get('chat_id') === '-100123');
    const caption = String(form.get('caption'));
    check('envio: legenda curta com negrito, #publicidade, sem "afiliado"', caption.startsWith('<b>Cupom encerrado</b>') && caption.includes('#publicidade') && !/afiliad/i.test(caption) && caption.length < 300);
    check('envio: token nunca aparece no corpo', !caption.includes('secret') && !JSON.stringify(res).includes('secret'));

    // 3b) não reenvia: segunda rodada sem pendências
    const log2: Req[] = [];
    const res2 = await rodarGuardiao({ ...baseDeps, store, fetchImpl: fetchOk(log2) as never });
    check('não-reenvio: segunda rodada não envia nada', res2.notified === 0 && log2.length === 0);
  }

  // 3c) limite de 3 por hora por grupo (5 encerrados com prova)
  {
    const anns = [1, 2, 3, 4, 5].map((i) => baseAnn('campanha', { couponRef: `5555555${i}-5555-4555-8555-555555555555`, label: `COD${i}` }));
    const ev: Record<string, Evidence> = {};
    for (const x of anns) ev[x.id] = { kind: 'campanha', row: { state: 'vencido', stateReason: 'encerrado_pelo_dono', validUntil: fut(100), lastSeenAt: ago(5) } };
    const store = mkStore(anns.map((ann) => ({ ann })), ev);
    const log: Req[] = [];
    const r1 = await rodarGuardiao({ ...baseDeps, store, fetchImpl: fetchOk(log) as never });
    check(`limite: ${ENDED_CARD_MAX_PER_HOUR} por hora no mesmo grupo`, r1.notified === 3 && log.length === 3 && r1.notifySkipped.limite_3_por_hora === 2, { n: r1.notified, skip: r1.notifySkipped });
    const r2 = await rodarGuardiao({ ...baseDeps, now: new Date(NOW.getTime() + 20 * 60_000), store, fetchImpl: fetchOk(log) as never });
    check('limite: 20 min depois continua travado (ainda dentro da hora)', r2.notified === 0 && log.length === 3);
    const r3 = await rodarGuardiao({ ...baseDeps, now: new Date(NOW.getTime() + 61 * 60_000), store, fetchImpl: fetchOk(log) as never });
    check('limite: passada 1 hora, os 2 restantes saem (1 por cupom, nunca repete)', r3.notified === 2 && log.length === 5, { n: r3.notified, len: log.length });
    // grupo diferente tem a própria cota
    const other = baseAnn('campanha', { storeId: 'store-tec', vertical: 'tecnologia', couponRef: '66666666-6666-4666-8666-666666666666' });
    const st2 = mkStore([...anns.map((ann) => ({ ann, ended: { at: ago(5), reason: 'cancelado_pelo_dono' as EndReason }, notifiedAt: ago(10) })), { ann: other, ended: { at: ago(5), reason: 'cancelado_pelo_dono' as EndReason } }], {});
    const log3: Req[] = [];
    const r4 = await rodarGuardiao({ ...baseDeps, store: st2, resolveChannel: async (a) => ({ slug: a.vertical === 'games' ? 'games' : 'tecnologia', chatId: a.vertical === 'games' ? '-1' : '-2' }), fetchImpl: fetchOk(log3) as never });
    check('limite: a cota é POR GRUPO (outra loja envia mesmo com games cheio)', r4.notified === 1 && log3.length === 1);
  }

  // 3d) canal não verificado, envio desligado, falhas
  {
    const mkOne = () => {
      const x = baseAnn('campanha');
      return mkStore([{ ann: x }], { [x.id]: { kind: 'campanha', row: { state: 'vencido', stateReason: 'encerrado_pelo_dono', validUntil: fut(10), lastSeenAt: ago(1) } } });
    };
    let log: Req[] = [];
    let s = mkOne();
    let r = await rodarGuardiao({ ...baseDeps, store: s, resolveChannel: async () => null, fetchImpl: fetchOk(log) as never });
    check('sem canal verificado: encerra mas não envia e fica pendente', r.ended.length === 1 && r.notified === 0 && log.length === 0 && r.notifySkipped.sem_canal_verificado === 1 && !s.rows[0].notifiedAt);
    s = mkOne();
    r = await rodarGuardiao({ ...baseDeps, store: s, canSend: false, fetchImpl: fetchOk(log) as never });
    check('envio desligado (dry): encerra, não envia, avisa depois', r.ended.length === 1 && log.length === 0 && r.notifySkipped.envio_desligado === 1);
    s = mkOne();
    r = await rodarGuardiao({ ...baseDeps, store: s, fetchImpl: fetchOk(log, '500') as never });
    check('falha temporária (500): devolve o aviso para o próximo ciclo', r.notified === 0 && !s.rows[0].notifiedAt && r.notifySkipped.falha_temporaria === 1);
    s = mkOne();
    r = await rodarGuardiao({ ...baseDeps, store: s, fetchImpl: fetchOk(log, '403') as never });
    check('falha definitiva (403): não tenta de novo e conta erro', r.notified === 0 && !!s.rows[0].notifiedAt && r.errors === 1);
    s = mkOne();
    log = [];
    r = await rodarGuardiao({ ...baseDeps, store: s, render: async () => { throw new Error('satori'); }, fetchImpl: fetchOk(log) as never });
    check('imagem falhou: o aviso sai só em texto (sendMessage)', r.notified === 1 && log[0].url.endsWith('/sendMessage'));
    s = mkOne();
    const broken: Store = { ...s, evidence: async () => { throw new Error('banco'); } };
    r = await rodarGuardiao({ ...baseDeps, store: broken, fetchImpl: fetchOk([]) as never });
    check('erro numa verificação não derruba o ciclo', r.errors === 1 && r.notified === 0);
    const x = baseAnn('campanha');
    const st3 = mkStore([{ ann: x }], { [x.id]: { kind: 'campanha', row: { state: 'verificado', stateReason: null, validUntil: fut(500), lastSeenAt: ago(5) } } });
    const r5 = await rodarGuardiao({ ...baseDeps, store: st3, fetchImpl: fetchOk([]) as never });
    check('cupom ainda válido: nada é encerrado nem enviado', r5.ended.length === 0 && r5.notified === 0 && !!st3.rows[0].checked);
    s = mkOne();
    const r6 = await rodarGuardiao({ ...baseDeps, store: s, budgetMs: -1, fetchImpl: fetchOk([]) as never });
    check('orçamento de tempo esgotado: para sem estourar', r6.budgetExhausted === true && r6.checked === 0);
  }

  // ---------------------------------------------------------------- 4) card real (PNG 1080x1080)
  const png = await renderEndedCouponCard({ storeSlug: 'games', label: 'TODOSITE1111', networkName: 'Mercado Livre', at: NOW });
  const isPng = !!png && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
  check('card: PNG válido', isPng && png!.length > 5000, png?.length);
  const w = png ? png.readUInt32BE(16) : 0;
  const h = png ? png.readUInt32BE(20) : 0;
  check('card: 1080x1080', w === 1080 && h === 1080, { w, h });
  const png2 = await renderEndedCouponCard({ storeSlug: 'loja-inexistente', label: 'Cupom no anúncio', networkName: 'Shopee', at: NOW });
  check('card: loja sem perfil cai na paleta da comunidade (não quebra)', !!png2 && png2.length > 5000);

  console.log(`\n${total - fails}/${total} verificações ok`);
  if (fails) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
