/**
 * Adaptador de arquivo do orcamento diario da semeadura (logica pura em src/lib/catalog/vertical/seed-budget.ts).
 * Estado local (NAO e banco): backup/dados/semear-estado.json. Escrita atomica (tmp + rename). Cada cobranca regrava o arquivo
 * (1 chamada ao ML por vez, entao o custo e desprezivel) e RELE o disco antes, para que duas execucoes simultaneas nao se pisem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { backfillFromHistory, charge, dayKeySP, emptyState, markNotFound, pruneNotFound, type BudgetRun, type BudgetState } from '../src/lib/catalog/vertical/seed-budget';
import { DailyBudgetExceeded } from '../src/lib/catalog/vertical/ml-api';

export const STATE_FILE = path.resolve('backup', 'dados', 'semear-estado.json');
const HIST_DIR = path.resolve('backup', 'dados');

export function loadState(): BudgetState {
  let st: BudgetState = emptyState();
  if (fs.existsSync(STATE_FILE)) {
    try {
      const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (j?.version === 1 && j.days && j.notFound) st = j as BudgetState;
    } catch {
      // arquivo corrompido: recomeca do historico (o backfill abaixo recupera o consumo das rodadas antigas)
    }
  }
  // Historico das rodadas anteriores a este arquivo (plano.json de cada execucao) para os dias ainda sem registro.
  const hist: Array<{ stamp: string; calls: number; apply: boolean }> = [];
  if (fs.existsSync(HIST_DIR)) {
    for (const d of fs.readdirSync(HIST_DIR)) {
      const m = /^semear-vertical-(.+)$/.exec(d);
      if (!m) continue;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(HIST_DIR, d, 'plano.json'), 'utf8'));
        if (Array.isArray(p?.chamadas)) hist.push({ stamp: m[1], calls: p.chamadas.length, apply: !!p.apply });
      } catch {
        // diretorio sem plano.json (execucao interrompida): ignora
      }
    }
  }
  return backfillFromHistory(st, hist);
}

export function saveState(st: BudgetState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

/** Cobra 1 chamada no estado em disco (relido). Lanca DailyBudgetExceeded se estouraria o teto do dia. */
export function chargeOne(run: { runId: string; startedAt: string; mode: BudgetRun['mode'] }, cap: number): void {
  const st = loadState();
  const next = charge(st, dayKeySP(new Date()), run, 1, cap);
  if (!next) throw new DailyBudgetExceeded(`teto diario de ${cap} chamadas da semeadura atingido (${dayKeySP(new Date())})`);
  saveState(next);
}

export function rememberNotFound(catalogId: string): void {
  const now = new Date();
  saveState(pruneNotFound(markNotFound(loadState(), catalogId, now), now));
}
