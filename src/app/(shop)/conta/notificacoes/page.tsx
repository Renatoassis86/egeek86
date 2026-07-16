import { eq } from 'drizzle-orm';
import { Mail, Send, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Reveal } from '@/components/motion/reveal';
import { NotificationPreferenceToggle } from '@/components/geek-deals/notification-preference-toggle';
import { TelegramLinkButton } from '@/components/geek-deals/telegram-link-button';
import { db } from '@/lib/db';
import { notificationPreferences } from '@/db/schema';
import { requireCustomer } from '@/lib/auth/require-customer';

export const metadata = { title: 'Notificações' };
// Sem searchParams — força dinâmica (ver nota em src/app/admin/page.tsx).
export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const profile = await requireCustomer();
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, profile.id))
    .limit(1);

  const emailEnabled = prefs?.emailPriceAlerts ?? true;
  const telegramEnabled = prefs?.telegramPriceAlerts ?? true;
  const telegramLinked = !!prefs?.telegramChatId;

  return (
    <section className="mx-auto max-w-2xl px-4 lg:px-8 py-10 lg:py-14">
      <Reveal>
        <Text as="h1" variant="heading-xl">
          Notificações
        </Text>
        <Text variant="body-md" color="secondary" className="mt-1">
          Como você quer ser avisado quando um jogo que você acompanha ficar abaixo do preço
          normal ou no menor valor já visto.
        </Text>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-8 flex flex-col gap-3">
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-start gap-3">
                <Mail className="size-5 mt-0.5 text-[var(--color-text-tertiary)]" aria-hidden />
                <div>
                  <Text variant="body-md" className="font-medium">
                    E-mail
                  </Text>
                  <Text variant="caption" color="tertiary">
                    Enviado pra {profile.email}
                  </Text>
                </div>
              </div>
              <NotificationPreferenceToggle channel="email" initialEnabled={emailEnabled} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-start gap-3">
                <Send className="size-5 mt-0.5 text-[var(--color-text-tertiary)]" aria-hidden />
                <div>
                  <Text variant="body-md" className="font-medium">
                    Telegram
                  </Text>
                  {telegramLinked ? (
                    <Text variant="caption" color="tertiary" className="inline-flex items-center gap-1">
                      <CheckCircle2 className="size-3 text-[var(--color-accent-success)]" aria-hidden />
                      Conta vinculada
                    </Text>
                  ) : (
                    <Text variant="caption" color="tertiary">
                      Ainda não vinculado
                    </Text>
                  )}
                </div>
              </div>
              {telegramLinked ? (
                <NotificationPreferenceToggle channel="telegram" initialEnabled={telegramEnabled} />
              ) : (
                <TelegramLinkButton />
              )}
            </CardContent>
          </Card>

          <Card variant="outline">
            <CardContent className="p-5">
              <Text variant="caption" color="tertiary">
                WhatsApp automático ainda não está disponível. Em breve. Por enquanto, as ofertas
                continuam sendo compartilhadas manualmente nos grupos.
              </Text>
            </CardContent>
          </Card>
        </div>
      </Reveal>
    </section>
  );
}
