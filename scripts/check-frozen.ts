/**
 * GUARDA DO CONGELADO E ANÁLISE DE IMPACTO (METODOLOGIA_IA.md, seções 4 e 6).
 *
 *   npm run congelado                 -> compara o que mudou (working tree + staged, contra HEAD) com docs/validado/MODULOS.json
 *   npm run congelado -- --contra=<ref>   -> compara contra outro ref (ex.: origin/main)
 *
 * Para cada arquivo alterado que pertença a um módulo do manifesto, imprime o módulo, o estado, os testes que o guardam e os CONSUMIDORES a conferir
 * (análise de impacto: é a lista do que precisa ficar coerente no mesmo trabalho, regra "cadeia completa").
 * Módulo `congelado` alterado sem descongelamento ativo = falha (código 1). Descongelar é decisão do dono: docs/validado/descongelar.json
 * (id, motivo, regra, até quando). Descongelamento vencido não vale. Também avisa quando regra de preço/mensagem muda sem teste e sem Fluxo Mestre.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface Modulo { id: string; estado: 'rascunho' | 'em_validacao' | 'validado' | 'congelado' | 'candidato'; regra?: string; caminhos: string[]; guarda: string[]; consumidores?: string[]; nota?: string }
interface Descongelar { id: string; motivo: string; regra?: string; ate: string; autorizadoPor: string }

const raiz = process.cwd();
const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, 'docs', 'validado', 'MODULOS.json'), 'utf8')) as { modulos: Modulo[] };
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const arqUnlock = path.join(raiz, 'docs', 'validado', 'descongelar.json');
const unlocks: Descongelar[] = fs.existsSync(arqUnlock) ? JSON.parse(fs.readFileSync(arqUnlock, 'utf8')) : [];
const contra = (process.argv.find((a) => a.startsWith('--contra=')) ?? '--contra=HEAD').slice(9);

const sh = (c: string) => execSync(c, { cwd: raiz, encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const alterados = [...new Set([...sh(`git diff --name-only ${contra}`), ...sh('git diff --name-only --cached')])].map((p) => p.replace(/\\/g, '/'));

const casa = (arq: string, cam: string) => arq === cam || arq.startsWith(cam.endsWith('/') ? cam : `${cam}/`);
const agora = Date.now();
const vigente = (id: string) => unlocks.find((u) => u.id === id && Date.parse(u.ate) > agora);

let falhou = false;
const avisos: string[] = [];
const tocados = new Map<string, string[]>();
for (const m of manifesto.modulos) {
  const arqs = alterados.filter((a) => m.caminhos.some((c) => casa(a, c)));
  if (arqs.length) tocados.set(m.id, arqs);
  for (const g of m.guarda) if (!pkg.scripts[g]) avisos.push(`módulo ${m.id}: o teste guarda "${g}" não existe no package.json`);
}

if (!alterados.length) console.log('Nada alterado contra', contra);
for (const [id, arqs] of tocados) {
  const m = manifesto.modulos.find((x) => x.id === id)!;
  const un = m.estado === 'congelado' ? vigente(id) : null;
  const barrado = m.estado === 'congelado' && !un;
  if (barrado) falhou = true;
  console.log(`\n${barrado ? '✖ CONGELADO' : m.estado === 'congelado' ? '⚠ DESCONGELADO ATÉ ' + un!.ate : '• ' + m.estado.toUpperCase()}  ${m.id}${m.regra ? ` (${m.regra})` : ''}`);
  for (const a of arqs) console.log(`    alterado: ${a}`);
  console.log(`    testes que guardam: ${m.guarda.join(', ') || '(NENHUM: módulo sem rede de proteção)'}`);
  if (m.consumidores?.length) console.log(`    consumidores a conferir (cadeia completa): ${m.consumidores.join('; ')}`);
  if (barrado) console.log(`    -> bloqueado: para mexer, o dono autoriza em docs/validado/descongelar.json (id, motivo, regra, ate, autorizadoPor).`);
}

const mexeuRegra = alterados.some((a) => /^src\/(lib|server)\/(pricing|messaging|catalog|coupons|affiliate)\//.test(a) && !/\.test\./.test(a));
const mexeuTeste = alterados.some((a) => /^scripts\/test-|\.test\./.test(a));
const mexeuFluxo = alterados.some((a) => a === 'docs/03-metodologia/FLUXO_MESTRE.md');
if (mexeuRegra && !mexeuTeste) avisos.push('regra de preço/mensagem/catálogo mudou SEM teste alterado ou novo (cada correção nasce de um teste que falhava).');
if (mexeuRegra && !mexeuFluxo) avisos.push('regra mudou e o FLUXO_MESTRE.md não (seção 13.2: no mesmo commit).');
for (const a of avisos) console.log(`⚠ ${a}`);

console.log(falhou ? '\nFALHOU: módulo congelado alterado sem descongelamento vigente.' : `\nOK: ${tocados.size} módulo(s) tocado(s), nenhum congelado violado.`);
process.exit(falhou ? 1 : 0);
