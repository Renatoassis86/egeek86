// LISTA das impressoras 3D (aparelhos) do Mercado Livre e da Amazon + QUEDAS individuais (#117, 2026-11-15). PURO: sem banco, sem rede.
// TODAS as ofertas ativas, frescas (24 h) e fora da quarentena, por modelo na ordem do dono (P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo,
// P2S, P1S, A1, A1 Mini, Kobra, demais Bambu, demais), do menor ao maior preço. Mensagens NOVAS e silenciosas a cada 10 min (a lista anterior é apagada); queda de preço sai em mensagem individual.
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

/** O CANAL não recebe lista nem painel (decisão do dono, 2026-11-15): o único destino é o chat privado do dono. */
export type Alvo = 'privado';

/** Flag PAINEL_IMPRESSORAS: 1/on/true/privado liga o destino privado; qualquer outro valor (inclusive 'canal') = desligada. */
export function alvosLigados(env: Record<string, string | undefined> = process.env): Alvo[] {
  const v = (env.PAINEL_IMPRESSORAS ?? '').trim().toLowerCase();
  return v === '1' || v === 'on' || v === 'true' || v === 'privado' ? ['privado'] : [];
}

export const REDE_ROTULO: Record<string, string> = { 'mercado-livre': 'Mercado Livre', amazon: 'Amazon' };

export interface BeneficioPainel { rotulo: string; needsConfirm: boolean }
export interface OfertaPainel {
  id?: string;
  title?: string | null;
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
  /** Preço visto na lista do ciclo anterior (null = sem base). */
  anteriorCents?: number | null;
  /** Caiu abaixo do menor preço dos últimos 14 dias do próprio anúncio. */
  minimo14?: boolean;
  /** Frete e prazo MEDIDOS (#118), só nos primeiros itens da lista; ausente = não mostra. */
  fretePrazo?: string | null;
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

/** Resumo de 1 linha: variação contra o ciclo anterior, novo mínimo de 14 dias, cupom e cartão (só o que foi lido). */
export function resumoOferta(o: OfertaPainel): string {
  const p: string[] = [];
  if (o.anteriorCents && o.anteriorCents !== o.cents) {
    const pct = Math.max(1, Math.round((Math.abs(o.cents - o.anteriorCents) / o.anteriorCents) * 100));
    p.push(`${o.cents < o.anteriorCents ? '↓' : '↑'} ${pct}% (era ${brl(o.anteriorCents)})`);
  }
  if (o.minimo14) p.push('novo mínimo de 14 dias');
  if (o.cupomFinalCents != null && o.cupomFinalCents > 0 && o.cupomFinalCents < o.cents) p.push(`${o.cupomNome ? `cupom ${o.cupomNome}` : 'com cupom'} ${brl(o.cupomFinalCents)}`);
  const b = (o.beneficios ?? [])[0];
  if (b) p.push(`${b.rotulo}${b.needsConfirm ? ' (a confirmar no carrinho)' : ''}`);
  return p.join(' · ');
}

function linhaOferta(i: number, o: OfertaPainel, rede: string): string {
  const loja = rede === 'amazon' ? '' : nomeLoja(o.loja);
  const l1 = o.url ? `${i}. <a href="${escapeTelegramAttr(o.url)}">${brl(o.cents)}</a>${loja}` : `${i}. ${brl(o.cents)}${loja}`;
  const r = resumoOferta(o);
  if (o.fretePrazo) return `${l1}${r ? `\n    ${e(r)}` : ''}\n    🚚 ${e(o.fretePrazo)}`;
  return r ? `${l1}
    ${e(r)}` : l1;
}

function cabecalhoSecao(s: Secao, cont: boolean): string {
  const t = e(tituloSeguro(s.titulo));
  const base = Math.min(...s.ofertas.map((o) => o.cents));
  const n = s.ofertas.length;
  if (cont) return `\n<b>${s.destaque ? '⭐ ' : ''}${t}</b> (continuação)`;
  return `\n<b>${s.destaque ? '⭐ ' : ''}${t}</b> · ${n} anúncio${n === 1 ? '' : 's'} · a partir de ${brl(base)}`;
}

function resumo(rede: 'mercado-livre' | 'amazon', secoes: Secao[], total: number): string[] {
  const L: string[] = [];
  const pl = total === 1 ? '' : 's';
  L.push(`${total} anúncio${pl} ativo${pl} em ${secoes.length} modelo${secoes.length === 1 ? '' : 's'}`);
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
  void rede;
  return L;
}

const RESERVA_CABECALHO = 170;

export function cabecalhoParte(rede: 'mercado-livre' | 'amazon', inicio: Date, i: number, n: number): string {
  const nome = rede === 'amazon' ? 'Amazon' : 'Mercado Livre';
  const l1 = `🖨️ <b>Bambu P2S/P1S Combo · ${rede === 'amazon' ? 'Amazon · ' : ''}${horaSP(inicio)} · parte ${i}/${n}</b>`;
  return rede === 'amazon' ? `${l1}
Preço na Amazon em ${diaSP(inicio)} às ${horaSP(inicio)}` : l1;
}

/** Empacota seções em mensagens: seção inteira vai junta quando cabe; seção grande começa mensagem nova e continua nas seguintes. */
function empacotar(rede: 'mercado-livre' | 'amazon', secoes: Secao[], total: number, inicio: Date, rodape: string): string[] {
  const max = LIMITE_PAINEL - rodape.length - RESERVA_CABECALHO;
  const msgs: string[][] = [resumo(rede, secoes, total)];
  const tam = (m: string[]) => m.join('\n').length;
  for (const s of secoes) {
    const linhas = s.ofertas.map((o, i) => linhaOferta(i + 1, o, rede));
    const bloco = [cabecalhoSecao(s, false), ...linhas];
    const atual = msgs[msgs.length - 1];
    if (tam(atual) + 1 + tam(bloco) <= max) { atual.push(...bloco); continue; }
    if (tam(bloco) <= max) { msgs.push(bloco); continue; }
    // Seção maior que uma mensagem: preenche o espaço que sobra na atual e continua nas seguintes.
    let cur: string[] = atual;
    cur.push(cabecalhoSecao(s, false));
    for (const l of linhas) {
      if (tam(cur) + 1 + l.length > max) { cur = [cabecalhoSecao(s, true)]; msgs.push(cur); }
      cur.push(l);
    }
  }
  return msgs.map((m, i) => `${cabecalhoParte(rede, inicio, i + 1, msgs.length)}\n${m.join('\n')}\n\n${rodape}`);
}

/** Monta a lista em mensagens (ML primeiro, depois Amazon). Painel que a barreira recusa sai e entra em `problemas`, sem derrubar os demais. */
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

// ---------------------------------------------------------------------------
// QUEDA INDIVIDUAL (mensagem de FOTO com notificação, mesma legenda dos grupos). Só afirma o que foi lido; nunca prazo inventado; "ative" só quando o tipo do cupom é conhecido.
// Gatilhos: queda >= 2% e >= R$ 50 (decidir do monitor #114), novo mínimo de 14 dias do modelo, cupom novo, cartão novo.
// ---------------------------------------------------------------------------
export const MAX_QUEDAS_POR_CICLO = 6;
/** Sem teto de queda (o dono julga pelo "preço anterior lido"). */
export const QUEDA_MAX_PLAUSIVEL_PCT = 100;
/** Os dois modelos do privado (masters). */
export const MASTERS_PRIVADO = ['2e4a5bd1-27d7-42c6-bc62-dfa1d5eace45', '23bfa05b-053e-46cc-8308-7d4332fadf18'] as const;
export type GatilhoIndividual = 'queda' | 'minimo' | 'cupom' | 'cartao';

export interface EntradaQueda {
  gatilho?: GatilhoIndividual;
  rede: string;
  titulo: string;
  loja: string | null;
  /** "98% de avaliações positivas" etc., só quando houver. */
  reputacao?: string | null;
  cents: number;
  /** Preço do ciclo anterior (ausente em gatilho de cupom/cartão sem queda). */
  anteriorCents?: number | null;
  /** Quando o preço anterior foi lido. */
  anteriorEm?: Date | null;
  minimo14: boolean;
  url: string | null;
  leituraEm: Date;
  cupom?: { nome: string | null; finalCents: number; passo: string | null } | null;
  cartoes?: { rotulo: string; finalCents: number | null; needsConfirm: boolean }[];
  /** Frete/prazo MEDIDOS (#118), ou "Prazo ainda não lido". */
  fretePrazo?: string | null;
  adTag: string;
}

const ROTULO_GATILHO: Record<GatilhoIndividual, string> = { queda: '📉 Queda de preço', minimo: '🏷️ Novo mínimo de 14 dias', cupom: '🎟️ Cupom no anúncio', cartao: '💳 Desconto no cartão' };

/** Legenda do card (cabe em 1024 caracteres visíveis; o link vai no botão, como nos grupos). */
export function textoQueda(q: EntradaQueda): string {
  const amazon = q.rede === 'amazon';
  const caiu = q.anteriorCents != null && q.anteriorCents > q.cents;
  const pct = caiu ? Math.max(1, Math.round((((q.anteriorCents as number) - q.cents) / (q.anteriorCents as number)) * 100)) : 0;
  const L: string[] = [];
  L.push(`<b>${ROTULO_GATILHO[q.gatilho ?? 'queda']}</b>`);
  L.push(`<b>${e(q.titulo.length > 100 ? `${q.titulo.slice(0, 99)}…` : q.titulo)}</b>`);
  L.push(caiu ? `<b>${brl(q.cents)}</b> (era ${brl(q.anteriorCents as number)}, queda de ${pct}%)${q.minimo14 && q.gatilho !== 'minimo' ? ' · novo mínimo de 14 dias' : ''}` : `<b>${brl(q.cents)}</b>`);
  if (caiu && q.anteriorEm) L.push(`Preço anterior lido: ${brl(q.anteriorCents as number)} em ${diaSP(q.anteriorEm)} às ${horaSP(q.anteriorEm)}`);
  const onde = [amazon ? 'Amazon' : q.loja ? e(q.loja) : null, q.reputacao ? e(q.reputacao) : null].filter(Boolean).join(' · ');
  if (onde) L.push(`Loja: ${onde}`);
  if (q.cupom) L.push(`🎟️ Cupom${q.cupom.nome ? ` ${e(q.cupom.nome)}` : ''}: <b>${brl(q.cupom.finalCents)}</b> com cupom${q.cupom.passo ? ` · ${e(q.cupom.passo)}` : ''}`);
  for (const c of (q.cartoes ?? []).slice(0, 2)) L.push(`💳 ${e(c.rotulo)}${c.finalCents ? `: ${brl(c.finalCents)}` : ''}${c.needsConfirm ? ' · a confirmar no carrinho' : ''}`);
  L.push(`🚚 ${e(q.fretePrazo || 'Prazo ainda não lido')}`);
  L.push(amazon ? `Preço na Amazon em ${diaSP(q.leituraEm)} às ${horaSP(q.leituraEm)}` : `Lido às ${horaSP(q.leituraEm)}`);
  if (q.adTag) L.push(e(q.adTag));
  return L.join('\n');
}

/** Legenda passa na barreira; se não passar devolve null (e o motivo). */
export function textoQuedaSeguro(q: EntradaQueda): { text: string | null; problemas: string[] } {
  const text = textoQueda(q);
  const problemas = textProblems(text, 'tg');
  if (text.length > TELEGRAM_MAX_CHARS) problemas.push('texto acima do limite');
  return { text: problemas.length ? null : text, problemas };
}
