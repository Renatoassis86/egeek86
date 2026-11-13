import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getVitrines } from '@/server/vitrines';
import { FaixaVitrine } from '@/components/vitrines/faixa-vitrine';
import { Text } from '@/components/ui/text';
import { chaveFaixa, type PlataformaVitrine, type VitrineItem } from '@/lib/vitrines/tipos';
import { VITRINE_REGRAS } from '@/lib/vitrines/regras';

/** Uma faixa de jogos por plataforma, empilhadas (dono, 2026-11-13); depois UMA faixa só de consoles com todos eles. */
const PLATAFORMAS: ReadonlyArray<{ plataforma: PlataformaVitrine; rotulo: string; href: string }> = [
  { plataforma: 'ps5', rotulo: 'PlayStation 5', href: '/ofertas?geracao=ps5' },
  { plataforma: 'ps4', rotulo: 'PlayStation 4', href: '/ofertas?geracao=ps4' },
  { plataforma: 'switch_2', rotulo: 'Nintendo Switch 2', href: '/ofertas?geracao=switch_2' },
  { plataforma: 'switch_1', rotulo: 'Nintendo Switch', href: '/ofertas?geracao=switch_1' },
  { plataforma: 'xbox_series', rotulo: 'Xbox Series', href: '/ofertas?geracao=xbox_series' },
  { plataforma: 'pc', rotulo: 'PC e portáteis', href: '/ofertas' },
];

const MAX_CONSOLES = 12;

function queda(i: VitrineItem): number {
  return i.posicao.tipo === 'abaixo' ? i.posicao.pct : 0;
}

function Faixa({ id, titulo, href, itens, rotulo }: { id: string; titulo: string; href: string; itens: VitrineItem[]; rotulo: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-3 flex min-h-[44px] flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <Text as="h2" id={`${id}-titulo`} variant="heading-lg" className="min-w-0 font-black tracking-tight">
          {titulo}
        </Text>
        <Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-semibold text-[var(--color-accent-primary)] hover:underline">
          Ver tudo <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <FaixaVitrine itens={itens} rotulo={rotulo} />
    </section>
  );
}

/**
 * Faixas de plataforma (checklist #11, revisado pelo dono em 2026-11-13): uma faixa de JOGOS para cada plataforma e, no fim, uma
 * única faixa de CONSOLES (todos os consoles de video game, de mesa e portáteis, juntos, ordenados pela maior queda sobre a média).
 * Só dado real: a vitrine que o servidor devolve oculta (menos de 4 itens elegíveis) some; nada é preenchido.
 */
export async function SecaoPlataformas() {
  const chaves = PLATAFORMAS.flatMap((p) => [chaveFaixa(p.plataforma, 'jogos'), chaveFaixa(p.plataforma, 'consoles')]);
  const lidas = await getVitrines(chaves);
  const itensDe = (chave: string): VitrineItem[] => {
    const r = lidas[chave];
    return r?.visivel ? r.itens : [];
  };

  const faixasJogos = PLATAFORMAS.map((p) => ({ ...p, itens: itensDe(chaveFaixa(p.plataforma, 'jogos')).slice(0, VITRINE_REGRAS.JOGOS_POR_FAIXA) })).filter((f) => f.itens.length > 0);

  // Consoles de todas as plataformas numa só lista, sem repetir produto, maior queda primeiro.
  const vistos = new Set<string>();
  const consoles = PLATAFORMAS.flatMap((p) => itensDe(chaveFaixa(p.plataforma, 'consoles')))
    .filter((i) => (vistos.has(i.masterProductId) ? false : (vistos.add(i.masterProductId), true)))
    .sort((a, b) => queda(b) - queda(a))
    .slice(0, MAX_CONSOLES);

  return (
    <>
      {faixasJogos.map((f) => (
        <Faixa key={f.plataforma} id={`faixa-${f.plataforma}`} titulo={`Jogos de ${f.rotulo}`} href={f.href} itens={f.itens} rotulo={`${f.rotulo}: jogos`} />
      ))}
      {consoles.length >= 4 ? <Faixa id="faixa-consoles" titulo="Consoles" href="/ofertas?tipo=console" itens={consoles} rotulo="Consoles de video game" /> : null}
    </>
  );
}
