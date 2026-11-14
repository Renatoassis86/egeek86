// "Modelo fraco" afrouxado (dono, 2026-11-14, C5): em eletrônicos, eletrodomésticos e tecnologia o master só era aprovado em lote com MODELO
// contendo dígito. Passa a valer também "marca reconhecida + linha do produto" (ou código de modelo alfanumérico no próprio título).
// PURO: sem banco e sem rede. Nunca aceita marca desconhecida/genérica; os demais bloqueios (fora de linha, usado, retrô, item miúdo,
// console que não é aparelho, preço oscilando, oferta clicável, identidade) continuam sendo aplicados por quem chama.

export type VereditoModelo = 'ok' | 'sem_marca' | 'modelo_fraco';

export interface EntradaModelo {
  marca?: string | null;
  modelo?: string | null;
  linha?: string | null;
  mpn?: string | null;
  nome: string;
}

export interface ResultadoModelo {
  veredito: VereditoModelo;
  /** Por que passou (ou ficou): 'modelo_com_digito' | 'marca_mais_linha' | 'codigo_no_titulo' | motivo da recusa. */
  via: string;
}

const norm = (s: string): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Marca genérica, sem marca ou nome de categoria: nunca é "marca reconhecida". */
const MARCA_GENERICA =
  /^(generic[oa]?|sem marca|importad[oa]|marca propria|oem|china|nao informad[oa]|desconhecid[oa]|n a|null|outros?|diversos?|variad[oa]s?|kit|combo|portatil|eletric[oa]|digital|inteligente|smart)$/;

/** Texto de modelo/linha sem informação (vazio, "desconhecido", só resolução como "4K", só nome de categoria). */
export function textoLixo(t: string | null | undefined): boolean {
  const s = norm(t ?? '');
  if (!s) return true;
  if (/desconhecid|^null$|^n a$/.test(s)) return true;
  if (/^\d+ ?k$/.test(s)) return true;
  if (MARCA_GENERICA.test(s)) return true;
  return false;
}

/** Marca reconhecida: >= 3 letras, não genérica e presente no nome do master (ou no fabricante). */
export function marcaReconhecida(marca: string | null | undefined, nome: string): boolean {
  const m = norm(marca ?? '');
  if (m.length < 3) return false;
  if (MARCA_GENERICA.test(m)) return false;
  const n = ` ${norm(nome)} `;
  return n.includes(` ${m} `) || n.includes(` ${m.split(' ')[0]} `);
}

/** Linha válida: >= 3 caracteres com letra e que não seja a própria marca nem lixo. */
export function linhaValida(linha: string | null | undefined, marca: string | null | undefined): boolean {
  if (textoLixo(linha)) return false;
  const l = norm(linha ?? '');
  if (l.length < 3 || !/[a-z]/.test(l)) return false;
  return l !== norm(marca ?? '');
}

/** Código de modelo alfanumérico no título ("STK15", "KD-951", "A1M", "Air 3"): letras e dígitos juntos, sem ser só medida (16000Pa, 110v, 2tb). */
const MEDIDA = /^(\d+(?:[.,]\d+)?)(v|w|kw|pa|ml|l|lt|mah|gb|tb|mb|hz|khz|ghz|mm|cm|kg|g|m|k|x|pcs|pc|un|"|pol|polegadas)$/;
export function codigoNoTitulo(nome: string): string | null {
  for (const tk of norm(nome).split(' ')) {
    if (tk.length < 3 || tk.length > 14) continue;
    if (!/[a-z]/.test(tk) || !/\d/.test(tk)) continue;
    if (MEDIDA.test(tk)) continue;
    if (/^\d+[a-z]{1,3}$/.test(tk) && MEDIDA.test(tk.replace(/^(\d+)/, '$1'))) continue;
    return tk;
  }
  return null;
}

/** Veredito do "modelo": 'ok' libera para a aprovação em lote; 'sem_marca' e 'modelo_fraco' mantêm em revisão. */
export function avaliarModelo(e: EntradaModelo): ResultadoModelo {
  const marca = String(e.marca ?? '').trim();
  if (marca.length < 3) return { veredito: 'sem_marca', via: 'marca_curta_ou_ausente' };
  const modelo = String(e.modelo || e.mpn || '').trim();
  if (!textoLixo(modelo) && /\d/.test(modelo)) return { veredito: 'ok', via: 'modelo_com_digito' };
  if (!marcaReconhecida(marca, e.nome)) return { veredito: 'modelo_fraco', via: 'marca_nao_reconhecida_no_titulo' };
  if (linhaValida(e.linha, marca)) return { veredito: 'ok', via: 'marca_mais_linha' };
  const cod = codigoNoTitulo(e.nome);
  if (cod) return { veredito: 'ok', via: 'codigo_no_titulo' };
  return { veredito: 'modelo_fraco', via: 'sem_linha_nem_codigo' };
}
