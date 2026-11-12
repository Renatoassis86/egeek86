import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { REINTENTO_DIAS, TETO_TENTATIVAS, ordenarFilaLinks, rotuloPrioridade, urlDoAnuncio, type FilaRow } from '@/lib/ml-links/fila';

/** Janela de candidatos lida do banco antes da ordenação por tipo (feita em TS, sobre o título do master). */
const JANELA = 8000;

let tabelaCache: { em: number; existe: boolean } | null = null;
/** A tabela ml_link_falhas (migração 0047) existe? Tolerante à migração ausente; cache de 60 s. */
export async function tabelaFalhasExiste(): Promise<boolean> {
  if (tabelaCache && Date.now() - tabelaCache.em < 60_000) return tabelaCache.existe;
  let existe = false;
  try {
    const r = await db.execute<{ t: string | null }>(sql`SELECT to_regclass('public.ml_link_falhas')::text AS t`);
    existe = !!r[0]?.t;
  } catch { existe = false; }
  tabelaCache = { em: Date.now(), existe };
  return existe;
}
export function esquecerCacheTabela() { tabelaCache = null; }

function condFalhas(existe: boolean): { join: SQL; where: SQL } {
  if (!existe) return { join: sql``, where: sql`` };
  return {
    join: sql`LEFT JOIN ml_link_falhas f ON f.offer_id = o.id`,
    where: sql`AND (f.offer_id IS NULL OR (f.tentativas < ${TETO_TENTATIVAS} AND f.ultima_tentativa < now() - make_interval(days => (CASE f.motivo
        WHEN 'nao_elegivel' THEN ${REINTENTO_DIAS.nao_elegivel} WHEN 'erro_pagina' THEN ${REINTENTO_DIAS.erro_pagina} ELSE ${REINTENTO_DIAS.sem_resultado} END)::int)))`,
  };
}

export interface FilaLinks {
  items: { id: string; url: string }[];
  /** itens da janela cuja única URL é de catálogo (sem id de anúncio): fora da fila, não dá para gerar link */
  semUrlDeItem: number;
  resumo: Record<string, number>;
  tabelaFalhas: boolean;
}

/** Fila priorizada de links: Plus antes de games; mais barata de cada produto primeiro; ticket alto primeiro; sem falha recente. */
export async function listarFilaLinks(n: number): Promise<FilaLinks> {
  const existe = await tabelaFalhasExiste();
  const { join, where } = condFalhas(existe);
  const rows = await db.execute<{ id: string; master_id: string; vertical: string; nome: string; price: string; rn: string; ext: string | null; aurl: string }>(sql`
    SELECT t.id, t.master_id, t.vertical, t.nome, t.price::text AS price, t.rn::text AS rn, t.ext, t.aurl FROM (
      SELECT o.id::text AS id, o.master_product_id::text AS master_id, m.vertical, m.name AS nome, o.current_price_cents AS price,
             row_number() OVER (PARTITION BY o.master_product_id ORDER BY o.current_price_cents ASC, o.id) AS rn,
             o.external_item_id AS ext, o.affiliate_url AS aurl
      FROM affiliate_offers o
      JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
      JOIN master_products m ON m.id = o.master_product_id
      LEFT JOIN affiliate_sellers sl ON sl.id = o.seller_id
      ${join}
      WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = m.vertical
        AND COALESCE(sl.reputation_level, '') NOT IN ('1_red', '2_orange')
        AND (m.vertical = 'games' OR (m.attributes->'catalogGate'->>'verdict') = 'approved')
        AND o.current_price_cents > 0 AND o.affiliate_url NOT LIKE 'https://meli.la/%'
        AND o.affiliate_url ~ '^https://(produto|www)\\.mercadolivre\\.com\\.br/'
        AND (m.attributes->'catalogGate'->>'verdict') IS DISTINCT FROM 'review'
        ${where}
    ) t ORDER BY (t.vertical = 'games') ASC, t.rn ASC, t.price DESC, t.master_id LIMIT ${JANELA}`);

  const urls = new Map<string, string>();
  let semUrlDeItem = 0;
  const cand: FilaRow[] = [];
  for (const r of rows) {
    const url = urlDoAnuncio(r.ext, r.aurl);
    if (!url) { semUrlDeItem++; continue; }
    urls.set(r.id, url);
    cand.push({ id: r.id, masterId: r.master_id, vertical: r.vertical, nome: r.nome, priceCents: Number(r.price), rn: Number(r.rn) });
  }
  const ord = ordenarFilaLinks(cand);
  const resumo: Record<string, number> = {};
  for (const r of ord) { const k = rotuloPrioridade(r); resumo[k] = (resumo[k] ?? 0) + 1; }
  return { items: ord.slice(0, n).map((r) => ({ id: r.id, url: urls.get(r.id)! })), semUrlDeItem, resumo, tabelaFalhas: existe };
}

/** Registra falhas (upsert; tentativas+1). Só para oferta ativa do ML ainda sem meli.la. Devolve quantas gravou, ou null se a tabela não existe. */
export async function registrarFalhas(skips: { id: string; motivo: string }[]): Promise<number | null> {
  if (!skips.length) return 0;
  if (!(await tabelaFalhasExiste())) return null;
  let n = 0;
  try {
    for (const s of skips) {
      const r = await db.execute<{ offer_id: string }>(sql`
        INSERT INTO ml_link_falhas (offer_id, motivo, tentativas, ultima_tentativa)
        SELECT o.id, ${s.motivo}, 1, now() FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id AND nn.slug = 'mercado-livre'
        WHERE o.id = ${s.id}::uuid AND o.status = 'active' AND o.affiliate_url NOT LIKE 'https://meli.la/%'
        ON CONFLICT (offer_id) DO UPDATE SET motivo = EXCLUDED.motivo, tentativas = ml_link_falhas.tentativas + 1, ultima_tentativa = now()
        RETURNING offer_id`);
      if (r[0]) n++;
    }
  } catch (e) { esquecerCacheTabela(); console.error('[ml-links] falha ao registrar falhas', e); return null; }
  return n;
}
