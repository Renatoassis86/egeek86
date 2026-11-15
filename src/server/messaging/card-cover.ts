import 'server-only';
import { coverUrlVariants } from '@/lib/pricing/card-cover-urls';

/**
 * Busca da CAPA dos cards (fila #65, dono 2026-11-15). Foto REAL apenas; nunca imagem gerada.
 * - Tenta cada candidato (oferta do card, demais ofertas do master, default_images) e, em cada um, as variantes de endereço da CDN.
 * - Retentativa com espera curta em timeout, erro de rede e HTTP 5xx/429 (o que derrubava a capa na hora do envio).
 * - Qualquer formato legível pelo sharp (webp, avif, gif, tiff) vira JPEG/PNG que o satori decodifica.
 * - Cache em memória por endereço (positivo 15 min, negativo 2 min); nada em disco.
 */

export interface CoverBuffer {
  buf: Buffer;
  /** image/jpeg ou image/png (sempre decodificável pelo satori). */
  type: string;
  url: string;
  w: number;
  h: number;
}

export interface CoverResolution {
  cover: CoverBuffer | null;
  /** Uma linha por tentativa que falhou: `causa url`. Vazio quando a 1a tentativa deu certo. */
  diag: string[];
}

const ATTEMPT_TIMEOUT_MS = 7000;
const TOTAL_DEADLINE_MS = 22000;
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_SIDE_GOOD = 240;
const POS_TTL = 15 * 60_000;
const NEG_TTL = 2 * 60_000;
const CACHE_MAX = 60;

type Fetched = { ok: true; cover: CoverBuffer } | { ok: false; reason: string; transient: boolean };
const cache = new Map<string, { at: number; v: Fetched }>();

function cacheGet(url: string): Fetched | null {
  const e = cache.get(url);
  if (!e) return null;
  if (Date.now() - e.at > (e.v.ok ? POS_TTL : NEG_TTL)) {
    cache.delete(url);
    return null;
  }
  return e.v;
}
function cacheSet(url: string, v: Fetched) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(url, { at: Date.now(), v });
}

/** Normaliza qualquer formato para JPEG (ou PNG se tem transparência), com sharp. */
async function normalize(buf: Buffer): Promise<{ buf: Buffer; type: string; w: number; h: number } | null> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) return null;
    if ((meta.format === 'jpeg' || meta.format === 'png') && !meta.pages) return { buf, type: meta.format === 'png' ? 'image/png' : 'image/jpeg', w: meta.width, h: meta.height };
    const out = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
    return { buf: out.data, type: 'image/jpeg', w: out.info.width, h: out.info.height };
  } catch {
    return null;
  }
}

async function fetchOnce(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS), redirect: 'follow', headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8', 'user-agent': 'Mozilla/5.0 (compatible; EspacoGeek86-card/1.0; +https://www.egeek86.com)' } });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, transient: res.status >= 500 || res.status === 429 || res.status === 408 };
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (/^(text|application\/json)/.test(type)) return { ok: false, reason: `tipo_${type || 'vazio'}`, transient: false };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return { ok: false, reason: 'menor_que_200_bytes', transient: false };
    if (buf.length > MAX_BYTES) return { ok: false, reason: 'maior_que_8mb', transient: false };
    const n = await normalize(buf);
    if (!n) return { ok: false, reason: `ilegivel_${type || 'sem_tipo'}`, transient: false };
    return { ok: true, cover: { buf: n.buf, type: n.type, url, w: n.w, h: n.h } };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    return { ok: false, reason: /Timeout|Abort/i.test(name) ? 'timeout' : 'rede', transient: true };
  }
}

async function fetchCoverUrl(url: string, retries: number): Promise<Fetched> {
  const hit = cacheGet(url);
  if (hit) return hit;
  let last: Fetched = { ok: false, reason: 'nao_tentou', transient: false };
  for (let i = 0; i <= retries; i++) {
    last = await fetchOnce(url);
    if (last.ok || !last.transient) break;
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  cacheSet(url, last);
  return last;
}

/**
 * Devolve a melhor capa entre os candidatos (ordem de preferência) e suas variantes.
 * Para no primeiro resultado com lado menor >= 240 px; se só houver miniaturas, devolve a maior delas.
 */
export async function resolveCover(candidates: Array<string | null | undefined>): Promise<CoverResolution> {
  const diag: string[] = [];
  const t0 = Date.now();
  let weak: CoverBuffer | null = null;
  const seen = new Set<string>();
  let first = true;
  for (const c of candidates) {
    if (!c) continue;
    for (const url of coverUrlVariants(c)) {
      if (seen.has(url)) continue;
      seen.add(url);
      if (Date.now() - t0 > TOTAL_DEADLINE_MS) {
        diag.push('prazo_total');
        return { cover: weak, diag };
      }
      const r = await fetchCoverUrl(url, first ? 2 : 1);
      first = false;
      if (r.ok) {
        if (Math.min(r.cover.w, r.cover.h) >= MIN_SIDE_GOOD) return { cover: r.cover, diag };
        diag.push(`miniatura_${r.cover.w}x${r.cover.h} ${url}`);
        if (!weak || r.cover.w * r.cover.h > weak.w * weak.h) weak = r.cover;
      } else {
        diag.push(`${r.reason} ${url}`);
      }
    }
  }
  return { cover: weak, diag };
}
