// Secao "Contatos e canais": o lugar unico dos links de Telegram, WhatsApp e contato direto; aparece SO na pagina /contatos, nao na home (decisao do dono, 2026-11-13).
// Para trocar um link ou telefone, edite SOMENTE as constantes abaixo. Os grupos por loja vem do cadastro das lojas (loja sem link nao aparece).
import Link from 'next/link';
import { ArrowRight, Mail, MessageCircle, Send } from 'lucide-react';
import { Text } from '@/components/ui/text';
import { getStores } from '@/server/stores';
import { getGruposWhatsapp } from '@/server/plus';

// ----- LISTA DE CANAIS (editar aqui) ------------------------
/** Canal oficial no Telegram (destaque). */
export const TELEGRAM_CANAL = { rotulo: '@egeek86', url: 'https://t.me/egeek86' } as const;
/** WhatsApp direto do dono: o mesmo numero publicado em /contatos. */
export const WHATSAPP_DONO = { rotulo: '+55 (83) 98195-7737', url: 'https://wa.me/5583981957737' } as const;
export const EMAIL_CONTATO = { rotulo: 'contato@egeek86.com', url: 'mailto:contato@egeek86.com' } as const;
export const PAGINA_CONTATOS = '/contatos';
/** Ordem e nome das lojas no bloco de canais por loja. */
const LOJAS_ORDEM = ['games', 'impressao-3d', 'tecnologia', 'livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte'] as const;
const LOJAS_ROTULO: Record<string, string> = {
  games: 'Games',
  'impressao-3d': 'Impressão 3D',
  tecnologia: 'Tecnologia',
  livros: 'Livros',
  eletrodomesticos: 'Casa',
  eletroeletronicos: 'Eletrônicos',
  esporte: 'Esporte',
};
// -------------------------------------------------------------

const BOTAO = 'inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]';
const BOTAO_PRIMARIO = `${BOTAO} border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)] text-white hover:opacity-90`;
const BOTAO_SECUNDARIO = `${BOTAO} border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10`;

interface CanalLoja { slug: string; rotulo: string; whatsapp: string | null; telegram: string | null }

async function canaisPorLoja(): Promise<CanalLoja[]> {
  try {
    const [stores, grupos] = await Promise.all([getStores().catch(() => []), getGruposWhatsapp().catch(() => [])]);
    return LOJAS_ORDEM.map((slug) => {
      const s = stores.find((x) => x.slug === slug);
      const tg = s?.telegramInviteUrl?.trim();
      return {
        slug,
        rotulo: LOJAS_ROTULO[slug],
        whatsapp: grupos.find((g) => g.storeSlug === slug)?.url ?? null,
        telegram: tg && /^https:\/\//i.test(tg) ? tg : null,
      };
    }).filter((c) => c.whatsapp || c.telegram);
  } catch {
    return []; // falha segura: a seção omite o bloco por loja
  }
}

export async function Contatos() {
  const lojas = await canaisPorLoja();
  return (
    <section id="contatos" aria-labelledby="contatos-titulo" className="w-full border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-6 flex max-w-[62ch] flex-col gap-1 border-l-2 border-[var(--color-accent-primary)] pl-4">
          <Text variant="label" color="tertiary">Comunidade</Text>
          <Text as="h2" id="contatos-titulo" variant="display-md" className="font-black tracking-tight">Contatos e canais</Text>
          <Text variant="body-sm" color="secondary">Fale com a gente e acompanhe as ofertas monitoradas pelo canal que preferir.</Text>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-3 border border-[var(--color-accent-primary)] bg-[var(--color-bg-canvas)] p-5">
            <span className="flex size-11 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-accent-primary)]"><Send className="size-5" aria-hidden /></span>
            <Text as="h3" variant="heading-md" className="font-bold">Telegram, canal oficial</Text>
            <Text variant="body-sm" color="secondary">Os menores preços e as quedas reais, em tempo quase real.</Text>
            <a href={TELEGRAM_CANAL.url} target="_blank" rel="noopener noreferrer" className={`${BOTAO_PRIMARIO} mt-auto`}>
              <Send className="size-4" aria-hidden /> Entrar no canal {TELEGRAM_CANAL.rotulo}
            </a>
          </div>

          <div className="flex flex-col gap-3 border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-5">
            <span className="flex size-11 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-accent-primary)]"><MessageCircle className="size-5" aria-hidden /></span>
            <Text as="h3" variant="heading-md" className="font-bold">WhatsApp direto</Text>
            <Text variant="body-sm" color="secondary">{WHATSAPP_DONO.rotulo}</Text>
            <a href={WHATSAPP_DONO.url} target="_blank" rel="noopener noreferrer" className={`${BOTAO_SECUNDARIO} mt-auto`}>
              <MessageCircle className="size-4" aria-hidden /> Chamar no WhatsApp
            </a>
          </div>

          <div className="flex flex-col gap-3 border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-5">
            <span className="flex size-11 items-center justify-center border border-[var(--color-border-default)] text-[var(--color-accent-primary)]"><Mail className="size-5" aria-hidden /></span>
            <Text as="h3" variant="heading-md" className="font-bold">E-mail</Text>
            <a href={EMAIL_CONTATO.url} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--color-text-primary)] hover:underline">{EMAIL_CONTATO.rotulo}</a>
            <Link href={PAGINA_CONTATOS} className={`${BOTAO_SECUNDARIO} mt-auto`}>
              Todos os contatos <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        {lojas.length > 0 ? (
          <div className="mt-6">
            <Text as="h3" variant="heading-sm" className="mb-3 font-bold">Grupos e canais por loja</Text>
            <ul className="grid gap-px border border-[var(--color-border-subtle)] bg-[var(--color-border-subtle)] sm:grid-cols-2 lg:grid-cols-4">
              {lojas.map((l) => (
                <li key={l.slug} className="flex flex-col gap-2 bg-[var(--color-bg-canvas)] p-4">
                  <Text variant="heading-sm" className="font-bold">{l.rotulo}</Text>
                  <div className="flex flex-wrap gap-2">
                    {l.whatsapp ? (
                      <a href={l.whatsapp} target="_blank" rel="noopener noreferrer" className={BOTAO_SECUNDARIO} aria-label={`Grupo de WhatsApp de ${l.rotulo}`}>
                        <MessageCircle className="size-4" aria-hidden /> WhatsApp
                      </a>
                    ) : null}
                    {l.telegram ? (
                      <a href={l.telegram} target="_blank" rel="noopener noreferrer" className={BOTAO_SECUNDARIO} aria-label={`Canal de Telegram de ${l.rotulo}`}>
                        <Send className="size-4" aria-hidden /> Telegram
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
