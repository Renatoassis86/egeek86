import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { requireAdmin } from '@/lib/auth/require-admin';
import { resumoComissao } from '@/server/queries/admin-comissao';
import { SeloEstimada } from '@/components/admin/comissao-celula';
import {
  ROTULO_CATEGORIA, ROTULO_REDE_COMISSAO, TABELA, VERSAO_TABELA, pctTexto,
  type CategoriaComissao, type GrupoResumo,
} from '@/lib/admin-gestao/taxas-comissao';

/**
 * Comissão prevista (#62). MÉTRICA INTERNA: só admin (layout + requireAdmin). Nunca exposta ao público.
 * Previsão = preço atual das ofertas ativas x taxa da rede/categoria (tabela versionada em código).
 */
export const dynamic = 'force-dynamic';

const nfmt = (n: number) => n.toLocaleString('pt-BR');
const th = 'px-3 py-3 text-caption font-medium text-[var(--color-text-tertiary)] whitespace-nowrap';
const td = 'px-3 py-2.5 align-top text-[13px] text-[var(--color-text-secondary)]';
const wrap = 'overflow-x-auto border border-[var(--color-border-subtle)]';
const headRow = 'border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]';
const bodyRow = 'border-b border-[var(--color-border-subtle)] last:border-b-0';

const nomeRede = (s: string) => ROTULO_REDE_COMISSAO[s] ?? s;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
      <div className="text-caption text-[var(--color-text-tertiary)]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</div>
      {sub ? <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">{sub}</div> : null}
    </div>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: Array<{ nome: string; sub?: string; g: GrupoResumo }> }) {
  return (
    <section className="flex flex-col gap-2">
      <Text as="h2" variant="heading-md">{titulo}</Text>
      <div className={wrap}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={headRow}>
              <th className={th}>Nome</th>
              <th className={`${th} text-right`}>Ofertas</th>
              <th className={`${th} text-right`}>Soma de preços</th>
              <th className={`${th} text-right`}>Taxa média (ponderada)</th>
              <th className={`${th} text-right`}>Comissão prevista (R$)</th>
              <th className={th}>Confiança</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome + (l.sub ?? '')} className={bodyRow}>
                <td className={`${td} max-w-[280px] text-[var(--color-text-primary)]`}>
                  {l.nome}
                  {l.sub ? <div className="text-[11px] text-[var(--color-text-tertiary)]">{l.sub}</div> : null}
                </td>
                <td className={`${td} text-right tabular-nums`}>{nfmt(l.g.ofertas)}</td>
                <td className={`${td} text-right tabular-nums`}>{formatBRL(l.g.precoCents)}</td>
                <td className={`${td} text-right tabular-nums`}>{pctTexto(l.g.taxaMedia)}</td>
                <td className={`${td} text-right tabular-nums`}>{formatBRL(l.g.comissaoCents)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {l.g.ofertasEstimadas === 0 ? 'confirmada' : <>{pctTexto(l.g.pctEstimada)} estimada<SeloEstimada /></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ComissaoPage() {
  await requireAdmin();
  const r = await resumoComissao();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="heading-xl">Comissão prevista</Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Métrica interna de gestão, visível só aqui no admin. Previsão = preço atual de cada oferta ativa x taxa da rede e categoria.
          Se todas as ofertas fossem compradas uma vez, seria este o ganho; não é receita realizada.
        </Text>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Ofertas ativas" value={nfmt(r.total.ofertas)} />
        <Tile label="Soma dos preços" value={formatBRL(r.total.precoCents)} />
        <Tile label="Taxa média ponderada" value={pctTexto(r.total.taxaMedia)} sub={`${pctTexto(r.total.pctEstimada)} das ofertas com taxa estimada`} />
        <Tile label="Comissão prevista (soma)" value={formatBRL(r.total.comissaoCents)} />
      </div>

      <Tabela titulo="Por rede" linhas={r.porRede.map((g) => ({ nome: nomeRede(g.chave), g }))} />
      <Tabela
        titulo="Por categoria e rede"
        linhas={r.porCategoria.map((g) => {
          const [rede, cat] = g.chave.split('|');
          return { nome: ROTULO_CATEGORIA[cat as CategoriaComissao] ?? cat, sub: nomeRede(rede), g };
        })}
      />
      <Tabela
        titulo="Por loja / vendedor (50 maiores em comissão prevista)"
        linhas={r.porLoja.slice(0, 50).map((g) => ({ nome: g.chave, sub: nomeRede(g.rede), g }))}
      />

      <section className="flex flex-col gap-2">
        <Text as="h2" variant="heading-md">Tabela de taxas (versão {VERSAO_TABELA})</Text>
        <Text variant="body-sm" color="secondary">
          Cada taxa tem rede, categoria, percentual, fonte, data e confiança. Para mudar: editar src/lib/admin-gestao/taxas-comissao.ts.
        </Text>
        <div className={wrap}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={headRow}>
                <th className={th}>Rede</th>
                <th className={th}>Categoria</th>
                <th className={`${th} text-right`}>Taxa</th>
                <th className={th}>Confiança</th>
                <th className={th}>Fonte</th>
                <th className={th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {TABELA.map((t) => (
                <tr key={t.rede + t.categoria} className={bodyRow}>
                  <td className={td}>{nomeRede(t.rede)}</td>
                  <td className={td}>{ROTULO_CATEGORIA[t.categoria]}</td>
                  <td className={`${td} text-right tabular-nums`}>{pctTexto(t.taxa)}</td>
                  <td className={`${td} whitespace-nowrap`}>{t.confianca}</td>
                  <td className={`${td} min-w-[260px] text-[12px]`}>{t.fonte}</td>
                  <td className={`${td} whitespace-nowrap`}>{t.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export const metadata = { title: 'Admin: Comissão prevista' };
