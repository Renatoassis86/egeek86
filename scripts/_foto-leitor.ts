/** Leitor de imagem + CLIP local compartilhado (R-109 e R-116). Sem efeitos no import. */
import sharp from 'sharp';
import { LADO_PADRAO, dHash, extrairFeatures, type FotoFeatures } from '../src/lib/catalog/foto-nao-nova';

export const ENCODER = 'Xenova/clip-vit-base-patch32 (q8)';
let extrator: ((img: unknown) => Promise<{ data: ArrayLike<number> }>) | null = null;
let RawImg: { fromBlob(b: Blob): Promise<unknown> } | null = null;
async function carregarEncoder() {
  if (extrator) return;
  const tf = await import('@huggingface/transformers');
  extrator = (await tf.pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', { dtype: 'q8' })) as unknown as typeof extrator;
  RawImg = tf.RawImage as unknown as typeof RawImg;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Lida { features: FotoFeatures; hash: string; emb: number[] }

export async function lerImagem(url: string): Promise<Lida | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; egeek86-qa)' } });
    clearTimeout(t);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 6_000_000) return null;
    const img = sharp(buf, { failOn: 'none' }).removeAlpha();
    const meta = await img.metadata();
    const raw = await img.clone().resize(LADO_PADRAO, LADO_PADRAO, { fit: 'fill' }).raw().toBuffer();
    const h = await img.clone().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    await carregarEncoder();
    const emb = Array.from((await extrator!(await RawImg!.fromBlob(new Blob([new Uint8Array(buf)])))).data);
    return { emb: emb.map((x) => Math.round(x * 1e5) / 1e5), features: extrairFeatures(raw, LADO_PADRAO, { w: meta.width ?? 1, h: meta.height ?? 1 }), hash: dHash(h) };
  } catch (e) { if (process.env.DEBUG_FOTO) console.error(String(e).slice(0, 200)); return null; }
}

/** Lotes pequenos (8) com pausa entre lotes: so URLs do proprio catalogo. */
export async function lerEmLotes(urls: string[], lote = 8, pausaMs = 1500): Promise<Map<string, Lida | null>> {
  const out = new Map<string, Lida | null>();
  for (let i = 0; i < urls.length; i += lote) {
    const fatia = urls.slice(i, i + lote);
    const rs = await Promise.all(fatia.map((u) => lerImagem(u)));
    fatia.forEach((u, k) => out.set(u, rs[k]!));
    await pausa(pausaMs);
  }
  return out;
}


