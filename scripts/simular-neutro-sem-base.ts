/**
 * SIMULAÇÃO (dry-run) do gatilho N1 'Preço agora' (dono, 2026-11-13). NÃO envia nada, NÃO grava nada, NÃO liga flag:
 * roda o detector de leitura (detectGroupCandidates, que "não escreve em lugar nenhum") com o N1 forçado SÓ nesta execução,
 * e lista até 10 candidatos reais de exemplo para o dono ver, com o texto exato do Telegram.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/simular-neutro-sem-base.ts [--n=10]
 */
import { detectGroupCandidates } from '../src/server/messaging/group-offers';

async function main() {
  const n = Number((process.argv.find((a) => a.startsWith('--n=')) ?? '--n=10').slice(4)) || 10;
  const r = await detectGroupCandidates({ neutro: true, history: [], includePlatform: false, cupom: false });
  const todos = r.candidates.filter((c) => c.trigger === 'N1');
  const enviaveis = todos.filter((c) => c.sendable && c.status === 'auto' && !c.held);
  console.log(`Produtos avaliados: ${r.counts.productsEvaluated}. N1 gerados: ${todos.length} (enviáveis automáticos: ${enviaveis.length}).`);
  const porLoja: Record<string, number> = {};
  for (const c of enviaveis) porLoja[c.vertical] = (porLoja[c.vertical] ?? 0) + 1;
  console.log('Por loja (enviáveis):', JSON.stringify(porLoja));
  const motivos: Record<string, number> = {};
  for (const b of r.blocked.filter((x) => x.trigger === 'N1')) for (const m of b.reasons.filter((x) => x !== 'preco_agora')) motivos[m] = (motivos[m] ?? 0) + 1;
  console.log('Barrados pelo N1 (motivo -> produtos, amostra de 200):', JSON.stringify(motivos));
  // Amostra: uma por loja primeiro (diversidade), depois o resto.
  const vistos = new Set<string>();
  const amostra = [...enviaveis.filter((c) => (vistos.has(c.vertical) ? false : (vistos.add(c.vertical), true))), ...enviaveis].filter((c, i, a) => a.indexOf(c) === i).slice(0, n);
  amostra.forEach((c, i) => {
    console.log(`\n--- Exemplo ${i + 1}/${amostra.length} | loja: ${c.vertical} | rede: ${c.networkName} | produto: ${c.name} | master: ${c.masterProductId}`);
    console.log(c.texts.telegram.replace(/<\/?(b|i)>/g, '').replace(/<a [^>]*>([^<]*)<\/a>/g, '$1').replace(/&amp;/g, '&'));
  });
  if (!amostra.length) console.log('\nNenhum N1 enviável neste momento (veja os motivos acima).');
  console.log('\nNada foi enviado nem gravado. Flag GROUP_NEUTRO_SEM_BASE continua desligada.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Falha na simulação:', e instanceof Error ? e.message : e);
  process.exit(1);
});
