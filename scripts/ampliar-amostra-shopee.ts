/**
 * Ampliar a AMOSTRA de ofertas por produto nas lojas que NAO sao Games, buscando na Shopee (Affiliate Open API oficial) a MESMA
 * midia/produto dos masters ja aprovados. Decisao do dono, 2026-11-11. Nunca cria master: so oferta em master existente.
 * DRY-RUN por padrao: le a API Shopee e o banco; nada e gravado.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/ampliar-amostra-shopee.ts --vertical esporte --limit-masters 30
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/ampliar-amostra-shopee.ts --vertical livros,tecnologia --max-calls 400
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/ampliar-amostra-shopee.ts --vertical esporte --apply
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/ampliar-amostra-shopee.ts --rollback backup/logs/ampliar-amostra-shopee-<ts>.json --apply
 *
 * Opcoes:
 *   --vertical a,b        eletrodomesticos,eletroeletronicos,esporte,impressao3d,livros,tecnologia (padrao: todas as seis).
 *   --limit-masters N     quantos masters testar por vertical (padrao: todos os elegiveis). --offset N pula os N primeiros (retomar).
 *   --max-calls N         teto de chamadas a Shopee por execucao (padrao 300; busca, reserva, consulta por itemId e retentativas contam).
 *   --hourly-cap N        teto de chamadas por hora DESTE script (padrao 3000, contado em collector_runs; compartilhado com a rota);
 *                         o limite oficial e 8000/h somados a todos os coletores, entao o script usa menos de 40% dele.
 *   --max-por-master N    ofertas Shopee novas por master por execucao (padrao 3; um item por loja quando a loja e conhecida).
 *   --min-vendas N        vendas minimas do anuncio (padrao 3); --min-nota X nota minima quando a API devolve (padrao 4.0).
 *   (--aceitar-cobertura foi removido: cobertura sem codigo de modelo nunca e aceita.)
 *   --sem-lookup          nao consulta o item por itemId antes de gravar (sem ele: confirma preco e le loja/shopId).
 *   --so-consultas        NAO chama a API (nem exige credenciais): lista masters elegiveis, consultas e quantos tem codigo de modelo.
 *   --master <id>         testa um master so (diagnostico).
 *   --out-dir <pasta>     onde gravar log.txt, pares.json, descartes.json e relatorio.json (padrao backup/dados/ampliar-amostra-shopee-<ts>/).
 *   --apply               GRAVA. Antes do 1o INSERT grava o BACKUP LOGICO (NDJSON das ofertas e masters das verticais tocadas) em
 *                         backup/dados/ e, ao final, o LOG DE REVERSAO (ids criados) em backup/logs/ampliar-amostra-shopee-<ts>.json.
 *   --rollback <log.json> desfaz um apply: apaga so as ofertas que o log criou (e suas cotacoes); dry-run sem --apply.
 *
 * Fluxo por master APROVADO (catalogGate approved/manual approved): consulta productOfferV2 por palavra-chave (marca+modelo; livros:
 * ISBN e depois titulo+autor) SEM shopId/shopName/priceDiscountRate (a busca devolve System Error 10000 com eles) -> filtros do anuncio
 * (offerLink oficial, foto, vendas, nota, preco sem spread ambiguo SHOPEE_MAX_VARIANT_SPREAD) -> identidade FORTE (shopee-identity.ts:
 * juiz compartilhado com a Amazon + lexico de rejeicao + porteiro nao-original) -> plausibilidade de preco contra o proprio master ->
 * consulta por itemId (confirma disponibilidade/preco e le a loja) -> oferta com affiliate_url = offerLink oficial da Shopee.
 * Em duvida NAO cria (vai para descartes.json). API instavel (erro repetido / so respostas vazias): PARA e documenta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { VERTICALS } from '../src/lib/catalog/verticais';
import { VERTICAIS_ALVO, TETO_HORARIO_PADRAO, type VerticalAlvo } from '../src/lib/affiliate/ampliar-amostra-params';
import { ampliarAmostraShopee, desfazerOfertas, type AmpliarResultado } from '../src/server/collector/ampliar-amostra-shopee';

// Toda a logica vive em src/server/collector/ampliar-amostra-shopee.ts (a mesma da rota /api/cron/ampliar-amostra-shopee).
// Este script so le argumentos, conecta ao banco e grava os artefatos locais (log, pares.json, backup NDJSON, log de reversao).
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(opt('--out-dir') ?? path.join('backup', 'dados', `ampliar-amostra-shopee-${stamp}`));
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, 'log.txt');
function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`, 'utf8');
}

async function backupLogico(sql: ReturnType<typeof connect>, verticals: string[]): Promise<string> {
  const dir = path.resolve('backup', 'dados');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ampliar-amostra-shopee-pre-${stamp}.ndjson`);
  const lines: string[] = [];
  for (const v of verticals) {
    for (const r of await sql`select * from master_products where vertical = ${v}`) lines.push(JSON.stringify({ table: 'master_products', row: r }));
    for (const r of await sql`select * from affiliate_offers where vertical = ${v}`) lines.push(JSON.stringify({ table: 'affiliate_offers', row: r }));
  }
  fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
  return file;
}

async function main() {
  const rb = argv.indexOf('--rollback');
  if (rb >= 0) {
    const l = JSON.parse(fs.readFileSync(path.resolve(argv[rb + 1]), 'utf8')) as { stamp: string; offersCreated: string[] };
    const s = connect();
    try {
      log(`ROLLBACK ${APPLY ? '(APPLY)' : '(dry-run)'} do log ${l.stamp}: ofertas=${l.offersCreated.length}`);
      const r = await desfazerOfertas(s, l.offersCreated, APPLY);
      log(`ROLLBACK: encontradas=${r.encontradas} apagadas=${r.apagadas} (masters nao foram tocados)`);
    } finally {
      await s.end({ timeout: 5 });
    }
    return;
  }

  const verticals = (opt('--vertical') ? opt('--vertical')!.split(',').map((x) => x.trim()) : [...VERTICAIS_ALVO]).map((v) => {
    if (!(VERTICALS as readonly string[]).includes(v) || !(VERTICAIS_ALVO as readonly string[]).includes(v)) throw new Error(`vertical invalida: ${v} (validas: ${VERTICAIS_ALVO.join(', ')})`);
    return v as VerticalAlvo;
  });

  let interrompido = false;
  process.on('SIGINT', () => {
    if (interrompido) process.exit(130);
    interrompido = true;
    log('SIGINT: terminando a chamada em curso e gravando o relatorio parcial (Ctrl+C de novo aborta).');
  });

  const sql = connect();
  let res: AmpliarResultado;
  try {
    res = await ampliarAmostraShopee(sql, {
      apply: APPLY,
      verticals,
      limitMasters: opt('--limit-masters') ? Math.max(1, Number(opt('--limit-masters'))) : undefined,
      offset: Math.max(0, Number(opt('--offset') ?? 0)),
      maxCalls: Math.max(1, Number(opt('--max-calls') ?? 300)),
      hourlyCap: Math.min(8000, Math.max(1, Number(opt('--hourly-cap') ?? TETO_HORARIO_PADRAO))),
      maxPorMaster: Math.max(1, Number(opt('--max-por-master') ?? 3)),
      minVendas: Math.max(0, Number(opt('--min-vendas') ?? 3)),
      minNota: Math.max(0, Math.min(5, Number(opt('--min-nota') ?? 4))),
      comLookup: !flag('--sem-lookup'),
      soMaster: opt('--master'),
      soConsultas: flag('--so-consultas'),
      log,
      shouldStop: () => interrompido,
      onBeforeFirstInsert: backupLogico,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  if (APPLY && res.offersCreated.length) {
    const logsDir = path.resolve('backup', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logJson = path.join(logsDir, `ampliar-amostra-shopee-${stamp}.json`);
    fs.writeFileSync(logJson, JSON.stringify({ stamp, runId: res.runId, verticais: verticals, backup: res.backup, offersCreated: res.offersCreated, applied: res.applied }, null, 2));
    fs.copyFileSync(logFile, path.join(logsDir, `ampliar-amostra-shopee-${stamp}.log`));
    log(`LOG DE REVERSAO: ${logJson} (run_id ${res.runId}, tambem em collector_runs.meta)`);
    log(`REVERTER: npx tsx --conditions=react-server --env-file=.env.local scripts/ampliar-amostra-shopee.ts --rollback ${path.relative(process.cwd(), logJson)} --apply`);
  }
  fs.writeFileSync(path.join(outDir, 'pares.json'), JSON.stringify(res.pares, null, 2));
  fs.writeFileSync(path.join(outDir, 'descartes.json'), JSON.stringify({ amostrasPorMotivo: res.amostrasDescarte, duvidas: res.duvidas }, null, 2));
  fs.writeFileSync(path.join(outDir, 'relatorio.json'), JSON.stringify({ apply: APPLY, runId: res.runId, parou: res.parou, erroApi: res.erroApi, chamadas: res.chamadas, porVertical: res.porVertical, ofertasCriadas: res.offersCreated.length }, null, 2));
  for (const [v, s] of Object.entries(res.porVertical)) {
    const top = Object.entries(s.descartes).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}=${n}`).join('; ');
    log(`RESUMO ${v}: masters=${s.masters} testados=${s.mastersTestados} sem_item=${s.mastersSemItem} itens_lidos=${s.itensLidos} pares_aceitos=${s.paresAceitos} ofertas_criadas=${s.ofertasCriadas} duvidas=${s.duvidas} proximo_offset=${s.proximoOffset ?? 'fim'}`);
    log(`  descartes: ${top || '-'}`);
  }
  log(`saida: ${outDir}`);
}

main().catch((e) => {
  log(`ERRO: ${(e as Error).message}`);
  process.exit(1);
});
