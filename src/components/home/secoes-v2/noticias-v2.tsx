import Link from 'next/link';
import { getHomeArticles } from '@/components/home/secoes/noticias-home';
import { SessaoSimples } from './cartao-simples';

/** Idade máxima da matéria e quantidades da home (checklist #14). */
const JANELA_DIAS = 14;
const MAXIMO = 4;
const MINIMO = 3;

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/**
 * Notícias da nova landing (checklist #14): até 4 matérias publicadas nos últimos 14 dias, cada uma com data e fonte registrada
 * (a leitura de `getHomeArticles` já descarta matéria sem fonte, EG-16). Com menos de 3, a sessão some. Mesma leitura da
 * página /noticias (getPublishedArticles); sem scraping novo.
 */
export async function NoticiasV2() {
  const agora = Date.now();
  const limite = agora - JANELA_DIAS * 24 * 3600 * 1000;
  const todas = await getHomeArticles();
  const recentes = todas
    .map((a) => ({ a, quando: new Date(a.publishedAt ?? a.createdAt) }))
    .filter(({ quando }) => !Number.isNaN(quando.getTime()) && quando.getTime() >= limite && quando.getTime() <= agora + 3600 * 1000)
    .slice(0, MAXIMO);
  if (recentes.length < MINIMO) return null;
  return (
    <SessaoSimples id="noticias-recentes" titulo="Últimas notícias" subtitulo="Matérias dos últimos 14 dias, cada uma com a fonte.">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {recentes.map(({ a, quando }) => (
          <li key={a.id}>
            <article className="h-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <Link href={`/noticias/${a.slug}`} className="flex h-full min-h-11 flex-col gap-2 p-4 hover:bg-[var(--color-bg-inset)]">
                <h3 className="line-clamp-3 text-base font-bold leading-6 text-[var(--color-text-primary)]">{a.title}</h3>
                <p className="mt-auto text-xs leading-4 text-[var(--color-text-tertiary)]">
                  <time dateTime={quando.toISOString()}>{DATA.format(quando)}</time>
                  {' · Fonte: '}
                  {a.sourceName}
                </p>
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </SessaoSimples>
  );
}
