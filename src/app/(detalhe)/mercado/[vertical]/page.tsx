import { Paginacao } from '@/components/ui/paginacao';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { CartaoDepartamentoView } from '@/components/mercado/cartao-departamento';
import { exigirDepartamento } from '@/server/departamentos-rotas';
import { destaquesDepartamento, indiceTiposDepartamento, listarDepartamento, normalizarOrdem } from '@/server/queries/departamento';
import { ehPrioridade3d, prioridade3dLigada } from '@/lib/messaging/prioridade-3d';
import { departamentoPorSlug } from '@/lib/catalog/departamentos';
import { normalizarTipo, rotuloTipo, SECOES_3D } from '@/lib/catalog/tipos-produto';
import { secoes3dLigada } from '@/lib/catalog/guia-3d';
import { avisosCartoesImpressoras3d, guiaImpressoras3d } from '@/server/queries/guia-3d';
import { GuiaImpressoras3d } from '@/components/plus/guia-impressoras-3d';
import { Secoes3d } from '@/components/plus/secoes-3d';

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
  // Impressão 3D em 3 seções + guia (dono, 2026-11-15, #63/#111): só na vista padrão (sem busca, sem tipo, página 1). DEPT_3D_SECOES=off volta à página anterior.
  const modoSecoes = dept.slug === 'impressao3d' && secoes3dLigada() && !q && !tipo && pagina === 1;
  const vazio = { itens: [], total: 0, pagina: 1, totalPaginas: 1 };
  const [res, indice, secoes, guia, avisos3d] = await Promise.all([
    modoSecoes ? Promise.resolve(vazio) : listarDepartamento(dept.slug, { pagina, q, ordem, tipo }),
    indiceTiposDepartamento(dept.slug).catch(() => ({ porId: {}, tipos: [] })),
    modoSecoes
      ? Promise.all(SECOES_3D.map((s) => listarDepartamento(dept.slug, { pagina: 1, ordem: 'menor', tipo: s.slug }).catch(() => vazio)))
      : Promise.resolve(null),
    modoSecoes ? guiaImpressoras3d().catch(() => []) : Promise.resolve([]),
    dept.slug === 'impressao3d' ? avisosCartoesImpressoras3d() : Promise.resolve({} as Record<string, string[]>),
  ]);
  // Impressão 3D (dono, 2026-11-14): faixa de destaque com as Anycubic Kobra e Bambu Lab de menor preço (foto real, sem selo, sem mediana). Na vista em seções, a guia a substitui.
  const destaques3d = dept.slug === 'impressao3d' && !modoSecoes && prioridade3dLigada() && pagina === 1 && !q && !tipo
    ? (await destaquesDepartamento('impressao3d', 6).catch(() => [])).filter((m) => ehPrioridade3d('impressao3d', m.nome)).slice(0, 4)
    : [];
  const rotuloTipoAtivo = tipo ? rotuloTipo(dept.slug, tipo) : null;
  const totalDept = indice.tipos.reduce((a, t) => a + t.n, 0);

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
      </header>

      {!modoSecoes && indice.tipos.length > 1 ? (
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

      {modoSecoes && secoes ? (
        <>
          <nav aria-label="Seções da loja de Impressão 3D" className="-mx-4 mb-6 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-4 lg:mx-0 lg:px-0">
            <ul className="flex gap-2 overflow-x-auto py-2">
              {guia.length > 0 ? (
                <li className="shrink-0">
                  <a href="#guia" className={`${chipBase} ${chipOff}`}>Guia Bambu Lab</a>
                </li>
              ) : null}
              {SECOES_3D.map((sec, i) => (
                <li key={sec.slug} className="shrink-0">
                  <a href={`#${sec.ancora}`} className={`${chipBase} ${chipOff}`}>
                    {sec.rotulo} <span className="font-mono text-[12px] font-normal">{secoes[i].total}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <GuiaImpressoras3d itens={guia} />
          <Secoes3d
            dept={dept.slug}
            tipoCartao={dept.tipoCartao}
            avisos={avisos3d}
            secoes={SECOES_3D.map((sec, i) => ({ slug: sec.slug, rotulo: sec.rotulo, ancora: sec.ancora, total: secoes[i].total, itens: secoes[i].itens }))}
          />
        </>
      ) : null}

      {dept.slug === 'impressao3d' && secoes3dLigada() && (tipo || q || pagina > 1) ? (
        <Link href="/mercado/impressao3d" className="mb-4 inline-flex min-h-11 items-center text-[14px] font-bold text-[var(--color-accent-primary)] hover:underline">
          ← Voltar às seções da loja de Impressão 3D
        </Link>
      ) : null}

      {destaques3d.length > 0 ? (
        <div className="mb-8">
          <Text as="h2" variant="heading-sm" className="mb-3 font-bold">Em destaque: Anycubic Kobra e Bambu Lab</Text>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {destaques3d.map((m, i) => (
              <li key={`d-${m.id}`}>
                <CartaoDepartamentoView vertical={dept.slug} tipo={dept.tipoCartao} master={m} priority={i < 4} avisos={avisos3d[m.id]} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {modoSecoes ? null : res.itens.length === 0 ? (
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
                <CartaoDepartamentoView vertical={dept.slug} tipo={dept.tipoCartao} master={m} priority={i < 4} avisos={avisos3d[m.id]} />
              </li>
            ))}
          </ul>
          <Paginacao pagina={res.pagina} totalPaginas={res.totalPaginas} href={href} />
        </>
      )}
    </section>
  );
}
