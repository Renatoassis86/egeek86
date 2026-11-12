// Modulo PURO: transforma o snapshot lido do banco em saude por no, linhas de job e alertas. Roda no cliente a cada
// atualizacao (usa o "agora" do navegador so para as idades; o instante da consulta vem do servidor).
import {
  JOBS_ESPERADOS, acharEsperado, fmtMin, pior, saudeDoJob,
  type FluxoSnapshot, type JobEsperado, type JobRow, type NoId, type Saude,
} from './modelo';

export interface JobAvaliado {
  chave: string;
  rotulo: string;
  no: NoId | null;
  cadenciaMin: number | null;
  saude: Saude;
  motivo: string;
  linha: JobRow | null;
}

export interface NoAvaliado { id: NoId; saude: Saude; detalhe: string }
export interface Alerta { id: string; severidade: 'critico' | 'atencao' | 'info'; titulo: string; detalhe: string; href?: string }

const MIN = 60_000;
const idadeMin = (iso: string | null, agora: number) => (iso ? (agora - new Date(iso).getTime()) / MIN : null);

function escolher(linhas: JobRow[]): JobRow | null {
  if (!linhas.length) return null;
  const maisRecente = [...linhas].sort((a, b) => (b.lastStartedAt ?? '').localeCompare(a.lastStartedAt ?? ''))[0];
  const ok = linhas.map((l) => l.lastOkAt).filter((x): x is string => !!x).sort().pop() ?? null;
  return { ...maisRecente, lastOkAt: ok, runs24h: linhas.reduce((a, l) => a + l.runs24h, 0), errors24h: linhas.reduce((a, l) => a + l.errors24h, 0), runningStale: linhas.reduce((a, l) => a + l.runningStale, 0) };
}

export function avaliarJobs(s: FluxoSnapshot, agora: number): JobAvaliado[] {
  const linhas = s.jobs.dados?.linhas ?? [];
  const out: JobAvaliado[] = [];
  const usadas = new Set<JobRow>();
  for (const e of JOBS_ESPERADOS) {
    const casadas = linhas.filter((l) => acharEsperado(l.job) === e && (l.job === e.chave || l.job.startsWith(e.chave)));
    casadas.forEach((c) => usadas.add(c));
    const linha = escolher(casadas);
    if (!linha) {
      out.push({ chave: e.chave, rotulo: e.rotulo, no: e.no, cadenciaMin: e.cadenciaMin, saude: 'sem_dado', linha: null,
        motivo: e.opcional ? 'sem execução nas últimas 24 h (depende de flag/loop; pode estar desligado)' : e.cadenciaMin == null ? 'sem execução nas últimas 24 h' : 'nenhuma execução nas últimas 24 h' });
      continue;
    }
    const a = saudeDoJob(linha, e.cadenciaMin, agora);
    out.push({ chave: e.chave, rotulo: e.rotulo, no: e.no, cadenciaMin: e.cadenciaMin, saude: a.saude, motivo: a.motivo, linha });
  }
  // Jobs que existem em collector_runs mas nao estao na tabela de cadencias: aparecem sem pontuar atraso.
  for (const l of linhas) {
    if (usadas.has(l)) continue;
    out.push({ chave: l.job, rotulo: l.job, no: null, cadenciaMin: null, linha: l,
      saude: l.lastStatus === 'error' ? 'atencao' : l.lastOkAt ? 'ok' : 'sem_dado',
      motivo: (l.lastStatus === 'error' ? 'última execução terminou em erro; ' : '') + 'fora da tabela de cadências (sem atraso esperado definido)' });
  }
  return out;
}

export function avaliarNos(s: FluxoSnapshot, jobs: JobAvaliado[], agora: number): NoAvaliado[] {
  const por = (id: NoId) => jobs.filter((j) => j.no === id);
  const doJobs = (id: NoId): NoAvaliado => {
    const js = por(id).filter((j) => j.cadenciaMin != null || j.saude === 'critico');
    if (!s.jobs.ok) return { id, saude: 'sem_dado', detalhe: 'collector_runs indisponível agora' };
    if (!js.length) return { id, saude: 'sem_dado', detalhe: 'sem fonte de execução' };
    const comDado = js.filter((j) => j.saude !== 'sem_dado');
    if (!comDado.length) return { id, saude: 'sem_dado', detalhe: 'sem execução registrada nas últimas 24 h' };
    let saude: Saude = 'ok';
    for (const j of comDado) saude = pior(saude, j.saude);
    const faltam = js.length - comDado.length;
    if (faltam > 0 && saude === 'ok') saude = 'atencao';
    const pior1 = [...comDado].sort((a, b) => (a.saude === b.saude ? 0 : pior(a.saude, b.saude) === a.saude ? -1 : 1))[0];
    return { id, saude, detalhe: faltam > 0 ? `${faltam} de ${js.length} jobs sem execução em 24 h; ${pior1.rotulo}: ${pior1.motivo}` : `${pior1.rotulo}: ${pior1.motivo}` };
  };

  const nos: NoAvaliado[] = (['extracao-ml', 'extracao-shopee', 'extracao-amazon', 'extracao-plus', 'cupons'] as NoId[]).map(doJobs);

  // Banco: transacao presa e falha de leitura.
  {
    const falhas = [s.jobs, s.mensagens, s.classificacao, s.ofertas, s.idleTx, s.snapshots].filter((b) => !b.ok).length;
    const tx = s.idleTx.dados;
    let saude: Saude = 'ok';
    let detalhe = 'leituras do painel respondendo';
    if (falhas >= 3) { saude = 'critico'; detalhe = `${falhas} de 6 leituras falharam`; }
    else if (falhas > 0) { saude = 'atencao'; detalhe = `${falhas} de 6 leituras falharam`; }
    if (tx && tx.maisLongaS != null && tx.maisLongaS > 120) { saude = pior(saude, 'atencao'); detalhe = `transação presa há ${fmtMin(tx.maisLongaS / 60)}`; }
    if (tx && tx.maisLongaS != null && tx.maisLongaS > 600) saude = 'critico';
    nos.push({ id: 'banco', saude, detalhe });
  }

  // Catalogo e identidade: jobs de semeadura/descoberta/fila.
  {
    const base = doJobs('catalogo');
    const q = s.classificacao.dados;
    nos.push({ ...base, detalhe: q ? `${base.detalhe}; fila de classificação: ${q.pendentes.toLocaleString('pt-BR')} pendentes` : base.detalhe });
  }

  // Preco e medias: jobs + idade da estatistica V1.
  {
    const base = doJobs('preco');
    const idade = idadeMin(s.snapshots.dados?.statsEm ?? null, agora);
    let saude = base.saude; let detalhe = base.detalhe;
    if (idade != null) {
      const st: Saude = idade > 120 ? 'critico' : idade > 60 ? 'atencao' : 'ok';
      saude = saude === 'sem_dado' ? st : pior(saude, st);
      detalhe = `estatística V1 calculada há ${fmtMin(idade)}; ${base.detalhe}`;
    }
    nos.push({ id: 'preco', saude, detalhe });
  }

  // Mensagens: so o que o banco mostra (nao ha job em collector_runs para o cron group-messages).
  {
    const m = s.mensagens.dados;
    if (!s.mensagens.ok || !m) nos.push({ id: 'mensagens', saude: 'sem_dado', detalhe: 'group_messages indisponível agora' });
    else if (m.enviandoPresos > 0) nos.push({ id: 'mensagens', saude: 'critico', detalhe: `${m.enviandoPresos} mensagem(ns) em "enviando" há mais de 10 min` });
    else if (!m.porStatus.length) nos.push({ id: 'mensagens', saude: 'sem_dado', detalhe: 'nenhuma mensagem criada nas últimas 24 h' });
    else nos.push({ id: 'mensagens', saude: 'ok', detalhe: `última criada há ${fmtMin(idadeMin(m.ultimaCriadaEm, agora) ?? 0)}; nenhuma presa` });
  }

  // Front: vitrine (showcase) + job de showcase.
  {
    const base = doJobs('front');
    const idade = idadeMin(s.snapshots.dados?.showcaseMaisRecenteEm ?? null, agora);
    let saude = base.saude; let detalhe = base.detalhe;
    if (idade != null) {
      const st: Saude = idade > 90 ? 'critico' : idade > 45 ? 'atencao' : 'ok';
      saude = saude === 'sem_dado' ? st : pior(saude, st);
      detalhe = `vitrine atualizada há ${fmtMin(idade)}; ${base.detalhe}`;
    }
    nos.push({ id: 'front', saude, detalhe });
  }
  return nos;
}

export function montarAlertas(s: FluxoSnapshot, jobs: JobAvaliado[], agora: number): Alerta[] {
  const a: Alerta[] = [];
  if (!s.jobs.ok) a.push({ id: 'runs-indisp', severidade: 'critico', titulo: 'collector_runs indisponível agora', detalhe: 'A leitura falhou ou estourou o tempo; os nós de execução ficam sem dado.' });
  else if ((s.jobs.dados?.totalRuns24h ?? 0) === 0) {
    const u = s.jobs.dados?.ultimoRegistroEm;
    a.push({ id: 'runs-vazia', severidade: 'critico', titulo: 'collector_runs sem registro nas últimas 24 h',
      detalhe: u ? `Último registro em ${new Date(u).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Verifique a flag COLLECTOR_RUNS=1.` : 'Tabela vazia ou flag COLLECTOR_RUNS desligada. Isto é alerta, não zero.' });
  }
  for (const j of jobs) {
    if (j.saude === 'critico' && j.linha) a.push({ id: `job:${j.chave}`, severidade: 'critico', titulo: `${j.rotulo}: ${j.motivo}`, detalhe: `Execuções 24 h: ${j.linha.runs24h}, com erro: ${j.linha.errors24h}.`, href: '/admin/redes' });
    else if (j.saude === 'atencao') a.push({ id: `job:${j.chave}`, severidade: 'atencao', titulo: `${j.rotulo}: ${j.motivo}`, detalhe: j.cadenciaMin != null ? 'Atraso entre 1,25x e 2x a cadência esperada.' : 'Job sem cadência definida na tabela do painel; confira se ainda é usado.' });
    else if (j.saude === 'sem_dado' && !(j.cadenciaMin == null) && s.jobs.ok && (s.jobs.dados?.totalRuns24h ?? 0) > 0 && !JOBS_ESPERADOS.find((e) => e.chave === j.chave)?.opcional)
      a.push({ id: `job:${j.chave}`, severidade: 'critico', titulo: `${j.rotulo}: nenhuma execução em 24 h`, detalhe: 'Job esperado sem registro no período (cron parado ou sem gravar collector_runs).' });
    if (j.linha && j.linha.runningStale > 0) a.push({ id: `abandon:${j.chave}`, severidade: 'atencao', titulo: `${j.rotulo}: ${j.linha.runningStale} execução(ões) abandonada(s) nas últimas 24 h`, detalhe: `Ficaram em "running" por mais de 10 min sem finalizar (função cortada pelo tempo ou queda).` });
  }
  const tx = s.idleTx.dados;
  if (tx && tx.n > 0 && tx.maisLongaS != null && tx.maisLongaS > 120) a.push({ id: 'idle-tx', severidade: tx.maisLongaS > 600 ? 'critico' : 'atencao', titulo: `${tx.n} transação(ões) presa(s) (idle in transaction)`, detalhe: `A mais longa há ${fmtMin(tx.maisLongaS / 60)}. Meta da fila: nenhuma acima de 120 s.` });
  const m = s.mensagens.dados;
  if (m && m.enviandoPresos > 0) a.push({ id: 'enviando', severidade: 'critico', titulo: `${m.enviandoPresos} mensagem(ns) presa(s) em "enviando"`, detalhe: 'A trava de envio expira em 10 min; passou disso.', href: '/admin/mensagens' });
  const sn = s.snapshots.dados;
  if (sn) {
    const v = idadeMin(sn.showcaseMaisRecenteEm, agora);
    if (v != null && v > 45) a.push({ id: 'showcase', severidade: v > 90 ? 'critico' : 'atencao', titulo: `Vitrine atualizada há ${fmtMin(v)}`, detalhe: 'Limite do alerta: 45 min (chave mais recente do showcase). Acima de 30 a 60 min as páginas caem em cálculo ao vivo.' });
    const st = idadeMin(sn.statsEm, agora);
    if (st != null && st > 60) a.push({ id: 'stats', severidade: st > 120 ? 'critico' : 'atencao', titulo: `Estatística de preço (V1) calculada há ${fmtMin(st)}`, detalhe: 'Limite do alerta: 60 min.' });
  }
  const o = s.ofertas.dados;
  if (o) {
    if (o.amazonAtivas > 0 && o.amazonFrescas40 === 0) a.push({ id: 'amazon-fresca', severidade: 'atencao', titulo: 'Nenhuma oferta Amazon com preço confirmado nos últimos 40 min', detalhe: 'A aba assistida pode estar parada (o loop roda em janelas de ~85 min a cada 2 h).' });
    if (o.mlLinksPendentes > 0) a.push({ id: 'ml-links', severidade: 'info', titulo: `${o.mlLinksPendentes.toLocaleString('pt-BR')} ofertas ML ativas sem link meli.la`, detalhe: 'Item 8 da fila: o loop resolve até zerar.' });
  }
  const c = s.classificacao.dados;
  if (c && c.pendentes > 0) a.push({ id: 'classificacao', severidade: 'info', titulo: `${c.pendentes.toLocaleString('pt-BR')} itens aguardando classificação`, detalhe: 'Aguarda decisão do dono (item 11 da fila).' });
  const p = s.plataformaDesconhecida.dados;
  if (p && p.n > 0) a.push({ id: 'unknown', severidade: 'atencao', titulo: `${p.n.toLocaleString('pt-BR')} masters de games com plataforma "unknown"`, detalhe: 'Esconde duplicatas reais; derivar do título (regra do AGENTS.md).', href: '/admin/catalogo-revisao' });
  const ordem = { critico: 0, atencao: 1, info: 2 } as const;
  return a.sort((x, y) => ordem[x.severidade] - ordem[y.severidade]);
}

export type { JobEsperado };
