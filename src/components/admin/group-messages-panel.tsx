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
  type GroupActionResult,
} from '@/server/actions/group-messages';
import type { GroupViewItem } from '@/server/messaging/group-view';

export interface GroupPanelFlags {
  enabled: boolean;
  mode: 'dry' | 'send';
  telegramReady: boolean;
  adTag: string;
  tableExists: boolean;
}

const TRIGGER_LABEL: Record<string, string> = {
  G1: 'Menor preço registrado',
  G2: 'Abaixo da média',
  G3: 'Comparativo entre lojas',
  G4: 'Resumo do dia',
  G5: 'Foto de preço pré-Black Friday',
  G6: 'Por departamento',
};

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

function Item({ item, flags, live, run }: { item: GroupViewItem; flags: GroupPanelFlags; live: boolean; run: (fn: () => Promise<GroupActionResult>) => void }) {
  const [tab, setTab] = useState<'wa' | 'tg'>('wa');
  const text = tab === 'wa' ? item.whatsapp : item.telegram;
  const approved = item.statusTg === 'aprovada' || item.statusWa === 'aprovada';
  const closed = ['enviada', 'rejeitada', 'expirada', 'erro'].includes(item.statusTg) && ['enviada', 'rejeitada', 'expirada', 'erro', '-'].includes(item.statusWa);
  const canSendTg = !live && flags.telegramReady && item.statusTg === 'aprovada' && item.sendable;
  const waSent = item.statusWa === 'enviada';

  return (
    <Card className={SQUARE}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`border border-[var(--color-border-default)] px-2 py-0.5 text-xs ${SQUARE}`}>{item.trigger} · {TRIGGER_LABEL[item.trigger] ?? item.trigger}</span>
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
          {item.notSendableReason && <Text variant="caption" color="tertiary">Bloqueio: {item.notSendableReason}</Text>}
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
          {tab === 'wa' && (
            <Button size="lg" fullWidth variant="primary" className={SQUARE} disabled={!item.sendable} asChild>
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
        {!live && item.sendable && !waSent && item.statusWa !== '-' && item.statusWa !== 'rejeitada' && item.statusWa !== 'expirada' && (
          <Button size="md" fullWidth variant="outline" className={SQUARE} onClick={() => run(() => markWhatsappSentAction(item.messageKey))}>
            Já enviei no WhatsApp (registrar)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function GroupMessagesPanel({ items, flags }: { items: GroupViewItem[]; flags: GroupPanelFlags }) {
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
      {shown.map((it) => (
        <Item key={`${it.messageKey}-${it.status}`} item={it} flags={flags} live={live} run={run} />
      ))}
    </div>
  );
}
