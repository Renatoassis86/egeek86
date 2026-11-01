import Link from 'next/link';
import Image from 'next/image';
import { Newspaper } from 'lucide-react';

export interface TickerItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  cover: string | null;
  date: string;
}

function TickerList({ items, dup }: { items: TickerItem[]; dup?: boolean }) {
  return (
    <ul
      className={dup ? 'news-ticker-dup' : undefined}
      aria-hidden={dup || undefined}
    >
      {items.map((a) => (
        <li key={a.id} className="pb-3">
          <Link
            href={`/noticias/${a.slug}`}
            tabIndex={dup ? -1 : undefined}
            className="group flex items-stretch gap-3 border border-white/15 bg-white/[0.07] p-2.5 backdrop-blur-md transition-colors hover:border-amber-400/70 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span className="relative block size-20 shrink-0 overflow-hidden bg-[#1c0c32] sm:size-24">
              {a.cover ? (
                <Image
                  src={a.cover}
                  alt=""
                  fill
                  sizes="96px"
                  loading="lazy"
                  className="object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-amber-300/70">
                  <Newspaper className="size-7" aria-hidden />
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-300">
                {a.category}
              </span>
              <span className="line-clamp-2 text-[15px] font-bold leading-snug text-white group-hover:text-amber-200">
                {a.title}
              </span>
              <span className="font-mono text-[11px] text-zinc-300">{a.date}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Carrossel vertical (baixo para cima) de notícias reais. Só CSS; sem JS no cliente. */
export function NewsTicker({ items, className }: { items: TickerItem[]; className?: string }) {
  if (items.length === 0) return null;
  const duration = Math.max(24, items.length * 9);
  return (
    <aside aria-label="Últimas notícias" className={className}>
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-300">
          <span className="size-1.5 bg-amber-400" aria-hidden />
          Últimas notícias
        </span>
        <Link
          href="/noticias"
          className="text-xs font-bold text-zinc-200 underline decoration-amber-400/60 underline-offset-4 hover:text-amber-200"
        >
          Ver todas
        </Link>
      </div>
      <div
        className="news-ticker relative h-[300px] overflow-hidden sm:h-[340px] lg:h-[460px] [mask-image:linear-gradient(to_bottom,transparent,#000_12%,#000_88%,transparent)]"
      >
        <div
          className="news-ticker-track"
          style={{ ['--ticker-duration' as string]: `${duration}s` }}
        >
          <TickerList items={items} />
          <TickerList items={items} dup />
        </div>
      </div>
    </aside>
  );
}
