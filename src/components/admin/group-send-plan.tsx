import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { QueuePlanDTO } from '@/server/messaging/group-plan';

const TRIGGER_LABEL: Record<string, string> = {
  G2: 'Na média ou abaixo',
  G3: 'Comparativo entre lojas',
  G4: 'Resumo do dia',
  G5: 'Foto de preço',
  OK1: 'Novo menor preço da série',
  OK2: 'Queda de ontem para hoje',
  T1: 'Caiu dois dias seguidos',
  T2: 'Perto do menor preço',
  RADAR: 'Radar',
  CUPOM: 'Cupom ativo (por oferta)',
  P1: 'Plataforma: histórico',
  P2: 'Plataforma: comparar lojas',
  P3: 'Plataforma: monitorar',
  P4: 'Plataforma: média única',
  P5: 'Plataforma: Black Friday',
};

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Fila ordenada, plano do dia e o que já saiu hoje (somente leitura). O botão de pausar fica no painel de estado da automação. */
export function GroupSendPlan({ plan }: { plan: QueuePlanDTO }) {
  const next = new Date(plan.nextEligibleAt).getTime() <= new Date(plan.generatedAt).getTime() ? 'liberada agora' : `a partir das ${hhmm(plan.nextEligibleAt)}`;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div>
          <Text as="h2" variant="heading-lg">
            Fila e distribuição do envio
          </Text>
          <Text variant="body-sm" color="secondary">
            Uma mensagem por execução do cron, depois do intervalo mínimo. Prioridade: alerta, insight, radar; dentro da classe, o maior movimento (loja e plataforma alternam só como desempate). Horários da fila são estimativas.
          </Text>
        </div>

        {!plan.ready && <Text variant="body-sm">A migration 0030 ainda não foi aplicada: sem fila automática para mostrar.</Text>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Intervalo mínimo vigente" value={`${plan.minGapMin} min`} hint={plan.lastSentAt ? `última mensagem às ${hhmm(plan.lastSentAt)}` : 'nenhuma enviada ainda'} />
          <Stat label="Próxima pode sair" value={next} hint={`${plan.hourSent} de ${plan.hourlyCap} na última hora`} />
          <Stat label="Hoje" value={plan.day.dailyCap >= 1_000_000 ? `${plan.day.sentToday} (sem teto)` : `${plan.day.sentToday} de ${plan.day.dailyCap}`} hint={`${plan.day.dailyCap >= 1_000_000 ? 'sem teto diário; ' : `restam ${plan.day.remaining}; `}${plan.day.soundRemaining} de ${plan.day.soundCap} sonoras`} />
          <Stat label="Slots que restam hoje" value={String(plan.day.slotsLeft)} hint="respeitando intervalo e teto por hora" />
        </div>

        <div className="flex flex-col gap-1">
          <Text variant="body-sm" className="font-semibold">Plano do dia (slots restantes por faixa)</Text>
          <div className="flex flex-wrap gap-2">
            {plan.day.bands.map((b) => (
              <span key={b.id} className="border border-[var(--color-border-default)] px-2 py-1 text-xs">
                {b.label}: {b.slots}
                {b.silent ? ' (silenciosas)' : ''}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Text variant="body-sm" className="font-semibold">Fila ({plan.queue.length}) na ordem de saída</Text>
          {plan.queue.length === 0 && <Text variant="body-sm" color="secondary">Nada aguardando envio automático.</Text>}
          {plan.queue.slice(0, 30).map((q) => (
            <div key={q.messageKey} className="border border-[var(--color-border-subtle)] p-2">
              <Text variant="body-sm" className="font-semibold">
                {q.position}. {q.name} <span className="font-normal text-xs">({q.trigger} · {TRIGGER_LABEL[q.trigger] ?? q.trigger} · {q.cls})</span>
              </Text>
              <Text variant="body-sm" color="secondary">{q.reason}</Text>
              <Text variant="body-sm" color="secondary">
                Saída estimada: {q.estimatedAt ? `${hhmm(q.estimatedAt)}` : 'sem slot hoje'}
                {q.waiting ? ` · ${q.waiting}` : ''}
              </Text>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Text variant="body-sm" className="font-semibold">Enviadas hoje ({plan.sentToday.length})</Text>
          {plan.sentToday.slice(0, 40).map((s, i) => (
            <Text key={`${s.at}-${i}`} variant="body-sm" color="secondary">
              {hhmm(s.at)} · {s.name || s.trigger} ({s.trigger}) · {s.sound ? 'com som' : 'silenciosa'}
            </Text>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border border-[var(--color-border-subtle)] p-3">
      <Text variant="body-sm" color="secondary">{label}</Text>
      <Text variant="heading-md">{value}</Text>
      <Text variant="body-sm" color="secondary">{hint}</Text>
    </div>
  );
}
