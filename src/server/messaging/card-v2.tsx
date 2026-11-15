import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { formatMoney, stampLine, storePhrase, type OfferCardInput } from '@/lib/pricing/offer-card-model';
import { fundoDaLoja } from '@/lib/pricing/cor-loja';
import {
  CARD_V2_H,
  CARD_V2_W,
  V2_COLORS as K,
  V2_PAD as PAD,
  clampTitleNoCoverV2,
  clampTitleV2,
  endedLabelV2,
  geomV2,
  sideColumnV2,
  stageColorV2,
  tagPriceV2,
} from '@/lib/pricing/card-v2-model';
import { STORE_PROFILES, loadLogo } from '@/server/messaging/store-profile-card';
import { resolveCover } from '@/server/messaging/card-cover';

/**
 * CARDS v2 (fila #58): layout premium em 1080x1350 (4:5). Atrás da flag GROUP_CARD_V2=on (padrão OFF = cards antigos).
 *  - Foto REAL do produto, grande, em quadro de cor única: branco (ou a cor de fundo da própria foto quando uniforme), sem cartão dentro de cartão.
 *    A borda uniforme da foto é recortada com sharp (quando disponível); sem sharp, a foto entra inteira (contain) no mesmo quadro.
 *  - Fontes Inter (400/600/800) lidas de src/server/messaging/fonts. Falhou a leitura: fonte padrão do satori.
 *  - Preço: o MESMO da mensagem (input.priceCents); nenhuma regra de preço, selo ou média muda aqui.
 */

export interface PreparedCover {
  uri: string;
  /** Dimensões da imagem recortada (null = desconhecidas, sem sharp). */
  w: number | null;
  h: number | null;
  stage: string;
}

type FontDef = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: 'normal' };
let fontsCache: FontDef[] | null = null;
export async function loadFontsV2(): Promise<FontDef[] | undefined> {
  if (fontsCache) return fontsCache;
  try {
    const dir = join(process.cwd(), 'src', 'server', 'messaging', 'fonts');
    const out: FontDef[] = [];
    for (const weight of [400, 600, 800] as const) {
      const b = await readFile(join(dir, `inter-latin-${weight}.woff`));
      out.push({ name: 'Inter', data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight, style: 'normal' });
    }
    fontsCache = out;
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Busca a foto (fila #65: várias fontes, variantes de endereço, retentativa, conversão de formato), recorta a borda uniforme (sharp),
 * limita o tamanho e devolve a capa sobre quadro BRANCO. `diag` (opcional) recebe as causas das tentativas que falharam.
 */
export async function prepareCoverV2(source: string | null | Array<string | null | undefined>, diag?: string[]): Promise<PreparedCover | null> {
  const list = Array.isArray(source) ? source : [source];
  const r = await resolveCover(list);
  if (diag) diag.push(...r.diag);
  if (!r.cover) return null;
  return coverFromBufferV2(r.cover.buf, r.cover.type);
}

export async function coverFromBufferV2(buf: Buffer, type: string): Promise<PreparedCover> {
  const raw: PreparedCover = { uri: `data:${type};base64,${buf.toString('base64')}`, w: null, h: null, stage: K.stage };
  try {
    const sharp = (await import('sharp')).default;
    const flat = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).toBuffer();
    const meta = await sharp(flat).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return raw;
    const px = async (left: number, top: number): Promise<[number, number, number] | null> => {
      const d = await sharp(flat).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      return d.length >= 3 ? [d[0], d[1], d[2]] : null;
    };
    const stage = stageColorV2(await px(0, 0), await px(W - 1, H - 1)); // sempre branco (dono, 2026-11-15)
    let out = flat;
    let ow = W;
    let oh = H;
    try {
      const t = await sharp(flat).trim({ threshold: 16 }).toBuffer({ resolveWithObject: true });
      // Só aceita o recorte se sobrar um produto de tamanho plausível (evita comer produto branco em fundo branco).
      if (t.info.width >= 120 && t.info.height >= 120 && t.info.width * t.info.height >= W * H * 0.05) {
        out = t.data;
        ow = t.info.width;
        oh = t.info.height;
      }
    } catch {
      /* sem recorte */
    }
    const fin = await sharp(out).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return { uri: `data:image/jpeg;base64,${fin.data.toString('base64')}`, w: fin.info.width || ow, h: fin.info.height || oh, stage };
  } catch {
    return raw;
  }
}

const abs = (left: number, top: number, extra: Record<string, string | number> = {}) => ({ position: 'absolute' as const, display: 'flex' as const, left, top, ...extra });

function Header({ logo, right, accent }: { logo: string | null; right: string | null; accent: string }) {
  return (
    <>
      <div style={abs(0, 0, { width: CARD_V2_W, height: 108, background: 'rgba(0,0,0,0.28)' })} />
      <div style={abs(0, 107, { width: CARD_V2_W, height: 2, background: accent, opacity: 0.55 })} />
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={145} height={54} alt="" style={{ position: 'absolute', left: PAD, top: 27, width: 145, height: 54 }} />
      ) : (
        <div style={abs(PAD, 36, { fontSize: 30, fontWeight: 800, color: K.gold })}>ESPAÇO GEEK 86</div>
      )}
      {right ? (
        <div style={abs(CARD_V2_W - PAD - 560, 27, { width: 560, height: 54, justifyContent: 'flex-end', alignItems: 'center', fontSize: 24, fontWeight: 600, letterSpacing: 3, color: accent })}>
          {right.toLocaleUpperCase('pt-BR')}
        </div>
      ) : null}
    </>
  );
}

function Footer({ left, right, top, accent }: { left: string; right: string; top: number; accent: string }) {
  return (
    <>
      <div style={abs(PAD, top - 16, { width: CARD_V2_W - 2 * PAD, height: 1, background: accent, opacity: 0.35 })} />
      <div style={abs(PAD, top, { width: CARD_V2_W - 2 * PAD, height: 32, justifyContent: 'space-between', alignItems: 'center', fontSize: 22, color: K.muted })}>
        <div style={{ display: 'flex', fontWeight: 600, color: accent, letterSpacing: 1 }}>{left}</div>
        <div style={{ display: 'flex' }}>{right}</div>
      </div>
    </>
  );
}

function OfferView({ input, cover, logo, insight }: { input: OfferCardInput; cover: PreparedCover | null; logo: string | null; insight: string | null }) {
  const price = formatMoney(input.priceCents);
  const hasCover = cover != null;
  const g = geomV2({ regua: !!input.regua, hasCover });
  const storeText = storePhrase(input.store);
  const sellerText = input.sellerName ? `Vendido por ${input.sellerName}` : null;
  const wc = input.simple?.withoutCouponCents ?? null;
  const tp = tagPriceV2(price);
  const side = sideColumnV2(tp.tagW, storeText, sellerText);
  const ttl = clampTitleV2(input.title);
  const nc = clampTitleNoCoverV2(input.title);
  const innerPad = 28;
  const boxW = g.stageW - 2 * innerPad;
  const boxH = g.stageH - 2 * innerPad;
  let imgW = boxW;
  let imgH = boxH;
  if (cover?.w && cover.h) {
    const s = Math.min(boxW / cover.w, boxH / cover.h, 2.4);
    imgW = Math.round(cover.w * s);
    imgH = Math.round(cover.h * s);
  }
  const stageBg = K.stage; // quadro interno SEMPRE branco, com ou sem capa (dono, 2026-11-15)
  const stageBorder = hasCover ? '0px solid transparent' : `2px solid ${K.goldDeep}`;
  return (
    <div style={{ width: CARD_V2_W, height: CARD_V2_H, display: 'flex', position: 'relative', background: `linear-gradient(180deg, ${fundoDaLoja(input.vertical)} 0%, ${K.ink} 100%)`, color: K.cream, fontFamily: 'Inter' }}>
      <Header logo={logo} right={input.store} accent={K.gold} />

      {input.regua ? (
        <div style={abs(0, g.reguaTop + 2, { width: CARD_V2_W, height: g.reguaH - 2, background: input.regua.cor, color: input.regua.corTexto, alignItems: 'center', justifyContent: 'center' })}>
          <div style={{ display: 'flex', marginRight: 14 }}>
            {Array.from({ length: input.regua.degrau }).map((_, i) => (
              <div key={i} style={{ display: 'flex', width: 0, height: 0, marginRight: 4, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `14px solid ${input.regua?.corTexto}` }} />
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>{input.regua.rotulo.toLocaleUpperCase('pt-BR')}</div>
          {input.regua.pctTexto ? <div style={{ display: 'flex', fontSize: 22, fontWeight: 400, marginLeft: 16 }}>{`· ${input.regua.pctTexto}`}</div> : null}
        </div>
      ) : null}

      {hasCover ? (
        <div style={abs(PAD, g.titleTop, { width: g.stageW, height: g.titleBlockH, flexDirection: 'column', justifyContent: 'flex-end' })}>
          {input.platformLabel ? <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, letterSpacing: 3, color: K.gold, marginBottom: 8 }}>{input.platformLabel.toLocaleUpperCase('pt-BR')}</div> : null}
          <div style={{ display: 'flex', width: g.stageW, height: ttl.line * 2, overflow: 'hidden', fontSize: ttl.font, lineHeight: `${ttl.line}px`, fontWeight: 600, color: K.cream, alignItems: 'flex-end' }}>{ttl.text}</div>
        </div>
      ) : null}

      <div style={abs(PAD, g.stageTop, { width: g.stageW, height: g.stageH, background: stageBg, border: stageBorder, alignItems: 'center', justifyContent: 'center' } as Record<string, string | number>)}>
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.uri} width={imgW} height={imgH} alt="" style={{ width: imgW, height: imgH, objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: g.stageW - 2 * 56 }}>
            {input.platformLabel ? <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, letterSpacing: 3, color: K.goldDeep, marginBottom: 26 }}>{input.platformLabel.toLocaleUpperCase('pt-BR')}</div> : null}
            <div style={{ display: 'flex', width: 120, height: 5, background: K.goldDeep, marginBottom: 34 }} />
            <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', width: g.stageW - 2 * 56, maxHeight: nc.line * 4, overflow: 'hidden', fontSize: nc.font, lineHeight: `${nc.line}px`, fontWeight: 800, color: K.onGold }}>{nc.text}</div>
          </div>
        )}
      </div>

      <div style={abs(PAD, g.tagTop, { width: tp.tagW, height: g.tagH, background: `linear-gradient(135deg, ${K.goldLight} 0%, ${K.gold} 55%, ${K.goldDeep} 100%)`, alignItems: 'center', justifyContent: 'center', color: K.onGold })}>
        <div style={{ display: 'flex', fontSize: tp.font, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{price}</div>
      </div>
      <div style={abs(PAD + tp.tagW + 30, g.tagTop, { width: side.colW, height: g.tagH, flexDirection: 'column', justifyContent: 'center' })}>
        {wc ? <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: K.gold, marginBottom: 6, whiteSpace: 'nowrap' }}>{input.simple?.couponName ? `cupom ${input.simple.couponName}` : 'com o cupom'}</div> : null}
        <div style={{ display: 'flex', fontSize: side.store, fontWeight: 600, color: K.cream, whiteSpace: 'nowrap' }}>{storeText}</div>
        {side.sellerText ? <div style={{ display: 'flex', fontSize: side.seller, color: K.gold, marginTop: 6, whiteSpace: 'nowrap' }}>{side.sellerText}</div> : null}
      </div>

      {wc ? (
        <div style={abs(PAD, g.insightTop, { alignItems: 'center', fontSize: 28, color: K.muted })}>
          <div style={{ display: 'flex', textDecoration: 'line-through' }}>{formatMoney(wc)}</div>
          <div style={{ display: 'flex', marginLeft: 14 }}>sem o cupom</div>
        </div>
      ) : null}
      {insight ? (
        <div style={abs(PAD, g.insightTop, { alignItems: 'center', fontSize: 30, fontWeight: 600, color: K.goldLight })}>
          <div style={{ display: 'flex', width: 6, height: 30, background: K.gold, marginRight: 16 }} />
          <div style={{ display: 'flex' }}>{insight}</div>
        </div>
      ) : null}
      {input.regua?.faixaTexto ? <div style={abs(PAD, g.faixaTop, { width: g.stageW, fontSize: 20, color: K.muted })}>{input.regua.faixaTexto}</div> : null}

      <Footer left="egeek86.com" right={stampLine(input.checkedAt)} top={g.footerTop} accent={K.gold} />
    </div>
  );
}

/** Desenha o card de oferta v2. A foto vem já preparada; se o satori não decodificar, tenta de novo sem foto. */
export async function drawOfferCardV2(input: OfferCardInput, cover: PreparedCover | null, insight: string | null): Promise<Buffer> {
  const [logo, fonts] = await Promise.all([loadLogo(), loadFontsV2()]);
  const make = async (c: PreparedCover | null) => Buffer.from(await new ImageResponse(<OfferView input={input} cover={c} logo={logo} insight={insight} />, { width: CARD_V2_W, height: CARD_V2_H, fonts }).arrayBuffer());
  try {
    return await make(cover);
  } catch (err) {
    if (!cover) throw err;
    console.error('[card-v2] foto falhou no satori, card sem foto:', err instanceof Error ? err.message : err);
    return make(null);
  }
}

// ------------------------------------------------------------------------------------------------
// Cupom encerrado v2
// ------------------------------------------------------------------------------------------------

export interface EndedCouponV2Input {
  storeSlug: string;
  label: string;
  networkName: string;
  at: Date;
}

export async function drawEndedCouponCardV2(input: EndedCouponV2Input): Promise<Buffer> {
  const p = STORE_PROFILES[input.storeSlug] ?? STORE_PROFILES.comunidade;
  const [logo, fonts] = await Promise.all([loadLogo(), loadFontsV2()]);
  const hora = input.at.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lb = endedLabelV2(input.label);
  const res = new ImageResponse(
    (
      <div style={{ width: CARD_V2_W, height: CARD_V2_H, display: 'flex', position: 'relative', background: `linear-gradient(180deg, ${p.bg} 0%, ${K.ink} 100%)`, color: K.cream, fontFamily: 'Inter' }}>
        <Header logo={logo} right={p.label} accent={p.accent} />
        <div style={abs(PAD, 290, { width: CARD_V2_W - 2 * PAD, height: 70, justifyContent: 'center', alignItems: 'center', fontSize: 28, fontWeight: 600, letterSpacing: 6, color: p.accent })}>AVISO DE CUPOM</div>
        <div style={abs(PAD, 380, { width: CARD_V2_W - 2 * PAD, justifyContent: 'center', fontSize: 132, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: K.cream })}>CUPOM</div>
        <div style={abs(PAD, 520, { width: CARD_V2_W - 2 * PAD, justifyContent: 'center', fontSize: 132, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: p.accent })}>ENCERRADO</div>
        <div style={abs(PAD + 100, 700, { width: CARD_V2_W - 2 * PAD - 200, height: 4, background: p.accent, opacity: 0.6 })} />
        <div style={abs(PAD + 20, 760, { width: CARD_V2_W - 2 * PAD - 40, height: 150, justifyContent: 'center', alignItems: 'center', background: K.stage, border: `3px dashed ${p.accent}`, fontSize: lb.font, fontWeight: 800, letterSpacing: 2, color: K.onGold })}>{lb.text}</div>
        <div style={abs(PAD, 970, { width: CARD_V2_W - 2 * PAD, justifyContent: 'center', fontSize: 38, fontWeight: 600, color: K.cream })}>{input.networkName}</div>
        <div style={abs(PAD, 1032, { width: CARD_V2_W - 2 * PAD, justifyContent: 'center', fontSize: 32, color: K.muted })}>Este cupom não vale mais</div>
        <div style={abs(PAD, 1104, { width: CARD_V2_W - 2 * PAD, justifyContent: 'center', fontSize: 26, color: K.muted })}>{`Atualizado em ${hora}`}</div>
        <Footer left="egeek86.com" right="" top={1300} accent={p.accent} />
      </div>
    ),
    { width: CARD_V2_W, height: CARD_V2_H, fonts }
  );
  return Buffer.from(await res.arrayBuffer());
}
