import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { areaDe } from '@/lib/catalog/cobertura/areas';
import { candidatosDeDestaques, escolherCategorias, parseCategoria, type CategoriaML } from '@/lib/catalog/cobertura/arvore-ml';
import { createMlClient } from '@/lib/catalog/vertical/ml-api';
import { POPULARIDADE_FONTE_ML, scoreDeRank } from '@/lib/popularidade/score';
import { getValidAccessToken } from './sources/mercado-livre-auth';

/**
 * Popularidade do Mercado Livre (R-103): os 20 MAIS VENDIDOS de cada categoria do departamento (`/highlights/MLB/category/{id}`, API oficial) viram
 * linhas em `offer_popularity` (rank, score 0..1). So LEITURA da API e escrita nessa tabela; nao cria nem altera master/oferta. Orcamento proprio e pequeno
 * por execucao (maxCalls) e pausa entre chamadas. Falha de uma categoria nunca derruba as outras.
 */
export interface ResultadoPopularidade { vertical: string; categorias: number; lidas: number; gravados: number; chamadas: number; erros: string[]; ms: number }

export async function coletarPopularidadeMl(vertical: string, opts: { maxCalls?: number; budgetMs?: number; dry?: boolean } = {}): Promise<ResultadoPopularidade> {
  const t0 = Date.now();
  const out: ResultadoPopularidade = { vertical, categorias: 0, lidas: 0, gravados: 0, chamadas: 0, erros: [], ms: 0 };
  const fonte = areaDe(vertical)?.fontes.ml;
  if (!fonte || !fonte.destaques || fonte.raizes.length === 0) { out.erros.push('sem_fonte_de_destaques'); out.ms = Date.now() - t0; return out; }
  const maxCalls = Math.max(5, Math.min(opts.maxCalls ?? 40, 80));
  const budgetMs = opts.budgetMs ?? 45_000;
  const client = createMlClient({ token: await getValidAccessToken(), maxCalls });
  const pausa = () => new Promise((r) => setTimeout(r, 250));
  const get = async (ep: string) => { const r = await client.get(ep); await pausa(); return r; };

  const arvore = new Map<string, CategoriaML>();
  for (const raiz of fonte.raizes) {
    const r = await get(`/categories/${raiz}`).catch(() => null);
    const n = r && r.status === 200 ? parseCategoria(r.json) : null;
    if (n) arvore.set(n.id, n); else out.erros.push(`categoria_${raiz}`);
  }
  if (fonte.profundidade >= 2) {
    for (const c of escolherCategorias(arvore, fonte.raizes, { profundidade: 1, minAnuncios: fonte.minAnuncios }).slice(0, 10)) {
      if (Date.now() - t0 > budgetMs * 0.4) break;
      const r = await get(`/categories/${c.id}`).catch(() => null);
      const n = r && r.status === 200 ? parseCategoria(r.json) : null;
      if (n) arvore.set(n.id, n);
    }
  }
  const categorias = escolherCategorias(arvore, fonte.raizes, { profundidade: fonte.profundidade, minAnuncios: fonte.minAnuncios, max: 25 });
  out.categorias = categorias.length;
  const [rede] = (await db.execute(sql`SELECT id::text AS id FROM affiliate_networks WHERE slug = 'mercado-livre' LIMIT 1`)) as unknown as Array<{ id: string }>;
  if (!rede) { out.erros.push('rede_ml_ausente'); out.ms = Date.now() - t0; return out; }

  for (const c of categorias) {
    if (Date.now() - t0 > budgetMs || client.remaining() < 2) break;
    const r = await get(`/highlights/MLB/category/${c.id}`).catch((e) => ({ status: 0, json: null, e }));
    if (r.status !== 200) { out.erros.push(`destaques_${c.id}_${r.status}`); continue; }
    const lista = candidatosDeDestaques(r.json);
    out.lidas += lista.length;
    if (opts.dry) continue;
    const total = Math.max(20, lista.length);
    for (const d of lista) {
      const rank = d.position;
      await db.execute(sql`
        INSERT INTO offer_popularity (network_id, external_ref, source, category_id, rank, list_size, score, observed_at)
        VALUES (${rede.id}::uuid, ${d.id}, ${POPULARIDADE_FONTE_ML}, ${c.id}, ${rank}, ${total}, ${scoreDeRank(rank, total)}, now())
        ON CONFLICT (network_id, external_ref, source) DO UPDATE SET category_id = EXCLUDED.category_id, rank = EXCLUDED.rank, list_size = EXCLUDED.list_size, score = EXCLUDED.score, observed_at = now()
        WHERE EXCLUDED.score >= offer_popularity.score OR offer_popularity.observed_at < now() - interval '1 day'`);
      out.gravados++;
    }
  }
  out.chamadas = client.used();
  out.ms = Date.now() - t0;
  return out;
}
