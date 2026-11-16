/**
 * Testes das regras R-71 a R-75 (auditoria independente de informacao, 2026-11-16). Sem banco, sem rede. Rodar: npx tsx scripts/test-informacao-publicada-r71-r75.ts
 *  R-71 base unica de comparacao (AUD-01) | R-72 rotulo verdadeiro: "Novo", vendas, cracha (AUD-03/05/21) | R-73 identidade de vendedor por rede (AUD-10)
 *  R-74 reprocesso de dia fechado so por script com backup (AUD-11) | R-75 condicao nao nova no titulo (AUD-14)
 * Inclui GUARDAS ESTRUTURAIS: se o gatilho sair do codigo, o teste falha.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hojeContradizBase, baseIncluiAmazon } from '../src/lib/messaging/base-comparacao';
import { vendasTexto } from '../src/lib/messaging/group-messages';
import { ofertaNovaNoMonitoramento, ACHADO_NOVO_MAX_HORAS } from '../src/lib/messaging/group-rules';
import { condicaoNaoNova, CONDICAO_NAO_NOVA_PG } from '../src/lib/pricing/condicao-nao-nova';
import { avaliarIsca, type ReferenciaIsca } from '../src/lib/pricing/preco-isca';

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log('ok -', nome); };
const R = (r: number) => Math.round(r * 100);
const src = (f: string) => fs.readFileSync(f, 'utf8');

// ---- R-71 ----
ok('R-71: caso GodFall: Amazon R$ 49,97 < hoje R$ 130,00 contradiz', () => assert.equal(hojeContradizBase(R(130), R(49.97)), true));
ok('R-71: Amazon igual ou mais cara nao contradiz; sem Amazon nao contradiz', () => {
  assert.equal(hojeContradizBase(R(130), R(130)), false);
  assert.equal(hojeContradizBase(R(130), R(200)), false);
  assert.equal(hojeContradizBase(R(130), null), false);
  assert.equal(hojeContradizBase(R(130), undefined), false);
});
ok('R-71: contencao da Amazon ligada = base sem Amazon; desligada = base com Amazon', () => {
  assert.equal(baseIncluiAmazon(true), false);
  assert.equal(baseIncluiAmazon(false), true);
});
ok('R-71 guarda: a serie da mensagem usa a mesma base do "hoje" e a plataforma usa o bloqueio', () => {
  assert.match(src('src/server/messaging/group-offers.ts'), /baseIncluiAmazon\(amazonForaDasMensagens\(\)\)/);
  assert.match(src('src/server/messaging/group-offers.ts'), /amazonForaDaBaseMinCents: amazonForaBy/);
  assert.match(src('src/lib/messaging/group-platform.ts'), /hojeContradizBase\(cheapest\.priceCents, p\.amazonForaDaBaseMinCents\)/);
});

// ---- R-72 ----
ok('R-72: vendasTexto nunca emite "mil" com N >= 1000 (AUD-05: 25687 mil)', () => {
  for (const v of [100, 999, 1000, 25_687, 999_999, 1_000_000, 1_500_000, 2_400_000, 9_999_999, 25_687_000]) {
    const t = vendasTexto(v);
    const m = t ? /(\d+) mil vendas/.exec(t) : null;
    assert.ok(!m || parseInt(m[1]!, 10) < 1000, `${v} -> ${t}`);
  }
  assert.equal(vendasTexto(25_687), 'mais de 25 mil vendas');
  assert.equal(vendasTexto(1_000_000), 'mais de 1 milhão de vendas');
  assert.equal(vendasTexto(2_450_000), 'mais de 2,4 milhões de vendas');
  assert.equal(vendasTexto(25_687_000), null);
  assert.equal(vendasTexto(50), null);
});
ok('R-72: "Novo no monitoramento" so para oferta com ate 24 h', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  assert.equal(ofertaNovaNoMonitoramento(new Date(now.getTime() - 2 * 3600_000), now), true);
  assert.equal(ofertaNovaNoMonitoramento(new Date(now.getTime() - (ACHADO_NOVO_MAX_HORAS + 1) * 3600_000), now), false);
  assert.equal(ofertaNovaNoMonitoramento(new Date(now.getTime() - 72 * 3600_000), now), false);
  assert.equal(ofertaNovaNoMonitoramento(null, now), false);
  assert.equal(ofertaNovaNoMonitoramento(new Date(now.getTime() + 3600_000), now), false);
});
ok('R-72 guarda: o rotulo vem de `novo`, o candidato AC o calcula e o cracha diz "vs média"', () => {
  assert.match(src('src/lib/messaging/group-messages.ts'), /input\.novo === true \? 'Novo no monitoramento' : 'Em monitoramento'/);
  assert.match(src('src/lib/messaging/group-rules.ts'), /novo: ofertaNovaNoMonitoramento\(o\.createdAt, ctx\.now\) && ofertaNovaNoMonitoramento\(p\.primeiraVezDoProdutoAt, ctx\.now\)/);
  assert.match(src('src/components/affiliate/offer-card.tsx'), /vs média/);
  assert.match(src('src/components/affiliate/offer-card.tsx'), /metrics\.priceDrop\.percent/);
});

// ---- R-73 ----
const refs = (...v: Array<[string | null, number]>): ReferenciaIsca[] => v.map(([sellerId, p]) => ({ sellerId, priceCents: R(p) }));
const GODFALL = refs(['ml-1', 130], ['ml-2', 135], ['loja:shopee:gamer hut', 170], ['loja:amazon:amazon', 140]);
ok('R-73: GodFall Amazon R$ 49,97 contra 4 vendedores/lojas de ~R$ 135 e isca (razao < 0,5)', () => {
  const v = avaliarIsca(R(49.97), GODFALL);
  assert.equal(v.isca, true);
  assert.ok(v.razao! < 0.5);
});
ok('R-73: Amazon (uma loja) vale UM voto: 3 ofertas Amazon sozinhas nao formam referencia', () => {
  const v = avaliarIsca(R(50), refs(['loja:amazon:amazon', 140], ['loja:amazon:amazon', 141], ['loja:amazon:amazon', 139]));
  assert.equal(v.vendedores, 1);
  assert.equal(v.isca, false);
});
ok('R-73: R-61 nao foi relaxado (mesmo limiar e minimo de vendedores)', () => {
  assert.equal(avaliarIsca(R(70), GODFALL).isca, false);
  assert.equal(avaliarIsca(R(49.97), refs(['a', 130], ['b', 135])).isca, false);
});
ok('R-73 guarda: referencia e varredura usam a identidade de vendedor por oferta, nao seller_id puro', () => {
  const s = src('src/server/pricing/preco-isca.ts');
  assert.match(s, /identidadeVendedorSql\('o', 'n'\)/);
  assert.doesNotMatch(s, /o\.seller_id IS NOT NULL AND o\.status = 'active'/);
  assert.match(src('src/server/pricing/preco-isca-sql.ts'), /'loja:' \|\| /);
});

// ---- R-74 ----
ok('R-74 guarda: o reprocesso de dia fechado e script com dry-run, backup e reversao; nunca toca em eventos de minimo', () => {
  const s = src('scripts/reprocessar-estado-isca-aud11.ts');
  assert.match(s, /DryRunRollback/);
  assert.match(s, /writeNdjson/);
  assert.match(s, /--revert/);
  assert.doesNotMatch(s, /DELETE FROM price_min_events/);
});

// ---- R-75 ----
ok('R-75: Open Box, vitrine e mostruario sao condicao nao nova; Outlet NAO (decisao do dono pendente)', () => {
  assert.equal(condicaoNaoNova('Resident Evil Village Standart PS5 BR Midia Fisica Open Box'), true);
  assert.equal(condicaoNaoNova('Xbox Series S Modelo Vitrine | 512GB'), true);
  assert.equal(condicaoNaoNova('PS5 DE VITRINE'), true);
  assert.equal(condicaoNaoNova('Console de mostruário Switch'), true);
  assert.equal(condicaoNaoNova('PS5 Slim Digital Outlet'), false);
  assert.equal(condicaoNaoNova('Expositor vitrine para action figures'), false);
  assert.equal(condicaoNaoNova('Controle PS5 DualSense'), false);
  assert.equal(condicaoNaoNova(null), false);
});
ok('R-75 guarda: a varredura roda no cron diario e o padrao SQL ainda casa os termos', () => {
  assert.match(src('src/app/api/cron/refresh-snapshots/route.ts'), /varrerCondicaoNaoNova\(true\)/);
  const re = new RegExp(CONDICAO_NAO_NOVA_PG.replace(/\[:space:\]/g, '\\s'), 'i');
  assert.ok(re.test('Jogo Open Box') && re.test('PS5 DE VITRINE') && re.test('mostruário'));
});

console.log(`${n} testes ok (R-71 a R-75)`);
