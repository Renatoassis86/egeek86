/**
 * DRY-RUN do rodízio de reconferência das expiradas do ML (C6). SOMENTE LEITURA: escolhe uma amostra pelo mesmo SELECT/ordem do coletor,
 * lê cada catálogo na API oficial (1 chamada por catálogo, concorrência 2, pausa entre chamadas, recuo e parada em 429) e conta quantos
 * seriam REATIVADOS (resposta com vendedor 'new' e preço > 0 agora). Não grava nada em affiliate_offers.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/rodizio-expirados-dryrun.ts [amostra=100]
 */
import { connect } from './_dup-shared';
import { escolherRodizio, rodizioSelectSql, prioridadeRodizio, type RodizioCandidato } from '../src/lib/affiliate/rodizio-expirados';
import { getPriceSource } from '../src/server/collector/price-sources';
import '../src/server/collector/sources';

const AMOSTRA = Math.max(1, Math.min(200, Number(process.argv[2]) || 100));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sql = connect();
  try {
    const rows = (await sql.unsafe(rodizioSelectSql(12, AMOSTRA * 4))) as unknown as Array<RodizioCandidato & { lastCheckedAt: string | Date | null }>;
    const cands = escolherRodizio(
      rows.map((r) => ({ ...r, lastCheckedAt: r.lastCheckedAt ? new Date(r.lastCheckedAt) : null })),
      { limite: AMOSTRA }
    );
    const porPrio: Record<string, number> = {};
    for (const c of cands) porPrio[`p${prioridadeRodizio(c)}`] = (porPrio[`p${prioridadeRodizio(c)}`] ?? 0) + 1;
    console.log(`candidatos selecionados: ${cands.length} (pool lido: ${rows.length}) por prioridade:`, JSON.stringify(porPrio));

    const src = getPriceSource('mercado-livre');
    if (!src) throw new Error('fonte mercado-livre indisponível');
    let reativaria = 0, semVendedor = 0, erros = 0, chamadas = 0, parou: string | null = null;
    const amostraReativa: string[] = [];
    for (const c of cands) {
      if (parou) break;
      try {
        chamadas++;
        const res = await src.fetchSnapshots(c.externalRef);
        const comPreco = res.filter((r) => r.priceCents > 0);
        if (comPreco.length > 0) {
          reativaria++;
          if (amostraReativa.length < 8) amostraReativa.push(`${c.masterName.slice(0, 50)} | ${comPreco.length} vend | menor R$ ${(Math.min(...comPreco.map((r) => r.priceCents)) / 100).toFixed(2)}`);
        } else semVendedor++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        erros++;
        if (/429|rate.?limit/i.test(msg)) parou = 'rate_limit_429';
        else if (erros >= 8) parou = 'muitos_erros';
      }
      await sleep(350);
    }
    console.log(`chamadas: ${chamadas} | reativaria (preço > 0 agora): ${reativaria} | sem vendedor ativo: ${semVendedor} | erros: ${erros}${parou ? ` | PAROU: ${parou}` : ''}`);
    console.log('exemplos que reativariam:'); for (const a of amostraReativa) console.log('  ' + a);
    console.log('DRY-RUN: nada foi gravado.');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
