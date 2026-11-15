// PAINEL VIVO do Bambu Lab P2S Combo (com AMS) no canal "Impressão 3D" (#117, 2026-11-15). PURO: sem banco, sem rede.
// Uma única mensagem EDITADA a cada 30 min. Só leituras das últimas 24 h; Amazon fica de fora do texto público
// (a barreira de texto proíbe Amazon junto de outras lojas e exige carimbo próprio; ADR 0010). Não afirma prazo de entrega.
import { escapeTelegramHtml, escapeTelegramAttr, textProblems, TELEGRAM_MAX_CHARS, GROUP_LINK_BASE } from '@/lib/messaging/group-messages';

export const MASTER_P2S_COMBO = '2e4a5bd1-27d7-42c6-bc62-dfa1d5eace45';
export const JANELA_FRESCOR_MS = 24 * 3600_000;
export const INTERVALO_PAINEL_MS = 30 * 60_000;
export const MIN_LINKS = 5;
export const MAX_LINKS = 8;

export function painelLigado(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.P2S_PAINEL_CANAL ?? '').toLowerCase();
  return v === '1' || v === 'on' || v === 'true';
}

export const REDE_ROTULO: Record<string, string> = { 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', amazon: 'Amazon' };

export interface BeneficioPainel { rotulo: string; needsConfirm: boolean }
export interface OfertaPainel {
  rede: string;
  loja: string | null;
  cents: number;
  url: string | null;
  checkedAt: Date;
  /** Preço com cupom lido na página (já validado pela agulha); null = sem cupom. */
  cupomFinalCents?: number | null;
  /** Nome do cupom só quando a loja deu nome; senão o texto mostra "R$ X com cupom". */
  cupomNome?: string | null;
  beneficios?: BeneficioPainel[];
}

export interface EntradaPainel { ofertas: OfertaPainel[]; now: Date; adTag: string; guiaUrl?: string }
export interface SaidaPainel {
  text: string | null;
  problemas: string[];
  ativos: number;
  omitidasVelhas: number;
  links: number;
}

export const brl = (c: number): string => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function horaSP(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
}

const e = escapeTelegramHtml;

function ordenar(a: OfertaPainel, b: OfertaPainel): number {
  return a.cents - b.cents || b.checkedAt.getTime() - a.checkedAt.getTime();
}

/** Escolhe 5 a 8 links misturando redes/lojas: primeiro o mais barato de cada (rede, loja), depois completa pelos menores preços. */
export function escolherLinks(ofertas: OfertaPainel[]): OfertaPainel[] {
  const com = ofertas.filter((o) => !!o.url).sort(ordenar);
  const visto = new Set<string>();
  const out: OfertaPainel[] = [];
  // Garante a mais barata de cada rede (ex.: Shopee entra mesmo fora dos 8 menores).
  const redes = new Set<string>();
  for (const o of com) if (!redes.has(o.rede)) { redes.add(o.rede); out.push(o); visto.add(`${o.rede}|${(o.loja ?? '').toLowerCase()}`); }
  for (const o of com) {
    if (out.length >= MAX_LINKS) break;
    const k = `${o.rede}|${(o.loja ?? '').toLowerCase()}`;
    if (visto.has(k)) continue;
    visto.add(k);
    out.push(o);
  }
  for (const o of com) {
    if (out.length >= MIN_LINKS) break;
    if (!out.includes(o)) out.push(o);
  }
  return out.sort(ordenar);
}

function montar(base: { fresh: OfertaPainel[]; omitidas: number; now: Date; adTag: string; guiaUrl: string }, nLinks: number): { text: string; links: number } {
  const { fresh, omitidas, now, adTag, guiaUrl } = base;
  const sorted = [...fresh].sort(ordenar);
  const menor = sorted[0];
  const L: string[] = [];
  const pl = fresh.length === 1 ? '' : 's';
  L.push('🖨️ <b>BAMBU LAB P2S COMBO (com AMS)</b>');
  L.push(`${fresh.length} anúncio${pl} ativo${pl} · conferido às ${horaSP(now)}`);
  L.push('');
  const loja = menor.loja ? ` · ${e(menor.loja)}` : '';
  L.push('🏆 <b>MENOR PREÇO</b>');
  L.push(menor.url
    ? `<b>${brl(menor.cents)}</b> no ${e(REDE_ROTULO[menor.rede] ?? menor.rede)}${loja}\n<a href="${escapeTelegramAttr(menor.url)}">Ver anúncio</a>`
    : `<b>${brl(menor.cents)}</b> no ${e(REDE_ROTULO[menor.rede] ?? menor.rede)}${loja}`);

  // Menor por rede, com contagem.
  const porRede = new Map<string, OfertaPainel[]>();
  for (const o of sorted) porRede.set(o.rede, [...(porRede.get(o.rede) ?? []), o]);
  const ordemRede = ['mercado-livre', 'shopee'];
  const linhasRede = [...porRede.entries()]
    .sort((a, b) => (ordemRede.indexOf(a[0]) + 1 || 99) - (ordemRede.indexOf(b[0]) + 1 || 99))
    .map(([r, os]) => `• ${e(REDE_ROTULO[r] ?? r)}: a partir de <b>${brl(os[0].cents)}</b> (${os.length} anúncio${os.length === 1 ? '' : 's'})`);
  L.push('', '📊 <b>MENOR POR LOJA</b>', ...linhasRede);

  // Cupom: o melhor preço com cupom lido entre os anúncios frescos.
  const comCupom = sorted
    .filter((o) => o.cupomFinalCents != null && o.cupomFinalCents > 0 && o.cupomFinalCents < o.cents)
    .sort((a, b) => (a.cupomFinalCents as number) - (b.cupomFinalCents as number));
  if (comCupom.length) {
    const c = comCupom[0];
    const nome = c.cupomNome ? `${e(c.cupomNome)}: ` : '';
    const onde = e(REDE_ROTULO[c.rede] ?? c.rede) + (c.loja ? ` · ${e(c.loja)}` : '');
    L.push('', '🎟️ <b>CUPOM</b>', `${nome}<b>${brl(c.cupomFinalCents as number)}</b> com cupom (de ${brl(c.cents)}) no ${onde}`);
  }

  // Cartão / Pix: rótulos únicos entre os anúncios frescos.
  const cartoes = new Map<string, { rotulo: string; conf: boolean; redes: Set<string> }>();
  for (const o of sorted) {
    for (const b of o.beneficios ?? []) {
      const k = b.rotulo.toLowerCase();
      const cur = cartoes.get(k) ?? { rotulo: b.rotulo, conf: false, redes: new Set<string>() };
      cur.conf = cur.conf || b.needsConfirm;
      cur.redes.add(REDE_ROTULO[o.rede] ?? o.rede);
      cartoes.set(k, cur);
    }
  }
  if (cartoes.size) {
    L.push('', '💳 <b>CARTÃO E PAGAMENTO</b>');
    for (const c of [...cartoes.values()].slice(0, 4)) L.push(`• ${e(c.rotulo)} (${e([...c.redes].join(', '))})${c.conf ? ' · a confirmar no carrinho' : ''}`);
  }

  // Links.
  const links = escolherLinks(fresh).slice(0, nLinks);
  if (links.length) {
    L.push('', '🔗 <b>MENORES PREÇOS</b>');
    for (const o of links) {
      const rot = `${brl(o.cents)} · ${e(REDE_ROTULO[o.rede] ?? o.rede)}${o.loja ? ` · ${e(o.loja)}` : ''}`;
      L.push(`<a href="${escapeTelegramAttr(o.url as string)}">${rot}</a>`);
    }
  }

  L.push('', 'Prazo de entrega: a data aparece na página da loja, conforme o seu CEP.');
  if (omitidas > 0) L.push(`${omitidas} anúncio${omitidas === 1 ? '' : 's'} sem leitura nas últimas 24 h ficou${omitidas === 1 ? '' : 'ram'} de fora.`);
  L.push(`<a href="${escapeTelegramAttr(guiaUrl)}">Guia completa de impressoras 3D</a>`);
  if (adTag) L.push(e(adTag));
  return { text: L.join('\n'), links: links.length };
}

/** Monta o painel. text = null quando não há anúncio fresco ou o texto não passa na barreira (problemas explica). */
export function montarPainel(inp: EntradaPainel): SaidaPainel {
  const guiaUrl = inp.guiaUrl ?? `${GROUP_LINK_BASE}/mercado/impressao3d`;
  const publicas = inp.ofertas.filter((o) => o.rede !== 'amazon' && o.cents > 0 && Number.isFinite(o.cents));
  // Nome de loja que a barreira recusa: a oferta sai do texto (nunca o painel inteiro).
  const limpas = publicas.filter((o) => !o.loja || textProblems(o.loja, 'tg').length === 0);
  const t = inp.now.getTime();
  const fresh = limpas.filter((o) => t - o.checkedAt.getTime() <= JANELA_FRESCOR_MS);
  const omitidas = limpas.length - fresh.length;
  if (!fresh.length) return { text: null, problemas: ['sem anúncio lido nas últimas 24 h'], ativos: 0, omitidasVelhas: omitidas, links: 0 };
  let ultimo = montar({ fresh, omitidas, now: inp.now, adTag: inp.adTag, guiaUrl }, MAX_LINKS);
  for (let n = MAX_LINKS - 1; n >= 0 && ultimo.text.length > TELEGRAM_MAX_CHARS - 50; n--) {
    ultimo = montar({ fresh, omitidas, now: inp.now, adTag: inp.adTag, guiaUrl }, n);
  }
  const problemas = textProblems(ultimo.text, 'tg');
  if (ultimo.text.length > TELEGRAM_MAX_CHARS - 50) problemas.push('texto acima do limite');
  return { text: problemas.length ? null : ultimo.text, problemas, ativos: fresh.length, omitidasVelhas: omitidas, links: ultimo.links };
}
