// Dono, 2026-11-18: (1) preferencia de marcas na loja de Beleza; (2) cotas por item em TODAS as lojas, para nao repetir o mesmo modelo.
// Tudo e ORDEM (quem vem primeiro na fila de envio), nunca bloqueio: "livre acesso ... sem prender o fluxo" (dono). Puro (sem banco).

/** Marcas preferidas por loja (aparecem primeiro dentro de cada tipo). Padrao em minusculo, sem acento, sem pontuacao (o nome e normalizado igual no SQL). */
export const MARCAS_PREFERIDAS: Readonly<Record<string, readonly string[]>> = {
  beleza: ['medicube', 'tsubaki', 'schwarzkopf', 'l ?oreal', 'elseve', 'biore'],
};

/** Janela da cota de FAMILIA do item (3 primeiras palavras do nome): quem ja saiu nesse prazo vai para tras de quem ainda nao saiu. */
export const COTA_FAMILIA_HORAS = 6;
/** Janela da cota de TIPO por loja: o tipo menos enviado nas ultimas 24 h abre a fila (rodizio por deficit). */
export const COTA_TIPO_HORAS = 24;

export function cotaItemLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.GROUP_COTA_ITEM ?? '').trim());
}
export function marcasPreferidasLigadas(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.GROUP_MARCAS_PREFERIDAS ?? '').trim());
}

/** Regex (Postgres `~`) das marcas preferidas da loja; null se a loja nao tem. */
export function padraoMarcas(vertical: string): string | null {
  const m = MARCAS_PREFERIDAS[vertical];
  return m && m.length ? `(^| )(${m.join('|')})( |$)` : null;
}

export const ACENTOS_DE = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç';
export const ACENTOS_PARA = 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc';

/** Mesma normalizacao do SQL (minusculo, sem acento, so letras/numeros/espaco) para testar o padrao em TS. */
export function normalizaNome(s: string): string {
  let o = '';
  for (const ch of s) {
    const i = ACENTOS_DE.indexOf(ch);
    o += i >= 0 ? ACENTOS_PARA[i] : ch;
  }
  return o.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
}
/** Familia do item: 3 primeiras palavras normalizadas (mesma regra do SQL). */
export function familiaDoItem(nome: string): string {
  return normalizaNome(nome).replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}
export function ehMarcaPreferida(vertical: string, nome: string): boolean {
  const p = padraoMarcas(vertical);
  return p ? new RegExp(p).test(normalizaNome(nome).replace(/\s+/g, ' ').trim()) : false;
}
