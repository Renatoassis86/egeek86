'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Pencil, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';
import { toast } from '@/components/ui/toast';
import { updateMessageAction, deleteMessageAction } from '@/server/actions/messages';

export interface AdminMessageItem {
  id: string;
  messageText: string;
  priceCentsAtSend: number;
  channel: string;
  destination: string | null;
  createdAt: Date;
  offerTitle: string;
  offerSlug: string;
}

export function AdminMessagesList({
  initialMessages,
}: {
  initialMessages: AdminMessageItem[];
}) {
  const [messages, setMessages] = useState<AdminMessageItem[]>(initialMessages);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStartEdit(msg: AdminMessageItem) {
    setEditingId(msg.id);
    setEditText(msg.messageText);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  function handleSaveEdit(id: string) {
    if (!editText.trim()) {
      toast.error('O texto da mensagem não pode ficar vazio.');
      return;
    }

    startTransition(async () => {
      const res = await updateMessageAction({ id, messageText: editText });
      if (res.ok) {
        toast.success('Mensagem atualizada com sucesso!');
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, messageText: editText.trim() } : m))
        );
        setEditingId(null);
      } else {
        toast.error(res.error ?? 'Falha ao atualizar mensagem.');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteMessageAction({ id });
      if (res.ok) {
        toast.success('Mensagem excluída com sucesso!');
        setMessages((prev) => prev.filter((m) => m.id !== id));
        setDeletingId(null);
      } else {
        toast.error(res.error ?? 'Falha ao excluir mensagem.');
      }
    });
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Text variant="body-md" color="secondary">
            Nenhuma mensagem divulgada registrada ainda.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => {
        const isEditing = editingId === message.id;
        const isDeleting = deletingId === message.id;

        return (
          <Card key={message.id} className="relative overflow-hidden border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
            <CardContent className="p-5 flex flex-col gap-3">
              {/* Header do Card com Título da Oferta e Ações */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-3">
                <div className="flex flex-col min-w-0">
                  <Link href="/admin/ofertas" className="hover:underline">
                    <Text variant="heading-sm" className="font-bold truncate text-[var(--color-text-primary)]">
                      {message.offerTitle}
                    </Text>
                  </Link>
                  <Text variant="caption" color="tertiary" className="mt-0.5">
                    Preço no envio: {formatBRL(message.priceCentsAtSend)}
                    {message.destination && ` · ${message.destination}`} · Canal: <span className="font-semibold uppercase text-blue-500">{message.channel}</span>
                  </Text>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Text variant="caption" color="tertiary" className="mr-2 hidden sm:inline">
                    {new Date(message.createdAt).toLocaleString('pt-BR')}
                  </Text>

                  {!isEditing && !isDeleting && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEdit(message)}
                        title="Editar Mensagem"
                        className="h-8 px-2.5"
                      >
                        <Pencil className="size-3.5 mr-1" /> Editar
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingId(message.id)}
                        title="Excluir Mensagem"
                        className="h-8 px-2.5 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="size-3.5 mr-1" /> Excluir
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Modo de Edição Inline */}
              {isEditing ? (
                <div className="flex flex-col gap-3 mt-1 bg-[var(--color-bg-inset)] p-3.5 rounded-[var(--radius-md)] border border-blue-500/30">
                  <Text variant="label" className="text-blue-400 font-bold text-xs">
                    Editar Conteúdo da Mensagem:
                  </Text>
                  <textarea
                    rows={5}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] border border-[var(--color-border-default)] p-3 text-sm text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={isPending}>
                      <X className="size-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button variant="hype" size="sm" onClick={() => handleSaveEdit(message.id)} disabled={isPending}>
                      <Check className="size-3.5 mr-1" /> {isPending ? 'Salvando...' : 'Salvar Alterações'}
                    </Button>
                  </div>
                </div>
              ) : isDeleting ? (
                /* Modo de Confirmação de Exclusão */
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-red-950/40 border border-red-500/40 p-3.5 rounded-[var(--radius-md)] text-red-200">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <AlertTriangle className="size-4 text-red-400 shrink-0" />
                    <span>Deseja realmente apagar esta mensagem divulgada permanentemente?</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)} disabled={isPending}>
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white font-bold"
                      onClick={() => handleDelete(message.id)}
                      disabled={isPending}
                    >
                      {isPending ? 'Excluindo...' : 'Sim, Excluir'}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Visualização Padrão da Mensagem */
                <pre className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] p-4 text-xs font-mono text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] leading-relaxed">
                  {message.messageText}
                </pre>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
