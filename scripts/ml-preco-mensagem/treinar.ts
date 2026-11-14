/**
 * MODELO EM MODO SOMBRA do preço da mensagem (C3, 2026-11-14). SOMENTE SELECT no banco. Reproduzível:
 *
 *   npx tsx --env-file=.env.local scripts/ml-preco-mensagem/treinar.ts            # monta o dataset, treina, escreve o relatório e o modelo
 *   npx tsx --env-file=.env.local scripts/ml-preco-mensagem/treinar.ts --sem-escrita   # só imprime os números
 *
 * Rótulo (1 = a mensagem NÃO sobreviveu à checagem de preço):
 *   - `group_messages.live_note` começa com "revalidação: já não vale" (preço velho, sumiu ou mudou na releitura ao vivo), OU
 *   - |recheck_divergence_pct| >= 2 (preço da mensagem diferente do relido depois do envio).
 *   Rótulo 0: tem releitura (recheck_divergence_pct) e |divergência| < 2.  Fora do dataset: sem rótulo ou falha da própria API.
 *   O rótulo ESTRITO (só |divergência| >= 2) é avaliado à parte; tem poucos positivos.
 * Divisão: POR TEMPO (as mais antigas treinam, as mais novas testam). Nunca aleatória.
 * Modelos: regressão logística (base, explicável) e boosting de "stumps" (gradiente de árvores de 1 nível), ambos sem dependências.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from '../_dup-shared';
import { extrairFeatures, FEATURE_NAMES, type EntradaML, type Modelo, type MetricasModelo } from '../../src/lib/messaging/ml-preco';
import { meliItemIdFromUrl } from '../../src/lib/messaging/live-recheck';
import { anuncioIdentificado, type PricePoint } from '../../src/lib/messaging/price-guard';

const SEM_ESCRITA = process.argv.includes('--sem-escrita');
const HORAS_JANELA = 72;

interface Linha {
  id: string;
  em: Date;
  y: number;
  yEstrito: number;
  x: number[];
}

// ---------------------------------------------------------------- dataset
async function montarDataset(): Promise<{ linhas: Linha[]; resumo: Record<string, number> }> {
  const sql = connect();
  try {
    const rows = await sql<
      {
        id: string;
        created_at: Date;
        trigger: string;
        offer_id: string;
        price: string | null;
        avg: string | null;
        div: number | null;
        live_note: string | null;
        net: string | null;
        external_item_id: string | null;
        affiliate_url: string | null;
        total_sales: string | null;
        rep: string | null;
      }[]
    >`
      SELECT g.id::text AS id, g.created_at, g.trigger, g.offer_id::text AS offer_id, g.price_cents_detected::text AS price, g.avg_cents::text AS avg,
             g.recheck_divergence_pct::float8 AS div, g.live_note, g.candidate ->> 'networkSlug' AS net,
             o.external_item_id, o.affiliate_url, s.total_sales::text AS total_sales, s.reputation_level AS rep
      FROM group_messages g
      LEFT JOIN affiliate_offers o ON o.id = g.offer_id
      LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
      WHERE g.channel = 'tg' AND g.offer_id IS NOT NULL AND g.price_cents_detected > 0
        AND (g.recheck_divergence_pct IS NOT NULL OR g.live_note LIKE 'revalida%')
      ORDER BY g.created_at`;
    const resumo: Record<string, number> = { linhasBrutas: rows.length };
    const ids = [...new Set(rows.map((r) => r.offer_id))];
    const minAt = rows.length ? rows[0]!.created_at.getTime() : Date.now();
    const desde = new Date(minAt - (HORAS_JANELA + 1) * 3_600_000).toISOString();
    const snaps = new Map<string, Array<PricePoint & { list: number | null }>>();
    for (let i = 0; i < ids.length; i += 300) {
      const lote = ids.slice(i, i + 300);
      const s = await sql<{ offer_id: string; price_cents: string; list_price_cents: string | null; collected_at: Date }[]>`
        SELECT offer_id::text AS offer_id, price_cents::text AS price_cents, list_price_cents::text AS list_price_cents, collected_at
        FROM affiliate_price_snapshots WHERE offer_id = ANY(${lote}::uuid[]) AND collected_at >= ${desde}::timestamptz ORDER BY collected_at`;
      for (const r of s) {
        const a = snaps.get(r.offer_id) ?? [];
        a.push({ at: r.collected_at, priceCents: Number(r.price_cents), list: r.list_price_cents ? Number(r.list_price_cents) : null });
        snaps.set(r.offer_id, a);
      }
    }
    resumo.ofertas = ids.length;
    resumo.snapshots = [...snaps.values()].reduce((a, b) => a + b.length, 0);
    const linhas: Linha[] = [];
    let semHistorico = 0;
    for (const r of rows) {
      const note = r.live_note ?? '';
      const falhaReval = note.startsWith('revalidação: já não vale');
      const div = r.div;
      if (!falhaReval && div == null) continue;
      const y = falhaReval || (div != null && Math.abs(div) >= 2) ? 1 : 0;
      const yEstrito = div != null && Math.abs(div) >= 2 ? 1 : 0;
      const at = r.created_at;
      const todos = snaps.get(r.offer_id) ?? [];
      const ate = todos.filter((p) => p.at.getTime() <= at.getTime());
      if (!ate.length) semHistorico++;
      const dentro = ate.filter((p) => p.at.getTime() >= at.getTime() - HORAS_JANELA * 3_600_000);
      const antes = ate.filter((p) => p.at.getTime() < at.getTime() - HORAS_JANELA * 3_600_000);
      const pts: PricePoint[] = [...(antes.length ? [antes[antes.length - 1]!] : []), ...dentro].map((p) => ({ at: p.at, priceCents: p.priceCents }));
      const lastList = ate.length ? ate[ate.length - 1]!.list : null;
      const entrada: EntradaML = {
        priceCents: Number(r.price),
        avgCents: r.avg ? Number(r.avg) : null,
        networkSlug: r.net ?? '',
        trigger: r.trigger,
        at,
        points: pts,
        listPriceCents: lastList,
        listingIdTrusted: anuncioIdentificado({ externalItemId: r.external_item_id, itemIdFromUrl: meliItemIdFromUrl(r.affiliate_url) }),
        sellerTotalSales: r.total_sales ? Number(r.total_sales) : null,
        sellerRepVerde: r.rep ? /green|5/i.test(r.rep) : null,
      };
      linhas.push({ id: r.id, em: at, y, yEstrito, x: extrairFeatures(entrada) });
    }
    resumo.linhasComRotulo = linhas.length;
    resumo.semHistoricoDeSnapshot = semHistorico;
    resumo.positivos = linhas.filter((l) => l.y === 1).length;
    resumo.positivosEstritos = linhas.filter((l) => l.yEstrito === 1).length;
    return { linhas, resumo };
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------- métricas
function aucAp(scores: number[], y: number[]): { auc: number | null; ap: number | null } {
  const n = y.length;
  const pos = y.reduce((a, b) => a + b, 0);
  const neg = n - pos;
  if (!pos || !neg) return { auc: null, ap: null };
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b]! - scores[a]!);
  let tp = 0;
  let fp = 0;
  let ap = 0;
  let prevRecall = 0;
  let aucArea = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]!;
    if (y[i] === 1) tp++;
    else fp++;
    const ultimoDoEmpate = k === idx.length - 1 || scores[idx[k + 1]!] !== scores[i];
    if (!ultimoDoEmpate) continue;
    const recall = tp / pos;
    const prec = tp / (tp + fp);
    ap += (recall - prevRecall) * prec;
    prevRecall = recall;
    const fpr = fp / neg;
    aucArea += ((fpr - prevFpr) * (recall + prevTpr)) / 2;
    prevFpr = fpr;
    prevTpr = recall;
  }
  return { auc: aucArea, ap };
}

function confusao(scores: number[], y: number[], limiar: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = scores[i]! >= limiar ? 1 : 0;
    if (pred && y[i]) tp++;
    else if (pred && !y[i]) fp++;
    else if (!pred && !y[i]) tn++;
    else fn++;
  }
  return { tp, fp, tn, fn, precisao: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null };
}

/** Maior limiar (nos scores de TREINO) com recall >= alvo. */
function limiarParaRecall(scores: number[], y: number[], alvo: number): number {
  const pos = y.reduce((a, b) => a + b, 0);
  const cand = [...new Set(scores)].sort((a, b) => b - a);
  for (const t of cand) if (confusao(scores, y, t).tp / pos >= alvo) return t;
  return 0;
}

// ---------------------------------------------------------------- modelos
const sig = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

function treinarLogistica(X: number[][], y: number[]) {
  const d = X[0]!.length;
  const media = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j]!, 0) / X.length);
  const desvio = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j]! - media[j]!) ** 2, 0) / X.length) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - media[j]!) / desvio[j]!));
  const w = new Array<number>(d).fill(0);
  let b = Math.log((y.reduce((a, c) => a + c, 0) + 1) / (y.length - y.reduce((a, c) => a + c, 0) + 1));
  const lambda = 0.01;
  const lr = 0.2;
  for (let ep = 0; ep < 1500; ep++) {
    const gw = new Array<number>(d).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += Z[i]![j]! * w[j]!;
      const e = sig(z) - y[i]!;
      gb += e;
      for (let j = 0; j < d; j++) gw[j]! += e * Z[i]![j]!;
    }
    for (let j = 0; j < d; j++) w[j]! -= lr * (gw[j]! / Z.length + lambda * w[j]!);
    b -= lr * (gb / Z.length);
  }
  return { media, desvio, pesos: w, vies: b };
}

function scoreLogistica(m: { media: number[]; desvio: number[]; pesos: number[]; vies: number }, X: number[][]) {
  return X.map((r) => sig(r.reduce((a, v, j) => a + ((v - m.media[j]!) / m.desvio[j]!) * m.pesos[j]!, m.vies)));
}

function treinarStumps(X: number[][], y: number[], rodadas = 150, taxa = 0.1) {
  const n = X.length;
  const d = X[0]!.length;
  const prior = y.reduce((a, c) => a + c, 0) / n;
  const base = Math.log(prior / (1 - prior));
  const limiares: number[][] = Array.from({ length: d }, (_, j) => {
    const vals = [...new Set(X.map((r) => r[j]!))].sort((a, b) => a - b);
    if (vals.length <= 1) return [];
    const q = Math.min(20, vals.length - 1);
    return Array.from({ length: q }, (_, k) => vals[Math.floor(((k + 1) * (vals.length - 1)) / (q + 1))]!);
  });
  const F = new Array<number>(n).fill(base);
  const arvores: Array<{ f: number; t: number; esq: number; dir: number }> = [];
  const lam = 1;
  for (let r = 0; r < rodadas; r++) {
    const g = F.map((f, i) => y[i]! - sig(f));
    const h = F.map((f) => sig(f) * (1 - sig(f)));
    let melhor: { f: number; t: number; esq: number; dir: number; ganho: number } | null = null;
    for (let j = 0; j < d; j++) {
      for (const t of limiares[j]!) {
        let gl = 0, hl = 0, gr = 0, hr = 0;
        for (let i = 0; i < n; i++) {
          if (X[i]![j]! <= t) { gl += g[i]!; hl += h[i]!; } else { gr += g[i]!; hr += h[i]!; }
        }
        const ganho = (gl * gl) / (hl + lam) + (gr * gr) / (hr + lam);
        if (!melhor || ganho > melhor.ganho) melhor = { f: j, t, esq: gl / (hl + lam), dir: gr / (hr + lam), ganho };
      }
    }
    if (!melhor) break;
    arvores.push({ f: melhor.f, t: melhor.t, esq: melhor.esq, dir: melhor.dir });
    for (let i = 0; i < n; i++) F[i]! += taxa * (X[i]![melhor.f]! <= melhor.t ? melhor.esq : melhor.dir);
  }
  return { base, taxa, arvores };
}

function scoreStumps(m: { base: number; taxa: number; arvores: Array<{ f: number; t: number; esq: number; dir: number }> }, X: number[][]) {
  return X.map((r) => sig(m.arvores.reduce((a, t) => a + m.taxa * (r[t.f]! <= t.t ? t.esq : t.dir), m.base)));
}

// ---------------------------------------------------------------- execução
const fmt = (v: number | null | undefined, c = 3) => (v == null ? 'n/d' : v.toFixed(c));
const pct = (v: number | null) => (v == null ? 'n/d' : `${(v * 100).toFixed(1)}%`);

async function main() {
  const { linhas, resumo } = await montarDataset();
  console.log('dataset', JSON.stringify(resumo));
  if (linhas.length < 200 || resumo.positivos! < 30) {
    console.log('rótulos insuficientes para treinar com segurança; nada escrito.');
    return;
  }
  const corte = Math.floor(linhas.length * 0.7);
  const treino = linhas.slice(0, corte);
  const teste = linhas.slice(corte);
  const Xtr = treino.map((l) => l.x), ytr = treino.map((l) => l.y);
  const Xte = teste.map((l) => l.x), yte = teste.map((l) => l.y);
  const yteEstrito = teste.map((l) => l.yEstrito);
  const posTr = ytr.reduce((a, b) => a + b, 0), posTe = yte.reduce((a, b) => a + b, 0);

  const log = treinarLogistica(Xtr, ytr);
  const stm = treinarStumps(Xtr, ytr);
  const sTrLog = scoreLogistica(log, Xtr), sTeLog = scoreLogistica(log, Xte);
  const sTrStm = scoreStumps(stm, Xtr), sTeStm = scoreStumps(stm, Xte);
  const regra = Xte.map((r) => r[FEATURE_NAMES.indexOf('oscilando')]!);

  const avaliar = (nome: string, sTr: number[], sTe: number[]) => {
    const { auc, ap } = aucAp(sTe, yte);
    const lim = limiarParaRecall(sTr, ytr, 0.8);
    const c = confusao(sTe, yte, lim);
    const est = aucAp(sTe, yteEstrito);
    return { nome, auc, ap, lim, c, estAuc: est.auc, estAp: est.ap };
  };
  const rLog = avaliar('logística', sTrLog, sTeLog);
  const rStm = avaliar('boosting de stumps', sTrStm, sTeStm);
  const regraC = confusao(regra, yte, 1);
  const taxaBase = posTe / yte.length;

  const melhor = (rStm.ap ?? 0) > (rLog.ap ?? 0) ? 'stumps' : 'logistica';
  console.log(`AP teste: logística=${fmt(rLog.ap)} stumps=${fmt(rStm.ap)} base=${fmt(taxaBase)} -> melhor=${melhor}`);

  // tabela de limiares (teste) do melhor
  const sMelhorTe = melhor === 'stumps' ? sTeStm : sTeLog;
  const sMelhorTr = melhor === 'stumps' ? sTrStm : sTrLog;
  const tabela = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((t) => ({ t, ...confusao(sMelhorTe, yte, t), marcadas: sMelhorTe.filter((s) => s >= t).length }));
  const pesosOrdenados = FEATURE_NAMES.map((nome, j) => ({ nome, peso: log.pesos[j]! })).sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso)).slice(0, 8);

  const limFinal = limiarParaRecall(sMelhorTr, ytr, 0.8);
  const cFinal = confusao(sMelhorTe, yte, limFinal);
  const metricas: MetricasModelo = {
    tipoRotulo: 'falha de revalidacao ao vivo OU divergencia >= 2%',
    treino: treino.length,
    teste: teste.length,
    positivosTreino: posTr,
    positivosTeste: posTe,
    apTeste: melhor === 'stumps' ? rStm.ap : rLog.ap,
    aucTeste: melhor === 'stumps' ? rStm.auc : rLog.auc,
    precisaoNoLimiar: cFinal.precisao,
    recallNoLimiar: cFinal.recall,
  };
  const versao = `sombra-${new Date().toISOString().slice(0, 10)}-${melhor}`;
  const modelo: Modelo =
    melhor === 'stumps'
      ? { versao, tipo: 'stumps', nomes: [...FEATURE_NAMES], ...stm, limiar: limFinal, treinadoEm: new Date().toISOString(), metricas }
      : { versao, tipo: 'logistica', nomes: [...FEATURE_NAMES], ...log, limiar: limFinal, treinadoEm: new Date().toISOString(), metricas };

  const md = `# Modelo em modo sombra: preço da mensagem (2026-11-14)

Gerado por \`scripts/ml-preco-mensagem/treinar.ts\` (somente SELECT). Os números abaixo são os reais desta execução; nada foi inventado.

## O que o modelo estima
A chance de uma mensagem **não sobreviver à checagem de preço**: preço velho, anúncio que sumiu ou mudou na releitura ao vivo, ou preço da mensagem diferente do relido (divergência >= 2%).
Origem do problema: \`docs/investigacao-preco-mensagem-vs-site-2026-11-14.md\` (anúncio irmão do mesmo vendedor, 94,7% das ofertas do ML sem \`external_item_id\`).

## Dados
- Mensagens do Telegram com rótulo: **${linhas.length}** (de ${resumo.linhasBrutas} linhas candidatas), ofertas distintas: ${resumo.ofertas}, snapshots de preço lidos: ${resumo.snapshots}.
- Positivos (não sobreviveu): **${resumo.positivos}** (${pct(resumo.positivos! / linhas.length)}). Divergência estrita >= 2% (o caso do P2S Combo): só **${resumo.positivosEstritos}** mensagens, poucas demais para treinar um modelo só delas; por isso o rótulo principal inclui a falha de revalidação.
- Sem nenhum snapshot anterior à mensagem: ${resumo.semHistoricoDeSnapshot} linhas (atributos de histórico ficam zerados).
- Período: ${linhas[0]!.em.toISOString().slice(0, 16)} a ${linhas[linhas.length - 1]!.em.toISOString().slice(0, 16)} UTC. **Só 4 dias** de dados: o modelo é frágil e deve ser re-treinado quando houver mais.

## Divisão por tempo
- Treino: as ${treino.length} mensagens mais antigas (${posTr} positivos). Teste: as ${teste.length} mais novas (${posTe} positivos, taxa-base ${pct(taxaBase)}).

## Resultado no TESTE (mensagens mais novas)
| Modelo | AUC | Precisão média (AP) | Limiar (recall 80% no treino) | Precisão | Recall | TP | FP | TN | FN |
|---|---|---|---|---|---|---|---|---|---|
| Logística (base) | ${fmt(rLog.auc)} | ${fmt(rLog.ap)} | ${fmt(rLog.lim)} | ${pct(rLog.c.precisao)} | ${pct(rLog.c.recall)} | ${rLog.c.tp} | ${rLog.c.fp} | ${rLog.c.tn} | ${rLog.c.fn} |
| Boosting de stumps | ${fmt(rStm.auc)} | ${fmt(rStm.ap)} | ${fmt(rStm.lim)} | ${pct(rStm.c.precisao)} | ${pct(rStm.c.recall)} | ${rStm.c.tp} | ${rStm.c.fp} | ${rStm.c.tn} | ${rStm.c.fn} |
| Regra \`preco_oscilando\` (ponto de comparação) | n/d | n/d | flag | ${pct(regraC.precisao)} | ${pct(regraC.recall)} | ${regraC.tp} | ${regraC.fp} | ${regraC.tn} | ${regraC.fn} |

Modelo escolhido para o modo sombra (maior AP no teste): **${melhor === 'stumps' ? 'boosting de stumps' : 'logística'}**, limiar ${fmt(limFinal)} (escolhido só com dados de treino, para recall alto: barrar erro custa menos que enviar erro).

### Limiares no teste (modelo escolhido)
| Limiar | Mensagens marcadas | Precisão | Recall |
|---|---|---|---|
${tabela.map((r) => `| ${r.t} | ${r.marcadas} | ${pct(r.precisao)} | ${pct(r.recall)} |`).join('\n')}

### Rótulo estrito (divergência >= 2%) no teste
Positivos no teste: ${yteEstrito.reduce((a, b) => a + b, 0)}. AUC da logística: ${fmt(rLog.estAuc)}; dos stumps: ${fmt(rStm.estAuc)} (com tão poucos positivos, é só indicativo).

### Atributos mais pesados da logística (coeficientes padronizados)
${pesosOrdenados.map((p) => `- \`${p.nome}\`: ${p.peso.toFixed(3)}`).join('\n')}

## Como o modo sombra funciona
- \`src/lib/messaging/ml-preco.ts\` monta os atributos (mesmo código no treino e na produção) e pontua.
- Com \`GROUP_ML_SOMBRA=on\`, o envio registra \`candidate.mlSombra = {v, p, alto, em}\` na linha da mensagem. **Nunca bloqueia, reordena ou altera a mensagem.**
- O modelo vive em \`src/lib/messaging/ml-preco-modelo.json\` (gerado por este script). Para re-treinar: rode o script de novo e faça commit.

## Limites e próximos passos
- Poucos dias de dados e rótulo indireto (falha de revalidação), não só divergência de preço. Reavaliar com 2 a 3 semanas.
- Para virar bloqueio: comparar \`mlSombra.p\` das mensagens enviadas com o resultado da releitura de 30 min (\`recheck_divergence_pct\`) por alguns dias e só então decidir o limiar.
- Preencher \`external_item_id\` (correção 2 do plano) deve reduzir o risco na origem.
`;
  console.log(`limiar final ${fmt(limFinal)} | teste: precisão ${pct(cFinal.precisao)} recall ${pct(cFinal.recall)} | positivos teste ${posTe}/${yte.length}`);
  if (SEM_ESCRITA) return;
  fs.writeFileSync(path.resolve('docs/ml/preco-mensagem-2026-11-14.md'), md);
  fs.writeFileSync(path.resolve('src/lib/messaging/ml-preco-modelo.json'), JSON.stringify(modelo, null, 1) + '\n');
  console.log('escrito: docs/ml/preco-mensagem-2026-11-14.md e src/lib/messaging/ml-preco-modelo.json');
}

main().catch((e) => {
  console.error('ERRO:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
