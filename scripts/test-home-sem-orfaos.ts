/**
 * VIGIA DE ÓRFÃOS DA HOME (checklist #2; lição de 2026-11-13: um push importou arquivo que não estava no origin/main e quebrou o build). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-home-sem-orfaos.ts [--origin]
 * Só leitura (arquivos e `git`); nada é gravado.
 *
 * (a) IMPORT QUEBRADO: todo import ('@/...' ou relativo) de src/ aponta para arquivo existente. FALHA.
 * (b) IMPORT NÃO RASTREADO: o arquivo existe mas não está no índice do git (untracked): o build do Vercel não o terá. FALHA com --origin
 *     (modo pré-push); sem a opção é AVISO (trabalho em andamento de outro agente na mesma árvore).
 *     Com --origin, também confere contra origin/main (o que o deploy realmente enxerga); arquivo que só está no índice local
 *     (staged ou commitado e ainda não empurrado) vira AVISO "sai neste push": confirme que ele vai junto.
 * (c) COMPONENTE ÓRFÃO: arquivo de componente da home (vitrines, home-v2, secoes-v2) que nenhum outro arquivo importa. AVISO
 *     (componente em construção é legítimo; o vigia só impede esquecê-lo).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RAIZ = join(__dirname, '..');
const COM_ORIGIN = process.argv.includes('--origin');
const norm = (p: string) => relative(RAIZ, p).split(sep).join('/');

function listar(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) listar(p, acc);
    else if (/\.(tsx?|css)$/.test(nome)) acc.push(p);
  }
  return acc;
}

const git = (...args: string[]): string[] => {
  try {
    return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
};
const rastreados = new Set(git('ls-files'));
const emOrigin = COM_ORIGIN ? new Set(git('ls-tree', '-r', '--name-only', 'origin/main')) : null;

const arquivos = listar(join(RAIZ, 'src')).map(norm);
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.css', '.json', '/index.ts', '/index.tsx', '/index.js'];
const resolver = (de: string, spec: string): string | null => {
  const base = spec.startsWith('@/') ? join(RAIZ, 'src', spec.slice(2)) : resolve(dirname(join(RAIZ, de)), spec);
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return norm(p);
  }
  return null;
};

const falhas: string[] = [];
const avisos: string[] = [];
const importadoPor = new Map<string, Set<string>>();
const RE_IMPORT = /(?:from|import|require)\s*\(?\s*['"]((?:@\/|\.{1,2}\/)[^'"]+)['"]/g;

for (const f of arquivos.filter((x) => /\.tsx?$/.test(x))) {
  const src = readFileSync(join(RAIZ, f), 'utf8');
  const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|\s)\/\/.*$/gm, '$1');
  for (const m of semComentarios.matchAll(RE_IMPORT)) {
    const spec = m[1];
    const alvo = resolver(f, spec);
    if (!alvo) {
      falhas.push(`IMPORT QUEBRADO  ${f}  ->  '${spec}' (arquivo inexistente)`);
      continue;
    }
    if (!importadoPor.has(alvo)) importadoPor.set(alvo, new Set());
    importadoPor.get(alvo)!.add(f);
    if (!rastreados.has(alvo)) {
      // Pré-push (--origin): FALHA. Sem a opção, é trabalho em andamento de outro agente na mesma árvore: AVISO.
      const msg = `IMPORT NÃO RASTREADO  ${f}  ->  ${alvo} (existe só no disco: untracked, o build do deploy não o terá)`;
      (COM_ORIGIN ? falhas : avisos).push(msg);
    }
    else if (emOrigin && !emOrigin.has(alvo)) avisos.push(`SAI NESTE PUSH?  ${f}  ->  ${alvo} (não está no origin/main; precisa ir junto no commit)`);
  }
}

const COMPONENTES = [/^src\/components\/vitrines\//, /^src\/components\/home-v2\//, /^src\/components\/home\/secoes-v2\//];
for (const f of arquivos.filter((x) => /\.tsx$/.test(x) && COMPONENTES.some((r) => r.test(x)))) {
  if (!importadoPor.has(f)) avisos.push(`COMPONENTE ÓRFÃO  ${f} (nenhum arquivo o importa)`);
}

console.log(`test-home-sem-orfaos: ${arquivos.length} arquivos, ${[...importadoPor.values()].reduce((n, s) => n + s.size, 0)} importações resolvidas${COM_ORIGIN ? ' (conferido contra origin/main)' : ''}`);
for (const a of avisos) console.warn(`AVISO  ${a}`);
for (const f of falhas) console.error(`FALHA  ${f}`);
console.log(`Resumo: ${falhas.length} falha(s), ${avisos.length} aviso(s)`);
process.exit(falhas.length ? 1 : 0);
