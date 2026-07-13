import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatBRL } from '@/lib/format';
import { listMessagesForAdmin } from '@/server/queries/affiliate';

export default async function AdminMessagesPage() {
  const messages = await listMessagesForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <Text as="h1" variant="heading-xl">
        Mensagens divulgadas
      </Text>

      <div className="flex flex-col gap-2">
        {messages.length === 0 && (
          <Text variant="body-sm" color="secondary">
            Nenhuma mensagem gerada ainda.
          </Text>
        )}
        {messages.map((message) => (
          <Card key={message.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/ofertas`} className="min-w-0 hover:underline">
                  <Text variant="body-md" className="line-clamp-1">
                    {message.offerTitle}
                  </Text>
                </Link>
                <Text variant="caption" color="tertiary" className="shrink-0">
                  {message.createdAt.toLocaleString('pt-BR')}
                </Text>
              </div>
              <Text variant="caption" color="tertiary" className="mt-0.5">
                Preço no envio: {formatBRL(message.priceCentsAtSend)}
                {message.destination && ` · ${message.destination}`} · {message.channel}
              </Text>
              <pre className="mt-2 whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-bg-inset)] p-3 text-body-sm text-[var(--color-text-secondary)]">
                {message.messageText}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
