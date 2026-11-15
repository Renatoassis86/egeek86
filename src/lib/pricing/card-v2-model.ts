// Módulo PURO (sem banco, sem React, sem server-only): modelo e geometria dos CARDS v2 de mensagem (fila #58, dono 2026-11-15).
// Proporção 4:5 (1080x1350): o Telegram mostra foto 4:5 inteira no chat (sem corte) e o produto ganha ~25% mais área que no quadrado.
// Flag: GROUP_CARD_V2=on liga o layout novo; qualquer outro valor (padrão) mantém o card antigo. Nada aqui muda preço, selo ou média.

export const CARD_V2_W = 1080;
export const CARD_V2_H = 1350;

/** Flag lida a cada chamada (reversível sem deploy de código): 'on' liga. */
export function cardV2On(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROUP_CARD_V2 ?? '').trim().toLowerCase() === 'on';
}

export const V2_PAD = 48;
export const V2_COLORS = {
  ink: '#0B0908',
  cream: '#F6EEDC',
  muted: '#BDB29C',
  gold: '#D4AF37',
  goldLight: '#E8C968',
  goldDeep: '#B8921F',
  onGold: '#1B1408',
  stage: '#FFFFFF',
} as const;

export interface V2Geom {
  headerH: number;
  reguaTop: number;
  reguaH: number;
  titleTop: number;
  titleBlockH: number;
  stageTop: number;
  stageH: number;
  stageW: number;
  tagTop: number;
  tagH: number;
  insightTop: number;
  faixaTop: number;
  hairlineTop: number;
  footerTop: number;
}

/** Geometria vertical. `regua` abre uma faixa de 60 px sob o cabeçalho; `hasCover` false: a foto some e o título vira o miolo do quadro. */
export function geomV2(opts: { regua: boolean; hasCover: boolean }): V2Geom {
  const headerH = 108;
  const reguaH = opts.regua ? 60 : 0;
  const titleTop = headerH + reguaH + 18;
  const titleBlockH = opts.hasCover ? 150 : 0;
  const stageTop = opts.hasCover ? titleTop + titleBlockH + 12 : headerH + reguaH + 24;
  const tagH = 128;
  const tagTop = 1048;
  return {
    headerH,
    reguaTop: headerH,
    reguaH,
    titleTop,
    titleBlockH,
    stageTop,
    stageH: tagTop - stageTop,
    stageW: CARD_V2_W - 2 * V2_PAD,
    tagTop,
    tagH,
    insightTop: tagTop + tagH + 22,
    faixaTop: tagTop + tagH + 66,
    hairlineTop: 1284,
    footerTop: 1300,
  };
}

/** Título em até 2 linhas, cortado em fronteira de palavra com reticências; corpo menor para nomes longos. */
export function clampTitleV2(raw: string): { text: string; font: number; line: number } {
  const t = raw.replace(/\s+/g, ' ').trim();
  const font = t.length <= 36 ? 46 : t.length <= 60 ? 40 : 36;
  const line = Math.round(font * 1.18);
  const max = 88;
  if (t.length <= max) return { text: t, font, line };
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  const base = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:\-–—/(\[+&]+$/u, '');
  return { text: `${base}…`, font, line };
}

/** Título dentro do quadro quando não há foto: maior, até 4 linhas. */
export function clampTitleNoCoverV2(raw: string): { text: string; font: number; line: number } {
  const t = raw.replace(/\s+/g, ' ').trim();
  const max = 104;
  const font = t.length <= 40 ? 68 : t.length <= 70 ? 58 : 50;
  const line = Math.round(font * 1.16);
  if (t.length <= max) return { text: t, font, line };
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return { text: `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:\-–—/(\[+&]+$/u, '')}…`, font, line };
}

/** Tamanho do preço na etiqueta dourada e largura da etiqueta (Inter 800: dígito ~0.64 em). Preços de 4 a 6 dígitos cabem. */
export function tagPriceV2(priceText: string): { font: number; tagW: number } {
  const maxTagW = 640;
  const padX = 38;
  const font = Math.max(60, Math.min(104, Math.floor((maxTagW - 2 * padX) / (priceText.length * 0.64))));
  const tagW = Math.min(maxTagW, Math.ceil(priceText.length * 0.64 * font) + 2 * padX);
  return { font, tagW };
}

/** Largura útil (px) da coluna de loja à direita da etiqueta e fontes que cabem nela (sem quebra). */
export function sideColumnV2(tagW: number, storeText: string, sellerText: string | null): { colW: number; store: number; seller: number; sellerText: string | null } {
  const colW = CARD_V2_W - 2 * V2_PAD - tagW - 30;
  const fit = (len: number, max: number) => Math.max(18, Math.min(max, Math.floor(colW / (Math.max(1, len) * 0.6))));
  const seller = fit(sellerText?.length ?? 1, 26);
  const maxChars = Math.max(8, Math.floor(colW / (seller * 0.6)));
  const st = sellerText && sellerText.length > maxChars ? `${sellerText.slice(0, maxChars - 1).trimEnd()}…` : sellerText;
  return { colW, store: fit(storeText.length, 32), seller, sellerText: st };
}

/** Rótulo do cupom encerrado na caixa: cabe em 1 linha (até 34 caracteres) com fonte entre 44 e 72. */
export function endedLabelV2(raw: string): { text: string; font: number } {
  const t = raw.replace(/\s+/g, ' ').trim();
  const text = t.length > 34 ? `${t.slice(0, 33).trimEnd()}…` : t;
  const font = Math.max(40, Math.min(72, Math.floor(880 / (Math.max(1, text.length) * 0.66))));
  return { text, font };
}

/**
 * Cor do quadro da foto: SEMPRE branco (dono, 2026-11-15: "essa parte preta interna fique branca"), inclusive quando a foto tem fundo
 * escuro uniforme e no card sem capa. Mantida a assinatura (2 cantos RGB) por compatibilidade; os cantos já não alteram a cor.
 */
export function stageColorV2(_a?: [number, number, number] | null, _b?: [number, number, number] | null): string {
  return V2_COLORS.stage;
}
