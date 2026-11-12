// LINK CURTO do WhatsApp (dono, 2026-11-12): https://www.egeek86.com/g/<5 caracteres base62>, que resolve para o MESMO link rastreado
// (/go/<slug>?s=wa&m=<messageKey>) gravado na linha do canal 'wa'. PURO e sem server-only (testável). O código é ALEATÓRIO (crypto),
// nunca derivado do messageKey (parecer de seguranca-db: derivar vazaria o identificador e permitiria enumerar).
import { randomInt } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_CODE_LEN = 5;
export const SHORT_CODE_RE = /^[0-9A-Za-z]{5}$/;
export const SHORT_LINK_BASE = 'https://www.egeek86.com';

/** Código aleatório de 5 caracteres base62 (62^5 ≈ 916 milhões). `rand(n)` devolve um inteiro em [0, n); injetável para teste. */
export function gerarCodigoCurto(rand: (n: number) => number = (n) => randomInt(n)): string {
  let out = '';
  for (let i = 0; i < SHORT_CODE_LEN; i++) out += BASE62[rand(BASE62.length)];
  return out;
}

export function codigoCurtoValido(code: string): boolean {
  return SHORT_CODE_RE.test(code);
}

export function linkCurto(code: string): string {
  if (!codigoCurtoValido(code)) throw new Error(`código curto inválido: ${code}`);
  return `${SHORT_LINK_BASE}/g/${code}`;
}

/** Destino do código curto: o MESMO link rastreado do canal WhatsApp. Slug e messageKey vêm SEMPRE da linha do banco, nunca da requisição. */
export function destinoDoCodigo(slug: string, messageKey: string): string | null {
  if (!slug || /[\s/?#]/.test(slug)) return null;
  if (!/^[a-z0-9-]{3,40}$/.test(messageKey)) return null;
  return `/go/${encodeURIComponent(slug)}?s=wa&m=${messageKey}`;
}
