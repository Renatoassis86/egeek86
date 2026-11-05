/** Teste de tabela do critério do período contaminado (src/lib/pricing/collision-window.ts). Sem banco. */
import { contaminationStartDay, fullyExcludedDays, inContaminatedWindow, isAlternatingDay } from '../src/lib/pricing/collision-window';
import { addDays } from '../src/lib/pricing/daily-state';

let fails = 0;
const check = (n: string, c: boolean) => { if (!c) { fails++; console.error('FALHOU:', n); } };

check('estável não alterna', !isAlternatingDay({ day: 'd', cycles: 100, cyclesGe2: 2, cyclesGe3: 0 }));
check('1 ciclo com 3 valores alterna', isAlternatingDay({ day: 'd', cycles: 9, cyclesGe2: 4, cyclesGe3: 1 }));
check('50% dos ciclos com 2 valores alterna (>=10 ciclos)', isAlternatingDay({ day: 'd', cycles: 20, cyclesGe2: 10, cyclesGe3: 0 }));
check('49% não alterna', !isAlternatingDay({ day: 'd', cycles: 100, cyclesGe2: 49, cyclesGe3: 0 }));
check('poucos ciclos (<10) só pela regra dos 3 valores', !isAlternatingDay({ day: 'd', cycles: 5, cyclesGe2: 5, cyclesGe3: 0 }));
check('início = primeiro dia alternante', contaminationStartDay([
  { day: '2026-11-03', cycles: 50, cyclesGe2: 1, cyclesGe3: 0 },
  { day: '2026-11-02', cycles: 50, cyclesGe2: 30, cyclesGe3: 0 },
  { day: '2026-11-04', cycles: 50, cyclesGe2: 30, cyclesGe3: 2 },
]) === '2026-11-02');
check('nunca alternou => null', contaminationStartDay([{ day: '2026-11-03', cycles: 50, cyclesGe2: 1, cyclesGe3: 0 }]) === null);
check('dias excluídos até a véspera do deploy', fullyExcludedDays('2026-11-02', '2026-11-05', addDays).join() === '2026-11-02,2026-11-03,2026-11-04');
check('início no dia do deploy => nenhum dia inteiro', fullyExcludedDays('2026-11-05', '2026-11-05', addDays).length === 0);
const s = new Date('2026-11-02T03:00:00Z'), dep = new Date('2026-11-05T14:08:00Z');
check('cotação antes do deploy está na janela', inContaminatedWindow(new Date('2026-11-05T14:05:00Z'), s, dep));
check('cotação após o deploy fica', !inContaminatedWindow(new Date('2026-11-05T14:10:01Z'), s, dep));
check('cotação antes do início fica', !inContaminatedWindow(new Date('2026-11-02T02:59:59Z'), s, dep));
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
console.log('test-collision-window: OK');
