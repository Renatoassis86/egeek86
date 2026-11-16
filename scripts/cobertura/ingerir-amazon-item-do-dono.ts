/**
 * Cobertura por produto do dono (#57): ingere UMA leitura de pagina /dp/<ASIN> (feita pelo operador no Chrome, so leitura) pelo caminho oficial
 * ingestAmazonRows (identidade, porteiro, tag do dono, tipo de preco R-69). Padrao: simulacao. --apply grava.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/cobertura/ingerir-amazon-item-do-dono.ts --master <uuid> --asin B0... --titulo "..." --preco 512,90 --lista 979,90 --img <url> [--px 0|1] [--apply]
 */
import { ingestAmazonRows } from '@/server/collector/amazon-assisted';
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
async function main() {
  const id = arg('master'), a = arg('asin'), t = arg('titulo'), p = arg('preco');
  if (!id || !a || !t || !p) throw new Error('uso: --master --asin --titulo --preco [--lista --img --px] [--apply]');
  const px = arg('px') === '1' ? 1 : 0;
  const row = { id, r: [{ a, t, p, l: arg('lista') ?? null, s: 0, i: arg('img') ?? null, pg: 1, pl: 'oferta_em_destaque', px }] };
  const { stats, log } = await ingestAmazonRows([row], { tag: `cobertura-dono-${new Date().toISOString().slice(0, 10)}`, apply: APPLY });
  console.log(JSON.stringify(stats.contadores), JSON.stringify(log, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
