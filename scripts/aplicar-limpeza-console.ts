/**
 * LIMPEZA DO TIPO CONSOLE (dono, 2026-11-13): "console = só video game". DRY-RUN + APLICAR + REVERTER. Padrão de aplicar-escopo-compra.ts.
 *
 *   # 1) DRY-RUN (padrão): só SELECT. Grava docs/backups/limpeza-console-plano-<ts>.json e docs/backups/limpeza-console-lista-dono-<ts>.md
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-console.ts
 *   # 2) APLICAR (exige --por; plano com até 24 h; lotes pequenos, cada um em transação curta com lock/statement timeout)
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-console.ts --plano docs/backups/limpeza-console-plano-<ts>.json --apply --por "Nome"
 *   # 3) REVERTER
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-console.ts --rollback docs/backups/aplicar-limpeza-console-log-<ts>.json [--apply]
 *
 * O QUE GRAVA (e nada além disso): master_products.attributes.catalogGate = veredito 'rejected' (categoria out_of_scope, motivo
 * console_nao_e_aparelho:<motivo> | console_fora_de_linha) SÓ dos masters tipo 'console' hoje liberados (sem veredito ou 'approved') cujo
 * título é INEQUIVOCAMENTE peça/acessório/enfeite/retrô pela regra única (src/lib/catalog/console-videogame.ts, veredito 'nao' + forte).
 * É o mesmo mecanismo do porteiro (apply-catalog-gate.ts): reversível, nunca apaga master/oferta/cotação/histórico, nunca toca updated_at.
 * NUNCA mexe em: master com decisão humana (catalogGate.manual), master já em 'review'/'rejected', ambíguo (marca desconhecida,
 * pacote sem preço, Portal, preço abaixo do piso) e 'nao' sem prova forte (jogo tipado console): esses vão para a lista do dono.
 * SEGURANÇA: backup NDJSON (valor anterior de catalogGate de cada master) + log JSON ANTES de gravar; guarda otimista por lote
 * (só grava se o catalogGate ainda é o lido). REVERSÃO: restaura o valor anterior só de quem ainda tem a marca gravada por este lote.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarConsoleVideoGame } from '../src/lib/catalog/console-videogame';
import { evaluateCatalogGate, toPersistedGate, GATE_VERSION, type PersistedGate } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const TAM_LOTE = 20;
const MARCA = 'limpeza-console-2026-11-13';

interface Linha {
  id: string;
  titulo: string;
  tipoAtual: string;
  estadoAtual: string;
  ofertasAtivas: number;
  precoMinCents: number | null;
  veredito: string;
  forte: boolean;
  motivo: string;
  termo: string | null;
  acao: 'rejeitar' | 'devolver_ao_dono_ambiguo' | 'devolver_ao_dono_tipo_errado' | 'ja_fora_ou_decisao_humana' | 'manter';
  gateAnterior: PersistedGate | null;
}

async function diagnosticar(): Promise<Linha[]> {
  const sql = connect();
  try {
    await sql`SET statement_timeout = '60s'`;
    const rows = await sql<
      { id: string; name: string; gate: PersistedGate | null; n: number; minp: string | number | null; plat: string | null }[]
    >`
      SELECT m.id::text AS id, m.name, m.attributes -> 'catalogGate' AS gate, m.game_platform_gen::text AS plat,
        (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS n,
        (SELECT min(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0) AS minp
      FROM master_products m
      WHERE m.product_type = 'console' AND (m.attributes ->> 'mergedInto') IS NULL
      ORDER BY m.name LIMIT 3000`;
    const out: Linha[] = [];
    for (const r of rows) {
      const preco = r.minp == null ? null : Number(r.minp);
      const x = avaliarConsoleVideoGame(r.name, preco, { plataforma: r.plat });
      const estado = r.gate?.manual ? `manual:${r.gate.manual}` : (r.gate?.verdict ?? 'approved');
      const liberado = !r.gate || (r.gate.verdict === 'approved' && !r.gate.manual);
      let acao: Linha['acao'];
      if (x.veredito === 'sim') acao = 'manter';
      else if (!liberado) acao = 'ja_fora_ou_decisao_humana';
      // Jogo de VR tipado console ("Deracine: Playstation VR - Playstation 4") é jogo, não peça: vai ao dono, não é limpo.
      else if (x.veredito === 'nao' && x.forte && /^(vr|vr2|psvr|psvr2|playstation vr)$/.test(x.termo ?? '') && !/^((console|sony|novo|playstation) )*(playstation|psvr|ps) ?vr/i.test(r.name.trim())) acao = 'devolver_ao_dono_tipo_errado';
      else if (x.veredito === 'nao' && x.forte) acao = 'rejeitar';
      else if (x.veredito === 'ambiguo') acao = 'devolver_ao_dono_ambiguo';
      else acao = 'devolver_ao_dono_tipo_errado';
      out.push({ id: r.id, titulo: r.name, tipoAtual: 'console', estadoAtual: estado, ofertasAtivas: r.n, precoMinCents: preco, veredito: x.veredito, forte: x.forte, motivo: x.motivo, termo: x.termo, acao, gateAnterior: r.gate });
    }
    return out;
  } finally {
    await sql.end();
  }
}

function rs(c: number | null): string {
  return c == null ? '-' : `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function gravarListaDono(linhas: Linha[], arquivo: string) {
  const amb = linhas.filter((l) => l.acao === 'devolver_ao_dono_ambiguo');
  const tipo = linhas.filter((l) => l.acao === 'devolver_ao_dono_tipo_errado');
  const tab = (xs: Linha[]) =>
    ['| id | título | ofertas | menor preço | motivo |', '|---|---|---|---|---|', ...xs.map((l) => `| ${l.id.slice(0, 8)} | ${l.titulo.replace(/\|/g, '/').slice(0, 110)} | ${l.ofertasAtivas} | ${rs(l.precoMinCents)} | ${l.motivo} |`)].join('\n');
  const md = [
    '# Console: itens que ficam para o dono decidir (2026-11-13)',
    '',
    'Nada abaixo foi alterado no banco. Todos já ficam FORA das seções Consoles do site (a regra única só deixa entrar o que é aparelho comprovado).',
    '',
    `## A. Ambíguos (${amb.length}): bundle sem preço, marca/modelo desconhecido, PlayStation Portal (player remoto), PS5 portátil, preço abaixo do piso`,
    '',
    tab(amb),
    '',
    `## B. Tipo gravado como console, mas o título não anuncia aparelho (${tipo.length}): em geral jogo/acessório com o nome da plataforma`,
    '',
    'Decisão pedida: reclassificar o tipo para jogo/acessório (muda identidade e média) ou tirar do monitoramento. Não aplicado.',
    '',
    tab(tipo),
    '',
  ].join('\n');
  fs.writeFileSync(arquivo, md, 'utf8');
}

async function dryRun() {
  const linhas = await diagnosticar();
  const cont: Record<string, number> = {};
  for (const l of linhas) cont[l.acao] = (cont[l.acao] ?? 0) + 1;
  const aprovados = linhas.filter((l) => l.estadoAtual === 'approved');
  console.log(`Masters tipo console (sem mesclados): ${linhas.length}; liberados hoje: ${aprovados.length}`);
  console.log('Por ação:', JSON.stringify(cont));
  const rej = linhas.filter((l) => l.acao === 'rejeitar');
  console.log(`\nA REJEITAR (peça/acessório/retrô inequívoco): ${rej.length}`);
  for (const l of rej) console.log(`  ${l.id.slice(0, 8)} | ${l.ofertasAtivas}of ${rs(l.precoMinCents)} | ${l.motivo}:${l.termo} | ${l.titulo.slice(0, 85)}`);
  fs.mkdirSync(DIR, { recursive: true });
  const plano = path.join(DIR, `limpeza-console-plano-${stamp}.json`);
  fs.writeFileSync(plano, JSON.stringify({ geradoEm: new Date().toISOString(), marca: MARCA, contagem: cont, linhas }, null, 1));
  const lista = path.join(DIR, `limpeza-console-lista-dono-${stamp}.md`);
  gravarListaDono(linhas, lista);
  console.log(`\nPlano: ${path.relative(process.cwd(), plano)}\nLista do dono: ${path.relative(process.cwd(), lista)}\n(DRY-RUN: nada foi gravado no banco)`);
}

async function aplicar() {
  const planoPath = arg('--plano');
  const por = arg('--por');
  if (!planoPath || !por) throw new Error('--apply exige --plano <arquivo.json> e --por "Nome"');
  const plano = JSON.parse(fs.readFileSync(path.resolve(planoPath), 'utf8')) as { geradoEm: string; linhas: Linha[] };
  if (Date.now() - new Date(plano.geradoEm).getTime() > 24 * 3_600_000) throw new Error('plano com mais de 24 h: gere outro');
  // Reavalia ao vivo: só aplica o que continua inequívoco E com o mesmo catalogGate do plano.
  const vivo = new Map((await diagnosticar()).map((l) => [l.id, l]));
  const alvo = plano.linhas.filter((l) => l.acao === 'rejeitar').filter((l) => {
    const v = vivo.get(l.id);
    return v && v.acao === 'rejeitar' && JSON.stringify(v.gateAnterior) === JSON.stringify(l.gateAnterior);
  });
  console.log(`Plano: ${plano.linhas.filter((l) => l.acao === 'rejeitar').length} a rejeitar; confirmados ao vivo: ${alvo.length}`);
  if (alvo.length === 0) return;

  const em = new Date().toISOString();
  const marcas = new Map<string, PersistedGate>();
  for (const l of alvo) {
    const g = evaluateCatalogGate({ name: l.titulo, productType: 'console' });
    const base = g.verdict === 'rejected' ? g : { ...g, verdict: 'rejected' as const, category: 'out_of_scope' as const, reason: `console_nao_e_aparelho:${l.motivo}`, matched: l.termo };
    const persistido = toPersistedGate(base, em);
    persistido.reason = base.reason.startsWith('console_') ? base.reason : `console_nao_e_aparelho:${l.motivo}`;
    (persistido as PersistedGate & { limpeza?: string; por?: string }).limpeza = MARCA;
    (persistido as PersistedGate & { limpeza?: string; por?: string }).por = por;
    persistido.version = GATE_VERSION;
    marcas.set(l.id, persistido);
  }

  const ndjson = path.join(DIR, `aplicar-limpeza-console-${stamp}.ndjson`);
  fs.writeFileSync(ndjson, alvo.map((l) => JSON.stringify({ id: l.id, titulo: l.titulo, catalogGateAnterior: l.gateAnterior })).join('\n') + '\n');
  const logPath = path.join(DIR, `aplicar-limpeza-console-log-${stamp}.json`);
  const log = { em, por, marca: MARCA, plano: planoPath, backup: path.relative(process.cwd(), ndjson), gravados: [] as Array<{ id: string; titulo: string; antes: PersistedGate | null; depois: PersistedGate }>, falhas: [] as Array<{ id: string; erro: string }> };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1));

  const sql = connect();
  try {
    for (let i = 0; i < alvo.length; i += TAM_LOTE) {
      const lote = alvo.slice(i, i + TAM_LOTE);
      try {
        await sql.begin(async (tx) => {
          await tx`SET LOCAL lock_timeout = '3s'`;
          await tx`SET LOCAL statement_timeout = '15s'`;
          for (const l of lote) {
            const nova = marcas.get(l.id)!;
            const antes = JSON.stringify(l.gateAnterior);
            const r = await tx`
              UPDATE master_products
                 SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{catalogGate}', ${JSON.stringify(nova)}::text::jsonb, true)
               WHERE id = ${l.id}::uuid AND product_type = 'console'
                 AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${antes}::text::jsonb, 'null'::jsonb)`;
            if (r.count === 1) log.gravados.push({ id: l.id, titulo: l.titulo, antes: l.gateAnterior, depois: nova });
            else log.falhas.push({ id: l.id, erro: 'catalogGate mudou desde a leitura (guarda otimista): não gravado' });
          }
        });
      } catch (e) {
        for (const l of lote) log.falhas.push({ id: l.id, erro: e instanceof Error ? e.message : String(e) });
      }
      fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    await sql.end();
  }
  console.log(`Gravados: ${log.gravados.length}; falhas/ignorados: ${log.falhas.length}\nBackup: ${log.backup}\nLog: ${path.relative(process.cwd(), logPath)}`);
}

async function reverter() {
  const logPath = arg('--rollback')!;
  const log = JSON.parse(fs.readFileSync(path.resolve(logPath), 'utf8')) as { gravados: Array<{ id: string; antes: PersistedGate | null; depois: PersistedGate }> };
  console.log(`Reverter ${log.gravados.length} masters${APPLY ? '' : ' (DRY-RUN; use --apply)'}`);
  if (!APPLY) return;
  const sql = connect();
  try {
    for (let i = 0; i < log.gravados.length; i += TAM_LOTE) {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL lock_timeout = '3s'`;
        await tx`SET LOCAL statement_timeout = '15s'`;
        for (const g of log.gravados.slice(i, i + TAM_LOTE)) {
          if (g.antes) {
            await tx`UPDATE master_products SET attributes = jsonb_set(attributes, '{catalogGate}', ${JSON.stringify(g.antes)}::text::jsonb, true)
                     WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
          } else {
            await tx`UPDATE master_products SET attributes = attributes - 'catalogGate'
                     WHERE id = ${g.id}::uuid AND attributes -> 'catalogGate' ->> 'at' = ${g.depois.at}`;
          }
        }
      });
    }
    console.log('Revertido.');
  } finally {
    await sql.end();
  }
}

(async () => {
  if (flag('--rollback')) await reverter();
  else if (APPLY) await aplicar();
  else await dryRun();
})().catch((e) => {
  console.error('ERRO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
