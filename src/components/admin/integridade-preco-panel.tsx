import type { MetricasIntegridade } from '@/server/pricing/integridade-preco';

/** Painel da integridade de preço (#119): o que a página do link mostra x o que a oferta diz. */
export function IntegridadePrecoPanel({ m }: { m: MetricasIntegridade }) {
  const linhas: [string, string][] = [
    ['Ofertas ML ativas', m.mlAtivas.toLocaleString('pt-BR')],
    ['Sem anúncio concreto', m.semAnuncioConcreto.toLocaleString('pt-BR')],
    ['Com veredito ok nas últimas 6 h', m.auditadasOk6h.toLocaleString('pt-BR')],
    ['Divergentes (preço, anúncio, pausado)', m.divergentes.toLocaleString('pt-BR')],
    ['Sem leitura (erro_leitura)', m.erroLeitura.toLocaleString('pt-BR')],
    ['Nunca auditadas', m.nuncaAuditadas.toLocaleString('pt-BR')],
    ['Cobertura da auditoria', `${m.coberturaPct.toLocaleString('pt-BR')}%`],
    ['Idade média do último veredito', m.idadeMediaUltimoVeredito == null ? 'sem dado' : `${m.idadeMediaUltimoVeredito.toLocaleString('pt-BR')} min`],
    ['Mensagens enviadas em 24 h sem veredito ok por perto', m.mensagens24hSemVeredito.toLocaleString('pt-BR')],
  ];
  return (
    <section className="rounded-lg border p-4" aria-label="Integridade de preço">
      <h2 className="mb-2 text-base font-semibold">Integridade de preço (Mercado Livre)</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b py-1"><dt>{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
