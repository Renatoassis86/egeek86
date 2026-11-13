/**
 * TESTE DAS REGRAS DO FRONT (checklist da nova versão, item #2). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-front-regras.ts [--estrito] [--url=http://localhost:3000]
 * Só leitura (arquivos de src/ e public/images; HTML local se houver servidor). Nada é gravado, nenhuma consulta ao banco.
 *
 * Regras (dono e FLUXO_MESTRE):
 *  R1 'afiliad' nunca aparece para o cliente (texto, alt, title, aria-label, nome exibido). Permitido só em valor interno de código
 *     (identificador sem espaço, como 'afiliado' em um tipo ou comparação) e em comentário.
 *  R2 cantos retos: sem rounded-* (exceto rounded-none). O CSS global zera todo raio com !important, então fora do front novo
 *     é só ACHADO (dívida de código); no front novo é FALHA.
 *  R3 imagem usada em mais de um lugar: mesmo caminho em 2 arquivos da home (FALHA) ou mesmo conteúdo SHA-1 com caminhos diferentes (ACHADO).
 *  R4 vitrines sem retrô, usado, Open Box, Xbox One ou 360 (código dos componentes e HTML renderizado).
 *  R5 nenhum preço escrito à mão (R$ 99, centavos literais) nos componentes de vitrine/home.
 *  R6 todo componente que exibe preço (formatBRL/precoCentavos) também exibe o horário da leitura.
 *
 * Severidade: FALHA derruba o teste (exit 1). ACHADO é dívida fora do front novo: listada, não derruba (use --estrito para derrubar).
 * O vigia de arquivos órfãos é o `test-home-sem-orfaos.ts`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');
const ESTRITO = process.argv.includes('--estrito');
const URL_LOCAL = (process.argv.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:3000').slice(6);

const norm = (p: string) => relative(RAIZ, p).split(sep).join('/');

function listar(dir: string, exts: RegExp, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) listar(p, exts, acc);
    else if (exts.test(nome)) acc.push(p);
  }
  return acc;
}

/** Front novo: onde as regras são FALHA. */
const FRONT_NOVO = [/^src\/components\/vitrines\//, /^src\/components\/home-v2\//, /^src\/components\/home\/secoes-v2\//, /^src\/app\/\(shop\)\/page\.tsx$/];
/** Componentes que desenham cartões de oferta/vitrine (regras R4, R5, R6). */
const COMPONENTES_VITRINE = [/^src\/components\/vitrines\//, /^src\/components\/home-v2\//, /^src\/components\/home\/secoes-v2\//];
/** O que o cliente nunca vê: admin, API, testes. */
const INTERNO = [/^src\/app\/admin\//, /^src\/components\/admin\//, /^src\/app\/api\//, /\.test\.tsx?$/];

const arquivos = listar(join(RAIZ, 'src'), /\.(tsx|ts|css)$/).map(norm);
const publicos = arquivos.filter((f) => !INTERNO.some((r) => r.test(f)));
const ehFrontNovo = (f: string) => FRONT_NOVO.some((r) => r.test(f));
const ehVitrine = (f: string) => COMPONENTES_VITRINE.some((r) => r.test(f)) && /\.tsx$/.test(f);

interface Achado { sev: 'FALHA' | 'ACHADO'; regra: string; onde: string; texto: string }
const achados: Achado[] = [];
const registrar = (regra: string, f: string, linha: number | null, texto: string, falha: boolean) =>
  achados.push({ sev: falha ? 'FALHA' : 'ACHADO', regra, onde: linha ? `${f}:${linha}` : f, texto: texto.trim().slice(0, 140) });

/** Linhas de código sem comentários (mantém a numeração). */
function linhasDeCodigo(f: string): Array<[number, string]> {
  const src = readFileSync(join(RAIZ, f), 'utf8');
  const out: Array<[number, string]> = [];
  let emBloco = false;
  src.split(/\r?\n/).forEach((l0, i) => {
    let l = l0;
    if (emBloco) {
      const fim = l.indexOf('*/');
      if (fim < 0) return;
      l = l.slice(fim + 2);
      emBloco = false;
    }
    l = l.replace(/\/\*.*?\*\//g, ' ');
    const ini = l.indexOf('/*');
    if (ini >= 0) {
      l = l.slice(0, ini);
      emBloco = true;
    }
    if (/^\s*\/\//.test(l)) return;
    l = l.replace(/(^|\s)\/\/\s.*$/, '$1'); // comentário no fim da linha (com espaço depois de //, não pega https://)
    if (l.trim()) out.push([i + 1, l]);
  });
  return out;
}

const codigo = new Map<string, Array<[number, string]>>();
for (const f of arquivos) if (/\.tsx?$/.test(f)) codigo.set(f, linhasDeCodigo(f));

// ---------------------------------------------------------------------------------------------------------------------
// R1 afiliad
// ---------------------------------------------------------------------------------------------------------------------
/** Literal 'afiliado' sozinho (valor interno de tipo, chave ou comparação) é permitido; qualquer outra ocorrência é texto. */
function afiliadoVisivel(l: string): boolean {
  if (!/afiliad/i.test(l)) return false;
  // remove valores internos: literais de uma palavra só (sem espaço) que contêm afiliad, ex. 'afiliado', "affiliate-x" não casa
  const semInternos = l.replace(/(['"`])[a-z0-9_.:-]*afiliad[a-z0-9_.:-]*\1/gi, ' ');
  // identificadores de código (variáveis, props) também são internos
  const semIds = semInternos.replace(/\b[A-Za-z_$][\w$]*afiliad[\w$]*\b/gi, ' ');
  return /afiliad/i.test(semIds);
}
// Só o que chega ao cliente: páginas e componentes (server/ e lib/ têm filtros, logs e nomes internos do código).
for (const f of publicos.filter((x) => /^src\/(app|components)\//.test(x))) {
  for (const [n, l] of codigo.get(f) ?? []) if (afiliadoVisivel(l)) registrar('R1 afiliad', f, n, l, true);
}

// ---------------------------------------------------------------------------------------------------------------------
// R2 rounded-*
// ---------------------------------------------------------------------------------------------------------------------
const RE_ROUNDED = /(?<![\w-])(?:[a-z0-9]+:)*rounded(?:-(?!none\b)[^\s"'`}]+)?/g;
for (const f of arquivos) {
  if (!/\.tsx?$/.test(f) || INTERNO.some((r) => r.test(f))) continue;
  for (const [n, l] of codigo.get(f) ?? []) {
    const m = l.match(RE_ROUNDED)?.filter((x) => !/rounded-none$/.test(x));
    if (m?.length && /(className|class=|cn\(|clsx|['"`])/.test(l)) registrar('R2 rounded-*', f, n, `${m.join(' ')}  |  ${l}`, ehFrontNovo(f));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// R3 imagens
// ---------------------------------------------------------------------------------------------------------------------
const RE_IMG = /\/images\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif|svg)/g;
const usoPorCaminho = new Map<string, Set<string>>();
for (const f of publicos) {
  for (const [, l] of codigo.get(f) ?? []) for (const m of l.match(RE_IMG) ?? []) {
    if (!usoPorCaminho.has(m)) usoPorCaminho.set(m, new Set());
    usoPorCaminho.get(m)!.add(f);
  }
}
const HOME = (f: string) => ehFrontNovo(f) || /^src\/components\/home\//.test(f) || /^src\/components\/layout\//.test(f);
for (const [img, fs] of usoPorCaminho) {
  const naHome = [...fs].filter(HOME);
  if (naHome.length > 1) registrar('R3 imagem repetida (caminho)', img, null, `usada em ${naHome.join(', ')}`, naHome.some(ehFrontNovo));
}
const porHash = new Map<string, string[]>();
for (const img of usoPorCaminho.keys()) {
  const arq = join(RAIZ, 'public', img);
  if (!existsSync(arq)) {
    registrar('R3 imagem ausente', img, null, `referenciada por ${[...usoPorCaminho.get(img)!].join(', ')} e não existe em public/`, [...usoPorCaminho.get(img)!].some(ehFrontNovo));
    continue;
  }
  const h = createHash('sha1').update(readFileSync(arq)).digest('hex');
  porHash.set(h, [...(porHash.get(h) ?? []), img]);
}
for (const [h, imgs] of porHash) if (imgs.length > 1) registrar('R3 imagem repetida (SHA-1)', imgs.join(' = '), null, `mesmo conteúdo ${h.slice(0, 10)}`, false);

// ---------------------------------------------------------------------------------------------------------------------
// R4 retrô, usado, Open Box, Xbox One, 360 nas vitrines
// ---------------------------------------------------------------------------------------------------------------------
const RE_FORA = /retr[oô]|\busad[oa]s?\b|open[\s-]?box|xbox[\s_-]?one|xbox[\s_-]?360|\b360\b|seminov/i;
for (const f of arquivos.filter(ehVitrine)) for (const [n, l] of codigo.get(f) ?? []) if (RE_FORA.test(l)) registrar('R4 fora de linha/usado', f, n, l, true);

// ---------------------------------------------------------------------------------------------------------------------
// R5 preço escrito à mão  /  R6 preço sem horário de leitura
// ---------------------------------------------------------------------------------------------------------------------
const RE_PRECO_FIXO = /R\$\s?\d|(?:priceCents|precoCentavos|price_cents|currentPriceCents)\s*[:=]\s*\d{3,}/;
for (const f of arquivos.filter((x) => ehVitrine(x) || x === 'src/app/(shop)/page.tsx')) for (const [n, l] of codigo.get(f) ?? []) if (RE_PRECO_FIXO.test(l)) registrar('R5 preço hardcoded', f, n, l, true);
for (const f of arquivos.filter(ehVitrine)) {
  const cod = (codigo.get(f) ?? []).map((x) => x[1]).join('\n');
  // Só o preço ATUAL da oferta (precoCentavos) exige horário; "menor registrado" e média já levam a própria data/rótulo.
  const exibePreco = /precoCentavos/.test(cod) && /<|return\s*\(/.test(cod);
  if (exibePreco && !/lidoEm|horaDaLeitura|lastPriceConfirmed|lastCheckedAt|confirmedAt|verificad|lido\b/i.test(cod)) registrar('R6 preço sem horário de leitura', f, null, 'exibe preço mas não referencia o horário da leitura (lidoEm/horaDaLeitura)', true);
}

// ---------------------------------------------------------------------------------------------------------------------
// HTML renderizado local (se houver servidor)
// ---------------------------------------------------------------------------------------------------------------------
async function htmlLocal(): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(`${URL_LOCAL}/?v=2`, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

(async () => {
  const html = await htmlLocal();
  let htmlInfo = `HTML local: sem servidor em ${URL_LOCAL} (verificação do HTML renderizada pulada)`;
  if (html) {
    htmlInfo = `HTML local: ${URL_LOCAL}/?v=2 lido (${html.length} bytes)`;
    const visivel = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const textos = (visivel.match(/>([^<]+)</g) ?? []).map((x) => x.slice(1, -1)).join(' ') + ' ' + (visivel.match(/(?:alt|title|aria-label)="[^"]*"/g) ?? []).join(' ');
    if (/afiliad/i.test(textos)) registrar('R1 afiliad (HTML)', URL_LOCAL, null, 'texto visível/atributo com "afiliad"', true);
    if (RE_FORA.test(textos)) registrar('R4 fora de linha/usado (HTML)', URL_LOCAL, null, `termo proibido no texto: ${textos.match(RE_FORA)?.[0]}`, true);
    const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => decodeURIComponent((m[1].match(/[?&]url=([^&]+)/)?.[1] ?? m[1])));
    const cont = new Map<string, number>();
    for (const s of imgs) cont.set(s, (cont.get(s) ?? 0) + 1);
    for (const [s, n] of cont) if (n > 1 && /\/images\//.test(s)) registrar('R3 imagem repetida (HTML)', s, null, `${n} usos na mesma página`, false);
    const precos = (textos.match(/R\$\s?\d/g) ?? []).length;
    const horarios = (textos.match(/(?:lid[oa]|verificad[oa]|confirmad[oa]|atualizad[oa])[^<]{0,30}(?:\d{1,2}:\d{2}|há\s+\d|ontem|hoje)/gi) ?? []).length;
    if (precos > 0 && horarios === 0) registrar('R6 preço sem horário (HTML)', URL_LOCAL, null, `${precos} preços e nenhum horário de leitura no texto`, true);
  }

  const falhas = achados.filter((a) => a.sev === 'FALHA');
  const dividas = achados.filter((a) => a.sev === 'ACHADO');
  const porRegra = (l: Achado[]) => l.reduce<Record<string, number>>((m, a) => ((m[a.regra] = (m[a.regra] ?? 0) + 1), m), {});
  console.log(`test-front-regras: ${arquivos.length} arquivos varridos (${publicos.length} públicos), ${usoPorCaminho.size} imagens referenciadas`);
  console.log(htmlInfo);
  for (const a of falhas) console.error(`FALHA  [${a.regra}] ${a.onde}  ${a.texto}`);
  // Achados (dívida fora do front novo): resumo por regra e os 15 primeiros de cada
  const regras = Object.keys(porRegra(dividas));
  for (const r of regras) {
    const l = dividas.filter((a) => a.regra === r);
    console.warn(`ACHADO [${r}] ${l.length} ocorrência(s) fora do front novo`);
    for (const a of l.slice(0, 15)) console.warn(`   ${a.onde}  ${a.texto}`);
    if (l.length > 15) console.warn(`   ... e mais ${l.length - 15}`);
  }
  console.log(`Resumo: ${falhas.length} falha(s), ${dividas.length} achado(s)${ESTRITO ? ' (modo estrito: achados também derrubam)' : ''}`);
  process.exit(falhas.length > 0 || (ESTRITO && dividas.length > 0) ? 1 : 0);
})();
