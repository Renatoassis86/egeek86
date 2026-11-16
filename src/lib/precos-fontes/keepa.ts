// R-82, camada 2: Keepa (servico de precos de terceiros; cobre a Amazon BR, dominio 12). PURO: so interpreta a resposta da API.
// ATENCAO: o formato abaixo segue a documentacao publica da Keepa (stats.current em centavos, -1/-2 = sem preco; lastUpdate em "minutos Keepa").
// NAO foi conferido contra a API real (ainda sem chave): a primeira resposta real precisa passar por `scripts/medir-precos-fontes.ts --keepa-amostra` antes de ligar.
import type { LeituraExterna } from './resolver';

/** Minutos Keepa -> epoch ms (Keepa conta minutos desde 2011-01-01 UTC; +21564000 min = epoch Unix). */
export function keepaMinutosParaData(m: number): Date { return new Date((m + 21_564_000) * 60_000); }

export interface KeepaProduto { asin?: string; lastUpdate?: number; stats?: { current?: number[] } }
export interface KeepaResposta { products?: KeepaProduto[]; tokensLeft?: number; refillIn?: number; error?: { message?: string } }

const preco = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? Math.round(v) : null);

/** Uma leitura por produto. Preco = o da Amazon (indice 0); se a Amazon nao vende, o menor "novo" (indice 1). Sem preco = indisponivel. */
export function interpretarKeepa(resp: KeepaResposta, agora: Date): { leituras: Array<LeituraExterna & { asin: string }>; descartados: number } {
  const leituras: Array<LeituraExterna & { asin: string }> = [];
  let descartados = 0;
  for (const p of resp.products ?? []) {
    const asin = String(p.asin ?? '').toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) { descartados++; continue; }
    const cur = p.stats?.current ?? [];
    const valor = preco(cur[0]) ?? preco(cur[1]);
    const lidoEm = typeof p.lastUpdate === 'number' && p.lastUpdate > 0 ? keepaMinutosParaData(p.lastUpdate) : null;
    if (!lidoEm || lidoEm.getTime() > agora.getTime() + 5 * 60_000) { descartados++; continue; } // sem data confiavel ou no futuro: nao serve de prova
    leituras.push({ asin, fonte: 'keepa', precoCents: valor, pixCents: null, lidoEm, disponivel: valor != null });
  }
  return { leituras, descartados };
}
