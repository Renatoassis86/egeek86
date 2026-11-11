'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';
import { atualizarFilaClassificacao, desfazerDecisaoFila, responderItemFila } from '@/server/actions/fila-classificacao';
import type { QueueCard } from '@/server/identity-queue/queue';

const AXIS_LABEL: Record<string, string> = { modelo: 'Modelo', midia: 'Mídia', armazenamento: 'Armazenamento', identidade: 'Identidade', preco: 'Preço' };
const UNDERSTOOD_LABEL: Record<string, string> = {
  familia: 'Família', modelo: 'Modelo', midia: 'Mídia', armazenamentoGb: 'Armazenamento (GB)', edicao: 'Edição', confianca: 'Confiança', produto: 'Produto',
  nOfertas: 'Ofertas no produto', razaoMaxMin: 'Maior ÷ menor preço',
};

interface Props { initialCards: QueueCard[]; pendentes: number; regrasAprendidas: number }
interface Last { decisionId: string; card: QueueCard; label: string }

/** Popup da FILA DE CLASSIFICAÇÃO: abre sozinho quando há itens pendentes. Atalhos: 1-9 escolhe a opção, Z desfaz, Esc fecha. Cantos retos. */
export function FilaClassificacaoPopup({ initialCards, pendentes: pend0, regrasAprendidas: rules0 }: Props) {
  const [cards, setCards] = React.useState(initialCards);
  const [open, setOpen] = React.useState(initialCards.length > 0);
  const [pendentes, setPendentes] = React.useState(pend0);
  const [regras, setRegras] = React.useState(rules0);
  const [busy, setBusy] = React.useState(false);
  const [last, setLast] = React.useState<Last | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const card = cards[0];

  const answer = React.useCallback(
    async (value: string) => {
      if (!card || busy) return;
      const opt = card.options.find((o) => o.value === value);
      setBusy(true);
      setMsg(null);
      const r = await responderItemFila(card.id, value);
      setBusy(false);
      if (!r.ok) return setMsg(`Não foi possível gravar (${r.error ?? 'erro'}).`);
      setCards((cs) => cs.filter((c) => c.id !== card.id));
      setPendentes(r.pendentes ?? 0);
      setRegras(r.regrasAprendidas ?? 0);
      if (r.decisionId) setLast({ decisionId: r.decisionId, card, label: opt?.label ?? value });
    },
    [card, busy]
  );

  const undo = React.useCallback(async () => {
    if (!last || busy) return;
    setBusy(true);
    const r = await desfazerDecisaoFila(last.decisionId);
    setBusy(false);
    if (!r.ok) return setMsg(`Não foi possível desfazer (${r.error ?? 'erro'}).`);
    setCards((cs) => (r.item ? [r.item, ...cs.filter((c) => c.id !== r.item!.id)] : cs));
    setPendentes(r.pendentes ?? 0);
    setRegras(r.regrasAprendidas ?? 0);
    setLast(null);
    setOpen(true);
  }, [last, busy]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); void undo(); return; }
      const n = Number(e.key);
      if (card && n >= 1 && n <= card.options.length) { e.preventDefault(); void answer(card.options[n - 1].value); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, card, answer, undo]);

  async function refresh() {
    setBusy(true);
    const r = await atualizarFilaClassificacao();
    setBusy(false);
    setMsg(r.ok ? `Fila atualizada: ${r.stats?.criados ?? 0} novos, ${r.stats?.autoResolvidos ?? 0} resolvidos pelas regras. Recarregue para ver.` : `Falha ao atualizar (${r.error}).`);
  }

  return (
    <>
      <Button type="button" variant="outline" className="rounded-none" onClick={() => setOpen(true)}>
        Fila de classificação ({pendentes})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-none">
          <DialogTitle>Fila de classificação ({pendentes} pendentes)</DialogTitle>
          <DialogDescription>O sistema já aprendeu {regras} {regras === 1 ? 'regra' : 'regras'}. Títulos iguais ou muito parecidos são resolvidos sozinhos.</DialogDescription>
          {card ? (
            <div className="grid gap-4">
              <div className="flex gap-4 border border-[var(--color-border-default)] p-3">
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem real do anúncio, host variável
                  <img src={card.imageUrl} alt="" referrerPolicy="no-referrer" className="size-28 shrink-0 bg-white object-contain" />
                ) : (
                  <div className="flex size-28 shrink-0 items-center justify-center border border-[var(--color-border-subtle)] text-caption text-[var(--color-text-tertiary)]">sem foto</div>
                )}
                <div className="grid min-w-0 gap-1">
                  <p className="break-words text-body-md font-medium">{card.title}</p>
                  <p className="text-body-sm text-[var(--color-text-secondary)]">
                    {[card.network, card.store].filter(Boolean).join(' · ')} · {card.priceCents != null ? formatBRL(card.priceCents) : 'sem preço'}
                  </p>
                  <p className="text-caption text-[var(--color-text-tertiary)]">Produto atual: {card.masterName ?? '—'}</p>
                  <p className="text-caption text-[var(--color-text-tertiary)]">
                    {Object.entries(card.understood)
                      .filter(([k, v]) => UNDERSTOOD_LABEL[k] && v != null && v !== '')
                      .map(([k, v]) => `${UNDERSTOOD_LABEL[k]}: ${String(v)}`)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <p className="text-body-sm"><strong>Dúvida ({AXIS_LABEL[card.axis] ?? card.axis}):</strong> {card.reason}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {card.options.map((o, i) => (
                  <Button
                    key={o.value}
                    type="button"
                    variant={o.kind === 'escolha' ? 'primary' : o.kind === 'nao_e_este' ? 'danger' : 'secondary'}
                    className="h-auto min-h-14 flex-col items-start rounded-none px-4 py-3 text-left whitespace-normal"
                    disabled={busy}
                    onClick={() => void answer(o.value)}
                  >
                    <span>[{i + 1}] {o.label}</span>
                    {o.hint ? <span className="text-caption font-normal opacity-80">{o.hint}</span> : null}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-body-md">Nenhum item pendente agora.</p>
          )}
          {last ? (
            <div className="flex items-center justify-between gap-2 border border-[var(--color-border-subtle)] p-2 text-body-sm">
              <span className="min-w-0 truncate">Gravado: {last.label} · {last.card.title}</span>
              <Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => void undo()}>Desfazer (Z)</Button>
            </div>
          ) : null}
          {msg ? <p className="text-body-sm text-[var(--color-accent-danger)]" role="status">{msg}</p> : null}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" className="rounded-none" disabled={busy} onClick={() => void refresh()}>Atualizar fila</Button>
            <Button type="button" variant="secondary" className="rounded-none" onClick={() => setOpen(false)}>Fechar (Esc)</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
