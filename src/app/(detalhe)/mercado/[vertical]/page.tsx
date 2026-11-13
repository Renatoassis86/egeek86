import { Paginacao } from '@/components/ui/paginacao';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { CartaoDepartamentoView } from '@/components/mercado/cartao-departamento';
import { exigirDepartamento } from '@/server/departamentos-rotas';
import { indiceTiposDepartamento, listarDepartamento, normalizarOrdem } from '@/server/queries/departamento';
import { canaisDaLoja } from '@/server/plus';
import { lojaPlusPorDept } from '@/lib/catalog/plus';
import { departamentoPorSlug } from '@/lib/catalog/departamentos';
import { normalizarTipo, rotuloTipo } from '@/lib/catalog/tipos-produto';

// Dinâmica por flag no banco; fora de sitemap e sem generateStaticParams (renderização sob demanda).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ vertical: string }>;
  searchParams: Promise<{ tipo?: string | string[] }>;
}): Promise<Metadata> {
  const { vertical } = await params;
  const sp = await searchParams;
  const d = departamentoPorSlug(vertical);
  const tipo = d ? normalizarTipo(d.slug, Array.isArray(sp.tipo) ? sp.tipo[0] : sp.tipo) : null;
  const rotuloT = d && tipo ? rotuloTipo(d.slug, tipo) : null;
  return { title: d ? (rotuloT ? `${rotuloT} em ${d.rotulo}` : d.rotulo) : 'Departamento', robots: { index: false, follow: false } };
}

export default async function DepartamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ vertical: string }>;
  searchParams: Promise<{ q?: string | string[]; pagina?: string | string[]; ordem?: string | string[]; tipo?: string | string[] }>;
}) {
  const { vertical } = await params;
  const dept = await exigirDepartamento(vertical); // 404 se fechado, < 3 masters ou trava mestra desligada
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.slice(0, 80) ?? '';
  const pagina = Number(Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina) || 1;
  const ordem = normalizarOrdem(Array.isArray(sp.ordem) ? sp.ordem[0] : sp.ordem);
  const tipo = normalizarTipo(dept.slug, Array.isArray(sp.tipo) ? sp.tipo[0] : sp.tipo);
  const [res, indice] = await Promise.all([
    listarDepartamento(dept.slug, { pagina, q, ordem, tipo }),
    indiceTiposDepartamento(dept.slug).catch(() => ({ porId: {}, tipos: [] })),
  ]);
  const rotuloTipoAtivo = tipo ? rotuloTipo(dept.slug, tipo) : null;
  const totalDept = indice.tipos.reduce((a, t) => a + t.n, 0);
  const loja = lojaPlusPorDept(dept.slug);
  const canais = loja ? await canaisDaLoja(loja.storeSlug) : { telegramUrl: null, whatsappUrl: null };

  const hrefCom = (t: string | null, p: number) => {
    const qs = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(t ? { tipo: t } : {}),
      ...(ordem !== 'ofertas' ? { ordem } : {}),
      ...(p > 1 ? { pagina: String(p) } : {}),
    }).toString();
    return `/mercado/${dept.slug}${qs ? `?${qs}` : ''}`;
  };
  const href = (p: number) => hrefCom(tipo, p);
  const chipBase = 'inline-flex min-h-11 shrink-0 items-center gap-2 border px-3 text-[13px] font-bold focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]';
  const chipOn = 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]';
  const chipOff = 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-primary)]';

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <header className="mb-6 flex flex-col gap-2 border-l-2 border-[var(--color-accent-primary)] pl-4">
        <Text variant="label" color="tertiary">
          <Link href="/plus" className="hover:underline">Espaço Geek Plus</Link> / Departamento
        </Text>
        <Text as="h1" variant="display-md" className="font-black tracking-tight">{dept.rotulo}</Text>
        <Text variant="body-md" color="secondary">
          {dept.descricao} Preços do Mercado Livre e da Shopee, só de anúncios com link ativo e verificados nas últimas horas.
        </Text>
        {canais.telegramUrl || canais.whatsappUrl ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-[var(--color-text-tertiary)]">Avisos de preço desta loja:</span>
            {canais.telegramUrl ? (
              <a href={canais.telegramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center border border-[var(--color-border-default)] px-3 hover:border-[var(--color-accent-primary)]">Telegram</a>
            ) : null}
            {canais.whatsappUrl ? (
              <a href={canais.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center border border-[var(--color-border-default)] px-3 hover:border-[var(--color-accent-primary)]">WhatsApp</a>
            ) : null}
          </div>
        ) : null}
      </header>

      {indice.tipos.length > 1 ? (
        <nav aria-label={`Tipos de produto em ${dept.rotulo}`} className="mb-4">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
            <li className="shrink-0">
              <Link href={hrefCom(null, 1)} aria-current={!tipo ? 'page' : undefined} className={`${chipBase} ${!tipo ? chipOn : chipOff}`}>
                Todos <span className="font-mono text-[12px] font-normal">{totalDept}</span>
              </Link>
            </li>
            {indice.tipos.map((t) => (
              <li key={t.slug} className="shrink-0">
                <Link href={hrefCom(t.slug, 1)} aria-current={tipo === t.slug ? 'page' : undefined} className={`${chipBase} ${tipo === t.slug ? chipOn : chipOff}`}>
                  {t.rotulo} <span className="font-mono text-[12px] font-normal">{t.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <form method="get" action={`/mercado/${dept.slug}`} role="search" className="mb-6 flex flex-wrap gap-2">
        {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
        <label htmlFor="q" className="sr-only">Buscar em {dept.rotulo}</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          maxLength={80}
          placeholder={`Buscar em ${rotuloTipoAtivo ?? dept.rotulo}`}
          className="h-11 w-full max-w-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
        />
        <label htmlFor="ordem" className="sr-only">Ordenar por</label>
        <select
          id="ordem"
          name="ordem"
          defaultValue={ordem}
          className="h-11 border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 text-[14px] text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
        >
          <option value="ofertas">Mais ofertas</option>
          <option value="menor">Menor preço</option>
          <option value="maior">Maior preço</option>
          <option value="nome">Nome (A a Z)</option>
        </select>
        <Button type="submit" variant="secondary" size="md">Aplicar</Button>
      </form>

      {res.itens.length === 0 ? (
        <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6">
          <Text variant="body-md" color="secondary">
            {q ? `Nenhum produto de ${rotuloTipoAtivo ?? dept.rotulo} encontrado para "${q}".` : 'Nenhum produto com oferta verificada agora.'}
          </Text>
          {q || tipo ? (
            <Link href={`/mercado/${dept.slug}`} className="mt-3 inline-block text-[14px] underline underline-offset-2">{q ? 'Limpar busca' : 'Ver todos os tipos'}</Link>
          ) : null}
        </div>
      ) : (
        <>
          <Text variant="caption" color="tertiary" className="mb-3 block">
            {rotuloTipoAtivo ? `${rotuloTipoAtivo} · ` : ''}{res.total} {res.total === 1 ? 'produto' : 'produtos'} · página {res.pagina} de {res.totalPaginas}
          </Text>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {res.itens.map((m, i) => (
              <li key={m.id}>
                <CartaoDepartamentoView vertical={dept.slug} tipo={dept.tipoCartao} master={m} priority={i < 4} />
              </li>
            ))}
          </ul>
          <Paginacao pagina={res.pagina} totalPaginas={res.totalPaginas} href={href} />
        </>
      )}
    </section>
  );
}
