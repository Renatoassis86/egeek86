// PAINÉIS VIVOS das impressoras 3D (aparelhos) do Mercado Livre e da Amazon (#117, 2026-11-15). PURO: sem banco, sem rede.
// TODAS as ofertas ativas, frescas (24 h) e fora da quarentena, por modelo na ordem do dono (P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo,
// P2S, P1S, A1, A1 Mini, Kobra, demais Bambu, demais), do menor ao maior preço. Mensagens FIXAS editadas a cada 10 min.
// Amazon em mensagens PRÓPRIAS: a barreira de texto proíbe Amazon junto de outras lojas e exige o carimbo "Preço na Amazon em dd/mm às hh:mm" (ADR 0010).
// Não afirma prazo de entrega. Sem aviso de comissão (só a marca de publicidade das mensagens do canal).
import { escapeTelegramHtml, escapeTelegramAttr, textProblems, TELEGRAM_MAX_CHARS, GROUP_LINK_BASE } from '@/lib/messaging/group-messages';
import { modeloGuia3d } from '@/lib/messaging/prioridade-3d';

export const JANELA_FRESCOR_MS = 24 * 3600_000;
export const INTERVALO_RODADA_MS = 10 * 60_000;
/** Limite de cada mensagem-painel (folga sob os 4096 do Telegram). */
export const LIMITE_PAINEL = 3900;
/** Os dois modelos em destaque. */
export const DESTAQUES = ['p2s-combo', 'p1s-combo'] as const;

export type Alvo = 'canal' | 'privado';

/** Flag PAINEL_IMPRESSORAS: 1/on/true = canal e privado; canal; privado. Padrão desligada. */
export function alvosLigados(env: Record<string, string | undefined> = process.env): Alvo[] {
  const v = (env.PAINEL_IMPRESSORAS ?? '').trim().toLowerCase();
  if (v === '1' || v === 'on' || v === 'true') return ['canal', 'privado'];
  if (v === 'canal') return ['canal'];
  if (v === 'privado') return ['privado'];
  return [];
}

export const REDE_ROTULO: Record<string, string> = { 'mercado-livre': 'Mercado Livre', amazon: 'Amazon' };

export interface BeneficioPainel { rotulo: string; needsConfirm: boolean }
export interface OfertaPainel {
  masterId: string;
  masterName: string;
  rede: string;
  loja: string | null;
  cents: number;
  url: string | null;
  checkedAt: Date;
  /** Preço com cupom lido na página (já validado pela agulha); null = sem cupom. */
  cupomFinalCents?: number | null;
  cupomNome?: string | null;
  beneficios?: BeneficioPainel[];
}

export interface EntradaPaineis { ofertas: OfertaPainel[]; inicio: Date; adTag: string; guiaUrl?: string }
export interface Painel { key: string; rede: 'mercado-livre' | 'amazon'; text: string }
export interface SaidaPaineis {
  paineis: Painel[];
  problemas: string[];
  ativosMl: number;
  ativosAmazon: number;
  modelosMl: number;
  modelosAmazon: number;
  omitidasVelhas: number;
}

export const brl = (c: number): string => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const horaSP = (d: Date): string => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
export const diaSP = (d: Date): string => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });

const e = escapeTelegramHtml;

export function ordenar(a: OfertaPainel, b: OfertaPainel): number {
  return a.cents - b.cents || b.checkedAt.getTime() - a.checkedAt.getTime() || (a.url ?? '').localeCompare(b.url ?? '');
}

const nomeLoja = (l: string | null) => (l ? ` · ${e(l.length > 28 ? `${l.slice(0, 27)}…` : l)}` : '');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Secao { chave: string; titulo: string; rank: number; ordemFixa: number; destaque: boolean; ofertas: OfertaPainel[] }

/** Seção do modelo: um dos 8 da guia (ordem fixa do dono) ou o master. Kobra, demais Bambu e demais vêm depois, em ordem alfabética estável. */
export function secaoDe(o: OfertaPainel): Pick<Secao, 'chave' | 'titulo' | 'rank' | 'ordemFixa' | 'destaque'> {
  const m = modeloGuia3d(o.masterName);
  if (m) {
    const i = ['p2s-combo', 'p1s-combo', 'a1-combo', 'a1-mini-combo', 'p2s', 'p1s', 'a1', 'a1-mini'].indexOf(m.slug);
    return { chave: m.slug, titulo: m.rotulo, rank: 0, ordemFixa: i, destaque: (DESTAQUES as readonly string[]).includes(m.slug) };
  }
  const n = norm(o.masterName);
  const rank = /kobra/.test(n) ? 1 : /bambu/.test(n) ? 2 : 3;
  return { chave: `m:${o.masterId}`, titulo: o.masterName.replace(/\s+/g, ' ').trim().slice(0, 70), rank, ordemFixa: 0, destaque: false };
}

function agruparSecoes(ofertas: OfertaPainel[]): Secao[] {
  const mapa = new Map<string, Secao>();
  for (const o of ofertas) {
    const s = secaoDe(o);
    const cur = mapa.get(s.chave) ?? { ...s, ofertas: [] };
    cur.ofertas.push(o);
    mapa.set(s.chave, cur);
  }
  const out = [...mapa.values()];
  for (const s of out) s.ofertas.sort(ordenar);
  return out.sort((a, b) => a.rank - b.rank || a.ordemFixa - b.ordemFixa || norm(a.titulo).localeCompare(norm(b.titulo)) || a.chave.localeCompare(b.chave));
}

function tituloSeguro(titulo: string): string {
  return textProblems(titulo, 'tg').length ? 'Impressora 3D' : titulo;
}

function linhaOferta(i: number, o: OfertaPainel, rede: string): string {
  const loja = rede === 'amazon' ? '' : nomeLoja(o.loja);
  return o.url ? `${i}. <a href="${escapeTelegramAttr(o.url)}">${brl(o.cents)}</a>${loja}` : `${i}. ${brl(o.cents)}${loja}`;
}

function cabecalhoSecao(s: Secao, cont: boolean): string {
  const t = e(tituloSeguro(s.titulo));
  const base = Math.min(...s.ofertas.map((o) => o.cents));
  const n = s.ofertas.length;
  if (cont) return `\n<b>${s.destaque ? '⭐ ' : ''}${t}</b> (continuação)`;
  return `\n<b>${s.destaque ? '⭐ ' : ''}${t}</b> · ${n} anúncio${n === 1 ? '' : 's'} · a partir de ${brl(base)}`;
}

function resumo(rede: 'mercado-livre' | 'amazon', secoes: Secao[], total: number, inicio: Date): string[] {
  const nomeRede = REDE_ROTULO[rede];
  const L: string[] = [];
  L.push(`🖨️ <b>IMPRESSORAS 3D · ${e(nomeRede.toUpperCase())}</b>`);
  const pl = total === 1 ? '' : 's';
  L.push(rede === 'amazon'
    ? `${total} anúncio${pl} ativo${pl} · Preço na Amazon em ${diaSP(inicio)} às ${horaSP(inicio)}`
    : `${total} anúncio${pl} ativo${pl} em ${secoes.length} modelo${secoes.length === 1 ? '' : 's'} · conferido às ${horaSP(inicio)}`);
  const dest = secoes.filter((s) => s.destaque).sort((a, b) => a.ordemFixa - b.ordemFixa);
  if (dest.length) {
    L.push('', '🏆 <b>MENOR PREÇO</b>');
    for (const s of dest) L.push(`⭐ ${e(s.titulo)}: <b>${brl(s.ofertas[0].cents)}</b>${rede === 'amazon' ? '' : nomeLoja(s.ofertas[0].loja)}`);
    const comCupom = dest.flatMap((s) => s.ofertas.filter((o) => o.cupomFinalCents != null && o.cupomFinalCents > 0 && o.cupomFinalCents < o.cents));
    comCupom.sort((a, b) => (a.cupomFinalCents as number) - (b.cupomFinalCents as number));
    if (comCupom.length) {
      const c = comCupom[0];
      const nome = c.cupomNome ? `${e(c.cupomNome)}: ` : '';
      L.push('', '🎟️ <b>CUPOM</b>', `${nome}<b>${brl(c.cupomFinalCents as number)}</b> com cupom (de ${brl(c.cents)}) · ${e(secaoDe(c).titulo)}`);
    }
    const cartoes = new Map<string, { rotulo: string; conf: boolean }>();
    for (const s of dest) for (const o of s.ofertas) for (const b of o.beneficios ?? []) {
      const k = b.rotulo.toLowerCase();
      const cur = cartoes.get(k) ?? { rotulo: b.rotulo, conf: false };
      cur.conf = cur.conf || b.needsConfirm;
      cartoes.set(k, cur);
    }
    if (cartoes.size) {
      L.push('', '💳 <b>CARTÃO E PAGAMENTO</b>');
      for (const c of [...cartoes.values()].slice(0, 4)) L.push(`• ${e(c.rotulo)}${c.conf ? ' · a confirmar no carrinho' : ''}`);
    }
  }
  L.push('', 'Prazo de entrega: não é medido por nós; a data aparece na página da loja, conforme o seu CEP.');
  return L;
}

/** Empacota seções em mensagens: seção inteira vai junta quando cabe; seção grande começa mensagem nova e continua nas seguintes. */
function empacotar(rede: 'mercado-livre' | 'amazon', secoes: Secao[], total: number, inicio: Date, rodape: string): string[] {
  const max = LIMITE_PAINEL - rodape.length - 4;
  const msgs: string[][] = [resumo(rede, secoes, total, inicio)];
  const tam = (m: string[]) => m.join('\n').length;
  for (const s of secoes) {
    const linhas = s.ofertas.map((o, i) => linhaOferta(i + 1, o, rede));
    const bloco = [cabecalhoSecao(s, false), ...linhas];
    const atual = msgs[msgs.length - 1];
    if (tam(atual) + 1 + tam(bloco) <= max) { atual.push(...bloco); continue; }
    if (tam(bloco) <= max) { msgs.push(bloco); continue; }
    // Seção maior que uma mensagem: começa em mensagem nova e divide pelas linhas.
    let cur: string[] = [cabecalhoSecao(s, false)];
    msgs.push(cur);
    for (const l of linhas) {
      if (tam(cur) + 1 + l.length > max) { cur = [cabecalhoSecao(s, true)]; msgs.push(cur); }
      cur.push(l);
    }
  }
  return msgs.map((m) => `${m.join('\n')}\n\n${rodape}`);
}

/** Monta todos os painéis (ML primeiro, depois Amazon). Painel que a barreira recusa sai e entra em `problemas`, sem derrubar os demais. */
export function montarPaineis(inp: EntradaPaineis): SaidaPaineis {
  const guiaUrl = inp.guiaUrl ?? `${GROUP_LINK_BASE}/mercado/impressao3d`;
  const t = inp.inicio.getTime();
  const validas = inp.ofertas.filter((o) => (o.rede === 'mercado-livre' || o.rede === 'amazon') && o.cents > 0 && Number.isFinite(o.cents) && (o.rede === 'amazon' || !o.loja || textProblems(o.loja, 'tg').length === 0));
  const fresh = validas.filter((o) => t - o.checkedAt.getTime() <= JANELA_FRESCOR_MS);
  const rodape = [`<a href="${escapeTelegramAttr(guiaUrl)}">Guia completa de impressoras 3D</a>`, inp.adTag ? e(inp.adTag) : ''].filter(Boolean).join('\n');
  const paineis: Painel[] = [];
  const problemas: string[] = [];
  const modelos: Record<string, number> = {};
  for (const rede of ['mercado-livre', 'amazon'] as const) {
    const lista = fresh.filter((o) => o.rede === rede);
    if (!lista.length) { problemas.push(`${rede}: sem anúncio lido nas últimas 24 h`); modelos[rede] = 0; continue; }
    const secoes = agruparSecoes(lista);
    modelos[rede] = secoes.length;
    const prefixo = rede === 'amazon' ? 'amz' : 'ml';
    empacotar(rede, secoes, lista.length, inp.inicio, rodape).forEach((text, i) => {
      const p = textProblems(text, 'tg');
      if (text.length > TELEGRAM_MAX_CHARS) p.push('texto acima do limite');
      if (p.length) problemas.push(`${prefixo}-${String(i).padStart(2, '0')}: ${p.join('; ')}`);
      else paineis.push({ key: `${prefixo}-${String(i).padStart(2, '0')}`, rede, text });
    });
  }
  return {
    paineis, problemas,
    ativosMl: fresh.filter((o) => o.rede === 'mercado-livre').length, ativosAmazon: fresh.filter((o) => o.rede === 'amazon').length,
    modelosMl: modelos['mercado-livre'] ?? 0, modelosAmazon: modelos.amazon ?? 0,
    omitidasVelhas: validas.length - fresh.length,
  };
}
