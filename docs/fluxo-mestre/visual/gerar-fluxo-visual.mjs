// Gera FLUXO_VISUAL.html (11 paginas A4 paisagem, SVG inline, sem rede) a partir dos dados de
// docs/03-metodologia/FLUXO_MESTRE.md e docs/fluxo-mestre/01..06. Nenhum numero e inventado:
// o que nao esta nos documentos aparece como "sem dado" ou "NAO VERIFICADO".
// Uso: node docs/fluxo-mestre/visual/gerar-fluxo-visual.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

// ---------- tokens ----------
const C = {
  bg: '#0B0908', sf: '#161311', el: '#201C18', ln: '#3A332B', tx: '#F2E9D8', t2: '#B8AD98',
  gold: '#D4AF37', or: '#E8721C', gr: '#10B981', rd: '#EF4444', dim: '#6E655A',
};
const L = { ext: '#D4AF37', db: '#7FA3C7', cat: '#B58CD6', pre: '#E8721C', msg: '#4DB6AC', fro: '#D9779A' };
const FONT = "'Segoe UI', Arial, sans-serif";
C.msg = L.msg; C.teal = L.msg;
const W = 1122, H = 690;
const warns = [];

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cw = (fs, bold) => fs * (bold ? 0.62 : 0.575);
function wrap(s, fs, maxW, bold) {
  const words = String(s).split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (t.length * cw(fs, bold) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function T(x, y, s, o = {}) {
  const fs = o.fs || 12;
  if (fs < 11) warns.push('fonte < 11: ' + s);
  const rot = o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : '';
  const w = (o.anchor === 'middle' ? 0.5 : o.anchor === 'end' ? 1 : 0);
  void w;
  return `<text x="${x}" y="${y}" font-size="${fs}" fill="${o.fill || C.tx}" font-weight="${o.bold ? 700 : 400}" text-anchor="${o.anchor || 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.it ? ' font-style="italic"' : ''}${rot}>${esc(s)}</text>`;
}
// paragrafo: y = topo da primeira linha. Retorna {svg,h}
function P(x, y, s, maxW, o = {}) {
  const fs = o.fs || 12; const lh = o.lh || Math.round(fs * 1.3);
  const lines = wrap(s, fs, maxW, o.bold);
  let out = '';
  lines.forEach((ln, i) => { out += T(o.anchor === 'middle' ? x : x, y + fs + i * lh - 2, ln, o); });
  return { svg: out, h: lines.length * lh, n: lines.length };
}
function R(x, y, w, h, o = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op ? ` opacity="${o.op}"` : ''}/>`;
}
function line(x1, y1, x2, y2, o = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || C.ln}" stroke-width="${o.sw || 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
}
// seta ortogonal por pontos; ponta no ultimo ponto
function arrow(pts, o = {}) {
  const col = o.stroke || C.t2; const sw = o.sw || 1.6; const hs = o.head || 6;
  const [x2, y2] = pts[pts.length - 1]; const [x1, y1] = pts[pts.length - 2];
  const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
  const bx = x2 - dx * hs, by = y2 - dy * hs;
  const path = pts.slice(0, -1).map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') + ` L${bx} ${by}`;
  let head;
  if (dx !== 0) head = `${x2},${y2} ${bx},${y2 - hs * 0.7} ${bx},${y2 + hs * 0.7}`;
  else head = `${x2},${y2} ${x2 - hs * 0.7},${by} ${x2 + hs * 0.7},${by}`;
  return `<path d="${path}" fill="none" stroke="${col}" stroke-width="${sw}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/><polygon points="${head}" fill="${col}"/>`;
}
// rotulo com fundo para ficar legivel sobre linhas
function tag(x, y, s, o = {}) {
  const fs = o.fs || 11; const w = s.length * cw(fs) + 8;
  const x0 = o.anchor === 'middle' ? x - w / 2 : x;
  return R(x0, y - fs - 1, w, fs + 6, { fill: o.bg || C.bg }) + T(x0 + 4, y + 1, s, { fs, fill: o.fill || C.t2, bold: o.bold });
}
// caixa de no: id (opcional) em linha propria, titulo em negrito, subtitulo
function node(x, y, w, o) {
  const fs = o.fs || 12; const inner = w - 20;
  const tl = wrap(o.title, fs, inner, true);
  const sl = o.sub ? wrap(o.sub, 11, inner) : [];
  const need = 6 + (o.id ? 13 : 0) + tl.length * (fs + 3) + sl.length * 14 + 4;
  const h = Math.max(o.h || 0, need);
  let s = R(x, y, w, h, { fill: o.fill || C.el, stroke: o.dash ? o.color : C.ln, sw: o.dash ? 1.4 : 1, dash: o.dash });
  s += R(x, y, 4, h, { fill: o.color });
  let cy = y + 6;
  if (o.id) { s += T(x + 12, cy + 10, o.id, { fs: 11, bold: true, fill: o.color }); cy += 13; }
  tl.forEach((ln, i) => { s += T(x + 12, cy + fs + i * (fs + 3) - 2, ln, { fs, bold: true, fill: o.tfill || C.tx }); });
  cy += tl.length * (fs + 3);
  sl.forEach((ln, i) => { s += T(x + 12, cy + 11 + i * 14 - 1, ln, { fs: 11, fill: C.t2 }); });
  return { svg: s, h, x, y, w };
}
// caixa de fila (retangulo segmentado)
function fila(x, y, w, o) {
  const h = o.h || 40; const slots = 5; const sw = 16;
  let s = R(x, y, w, h, { fill: C.sf, stroke: o.color, sw: 1.4, dash: '5 3' });
  for (let i = 0; i < slots; i++) s += R(x + 6 + i * (sw + 3), y + 6, sw, 8, { fill: o.color, op: 0.35 + i * 0.12 });
  s += T(x + 6 + slots * (sw + 3) + 2, y + 14, o.id, { fs: 11, bold: true, fill: o.color });
  s += T(x + 6, y + 31, o.label, { fs: 11, fill: C.tx });
  if (T.length && (6 + o.label.length * cw(11)) > w) warns.push('fila estoura: ' + o.label);
  return s;
}
function icon(name, x, y, size, col) {
  const d = ICON[name] || ICON.box;
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="miter" stroke-linecap="butt"><path d="${d}"/></g>`;
}
const ICON = {
  ban: 'M3 3h18v18H3z M3 21L21 3', plug: 'M8 3v5 M16 3v5 M5 8h14v5l-3 4H8l-3-4z M12 17v4', key: 'M3 9h10v6H3z M13 12h8 M18 12v4 M21 12v3',
  clock: 'M3 3h18v18H3z M12 7v5l4 3', undo: 'M9 5L4 10l5 5 M4 10h11v9h5', box: 'M3 8l9-5 9 5v9l-9 5-9-5z M3 8l9 5 9-5 M12 13v9',
  question: 'M3 3h18v18H3z M9 9h6v3l-3 2v1 M12 18v1', split: 'M12 3v8 M12 11L5 20 M12 11l7 9', equal: 'M3 3h18v18H3z M7 9h10 M7 15h10',
  shield: 'M12 3l8 3v6l-8 9-8-9V6z M9 12l2 2 4-4', flag: 'M5 3v18 M5 4h13l-3 4 3 4H5', chart: 'M3 21h18 M5 17l4-5 4 3 6-9',
  badge: 'M12 3l3 5 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z', steps: 'M3 20h5v-5h5v-5h5V5h3', band: 'M3 6h18 M3 18h18 M8 9h8v6H8z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5', refresh: 'M4 8h14l-4-4 M20 16H6l4 4', percent: 'M5 19L19 5 M6 6h3v3H6z M15 15h3v3h-3z',
  text: 'M4 5h16 M4 10h12 M4 15h16 M4 20h8 M3 3L21 21', card: 'M3 6h18v12H3z M3 10h18 M6 15h5', hash: 'M9 4L7 20 M17 4l-2 16 M4 9h17 M3 15h17',
  link: 'M4 8h6v8H4z M14 8h6v8h-6z M10 12h4', user: 'M9 4h6v6H9z M5 21v-5h14v5', lock: 'M6 11h12v10H6z M8 11V7h8v4',
  ticket: 'M3 6h18v4l-2 2 2 2v4H3v-4l2-2-2-2z M14 6v12', image: 'M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6', calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  door: 'M6 3h12v18H6z M14 12h2', pulse: 'M3 12h4l3-7 4 14 3-7h4', db: 'M5 4h14v4H5z M5 10h14v4H5z M5 16h14v4H5z',
  sliders: 'M4 7h16 M4 17h16 M9 4v6 M15 14v6', check: 'M4 12l5 5 11-11',
};

// ---------- moldura de pagina ----------
const pages = [];
function page(n, titulo, sub, body, fonte) {
  pages.push(`<section class="page"><div class="hd"><div class="kicker">FLUXO MESTRE · VISUAL</div><h1>${esc(titulo)}</h1><div class="sub">${esc(sub)}</div><div class="num">${n} / 11</div></div><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">${body}</svg><div class="ft">${esc(fonte)}</div></section>`);
}
const M = 24; // margem lateral do svg

// =====================================================================
// PAGINA 1 - mapa ponta a ponta
// =====================================================================
{
  let s = '';
  const lw = 164, gap = 18, top = 0;
  const lanes = [
    ['ext', '1 · EXTRAÇÃO'], ['db', '2 · BANCO'], ['cat', '3 · CATÁLOGO E IDENTIDADE'], ['pre', '4 · PREÇO E MÉDIA'], ['msg', '5 · MENSAGENS'], ['fro', '6 · FRONT E ADMIN'],
  ];
  const lx = (i) => M + i * (lw + gap);
  const laneH = 582;
  lanes.forEach(([k, nome], i) => {
    s += R(lx(i), top, lw, laneH, { fill: C.sf, stroke: C.ln });
    s += R(lx(i), top, lw, 34, { fill: L[k] });
    s += T(lx(i) + 8, top + 22, nome.length > 22 ? nome : nome, { fs: 12, bold: true, fill: C.bg });
  });
  const N = {}; // nos por id
  const cur = [44, 44, 44, 44, 44, 44];
  const add = (lane, key, o) => {
    const n = node(lx(lane) + 8, cur[lane], lw - 16, { ...o, color: L[lanes[lane][0]] });
    N[key] = n; s += n.svg; cur[lane] += n.h + 5; return n;
  };
  const q = (lane, id, label) => { s += fila(lx(lane) + 8, cur[lane] + 2, lw - 16, { id, label, color: L[lanes[lane][0]], h: 38 }); cur[lane] += 44; };
  // lane 0 extracao
  add(0, 'N01', { id: 'N01', title: 'collect-prices ML', sub: '12/h · API oficial' });
  add(0, 'N02', { id: 'N02', title: 'collect-shopee', sub: '12/h · API Shopee' });
  add(0, 'N03', { id: 'N03', title: 'verticais ×6', sub: '4/h cada · API ML' });
  add(0, 'N04', { id: 'N04 a N07', title: 'semear e discover', sub: 'fila-api, webhook' });
  add(0, 'N09', { id: 'N09', title: 'Amazon, aba logada', sub: 'laço contínuo' });
  add(0, 'N10', { id: 'N10 a N12', title: 'links e cupons', sub: 'laços na aba do dono' });
  add(0, 'N13', { id: 'N13', title: 'rotas /api/ingest', sub: 'token + origem fixa' });
  q(0, 'Q01', '~6.335 devidas'); q(0, 'Q10', 'Amazon 240/ciclo');
  // lane 1 banco
  add(1, 'b_of', { title: 'ofertas', sub: 'ativas, rascunho, expiradas' });
  add(1, 'b_sn', { title: 'snapshots de preço', sub: 'hora do servidor' });
  add(1, 'b_mp', { title: 'masters', sub: 'um jogo, um master' });
  add(1, 'b_id', { title: 'itens de identidade', sub: 'dúvidas a decidir' });
  add(1, 'b_cp', { title: 'leituras de cupom', sub: 'lidas na fonte' });
  add(1, 'b_rn', { title: 'execuções dos jobs', sub: 'collector_runs' });
  add(1, 'pg', { id: 'N32', title: 'Postgres Micro', sub: '60 conexões; todos se encontram aqui' });
  q(1, 'S05', 'pilha de reversão');
  s += P(lx(1) + 8, cur[1] + 2, 'Toda gravação em massa guarda backup e log.', lw - 16, { fs: 11, fill: C.t2 }).svg;
  // lane 2 catalogo
  add(2, 'N14', { id: 'N14', title: 'porteiro e dedup', sub: 'só original e em linha' });
  add(2, 'N15', { id: 'N15', title: 'identidade e escopo', sub: 'dúvida fica fora' });
  add(2, 'N16', { id: 'N16', title: 'fila do dono', sub: 'classificação' });
  add(2, 'N17', { id: 'N17', title: 'aprovação de masters', sub: 'em bloco, com backup' });
  cur[2] += 8;
  q(2, 'Q12', '999 identidade'); q(2, 'Q13', 'revisão 504 + 132'); q(2, 'S01', '182 rascunhos');
  // lane 3 preco
  add(3, 'N18', { id: 'N18', title: 'gancho por cotação', sub: 'oferta-dia, menor preço' });
  add(3, 'N19', { id: 'N19', title: 'média oferta-dia', sub: 'minutos 9 e 39' });
  add(3, 'N20', { id: 'N20', title: 'stats (legado)', sub: 'em retirada; não oficial', dash: '5 3' });
  add(3, 'N21', { id: 'N21', title: 'vitrine pronta', sub: '4 vezes por hora' });
  cur[3] += 8;
  q(3, 'Q18', '~5.000 produtos/ciclo'); q(3, 'Q17', '15.492 eventos');
  s += P(lx(3) + 8, cur[3] + 6, 'Uma média por produto; cada oferta vale 1 por dia.', lw - 16, { fs: 11, fill: C.t2 }).svg;
  // lane 4 mensagens
  add(4, 'N24', { id: 'N24', title: 'agulha de cupom', sub: 'só com leitura válida' });
  add(4, 'N23', { id: 'N23', title: 'group-messages', sub: 'todo minuto; envio até 38 s' });
  add(4, 'N25', { id: 'N25', title: 'guardião de cupons', sub: 'avisa quando encerra' });
  add(4, 'N26', { id: 'N26', title: 'Telegram', sub: '1 canal por loja' });
  add(4, 'N27', { id: 'N27', title: 'WhatsApp assistido', sub: 'admin cola e marca' });
  cur[4] += 8;
  q(4, 'Q06', '416 a enviar'); q(4, 'S02', '125 esperam clique');
  // lane 5 front
  add(5, 'N28', { id: 'N28', title: 'páginas públicas', sub: 'leem o estado diário' });
  add(5, 'N29', { id: 'N29', title: 'admin', sub: 'catálogo, mensagens, cupons' });
  add(5, 'N33', { id: 'N33', title: '/admin/fluxo', sub: 'fluxo ao vivo, 30 s' });
  add(5, 'N22', { id: 'N22', title: 'inventário', sub: '1 linha por loja por dia' });
  cur[5] += 8;
  q(5, 'Q19', '73 linhas com > 2 h');
  // conectores (cada um em sua coluna dentro do vao de 18 px)
  const out = (n) => [n.x + n.w, n.y + n.h / 2], inn = (n) => [n.x, n.y + n.h / 2];
  const elbow = (a, b, col, off) => { const [x1, y1] = out(a), [x2, y2] = inn(b); const mx = x1 + off; return arrow([[x1, y1], [mx, y1], [mx, y2], [x2, y2]], { stroke: col, sw: 2, head: 6 }); };
  s += elbow(N.N01, N.b_of, L.ext, 3);
  s += elbow(N.N02, N.b_sn, L.ext, 6);
  s += elbow(N.N04, N.b_mp, L.ext, 9);
  s += elbow(N.N09, N.b_id, L.ext, 12);
  s += elbow(N.N10, N.b_cp, L.ext, 15);
  s += elbow(N.N13, N.b_rn, L.ext, 8);
  s += elbow(N.b_of, N.N14, L.db, 4);
  s += elbow(N.b_id, N.N16, L.db, 8);
  s += elbow(N.b_mp, N.N17, L.db, 12);
  s += elbow(N.N15, N.N19, L.cat, 6);
  s += elbow(N.N19, N.N23, L.pre, 9);
  s += elbow(N.N23, N.N29, L.msg, 9);
  const ruleLane = [['R-02', 'só API oficial'], ['R-38', 'transação curta'], ['R-11', 'dúvida fica fora'], ['R-17', 'uma média só'], ['R-22', 'reconferir e enviar'], ['R-01', 'nada de dado fake']];
  ruleLane.forEach(([r, t], i) => {
    const k = lanes[i][0];
    s += R(lx(i) + 8, laneH - 42, lw - 16, 34, { fill: C.bg, stroke: L[k], sw: 1.5 });
    s += T(lx(i) + 16, laneH - 20, r, { fs: 12, bold: true, fill: L[k] });
    s += T(lx(i) + 52, laneH - 20, t, { fs: 11, fill: C.tx });
  });
  // governanca
  const gy = 592, gh = 62;
  s += R(M, gy, 1074, gh, { fill: C.sf, stroke: C.ln });
  s += T(M + 10, gy + 14, 'GOVERNANÇA · vale para as 6 raias', { fs: 11, bold: true, fill: C.gold, ls: 1 });
  const gb = [
    ['Dono', 'decide negócio e risco', C.gold], ['Conselho Geek', 'parecer e ata; consultivo', C.gold],
    ['N31 vigia · 5 min', 'reinjeta laços; mata transação > 120 s', C.t2], ['N30 collector-health', 'SLOs e alerta ao dono', C.t2],
  ];
  gb.forEach(([a, b, col], i) => {
    const x = M + 10 + i * 266;
    s += R(x, gy + 20, 254, 38, { fill: C.el, stroke: col });
    s += T(x + 10, gy + 35, a, { fs: 12, bold: true });
    s += T(x + 10, gy + 51, b, { fs: 11, fill: C.t2 });
  });
  // setas pontilhadas da governanca para as raias
  for (let i = 0; i < 6; i++) s += arrow([[lx(i) + lw / 2, gy], [lx(i) + lw / 2, laneH + 6]], { stroke: C.dim, dash: '3 3', sw: 1.2, head: 5 });
  // legenda
  const ly = 676;
  s += R(M, ly - 11, 14, 12, { fill: C.el, stroke: C.ln }) + T(M + 20, ly, 'processo', { fs: 11, fill: C.t2 });
  s += R(M + 90, ly - 11, 24, 12, { fill: C.sf, stroke: C.t2, dash: '4 2' }) + R(M + 94, ly - 8, 5, 6, { fill: C.t2, op: 0.5 }) + R(M + 101, ly - 8, 5, 6, { fill: C.t2, op: 0.8 });
  s += T(M + 122, ly, 'fila (Q) ou pilha (S), tamanho medido em 12/11', { fs: 11, fill: C.t2 });
  s += arrow([[M + 440, ly - 5], [M + 470, ly - 5]], { stroke: C.t2, head: 5 }) + T(M + 478, ly, 'dado', { fs: 11, fill: C.t2 });
  s += arrow([[M + 530, ly - 5], [M + 560, ly - 5]], { stroke: C.dim, dash: '3 3', head: 5 }) + T(M + 568, ly, 'decisão, alarme ou correção', { fs: 11, fill: C.t2 });
  s += R(M + 740, ly - 11, 14, 12, { fill: C.el, stroke: L.pre, dash: '4 2', sw: 1.4 }) + T(M + 760, ly, 'tracejado = legado em retirada', { fs: 11, fill: C.t2 });
  page(1, 'Do preço na loja à mensagem no canal', 'Seis raias, um banco no meio. A pilha de reversão guarda tudo o que se grava em massa.', s,
    'Fonte: FLUXO_MESTRE.md seções 1, 2 e 3. Cadências do vercel.json (19 jobs quando este mapa foi desenhado; hoje 21: entraram cobertura-shopee e aprovacao-auto, página 11). Tamanhos de fila MEDIDOS em 2026-11-12, ~11:50 UTC; envelhecem.');
}

// =====================================================================
// PAGINA 2 - tres familias de coleta
// =====================================================================
{
  let s = '';
  const cols = [
    { t: 'A · API OFICIAL NO SERVIDOR', c: L.ext, sub: 'Vercel Cron grava no banco. Fonte padrão (R-02).' },
    { t: 'B · ABAS LOGADAS DO DONO', c: L.pre, sub: 'Exceção autorizada: fila curta, sem contornar captcha, login ou 429.' },
    { t: 'C · DERIVAÇÃO INTERNA', c: L.db, sub: 'Sem chamada externa: só lê o banco e recalcula.' },
  ];
  const cwid = 350, cg = 12;
  const rowsA = [
    ['N01 collect-prices ML', 12, '*/5 · 200 s', 24], ['N02 collect-shopee', 12, '*/5 · 300 s', null], ['N03 verticais ×6', 24, '4/h cada · 300 s', null],
    ['N04 semear', 3, '7-57/20 · 504 de 12.000 chamadas/dia', null], ['N05 discover ML', 1, '17 * * * * · medido 3/h', 3], ['N07 fila-api-oficial', 3, '8,28,48 · teto 1.200/24 h', null],
  ];
  const rowsB = [
    ['N09 Amazon', 400, '~400 itens/h · 375 itens/ciclo'], ['N10 links meli.la', 461, '~461 links/h · lote 25'], ['N11 cupom ML', 530, '~530 leituras/h'],
    ['N12 cupom Shopee', 0, 'parado desde 02:17 UTC (FM-11)'], ['N12 cupom Amazon', 177, '177 leituras, 0 cupom (seletores NÃO VERIFICADOS)'],
  ];
  const rowsC = [
    ['N08 fila-classificação', 2, '13 e 43'], ['N19 média oferta-dia', 2, '9 e 39'], ['N20 stats (legado)', 2, '0 e 30'],
    ['N21 vitrine pronta', 4, '4,19,34,49'], ['N22 inventário', 1, 'minuto 41'], ['N18 gancho', 0, 'a cada cotação, sem relógio'],
  ];
  cols.forEach((c, i) => {
    const x = M + i * (cwid + cg);
    s += R(x, 0, cwid, 470, { fill: C.sf, stroke: C.ln });
    s += R(x, 0, cwid, 34, { fill: c.c });
    s += T(x + 10, 22, c.t, { fs: 13, bold: true, fill: C.bg });
    s += P(x + 10, 42, c.sub, cwid - 20, { fs: 11, fill: C.t2 }).svg;
  });
  const barX = (i) => M + i * (cwid + cg) + 10;
  // A
  s += T(barX(0), 96, 'disparos por hora (escala 0 a 24)', { fs: 11, fill: C.gold, bold: true });
  rowsA.forEach(([nome, v, cad, med], k) => {
    const y = 108 + k * 58; const bw = 330 * (v / 24);
    s += T(barX(0), y + 12, nome, { fs: 12, bold: true });
    s += R(barX(0), y + 20, 330, 12, { fill: C.el });
    s += R(barX(0), y + 20, bw, 12, { fill: C.gold });
    if (med) s += R(barX(0), y + 20, 330 * (med / 24), 12, { stroke: C.rd, dash: '3 2', sw: 1.4 });
    s += T(barX(0) + 330, y + 12, v + '/h', { fs: 12, bold: true, anchor: 'end', fill: C.gold });
    s += T(barX(0), y + 46, cad, { fs: 11, fill: C.t2 });
  });
  s += T(barX(0), 462, 'contorno vermelho = medido (24/h), origem NÃO VERIFICADA', { fs: 11, fill: C.rd });
  // B
  s += T(barX(1), 96, 'itens por hora, medidos (escala 0 a 600)', { fs: 11, fill: C.or, bold: true });
  rowsB.forEach(([nome, v, cad], k) => {
    const y = 108 + k * 70; const bw = 330 * (v / 600);
    s += T(barX(1), y + 12, nome, { fs: 12, bold: true });
    s += R(barX(1), y + 20, 330, 12, { fill: C.el });
    if (v > 0) s += R(barX(1), y + 20, Math.max(bw, 2), 12, { fill: C.or });
    else s += R(barX(1), y + 20, 330, 12, { stroke: C.rd, dash: '3 2' });
    s += T(barX(1) + 330, y + 12, v ? String(v) : 'parado', { fs: 12, bold: true, anchor: 'end', fill: v ? C.or : C.rd });
    s += P(barX(1), y + 36, cad, 330, { fs: 11, fill: C.t2 }).svg;
  });
  s += T(barX(1), 462, 'Amazon: carimbo de hora do servidor (R-04).', { fs: 11, fill: C.t2 });
  // C
  s += T(barX(2), 96, 'execuções por hora (escala 0 a 4)', { fs: 11, fill: C.db, bold: true });
  rowsC.forEach(([nome, v, cad], k) => {
    const y = 108 + k * 58; const bw = 330 * (v / 4);
    s += T(barX(2), y + 12, nome, { fs: 12, bold: true });
    s += R(barX(2), y + 20, 330, 12, { fill: C.el });
    if (v > 0) s += R(barX(2), y + 20, bw, 12, { fill: C.db });
    else s += R(barX(2), y + 20, 330, 12, { stroke: C.db, dash: '3 2' });
    s += T(barX(2) + 330, y + 12, v ? v + '/h' : 'por evento', { fs: 12, bold: true, anchor: 'end', fill: C.db });
    s += T(barX(2), y + 46, cad, { fs: 11, fill: C.t2 });
  });
  s += T(barX(2), 462, 'group-messages roda todo minuto (60/h); está na página 6.', { fs: 11, fill: C.t2 });
  // funil
  const fy = 492;
  for (let i = 0; i < 3; i++) s += arrow([[M + i * (cwid + cg) + cwid / 2, 470], [M + i * (cwid + cg) + cwid / 2, fy]], { stroke: [L.ext, L.pre, L.db][i], sw: 2, head: 7 });
  s += R(M, fy, 1074, 70, { fill: C.el, stroke: C.gold, sw: 1.5 });
  s += T(M + 14, fy + 26, 'Porteiro e dedup (N14) → ofertas e snapshots no banco', { fs: 15, bold: true, fill: C.gold });
  s += T(M + 14, fy + 48, 'Só cotação real lida. Sem preço lido, sem snapshot (R-01). Dúvida de identidade fica fora até o dono decidir (R-11).', { fs: 12, fill: C.tx });
  // regras
  const rr = [['R-02', 'Só API oficial; scraping proibido'], ['R-37', 'Nenhum laço para: recua e retoma'], ['R-01', 'Buraco aparece como buraco'], ['R-04', 'Hora da leitura é do servidor']];
  rr.forEach(([a, b], i) => {
    const x = M + i * 270;
    s += R(x, 580, 258, 50, { fill: C.sf, stroke: C.ln });
    s += T(x + 10, 602, a, { fs: 13, bold: true, fill: C.gold });
    s += T(x + 60, 602, b, { fs: 11, fill: C.tx });
    s += T(x + 10, 620, ['CÓDIGO', 'VIOLADA em 2 laços', 'VIOLADA em /inteligencia-gamer', 'CÓDIGO'][i], { fs: 11, fill: [C.gr, C.rd, C.rd, C.gr][i], bold: true });
  });
  s += T(M, 656, 'Rotas fora do vercel.json (cobertura-shopee, ampliar-amostra-shopee, discover-shopee-esporte, import-shopee-conversions, loja-teste): sem agendador conhecido, NÃO VERIFICADO.', { fs: 11, fill: C.t2 });
  page(2, 'Três famílias de coleta', 'A mesma regra para todas: só dado lido, hora do servidor, nada preenchido.', s,
    'Fonte: FLUXO_MESTRE.md seção 2 (N01 a N22), cap. 1 (medições de itens/h) e cap. 6 §1.1 (vercel.json, 19 entradas no desenho; hoje 21, ver página 11). Disparos/h calculados da expressão cron.');
}

// =====================================================================
// PAGINA 3 - piramide
// =====================================================================
{
  let s = '';
  const cx = 262, topY = 6, tierH = 108, gapY = 4;
  const half0 = 12, slope = 0.44; // meia-largura por altura
  const tiers = [
    { n: 'DONO', sub: 'Renato', fill: C.gold, tc: C.bg,
      dec: 'Decide negócio, risco, fonte de dado, gasto novo, o que o público vê como verdade e qualquer exceção às regras inegociáveis.',
      lim: 'Nunca há autorização implícita.' },
    { n: 'CONSELHO GEEK', sub: 'consultivo', fill: '#9C8230', tc: C.bg,
      dec: 'Pareceres independentes, ata, divergência registrada. Presidente geek-lead; mesa fixa de 4 membros.',
      lim: 'VETO técnico só em: dado fake, duplicata de produto ou imagem, scraping, operação destrutiva sem autorização, segredo exposto. Bloqueia até o dono decidir.' },
    { n: 'AGENTES', sub: 'por equipe', fill: '#5D4F26', tc: C.tx,
      dec: 'Executam dentro da decisão registrada. Cada agente commita só os próprios arquivos.',
      lim: 'Antes de concluir passam pelo qa-verificador.' },
    { n: 'AUTOMAÇÕES', sub: 'crons, laços, vigia', fill: '#332D1F', tc: C.tx,
      dec: 'Obedecem às regras e sinalizam exceção para cima.',
      lim: 'Nunca decidem regra.' },
  ];
  tiers.forEach((t, i) => {
    const y0 = topY + i * (tierH + gapY), y1 = y0 + tierH;
    const w0 = half0 + slope * (y0 - topY), w1 = half0 + slope * (y1 - topY);
    s += `<polygon points="${cx - w0},${y0} ${cx + w0},${y0} ${cx + w1},${y1} ${cx - w1},${y1}" fill="${t.fill}" stroke="${C.bg}" stroke-width="1"/>`;
    const ty = y0 + tierH / 2;
    s += T(cx, ty - 2, t.n, { fs: i === 0 ? 14 : 15, bold: true, fill: t.tc, anchor: 'middle' });
    s += T(cx, ty + 16, t.sub, { fs: 11, fill: t.tc, anchor: 'middle' });
    // cartao a direita
    const cx0 = 506, cwid = 592;
    s += line(cx + w1 - 6, ty, cx0, ty, { stroke: C.dim, dash: '2 3' });
    s += R(cx0, y0 + 2, cwid, tierH - 4, { fill: C.sf, stroke: C.ln });
    s += R(cx0, y0 + 2, 4, tierH - 4, { fill: t.fill });
    const p1 = P(cx0 + 16, y0 + 10, t.dec, cwid - 30, { fs: 12 });
    s += p1.svg;
    s += P(cx0 + 16, y0 + 12 + p1.h + 4, t.lim, cwid - 30, { fs: 12, bold: true, fill: i === 1 ? C.rd : C.gold }).svg;
  });
  // setas laterais
  s += arrow([[40, 20], [40, 430]], { stroke: C.t2, sw: 2, head: 8 });
  s += T(60, 230, 'regra e prioridade descem', { fs: 11, fill: C.t2, rot: -90 });
  s += arrow([[480, 430], [480, 20]], { stroke: C.or, sw: 2, head: 8, dash: '5 3' });
  s += T(496, 420, 'exceção e alarme sobem', { fs: 11, fill: C.or, rot: -90 });
  // ladder de escalonamento
  const ly = 462;
  s += T(M, ly + 12, 'ESCALONAMENTO · quando a automação pede ajuda para cima', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const steps = [
    ['N0', 'job parcial ou erro isolado', 'o próximo ciclo repete', 'automático', 66],
    ['N1', '3 falhas seguidas, 429 do ML ≥ 2% na hora, ou conexões > 80% de 60', 'degradar pela escada; infra-sre registra', '15 min', 94],
    ['N2', 'transação presa > 120 s, group-messages ≥ 45 s por 3 execuções, ou envio parado', 'pausar frentes 4 a 6; incidente na ata', '30 min', 122],
    ['N3', 'dado público possivelmente errado, segredo exposto, perda de dado, vercel.json quebrado', 'reverter, avisar o dono, incidente com lição', 'imediato', 150],
  ];
  const sw = 262, sg = 8;
  steps.forEach(([id, gat, acao, prazo, h], i) => {
    const x = M + i * (sw + sg), y = H - 24 - h;
    const col = [C.t2, C.gold, C.or, C.rd][i];
    s += R(x, y, sw, h, { fill: C.el, stroke: col, sw: 1.5 });
    s += R(x, y, sw, 4, { fill: col });
    s += T(x + 10, y + 24, id, { fs: 16, bold: true, fill: col });
    s += T(x + sw - 10, y + 22, prazo, { fs: 12, bold: true, anchor: 'end', fill: col });
    const g = P(x + 10, y + 32, gat, sw - 20, { fs: 11 });
    s += g.svg;
    const a = P(x + 10, y + 32 + g.h + 3, acao, sw - 20, { fs: 11, fill: C.t2 });
    s += a.svg;
    if (32 + g.h + 3 + a.h > h) warns.push('degrau estoura: ' + id);
  });
  page(3, 'Quem decide, quem veta, quem executa', 'Dono > Conselho Geek > agentes > automações. A autoridade desce; a exceção sobe.', s,
    'Fonte: FLUXO_MESTRE.md seções 4.1 a 4.3. O Conselho é consultivo: decisão de negócio é sempre do dono.');
}

// =====================================================================
// PAGINA 4 - precedencia
// =====================================================================
{
  let s = '';
  const pri = [
    [1, 'Envio de mensagens e confirmação de preço de oferta com gatilho', 'NUNCA ATRASA'],
    [2, 'Cupons: leitura na fonte e validade', 'NUNCA ATRASA'],
    [3, 'Refresh de ofertas já vistas', 'mantém o preço real'],
    [4, 'Descoberta e semeadura', 'espera folga de cota'],
    [5, 'Médias e estado diário, inventário, snapshots', 'recalcula depois'],
    [6, 'Relatórios, coberturas amplas, classificação em massa', 'pode atrasar horas'],
  ];
  const shades = ['#F0CC55', '#D4AF37', '#B09029', '#8A7120', '#6B5A27', '#4F4220'];
  s += T(M, 14, 'PRIORIDADE ENTRE FRENTES · ordem, não medida', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  pri.forEach(([n, nome, nota], i) => {
    const y = 26 + i * 40; const bw = 1074 - i * 70;
    s += R(M, y, bw, 34, { fill: shades[i] });
    s += R(M, y, 40, 34, { fill: C.bg, stroke: shades[i] });
    s += T(M + 20, y + 24, String(n), { fs: 20, bold: true, anchor: 'middle', fill: '#F0CC55' });
    s += T(M + 54, y + 22, nome, { fs: 13, bold: true, fill: i < 4 ? C.bg : C.tx });
    s += T(M + bw - 10, y + 22, nota, { fs: 11, bold: true, anchor: 'end', fill: i < 4 ? C.bg : C.tx });
  });
  s += T(M, 280, 'QUANDO O RECURSO É DISPUTADO · quem vence primeiro, da esquerda para a direita', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const rec = [
    ['Banco', '60 conexões', ['envio (group-messages)', 'leituras do front', 'coletores', 'derivação: daily, stats, vitrine', 'fila de classificação e scripts']],
    ['Cota ML', 'um Client ID', ['reconferência do envio', 'collect-prices e verticais', 'semear (metade da hora)', 'discover', 'fila-api-oficial, 1.200/24 h']],
    ['Aba Amazon', 'logada, do dono', ['refresh quente (gatilho em 6 h)', 'refresh por antiguidade', 'cupom Amazon', 'discover (mínimo 60/ciclo)', 'vitrine (opt-in, 60 buscas)']],
    ['60 s do envio', 'maxDuration', ['autorização e expiração', 'envio (até 38 s)', 'rechecks (até 20)', 'guardião de cupons (12 s)']],
    ['main', 'repositório', ['correção de produção (revert)', 'mudança com ata e QA', 'documentação e métodos']],
  ];
  const rh = 64;
  rec.forEach(([nome, sub, chips], r) => {
    const y = 296 + r * (rh + 4);
    s += R(M, y, 130, rh, { fill: C.el, stroke: C.gold });
    s += T(M + 10, y + 30, nome, { fs: 14, bold: true, fill: C.gold });
    s += T(M + 10, y + 50, sub, { fs: 11, fill: C.t2 });
    chips.forEach((c, k) => {
      const x = M + 138 + k * 187;
      s += R(x, y, 181, rh, { fill: C.sf, stroke: shades[Math.min(k, 5)] , sw: 1.5 });
      s += R(x, y, 30, rh, { fill: shades[k] });
      s += T(x + 15, y + 39, String(k + 1), { fs: 18, bold: true, anchor: 'middle', fill: k < 4 ? C.bg : C.tx });
      const pp = P(x + 38, y + 8, c, 138, { fs: 12 });
      s += pp.svg;
      if (pp.n > 4) warns.push('chip longo: ' + c);
      if (k < chips.length - 1) s += arrow([[x + 181, y + rh / 2], [x + 187 + 1, y + rh / 2]], { stroke: C.gold, head: 4 });
    });
  });
  s += T(M, 658, 'Regra geral: mensagens primeiro; cupom perecível depois; refresh do que já se vê antes de descobrir; derivado por último. Disputa se resolve atrasando, nunca preenchendo dado.', { fs: 11, fill: C.t2 });
  page(4, 'Quando dois processos disputam o mesmo recurso', 'Cinco recursos, uma ordem em cada. Quem tem o número menor passa na frente.', s,
    'Fonte: FLUXO_MESTRE.md seções 4.4 e 5. Dúvida aberta: se os laços de cupom e de coleta da Amazon usam a mesma aba é NÃO VERIFICADO (FM-18).');
}

// =====================================================================
// PAGINA 5 - gantt 60 min
// =====================================================================
{
  let s = '';
  const ev = (a, b, st) => { const r = []; for (let m = a; m < 60; m += st) if (m >= b) r.push(m); return r; };
  const all = Array.from({ length: 60 }, (_, i) => i);
  const jobs = [
    ['group-messages', all, 60, C.msg, true],
    ['collect-prices', ev(0, 0, 5), 200, L.ext], ['collect-shopee', ev(0, 0, 5), 300, L.ext],
    ['refresh stats (legado)', [0, 30], 300, L.pre], ['collector-health', [0, 30], 60, C.t2],
    ['vitrine pronta', [4, 19, 34, 49], 300, L.pre], ['média diária', [9, 39], 300, L.pre], ['inventário', [41], 300, L.fro],
    ['discover', [17], 120, L.ext], ['vert. tecnologia', [1, 16, 31, 46], 300, L.ext], ['vert. eletrodomésticos', [3, 18, 33, 48], 300, L.ext],
    ['vert. eletroeletrônicos', [6, 21, 36, 51], 300, L.ext], ['vert. esporte', [8, 23, 38, 53], 300, L.ext], ['vert. livros', [11, 26, 41, 56], 300, L.ext],
    ['vert. impressão 3D', [13, 28, 43, 58], 300, L.ext], ['semear', [7, 27, 47], 60, L.ext], ['fila-classificação', [13, 43], 60, L.cat],
    ['fila-api-oficial', [8, 28, 48], 60, L.ext], ['notify-price-drops (11:00 UTC)', [0], 60, L.msg],
  ];
  const lx0 = 24, labW = 178, px0 = lx0 + labW, cwm = (1098 - px0) / 60, rowH = 21, y0 = 30;
  // faixas de colisao
  const colis = [[0, C.rd], [30, C.rd], [8, C.or], [28, C.or], [48, C.or], [13, C.or], [43, C.or], [41, C.gold]];
  colis.forEach(([m, col]) => { s += R(px0 + m * cwm, y0 - 4, cwm, jobs.length * rowH + 8, { fill: col, op: 0.2 }); });
  // eixo
  for (let m = 0; m < 60; m++) {
    const x = px0 + m * cwm;
    s += line(x, y0 - 4, x, y0 + jobs.length * rowH + 4, { stroke: m % 5 === 0 ? '#2C261F' : '#1B1713' });
    if (m % 5 === 0) s += T(x + 1, y0 - 10, String(m), { fs: 11, fill: C.t2, bold: true });
  }
  T(0, 0, '');
  const cnt = new Array(60).fill(0);
  jobs.forEach(([nome, mins, dur, col, isG], r) => {
    const y = y0 + r * rowH;
    if (r % 2 === 0) s += R(lx0, y, labW, rowH, { fill: C.sf });
    s += T(lx0 + 6, y + 15, nome, { fs: 11, fill: isG ? C.msg : C.tx, bold: !!isG });
    mins.forEach((m) => {
      const wmin = Math.min(dur / 60, 60 - m);
      s += R(px0 + m * cwm, y + 3, wmin * cwm - 1, rowH - 6, { fill: col, op: isG ? 0.28 : 0.28 });
      s += R(px0 + m * cwm, y + 3, cwm - 1, rowH - 6, { fill: col });
      if (!isG && !nome.startsWith('notify')) cnt[m]++;
    });
  });
  // histograma
  const hy = y0 + jobs.length * rowH + 22;
  s += P(lx0, hy - 2, 'Jobs que disparam no mesmo minuto (sem group-messages e sem notify)', 140, { fs: 11, bold: true, fill: C.gold }).svg;
  const base = hy + 74, unit = 13;
  s += line(px0, base, px0 + 60 * cwm, base, { stroke: C.dim });
  cnt.forEach((v, m) => {
    if (!v) return;
    const col = v >= 4 ? C.rd : v === 3 ? C.or : v === 2 ? C.gold : '#6B5A27';
    s += R(px0 + m * cwm + 1, base - v * unit, cwm - 2, v * unit, { fill: col });
    if (v >= 3) s += T(px0 + m * cwm + cwm / 2, base - v * unit - 3, String(v), { fs: 11, bold: true, anchor: 'middle', fill: col });
  });
  [1, 2, 3, 4].forEach((v) => { s += T(px0 - 6, base - v * unit + 4, String(v), { fs: 11, fill: C.t2, anchor: 'end' }); });
  // callouts
  const cy = base + 24;
  const co = [
    ['C1 · minutos 0 e 30', '4 jobs pesados juntos: collect-prices, collect-shopee, stats e health. Pior minuto do relógio.', C.rd],
    ['C2 · 8, 28, 48', 'vertical (esporte, impressão 3D, eletrodomésticos) + fila-api-oficial: disputam banco e cota ML.', C.or],
    ['C3 · 13 e 43', 'vertical impressão 3D + fila-classificação.', C.or],
    ['C4 · 41', 'vertical livros + inventário (varredura ampla).', C.gold],
    ['C5/C7', 'às 11:00 UTC o notify entra no minuto 0. Stats (até 300 s) ainda roda quando a vitrine entra em 4 e 34.', C.t2],
  ];
  let cx = M; const widths = [270, 270, 150, 150, 224];
  co.forEach(([a, b, col], i) => {
    const w = widths[i];
    s += R(cx, cy, w, 96, { fill: C.sf, stroke: col, sw: 1.5 });
    s += T(cx + 8, cy + 18, a, { fs: 12, bold: true, fill: col });
    const pp = P(cx + 8, cy + 26, b, w - 16, { fs: 11, fill: C.tx });
    s += pp.svg; if (26 + pp.h > 96) warns.push('callout estoura ' + a);
    cx += w + 6;
  });
  s += T(M, 678, 'faixa clara atrás de cada marca = duração máxima do job (maxDuration). Vermelho 4+, laranja 3, dourado 2 jobs. Cada */5 de collect-prices e collect-shopee é esperado; a colisão é com os outros.', { fs: 11, fill: C.t2 });
  page(5, 'Os 60 minutos dos crons', 'Cada quadrado é um disparo. Onde o histograma sobe, os jobs se atropelam.', s,
    'Fonte: cap. 6 §1.1 a §1.3 (vercel.json, 19 entradas no desenho; hoje 21, com cobertura-shopee nos minutos 22 e 52 e aprovacao-auto em 12-52/10, ver página 11). Proposta de reescalonamento (FM-04) aguarda o dono; não aplicada. Disparos extras de collect-prices (24/h medido) NÃO VERIFICADOS (FM-05).');
}

// =====================================================================
// PAGINA 6 - maquina de estados da mensagem
// =====================================================================
{
  let s = '';
  const bx = (x, y, w, h, t, sub, col, o = {}) => {
    let r = R(x, y, w, h, { fill: o.fill || C.el, stroke: col, sw: 1.8 }) + R(x, y, 5, h, { fill: col });
    r += T(x + 14, y + 20, t, { fs: 13, bold: true, fill: o.tc || C.tx });
    if (sub) { const pp = P(x + 14, y + 25, sub, w - 22, { fs: 11, fill: C.t2 }); r += pp.svg; if (25 + pp.h > h) warns.push('estado estoura ' + t); }
    return r;
  };
  const gold = C.gold, teal = C.msg;
  // nos
  s += bx(24, 190, 150, 74, 'candidata', 'só existe dentro da execução (60 s)', C.t2);
  s += bx(250, 20, 190, 58, 'proposta_auto', 'espera até 6 h (radar: 20 min)', teal);
  s += bx(250, 150, 190, 58, 'proposta', 'exige o clique do dono; até 6 h', gold);
  s += bx(250, 280, 190, 58, 'retida', 'queda > 45% ou fora de 0,35x a 3x; até 24 h', C.or);
  s += bx(500, 215, 150, 58, 'aprovada', 'admin aprovou; até 12 h', gold);
  s += bx(712, 90, 160, 70, 'enviando', 'reivindicação atômica; preso > 10 min vira erro', teal);
  s += bx(930, 20, 168, 58, 'enviada', 'message_id gravado', C.gr);
  s += bx(930, 96, 168, 56, 'recheck', '+30 min; só registra, não apaga', C.gr);
  s += bx(930, 200, 168, 58, 'expirada', 'motivo gravado em error', C.dim);
  s += bx(930, 310, 168, 58, 'erro', '401, 403, chat inexistente, 3ª falha', C.rd);
  // setas
  s += arrow([[174, 215], [212, 215], [212, 49], [250, 49]], { stroke: teal });
  s += arrow([[174, 227], [250, 179]], { stroke: gold }) + tag(190, 222, 'humano', { fill: gold });
  s += arrow([[174, 245], [212, 245], [212, 309], [250, 309]], { stroke: C.or });
  s += tag(180, 41, 'auto', { fill: teal }) ;
  s += tag(176, 290, 'held', { fill: C.or });
  s += arrow([[440, 179], [478, 179], [478, 237], [500, 237]], { stroke: gold }) + arrow([[440, 309], [478, 309], [478, 253], [500, 253]], { stroke: gold });
  s += tag(500, 292, 'admin aprova', { fill: gold });
  s += arrow([[650, 244], [690, 244], [690, 135], [712, 135]], { stroke: teal });
  s += arrow([[440, 38], [690, 38], [690, 105], [712, 105]], { stroke: teal });
  s += tag(520, 33, 'cron reivindica', { fill: teal });
  s += arrow([[872, 110], [900, 110], [900, 49], [930, 49]], { stroke: C.gr }) + tag(842, 70, 'revalida ok', { fill: C.gr });
  s += arrow([[872, 125], [930, 125]], { stroke: C.gr, dash: '3 2' });
  s += arrow([[872, 140], [900, 140], [900, 229], [930, 229]], { stroke: C.t2 }) + tag(812, 176, 'não vale / sem grupo', { fill: C.t2 });
  s += arrow([[790, 160], [790, 339], [930, 339]], { stroke: C.rd }) + tag(798, 331, 'falha definitiva', { fill: C.rd });
  s += arrow([[712, 150], [680, 150], [680, 80], [440, 80]], { stroke: C.t2, dash: '4 3' }) + tag(470, 105, 'limite adia, 5xx ou rede: volta', { fill: C.t2 });
  s += arrow([[345, 78], [345, 150]], { stroke: C.dim, dash: '3 3' });
  // relogios de expiracao
  s += T(250, 372, 'EXPIRA: proposta_auto e proposta 6 h · aprovada 12 h · retida 24 h → expirada', { fs: 12, bold: true, fill: C.t2 });
  // barra 24 h
  const by = 410; const tot = 2322;
  const seg = [
    ['enviadas', 1184, C.gr], ['expiradas', 587, C.dim], ['na fila', 416, teal], ['esperam clique', 77, gold], ['retidas', 48, C.or], ['erro', 10, C.rd],
  ];
  s += T(M, by - 8, 'ÚLTIMAS 24 H · 2.322 linhas de Telegram (medido 2026-11-12)', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  let x = M; const bwTot = 1074;
  seg.forEach(([n, v, col], i) => {
    const w = bwTot * v / tot;
    s += R(x, by, w, 34, { fill: col });
    if (w > 70) s += T(x + 8, by + 22, v.toLocaleString('pt-BR'), { fs: 14, bold: true, fill: C.bg });
    x += w;
  });
  // legenda embaixo da barra
  const lg = [['enviadas', '1.184 (51%)', C.gr], ['expiradas', '587 (25%)', C.dim], ['na fila', '416', teal], ['esperam clique', '77', gold], ['retidas', '48', C.or], ['erro', '10', C.rd]];
  lg.forEach(([n, v, col], i) => {
    const lx = M + i * 180;
    s += R(lx, by + 46, 12, 12, { fill: col });
    s += T(lx + 18, by + 57, n + ' ' + v, { fs: 12, fill: C.tx });
  });
  // tres perdas
  const pr = [
    ['359', 'expiraram por "já não vale" na reconferência', '61% de todas as expirações', C.t2],
    ['202', '"expirada sem envio": ninguém deu o clique', 'dono é o gargalo', C.gold],
    ['313', 'Achado na fila; espera mediana de 2,2 h', 'contra 28 min do G2', C.teal || teal],
    ['10', 'ficaram "enviando" até virar erro sem message_id', 'possível perda; limite 60 s estourado', C.rd],
  ];
  pr.forEach(([n, a, b, col], i) => {
    const px = M + i * 270, py = 500;
    s += R(px, py, 258, 128, { fill: C.sf, stroke: col, sw: 1.5 });
    s += T(px + 12, py + 46, n, { fs: 38, bold: true, fill: col });
    const p1 = P(px + 12, py + 58, a, 234, { fs: 12 });
    s += p1.svg;
    s += P(px + 12, py + 62 + p1.h + 2, b, 234, { fs: 11, fill: C.t2 }).svg;
  });
  s += T(M, 676, 'Nunca se afrouxa o frescor para enviar mais (R-22). Enviada nunca é apagada pelo recheck (R-29).', { fs: 11, fill: C.t2 });
  page(6, 'A vida de uma mensagem do Telegram', 'Da candidata ao canal: onde ela espera, onde expira, onde se perde.', s,
    'Fonte: cap. 4 §1.1, §1.2 e §6 (MEDIDO, 24 h até 2026-11-12). Cartão e régua de 10% estão nas regras R-23 a R-29 (página 10).');
}

// =====================================================================
// PAGINA 7 - ciclo de vida do produto
// =====================================================================
{
  let s = '';
  const st = [
    ['1', 'Oferta bruta', 'cotação lida na API ou na aba', L.ext, 'N01 a N13'],
    ['2', 'Porteiro e dedup', 'só original, novo, em linha; checa duplicata', L.cat, 'N14'],
    ['3', 'Master', 'nasce em revisão se houver dúvida', L.cat, 'N15'],
    ['4', 'Aprovação', 'dono ou rodada em bloco com backup', L.gold || C.gold, 'N16 · N17'],
    ['5', 'Ativo', 'entra em média, selo, menor preço e vitrine', C.gr, 'N19'],
  ];
  const cwid = 214, step = 215;
  st.forEach(([n, a, b, col, id], i) => {
    const x = M + i * step; const y = 0, h = 112;
    const pts = i === 0 ? `${x},${y} ${x + cwid - 18},${y} ${x + cwid},${y + h / 2} ${x + cwid - 18},${y + h} ${x},${y + h}` : `${x},${y} ${x + cwid - 18},${y} ${x + cwid},${y + h / 2} ${x + cwid - 18},${y + h} ${x},${y + h} ${x + 18},${y + h / 2}`;
    s += `<polygon points="${pts}" fill="${C.el}" stroke="${col}" stroke-width="2"/>`;
    s += T(x + (i ? 30 : 12), y + 26, n + ' · ' + a, { fs: 13, bold: true, fill: col });
    const pp = P(x + (i ? 30 : 12), y + 34, b, cwid - 62, { fs: 11, fill: C.tx }); s += pp.svg;
    s += T(x + (i ? 30 : 12), y + 100, id, { fs: 11, fill: C.t2 });
  });
  // masters
  s += T(M, 144, 'VEREDITO DO MASTER · mesma escala nas duas barras (máx. 6.609)', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const sc = 760 / 6609; const my = 156;
  const bars = [
    ['Games', [['aprovado', 4259, C.gr], ['em revisão', 504, C.gold], ['rejeitado', 1574, C.rd], ['fundido', 272, C.dim]], 'aprovado por omissão: sem marca persistida'],
    ['Plus (6 lojas)', [['aprovado', 1199, C.gr], ['em revisão', 132, C.gold], ['rejeitado', 1, C.rd]], 'sem média pública até 27/11'],
  ];
  bars.forEach(([nome, segs, nota], r) => {
    const y = my + r * 62; let x = M + 120;
    s += T(M, y + 22, nome, { fs: 13, bold: true });
    segs.forEach(([n, v, col]) => {
      const w = Math.max(v * sc, 2);
      s += R(x, y, w, 30, { fill: col });
      if (w > 60) s += T(x + 6, y + 20, v.toLocaleString('pt-BR'), { fs: 12, bold: true, fill: C.bg });
      x += w;
    });
    let lx = M + 120; segs.forEach(([n, v, col]) => { s += R(lx, y + 38, 10, 10, { fill: col }); s += T(lx + 14, y + 47, n + ' ' + v.toLocaleString('pt-BR'), { fs: 11, fill: C.t2 }); lx += 14 + (n.length + 6) * 6.6 + 14; });
    
  });
  s += T(M + 120, 289, 'Games: aprovado por omissão (sem marca persistida). Plus: sem média pública até 27/11. A marca "manual" do porteiro está vazia nos 7.941 masters: nenhum override humano.', { fs: 11, fill: C.t2 });
  // estados da oferta
  s += T(M, 318, 'ESTADO DA OFERTA · quem entra na média é só "ativa" de master aprovado, sem quarentena', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const off = {
    active: [330, 350, 190, 66, 'ativa', '20.107 (ML 17.156, Shopee 2.270, Amazon 681)', C.gr],
    draft: [24, 350, 190, 66, 'rascunho', '182 (Amazon 154, Shopee 18, ML 10)', C.gold],
    expired: [660, 350, 190, 66, 'expirada', '8.650 (ML 6.679, Shopee 1.971)', C.dim],
    paused: [330, 470, 190, 66, 'pausada', '1.466 (games 1.464)', C.t2],
    archived: [660, 470, 190, 66, 'arquivada', '41 (Amazon 39, ML 2)', C.dim],
  };
  Object.values(off).forEach(([x, y, w, h, t, sub, col]) => {
    s += R(x, y, w, h, { fill: C.el, stroke: col, sw: 1.8 }) + R(x, y, 5, h, { fill: col });
    s += T(x + 14, y + 22, t, { fs: 14, bold: true, fill: col });
    s += P(x + 14, y + 28, sub, w - 22, { fs: 11, fill: C.t2 }).svg;
  });
  s += arrow([[214, 375], [330, 375]], { stroke: C.gold }) + tag(236, 368, 'dono diz sim', { fill: C.gold });
  s += arrow([[330, 395], [214, 395]], { stroke: C.t2, dash: '4 3' }) + tag(232, 410, 'vira dúvida', { fill: C.t2 });
  s += arrow([[520, 375], [660, 375]], { stroke: C.dim }) + tag(536, 368, '3 faltas', { fill: C.t2 });
  s += arrow([[660, 395], [520, 395]], { stroke: C.gr, dash: '4 3' }) + tag(540, 410, 'vendedor volta', { fill: C.gr });
  s += arrow([[425, 416], [425, 470]], { stroke: C.t2 }) + tag(431, 448, 'script/admin', { fill: C.t2 });
  s += arrow([[520, 503], [660, 503]], { stroke: C.dim }) + tag(560, 496, 'admin', { fill: C.t2 });
  s += R(24, 470, 190, 66, { fill: C.sf, stroke: C.or, dash: '4 3', sw: 1.5 });
  s += T(38, 492, 'quarentena', { fs: 14, bold: true, fill: C.or }) + T(38, 512, '488; some de toda leitura', { fs: 11, fill: C.t2 });
  s += R(24, 544, 190, 56, { fill: C.sf, stroke: C.or, dash: '4 3', sw: 1.5 });
  s += T(38, 566, 'fora da média', { fs: 14, bold: true, fill: C.or }) + T(38, 586, '20; visível, mas sem selo', { fs: 11, fill: C.t2 });
  // fila de classificacao
  const qx = 880;
  s += R(qx, 318, 218, 332, { fill: C.sf, stroke: L.cat, sw: 1.5 });
  s += T(qx + 12, 342, 'FILA DO DONO · Q12', { fs: 12, bold: true, fill: L.cat, ls: 1 });
  s += T(qx + 12, 396, '999', { fs: 46, bold: true, fill: L.cat });
  s += T(qx + 12, 416, 'itens pendentes', { fs: 12 });
  s += R(qx + 12, 428, 194, 12, { fill: C.el }) + R(qx + 12, 428, 194 * 418 / 999, 12, { fill: L.cat });
  s += T(qx + 12, 458, 'games 418 de 999', { fs: 11, fill: C.t2 });
  s += T(qx + 12, 500, '0', { fs: 46, bold: true, fill: C.rd });
  s += T(qx + 12, 520, 'decisões humanas até hoje', { fs: 12 });
  s += P(qx + 12, 536, '"Não sei" adia 7 dias. Sem prazo formal de esvaziamento (FM-25). Dúvida fica fora da média até a decisão.', 194, { fs: 11, fill: C.t2 }).svg;
  s += T(qx + 12, 640, 'Meta de esvaziamento: sem dado', { fs: 11, fill: C.gold, bold: true });
  s += T(24, 626, 'Reputação baixa do vendedor (vermelho/laranja): 612 ofertas ativas, 512 contam em master aprovado; decisão do dono pendente (FM-08).', { fs: 11, fill: C.t2 });
  page(7, 'Do dado bruto ao produto que vale', 'Nada entra na média por omissão: precisa passar pelo porteiro e, na dúvida, pelo dono.', s,
    'Fonte: cap. 2 §1.3, §1.4 e §2; FLUXO_MESTRE.md seção 3 (Q12, Q13, S01 e S03). MEDIDO em 2026-11-12.');
}

// =====================================================================
// PAGINA 8 - SLOs
// =====================================================================
{
  let s = '';
  const card = (i, titulo, meta, o) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * 362, y = row * 196, w = 350, h = 184;
    let r = R(x, y, w, h, { fill: C.sf, stroke: C.ln });
    r += T(x + 12, y + 22, titulo, { fs: 13, bold: true });
    r += T(x + 12, y + 40, 'meta: ' + meta, { fs: 11, fill: C.gold, bold: true });
    // medidor
    const mx = x + 12, my = y + 76, mw = w - 24;
    if (o.sem) {
      r += R(mx, my, mw, 16, { fill: C.el, stroke: C.dim, dash: '4 3' });
      r += T(mx + mw / 2, my + 12, o.sem, { fs: 11, anchor: 'middle', fill: C.t2, bold: true });
    } else {
      // zonas
      o.zonas.forEach(([a, b, col]) => { r += R(mx + mw * a / o.max, my, mw * (b - a) / o.max, 16, { fill: col, op: 0.4 }); });
      r += R(mx, my, mw, 16, { stroke: C.ln });
      const tx = mx + mw * o.meta / o.max; r += line(tx, my - 8, tx, my + 24, { stroke: C.gold, sw: 2 });
      r += T(tx, my - 12, o.metaLbl, { fs: 11, fill: C.gold, anchor: tx < mx + 30 ? 'start' : 'middle', bold: true });
      const vx = mx + mw * o.val / o.max; r += `<polygon points="${vx},${my + 16} ${vx - 6},${my + 28} ${vx + 6},${my + 28}" fill="${o.vcol}"/>`;
      r += T(Math.min(vx, mx + mw - 4), my + 46, o.valLbl, { fs: 12, bold: true, fill: o.vcol, anchor: vx > mx + mw - 90 ? 'end' : vx < mx + 90 ? 'start' : 'middle' });
      o.ticks.forEach(([v, lbl]) => { r += T(mx + mw * v / o.max, my + 46, lbl, { fs: 11, fill: C.t2, anchor: v === 0 ? 'start' : v === o.max ? 'end' : 'middle' }); });
    }
    const pp = P(x + 12, y + (o.sem ? 124 : 132), o.nota, w - 24, { fs: 11, fill: C.t2 }); r += pp.svg;
    if ((o.sem ? 124 : 132) + pp.h > h) warns.push('slo estoura ' + titulo);
    return r;
  };
  s += card(0, 'Duração do group-messages (p95)', 'p95 abaixo de 45 s', {
    max: 100, meta: 45, metaLbl: '45 s', val: 98, vcol: C.rd, valLbl: 'pior: 98 s', ticks: [[0, '0 s'], [60, 'limite 60 s']],
    zonas: [[0, 45, C.gr], [45, 55, C.gold], [55, 100, C.rd]], nota: 'p95 em si: sem dado. Medido em 24 h: 14 de 1.393 execuções acima de 55 s (1,0%) e 1 de 98 s.',
  });
  s += card(1, 'Transação presa', 'zero acima de 120 s', { sem: 'sem dado', nota: 'Sem contagem atual nos documentos. Sem trava no servidor: idle_in_transaction_session_timeout está em 0 (FM-07). O vigia roda na sessão do operador.' });
  s += card(2, '429 do Mercado Livre', 'abaixo de 2% das chamadas', { sem: 'sem dado', nota: 'A contagem de cota subestima o consumo: só soma collect-vertical e semear (FM-19).' });
  s += card(3, 'Mensagem com gatilho perdida por atraso', 'zero em 24 h', {
    max: 12, meta: 0, metaLbl: '0', val: 10, vcol: C.rd, valLbl: '10 possíveis', ticks: [[0, '0 (meta)']],
    zonas: [[0, 0.4, C.gr], [0.4, 12, C.rd]], nota: '10 linhas ficaram "enviando" e viraram erro sem message_id (24 h). Não dá para saber se o Telegram entregou.',
  });
  s += card(4, 'Frescor da Amazon no envio', 'preço confirmado em até 40 min', {
    max: 100, meta: 90, metaLbl: 'meta fila #26: 90%', val: 43, vcol: C.rd, valLbl: '43%', ticks: [[0, '0%'], [100, '100%']],
    zonas: [[0, 50, C.rd], [50, 90, C.gold], [90, 100, C.gr]], nota: '43% das 682 ofertas ativas confirmadas em 40 min; 112 com mais de 3 h; ciclo de ~50 min.',
  });
  s += card(5, 'Disponibilidade do site', 'sem meta medida', { sem: 'NÃO VERIFICADO', nota: 'Não há sonda externa do site nem dos crons (FM-44). Janela prevista: 30 dias.' });
  // linhas extras
  s += T(M, 404, 'OUTROS INDICADORES MEDIDOS HOJE', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const ex = [
    ['Linhas de Telegram enviadas (24 h)', 51, null, '1.184 de 2.322', C.msg],
    ['Produtos com média publicada', 34, null, '1.108 de 3.227 (regra: mínimo 3 ofertas)', L.pre],
    ['Cartão na mensagem G2', 98, 100, 'meta: cartão obrigatório (R-25)', C.gr],
    ['Cartão na mensagem Cupom', 22, 100, 'FM-17', C.rd],
    ['Cartão na mensagem Achado', 10, 100, 'FM-17', C.rd],
    ['Execuções da Shopee que esgotaram o orçamento', 98.6, null, '283 de 287 (FM-12)', C.rd],
  ];
  ex.forEach(([n, v, meta, nota, col], i) => {
    const y = 420 + i * 40, x0 = M + 330, bw = 460;
    s += T(M, y + 14, n, { fs: 12 });
    s += R(x0, y, bw, 18, { fill: C.el });
    s += R(x0, y, bw * v / 100, 18, { fill: col });
    if (meta) s += line(x0 + bw * meta / 100, y - 4, x0 + bw * meta / 100, y + 22, { stroke: C.gold, sw: 2 });
    s += T(x0 + bw + 12, y + 14, String(v).replace('.', ',') + '%', { fs: 13, bold: true, fill: col });
    s += T(x0 + bw + 70, y + 14, nota, { fs: 11, fill: C.t2 });
  });
  s += T(M, 676, 'Medido em 2026-11-12 (~11:50 UTC). Os números envelhecem; vale o método. Nó sem fonte fica cinza, nunca verde por omissão.', { fs: 11, fill: C.t2 });
  page(8, 'Saúde ao vivo: meta contra medido', 'Seis metas. Duas têm dado, duas têm dado parcial, duas estão sem dado. Isso também é um achado.', s,
    'Fonte: FLUXO_MESTRE.md seção 12 (SLOs) e cap. 4 §6/§7. Painel vivo previsto em /admin/fluxo. Percentual de 1,0% = 14/1.393 calculado dos dois números do cap. 4.');
}

// =====================================================================
// PAGINA 9 - mapa de calor
// =====================================================================
{
  let s = '';
  const SV = {
    A: { c: '#B3312E', t: C.tx, n: 'Alta' }, M: { c: '#C98A1B', t: C.bg, n: 'Média' }, B: { c: '#4F5E4B', t: C.tx, n: 'Baixa' }, X: { c: '#201C18', t: C.t2, n: 'sem ponta' }, V: { c: '#201C18', t: C.t2, n: 'NÃO VERIFICADO' },
  };
  const grupos = [
    ['EXTRAÇÃO', L.ext, [
      ['N01', 'collect-prices', 'A', '#17 #20'], ['N02', 'collect-shopee', 'A', '#20'], ['N03', 'verticais ×6', 'A', '#18 #20'], ['N04', 'semear', 'M', '#27'], ['N05', 'discover', 'A', '#17'], ['N06', 'webhook ML', 'V', '#27'],
      ['N07', 'fila-api-oficial', 'A', '#18'], ['N09', 'Amazon assistida', 'M', '#26 #27'], ['N10', 'links ML', 'A', '#8'], ['N11', 'cupom ML', 'M', '#7'], ['N12', 'cupom Amz/Shp', 'A', '#7'], ['N13', 'rotas ingest', 'B', '#31'],
    ]],
    ['CATÁLOGO', L.cat, [['N08', 'fila-classif.', 'A', '#18'], ['N14', 'porteiro/dedup', 'A', '#22'], ['N15', 'identidade', 'A', '#21'], ['N16', 'fila do dono', 'M', '#11 #30'], ['N17', 'aprov. masters', 'M', '#30']]],
    ['PREÇO', L.pre, [['N18', 'gancho', 'B', '#31'], ['N19', 'média diária', 'A', '#15'], ['N20', 'stats legado', 'A', '#14'], ['N21', 'vitrine pronta', 'M', '#27']]],
    ['MENSAGENS', L.msg, [['N23', 'group-messages', 'A', '#19'], ['N24', 'agulha cupom', 'M', '#25'], ['N25', 'guardião', 'M', '#7'], ['N26', 'Telegram', 'A', '#19'], ['N27', 'WhatsApp', 'B', '#31'], ['N34', 'notify-drops', 'B', '#18']]],
    ['FRONT', L.fro, [['N22', 'inventário', 'A', '#18'], ['N28', 'páginas públicas', 'A', '#14 #23'], ['N29', 'admin', 'M', '#28'], ['N33', '/admin/fluxo', 'B', '#4 feito']]],
    ['GOVERNANÇA', C.t2, [['N30', 'collector-health', 'A', '#13'], ['N31', 'vigia 5 min', 'A', '#16'], ['N32', 'banco', 'A', '#16']]],
  ];
  const cwid = 112, chh = 56, gx = 6, gyp = 6, lab = 92;
  let row = 0; const cnt = { A: 0, M: 0, B: 0, V: 0 };
  grupos.forEach(([g, col, items]) => {
    const nrows = Math.ceil(items.length / 6);
    const y = row * (chh + gyp);
    s += R(M, y, lab - 6, nrows * (chh + gyp) - gyp, { fill: C.sf, stroke: col, sw: 1.5 });
    s += T(M + (lab - 6) / 2, y + (nrows * (chh + gyp) - gyp) / 2 + 4, g, { fs: 11, bold: true, anchor: 'middle', fill: col });
    items.forEach(([id, nm, sv, fl], k) => {
      const rr = Math.floor(k / 6), cc = k % 6;
      const x = M + lab + cc * (cwid + gx), yy = y + rr * (chh + gyp);
      const v = SV[sv]; cnt[sv] = (cnt[sv] || 0) + 1;
      s += R(x, yy, cwid, chh, { fill: v.c, stroke: sv === 'V' ? C.t2 : col, sw: sv === 'V' ? 1.5 : 1, dash: sv === 'V' ? '4 3' : '' });
      s += T(x + 7, yy + 18, id, { fs: 12, bold: true, fill: v.t });
      s += T(x + 7, yy + 34, nm, { fs: 11, fill: v.t });
      s += T(x + 7, yy + 49, fl, { fs: 11, fill: v.t, bold: true });
    });
    row += nrows;
  });
  // GOVERNANCA label: ajusta texto
  // legenda de severidade
  const ly = row * (chh + gyp) + 8;
  Object.entries(SV).forEach(([k, v], i) => {
    const x = M + i * 150;
    s += R(x, ly, 16, 14, { fill: v.c, stroke: C.ln }) + T(x + 22, ly + 12, v.n, { fs: 11, fill: C.t2 });
  });
  s += P(M, ly + 26, 'Cor = a maior ponta solta ligada ao nó (FLUXO_MESTRE seção 10). Número = tarefa na fila de execução. Mapeamento nó-ponta feito neste documento a partir das colunas "origem" e "correção".', 760, { fs: 11, fill: C.t2 }).svg;
  // painel direito
  const rx = 856, rw = 242;
  s += T(rx, 12, 'PONTAS SOLTAS · 49', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  { let x = rx; const tot = 49;
    [['Altas', 14, '#B3312E', C.tx], ['Médias', 30, '#C98A1B', C.bg], ['Baixas', 5, '#4F5E4B', C.tx]].forEach(([n, v, col, tc], i) => {
      const w = rw * v / tot;
      s += R(x, 24, w, 28, { fill: col }) + T(x + w / 2, 43, String(v), { fs: 13, bold: true, anchor: 'middle', fill: tc });
      s += T(x + (i === 0 ? 0 : i === 1 ? w / 2 : w), 72, n, { fs: 11, fill: C.t2, anchor: i === 0 ? 'start' : i === 1 ? 'middle' : 'end' });
      x += w;
    });
  }
  s += T(rx, 112, 'FILA DE EXECUÇÃO · 32 tarefas', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const stt = { pronto: C.gr, verif: C.gold, and: C.or, dono: C.rd, fila: C.el };
  const q = {
    P0: [[1, 'pronto'], [2, 'verif'], [3, 'pronto'], [4, 'pronto']],
    P1: [[5, 'and'], [6, 'and'], [13, 'fila'], [14, 'fila'], [15, 'fila'], [16, 'fila'], [17, 'fila'], [18, 'fila'], [19, 'fila'], [20, 'fila'], [21, 'dono'], [22, 'fila'], [23, 'dono'], [24, 'fila'], [32, 'fila']],
    P2: [[7, 'fila'], [8, 'and'], [9, 'fila'], [10, 'fila'], [25, 'fila'], [26, 'fila'], [27, 'fila'], [28, 'fila'], [29, 'fila'], [30, 'fila']],
    P3: [[11, 'dono'], [12, 'and'], [31, 'fila']],
  };
  let qy = 126; const cs = 28, cg2 = 3;
  Object.entries(q).forEach(([p, arr]) => {
    const nr = Math.ceil(arr.length / 7);
    s += T(rx, qy + 19, p, { fs: 12, bold: true, fill: C.t2 });
    arr.forEach(([n, st2], i) => {
      const x = rx + 30 + (i % 7) * (cs + cg2), y = qy + Math.floor(i / 7) * (cs + cg2);
      s += R(x, y, cs, cs, { fill: stt[st2], stroke: C.ln });
      s += T(x + cs / 2, y + 19, String(n), { fs: 11, bold: true, anchor: 'middle', fill: st2 === 'fila' ? C.t2 : C.bg });
    });
    qy += nr * (cs + cg2) + 8;
  });
  // legenda estados
  [['pronto', 'pronto', C.gr], ['verificação', 'verif', C.gold], ['em andamento', 'and', C.or], ['aguarda o dono', 'dono', C.rd], ['na fila', 'fila', C.el]].forEach(([n, , col], i) => {
    const y = qy + 4 + i * 18;
    s += R(rx, y, 12, 12, { fill: col, stroke: C.ln }) + T(rx + 18, y + 11, n, { fs: 11, fill: C.t2 });
  });
  const dy = qy + 4 + 5 * 18 + 8;
  s += T(rx, dy + 11, 'ORDEM DE DEPENDÊNCIA', { fs: 11, bold: true, fill: C.gold });
  [['#13', '#14'], ['#17', '#16 #18 #20'], ['#15', '#29']].forEach(([a, b], i) => {
    const y = dy + 22 + i * 24;
    s += R(rx, y, 40, 20, { fill: C.el, stroke: C.gold }) + T(rx + 20, y + 15, a, { fs: 12, bold: true, anchor: 'middle', fill: C.gold });
    s += arrow([[rx + 42, y + 10], [rx + 70, y + 10]], { stroke: C.gold, head: 5 });
    s += R(rx + 72, y, 100, 20, { fill: C.el, stroke: C.ln }) + T(rx + 78, y + 15, b, { fs: 12, bold: true });
  });
  s += T(rx, dy + 22 + 72 + 14, 'Prazo-guia P1 que o público vê: 27/11.', { fs: 11, fill: C.t2 });
  page(9, 'Onde estão as pontas soltas', 'Mapa de calor por nó, ligado ao número da tarefa na fila. Vermelho é o que mais pesa.', s,
    `Fonte: FLUXO_MESTRE.md seção 10 (FM-01 a FM-49) e docs/fila-de-execucao.md. Contagem de nós por cor neste mapa: Alta ${cnt.A}, Média ${cnt.M}, Baixa ${cnt.B}, NÃO VERIFICADO ${cnt.V}.`);
}

// =====================================================================
// PAGINA 10 - legenda e regras
// =====================================================================
{
  let s = '';
  // legenda
  s += T(M, 12, 'COMO LER', { fs: 12, bold: true, fill: C.gold, ls: 1 });
  const marks = [['MEDIDO', 'lido no banco ou no código em 12/11', C.gr], ['CÓDIGO', 'confirmado em arquivo', C.gr], ['DECISÃO', 'registrada pelo dono', C.gold], ['NÃO VERIFICADO', 'ninguém confirmou: não é fato', C.t2]];
  marks.forEach(([a, b, col], i) => {
    const x = M + i * 190;
    s += R(x, 22, 14, 14, { fill: a === 'NÃO VERIFICADO' ? 'none' : col, stroke: col, dash: a === 'NÃO VERIFICADO' ? '3 2' : '' });
    s += T(x + 20, 34, a, { fs: 12, bold: true, fill: col === C.t2 ? C.tx : col });
    s += T(x + 20, 50, b, { fs: 11, fill: C.t2 });
  });
  const lanesL = [['Extração', L.ext], ['Banco', L.db], ['Catálogo', L.cat], ['Preço', L.pre], ['Mensagens', L.msg], ['Front', L.fro]];
  lanesL.forEach(([a, col], i) => { const x = M + 780 + (i % 3) * 100, y = 22 + Math.floor(i / 3) * 22; s += R(x, y, 14, 14, { fill: col }) + T(x + 20, y + 12, a, { fs: 11, fill: C.t2 }); });
  s += T(M, 78, 'ESTADO DE CADA REGRA', { fs: 11, bold: true, fill: C.t2 });
  [['CÓDIGO', C.gr], ['VIOLADA', C.rd], ['PARCIAL', C.gold], ['PENDENTE', C.or], ['PROCESSO', C.dim]].forEach(([a, col], i) => {
    const x = M + 150 + i * 120; s += R(x, 68, 12, 12, { fill: col }) + T(x + 18, 79, a, { fs: 11, fill: C.tx });
  });
  const rules = [
    ['R-01', 'ban', 'Nada de dado fake', 'V'], ['R-02', 'plug', 'Só API oficial', 'C'], ['R-03', 'key', 'Segredo só em memória', 'P'], ['R-04', 'clock', 'Hora é do servidor', 'C'], ['R-05', 'undo', 'Em massa: com backup', 'C'],
    ['R-10', 'box', 'Só novo e em linha', 'C'], ['R-11', 'question', 'Dúvida fica fora', 'C'], ['R-12', 'split', 'Região separa; cor junta', 'C'], ['R-13', 'equal', 'Um jogo, um master', 'C'], ['R-14', 'ban', 'Nunca plataforma unknown', 'V'],
    ['R-15', 'shield', 'Só original', 'C'], ['R-16', 'flag', 'Reputação baixa fora', 'D'], ['R-17', 'chart', 'Uma média só', 'V'], ['R-17b', 'badge', 'Selo só do estado diário', 'V'], ['R-18', 'steps', 'Todo novo menor preço', 'C'],
    ['R-19', 'steps', 'Amostra: 3, 5 e 14 dias', 'C'], ['R-20', 'band', 'Faixa 0,35x a 3x', 'C'], ['R-21', 'layers', 'Frescor em camadas', 'C'], ['R-22', 'refresh', 'Reconferir antes de enviar', 'C'], ['R-23', 'percent', 'Régua de 10%', 'C'],
    ['R-24', 'text', 'Barreira de texto', 'V'], ['R-25', 'card', 'Cartão obrigatório', 'V'], ['R-26', 'hash', 'Um canal por loja', 'C'], ['R-27', 'link', 'ML só com meli.la', 'C'], ['R-28', 'user', 'Queda > 30%: humano', 'C'],
    ['R-29', 'lock', 'Enviada não se apaga', 'C'], ['R-30', 'ticket', 'Cupom lido na fonte', 'C'], ['R-35', 'image', 'Uma imagem, um lugar', 'C'], ['R-36', 'text', 'Termo vetado na interface', 'V'], ['R-39', 'calendar', 'Mostrar a data; falha não é zero', 'P'],
    ['R-40', 'door', 'Admin: requireAdmin', 'V'], ['R-37', 'pulse', 'Nenhum laço para', 'V'], ['R-38', 'db', 'Banco: transação curta', 'C'], ['R-41', 'sliders', 'Cron: ata e script', 'X'], ['R-42', 'check', 'Pronto só com QA', 'X'],
  ];
  const stc = { C: [C.gr, 'CÓDIGO'], V: [C.rd, 'VIOLADA'], P: [C.gold, 'PARCIAL'], D: [C.or, 'PENDENTE'], X: [C.dim, 'PROCESSO'] };
  const tw = 116, th = 126, tg = 4, ty0 = 100;
  rules.forEach(([id, ic, tx, st], i) => {
    const col = i % 9, row = Math.floor(i / 9);
    const x = M + col * (tw + tg + 3), y = ty0 + row * (th + tg);
    const [sc, sl] = stc[st];
    s += R(x, y, tw, th, { fill: C.sf, stroke: st === 'V' ? C.rd : C.ln, sw: st === 'V' ? 1.5 : 1 });
    s += icon(ic, x + 8, y + 8, 30, st === 'V' ? C.rd : C.gold);
    s += T(x + tw - 8, y + 28, id, { fs: 13, bold: true, anchor: 'end', fill: C.tx });
    const pp = P(x + 8, y + 44, tx, tw - 16, { fs: 12, bold: true }); s += pp.svg;
    if (pp.n > 3) warns.push('regra longa: ' + tx);
    s += R(x + 8, y + th - 20, 10, 10, { fill: sc });
    s += T(x + 24, y + th - 11, sl, { fs: 11, fill: sc === C.dim ? C.t2 : sc, bold: true });
  });
  s += T(M, 676, '35 regras imperativas. Em conflito entre capítulos, a regra numerada prevalece. 9 estão violadas hoje e 1 parcialmente; cada violação tem tarefa na fila (página 9). R-43 a R-45 (aprovação, régua, produto único) estão na página 11.', { fs: 11, fill: C.t2 });
  page(10, 'As regras que não se negociam', 'Legenda e as regras R-01 a R-42 em uma página. Ícone dourado = em vigor; borda vermelha = violada hoje.', s,
    'Fonte: FLUXO_MESTRE.md seção 6 e marcas de confiança. Violadas: R-01, R-14, R-17, R-17b, R-24, R-25, R-36, R-40, R-37; parcial: R-03.');
}


// =====================================================================
// PAGINA 11 - novidades de 2026-11-12
// =====================================================================
{
  let s = '';
  const cards = [
    ['APROVAÇÃO', L.cat, 'Central e aprovação contínua (R-43, R-45b)', [
      'N60 /admin/aprovacao: cartão, lote só dos óbvios com prévia, desfazer e histórico das últimas 50.',
      'N61 /api/cron/aprovacao-auto: minutos 12 a 52 de 10 em 10, lote 60, só Amazon; APROVACAO_AUTO=off desliga.',
      'scripts/aprovacao-liberar-tudo.ts: dry-run por padrão; --apply só com ordem do dono; backup NDJSON e reversão.',
      'Mídia, modelo, armazenamento e preço ficam com o dono.']],
    ['MENSAGENS', L.msg, 'Régua de destaque (R-44)', [
      'src/lib/messaging/regua.ts: 5 degraus (3, 6, 12, 20 e 30%) com veredito em texto e marcas ▼.',
      'Corte de 3% nas lojas de GROUP_REGUA_LOJAS (ampliado às 7 lojas, informado pelo operador; valor na Vercel NÃO VERIFICADO); fora da lista vale 10%.',
      'Degrau 1 até 1/3 da hora, só se há degrau 2 a 5 esperando. Achado até 6/h por grupo (GROUP_AC_POR_HORA).',
      'Fila justa por gatilho e loja (incidente do dia, abaixo).']],
    ['CANAIS', L.msg, 'Link curto e canal Destaques', [
      'N63 /g/<5 base62>: 302 para /go/<slug>?s=wa&m=<chave>; código aleatório; 404 sem corpo; migration 0050 aplicada.',
      'Canal Destaques: degraus 4 e 5, segundo envio isolado; liga com TELEGRAM_DESTAQUES_CHAT_ID.',
      'PENDENTE DO DONO: criar o canal e adicionar o bot. Sem a variável, o envio fica desligado.']],
    ['INGESTÃO', L.ext, 'Shopee máxima e produto único (R-45)', [
      'N62 cobertura-shopee: minutos 22 e 52, pages=3, maxCalls=45, maxMasters=12; pausa de 45 min após 10030.',
      'Master novo de chave forte nasce aprovado mesmo com 1 oferta; chave fraca vai à fila.',
      'Migration 0048 aplicada (SHOPEE_VARIANTE_COLUNAS=1). Nenhum mínimo de ofertas barra cadastro; o veredito de queda segue exigindo 5.',
      'Medir 10030 por 7 dias antes de subir maxCalls.']],
    ['AMAZON', L.ext, 'Vitrine, retrô novo e promoções', [
      'Vitrine (opt-in, modos com vitrine, teto AMAZON_VITRINE_CAP, 60 buscas por ciclo); exceção do retrô NOVO: Hyperkin, Analogue, Retro-Bit, 8BitDo.',
      'Promoções e cupons Amazon: loop amazon-promocoes.js lê /promotion/psp/<ID> e posta em /api/ingest/amazon-promocoes.',
      'Estado verificado no repositório: arquivos ainda NÃO commitados (agente finalizando); não está no ar.']],
    ['INCIDENTES', C.rd, 'Dia 12/11: o que quebrou e o que mudou', [
      'Envio parado de ~11:00 a ~13:40 UTC: detecção estourava o orçamento de 38 s e o laço de envio não rodava (d63cf1f, e500e95).',
      '2ª rodada: starvation da fila (300 mais antigas eram Achado barradas); janela justa por gatilho (423f42b, 94a64b5).',
      'vercel.json inválido em 7e177ac, corrigido em 815534e: configuração só por JSON.parse e JSON.stringify.']],
  ];
  cards.forEach(([tg, col, titulo, itens], i) => {
    const c = i % 3, r = Math.floor(i / 3), x = M + c * 362, y = r * 316, w = 350, h = 304;
    s += R(x, y, w, h, { fill: C.sf, stroke: tg === 'INCIDENTES' ? C.rd : C.ln });
    s += R(x, y, 4, h, { fill: col });
    s += T(x + 14, y + 20, tg, { fs: 11, bold: true, fill: col, ls: 1 });
    const t = P(x + 14, y + 28, titulo, w - 28, { fs: 13, bold: true }); s += t.svg;
    let cy = y + 34 + t.h;
    itens.forEach((it) => { const p = P(x + 14, cy, it, w - 28, { fs: 11, fill: C.t2 }); s += p.svg; cy += p.h + 6; });
    if (cy > y + h - 2) warns.push('pagina 11 estoura: ' + titulo);
  });
  s += T(M, 650, 'Fonte de cada item: FLUXO_MESTRE.md seção 2 (N60 a N63), seção 6 (R-43 a R-45), seção 7 (incidentes) e atas de 2026-11-12. Nada aqui é estimativa.', { fs: 11, fill: C.t2 });
  s += T(M, 668, 'Pendentes do dono (seção 9): 9 de 14 decisões ainda abertas; ver FILA #37.', { fs: 11, fill: C.gold, bold: true });
  page(11, 'O que mudou em 12/11', 'Aprovação, régua, canais, ingestão máxima, Amazon e incidentes do dia, conferidos contra o código.', s,
    'Fonte: FLUXO_MESTRE.md v1.1 (2026-11-12), docs/fila-de-execucao.md #33 a #37 e as atas de 2026-11-12. NÃO VERIFICADO: estado em produção das variáveis GROUP_REGUA_*, APROVACAO_AUTO e TELEGRAM_DESTAQUES_CHAT_ID (não lidas na Vercel).');
}

// ---------- saida ----------
const css = `
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; border-radius: 0 !important; }
html, body { background: ${C.bg}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${FONT}; color: ${C.tx}; }
.page { width: 1122px; height: 793px; position: relative; overflow: hidden; background: ${C.bg}; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.hd { position: absolute; left: 24px; right: 24px; top: 10px; height: 70px; }
.kicker { font-size: 11px; letter-spacing: 2px; color: ${C.gold}; font-weight: 700; }
h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 27px; font-weight: 700; color: ${C.tx}; margin-top: 3px; line-height: 1.1; }
.sub { font-size: 13px; color: ${C.t2}; margin-top: 4px; }
.num { position: absolute; right: 0; top: 0; font-size: 12px; color: ${C.t2}; font-weight: 700; }
.hd:after { content: ''; position: absolute; left: 0; right: 0; bottom: -4px; height: 2px; background: ${C.gold}; width: 64px; }
svg { position: absolute; left: 0; top: 86px; display: block; }
.ft { position: absolute; left: 24px; right: 24px; bottom: 6px; font-size: 11px; color: ${C.dim}; line-height: 1.25; }
`;
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fluxo Mestre Visual</title><style>${css}</style></head><body>${pages.join('\n')}</body></html>`;
writeFileSync(join(AQUI, 'FLUXO_VISUAL.html'), html, 'utf8');
console.log('paginas:', pages.length, '| avisos:', warns.length);
warns.forEach((w) => console.log(' -', w));
