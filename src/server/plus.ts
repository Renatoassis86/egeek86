import 'server-only';
import { getStores } from '@/server/stores';
import { resumoDepartamentos } from '@/server/departamentos';
import { LOJAS_PLUS, type LojaPlus } from '@/lib/catalog/plus';
import { isAdminRole } from '@/components/layout/shell-viewer';

export interface LojaPlusView extends LojaPlus {
  /** true = a área de produtos está aberta para quem está vendo. */
  aberta: boolean;
  produtos: number;
  telegramUrl: string | null;
  whatsappUrl: string | null;
}

/** Canais públicos de uma loja (cadastro das lojas). Falha segura: sem links. */
export async function canaisDaLoja(storeSlug: string): Promise<{ telegramUrl: string | null; whatsappUrl: string | null }> {
  const s = (await getStores().catch(() => [])).find((x) => x.slug === storeSlug);
  return { telegramUrl: s?.telegramInviteUrl ?? null, whatsappUrl: s?.whatsappGroupUrl ?? null };
}


/** Vitrine Plus: as 6 lojas com estado da área, contagem real e canais. Nunca lança (falha => tudo "em montagem"). */
export async function getLojasPlus(role?: string | null): Promise<LojaPlusView[]> {
  const ehAdmin = isAdminRole(role);
  const [stores, resumo] = await Promise.all([
    getStores().catch(() => []),
    resumoDepartamentos().catch(() => []),
  ]);
  return LOJAS_PLUS.map((l) => {
    const r = resumo.find((x) => x.slug === l.dept);
    const s = stores.find((x) => x.slug === l.storeSlug);
    const aberta = !!r && (r.estado === 'publico' || (r.estado === 'admin' && ehAdmin));
    return {
      ...l,
      aberta,
      produtos: aberta ? (r?.produtos ?? 0) : 0,
      telegramUrl: s?.telegramInviteUrl ?? null,
      whatsappUrl: s?.whatsappGroupUrl ?? null,
    };
  });
}

export interface GrupoWhatsappView {
  storeSlug: string;
  /** departamento Plus (para o ícone); null = Games. */
  dept: LojaPlus['dept'] | null;
  rotulo: string;
  /** null = ainda sem grupo cadastrado ("Grupo em breve"). */
  url: string | null;
}

/** Grupos de WhatsApp por loja (Games + 6 lojas Plus), lidos de store_sections.whatsapp_group_url. Falha segura: tudo "em breve". */
export async function getGruposWhatsapp(): Promise<GrupoWhatsappView[]> {
  const stores = await getStores().catch(() => []);
  const url = (slug: string) => {
    const u = stores.find((x) => x.slug === slug)?.whatsappGroupUrl?.trim();
    return u && /^https:\/\//i.test(u) ? u : null;
  };
  return [
    { storeSlug: 'games', dept: null, rotulo: 'Games', url: url('games') },
    ...LOJAS_PLUS.map((l) => ({ storeSlug: l.storeSlug, dept: l.dept, rotulo: l.rotulo, url: url(l.storeSlug) })),
  ];
}
