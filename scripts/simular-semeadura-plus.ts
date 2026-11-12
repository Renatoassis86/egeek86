/**
 * SIMULACAO (sem chamar a API, sem banco, sem escrita) da ampliacao por tipo das lojas Plus (pedido do dono, 2026-11-12).
 * Responde: quantas consultas/chamadas por tipo, quanto tempo para encher cada loja e qual o impacto na cota por hora/dia.
 *
 * Entradas REAIS: (1) config dos segmentos (termos); (2) historico das semeaduras em backup/dados/semear-vertical-* /plano.json
 * (chamadas, resultados, 404, planejados por segmento); (3) inventario docs/inventario-catalogo/*.csv (aprovados por tipo hoje).
 * PREMISSAS (nao medidas; marcadas na saida): profundidade media por termo, fracao de catalogos unicos, cota do ML.
 *
 *   npx tsx scripts/simular-semeadura-plus.ts [--paginas 3] [--unicos 0.5] [--diario 12000] [--tipos-novos]
 */
import fs from 'node:fs';
import path from 'node:path';
import { SEGMENTS } from '../src/lib/catalog/vertical/config';
import { TIPOS_ESPERADOS, existiaAntes, situacaoDepois } from '../src/lib/catalog/vertical/cobertura-tipos';
import { DAILY_CALL_CAP } from '../src/lib/catalog/vertical/seed-budget';
import { callsPerRunOf, estimateType, MAX_SEARCH_PAGES, reconfirmCallsPerHour, SEARCH_PAGE_LIMIT, type SimParams } from '../src/lib/catalog/vertical/seed-schedule';

const argv = process.argv.slice(2);
const opt = (n: string, d: number) => {
  const i = argv.indexOf(n);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const PAGES = opt('--paginas', 3);
const UNIQUE = opt('--unicos', 0.5);
const DAILY = opt('--diario', DAILY_CALL_CAP);

// ---- historico real ----
interface Agg { runs: number; calls: number; pages: number; results: number; plans: number; c404: number }
const hist: Record<string, Agg> = {};
const dupHist: Record<string, number> = {};
const base = path.resolve('backup', 'dados');
if (fs.existsSync(base)) {
  for (const d of fs.readdirSync(base)) {
    if (!/^semear-vertical-\d/.test(d)) continue;
    const f = path.join(base, d, 'plano.json');
    if (!fs.existsSync(f)) continue;
    let p: any;
    try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const r of p.reports ?? []) {
      const a = (hist[r.segment] ??= { runs: 0, calls: 0, pages: 0, results: 0, plans: 0, c404: 0 });
      a.runs++;
      a.calls += r.callsSpent ?? 0;
      a.pages += r.pagesFetched ?? 0;
      a.results += r.searchResults ?? 0;
      a.plans += (r.plans ?? []).filter((x: any) => !x.mergeInto).length;
      a.c404 += (r.counts?.sem_vendedor_404 ?? 0) + (r.counts?.sem_vendedor_404_cache ?? 0);
      dupHist[r.segment] = (dupHist[r.segment] ?? 0) + Object.entries(r.counts ?? {}).filter(([k]) => /^(ja_|titulo_duplicado|cor_junta)/.test(k)).reduce((n, [, v]) => n + (v as number), 0);
    }
  }
}
const tot = Object.values(hist).reduce((s, a) => ({ calls: s.calls + a.calls, pages: s.pages + a.pages, results: s.results + a.results, plans: s.plans + a.plans, c404: s.c404 + a.c404 }), { calls: 0, pages: 0, results: 0, plans: 0, c404: 0 });
const globalCpr = tot.results > 0 ? (tot.calls - tot.pages) / tot.results : 0.4;
const globalYield = tot.results > 0 ? tot.plans / tot.results : 0.04;
const share404 = tot.results > 0 ? tot.c404 / tot.results : 0;

// ---- inventario real: aprovados por tipo ----
const inv: Record<string, { aprovados: number; total: number }> = {};
const invDir = path.resolve('docs', 'inventario-catalogo');
const parseCsvLine = (l: string) => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
};
let catalogsToday = 0;
for (const f of ['impressao3d', 'tecnologia', 'livros', 'eletrodomesticos', 'eletroeletronicos', 'esporte']) {
  const p = path.join(invDir, `${f}.csv`);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = parseCsvLine(lines[0]);
  const iTipo = head.indexOf('tipo');
  const iSt = head.indexOf('status_porteiro');
  for (const l of lines.slice(1)) {
    const c = parseCsvLine(l);
    const k = c[iTipo];
    if (!k) continue;
    const e = (inv[k] ??= { aprovados: 0, total: 0 });
    e.total++;
    catalogsToday++;
    if (c[iSt] === 'approved') e.aprovados++;
  }
}

// Saturacao: catalogos com vendedor por tipo, dos tipos explorados a fundo (>= 1000 resultados): planejados + duplicatas ja cadastradas.
const deep = Object.entries(hist).filter(([, a]) => a.results >= 1000);
const dupOf = (k: string) => dupHist[k] ?? 0;
const pools = deep.map(([k, a]) => a.plans + dupOf(k)).sort((a, b) => a - b);
const medianPool = pools.length ? Math.round((pools[Math.floor((pools.length - 1) / 2)] + pools[Math.ceil((pools.length - 1) / 2)]) / 2) : 140;
const POOL = opt('--pool', medianPool);
const callsPerMaster = tot.plans > 0 ? tot.calls / tot.plans : 5;

const out: string[] = [];
const p = (s = '') => out.push(s);
p(`SATURACAO: mediana de catalogos com vendedor por tipo nos ${pools.length} tipos explorados a fundo = ${medianPool} (faixa ${pools[0] ?? '-'} a ${pools[pools.length - 1] ?? '-'}); usada: ${POOL}. Custo observado: ${callsPerMaster.toFixed(1)} chamadas por master planejado (todas as chamadas / masters, historico real).`);
p(`SIMULACAO (sem chamadas a API). Premissas: profundidade ${PAGES} pagina(s) de ${SEARCH_PAGE_LIMIT} por termo (maximo ${MAX_SEARCH_PAGES}), ${(UNIQUE * 100).toFixed(0)}% dos resultados sao catalogos ainda nao vistos, orcamento diario de semeadura ${DAILY}.`);
p(`Historico real (${Object.keys(hist).length} segmentos, ${tot.calls} chamadas, ${tot.results} resultados): ${globalCpr.toFixed(2)} chamadas de catalogo por resultado, ${(globalYield * 100).toFixed(1)}% viram master planejado, ${(share404 * 100).toFixed(0)}% dos resultados terminam em 404 "sem vendedor".`);
p();

// ---- tabela tipo x loja (antes -> depois) ----
const label = (s: string) => (s === 'eletroeletronicos' ? 'Eletronicos' : s === 'eletrodomesticos' ? 'Casa' : s === 'impressao3d' ? 'Impressao 3D' : s[0].toUpperCase() + s.slice(1));
p('TABELA TIPO x LOJA');
p('loja | tipo | segmento | aprovados hoje | antes | depois | causa/nota');
const counts: Record<string, number> = {};
for (const t of TIPOS_ESPERADOS) {
  const ap = t.segmento ? inv[t.segmento]?.aprovados ?? 0 : 0;
  // ANTES = o que ha na vitrine/banco hoje (inventario): sem segmento ou segmento novo = ausente; configurado mas sem nenhum produto aprovado = sem produto (nunca semeado/aprovado).
  const antes = !t.segmento || !existiaAntes(t) ? 'ausente' : ap >= 30 ? 'coberto' : ap > 0 ? 'parcial' : 'configurado, sem produto';
  const depois = situacaoDepois(t);
  counts[`${antes}>${depois}`] = (counts[`${antes}>${depois}`] ?? 0) + 1;
  p(`${label(t.loja)} | ${t.tipo} | ${t.segmento ?? '-'} | ${t.segmento ? ap : '-'} | ${antes} | ${depois} | ${t.causa ?? ''}${t.nota ? (t.causa ? ': ' : '') + t.nota : ''}`);
}
p();
p(`Resumo antes>depois: ${JSON.stringify(counts)}`);
p();

// ---- chamadas por tipo ----
const sim: SimParams = { pagesPerTerm: PAGES, uniqueFraction: UNIQUE, callsPerFreshResult: globalCpr, mastersPerFreshResult: globalYield, poolPerType: POOL };
p('CHAMADAS POR TIPO (uma passada completa na profundidade simulada)');
p('segmento | loja | termos | busca | catalogo | total | masters (est.) | execucoes da fila');
const perStore: Record<string, { calls: number; masters: number; types: number }> = {};
let grand = 0;
let grandMasters = 0;
for (const s of SEGMENTS) {
  const h = hist[s.key];
  const par: SimParams = h && h.results >= 200 ? { ...sim, callsPerFreshResult: (h.calls - h.pages) / h.results, mastersPerFreshResult: h.plans / h.results } : sim;
  // Livros e aberto (autores, editoras, generos): sem saturacao por tipo, so o limite dos termos (limite superior).
  const e = estimateType(s, s.key === 'livros' ? { ...par, poolPerType: undefined } : par);
  const st = (perStore[s.vertical] ??= { calls: 0, masters: 0, types: 0 });
  st.calls += e.totalCalls;
  st.masters += e.masters;
  st.types++;
  grand += e.totalCalls;
  grandMasters += e.masters;
  p(`${s.key} | ${label(s.vertical)} | ${e.terms} | ${e.searchCalls} | ${e.catalogCalls} | ${e.totalCalls} | ${e.masters} | ${e.runs} (${callsPerRunOf(s)}/exec)${h && h.results >= 200 ? ' [taxas do historico do tipo]' : ''}`);
}
p();
p('POR LOJA');
p('loja | tipos | chamadas totais | masters (est.) | dias no orcamento diario | execucoes (12000 chamadas)');
for (const [v, st] of Object.entries(perStore)) p(`${label(v)} | ${st.types} | ${st.calls} | ${st.masters} | ${(st.calls / DAILY).toFixed(1)} | ${Math.ceil(st.calls / DAILY)}`);
p(`TOTAL | ${SEGMENTS.length} | ${grand} | ${grandMasters} | ${(grand / DAILY).toFixed(1)} dias | `);
p();

// ---- impacto na cota (reconfirmacao) ----
const catalogsAfter = catalogsToday + grandMasters;
p('IMPACTO NA COTA: reconfirmacao de precos (collect-vertical), que cresce com o numero de catalogos (a decisao do dono)');
p('Chamadas/hora de reconfirmacao por numero de catalogos ativos e intervalo (1,1 chamada/catalogo, fator medido):');
p('catalogos | 15 min | 30 min | 60 min | 120 min');
for (const n of [catalogsToday, 5000, 10000, 20000, 40000]) p(`${n} | ${reconfirmCallsPerHour(n, 15)}/h | ${reconfirmCallsPerHour(n, 30)}/h | ${reconfirmCallsPerHour(n, 60)}/h | ${reconfirmCallsPerHour(n, 120)}/h`);
p();
p(`catalogos hoje (produtos dos CSVs de inventario, aproximacao de 1 catalogo por produto): ${catalogsToday}; depois do enchimento simulado: ~${catalogsAfter}`);
p('intervalo | chamadas/h hoje | chamadas/h depois | chamadas/dia depois | vs freio horario padrao 8000 | vs freio diario padrao 150000');
for (const iv of [15, 30, 60]) {
  const h0 = reconfirmCallsPerHour(catalogsToday, iv);
  const h1 = reconfirmCallsPerHour(catalogsAfter, iv);
  p(`${iv} min | ${h0} | ${h1} | ${h1 * 24} | ${(h1 / 8000).toFixed(1)}x | ${((h1 * 24) / 150000).toFixed(1)}x`);
}
p();
p('Leitura: a SEMEADURA cabe no orcamento diario; o que pressiona a cota e a RECONFIRMACAO dos catalogos novos (cada catalogo e rechecado a cada 15 a 60 min). A cota oficial do ML nao esta documentada no repositorio: os dois freios padrao (8000/h, 150000/dia) sao ASSUMIDOS.');

console.log(out.join('\n'));
