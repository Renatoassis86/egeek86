'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Copy, MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { toast } from '@/components/ui/toast';
import {
  approveGroupMessageAction,
  generateProposalsAction,
  markWhatsappSentAction,
  rejectGroupMessageAction,
  sendTelegramNowAction,
  setAutomationStateAction,
  type GroupActionResult,
} from '@/server/actions/group-messages';
import type { GroupSection, GroupViewItem } from '@/server/messaging/group-view';
import type { AutomationOverview } from '@/server/messaging/group-overview';

export interface GroupPanelFlags {
  enabled: boolean;
  mode: 'dry' | 'send';
  telegramReady: boolean;
  adTag: string;
  tableExists: boolean;
}

const TRIGGER_LABEL: Record<string, string> = {
  G1: 'Menor preço registrado',
  G2: 'Na média ou abaixo',
  G3: 'Comparativo entre lojas',
  G4: 'Resumo do dia',
  G5: 'Foto de preço pré-Black Friday',
  G6: 'Por departamento',
  OK1: 'Novo menor preço da série',
  OK2: 'Queda de ontem para hoje',
  T1: 'Caiu dois dias seguidos',
  T2: 'Perto do menor preço registrado',
  RADAR: 'Radar horário',
  CUPOM: 'Cupom ativo (por oferta)',
  P1: 'Plataforma: histórico do preço',
  P2: 'Plataforma: comparar lojas',
  P3: 'Plataforma: monitorar',
  P4: 'Plataforma: média única',
  P5: 'Plataforma: Black Friday',
};

const CLASS_LABEL: Record<string, string> = {
  alerta: 'A. Alerta imediato',
  radar: 'B. Radar horário',
  insight: 'C. Insight',
  resumo: 'D. Resumo',
  cupom: 'E. Cupom ativo (prioridade alta)',
  plataforma: 'F. Plataforma',
};

const STATE_LABEL: Record<string, string> = {
  off: 'DESLIGADA (só propostas manuais)',
  shadow: 'MODO SOMBRA (decide e registra, não envia)',
  on: 'LIGADA (envia sozinha as classes seguras)',
};

const SECTIONS: Array<{ key: GroupSection; title: string; hint: string }> = [
  { key: 'aprovacao', title: 'Pedem a sua aprovação', hint: 'Shopee, desconto acima de 25%, vendedor sem reputação, nicho novo, ou propostas do modo manual. Nada disto sai sozinho.' },
  { key: 'retidas', title: 'Retidas', hint: 'Desconto acima de 40% contra a média, queda acima de 45% ou preço abaixo de meia mediana: provável erro de variante. Só aparecem aqui; você pode aprovar uma por uma se conferir.' },
  { key: 'fila_auto', title: 'Automáticas na fila', hint: 'Classes seguras esperando o turno do cron (um envio por execução, com releitura do preço antes de sair).' },
  { key: 'sombra', title: 'Decisões do modo sombra', hint: 'O que o cron TERIA enviado. Nada foi enviado ao grupo. Confira estas linhas contra o banco antes de ligar.' },
  { key: 'ao_vivo', title: 'Candidatos ao vivo', hint: 'Calculados agora, sem gravar.' },
  { key: 'historico', title: 'Histórico recente', hint: 'Enviadas, rejeitadas, expiradas e com erro.' },
];

const SQUARE = 'rounded-none';

function waMe(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

type GroupLinks = Record<string, { name: string; url: string }>;

function Item({ item, flags, live, run, groupLinks }: { item: GroupViewItem; flags: GroupPanelFlags; live: boolean; run: (fn: () => Promise<GroupActionResult>) => void; groupLinks: GroupLinks }) {
  const group = item.vertical ? groupLinks[item.vertical] ?? null : null;
  const [tab, setTab] = useState<'wa' | 'tg'>('wa');
  const text = tab === 'wa' ? item.whatsapp : item.telegram;
  const approved = item.statusTg === 'aprovada' || item.statusWa === 'aprovada';
  const tgClosed = ['enviada', 'rejeitada', 'expirada', 'erro', 'enviando'].includes(item.statusTg);
  const closed = item.statusTg === 'simulada' || (tgClosed && ['enviada', 'rejeitada', 'expirada', 'erro', '-'].includes(item.statusWa));
  const canSendTg = !live && flags.telegramReady && item.statusTg === 'aprovada' && item.sendable;
  const waSent = item.statusWa === 'enviada';

  return (
    <Card className={SQUARE}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`border border-[var(--color-border-default)] px-2 py-0.5 text-xs ${SQUARE}`}>{item.trigger} · {TRIGGER_LABEL[item.trigger] ?? item.trigger}</span>
          {item.cls && <span className={`border border-[var(--color-border-default)] px-2 py-0.5 text-xs ${SQUARE}`}>{CLASS_LABEL[item.cls] ?? item.cls}</span>}
          {item.isSound != null && <span className={`border border-[var(--color-border-default)] px-2 py-0.5 text-xs ${SQUARE}`}>{item.isSound ? 'com som' : 'silenciosa'}</span>}
          {item.simState && <span className={`border border-[var(--color-border-default)] px-2 py-0.5 text-xs ${SQUARE}`}>{item.simState === 'enviaria_som' ? 'teria saído com som' : 'teria saído silenciosa'}</span>}
          <span className={`border border-[var(--color-border-default)] px-2 py-0.5 text-xs ${SQUARE}`}>{live ? 'ao vivo' : `TG: ${item.statusTg} · WA: ${item.statusWa}`}</span>
          {item.needsReview && (
            <span className={`flex items-center gap-1 border border-[var(--color-accent-danger)] px-2 py-0.5 text-xs ${SQUARE}`}>
              <AlertTriangle className="size-3" /> exige revisão humana
            </span>
          )}
          {!item.sendable && <span className={`border border-[var(--color-accent-danger)] px-2 py-0.5 text-xs ${SQUARE}`}>não enviável</span>}
        </div>

        <div>
          <Text variant="heading-sm">{item.name}</Text>
          <Text variant="body-sm" color="secondary">{item.reason}</Text>
          {item.reviewReasons.length > 0 && (
            <Text variant="caption" color="tertiary">Revisar: {item.reviewReasons.join(', ')}</Text>
          )}
          {item.heldReasons.length > 0 && <Text variant="caption" color="tertiary">Retida por: {item.heldReasons.join(', ')}</Text>}
          {item.notSendableReason && <Text variant="caption" color="tertiary">Bloqueio: {item.notSendableReason}</Text>}
          {item.recheckNote && (
            <Text variant="caption" color="tertiary">
              Reconferência 30 min depois: {item.recheckNote}
              {item.recheckDivergencePct != null ? ` (divergência de ${item.recheckDivergencePct.toFixed(2).replace('.', ',')}%)` : ''}
            </Text>
          )}
          {item.error && <Text variant="caption" color="tertiary">Último erro: {item.error}</Text>}
          <Text variant="caption" color="tertiary">m = {item.messageKey}</Text>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="md" variant={tab === 'wa' ? 'primary' : 'secondary'} className={SQUARE} onClick={() => setTab('wa')}>WhatsApp</Button>
          <Button size="md" variant={tab === 'tg' ? 'primary' : 'secondary'} className={SQUARE} onClick={() => setTab('tg')}>Telegram</Button>
        </div>

        <pre className={`max-h-80 overflow-auto whitespace-pre-wrap break-words border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-3 text-sm ${SQUARE}`}>{text}</pre>
        {tab === 'tg' && <Text variant="caption" color="tertiary">Texto em HTML do Telegram (as tags aparecem aqui; no grupo viram negrito e link).</Text>}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            className={SQUARE}
            disabled={!item.sendable}
            onClick={async () => {
              (await copyText(text)) ? toast.success('Texto copiado.') : toast.error('Não foi possível copiar.');
            }}
          >
            <Copy /> Copiar
          </Button>
          {tab === 'wa' && item.cardOfferId && group && (
            <Button
              size="lg"
              fullWidth
              variant="primary"
              className={`${SQUARE} sm:col-span-2`}
              disabled={!item.sendable}
              onClick={async () => {
                // Um clique: copia card + texto (legenda) para a área de transferência e abre o grupo da loja deste item.
                // No WhatsApp aberto é só colar (Ctrl+V) e enviar.
                const w = window.open(group.url, '_blank', 'noopener');
                try {
                  const res = await fetch(`/api/admin/card/${item.cardOfferId}`, { cache: 'no-store' });
                  if (!res.ok) throw new Error('card');
                  const png = await res.blob();
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png, 'text/plain': new Blob([item.whatsapp], { type: 'text/plain' }) })]);
                  toast.success(`Card + texto copiados. Cole no grupo ${group.name}.`);
                } catch {
                  await copyText(item.whatsapp);
                  toast.error('Não consegui copiar o card; o texto foi copiado. Use "Compartilhar card + texto".');
                }
                void w;
              }}
            >
              <MessageCircle /> Copiar card + texto e abrir o grupo {group.name}
            </Button>
          )}
          {tab === 'wa' && item.cardOfferId && (
            <Button
              size="lg"
              fullWidth
              variant="primary"
              className={`${SQUARE} sm:col-span-2`}
              disabled={!item.sendable}
              onClick={async () => {
                // Card + texto de uma vez: a folha de compartilhar abre o WhatsApp (ou o app de desktop) com a imagem e a legenda prontas;
                // é só escolher o grupo. Sem suporte: copia o texto e abre o card para anexar.
                try {
                  const res = await fetch(`/api/admin/card/${item.cardOfferId}`, { cache: 'no-store' });
                  if (!res.ok) throw new Error('card');
                  const file = new File([await res.blob()], 'card-espaco-geek-86.png', { type: 'image/png' });
                  if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], text: item.whatsapp });
                    return;
                  }
                  await copyText(item.whatsapp);
                  window.open(URL.createObjectURL(file), '_blank');
                  toast.success('Texto copiado. Anexe o card aberto na nova aba e cole o texto como legenda.');
                } catch (e) {
                  if ((e as Error)?.name === 'AbortError') return;
                  await copyText(item.whatsapp);
                  toast.error('Não consegui montar o card; o texto foi copiado.');
                }
              }}
            >
              <MessageCircle /> Compartilhar card + texto no WhatsApp
            </Button>
          )}
          {tab === 'wa' && (
            <Button size="lg" fullWidth variant="secondary" className={SQUARE} disabled={!item.sendable} asChild>
              <a
                href={item.sendable ? waMe(item.whatsapp) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!item.sendable}
              >
                <MessageCircle /> Enviar no WhatsApp
              </a>
            </Button>
          )}
          {tab === 'tg' && (
            <Button
              size="lg"
              fullWidth
              variant="primary"
              className={SQUARE}
              disabled={!canSendTg}
              title={canSendTg ? '' : 'Só em modo send, com token e a proposta aprovada'}
              onClick={() => run(() => sendTelegramNowAction(item.messageKey))}
            >
              <Send /> Enviar agora no Telegram
            </Button>
          )}
        </div>
        {tab === 'tg' && !canSendTg && (
          <Text variant="caption" color="tertiary">
            Envio no Telegram travado: {live ? 'modo ao vivo (sem tabela)' : !flags.enabled ? 'GROUP_MESSAGES_ENABLED desligado' : flags.mode !== 'send' ? 'GROUP_MESSAGES_MODE=dry' : !flags.telegramReady ? 'token ou chat id ausente' : 'aprove a proposta primeiro'}.
          </Text>
        )}

        {!live && !closed && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" fullWidth variant="secondary" className={SQUARE} disabled={approved || !item.sendable} onClick={() => run(() => approveGroupMessageAction(item.messageKey))}>
              <Check /> {approved ? 'Aprovada' : 'Aprovar'}
            </Button>
            <Button size="lg" fullWidth variant="danger" className={SQUARE} onClick={() => run(() => rejectGroupMessageAction(item.messageKey))}>
              <X /> Rejeitar
            </Button>
          </div>
        )}
        {!live && item.sendable && !waSent && item.statusWa !== '-' && item.statusWa !== 'rejeitada' && item.statusWa !== 'expirada' && item.statusWa !== 'retida' && (
          <Button size="md" fullWidth variant="outline" className={SQUARE} onClick={() => run(() => markWhatsappSentAction(item.messageKey))}>
            Já enviei no WhatsApp (registrar)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AutomationCard({ overview, pending, run }: { overview: AutomationOverview; pending: boolean; run: (fn: () => Promise<GroupActionResult>) => void }) {
  const o = overview;
  const choose = (state: 'off' | 'shadow' | 'on') => {
    if (state === o.state) return;
    if (state === 'on' && !window.confirm('Ligar o envio AUTOMÁTICO no Telegram? As classes seguras passam a sair sozinhas (até 30 por dia, no máximo 8 com som). Recomendado só depois de 24 h de modo sombra conferido contra o banco.')) return;
    run(() => setAutomationStateAction(state));
  };
  const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
  return (
    <Card className={SQUARE}>
      <CardContent className="flex flex-col gap-3 p-4">
        <Text variant="heading-sm">Automação do Telegram: {STATE_LABEL[o.state]}</Text>
        <Text variant="caption" color="tertiary">
          {o.rowExists ? `Linha group_messages_auto atualizada em ${fmtTime(o.updatedAt)}.` : 'Sem linha em feature_flags: vale o padrão desligado.'} A mudança vale para o cron em até 30 segundos.
        </Text>
        {!o.v2Ready && (
          <div className={`flex items-start gap-2 border border-[var(--color-accent-danger)] p-3 text-sm ${SQUARE}`}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>A migration 0030 (motor v2) ainda não foi aplicada: shadow e ligada ficam recusados e o cron segue só com propostas manuais.</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button size="lg" fullWidth className={SQUARE} variant={o.state === 'off' ? 'primary' : 'secondary'} disabled={pending} onClick={() => choose('off')}>Desligada</Button>
          <Button size="lg" fullWidth className={SQUARE} variant={o.state === 'shadow' ? 'primary' : 'secondary'} disabled={pending || !o.v2Ready} onClick={() => choose('shadow')}>Modo sombra</Button>
          <Button size="lg" fullWidth className={SQUARE} variant={o.state === 'on' ? 'primary' : 'secondary'} disabled={pending || !o.v2Ready} onClick={() => choose('on')}>Ligada</Button>
        </div>
        {o.v2Ready && (
          <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <Text variant="body-sm">Enviadas (24 h): {o.sentToday} · com som: {o.soundToday} de 8</Text>
            <Text variant="body-sm">
              Inscritos: {o.members.current ?? 'sem leitura'}
              {o.members.dropPct != null ? ` · queda do pico em 24 h: ${o.members.dropPct.toFixed(2).replace('.', ',')}% (limite ${o.maxMemberDropPct}%)` : ''}
              {o.members.paused ? ' · FREIO ATIVO: envio automático pausado' : ''}
              {o.members.stale && o.members.points > 0 ? ' · leitura antiga' : ''}
            </Text>
            <Text variant="body-sm">Amazon: {o.amazon.paused ? 'PAUSADA (coleta assistida sem lote há mais de 90 min)' : 'ativa'} · último lote {fmtTime(o.amazon.lastRunAt)}</Text>
            <Text variant="body-sm">Cupom ativo (24 h): {o.cupom.generated24h} mensagens geradas · {o.cupom.sent24h} enviadas · {o.cupom.sent1h} na última hora</Text>
            <Text variant="body-sm">Reconferência de 30 min: {o.rechecked.total} feitas, {o.rechecked.diverged} com divergência acima de 2%</Text>
            <Text variant="body-sm">Últimas 24 h por status: {Object.entries(o.last24h).map(([k, v]) => `${k} ${v}`).join(' · ') || 'nenhuma decisão gravada'}</Text>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GroupMessagesPanel({ items, flags, overview, groupLinks = {} }: { items: GroupViewItem[]; flags: GroupPanelFlags; overview: AutomationOverview; groupLinks?: GroupLinks }) {
  const router = useRouter();
  const [liveItems, setLiveItems] = useState<GroupViewItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const live = !flags.tableExists;
  const shown = live ? (liveItems ?? items) : items;

  function run(fn: () => Promise<GroupActionResult>) {
    startTransition(async () => {
      const r = await fn();
      setNote(r.message);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.live) setLiveItems(r.live);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <AutomationCard overview={overview} pending={pending} run={run} />
      <Card className={SQUARE}>
        <CardContent className="flex flex-col gap-2 p-4">
          <Text variant="body-sm">
            Estado: {flags.enabled ? 'ligado' : 'DESLIGADO (padrão)'} · modo {flags.mode} · Telegram {flags.telegramReady ? 'pronto para enviar' : 'travado'} · marcação de publicidade: {flags.adTag ? flags.adTag : 'nenhuma'}
          </Text>
          {live && (
            <div className={`flex items-start gap-2 border border-[var(--color-accent-danger)] p-3 text-sm ${SQUARE}`}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                MODO AO VIVO: a tabela <b>group_messages</b> ainda não existe (migration 0028 não aplicada). Os candidatos são calculados na hora e nada é gravado; aprovar, rejeitar e o histórico de limites só funcionam depois da migration. Copiar e abrir no WhatsApp funcionam.
              </span>
            </div>
          )}
          <Button size="lg" fullWidth className={SQUARE} disabled={pending} onClick={() => run(generateProposalsAction)}>
            <RefreshCw className={pending ? 'animate-spin' : ''} /> Gerar novas propostas
          </Button>
          {note && <Text variant="caption" color="secondary">{note}</Text>}
        </CardContent>
      </Card>

      {shown.length === 0 && (
        <Text variant="body-sm" color="secondary">
          Nenhuma proposta agora. Toque em &ldquo;Gerar novas propostas&rdquo; para rodar o detector. Sem candidato, não se envia nada (melhor silêncio que lixo).
        </Text>
      )}
      {SECTIONS.map((sec) => {
        const list = shown.filter((it) => (live ? it.section === 'ao_vivo' || it.section === sec.key : it.section === sec.key));
        const inSec = live ? (sec.key === 'ao_vivo' ? shown : []) : list;
        if (!inSec.length) return null;
        return (
          <section key={sec.key} className="flex flex-col gap-3">
            <div>
              <Text as="h2" variant="heading-md">{sec.title} ({inSec.length})</Text>
              <Text variant="caption" color="tertiary">{sec.hint}</Text>
            </div>
            {inSec.map((it) => (
              <Item key={`${it.messageKey}-${it.status}`} item={it} flags={flags} live={live} run={run} groupLinks={groupLinks} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
