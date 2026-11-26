/**
 * PISTA DE CUPOM DIGITADA PELO DONO (R-125). Grava em cupom_candidato com fonte 'dono'; nada e divulgado por aqui.
 * O codigo so vale depois de conferido NA LOJA (R-79: aba logada, Cupons > Inserir codigo) e de passar pelo cofre (R-64). Sem texto, foto ou link de terceiros.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/adicionar-pista-cupom.ts CODIGO [rede] [--pct=10] [--min=99.9] [--limite=30] [--restrito] [--dry]
 */
import { agregar } from '../src/lib/coupons/candidato';
import { candidatoDoDono } from '../src/lib/coupons/pista-dono';
import { gravarAgregados } from '../src/server/coupons/candidatos';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const num = (nome: string) => { const a = args.find((x) => x.startsWith(`--${nome}=`)); return a ? Number(a.split('=')[1]!.replace(',', '.')) : null; };

(async () => {
  const c = candidatoDoDono({ codigo: pos[0] ?? '', rede: pos[1] ?? 'mercado-livre', valorPercentual: num('pct'), minimoReais: num('min'), limiteReais: num('limite'), restrito: args.includes('--restrito') }, new Date());
  if (!c) { console.error('Codigo ou rede invalidos (codigo: 5 a 24 letras/numeros, ao menos uma letra; rede: mercado-livre, shopee, amazon, magalu, outra).'); process.exit(1); }
  console.log(`${args.includes('--dry') ? '[dry] ' : ''}pista: ${c.rede} ${c.codigo} pct=${c.valorNum ?? '-'} min=${c.minimoCents ?? '-'} limite=${c.limiteCents ?? '-'} restrito=${c.restrito}`);
  if (args.includes('--dry')) process.exit(0);
  const r = await gravarAgregados(agregar([c]));
  console.log(`gravado: ${r.novos} novo(s), ${r.atualizados} atualizado(s). Falta conferir na loja; a conferencia roda quando CUPOM_PISTAS_COMUNIDADE estiver ligada.`);
  process.exit(0);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
