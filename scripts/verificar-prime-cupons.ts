/**
 * VERIFICAÇÃO SOMENTE LEITURA da cadeia "Promoção Prime 25% (Jogo Barato) + cupons da Amazon", elo por elo (rastreio 2026-11-15,
 * docs/rastreio-prime-cupons-2026-11-15.md). Não grava nada, não envia nada, não imprime token nem connection string.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/verificar-prime-cupons.ts
 *
 * Código de saída 0 mesmo com elos pendentes (é um painel); cada linha diz OK / PENDENTE e o motivo.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';

const PROMO_PRIME = 'A2B9F6KRH7YF1H';
const SITE = 'https://www.egeek86.com';
const linhas: { elo: string; estado: 'OK' | 'PENDENTE' | 'INFO'; detalhe: string }[] = [];
const reg = (elo: string, estado: 'OK' | 'PENDENTE' | 'INFO', detalhe: string) => { linhas.push({ elo, estado, detalhe }); console.log(`${estado.padEnd(8)} ${elo.padEnd(34)} ${detalhe}`); };
const md5 = (s: string) => crypto.createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const idade = (d: unknown) => (d ? `${Math.round((Date.now() - new Date(d as string).getTime()) / 60000)} min` : 'nunca');

async function main() {
  const sql = connect();
  try {
    // (1) LOOP no ar x repositório + batimento
    try {
      const vivo = await (await fetch(`${SITE}/loops/amazon-promocoes.js`, { cache: 'no-store' })).text();
      const repo = fs.readFileSync(path.resolve('public/loops/amazon-promocoes.js'), 'utf8');
      reg('1 loop: arquivo no ar = repositório', md5(vivo) === md5(repo) ? 'OK' : 'PENDENTE', md5(vivo) === md5(repo) ? `iguais (${/VERSAO = '([^']+)'/.exec(repo)?.[1]})` : 'diferem: falta deploy do commit do loop (a aba só roda o que for reinjetado)');
    } catch (e) { reg('1 loop: arquivo no ar = repositório', 'PENDENTE', `falha ao buscar: ${(e as Error).message}`); }
    const hb = await sql<{ started_at: Date; status: string; versao: string | null; estado: string | null; motivo: string | null }[]>`
      SELECT started_at, status, meta->>'versao' AS versao, meta->>'estado' AS estado, meta->>'motivo' AS motivo
      FROM collector_runs WHERE job = 'cupons-batimento' AND network = 'amazon' AND meta->>'versao' LIKE 'promocoes-%' ORDER BY started_at DESC LIMIT 1`;
    const h = hb[0];
    reg('1 loop: batimento promocoes-* (≤ 40 min)', h && Date.now() - h.started_at.getTime() < 40 * 60000 ? 'OK' : 'PENDENTE', h ? `${h.versao} ${h.estado}/${h.motivo ?? '-'} há ${idade(h.started_at)}` : 'nenhum batimento promocoes-*');

    // (2) INGEST: job real = 'cupons-assistida' (network amazon, meta.origem = amazon-promocoes); só grava quando há cupom casado
    const runs = await sql<{ n: number; ult: Date | null }[]>`
      SELECT count(*)::int AS n, max(started_at) AS ult FROM collector_runs
      WHERE job = 'cupons-assistida' AND network = 'amazon' AND meta->>'origem' = 'amazon-promocoes' AND started_at > now() - interval '24 hours'`;
    reg('2 ingest: execuções gravadas em 24 h', runs[0].n > 0 ? 'OK' : 'PENDENTE', `${runs[0].n} (job "cupons-assistida", origem amazon-promocoes; última há ${idade(runs[0].ult)}; só registra com cupom casado)`);

    // (3) DECISÃO: coupon_items da promoção Prime
    const ci = await sql<{ state: string; n: number; prime: number; vdesc: number }[]>`
      SELECT state, count(*)::int AS n, count(*) FILTER (WHERE conditions->>'prime_checkout' = 'true')::int AS prime,
             count(*) FILTER (WHERE conditions->>'validade_desconhecida' = 'true')::int AS vdesc
      FROM coupon_items WHERE network_slug = 'amazon' AND conditions->>'promo_id' = ${PROMO_PRIME} GROUP BY state`;
    const total = ci.reduce((a, r) => a + r.n, 0);
    reg(`3 decisão: coupon_items ${PROMO_PRIME}`, total > 0 ? 'OK' : 'PENDENTE', total > 0 ? ci.map((r) => `${r.state}=${r.n} (prime ${r.prime}, sem prazo ${r.vdesc})`).join('; ') : '0 linhas: a aba ainda não enviou cards da promoção (ver __promo.status().linhas)');
    const primeAll = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM coupon_items WHERE network_slug = 'amazon' AND conditions->>'prime_checkout' = 'true'`;
    reg('3 decisão: promoções Prime no banco (todas)', primeAll[0].n > 0 ? 'OK' : 'PENDENTE', `${primeAll[0].n} coupon_items com prime_checkout`);

    // (4) AGULHA/MENSAGEM
    const conf = await sql<{ n: number; ult: Date | null }[]>`
      SELECT count(*)::int AS n, max(read_at) AS ult FROM offer_coupon_reads
      WHERE source = 'amazon-item-confirmado' AND price_with_coupon_cents IS NOT NULL AND campaign_id = ${PROMO_PRIME} AND read_at > now() - interval '120 minutes'`;
    reg('4 agulha: confirmações na página (120 min)', conf[0].n > 0 ? 'OK' : 'PENDENTE', `${conf[0].n} ofertas com confirmação fresca da ${PROMO_PRIME}`);
    const msgs = await sql<{ status: string; n: number }[]>`
      SELECT g.status, count(*)::int AS n FROM group_messages g JOIN affiliate_offers o ON o.id = g.offer_id JOIN affiliate_networks n ON n.id = o.network_id
      WHERE g.trigger = 'CUPOM' AND n.slug = 'amazon' AND g.created_at > now() - interval '7 days' GROUP BY g.status`;
    const prime = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM group_messages g JOIN affiliate_offers o ON o.id = g.offer_id JOIN affiliate_networks n ON n.id = o.network_id
      WHERE g.trigger = 'CUPOM' AND n.slug = 'amazon' AND g.created_at > now() - interval '7 days' AND g.text_body ILIKE '%Prime%' AND g.status IN ('enviada', 'proposta', 'proposta_auto')`;
    reg('4 mensagem: CUPOM da Amazon em 7 dias', msgs.length ? 'OK' : 'PENDENTE', msgs.length ? msgs.map((m) => `${m.status}=${m.n}`).join(', ') : '0 mensagens CUPOM da Amazon (nenhuma, nunca)');
    reg('4 mensagem: CUPOM Prime (texto "Prime")', prime[0].n > 0 ? 'OK' : 'PENDENTE', `${prime[0].n} propostas/enviadas`);

    // (5) FRONT: a mesma consulta da vitrine (pool.ts carregarPromosPrime) e o HTML do departamento Games
    const vit = await sql<{ n: number }[]>`
      SELECT count(DISTINCT ci.scope->'offer_ids'->>0)::int AS n
      FROM coupon_items ci JOIN offer_coupon_reads r ON r.offer_id = (ci.scope->'offer_ids'->>0)::uuid AND r.campaign_id = ci.conditions->>'promo_id'
        AND r.source = 'amazon-item-confirmado' AND r.price_with_coupon_cents IS NOT NULL AND r.read_at > now() - interval '120 minutes'
      WHERE ci.network_slug = 'amazon' AND ci.state = 'verificado' AND ci.audience = 'assinantes' AND ci.conditions->>'prime_checkout' = 'true'
        AND (ci.valid_until IS NULL OR ci.valid_until > now()) AND (ci.valid_from IS NULL OR ci.valid_from <= now())`;
    reg('5 front: ofertas Prime elegíveis na vitrine', vit[0].n > 0 ? 'OK' : 'PENDENTE', `${vit[0].n} (cupom verificado + confirmação ≤ 120 min; exige PROMO_PRIME_DERIVADA=on na Vercel)`);
    try {
      const html = await (await fetch(`${SITE}/games`, { cache: 'no-store' })).text();
      const m = (html.match(/Prime/g) ?? []).length;
      reg('5 front: /games menciona "Prime"', m > 0 ? 'OK' : 'PENDENTE', `${m} ocorrências no HTML (cache de 5 min)`);
    } catch (e) { reg('5 front: /games menciona "Prime"', 'PENDENTE', (e as Error).message); }

    // (6) ofertas-alvo no catálogo (os 4 ASINs do concorrente)
    const alvo = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE nn.slug = 'amazon' AND o.status = 'active' AND o.external_ref IN ('amazon-B0FK8D2W2C', 'amazon-B0FK7YV5RB', 'amazon-B0G88JLN1K', 'amazon-B0H8Q6S9H3')`;
    reg('6 catálogo: 4 jogos do concorrente ativos', alvo[0].n === 4 ? 'OK' : 'PENDENTE', `${alvo[0].n}/4`);
    reg('6 flags (Vercel, valores ocultos)', 'INFO', 'PROMO_PRIME_DERIVADA, PROMO_DESCOBERTA, GROUP_PROMO_PRIME: só provadas por efeito (linhas 3/4/5 acima); `vercel env ls production` mostra só os nomes');
    const pend = linhas.filter((l) => l.estado === 'PENDENTE').length;
    console.log(`\n${linhas.length - pend} itens ok/info, ${pend} pendentes. (somente leitura)`);
  } finally { await sql.end(); }
}
main().catch((e) => { console.error('falha:', e instanceof Error ? e.message.slice(0, 200) : e); process.exit(1); });
