/**
 * Descoberta por promoção da Amazon (games): DRY-RUN e APLICAÇÃO pelo caminho existente (`descobrirPelaPromocao` -> vitrine -> ingestão Amazon).
 * Dono, 2026-11-14: só usado e retrô barram; o resto entra no banco.
 *
 *   npx tsx --env-file=.env.local scripts/promo-descoberta-dryrun.ts            # dry-run: nada gravado
 *   npx tsx --env-file=.env.local scripts/promo-descoberta-dryrun.ts --apply    # grava master novo + oferta pelo caminho de ingestão
 *
 * Os cards abaixo foram lidos das páginas de produto (/dp/<ASIN>) pela aba da Amazon do dono (só leitura) em 2026-11-14, promoção A2B9F6KRH7YF1H
 * (Exclusivo Prime, 25% na finalização). O preço é o de PRATELEIRA (a ingestão e a mediana nunca usam o preço derivado).
 */
import { descobrirPelaPromocao, type CardPromoNovo } from '../src/server/collector/amazon-vitrine';

const APPLY = process.argv.includes('--apply');
// --so=ASIN1,ASIN2 limita os cards. Granblue (B0H2NCHDPH) e Octopath Traveler (B0H8Q5JK5Y) ficam FORA por padrão: em 2026-11-14 o box ativo das páginas deles era
// 'Usado - Como novo' (Amazon Quase Novo); usado é a restrição do dono. Voltam quando a página mostrar oferta NOVA.
const SO = (process.argv.find((a) => a.startsWith('--so=')) ?? '').slice(5).split(',').filter(Boolean);
const USADO_AGORA = new Set(['B0H2NCHDPH', 'B0H8Q5JK5Y']);
const todos: CardPromoNovo[] = [
  { asin: 'B0H2NCHDPH', titulo: 'Granblue Fantasy: Relink Endless Ragnarok - Nintendo Switch 2', priceCents: 30837, listCents: 36990 },
  { asin: 'B0G6QNXFG8', titulo: 'LEGO Batman: O Legado do Cavaleiros das Trevas - Nintendo Switch 2', priceCents: 45265, listCents: 49990 },
  { asin: 'B0H8Q5JK5Y', titulo: 'Octopath Traveler - Nintendo Switch 2', priceCents: 29990, listCents: 34990 },
  // já existem como oferta nossa: devem aparecer como "atualizados", nunca como master novo
  { asin: 'B0H8Q6S9H3', titulo: 'Octopath Traveler II - Nintendo Switch 2', priceCents: 29990, listCents: null },
  { asin: 'B0FK7YV5RB', titulo: 'Pac-Man World 2: Re-Pac - Nintendo Switch 2', priceCents: 15989, listCents: null },
  { asin: 'B0FK8D2W2C', titulo: 'Pac-Man World 2: Re-Pac - Nintendo Switch', priceCents: 15990, listCents: null },
  { asin: 'B0G88JLN1K', titulo: 'Mega Man Star Force Legacy Collection - Nintendo Switch', priceCents: 16990, listCents: null },
];

const cards = todos.filter((c) => (SO.length ? SO.includes(c.asin) : !USADO_AGORA.has(c.asin)));

async function main() {
  console.log('cards:', cards.map((c) => c.asin).join(','));
  const st = await descobrirPelaPromocao(cards, { tag: process.env.AMAZON_ASSOCIATE_TAG || 'manusmonteiro-20', apply: APPLY });
  console.log(APPLY ? 'APLICADO' : 'DRY-RUN (nada gravado)');
  console.log(JSON.stringify({ cartoes: st.cartoes, atualizados: st.atualizados, masters_novos: st.masters_novos, novos_ativos: st.novos_ativos ?? 0, rascunhos_novos: st.rascunhos_novos, delegados: st.delegados, descartados: st.descartados, erros: st.erros, ingest: st.ingest }, null, 2));
  for (const p of st.previstos) console.log(`  previsto: ${p.asin} | ${p.titulo} -> ${p.destino}`);
  if (APPLY) { console.log('masters criados:', st.criados.masters); console.log('ofertas criadas (rascunho):', st.criados.ofertas); }
  process.exit(0);
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
