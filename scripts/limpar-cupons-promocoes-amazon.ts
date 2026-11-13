/**
 * LIMPEZA do incidente "Relógios x Resident Evil 2" (2026-11-13): fecha os coupon_items da Amazon originados do laço de promoções (conditions.promo_id)
 * que são falso positivo (produto fora do departamento da promoção) e os que nunca tiveram validação na página do item. Backup NDJSON + log de reversão.
 *   Simular (padrão, só SELECT): npx tsx --conditions=react-server --env-file=.env.local scripts/limpar-cupons-promocoes-amazon.ts
 *   Aplicar:                     ... scripts/limpar-cupons-promocoes-amazon.ts --apply
 * Falso positivo (departamento incompatível) -> state 'invalido' (nunca volta); compatível mas sem confirmação no item -> 'vencido' (volta pelo fluxo novo).
 * Lista as mensagens JÁ ENVIADAS a grupos que citam essas ofertas (não apaga nada no Telegram).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';

async function main() {
  const apply = process.argv.includes('--apply');
  const { db } = await import('../src/lib/db');
  const { departamentoCompativel } = await import('../src/lib/coupons/amazon-promocoes');
  const { registrarSemCupom } = await import('../src/server/coupons/amazon-promocoes');
  const q = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => (await db.execute<T>(s)) as unknown as T[];

  type Row = { id: string; state: string; promo: string; raw_text: string; oid: string | null; asin: string; vert: string | null; otitle: string | null; vu: string };
  const rows = await q<Row>(sql`
    SELECT ci.id::text AS id, ci.state, ci.conditions->>'promo_id' AS promo, ci.raw_text, ci.scope->'offer_ids'->>0 AS oid, ci.scope->'item_ids'->>0 AS asin,
      COALESCE(o.vertical, mp.vertical) AS vert, o.title AS otitle, ci.valid_until::text AS vu
    FROM coupon_items ci LEFT JOIN affiliate_offers o ON o.id = (ci.scope->'offer_ids'->>0)::uuid LEFT JOIN master_products mp ON mp.id = o.master_product_id
    WHERE ci.network_slug = 'amazon' AND ci.source_kind <> 'manual_dono' AND ci.conditions->>'promo_id' IS NOT NULL AND ci.state IN ('nao_verificado', 'verificado')`);
  const categoria = (raw: string) => /\|\s*([^|]+?)\s*$/.exec(raw)?.[1] ?? null;
  const falsos = rows.filter((r) => !departamentoCompativel(categoria(r.raw_text), r.vert));
  const semConf = rows.filter((r) => !falsos.includes(r));
  console.log(`abertos de promoção: ${rows.length}; falso positivo (departamento): ${falsos.length}; compatíveis sem validação no item: ${semConf.length}`);
  console.table(semConf.map((r) => ({ promo: r.promo, cat: categoria(r.raw_text), vert: r.vert, produto: (r.otitle ?? '').slice(0, 50) })));
  const porPromo = new Map<string, number>();
  for (const r of falsos) porPromo.set(`${categoria(r.raw_text)}`, (porPromo.get(`${categoria(r.raw_text)}`) ?? 0) + 1);
  console.table([...porPromo].map(([cat, n]) => ({ cat, falsos: n })));

  // mensagens já enviadas citando as ofertas dos falsos (e dos demais)
  const oids = [...new Set(rows.map((r) => r.oid).filter((x): x is string => !!x))];
  type Msg = { id: string; offer_id: string; status: string; trigger: string | null; sent_at: string | null; created_at: string; grp: string | null; head: string };
  const cols = (await q<{ column_name: string }>(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'group_messages'`)).map((c) => c.column_name);
  console.log('group_messages colunas:', cols.join(','));
  const grpCol = ['group_id', 'group_key', 'target', 'chat_id', 'vertical'].find((c) => cols.includes(c));
  const msgs = oids.length
    ? await q<Msg>(sql`
        SELECT g.id::text AS id, g.offer_id::text AS offer_id, g.status, g.trigger, g.sent_at::text AS sent_at, g.created_at::text AS created_at,
          ${grpCol ? sql.raw(`g.${grpCol}::text`) : sql`NULL`} AS grp, left(replace(g.text_body, E'\\n', ' '), 140) AS head
        FROM group_messages g WHERE g.offer_id IN (${sql.join(oids.map((i) => sql`${i}::uuid`), sql`, `)})
          AND g.created_at > now() - interval '3 days' AND g.text_body ~* '(Só no app|desconto em|Promoção da Amazon|cupom)' ORDER BY g.created_at`)
    : [];
  console.log(`\nmensagens (3 dias) sobre essas ofertas que citam cupom/promoção: ${msgs.length}`);
  console.table(msgs.map((m) => ({ id: m.id.slice(0, 8), status: m.status, trig: m.trigger, grp: m.grp, enviada_em: m.sent_at, texto: m.head })));

  if (!apply) { console.log('\n(simulação: nada foi gravado; use --apply)'); process.exit(0); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '../docs/backups');
  const full = await q<Record<string, unknown>>(sql`SELECT * FROM coupon_items WHERE id IN (${sql.join(rows.map((r) => sql`${r.id}::uuid`), sql`, `)})`);
  fs.writeFileSync(path.join(dir, `limpar-cupons-promocoes-amazon-${stamp}.ndjson`), full.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const alvo = (lista: Row[]) => sql.join(lista.map((r) => sql`${r.id}::uuid`), sql`, `);
  let nInv = 0, nVenc = 0;
  if (falsos.length) {
    nInv = (await q(sql`UPDATE coupon_items SET state = 'invalido', state_reason = 'falso_positivo_departamento_incompativel_2026-11-13', verified_at = NULL, updated_at = now()
      WHERE id IN (${alvo(falsos)}) RETURNING id`)).length;
  }
  if (semConf.length) {
    nVenc = (await q(sql`UPDATE coupon_items SET state = 'vencido', state_reason = 'sem_validacao_no_item_2026-11-13', verified_at = NULL, updated_at = now()
      WHERE id IN (${alvo(semConf)}) RETURNING id`)).length;
  }
  const negativas = await registrarSemCupom(rows.map((r) => r.oid));
  const log = {
    quando: new Date().toISOString(), invalidos: nInv, vencidos: nVenc, leituras_sem_cupom_gravadas: negativas,
    reversao: 'UPDATE coupon_items SET state/state_reason/verified_at/updated_at a partir do NDJSON de mesmo carimbo (coluna state, state_reason, verified_at); as leituras sem_cupom (offer_coupon_reads source amazon-promocoes) podem ser apagadas por read_at >= quando.',
    ids_invalidos: falsos.map((r) => r.id), ids_vencidos: semConf.map((r) => r.id),
    mensagens_enviadas: msgs.filter((m) => m.status === 'enviada').map((m) => ({ id: m.id, grupo: m.grp, enviada_em: m.sent_at, texto: m.head })),
  };
  fs.writeFileSync(path.join(dir, `limpar-cupons-promocoes-amazon-log-${stamp}.json`), JSON.stringify(log, null, 2));
  console.log(`\naplicado: ${nInv} inválidos, ${nVenc} vencidos, ${negativas} leituras sem_cupom. Backup e log em docs/backups/ (${stamp}).`);
  process.exit(0);
}
main().catch((e) => { console.error(e.cause?.message ?? e); process.exit(1); });
