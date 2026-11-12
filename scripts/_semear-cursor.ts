/**
 * Adaptador de arquivo dos CURSORES da fila de semeadura (logica pura em src/lib/catalog/vertical/seed-schedule.ts).
 * Estado local (NAO e banco): backup/dados/semear-cursor.json. Escrita atomica (tmp + rename).
 */
import fs from 'node:fs';
import path from 'node:path';
import { emptyCursorState, type CursorState } from '../src/lib/catalog/vertical/seed-schedule';

export const CURSOR_FILE = path.resolve('backup', 'dados', 'semear-cursor.json');

export function loadCursors(): CursorState {
  if (!fs.existsSync(CURSOR_FILE)) return emptyCursorState();
  try {
    const j = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    if (j?.version === 1 && j.segments && typeof j.segments === 'object') return j as CursorState;
  } catch {
    // arquivo corrompido: recomeca (os cursores so evitam retrabalho; o cache de 404 e a duplicata protegem a cota)
  }
  return emptyCursorState();
}

export function saveCursors(st: CursorState): void {
  fs.mkdirSync(path.dirname(CURSOR_FILE), { recursive: true });
  const tmp = `${CURSOR_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2), 'utf8');
  fs.renameSync(tmp, CURSOR_FILE);
}
