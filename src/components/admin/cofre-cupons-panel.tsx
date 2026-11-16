import type { MetricasCofre } from '@/server/coupons/cofre';

/** Cofre de validação obrigatória (R-64): estado atual por rede, liberados/barrados/revogados em 24 h e a trilha recente (por que foi liberado ou barrado). */
export function CofreCuponsPanel({ m }: { m: MetricasCofre }) {
  return (
    <section className="rounded-lg border p-4" aria-label="Cofre de validação de cupons">
      <h2 className="mb-2 text-base font-semibold">Cofre de validação de cupons e benefícios</h2>
      <p className="mb-2 text-sm">Nada vira mensagem, card, lista, site, alerta ou preço final sem prova vigente (padrão negado).</p>
      <h3 className="mt-2 text-sm font-semibold">Últimas 24 h por rede</h3>
      <ul className="text-sm">
        {m.barradosLiberados24h.length ? m.barradosLiberados24h.map((r) => (
          <li key={r.rede}>{r.rede}: {r.liberados} liberados, {r.barrados} barrados, {r.revogados} revogados</li>
        )) : <li>Sem decisões registradas ainda.</li>}
      </ul>
      <h3 className="mt-2 text-sm font-semibold">Estado atual</h3>
      <ul className="text-sm">
        {m.porRedeEstado.map((r) => <li key={`${r.rede}-${r.estado}`}>{r.rede} / {r.estado}: {r.n}</li>)}
      </ul>
      <h3 className="mt-2 text-sm font-semibold">Trilha recente</h3>
      <ul className="text-xs">
        {m.recentes.map((r, i) => <li key={i}>{r.at} · {r.rede} · {r.acao}{r.motivo ? ` (${r.motivo})` : ''}{r.prova ? ` · prova ${r.prova}` : ''} · oferta {r.oferta}</li>)}
      </ul>
    </section>
  );
}
