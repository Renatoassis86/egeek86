import { Gamepad2, MessageCircle, Box } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ICONES_LOJA_PLUS } from '@/components/plus/cartao-loja-plus';
import type { GrupoWhatsappView } from '@/server/plus';

/** Cartões de grupos de WhatsApp, um por loja. O botão serve para PARTICIPAR do grupo que recebe as promoções monitoradas. Sem link cadastrado: "Grupo em breve". */
export function GruposWhatsapp({ grupos, id = 'grupos-whatsapp-titulo' }: { grupos: GrupoWhatsappView[]; id?: string }) {
  return (
    <section aria-labelledby={id} className="mt-10 flex flex-col gap-4">
      <div className="flex max-w-[62ch] flex-col gap-1 border-l-2 border-[var(--color-accent-primary)] pl-4">
        <Text as="h2" id={id} variant="heading-lg" className="font-black tracking-tight">Grupos de WhatsApp</Text>
        <Text variant="body-md" color="secondary">
          Entre no grupo da sua loja no WhatsApp e receba as promoções monitoradas. O botão abaixo serve para participar do grupo; ele não envia produto.
        </Text>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {grupos.map((g) => {
          const Icone = g.dept ? (ICONES_LOJA_PLUS[g.dept] ?? Box) : Gamepad2;
          return (
            <li key={g.storeSlug}>
              <Card className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-accent-primary)]">
                    <Icone className="size-5" />
                  </span>
                  <Text as="h3" variant="heading-md" className="font-bold">{g.rotulo}</Text>
                </div>
                {g.url ? (
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--color-accent-primary)] px-4 text-[14px] font-bold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
                  >
                    <MessageCircle className="size-4" /> Entrar no grupo do WhatsApp
                  </a>
                ) : (
                  <span className="mt-auto inline-flex min-h-11 items-center justify-center border border-dashed border-[var(--color-border-default)] px-4 text-[14px] text-[var(--color-text-tertiary)]">
                    Grupo em breve
                  </span>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
