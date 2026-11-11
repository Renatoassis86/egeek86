import 'server-only';
import { ImageResponse } from 'next/og';
import { OFFER_CARD_COLORS as C } from '@/lib/pricing/offer-card-model';
import { STORE_PROFILES, loadLogo } from '@/server/messaging/store-profile-card';

/**
 * Card "CUPOM ENCERRADO" (Agente de Cupons). 1080x1080, cantos quadrados, cor da loja como no cartão de perfil.
 * Sem preço e sem promessa: só o rótulo do cupom, a frase fixa, a hora e o endereço.
 */
export interface EndedCouponCardInput {
  storeSlug: string;
  /** Rótulo já sem preço (ver cardLabel). */
  label: string;
  networkName: string;
  at: Date;
}

export async function renderEndedCouponCard(input: EndedCouponCardInput): Promise<Buffer | null> {
  const p = STORE_PROFILES[input.storeSlug] ?? STORE_PROFILES.comunidade;
  const logo = await loadLogo();
  const size = 1080;
  const hora = input.at.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const label = input.label.length > 34 ? `${input.label.slice(0, 33)}…` : input.label;
  const labelSize = label.length > 22 ? 56 : 72;
  const res = new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', position: 'relative', background: p.bg, color: C.text }}>
        <div style={{ position: 'absolute', display: 'flex', left: 56, top: 56, width: 968, height: 968, border: `2px solid ${p.edge}` }} />
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={300} height={111} alt="" style={{ position: 'absolute', left: 390, top: 110, width: 300, height: 111 }} />
        ) : (
          <div style={{ position: 'absolute', display: 'flex', left: 0, top: 140, width: size, justifyContent: 'center', fontSize: 44, color: C.gold }}>ESPAÇO GEEK 86</div>
        )}
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 268, width: size, justifyContent: 'center', fontSize: 30, letterSpacing: 4, color: p.accent }}>{p.label}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 240, top: 340, width: 600, height: 6, background: p.accent }} />
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 392, width: size, justifyContent: 'center', fontSize: 100, letterSpacing: 3, color: C.text }}>CUPOM</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 506, width: size, justifyContent: 'center', fontSize: 100, letterSpacing: 3, color: p.accent }}>ENCERRADO</div>
        <div style={{ position: 'absolute', display: 'flex', left: 90, top: 664, width: 900, justifyContent: 'center', padding: '18px 0', border: `2px solid ${p.edge}`, fontSize: labelSize, color: C.text }}>{label}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 818, width: size, justifyContent: 'center', fontSize: 38, color: C.secondary }}>{`${input.networkName} · Este cupom não vale mais`}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 892, width: size, justifyContent: 'center', fontSize: 28, color: C.secondary }}>{`Atualizado em ${hora}`}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 944, width: size, justifyContent: 'center', fontSize: 28, color: p.accent }}>egeek86.com</div>
      </div>
    ),
    { width: size, height: size }
  );
  return Buffer.from(await res.arrayBuffer());
}
