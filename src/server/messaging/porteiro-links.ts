import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditarUrlsDeMensagem, configAfiliado, extrairUrls, linkAfiliadoDe, resumoViolacoes } from '@/lib/affiliate/link-afiliado';

/**
 * R-70 / L4: PORTEIRO DE ENVIO com banco. Complementa a barreira pura de `sendTelegramGroupMessage` (que olha as URLs do texto e do botão):
 * aqui cada link `/go/<slug>` do texto ou do botão é resolvido na oferta e só passa se a oferta estiver ativa, fora da quarentena E com link
 * de afiliado válido (`linkAfiliadoDe`). Bloqueou = registra em `link_afiliado_bloqueios` (trilha) e avisa o dono no Telegram PRIVADO
 * (no máximo 1 alerta por 30 min; o alerta não carrega a URL). `LINK_AFILIADO_PORTEIRO=0` desliga só esta camada (a pura segue).
 */

const SLUG_GO = /\/go\/([^/?#\s"'<>]+)/gi;

export interface ResultadoPorteiro {
  ok: boolean;
  motivo?: string;
}

export function slugsGoDe(...textos: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of textos) {
    if (!t) continue;
    for (const url of extrairUrls(t)) {
      for (const m of url.matchAll(SLUG_GO)) {
        try {
          out.add(decodeURIComponent(m[1]));
        } catch {
          out.add(m[1]);
        }
      }
    }
  }
  return [...out];
}

async function slugsSemLinkValido(slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const rows = (await db.execute(sql`
    SELECT o.slug::text AS slug, n.slug AS rede, o.affiliate_url, o.affiliate_link_pending AS pend, o.status::text AS status, (o.quarantined_at IS NOT NULL) AS quar
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE o.slug IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)})`)) as unknown as { slug: string; rede: string; affiliate_url: string; pend: boolean; status: string; quar: boolean }[];
  const achados = new Map(rows.map((r) => [r.slug.toLowerCase(), r]));
  const c = configAfiliado();
  return slugs.filter((s) => {
    const r = achados.get(s.toLowerCase());
    return !r || r.status !== 'active' || r.quar || !linkAfiliadoDe({ redeSlug: r.rede, affiliateUrl: r.affiliate_url, affiliateLinkPending: r.pend }, c);
  });
}

export async function registrarBloqueioLink(b: { origem: string; motivo: string; detalhe?: string; url?: string | null; groupMessageId?: string | null; offerId?: string | null }): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO link_afiliado_bloqueios (origem, motivo, detalhe, url, group_message_id, offer_id)
      VALUES (${b.origem}, ${b.motivo}, ${(b.detalhe ?? '').slice(0, 500) || null}, ${(b.url ?? '').slice(0, 800) || null}, ${b.groupMessageId ?? null}::uuid, ${b.offerId ?? null}::uuid)`);
  } catch (e) {
    console.error('[porteiro-links] falha ao registrar bloqueio', e instanceof Error ? e.message : e);
  }
}

/** Alerta privado ao dono, no máximo 1 por 30 min (conta pelas linhas de bloqueio já alertadas). Sem URL no texto. Nunca lança. */
export async function alertarDonoBloqueio(origem: string, motivo: string, detalhe: string): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
    if (!token || !chat) return;
    const recente = (await db.execute(sql`SELECT 1 FROM link_afiliado_bloqueios WHERE alertado_em > now() - interval '30 minutes' LIMIT 1`)) as unknown as unknown[];
    if (recente.length) return;
    const limpo = detalhe.replace(/https?:\/\//gi, '').slice(0, 300);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: `Porteiro de links: mensagem BARRADA (${origem}). Motivo: ${motivo}. ${limpo}. Nada foi enviado. Detalhe em link_afiliado_bloqueios.` }),
    }).catch(() => null);
    if (res?.ok) await db.execute(sql`UPDATE link_afiliado_bloqueios SET alertado_em = now() WHERE id = (SELECT max(id) FROM link_afiliado_bloqueios)`);
  } catch (e) {
    console.error('[porteiro-links] falha no alerta', e instanceof Error ? e.message : e);
  }
}

/**
 * Confere uma mensagem ANTES do envio. Barra se (a) alguma URL do texto/botão não é institucional nem link de afiliado válido, ou
 * (b) algum /go/<slug> aponta para oferta sem link válido. Registra e alerta quando barra. Nunca lança (erro de banco = barra, padrão negado).
 */
export async function porteiroDeEnvio(m: { origem: string; texto: string; botoes?: (string | null | undefined)[]; groupMessageId?: string | null; offerId?: string | null }): Promise<ResultadoPorteiro> {
  if (process.env.LINK_AFILIADO_PORTEIRO === '0') return { ok: true };
  try {
    const v = auditarUrlsDeMensagem({ texto: m.texto, botoes: m.botoes });
    let motivo: string | null = null;
    let detalhe = '';
    let url: string | null = null;
    if (v.length) {
      motivo = v[0].motivo;
      detalhe = resumoViolacoes(v);
      url = v[0].url;
    } else {
      const ruins = await slugsSemLinkValido(slugsGoDe(m.texto, ...(m.botoes ?? [])));
      if (ruins.length) {
        motivo = 'go_de_oferta_sem_link_valido';
        detalhe = `slugs: ${ruins.slice(0, 3).join(',')}`;
      }
    }
    if (!motivo) return { ok: true };
    await registrarBloqueioLink({ origem: m.origem, motivo, detalhe, url, groupMessageId: m.groupMessageId, offerId: m.offerId });
    await alertarDonoBloqueio(m.origem, motivo, detalhe);
    return { ok: false, motivo: `link_bloqueado:${motivo}` };
  } catch (e) {
    return { ok: false, motivo: `link_bloqueado:erro_do_porteiro:${(e instanceof Error ? e.message : 'desconhecido').slice(0, 80)}` };
  }
}
