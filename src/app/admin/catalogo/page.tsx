import Link from 'next/link';
import { Download } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { isVertical, type Vertical } from '@/lib/catalog/verticais';
import {
  LOJAS, MAX_PAGES, PAGE_SIZE, ROTULO_REDE, ROTULO_STATUS, REDES_FILTRO, STATUS_PORTEIRO, caminhoProduto, deltaSerie, parseFiltros, rotuloLoja,
  type Filtros, type LojaTotais,
} from '@/lib/catalog/inventario';
import { carregarEvolucao, carregarLinhas, carregarTotaisLojas } from '@/server/queries/catalogo-inventario';

/**
 * Catálogo de tudo que vendemos, por loja (decisão do dono, 2026-11-11). Somente leitura; só admin (o layout do admin
 * já chama requireAdmin). Números vêm do banco no instante da abertura; a evolução diária vem de catalog_inventory_snapshots.
 * Cantos retos (padrão visual).
 */
export const dynamic = 'force-dynamic';

const nfmt = (n: number) => n.toLocaleString('pt-BR');
const pctTxt = (p: number | null) => (p == null ? '—' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const money = (c: number | null) => (c == null ? '—' : formatBRL(c));
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function href(loja: Vertical, f: Partial<Filtros>): string {
  const p = new URLSearchParams();
  p.set('loja', loja);
  if (f.q) p.set('q', f.q);
  if (f.marca) p.set('marca', f.marca);
  if (f.rede) p.set('rede', f.rede);
  if (f.status) p.set('status', f.status);
  if (f.link) p.set('link', f.link);
  if (f.sort && f.sort !== 'nome') p.set('sort', f.sort);
  if (f.page && f.page > 1) p.set('page', String(f.page));
  return `/admin/catalogo?${p.toString()}`;
}

const th = 'px-3 py-3 text-caption font-medium text-[var(--color-text-tertiary)] whitespace-nowrap';
const td = 'px-3 py-2.5 align-top text-[13px] text-[var(--color-text-secondary)]';
const wrap = 'overflow-x-auto border border-[var(--color-border-subtle)]';
const headRow = 'border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]';
const bodyRow = 'border-b border-[var(--color-border-subtle)] last:border-b-0';
const ctl = 'h-10 border border-[var(--color-border-default)] bg-[var(--color-bg-inset)] px-3 text-[14px] text-[var(--color-text-primary)]';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
      <div className="text-caption text-[var(--color-text-tertiary)]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</div>
      {sub ? <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">{sub}</div> : null}
    </div>
  );
}

function Cabecalho({ t }: { t: LojaTotais }) {
  const faixa = t.menorPrecoCents == null ? '—' : `${money(t.menorPrecoCents)} a ${money(t.maiorPrecoCents)}`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Produtos aprovados" value={nfmt(t.mastersAprovados)} sub={`${nfmt(t.mastersRevisao)} em revisão, ${nfmt(t.mastersRejeitados)} rejeitados`} />
      <Tile
        label="Ofertas ativas"
        value={nfmt(t.ofertasAtivas)}
        sub={`ML ${nfmt(t.ofertasMl)} / Shopee ${nfmt(t.ofertasShopee)} / Amazon ${nfmt(t.ofertasAmazon)}${t.ofertasOutras ? ` / outras ${nfmt(t.ofertasOutras)}` : ''}`}
      />
      <Tile label="Faixa de preço (ofertas ativas)" value={faixa} />
      <Tile label="Com link oficial de afiliado" value={pctTxt(t.pctLinkOficial)} sub={`${nfmt(t.ofertasOficiais)} de ${nfmt(t.ofertasAtivas)} ofertas (ML: meli.la)`} />
      <Tile label="Aprovados com média única" value={pctTxt(t.pctComMedia)} sub={`${nfmt(t.mastersComMedia)} de ${nfmt(t.mastersAprovados)}`} />
      <Tile label="Última coleta" value={dataHora(t.ultimaColeta)} sub="mais recente entre as ofertas ativas" />
    </div>
  );
}

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lojaParam = Array.isArray(sp.loja) ? sp.loja[0] : sp.loja;
  const loja: Vertical = isVertical(lojaParam) ? lojaParam : 'games';
  const f = parseFiltros(sp);

  const [totais, lista, evolucao] = await Promise.all([
    carregarTotaisLojas(),
    carregarLinhas({ vertical: loja, filtros: f, limit: PAGE_SIZE, offset: (f.page - 1) * PAGE_SIZE }),
    carregarEvolucao(loja, 14),
  ]);
  const t = totais[loja];
  const paginas = Math.min(MAX_PAGES, Math.max(1, Math.ceil(lista.total / PAGE_SIZE)));
  const teveCorte = lista.total > MAX_PAGES * PAGE_SIZE;
  const dAprov = deltaSerie(evolucao, 'mastersAprovados');
  const dMl = deltaSerie(evolucao, 'ofertasMl');
  const filtrado = Boolean(f.q || f.marca || f.rede || f.status || f.link);
  // O CSV respeita os filtros da tela (sem ordem/página): exporta tudo o que casa, não só a página aberta.
  const eq = new URLSearchParams({ loja });
  for (const k of ['q', 'marca', 'rede', 'status', 'link'] as const) if (f[k]) eq.set(k, f[k]);
  const exportQs = eq.toString();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">
          Catálogo por loja
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Tudo o que vendemos, por loja. Somente leitura; números ao vivo do banco. Produto fundido em outro não é contado.
        </Text>
      </div>

      <nav className="flex flex-wrap gap-1" aria-label="Lojas">
        {LOJAS.map((l) => {
          const ativo = l.slug === loja;
          return (
            <Link
              key={l.slug}
              href={`/admin/catalogo?loja=${l.slug}`}
              aria-current={ativo ? 'page' : undefined}
              className={
                'flex h-10 items-center gap-2 border px-3 text-[14px] font-medium ' +
                (ativo
                  ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] text-[var(--color-accent-primary)]'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]')
              }
            >
              {l.rotulo}
              <span className="text-[12px] tabular-nums opacity-70">{nfmt(totais[l.slug].mastersAprovados)}</span>
            </Link>
          );
        })}
      </nav>

      <Cabecalho t={t} />

      <form method="get" action="/admin/catalogo" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="loja" value={loja} />
        <label className="flex flex-col gap-1 text-caption text-[var(--color-text-tertiary)]">
          Nome ou GTIN
          <input name="q" defaultValue={f.q} maxLength={80} className={`${ctl} w-56`} placeholder="buscar..." />
        </label>
        <label className="flex flex-col gap-1 text-caption text-[var(--color-text-tertiary)]">
          Marca
          <input name="marca" defaultValue={f.marca} maxLength={60} className={`${ctl} w-40`} />
        </label>
        <label className="flex flex-col gap-1 text-caption text-[var(--color-text-tertiary)]">
          Rede
          <select name="rede" defaultValue={f.rede} className={ctl}>
            <option value="">Todas</option>
            {REDES_FILTRO.map((r) => (
              <option key={r} value={r}>
                {ROTULO_REDE[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-[var(--color-text-tertiary)]">
          Porteiro
          <select name="status" defaultValue={f.status} className={ctl}>
            <option value="">Todos</option>
            {STATUS_PORTEIRO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-[var(--color-text-tertiary)]">
          Link oficial
          <select name="link" defaultValue={f.link} className={ctl}>
            <option value="">Todos</option>
            <option value="com">Tem oferta com link oficial</option>
            <option value="sem">Tem oferta sem link oficial</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-[var(--color-text-tertiary)]">
          Ordem
          <select name="sort" defaultValue={f.sort} className={ctl}>
            <option value="nome">Nome</option>
            <option value="ofertas">Mais ofertas</option>
            <option value="preco">Menor preço</option>
          </select>
        </label>
        <button type="submit" className="h-10 border border-[var(--color-accent-primary)] bg-[var(--color-accent-primary-muted)] px-4 text-[14px] font-medium text-[var(--color-accent-primary)]">
          Filtrar
        </button>
        {filtrado ? (
          <Link href={`/admin/catalogo?loja=${loja}`} className="flex h-10 items-center px-2 text-[14px] text-[var(--color-text-secondary)] underline">
            Limpar
          </Link>
        ) : null}
        <div className="ml-auto flex gap-2">
          <a
            href={`/api/admin/catalogo/export?${exportQs}`}
            className="flex h-10 items-center gap-2 border border-[var(--color-border-default)] px-3 text-[14px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]"
          >
            <Download className="size-4" aria-hidden /> CSV {filtrado ? '(filtro atual)' : `completo de ${rotuloLoja(loja)}`}
          </a>
          <a
            href={`/api/admin/catalogo/export?loja=${loja}&formato=pt`}
            className="flex h-10 items-center border border-[var(--color-border-default)] px-3 text-[14px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
            title="Separador ponto e vírgula e vírgula decimal, para abrir direto no Excel em português"
          >
            CSV para Excel (pt-BR)
          </a>
        </div>
      </form>

      <Text variant="body-sm" color="secondary">
        {nfmt(lista.total)} produtos{filtrado ? ' com o filtro atual' : ''}. Página {f.page} de {paginas}.
        {teveCorte ? ` A tela mostra até ${MAX_PAGES} páginas; use filtros ou o CSV para ver o resto.` : ''}
      </Text>

      <div className={wrap}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={headRow}>
              <th className={th}>Produto</th>
              <th className={th}>Marca / modelo</th>
              <th className={th}>Plataforma / tipo</th>
              <th className={`${th} text-right`}>ML</th>
              <th className={`${th} text-right`}>Shopee</th>
              <th className={`${th} text-right`}>Amazon</th>
              <th className={`${th} text-right`}>Menor preço</th>
              <th className={`${th} text-right`}>Média única</th>
              <th className={th}>Última coleta</th>
              <th className={th}>Porteiro</th>
              <th className={th}>Links</th>
            </tr>
          </thead>
          <tbody>
            {lista.linhas.length === 0 ? (
              <tr>
                <td className={td} colSpan={11}>
                  Nenhum produto com esses filtros.
                </td>
              </tr>
            ) : (
              lista.linhas.map((l) => {
                const caminho = caminhoProduto(l);
                const semOficial = l.ofertasTotal > l.ofertasOficiais;
                return (
                  <tr key={l.id} className={bodyRow}>
                    <td className={`${td} max-w-[360px] text-[var(--color-text-primary)]`}>
                      {l.nome}
                      {l.chave ? <div className="mt-0.5 break-all text-[11px] text-[var(--color-text-tertiary)]">{l.chave}</div> : null}
                    </td>
                    <td className={td}>
                      {l.marca ?? '—'}
                      {l.modelo ? <div className="text-[12px]">{l.modelo}</div> : null}
                    </td>
                    <td className={td}>
                      {l.plataforma ?? '—'}
                      {l.tipo ? <div className="text-[12px]">{l.tipo}</div> : null}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{l.ofertasMl}</td>
                    <td className={`${td} text-right tabular-nums`}>{l.ofertasShopee}</td>
                    <td className={`${td} text-right tabular-nums`}>{l.ofertasAmazon}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      {money(l.menorPrecoCents)}
                      {l.redeMenorPreco ? <div className="text-[11px] text-[var(--color-text-tertiary)]">{ROTULO_REDE[l.redeMenorPreco] ?? l.redeMenorPreco}</div> : null}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {money(l.mediaCents)}
                      {l.mediaDia ? <div className="text-[11px] text-[var(--color-text-tertiary)]">em {l.mediaDia.slice(8, 10)}/{l.mediaDia.slice(5, 7)}</div> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{dataHora(l.ultimaColeta)}</td>
                    <td className={td}>
                      <span
                        className={
                          'inline-block border px-2 py-0.5 text-[11px] ' +
                          (l.status === 'approved'
                            ? 'border-[var(--color-accent-success)] text-[var(--color-accent-success)]'
                            : l.status === 'review'
                              ? 'border-[var(--color-border-strong)] text-[var(--color-text-primary)]'
                              : 'border-[var(--color-accent-danger)] text-[var(--color-accent-danger)]')
                        }
                      >
                        {ROTULO_STATUS[l.status]}
                      </span>
                      {l.ofertasTotal > 0 ? (
                        <div className="mt-1 text-[11px]">{semOficial ? `${l.ofertasTotal - l.ofertasOficiais} sem link oficial` : 'link oficial ok'}</div>
                      ) : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {caminho ? (
                        <Link href={caminho} className="underline" target="_blank">
                          Produto
                        </Link>
                      ) : (
                        '—'
                      )}
                      {l.ofertaBaratoUrl ? (
                        <div>
                          <a href={l.ofertaBaratoUrl} className="underline" target="_blank" rel="noopener noreferrer">
                            Mais barata
                          </a>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-[14px]">
        {f.page > 1 ? (
          <Link href={href(loja, { ...f, page: f.page - 1 })} className="border border-[var(--color-border-default)] px-3 py-2">
            Anterior
          </Link>
        ) : null}
        {f.page < paginas ? (
          <Link href={href(loja, { ...f, page: f.page + 1 })} className="border border-[var(--color-border-default)] px-3 py-2">
            Próxima
          </Link>
        ) : null}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="evolucao">
        <Text as="h2" variant="heading-md" id="evolucao">
          Evolução dos últimos 14 dias — {rotuloLoja(loja)}
        </Text>
        {evolucao.length === 0 ? (
          <Text variant="body-sm" color="secondary">
            Ainda sem série diária para esta loja (a tabela é criada pela migração 0040 e preenchida pelo cron a cada hora). Nenhum valor é estimado.
          </Text>
        ) : (
          <>
            <Text variant="body-sm" color="secondary">
              {evolucao.length} dia(s) registrados.
              {dAprov != null ? ` Aprovados: ${dAprov >= 0 ? '+' : ''}${dAprov} no período.` : ''}
              {dMl != null ? ` Ofertas ML: ${dMl >= 0 ? '+' : ''}${dMl}.` : ''}
            </Text>
            <div className={wrap}>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className={headRow}>
                    <th className={th}>Dia</th>
                    <th className={`${th} text-right`}>Aprovados</th>
                    <th className={`${th} text-right`}>Revisão</th>
                    <th className={`${th} text-right`}>Rejeitados</th>
                    <th className={`${th} text-right`}>ML</th>
                    <th className={`${th} text-right`}>Shopee</th>
                    <th className={`${th} text-right`}>Amazon</th>
                    <th className={`${th} text-right`}>Link oficial</th>
                  </tr>
                </thead>
                <tbody>
                  {[...evolucao].reverse().map((d) => (
                    <tr key={d.day} className={bodyRow}>
                      <td className={td}>{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nfmt(d.mastersAprovados)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nfmt(d.mastersRevisao)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nfmt(d.mastersRejeitados)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nfmt(d.ofertasMl)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nfmt(d.ofertasShopee)}</td>
                      <td className={`${td} text-right tabular-nums`}>{nfmt(d.ofertasAmazon)}</td>
                      <td className={`${td} text-right tabular-nums`}>{pctTxt(d.pctOficial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
