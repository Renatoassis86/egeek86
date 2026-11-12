/** Testes puros da guarda da aprovacao continua automatica (src/lib/aprovacao/auto-guarda.ts). npx tsx scripts/test-aprovacao-auto.ts */
import { guardaAuto, type EntradaAuto } from '../src/lib/aprovacao/auto-guarda';

let falhas = 0;
const check = (nome: string, ok: boolean, extra?: unknown) => { if (!ok) { falhas++; console.error('FALHOU:', nome, extra ?? ''); } };
const base: EntradaAuto = { motivo: 'produto_novo', rede: 'amazon', title: 'Jogo Resident Evil Village PS5 Mídia Física', vertical: 'games', plataforma: 'ps5', priceCents: 14990, refCents: null, nRefs: null };
const g = (o: Partial<EntradaAuto>) => guardaAuto({ ...base, ...o });

check('produto unico (sem referencia) passa', g({}) === null);
check('produto unico caro (sem referencia) passa', g({ priceCents: 999900, title: 'Smart TV Samsung 65 4K' , vertical: 'eletroeletronicos', plataforma: null }) === null);
for (const m of ['produto_novo', 'rascunho', 'cobertura', 'fronteira'] as const) check(`motivo ${m} passa`, g({ motivo: m }) === null);
for (const m of ['midia', 'modelo', 'armazenamento', 'preco', 'plus', 'dispersao'] as const) check(`motivo ${m} fica com o dono`, g({ motivo: m }) !== null);
check('shopee nao passa pelo cartao', g({ rede: 'shopee' }) === 'rede_fora:shopee');
check('sem preco lido', g({ priceCents: null }) === 'sem_preco_lido');
check('games sem plataforma', g({ plataforma: null }) === 'plataforma_desconhecida');
check('loja plus sem plataforma passa', g({ vertical: 'esporte', plataforma: null, title: 'Tenis Nike Air Max 90 Masculino' }) === null);
check('retro generico fora', g({ title: 'Console Retro Game Stick 10000 jogos' }) === 'retro_sem_marca_permitida');
check('retro "400 em 1" fora', g({ title: 'Mini Console 400 em 1 Portatil' }) === 'retro_sem_marca_permitida');
for (const marca of ['Hyperkin', 'Analogue', 'Retro-Bit', 'Retro Bit', '8BitDo']) check(`retro ${marca} passa`, g({ title: `${marca} Console Retro Novo` }) === null, marca);
check('preco 5x a media (4 refs) fica', g({ priceCents: 50000, refCents: 10000, nRefs: 4 }) === 'preco_fora_da_faixa_da_media');
check('preco 0,2x a media (4 refs) fica', g({ priceCents: 2000, refCents: 10000, nRefs: 4 }) === 'preco_fora_da_faixa_da_media');
check('preco 5x mas so 2 refs passa (referencia fraca)', g({ priceCents: 50000, refCents: 10000, nRefs: 2 }) === null);
check('preco normal com refs passa', g({ priceCents: 9000, refCents: 10000, nRefs: 6 }) === null);

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log('OK: aprovacao automatica (guarda)');
