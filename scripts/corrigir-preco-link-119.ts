/**
 * #119: divergência de preço e anúncio pausado. Mede, preenche link_item_id (anúncio do link, lido do registro das trocas do gerador de links)
 * e reconfirma pela API OFICIAL (catálogo, lote pequeno) as ofertas dos combos Bambu (P2S, P1S, A1) do Mercado Livre.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/corrigir-preco-link-119.ts            # dry-run (só mede e planeja)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/corrigir-preco-link-119.ts --apply --por=<quem>
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/corrigir-preco-link-119.ts --rollback=docs/backups/<arquivo>.ndjson
 *
 * --apply: (1) link_item_id das ofertas ML a partir de collector_runs ml-links-assistida (campo `old` da troca) ou da URL direta;
 * (2) por master de combo, lê TODOS os catálogos do master (paginado, com pausa e parada no 429), e para cada oferta ativa do vendedor:
 *     achou anúncio do vendedor -> grava preço do anúncio (o do link, se estiver na lista; senão o mais barato) com external_item_id,
 *     carimba last_price_confirmed_at e alinha o link; NÃO achou em nenhum catálogo (listas completas) -> status 'expired' (pausado/encerrado).
 * Backup NDJSON (estado anterior de cada linha tocada) em docs/backups ANTES; --rollback restaura as colunas tocadas (snapshots de preço
 * gravados ficam: são histórico append-only). Nunca imprime token.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { getValidAccessToken } from '../src/server/collector/sources/mercado-livre-auth';
import { recordPriceSnapshot } from '../src/server/collector/record-price-snapshot';
import { alinharLinkAoAnuncio } from '../src/server/collector/link-do-anuncio';

const APPLY = process.argv.includes('--apply');
const POR = process.argv.find((a) => a.startsWith('--por='))?.slice(6) ?? '';
const ROLLBACK = process.argv.find((a) => a.startsWith('--rollback='))?.slice(11);
const COMBO = 'P2S.*Combo|P1S.*Combo|A1 Combo';
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Item { item_id: string; seller_id: number; price: number; original_price: number | null; condition: string | null }
type Linha = Record<string, unknown>;

async function main() {
  const sql = connect();
  try {
    if (ROLLBACK) {
      const linhas = fs.readFileSync(ROLLBACK, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Linha);
      let n = 0;
      for (const l of linhas) {
        await sql`UPDATE affiliate_offers SET status = ${l.status as string}::affiliate_offer_status, external_item_id = ${(l.external_item_id as string | null) ?? null}, link_item_id = ${(l.link_item_id as string | null) ?? null},
          affiliate_url = ${l.affiliate_url as string}, affiliate_link_pending = ${l.affiliate_link_pending as boolean}, current_price_cents = ${l.current_price_cents as number}, previous_price_cents = ${(l.previous_price_cents as number | null) ?? null},
          last_price_confirmed_at = ${(l.last_price_confirmed_at as string | null) ?? null}, last_checked_at = ${(l.last_checked_at as string | null) ?? null}, consecutive_miss_count = ${l.consecutive_miss_count as number}, item_trocado_at = ${(l.item_trocado_at as string | null) ?? null}
          WHERE id = ${l.id as string}::uuid`;
        n++;
      }
      console.log(`rollback: ${n} ofertas restauradas de ${ROLLBACK}`);
      return;
    }
    if (APPLY && !POR) throw new Error('--apply exige --por=<quem>');

    // ---------- 1) Medição (SELECT) ----------
    console.log('== Ofertas ativas por rede: confirmação de preço');
    console.table(await sql`SELECT n.slug AS rede, count(*)::int ativas,
      count(*) FILTER (WHERE o.last_price_confirmed_at IS NULL)::int conf_nula,
      count(*) FILTER (WHERE o.last_price_confirmed_at < now() - interval '60 minutes')::int conf_mais_60m,
      count(*) FILTER (WHERE o.last_price_confirmed_at < now() - interval '6 hours')::int conf_mais_6h,
      count(*) FILTER (WHERE o.consecutive_miss_count > 0)::int sumiu_da_api,
      count(*) FILTER (WHERE o.external_item_id IS NULL)::int sem_item_id
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active' AND o.current_price_cents > 0 GROUP BY 1 ORDER BY 2 DESC`);
    console.log('== Impressoras 3D (ML/Amazon/Shopee)');
    console.table(await sql`SELECT n.slug AS rede, count(*)::int ativas, count(*) FILTER (WHERE o.last_price_confirmed_at IS NULL)::int conf_nula,
      count(*) FILTER (WHERE o.last_price_confirmed_at < now() - interval '60 minutes')::int conf_mais_60m, count(*) FILTER (WHERE o.last_price_confirmed_at < now() - interval '6 hours')::int conf_mais_6h,
      count(*) FILTER (WHERE o.consecutive_miss_count > 0)::int sumiu_da_api
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.status = 'active' AND o.vertical = 'impressao3d' AND o.current_price_cents > 0 AND o.quarantined_at IS NULL GROUP BY 1`);
    console.log('== Mensagens de grupo/canal enviadas nas últimas 24 h sem reconferência ao vivo nos 60 min anteriores ao envio (aproximação: live_checked_at)');
    console.table(await sql`SELECT count(*)::int enviadas, count(*) FILTER (WHERE live_checked_at IS NULL OR sent_at - live_checked_at > interval '60 minutes')::int sem_reconferencia_60m,
      count(*) FILTER (WHERE o.last_price_confirmed_at IS NULL OR o.last_price_confirmed_at < m.sent_at - interval '6 hours')::int oferta_sem_confirmacao_ate_hoje
      FROM group_messages m LEFT JOIN affiliate_offers o ON o.id = m.offer_id WHERE m.status = 'sent' AND m.sent_at > now() - interval '24 hours'`);
    console.log('== Cards do PRIVADO nas últimas 24 h (lista-impressoras-queda) e estado atual da oferta');
    console.table(await sql`SELECT left(q.meta->>'oferta', 8) AS oferta, q.started_at AS enviado_em, o.status::text, s.nickname AS loja, o.current_price_cents, o.previous_price_cents, o.external_item_id, o.link_item_id,
        o.last_price_confirmed_at, o.consecutive_miss_count AS miss, left(o.affiliate_url, 28) AS link
      FROM collector_runs q JOIN affiliate_offers o ON o.id = (q.meta->>'oferta')::uuid LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE q.job = 'lista-impressoras-queda' AND q.started_at > now() - interval '24 hours' ORDER BY q.started_at`);

    // ---------- 2) Plano ----------
    const [{ n: semLink }] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre' WHERE o.link_item_id IS NULL AND o.status = 'active'`;
    console.log(`== link_item_id: ofertas ML ativas sem o campo: ${semLink}`);

    const masters = await sql<{ id: string; name: string }[]>`SELECT DISTINCT m.id::text, m.name FROM master_products m JOIN affiliate_offers o ON o.master_product_id = m.id JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
      WHERE o.status = 'active' AND o.vertical = 'impressao3d' AND m.name ~* ${COMBO}`;
    console.log(`== masters de combo: ${masters.map((m) => m.name.slice(0, 40)).join(' | ')}`);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const arq = `docs/backups/corrigir-preco-link-119-${stamp}.ndjson`;
    const salvas = new Set<string>();
    const guardar = async (ids: string[]) => {
      const novos = ids.filter((i) => !salvas.has(i));
      if (!novos.length || !APPLY) return;
      const rows = await sql`SELECT id::text, status::text, external_item_id, link_item_id, affiliate_url, affiliate_link_pending, current_price_cents::int, previous_price_cents::int, last_price_confirmed_at, last_checked_at, consecutive_miss_count::int, item_trocado_at FROM affiliate_offers WHERE id IN ${sql(novos)}`;
      fs.mkdirSync('docs/backups', { recursive: true });
      fs.appendFileSync(arq, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      novos.forEach((i) => salvas.add(i));
    };

    // (1) link_item_id: do registro do gerador de links (campo old da troca) e da URL direta
    const alvoLink = await sql<{ id: string; item: string }[]>`
      SELECT x.id, x.item FROM (
        SELECT DISTINCT ON (t->>'id') (t->>'id') AS id, 'MLB' || substring(t->>'old' from '/MLB-?([0-9]{6,})') AS item
        FROM collector_runs r, jsonb_array_elements(r.meta->'trocas') t
        WHERE r.job = 'ml-links-assistida' AND t->>'old' ~ '/MLB-?[0-9]{6,}' ORDER BY t->>'id', r.started_at DESC
      ) x JOIN affiliate_offers o ON o.id = x.id::uuid WHERE o.link_item_id IS NULL AND o.affiliate_url LIKE 'https://meli.la/%'`;
    const [{ n: diretas }] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM affiliate_offers WHERE link_item_id IS NULL AND affiliate_url ~ '^https://produto[.]mercadolivre[.]com[.]br/MLB-?[0-9]{6,}'`;
    console.log(`PLANO link_item_id: ${alvoLink.length} por registro do gerador (meli.la) + ${diretas} por URL direta`);
    if (APPLY) {
      const diretasIds = await sql<{ id: string }[]>`SELECT id::text FROM affiliate_offers WHERE link_item_id IS NULL AND affiliate_url ~ '^https://produto[.]mercadolivre[.]com[.]br/MLB-?[0-9]{6,}'`;
      const ids = [...alvoLink.map((a) => a.id), ...diretasIds.map((a) => a.id)];
      for (let i = 0; i < ids.length; i += 500) await guardar(ids.slice(i, i + 500));
      for (const a of alvoLink) await sql`UPDATE affiliate_offers SET link_item_id = ${a.item} WHERE id = ${a.id}::uuid AND link_item_id IS NULL`;
      await sql`UPDATE affiliate_offers SET link_item_id = 'MLB' || substring(affiliate_url from '/MLB-?([0-9]{6,})') WHERE link_item_id IS NULL AND affiliate_url ~ '^https://produto[.]mercadolivre[.]com[.]br/MLB-?[0-9]{6,}'`;
      console.log('link_item_id preenchido.');
    }

    // (2) combos pela API oficial
    const token = await getValidAccessToken();
    const log: Record<string, number> = { masters: masters.length, ofertas: 0, reconfirmadas: 0, troca_de_anuncio: 0, link_realinhado: 0, expiradas_pausadas: 0, sem_acao_lista_incompleta: 0 };
    const detalhe: string[] = [];
    let parar = false;
    for (const m of masters) {
      if (parar) break;
      const refs = (await sql<{ r: string }[]>`SELECT DISTINCT o.external_ref AS r FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre' WHERE o.master_product_id = ${m.id}::uuid AND o.external_ref ~ '^MLB[0-9]+$' AND o.status = 'active'`).map((x) => x.r);
      const porVendedor = new Map<string, Item[]>();
      let completo = true;
      for (const ref of refs) {
        for (let off = 0; ; off += 100) {
          await dormir(350);
          const res = await fetch(`https://api.mercadolibre.com/products/${ref}/items?limit=100&offset=${off}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.status === 429) { parar = true; completo = false; console.error('429: parando o lote'); break; }
          if (res.status === 404 && off === 0) break;
          if (res.status !== 200) { completo = false; break; }
          const d = (await res.json()) as { results?: Item[]; paging?: { total?: number } };
          for (const it of d.results ?? []) if (it.condition === 'new') porVendedor.set(String(it.seller_id), [...(porVendedor.get(String(it.seller_id)) ?? []), it]);
          if (off + 100 >= (d.paging?.total ?? 0)) break;
        }
        if (parar) break;
      }
      const ofertas = await sql<{ id: string; seller: string; link_item_id: string | null; url_item: string | null; ext: string | null; cents: number; nick: string | null }[]>`
        SELECT o.id::text, s.external_seller_id AS seller, o.link_item_id, CASE WHEN o.affiliate_url ~* 'meli[.]la|/p/MLB' THEN NULL ELSE 'MLB' || substring(o.affiliate_url from '/MLB-?([0-9]{6,})') END AS url_item,
               o.external_item_id AS ext, o.current_price_cents::int AS cents, s.nickname AS nick
        FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre' JOIN affiliate_sellers s ON s.id = o.seller_id
        WHERE o.master_product_id = ${m.id}::uuid AND o.status = 'active' AND o.vertical = 'impressao3d'`;
      for (const o of ofertas) {
        log.ofertas++;
        const itens = (porVendedor.get(o.seller) ?? []).sort((a, b) => a.price - b.price);
        const link = o.link_item_id ?? o.url_item;
        const escolhido = itens.find((i) => i.item_id === link) ?? itens[0];
        if (!escolhido) {
          if (!completo) { log.sem_acao_lista_incompleta++; continue; }
          detalhe.push(`PAUSADA/ENCERRADA ${o.nick ?? o.seller} oferta ${o.id.slice(0, 8)} preço ${o.cents} link ${link ?? 'desconhecido'}: vendedor fora de TODOS os catálogos do master`);
          log.expiradas_pausadas++;
          if (APPLY) { await guardar([o.id]); await sql`UPDATE affiliate_offers SET status = 'expired', updated_at = now() WHERE id = ${o.id}::uuid AND status = 'active'`; }
          continue;
        }
        const cents = Math.round(escolhido.price * 100);
        const troca = !!o.ext && o.ext !== escolhido.item_id;
        if (troca) log.troca_de_anuncio++;
        if (o.cents !== cents || troca || (link && link !== escolhido.item_id)) detalhe.push(`${o.nick ?? o.seller} ${o.id.slice(0, 8)}: ${o.cents} -> ${cents} anúncio ${escolhido.item_id}${link && link !== escolhido.item_id ? ` (link era ${link})` : ''}`);
        if (!APPLY) continue;
        await guardar([o.id]);
        await recordPriceSnapshot({ offerId: o.id, priceCents: cents, listPriceCents: escolhido.original_price != null ? Math.round(escolhido.original_price * 100) : null, source: 'api', itemId: escolhido.item_id });
        await sql`UPDATE affiliate_offers SET last_checked_at = now(), last_price_confirmed_at = now(), consecutive_miss_count = 0 WHERE id = ${o.id}::uuid`;
        log.reconfirmadas++;
        if (await alinharLinkAoAnuncio(o.id, escolhido.item_id)) log.link_realinhado++;
      }
    }
    console.log(detalhe.slice(0, 60).join('\n'));
    console.log(APPLY ? 'APLICADO' : 'DRY-RUN (nada gravado)', JSON.stringify(log), APPLY ? `backup: ${arq}` : '');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
export {};
