/**
 * PORTÃO ÚNICO (METODOLOGIA_IA.md, seção 7): roda typecheck + todos os `test:*` do package.json e diz, numa tabela, o que passa, o que falha e o que foi pulado.
 *
 *   npm run gate                 -> rápido: typecheck + testes puros (sem banco). Antes de TODO commit.
 *   npm run gate -- --completo   -> inclui os testes que exigem .env.local/banco (rodada diária, antes de deploy).
 *   npm run gate -- --so=preco   -> só os `test:*` cujo nome contém "preco" (rodada de módulo durante o trabalho).
 *   npm run gate -- --sem-tsc    -> pula o typecheck (use só em rodada de módulo).
 *   npm run gate -- --json       -> saída em JSON (para o vigia e para o relatório de 6 h).
 *
 * Regras: teste novo ligado ao package.json entra sozinho (descoberta por prefixo `test:`); teste que precisa de banco é detectado por
 * `--env-file` no comando; exceções vivem em docs/validado/gate.json (ignorar com motivo; nunca silenciosamente). Sai com código 1 se algo falhar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface Config { timeoutS?: number; ignorar?: Record<string, string> }
interface Linha { id: string; resultado: 'PASSOU' | 'FALHOU' | 'PULADO' | 'IGNORADO' | 'TEMPO'; seg: number; motivo?: string; fim?: string }

const args = process.argv.slice(2);
const completo = args.includes('--completo');
const semTsc = args.includes('--sem-tsc');
const json = args.includes('--json');
const so = (args.find((a) => a.startsWith('--so=')) ?? '').slice(5);

const raiz = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const cfgPath = path.join(raiz, 'docs', 'validado', 'gate.json');
const cfg: Config = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const timeoutMs = (cfg.timeoutS ?? 120) * 1000;

function rodar(script: string): { ok: boolean; seg: number; tempo: boolean; fim: string } {
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', script, '--silent'], { cwd: raiz, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
  const seg = Math.round((Date.now() - t0) / 100) / 10;
  const saida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split(/\r?\n/).filter(Boolean);
  const tempo = r.error != null && /ETIMEDOUT/.test(String((r.error as NodeJS.ErrnoException).code ?? r.error));
  return { ok: r.status === 0 && !r.error, seg, tempo, fim: saida.slice(-3).join(' | ').slice(0, 220) };
}

const linhas: Linha[] = [];
if (!semTsc && !so) {
  const r = rodar('typecheck');
  linhas.push({ id: 'typecheck', resultado: r.ok ? 'PASSOU' : r.tempo ? 'TEMPO' : 'FALHOU', seg: r.seg, fim: r.ok ? undefined : r.fim });
}
for (const [id, cmd] of Object.entries(pkg.scripts)) {
  if (!id.startsWith('test:')) continue;
  if (so && !id.includes(so)) continue;
  if (cfg.ignorar?.[id]) { linhas.push({ id, resultado: 'IGNORADO', seg: 0, motivo: cfg.ignorar[id] }); continue; }
  if (!completo && /--env-file/.test(cmd)) { linhas.push({ id, resultado: 'PULADO', seg: 0, motivo: 'exige .env.local/banco (use --completo)' }); continue; }
  const r = rodar(id);
  linhas.push({ id, resultado: r.ok ? 'PASSOU' : r.tempo ? 'TEMPO' : 'FALHOU', seg: r.seg, fim: r.ok ? undefined : r.fim });
}

// ÓRFÃOS (fila #134): todo scripts/test-*.ts que não está ligado a um `test:*` do package.json também roda no portão, por descoberta de arquivo.
// Teste que toca o banco (heurística no código) só roda no --completo, com --env-file. Vermelho conhecido fica em gate.json > ignorar ("orfao:<arquivo>") COM motivo.
const ligados = Object.values(pkg.scripts).join(' ');
const orfaos = fs.readdirSync(path.join(raiz, 'scripts')).filter((f) => /^test-.*\.ts$/.test(f) && !ligados.includes(`scripts/${f}`)).sort();
const tocaBanco = (f: string) => /_dup-shared|DATABASE_URL|from '(\.\.\/)+src\/db|@\/lib\/db|postgres\(/.test(fs.readFileSync(path.join(raiz, 'scripts', f), 'utf8'));
for (const f of orfaos) {
  const id = `orfao:${f}`;
  if (so && !f.includes(so)) continue;
  if (cfg.ignorar?.[id]) { linhas.push({ id, resultado: 'IGNORADO', seg: 0, motivo: cfg.ignorar[id] }); continue; }
  const banco = tocaBanco(f);
  if (banco && !completo) { linhas.push({ id, resultado: 'PULADO', seg: 0, motivo: 'toca o banco (use --completo)' }); continue; }
  const t0 = Date.now();
  const r = spawnSync('npx', ['tsx', '--conditions=react-server', ...(banco ? ['--env-file=.env.local'] : []), `scripts/${f}`], { cwd: raiz, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
  const seg = Math.round((Date.now() - t0) / 100) / 10;
  const tempo = r.error != null && /ETIMEDOUT/.test(String((r.error as NodeJS.ErrnoException).code ?? r.error));
  const fim = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ').slice(0, 220);
  const ok = r.status === 0 && !r.error;
  const saidaTotal = `${r.stdout ?? ''}
${r.stderr ?? ''}`;
  // Falhou só por falta de banco (a heurística estática não pegou): vira "exige banco", não vermelho.
  if (!ok && !completo && /ECONNREFUSED|DATABASE_URL|Transaction Pooler|password authentication/i.test(saidaTotal)) { linhas.push({ id, resultado: 'PULADO', seg, motivo: 'exige banco (use --completo)' }); continue; }
  linhas.push({ id, resultado: ok ? 'PASSOU' : tempo ? 'TEMPO' : 'FALHOU', seg, fim: ok ? undefined : fim });
}

const cont = (x: Linha['resultado']) => linhas.filter((l) => l.resultado === x).length;
const falhas = linhas.filter((l) => l.resultado === 'FALHOU' || l.resultado === 'TEMPO');
if (json) console.log(JSON.stringify({ modo: completo ? 'completo' : 'rapido', passou: cont('PASSOU'), falhou: falhas.length, pulado: cont('PULADO'), ignorado: cont('IGNORADO'), linhas }, null, 1));
else {
  for (const l of linhas) console.log(`${l.resultado.padEnd(8)} ${String(l.seg).padStart(6)}s  ${l.id}${l.motivo ? `  (${l.motivo})` : ''}${l.fim ? `\n          ${l.fim}` : ''}`);
  console.log(`\nPORTÃO ${completo ? 'COMPLETO' : 'RÁPIDO'}: ${cont('PASSOU')} passaram, ${falhas.length} falharam, ${cont('PULADO')} pulados, ${cont('IGNORADO')} ignorados.`);
  if (falhas.length) console.log('NÃO COMMITAR: corrija (ou prove que a falha já existia antes da sua mudança) e rode de novo.');
}
process.exit(falhas.length ? 1 : 0);
