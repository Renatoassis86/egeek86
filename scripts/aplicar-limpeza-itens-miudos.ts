/**
 * LIMPEZA DE ITENS MIÚDOS (dono, 2026-11-13): "não quero peças, cabos, grips, objetos de impressão 3D... são coisas pequenas".
 * DRY-RUN + APLICAR + REVERTER. Mesmo mecanismo reversível da limpeza de consoles (aplicar-limpeza-console.ts).
 *
 *   # 1) DRY-RUN (padrão): só SELECT. Grava docs/backups/limpeza-itens-miudos-plano-<ts>.json, -lista-<ts>.md (inequívocos) e -lista-dono-<ts>.md (ambíguos)
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-itens-miudos.ts
 *   # 2) APLICAR (exige --por; plano com até 24 h; lotes de 20, transação curta com lock 3 s / statement 15 s, pausa >= 0,5 s, vigia o group-messages)
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-itens-miudos.ts --plano docs/backups/limpeza-itens-miudos-plano-<ts>.json --apply --por "Nome"
 *   # 3) REVERTER
 *   npx tsx --env-file=.env.local scripts/aplicar-limpeza-itens-miudos.ts --rollback docs/backups/aplicar-limpeza-itens-miudos-log-<ts>.json [--apply]
 *
 * O QUE GRAVA (e nada além disso): master_products.attributes.catalogGate = veredito 'rejected' (categoria out_of_scope, motivo item_miudo:<motivo>)
 * SÓ dos masters hoje liberados (sem veredito, 'approved' ou 'review', sem decisão humana) cujo título é INEQUIVOCAMENTE item miúdo pela regra
 * única (src/lib/catalog/item-miudo.ts, veredito 'sim'). Nunca apaga master/oferta/cotação/histórico, nunca toca affiliate_offers nem updated_at.
 * NUNCA mexe em: master com decisão humana (catalogGate.manual), master já 'rejected'/mesclado e o AMBÍGUO (acessório menor abaixo do piso,
 * acessório sem produto principal, suplemento): esses vão para a lista do dono e não são aplicados.
 * SEGURANÇA: backup NDJSON (valor anterior de catalogGate de cada master) + log JSON ANTES de gravar; guarda otimista por lote (só grava se o
 * catalogGate ainda é o lido). VIGIA: entre lotes lê collector_runs (job group-messages); se o último ciclo passar de 30 s, pausa 20 s e repete.
 * REVERSÃO: restaura o valor anterior só de quem ainda tem a marca gravada por este lote.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { avaliarItemMiudo } from '../src/lib/catalog/item-miudo';
import { GATE_VERSION } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
/** Inclui masters com catalogGate.manual = 'approved' (aprovação em bloco do dono) cujo título é miúdo inequívoco. Só com o OK explícito do dono. */
const INCLUIR_MANUAL = flag('--incluir-manual');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const TAM_LOTE = 20;
const PAUSA_MS = 600;
const LIMITE_CICLO_MS = 30_000;
const MARCA = 'limpeza-itens-miudos-2026-11-13';

type Gate = Record<string, unknown> | null;
interface Linha {
  id: string;
  titulo: string;
  vertical: string;
  tipo: string;
  estadoAtual: string;
  ofertasAtivas: number;
  precoMinCents: number | null;
  veredito: string;
  motivo: string;
  termo: string | null;
  acao: 'rejeitar' | 'devolver_ao_dono_ambiguo' | 'devolver_ao_dono_manual' | 'ja_fora_ou_decisao_humana' | 'manter';
  gateAnterior: Gate;
}

async function lerPlano(): Promise<Linha[]> {
  const sql = connect();
  try {
    await sql`SET statement_timeout = '60s'`;
    const rows = await sql<
      { id: string; name: string; vertical: string; t: string; gate: Gate; plat: string | null; n: number; minp: string | number | null }[]
    >`
      SELECT m.id::text AS id, m.name, m.vertical, m.product_type::text AS t, m.attributes -> 'catalogGate' AS gate, m.game_platform_gen::text AS plat,
        (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS n,
        (SELECT min(o.current_price_cents) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active' AND o.current_price_cents > 0) AS minp
      FROM master_products m
      WHERE (m.attributes ->> 'mergedInto') IS NULL
      ORDER BY m.vertical, m.name LIMIT 20000`;
    const out: Linha[] = [];
    for (const r of rows) {
      const preco = r.minp == null ? null : Number(r.minp);
      const g = r.gate as { verdict?: string; manual?: string } | null;
      const estado = g?.manual ? `manual:${g.manual}` : (g?.verdict ?? 'approved');
      const liberado = !g || (!g.manual && (g.verdict === 'approved' || g.verdict === 'review' || g.verdict === undefined));
      const x = avaliarItemMiudo(r.name, preco, r.t, r.vertical, { plataforma: r.plat });
      let acao: Linha['acao'];
      if (x.veredito === 'nao') acao = 'manter';
      else if (!liberado && g?.manual === 'approved' && x.veredito === 'sim') acao = INCLUIR_MANUAL ? 'rejeitar' : 'devolver_ao_dono_manual';
      else if (!liberado) acao = 'ja_fora_ou_decisao_humana';
      else if (x.veredito === 'sim') acao = 'rejeitar';
      else acao = 'devolver_ao_dono_ambiguo';
      out.push({ id: r.id, titulo: r.name, vertical: r.vertical, tipo: r.t, estadoAtual: estado, ofertasAtivas: r.n, precoMinCents: preco, veredito: x.veredito, motivo: x.motivo, termo: x.termo, acao, gateAnterior: r.gate });
    }
    return out;
  } finally {
    await sql.end();
  }
}

const rs = (c: number | null) => (c == null ? '-' : `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

function contagem(linhas: Linha[]) {
  // "Ativo hoje" = master liberado (approved) com pelo menos 1 oferta ativa (é o que o site pode mostrar).
  const por: Record<string, { ativos: number; miudoSim: number; miudoDuvida: number; ofertasMiudas: number }> = {};
  for (const l of linhas) {
    const ativo = l.estadoAtual === 'approved' && l.ofertasAtivas > 0;
    const k = l.vertical === 'games' ? `games/${l.tipo}` : l.vertical;
    const c = (por[k] ??= { ativos: 0, miudoSim: 0, miudoDuvida: 0, ofertasMiudas: 0 });
    if (ativo) c.ativos++;
    if (ativo && l.veredito === 'sim') {
      c.miudoSim++;
      c.ofertasMiudas += l.ofertasAtivas;
    }
    if (ativo && l.veredito === 'ambiguo') c.miudoDuvida++;
  }
  return por;
}

function tabela(xs: Linha[]) {
  return ['| id | vertical/tipo | estado | título | ofertas | menor preço | motivo |', '|---|---|---|---|---|---|---|', ...xs.map((l) => `| ${l.id.slice(0, 8)} | ${l.vertical}/${l.tipo} | ${l.estadoAtual} | ${l.titulo.replace(/\|/g, '/').slice(0, 105)} | ${l.ofertasAtivas} | ${rs(l.precoMinCents)} | ${l.motivo}:${l.termo ?? ''} |`)].join('\n');
}

async function dryRun() {
  const linhas = await lerPlano();
  const cont: Record<string, number> = {};
  for (const l of linhas) cont[l.acao] = (cont[l.acao] ?? 0) + 1;
  const porVertical = contagem(linhas);
  console.log('Por ação:', JSON.stringify(cont));
  console.log('Contagem por vertical (masters liberados com oferta ativa):');
  for (const [k, c] of Object.entries(porVertical)) console.log(`  ${k.padEnd(22)} ativos ${String(c.ativos).padStart(5)} | miúdo inequívoco ${String(c.miudoSim).padStart(4)} (${c.ofertasMiudas} ofertas) | dúvida ${String(c.miudoDuvida).padStart(3)}`);
  fs.mkdirSync(DIR, { recursive: true });
  const plano = path.join(DIR, `limpeza-itens-miudos-plano-${stamp}.json`);
  fs.writeFileSync(plano, JSON.stringify({ geradoEm: new Date().toISOString(), marca: MARCA, contagem: cont, porVertical, linhas: linhas.filter((l) => l.acao !== 'manter') }, null, 1));
  const rej = linhas.filter((l) => l.acao === 'rejeitar');
  const amb = linhas.filter((l) => l.acao === 'devolver_ao_dono_ambiguo');
  const man = linhas.filter((l) => l.acao === 'devolver_ao_dono_manual');
  const lista = path.join(DIR, `limpeza-itens-miudos-lista-${stamp}.md`);
  fs.writeFileSync(lista, ['# Itens miúdos: inequívocos a rejeitar (dry-run, 2026-11-13)', '', `Total ${rej.length}. Nada foi gravado.`, '', tabela(rej), ''].join('\n'), 'utf8');
  const listaDono = path.join(DIR, `limpeza-itens-miudos-lista-dono-${stamp}.md`);
  fs.writeFileSync(
    listaDono,
    [
      '# Itens miúdos: ambíguos que ficam para o dono decidir (2026-11-13)',
      '',
      'Nada abaixo foi alterado no banco. Todos ficam FORA de aprovação automática; a regra nova impede que novos itens do mesmo tipo entrem.',
      'Motivos: acessório menor abaixo do piso da família (mouse pad, pen drive, garrafa, corda, caneleira, lâmpada inteligente, power bank), suplemento em Esporte (não é equipamento), acessório de games sem produto principal no título (em geral jogo/acessório mal tipado).',
      'Decisão pedida por família: manter (com piso) ou tirar. Responder "tirar <família>" aplica o mesmo mecanismo reversível.',
      '',
      `## A. Aprovados em bloco pelo dono (catalogGate.manual = approved) que a regra nova pegaria como miúdo INEQUÍVOCO (${man.length})`,
      '',
      'Não aplicado: é decisão humana anterior. Responder "sim, tirar" executa com --incluir-manual (mesmo mecanismo reversível, com backup).',
      '',
      tabela(man),
      '',
      `## B. Ambíguos (${amb.length})`,
      '',
      tabela(amb),
      '',
    ].join('\n'),
    'utf8'
  );
  console.log(`\nA REJEITAR (inequívoco): ${rej.length}; AMBÍGUOS: ${amb.length}`);
  console.log(`Plano: ${path.relative(process.cwd(), plano)}\nLista: ${path.relative(process.cwd(), lista)}\nLista do dono: ${path.relative(process.cwd(), listaDono)}\n(DRY-RUN: nada foi gravado no banco)`);
}

/** Último ciclo do group-messages (ms); null se não houver. */
async function cicloGroupMessages(sql: ReturnType<typeof connect>): Promise<number | null> {
  const r = await sql<{ d: number | null }[]>`SELECT duration_ms AS d FROM collector_runs WHERE job = 'group-messages' ORDER BY id DESC LIMIT 1`;
  return r[0]?.d == null ? null : Number(r[0].d);
}

async function aplicar() {
  const planoPath = arg('--plano');
  const por = arg('--por');
  if (!planoPath || !por) throw new Error('--apply exige --plano <arquivo.json> e --por "Nome"');
  const plano = JSON.parse(fs.readFileSync(path.resolve(planoPath), 'utf8')) as { geradoEm: string; linhas: Linha[] };
  if (Date.now() - new Date(plano.geradoEm).getTime() > 24 * 3_600_000) throw new Error('plano com mais de 24 h: gere outro');
  // Reavalia ao vivo: só aplica o que continua inequívoco E com o mesmo catalogGate do plano.
  const vivo = new Map((await lerPlano()).map((l) => [l.id, l]));
  const alvo = plano.linhas.filter((l) => l.acao === 'rejeitar').filter((l) => {
    const v = vivo.get(l.id);
    return v && v.acao === 'rejeitar' && JSON.stringify(v.gateAnterior) === JSON.stringify(l.gateAnterior);
  });
  console.log(`Plano: ${plano.linhas.filter((l) => l.acao === 'rejeitar').length} a rejeitar; confirmados ao vivo: ${alvo.length}`);
  if (alvo.length === 0) return;

  const em = new Date().toISOString();
  const marcas = new Map<string, Record<string, unknown>>();
  for (const l of alvo) {
    marcas.set(l.id, {
      verdict: 'rejected',
      category: 'out_of_scope',
      reason: `item_miudo:${l.motivo}`,
      matched: l.termo,
      version: GATE_VERSION,
      at: em,
      limpeza: MARCA,
      por,
    });
  }
  const ndjson = path.join(DIR, `aplicar-limpeza-itens-miudos-${stamp}.ndjson`);
  fs.writeFileSync(ndjson, alvo.map((l) => JSON.stringify({ id: l.id, titulo: l.titulo, vertical: l.vertical, tipo: l.tipo, catalogGateAnterior: l.gateAnterior })).join('\n') + '\n');
  const logPath = path.join(DIR, `aplicar-limpeza-itens-miudos-log-${stamp}.json`);
  const log = {
    em,
    por,
    marca: MARCA,
    plano: planoPath,
    backup: path.relative(process.cwd(), ndjson),
    gravados: [] as Array<{ id: string; titulo: string; antes: Gate; depois: Record<string, unknown> }>,
    falhas: [] as Array<{ id: string; erro: string }>,
    cicloGroupMessagesMs: { antes: null as number | null, durante: [] as number[], depois: null as number | null },
    pausasPorCiclo: 0,
  };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1));

  const sql = connect();
  try {
    log.cicloGroupMessagesMs.antes = await cicloGroupMessages(sql);
    for (let i = 0; i < alvo.length; i += TAM_LOTE) {
      // Vigia: se o último ciclo do group-messages passou de 30 s, espera e repete (até 6 vezes por lote).
      for (let tent = 0; tent < 6; tent++) {
        const c = await cicloGroupMessages(sql);
        if (c != null) log.cicloGroupMessagesMs.durante.push(c);
        if (c == null || c <= LIMITE_CICLO_MS) break;
        log.pausasPorCiclo++;
        await new Promise((r) => setTimeout(r, 20_000));
      }
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
               WHERE id = ${l.id}::uuid
                 AND COALESCE(attributes -> 'catalogGate', 'null'::jsonb) = COALESCE(${antes}::text::jsonb, 'null'::jsonb)`;
            if (r.count === 1) log.gravados.push({ id: l.id, titulo: l.titulo, antes: l.gateAnterior, depois: nova });
            else log.falhas.push({ id: l.id, erro: 'catalogGate mudou desde a leitura (guarda otimista): não gravado' });
          }
        });
      } catch (e) {
        for (const l of lote) log.falhas.push({ id: l.id, erro: e instanceof Error ? e.message : String(e) });
      }
      fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
    log.cicloGroupMessagesMs.depois = await cicloGroupMessages(sql);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
  } finally {
    await sql.end();
  }
  console.log(`Gravados: ${log.gravados.length}; falhas/ignorados: ${log.falhas.length}; pausas por ciclo lento: ${log.pausasPorCiclo}`);
  console.log(`Ciclo group-messages (ms): antes ${log.cicloGroupMessagesMs.antes}, durante máx ${Math.max(0, ...log.cicloGroupMessagesMs.durante)}, depois ${log.cicloGroupMessagesMs.depois}`);
  console.log(`Backup: ${log.backup}\nLog: ${path.relative(process.cwd(), logPath)}`);
}

async function reverter() {
  const logPath = arg('--rollback')!;
  const log = JSON.parse(fs.readFileSync(path.resolve(logPath), 'utf8')) as { gravados: Array<{ id: string; antes: Gate; depois: { at: string } }> };
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
      await new Promise((r) => setTimeout(r, PAUSA_MS));
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
