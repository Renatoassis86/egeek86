// CANDIDATOS DE CUPOM DE PLATAFORMA (R-79, dono 2026-11-16). PURO: sem banco, sem rede, sem relógio.
//
// Pista da comunidade (canais públicos de Telegram, só a prévia web) NUNCA é fonte de verdade: ela vira CANDIDATO (código, valor, mínimo, limite),
// é conferida na loja pela aba logada do dono (Cupons > Inserir código) e só o que a LOJA mostrou vale. O texto do post não é guardado.
// Este módulo: (1) extrai candidatos de HTML de t.me/s/<canal>; (2) lê o resultado de "Inserir código" do ML; (3) decide o estado; (4) calcula a
// aplicação do cupom validado às nossas ofertas SEM inventar preço final (R-62/R-66: preço final só com prova de valor, por simulação).

export type RedeCandidato = 'mercado-livre' | 'shopee' | 'amazon' | 'magalu' | 'outra';
export type EscopoDito = 'todo_o_site' | 'categoria' | 'selecionados' | 'produto' | 'desconhecido';
export type EstadoCandidato = 'candidato' | 'em_conferencia' | 'validado' | 'invalido' | 'expirado' | 'descartado';

export interface Candidato {
  rede: RedeCandidato;
  codigo: string;
  valorTipo: 'reais' | 'percentual' | null;
  valorNum: number | null;
  minimoCents: number | null;
  limiteCents: number | null;
  escopoDito: EscopoDito;
  /** Público restrito dito no post (Meli+, app, cartão): fica marcado, nunca presumido como "todos". */
  restrito: boolean;
  esgotado: boolean;
  fonte: string;
  vistoEm: Date;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 1. HTML de t.me/s/<canal>

const ENT: Record<string, string> = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'", nbsp: ' ' };
export function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g[0] === '#') {
      const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[g.toLowerCase()] ?? m;
  });
}

export interface PostPublico { quando: Date | null; texto: string }

/** Lê só o texto e a data de cada post da prévia pública. Não segue links, não baixa mídia. */
export function lerPrevia(html: string): PostPublico[] {
  const out: PostPublico[] = [];
  for (const bloco of html.split('tgme_widget_message_wrap').slice(1)) {
    const t = /<time[^>]*datetime="([^"]+)"/.exec(bloco)?.[1];
    const m = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/.exec(bloco);
    if (!m) continue;
    const texto = decodeHtml(m[1]!.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
    const d = t ? new Date(t) : null;
    out.push({ quando: d && Number.isFinite(d.getTime()) ? d : null, texto });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 2. Extração de candidatos de um post

const PALAVRAS_NAO_CODIGO = new Set(['CUPOM', 'CUPONS', 'CODIGO', 'CÓDIGO', 'RESGATE', 'LOGO', 'MERCADO', 'SHOPEE', 'AMAZON', 'MAGALU', 'IFOOD', 'APP', 'TODO', 'SITE', 'OFF', 'ESGOTADO', 'ESGOTANDO', 'LISTA', 'LINK', 'SAIU', 'CORRE', 'PRIME', 'FRETE', 'GRATIS', 'LIBERADO', 'LIBERADOS', 'ESGOTANDO', 'RAPIDO', 'RÁPIDO', 'AGORA', 'CORRA', 'LOGOO']);

/** Normaliza o código: maiúsculas, sem espaços; 5 a 24 caracteres A-Z0-9, com ao menos uma letra. Senão null. */
export function normalizarCodigo(raw: string): string | null {
  const c = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 5 || c.length > 24 || !/[A-Z]/.test(c)) return null;
  if (PALAVRAS_NAO_CODIGO.has(c)) return null;
  if (/([A-Z])\1\1/.test(c)) return null; // "TODOOO", "CORREEEE": grito de post, nao codigo
  return c;
}

export function redeDoTexto(t: string): RedeCandidato {
  const s = t.toLowerCase();
  if (/mercado\s*livre|mercadolivre|meli\.la|\bmeli\b/.test(s)) return 'mercado-livre';
  if (/shopee/.test(s)) return 'shopee';
  if (/amazon|amzn\.to|\ba\.co\b/.test(s)) return 'amazon';
  if (/magalu|magazine\s*luiza|magazineluiza/.test(s)) return 'magalu';
  return 'outra';
}

const MONEY = String.raw`R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
const toCents = (s: string): number | null => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

interface Fatos { valorTipo: Candidato['valorTipo']; valorNum: number | null; minimoCents: number | null; limiteCents: number | null; escopoDito: EscopoDito }

/** Valor, mínimo, limite e escopo DITOS na linha/bloco de um código. Nada é deduzido além do escrito (o formato "R$100/999" é o padrão dito: valor/mínimo). */
export function fatosDoBloco(bloco: string): Fatos {
  const b = bloco.replace(/\s+/g, ' ');
  const f: Fatos = { valorTipo: null, valorNum: null, minimoCents: null, limiteCents: null, escopoDito: 'desconhecido' };
  let m = new RegExp(String.raw`${MONEY}\s*/\s*(\d{2,5})\b`, 'i').exec(b); // R$100/999
  if (m) { f.valorTipo = 'reais'; f.valorNum = toCents(m[1]!)! / 100; f.minimoCents = Number(m[2]) * 100; }
  if (f.valorNum === null) {
    m = new RegExp(String.raw`${MONEY}\s*(?:OFF|de desconto)`, 'i').exec(b);
    if (m) { f.valorTipo = 'reais'; f.valorNum = toCents(m[1]!)! / 100; }
  }
  if (f.valorNum === null) {
    m = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(b);
    if (m) { f.valorTipo = 'percentual'; f.valorNum = Number(m[1]!.replace(',', '.')); }
  }
  if (f.minimoCents === null) {
    m = new RegExp(String.raw`(?:acima de|a partir de|m[ií]n(?:imo|\.)?(?:\s*de)?|compras? (?:acima|a partir) de)\s*${MONEY}`, 'i').exec(b);
    if (m) f.minimoCents = toCents(m[1]!);
  }
  m = new RegExp(String.raw`(?:m[aá]x(?:imo|\.)?(?:\s*de)?|limite(?:\s*de)?|at[eé])\s*${MONEY}`, 'i').exec(b);
  if (m) f.limiteCents = toCents(m[1]!);
  if (/app\s+todo|todo\s+o\s+site|site\s+todo|todo\s+o\s+mercado|plataforma\s+toda|todo\s+mercado\s+livre/i.test(b)) f.escopoDito = 'todo_o_site';
  else if (/produtos?\s+selecionados?/i.test(b)) f.escopoDito = 'selecionados';
  else if (/\bem\s+[A-ZÀ-Ú][\wÀ-ú&\- ]{2,40}/.test(b) && /OFF|%/.test(b)) f.escopoDito = 'categoria';
  return f;
}

/**
 * Extrai candidatos de UM post. Cada código vem de uma linha com 🎟 ou "Cupom:"; o bloco da linha (até o próximo 🎟) dá valor/mínimo/limite.
 * Post de produto ("✅ R$ ... anúncio") vira candidato com escopo 'produto' (o código é de plataforma só se repetir em muitos produtos: decisão de quem confere).
 */
export function extrairCandidatos(texto: string, vistoEm: Date, fonte: string): Candidato[] {
  const rede = redeDoTexto(texto);
  const restritoPost = /meli\s*\+|meli\s*mais|exclusivo|s[óo]\s+no\s+app|assinante|cart[ãa]o/i.test(texto);
  const esgotadoPost = /esgot|acabou|encerrad|expirou/i.test(texto);
  const postDeProduto = /an[uú]ncio\b/i.test(texto) && /✅\s*R\$/.test(texto);
  const linhas = texto.split('\n');
  const idx: number[] = [];
  linhas.forEach((l, i) => { if (/🎟|cupom\s*:|c[oó]digo\s*:/i.test(l)) idx.push(i); });
  const out: Candidato[] = [];
  const vistos = new Set<string>();
  idx.forEach((i, k) => {
    const fim = k + 1 < idx.length ? idx[k + 1]! : Math.min(linhas.length, i + 4);
    const bloco = linhas.slice(i, fim).join('\n');
    const resto = linhas[i]!.replace(/🎟️?/g, ' ').replace(/^.*?(cupom(?:\s*meli\+)?|c[oó]digo)\s*:/i, ' ');
    // o código é o primeiro token A-Z0-9 (5..24) da linha que passa em normalizarCodigo, ignorando valores como R$100/999
    const tokens = (resto.match(/[A-Za-z0-9]{5,24}/g) ?? []).filter((t) => /[A-Za-z]/.test(t) && /[A-Z0-9]/.test(t));
    const token = tokens.map((t) => ({ t, c: normalizarCodigo(t) })).find((x) => x.c && x.t === x.t.toUpperCase() && !/^R\d/.test(x.t));
    if (!token?.c || vistos.has(token.c)) return;
    vistos.add(token.c);
    const f = fatosDoBloco(bloco.replace(token.t, ' '));
    // o título do post ("CUPONS APP TODO") só vale como DITO quando o bloco não diz outra coisa; continua sendo pista, nunca prova
    if (f.escopoDito === 'desconhecido' && /app\s+todo|todo\s+o\s+site|site\s+todo/i.test(texto)) f.escopoDito = 'todo_o_site';
    const restrito = restritoPost || /meli\s*\+/i.test(linhas[i]!);
    if (postDeProduto && idx.length === 1) f.escopoDito = 'produto'; // post de produto com cupom anexado: não é cupom de plataforma
    out.push({ rede, codigo: token.c, ...f, restrito, esgotado: esgotadoPost && !/ainda tem/i.test(texto), fonte, vistoEm });
  });
  return out;
}

export function extrairDaPrevia(html: string, fonte: string): Candidato[] {
  const todos: Candidato[] = [];
  for (const p of lerPrevia(html)) if (p.quando) todos.push(...extrairCandidatos(p.texto, p.quando, fonte));
  return todos;
}

/** Junta candidatos repetidos por (rede, código): fontes somam, datas pegam o mínimo/máximo, esgotado se qualquer um disser. */
export interface Agregado extends Omit<Candidato, 'fonte' | 'vistoEm'> { fontes: string[]; primeiraVez: Date; ultimaVez: Date; esgotadoVistoEm: Date | null }
export function agregar(cs: readonly Candidato[]): Agregado[] {
  const mapa = new Map<string, Agregado>();
  for (const c of cs) {
    const k = `${c.rede}|${c.codigo}`;
    const a = mapa.get(k);
    if (!a) {
      const { fonte, vistoEm, ...resto } = c;
      mapa.set(k, { ...resto, fontes: [fonte], primeiraVez: vistoEm, ultimaVez: vistoEm, esgotadoVistoEm: c.esgotado ? vistoEm : null });
      continue;
    }
    if (!a.fontes.includes(c.fonte)) a.fontes.push(c.fonte);
    if (c.vistoEm < a.primeiraVez) a.primeiraVez = c.vistoEm;
    if (c.vistoEm > a.ultimaVez) a.ultimaVez = c.vistoEm;
    if (c.esgotado && (!a.esgotadoVistoEm || c.vistoEm > a.esgotadoVistoEm)) a.esgotadoVistoEm = c.vistoEm;
    // completa o que faltava, sem sobrescrever o que já tinha; escopo 'produto' só se nenhum post disse outra coisa
    a.valorTipo ??= c.valorTipo; a.valorNum ??= c.valorNum; a.minimoCents ??= c.minimoCents; a.limiteCents ??= c.limiteCents;
    if (a.escopoDito === 'desconhecido' || (a.escopoDito === 'produto' && c.escopoDito !== 'produto' && c.escopoDito !== 'desconhecido')) a.escopoDito = c.escopoDito;
    a.restrito = a.restrito || c.restrito;
  }
  return [...mapa.values()];
}

/** Prioridade de conferência: convergência de fontes + frescor + escopo de plataforma. Maior = confere primeiro. */
export function prioridadeDeConferencia(a: Pick<Agregado, 'fontes' | 'ultimaVez' | 'escopoDito' | 'restrito' | 'esgotadoVistoEm' | 'rede'>, now: Date): number {
  if (a.rede !== 'mercado-livre') return 0; // só o ML tem validador por código
  if (a.esgotadoVistoEm && a.esgotadoVistoEm >= a.ultimaVez) return 0;
  let p = 10 * Math.min(a.fontes.length, 4);
  const idadeH = (now.getTime() - a.ultimaVez.getTime()) / 3_600_000;
  p += idadeH <= 1 ? 30 : idadeH <= 6 ? 15 : idadeH <= 24 ? 5 : 0;
  if (a.escopoDito === 'todo_o_site') p += 25;
  if (a.escopoDito === 'produto') p -= 20;
  if (a.restrito) p -= 10;
  return Math.max(0, p);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 3. Resultado de "Inserir código" na aba logada do ML

export type ResultadoCodigo =
  | { resultado: 'aceito'; nome: string | null; valorTipo: 'reais' | 'percentual' | null; valorNum: number | null; minimoCents: number | null; limiteCents: number | null; validadeTexto: string | null; validadeIso: string | null; escopo: EscopoDito; escopoTexto: string | null }
  | { resultado: 'erro_generico' }
  | { resultado: 'ja_resgatado' }
  | { resultado: 'recusado'; motivo: string }
  | { resultado: 'ilegivel' };

const MESES: Record<string, number> = { janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };
const sa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Fim do dia (23:59:59) em Brasília (UTC-3) como ISO UTC. */
const fimDoDia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d + 1, 2, 59, 59)).toISOString();

/** "Vence hoje", "Vence amanhã", "Vence 30 de novembro", "Válido até 30/11/2026" -> ISO; contagem regressiva ("Encerra em 01:55:25") e o resto -> null. */
export function vencimentoDoTexto(texto: string, agora: Date): { iso: string; raw: string } | null {
  const raw = texto.replace(/\s+/g, ' ').trim();
  const t = sa(raw);
  const mv = /(vence|valido ate|valido|expira em|expira|termina)\s+(.*)$/.exec(t);
  if (!mv) return null;
  const b = new Date(agora.getTime() - 3 * 3_600_000);
  const y = b.getUTCFullYear(), mo = b.getUTCMonth(), d = b.getUTCDate();
  const r = mv[2]!;
  if (/^hoje/.test(r)) return { iso: fimDoDia(y, mo, d), raw };
  if (/^amanha/.test(r)) return { iso: fimDoDia(y, mo, d + 1), raw };
  let m = /^(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/.exec(r);
  if (m && MESES[m[2]!] !== undefined) {
    let ano = m[3] ? Number(m[3]) : y;
    const dia = Number(m[1]);
    if (!m[3] && Date.UTC(ano, MESES[m[2]!]!, dia) < Date.UTC(y, mo, d)) ano++;
    return { iso: fimDoDia(ano, MESES[m[2]!]!, dia), raw };
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(r);
  if (m) return { iso: fimDoDia(Number(m[3]), Number(m[2]) - 1, Number(m[1])), raw };
  return null;
}

/**
 * Lê o texto do modal/cartão depois de inserir o código. Cartão de cupom = "R$ 220 OFF ... Compra mínima R$ 1.499 ... Limite de R$ 220 ... Vence ...".
 * ATENÇÃO (medido 2026-11-16): a mensagem "Tivemos um problema" é a MESMA para código encerrado e para código que nunca existiu (controle com
 * código inventado), então `erro_generico` NÃO prova que o código é falso: só que NÃO está aceito agora.
 */
export function lerResultadoCodigo(texto: string, agora: Date): ResultadoCodigo {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (!t) return { resultado: 'ilegivel' };
  if (/tivemos um problema/i.test(t)) return { resultado: 'erro_generico' };
  if (/j[aá]\s+(foi\s+)?(resgatou|resgatado|adicionou|adicionado|usou|usado)|voc[eê]\s+j[aá]\s+tem\s+(este|esse)/i.test(t)) return { resultado: 'ja_resgatado' };
  const rec = /(c[oó]digo\s+(inv[aá]lido|expirado|inexistente)|cupom\s+(expirado|esgotado|indispon[ií]vel|encerrado)|n[aã]o\s+(est[aá]\s+dispon[ií]vel|[eé]\s+v[aá]lido)|esgotou)/i.exec(t);
  if (rec) return { resultado: 'recusado', motivo: rec[1]!.toLowerCase() };
  const reais = new RegExp(String.raw`${MONEY}\s*OFF`, 'i').exec(t);
  const pct = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*OFF/i.exec(t);
  if (!reais && !pct) return { resultado: 'ilegivel' };
  const min = new RegExp(String.raw`compra\s+m[ií]nima\s*${MONEY}`, 'i').exec(t);
  const lim = new RegExp(String.raw`limite\s+de\s*${MONEY}`, 'i').exec(t);
  const venc = /(vence[^.]{0,40}|v[aá]lido at[eé][^.]{0,30})/i.exec(t);
  const v = venc ? vencimentoDoTexto(venc[1]!, agora) : null;
  const em = /\b(Em\s+(?:todo[s]?|produtos?|[A-ZÀ-Ú])[^.]{0,60}?)(?=\s+(?:Compra|Limite|Vence|V[aá]lido)|$)/.exec(t);
  const escopoTexto = em ? em[1]!.trim() : null;
  let escopo: EscopoDito = 'desconhecido';
  // "TODO O SITE" no TÍTULO com "Em produtos selecionados" no escopo (caso real de 2026-11-15) NÃO prova plataforma inteira: vale o escopo escrito.
  if (escopoTexto && /^em\s+(todo|toda|todos|todas)\b/i.test(escopoTexto) && !/selecionad/i.test(escopoTexto)) escopo = 'todo_o_site';
  else if (escopoTexto && /selecionad/i.test(escopoTexto)) escopo = 'selecionados';
  else if (escopoTexto) escopo = 'categoria';
  const nome = /^(?:Cupons?\s+)?(.{3,80}?)\s+(?:Em\s|Compra\s|Limite\s|Vence\s)/i.exec(t)?.[1]?.trim() ?? null;
  return {
    resultado: 'aceito', nome,
    valorTipo: reais ? 'reais' : 'percentual', valorNum: reais ? toCents(reais[1]!)! / 100 : Number(pct![1]!.replace(',', '.')),
    minimoCents: min ? toCents(min[1]!) : null, limiteCents: lim ? toCents(lim[1]!) : null,
    validadeTexto: v?.raw ?? null, validadeIso: v?.iso ?? null, escopo, escopoTexto,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 4. Estado

export const REGRA_RETENTATIVAS = { maxTentativas: 3, intervaloMinMin: 30, expiraSemAceiteHoras: 24 } as const;

export interface EntradaEstado {
  estadoAtual: EstadoCandidato;
  tentativas: number;
  ultimaConferenciaEm: Date | null;
  primeiraVez: Date;
  esgotadoVistoEm: Date | null;
  ultimaVez: Date;
  now: Date;
}

/** Depois de uma conferência na loja. `aceito` é o único que valida; erro genérico NÃO vira "inválido" na 1ª vez (pode ser só encerrado/instável): reconfere até o limite. */
export function estadoAposConferencia(e: EntradaEstado, r: ResultadoCodigo): { estado: EstadoCandidato; motivo: string } {
  if (r.resultado === 'aceito') return { estado: 'validado', motivo: 'aceito_pela_loja' };
  if (r.resultado === 'ja_resgatado') return { estado: 'validado', motivo: 'ja_resgatado_na_conta_lido_em_meus_cupons' };
  if (r.resultado === 'ilegivel') return { estado: 'em_conferencia', motivo: 'resposta_ilegivel_reconferir' };
  if (r.resultado === 'recusado') return { estado: 'invalido', motivo: r.motivo };
  const tent = e.tentativas + 1;
  const idadeH = (e.now.getTime() - e.primeiraVez.getTime()) / 3_600_000;
  if (e.esgotadoVistoEm && e.esgotadoVistoEm >= e.ultimaVez) return { estado: 'expirado', motivo: 'fonte_avisou_esgotado_e_loja_nao_aceita' };
  if (tent >= REGRA_RETENTATIVAS.maxTentativas) return { estado: idadeH >= REGRA_RETENTATIVAS.expiraSemAceiteHoras ? 'expirado' : 'invalido', motivo: 'loja_nao_aceita_apos_tentativas_erro_generico' };
  return { estado: 'em_conferencia', motivo: 'loja_nao_aceitou_ainda_reconferir' };
}

/** Pode conferir agora? Respeita intervalo mínimo entre conferências do mesmo código (gentileza com a conta logada). */
export function podeConferir(e: Pick<EntradaEstado, 'estadoAtual' | 'tentativas' | 'ultimaConferenciaEm' | 'now'>): boolean {
  if (e.estadoAtual === 'validado' || e.estadoAtual === 'descartado' || e.estadoAtual === 'expirado') return false;
  if (e.tentativas >= REGRA_RETENTATIVAS.maxTentativas) return false;
  if (!e.ultimaConferenciaEm) return true;
  return (e.now.getTime() - e.ultimaConferenciaEm.getTime()) / 60_000 >= REGRA_RETENTATIVAS.intervaloMinMin;
}

/** Candidato sem aceite em 24 h da primeira vez visto vira expirado (rotina diária). */
export const venceSemConferencia = (primeiraVez: Date, now: Date): boolean => (now.getTime() - primeiraVez.getTime()) / 3_600_000 >= REGRA_RETENTATIVAS.expiraSemAceiteHoras;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// 5. Teste contra os NOSSOS itens

export interface CupomLidoNaLoja {
  valorTipo: 'reais' | 'percentual'; valorNum: number; minimoCents: number | null; limiteCents: number | null;
  escopo: EscopoDito; validoAte: Date | null;
}
export interface OfertaParaTeste { id: string; rede: string; precoCents: number; categoria?: string | null }
export type Aplicacao =
  | { aplica: 'nao'; motivo: 'rede_diferente' | 'abaixo_do_minimo' | 'cupom_vencido' | 'valor_invalido' }
  | { aplica: 'depende'; motivo: 'escopo_selecionados_exige_simulacao' | 'escopo_categoria_exige_simulacao' | 'escopo_desconhecido_exige_simulacao'; descontoEstimadoCents: number }
  | { aplica: 'sim'; motivo: 'todo_o_site_declarado_pela_loja'; descontoEstimadoCents: number };

/** Desconto = valor fixo, ou % do preço, limitado pelo teto. É ESTIMATIVA interna: nunca vira "preço final" público sem prova de valor (R-66). */
export function descontoEstimado(c: CupomLidoNaLoja, precoCents: number): number {
  const bruto = c.valorTipo === 'reais' ? Math.round(c.valorNum * 100) : Math.round((precoCents * c.valorNum) / 100);
  return Math.max(0, c.limiteCents != null ? Math.min(bruto, c.limiteCents) : bruto);
}

/**
 * "Vale para todos os itens" só quando a LOJA escreveu escopo de todo o site (sem "selecionados"). Mínimo: preço da oferta >= mínimo (cupom é por carrinho:
 * oferta abaixo do mínimo só entra somada a outros itens, e isso não é dito por oferta). Os demais escopos dependem de simulação por item.
 */
export function aplicaNaOferta(c: CupomLidoNaLoja, o: OfertaParaTeste, now: Date): Aplicacao {
  if (o.rede !== 'mercado-livre') return { aplica: 'nao', motivo: 'rede_diferente' };
  if (c.validoAte && c.validoAte.getTime() <= now.getTime()) return { aplica: 'nao', motivo: 'cupom_vencido' };
  if (!(o.precoCents > 0) || !(c.valorNum > 0)) return { aplica: 'nao', motivo: 'valor_invalido' };
  if (c.minimoCents != null && o.precoCents < c.minimoCents) return { aplica: 'nao', motivo: 'abaixo_do_minimo' };
  const d = descontoEstimado(c, o.precoCents);
  if (c.escopo === 'todo_o_site') return { aplica: 'sim', motivo: 'todo_o_site_declarado_pela_loja', descontoEstimadoCents: d };
  if (c.escopo === 'selecionados') return { aplica: 'depende', motivo: 'escopo_selecionados_exige_simulacao', descontoEstimadoCents: d };
  if (c.escopo === 'categoria') return { aplica: 'depende', motivo: 'escopo_categoria_exige_simulacao', descontoEstimadoCents: d };
  return { aplica: 'depende', motivo: 'escopo_desconhecido_exige_simulacao', descontoEstimadoCents: d };
}

/** Preço final PÚBLICO: só com prova de valor final por simulação (aplicado), nunca da conta acima. */
export function precoFinalPublico(simulacaoAplicadaCents: number | null | undefined): number | null {
  return typeof simulacaoAplicadaCents === 'number' && simulacaoAplicadaCents > 0 ? simulacaoAplicadaCents : null;
}

/** Flag de desligamento rápido: padrão DESLIGADA. */
export const pistasLigadas = (env: Record<string, string | undefined> = process.env): boolean => /^(1|true|on|sim)$/i.test(env.CUPOM_PISTAS_COMUNIDADE ?? '');

/** Gentileza com a fonte: no máximo 1 requisição a cada 10 min por canal; 429/403 pausa 6 h; falhas seguidas recuam. */
export const INTERVALO_MIN_FONTE_MIN = 10;
export function podeBuscarFonte(f: { ultimoAcessoEm: Date | null; pausadaAte: Date | null }, now: Date): boolean {
  if (f.pausadaAte && f.pausadaAte > now) return false;
  return !f.ultimoAcessoEm || (now.getTime() - f.ultimoAcessoEm.getTime()) / 60_000 >= INTERVALO_MIN_FONTE_MIN;
}
export const pausaAposStatus = (status: number, now: Date): Date | null => (status === 429 || status === 403 ? new Date(now.getTime() + 6 * 3_600_000) : null);

/** Só canais da lista aprovada (Fase 1) e só a prévia pública. */
export const CANAIS_FASE1 = ['sddescontos', 'seleofertas', 'fadapromos'] as const;
export const urlPrevia = (canal: string): string | null => ((CANAIS_FASE1 as readonly string[]).includes(canal) ? `https://t.me/s/${canal}` : null);
