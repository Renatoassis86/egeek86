// Toda postagem do Telegram com oferta leva o link de compra NO TEXTO (dono, 2026-11-18). Cabe na legenda de foto (1024 visiveis) e nao duplica.
import assert from 'node:assert/strict';
import { comLinkDeCompra } from '../src/lib/messaging/group-messages';

const input = (extra: Record<string, unknown> = {}) => ({ model: 'abaixo-media', messageKey: 'ab-261118-xyz', offer: { slug: 'jogo-x', affiliateUrl: 'https://meli.la/14NcVxv', networkName: 'Mercado Livre' }, ...extra }) as never;
const base = ['<b>ÓTIMA COMPRA</b>', '<b>Star Fox</b>', '<b>R$ 320,00</b>', '<i>Conferido em 18/11 às 00:08. #publicidade</i>\n<i>Espaço Geek 86 · Quem monitora, compra melhor.</i>'].join('\n\n');
const t = comLinkDeCompra(base, input(), 'tg');
assert.ok(t.includes('<b>Comprar:</b> https://meli.la/14NcVxv'), 'link de afiliado do dono no texto');
assert.ok(t.indexOf('Comprar:') < t.indexOf('Conferido em'), 'antes do carimbo');
assert.equal(comLinkDeCompra(t, input(), 'tg'), t, 'nao duplica');
assert.equal(comLinkDeCompra(base, input(), 'wa'), base, 'WhatsApp ja leva link no texto: nao muda');
const semAfiliado = comLinkDeCompra(base, input({ offer: { slug: 'jogo-x', affiliateUrl: null, networkName: 'Mercado Livre' } }), 'tg');
assert.ok(/Comprar:<\/b> https:\/\/www\.egeek86\.com\/go\/jogo-x\?s=tg&amp;m=ab-261118-xyz/.test(semAfiliado), 'sem link de afiliado: o /go do site');
assert.equal(comLinkDeCompra(base, { model: 'radar', items: [] } as never, 'tg'), base, 'sem oferta unica: nao mexe');
// legenda de foto: o link tem prioridade; cede o bloco de divulgacao e o slogan, nunca o link, o preco nem o #publicidade
const longo = ['<b>' + 'Titulo '.repeat(20) + '</b>', '<b>R$ 320,00</b>', 'x'.repeat(480), 'Histórico completo: <a href="https://www.egeek86.com/?s=tg&amp;m=ab">egeek86.com</a>\n<b>Grupo no WhatsApp:</b> https://chat.whatsapp.com/BogVoOh81wq7WII4UETC68', '<i>Conferido em 18/11 às 00:08. #publicidade</i>\n<i>Espaço Geek 86 · Quem monitora, compra melhor.</i>'].join('\n\n');
const l = comLinkDeCompra(longo, input(), 'tg');
const vis = l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').length;
assert.ok(vis <= 1024 && l.includes('Comprar:') && l.includes('R$ 320,00') && l.includes('#publicidade'), `legenda ${vis} <= 1024 com link, preco e #publicidade`);
console.log('test-link-de-compra-texto: OK');
