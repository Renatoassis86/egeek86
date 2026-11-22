/**
 * R-115: CESTA POR MODELO (NLP leve). Diagnostica, SUGERE e (só com ordem explícita) APLICA correções de cesta em lotes pequenos.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/cesta-nlp.ts sugerir [--saida docs/evidencias/cestas-nlp-sugestoes-2026-11-22.md]
 *       Somente leitura (consultas paginadas, leves). Escreve o relatório de sugestões e o plano docs/backups/cesta-nlp-plano-<data>.json.
 *   CESTA_NLP=aplicar npx tsx ... scripts/cesta-nlp.ts aplicar --plano <arquivo> [--lote 20] [--juncoes 0] --apply
 *       Aplica SÓ o que o plano marca como aplicável (confiança >= 0,97, sem conflito suave nem trava), em um lote pequeno:
 *       backup lógico NDJSON (linhas antes) + log reversível, revalidação por linha dentro da transação, medida do envio
 *       (group_messages enviada/h) antes e depois; aborta se o envio cair mais de 30%. Nunca toca decisão humana (catalogGate.manual).
 *   npx tsx ... scripts/cesta-nlp.ts rollback --log <arquivo> --apply     Desfaz um lote pelo log.
 *
 * Flag: CESTA_NLP=off desliga tudo (sugerir e aplicar recusam); padrão = sugerir; aplicar exige CESTA_NLP=aplicar E --apply.
 * Ações: (1) mover a oferta para o master certo, quando existe um único destino idêntico (>= 0,97); (2) quarentena reversível
 * (motivo cesta_nlp_conflito_duro: sai de média, menor preço, selo, vitrine e mensagens); (3) opcional --juncoes N: mover as ofertas
 * de um master duplicado para o canônico (o master duplicado fica vazio, nada é apagado nem arquivado).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql } from './_dup-shared';
import { Motor, analisarCesta, sugerirJuncoes, julgarAtributos, cestaNlpModo, MOTIVO_CESTA_NLP, LIMIAR_APLICAR, type MasterCesta, type SugestaoJuncao } from '../src/lib/catalog/cesta-nlp';

const args = process.argv.slice(2);
const modo = args[0] ?? 'sugerir';
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const ROOT = process.cwd();
const HOJE = new Date().toISOString().slice(0, 10);

/** Eixos em que o conflito duro é objetivo (código, medida, tipo, região, variante...). Edição, composição e marca ficam só como sugestão. */
const EIXOS_APLICAVEIS = new Set(['voltagem', 'armazenamento', 'ram', 'capacidade', 'polegadas', 'modelo', 'papel', 'tipo', 'pack', 'variante', 'plataforma', 'numeral', 'regiao', 'linha', 'resolucao', 'medida', 'cpu_gpu', 'isbn', 'ean', 'condicao']);
const aplicavelEixo = (e: string) => EIXOS_APLICAVEIS.has(e) || e.startsWith('spec_');

async function pagina<T>(sql: Sql, consulta: (ultimo: string) => string, pausaMs = 350): Promise<T[]> {
  const todos: T[] = [];
  let ultimo = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const linhas = (await sql.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      await tx.unsafe(`SET LOCAL statement_timeout = '8s'`);
      return tx.unsafe(consulta(ultimo));
    })) as unknown as Array<T & { id: string }>;
    if (!linhas.length) break;
    todos.push(...linhas);
    ultimo = linhas[linhas.length - 1].id;
    await new Promise((r) => setTimeout(r, pausaMs));
  }
  return todos;
}

async function carregar(sql: Sql) {
  const M = await pagina<any>(sql, (u) => `SELECT id::text, name, vertical, product_type::text AS pt, gtin, mpn, manufacturer, game_platform_gen::text AS plat, game_format::text AS fmt, attributes->'catalogGate'->>'manual' AS gm, attributes->>'mergedInto' AS merged FROM master_products WHERE id > '${u}'::uuid ORDER BY id LIMIT 3000`);
  const O = await pagina<any>(sql, (u) => `SELECT o.id::text, o.master_product_id::text AS mid, n.slug AS net, o.title, o.external_ref AS ref, o.status::text AS st, (o.quarantined_at IS NOT NULL) AS q, o.current_price_cents AS price FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id WHERE o.id > '${u}'::uuid AND o.status IN ('active','draft') ORDER BY o.id LIMIT 4000`, 400);
  return { M: M.filter((m) => !m.merged), O };
}

async function enviosPorHora(sql: Sql): Promise<{ ultimaHora: number; horaAnterior: number }> {
  const r = await sql.begin(async (tx) => {
    await tx`SET TRANSACTION READ ONLY`;
    await tx.unsafe(`SET LOCAL statement_timeout = '6s'`);
    return tx.unsafe(`SELECT count(*) FILTER (WHERE sent_at > now() - interval '60 minutes')::int AS a, count(*) FILTER (WHERE sent_at <= now() - interval '60 minutes' AND sent_at > now() - interval '120 minutes')::int AS b FROM group_messages WHERE status::text = 'enviada' AND sent_at > now() - interval '125 minutes'`);
  });
  return { ultimaHora: (r[0] as any).a, horaAnterior: (r[0] as any).b };
}

interface AcaoOferta {
  tipo: 'mover' | 'quarentena';
  ofertaId: string; masterId: string; masterNome: string; titulo: string; rede: string; status: string;
  conflitos: string[]; destinoId?: string; destinoNome?: string; confiancaDestino?: number; aplicavel: boolean; motivoNaoAplicavel?: string;
}

async function sugerir() {
  const sql = connect();
  try {
    const t0 = Date.now();
    const { M, O } = await carregar(sql);
    const por = new Map<string, any[]>();
    for (const o of O) { if (!por.has(o.mid)) por.set(o.mid, []); por.get(o.mid)!.push(o); }
    const fab = new Map<string, number>();
    for (const m of M) if (m.manufacturer) fab.set(String(m.manufacturer).toLowerCase(), (fab.get(String(m.manufacturer).toLowerCase()) ?? 0) + 1);
    const motor = new Motor([...M.map((m) => m.name), ...O.map((o) => o.title)], [...fab.entries()].filter(([, n]) => n >= 5).map(([k]) => k));
    const masters: MasterCesta[] = M.map((m) => ({
      id: m.id, nome: m.name, vertical: m.vertical, tipoCadastro: m.pt, gtin: m.gtin, mpn: m.mpn, fabricante: m.manufacturer, plataforma: m.plat, formato: m.fmt,
      decisaoHumana: m.gm === 'approved' || m.gm === 'rejected',
      ofertas: (por.get(m.id) ?? []).map((o) => ({ id: o.id, titulo: o.title, rede: o.net, ref: o.ref, status: o.st })),
    }));
    const mById = new Map(masters.map((m) => [m.id, m]));

    // ---- FUSÃO: oferta contra o produto da cesta
    const acoes: AcaoOferta[] = [];
    const porEixo: Record<string, number> = {};
    const porVertical: Record<string, { ofertas: number; fora: number }> = {};
    let ofertas = 0, trivial = 0, fora = 0, cestasComFora = 0, cestasNomeDiv = 0;
    const revisarNome: Array<{ masterId: string; nome: string; sugerido?: string; n: number }> = [];
    const mistas: Array<{ masterId: string; nome: string; eixo: string; grupos: Record<string, number>; minoria: number }> = [];
    const impactos: Array<{ masterId: string; nome: string; n: number; removidas: number; mediaAntes: number; mediaDepois: number; medianaAntes: number; medianaDepois: number; titulos: string[] }> = [];
    const mediana = (x: number[]) => { const y = [...x].sort((a, b) => a - b); const k = Math.floor(y.length / 2); return y.length % 2 ? y[k] : (y[k - 1] + y[k]) / 2; };
    // blocos de masters para achar o destino certo da oferta
    const blocos = new Map<string, MasterCesta[]>();
    for (const m of masters) {
      const a = motor.atributos(m.nome);
      if (!a.marca || !a.tipo) continue;
      const k = [m.vertical, m.tipoCadastro, a.marca, a.tipo, a.acessorio ? 'a' : 'p'].join('|');
      (blocos.get(k) ?? blocos.set(k, []).get(k)!).push(m);
    }
    for (const m of masters) {
      if (!m.ofertas.length) continue;
      const r = analisarCesta(m, motor);
      const v = (porVertical[m.vertical + '/' + m.tipoCadastro] ??= { ofertas: 0, fora: 0 });
      v.ofertas += m.ofertas.length; ofertas += m.ofertas.length;
      trivial += m.ofertas.filter((o) => o.titulo.trim().toLowerCase() === m.nome.trim().toLowerCase()).length;
      for (const mi of r.misturas) { const tam = Object.values(mi.grupos).map((g) => g.length).sort((a, b) => b - a); mistas.push({ masterId: m.id, nome: m.nome, eixo: mi.eixo, grupos: Object.fromEntries(Object.entries(mi.grupos).map(([k, g]) => [k, g.length])), minoria: tam.slice(1).reduce((a, b) => a + b, 0) }); }
      const f = r.ofertas.filter((x) => x.classe === 'fora');
      if (f.length && !r.nomeDivergente) {
        const ativas = (por.get(m.id) ?? []).filter((o) => o.st === 'active' && !o.q && Number(o.price) > 0);
        const fid = new Set(f.map((x) => x.id));
        const resto = ativas.filter((o) => !fid.has(o.id));
        if (ativas.length >= 5 && resto.length >= 3 && resto.length < ativas.length) impactos.push({ masterId: m.id, nome: m.nome, n: ativas.length, removidas: ativas.length - resto.length, mediaAntes: ativas.reduce((a, o) => a + Number(o.price), 0) / ativas.length / 100, mediaDepois: resto.reduce((a, o) => a + Number(o.price), 0) / resto.length / 100, medianaAntes: mediana(ativas.map((o) => Number(o.price))) / 100, medianaDepois: mediana(resto.map((o) => Number(o.price))) / 100, titulos: ativas.filter((o) => fid.has(o.id)).map((o) => `${o.net.slice(0, 3)} R$ ${(Number(o.price) / 100).toFixed(0)} ${String(o.title).slice(0, 60)}`) });
      }
      if (r.nomeDivergente) { cestasNomeDiv++; revisarNome.push({ masterId: m.id, nome: m.nome, sugerido: r.nomeSugerido, n: f.length }); }
      if (!f.length) continue;
      cestasComFora++; fora += f.length; v.fora += f.length;
      for (const x of f) {
        const of = m.ofertas.find((o) => o.id === x.id)!;
        for (const c of x.conflitos) porEixo[c.eixo] = (porEixo[c.eixo] ?? 0) + 1;
        // destino idêntico único
        let destino: { m: MasterCesta; conf: number } | undefined;
        const ao = motor.atributos(of.titulo);
        if (ao.marca && ao.tipo) {
          const lista = blocos.get([m.vertical, m.tipoCadastro, ao.marca, ao.tipo, ao.acessorio ? 'a' : 'p'].join('|')) ?? [];
          const cand = lista.filter((d) => d.id !== m.id && d.ofertas.length).map((d) => ({ d, j: julgarAtributos(ao, motor.atributos(d.nome), motor.indice) })).filter((c) => c.j.veredito === 'igual' && c.j.confianca >= LIMIAR_APLICAR && !c.j.conflitos.some((q) => !q.duro && !/^(?:tipo_desconhecido|marca_desconhecida)$/.test(q.eixo)));
          if (cand.length === 1) destino = { m: cand[0].d, conf: cand[0].j.confianca };
        }
        const eixos = x.conflitos.map((c) => c.eixo);
        let aplicavel = true; let motivo: string | undefined;
        if (r.nomeDivergente) { aplicavel = false; motivo = 'nome_do_master_divergente'; }
        else if (m.decisaoHumana) { aplicavel = false; motivo = 'decisao_humana_do_dono'; }
        else if (of.status !== 'active') { aplicavel = false; motivo = 'oferta_nao_ativa'; }
        else if (por.get(m.id)!.find((o) => o.id === of.id)?.q) { aplicavel = false; motivo = 'ja_em_quarentena'; }
        else if (!eixos.every(aplicavelEixo)) { aplicavel = false; motivo = 'eixo_so_sugestao:' + eixos.filter((e) => !aplicavelEixo(e)).join(','); }
        acoes.push({
          tipo: destino ? 'mover' : 'quarentena', ofertaId: of.id, masterId: m.id, masterNome: m.nome, titulo: of.titulo, rede: of.rede, status: of.status ?? '',
          conflitos: x.conflitos.map((c) => `${c.eixo}: ${c.detalhe}`), destinoId: destino?.m.id, destinoNome: destino?.m.nome, confiancaDestino: destino?.conf, aplicavel, motivoNaoAplicavel: motivo,
        });
      }
    }

    // ---- DIVISÃO: masters que são o mesmo produto
    const juncoes: SugestaoJuncao[] = sugerirJuncoes(masters, motor);
    const vivos = (id: string) => mById.get(id)?.ofertas.filter((o) => o.status === 'active').length ?? 0;
    const juncAplicaveis = juncoes.filter((j) => j.aplicavel && vivos(j.incorporarId) > 0);

    const plano = { gerado: new Date().toISOString(), mastersLidos: M.length, ofertasLidas: O.length, acoes, juncoes, juncAplicaveis: juncAplicaveis.map((j) => j.canonicoId + '>' + j.incorporarId), revisarNome };
    fs.mkdirSync(path.join(ROOT, 'docs', 'backups'), { recursive: true });
    const arqPlano = path.join(ROOT, 'docs', 'backups', `cesta-nlp-plano-${HOJE}.json`);
    fs.writeFileSync(arqPlano, JSON.stringify(plano));

    const nome = (id: string) => (mById.get(id)?.nome ?? '').slice(0, 90);
    const linhas: string[] = [];
    const L = (s = '') => linhas.push(s);
    L(`# Cestas por modelo (NLP leve): sugestões de ${HOJE}`);
    L();
    L('Modo padrão **sugerir**: nada foi gravado. Gerado por `scripts/cesta-nlp.ts sugerir` (R-115). Regras do dono respeitadas: região, cross-geração, edição limitada e combos separam; cor junta; Open Box e usado fora; peça e acessório nunca entram na cesta do principal; PS5 ignora capacidade; decisão humana (`catalogGate.manual`) nunca é desfeita.');
    L();
    L('## Medida desta rodada');
    L();
    L(`- Masters lidos: ${M.length}; ofertas ativas/rascunho lidas: ${O.length} (${Math.round((Date.now() - t0) / 1000)} s de leitura e análise, consultas paginadas).`);
    L(`- Ofertas com título IDÊNTICO ao do master (certas por definição): ${trivial}. Ofertas que o modelo precisou julgar: ${ofertas - trivial}.`);
    L(`- **Ofertas com conflito duro com o produto da cesta (fusão errada): ${fora}** em ${cestasComFora} cestas (${(100 * fora / Math.max(1, ofertas)).toFixed(2)}% das ofertas; ${(100 * fora / Math.max(1, ofertas - trivial)).toFixed(2)}% das que o modelo julgou).`);
    L(`- Cestas em que o NOME do master é o suspeito (a maioria das ofertas diverge dele): ${cestasNomeDiv}. Nada é aplicado nelas; a lista está no fim.`);
    L(`- Pares de masters que parecem o mesmo produto (divisão): ${juncoes.length}; com confiança >= ${LIMIAR_APLICAR} e sem trava: ${juncoes.filter((j) => j.aplicavel).length}; destes com ofertas ativas a mover: ${juncAplicaveis.length}.`);
    L();
    L('### Conflitos por eixo');
    L();
    L('| Eixo | Ofertas |'); L('|---|---|');
    for (const [e, n] of Object.entries(porEixo).sort((a, b) => b[1] - a[1])) L(`| ${e} | ${n}${aplicavelEixo(e) ? '' : ' (só sugestão)'} |`);
    L();
    L('### Por tipo de cadastro');
    L();
    L('| Departamento/tipo | Ofertas | Fora da cesta | % |'); L('|---|---|---|---|');
    for (const [k, v] of Object.entries(porVertical).sort((a, b) => b[1].fora - a[1].fora)) L(`| ${k} | ${v.ofertas} | ${v.fora} | ${(100 * v.fora / Math.max(1, v.ofertas)).toFixed(1)}% |`);
    L();
    const aplic = acoes.filter((a) => a.aplicavel);
    L(`## 1. Ofertas fora da cesta (${acoes.length}); aplicáveis em lote: ${aplic.length} (mover ${aplic.filter((a) => a.tipo === 'mover').length}, quarentena ${aplic.filter((a) => a.tipo === 'quarentena').length})`);
    L();
    L('| Ação | Rede | Oferta | Produto da cesta | Conflito | Aplicável |'); L('|---|---|---|---|---|---|');
    for (const a of acoes.slice(0, 400)) L(`| ${a.tipo}${a.destinoNome ? ' para: ' + a.destinoNome.slice(0, 50) : ''} | ${a.rede.slice(0, 3)} | ${a.titulo.slice(0, 70).replace(/\|/g, '/')} | ${a.masterNome.slice(0, 55).replace(/\|/g, '/')} | ${a.conflitos.slice(0, 2).join('; ').slice(0, 80).replace(/\|/g, '/')} | ${a.aplicavel ? 'sim' : a.motivoNaoAplicavel} |`);
    if (acoes.length > 400) L(`\n(+${acoes.length - 400} no plano JSON)`);
    L();
    L(`## 2. Masters duplicados (mesmo produto em cestas diferentes): ${juncoes.length}`);
    L();
    L('| Confiança | Canônico | A incorporar | Ofertas ativas (inc.) | Aplicável | Travas / dúvidas |'); L('|---|---|---|---|---|---|');
    for (const j of juncoes.slice(0, 250)) L(`| ${j.confianca} | ${nome(j.canonicoId).replace(/\|/g, '/')} | ${nome(j.incorporarId).replace(/\|/g, '/')} | ${vivos(j.incorporarId)} | ${j.aplicavel ? 'sim' : 'não'} | ${[...j.travas, ...j.conflitosSuaves.filter((s) => !/^(?:tipo_desconhecido|marca_desconhecida)$/.test(s))].join(', ')} |`);
    if (juncoes.length > 250) L(`\n(+${juncoes.length - 250} no plano JSON)`);
    L();
    L(`## 3. Cestas com nome de master suspeito (${revisarNome.length}), para o dono decidir`);
    L();
    L('| Master | Título mais comum das ofertas | Ofertas em conflito |'); L('|---|---|---|');
    for (const r of revisarNome.slice(0, 80)) L(`| ${r.nome.slice(0, 70).replace(/\|/g, '/')} | ${(r.sugerido ?? '').slice(0, 70).replace(/\|/g, '/')} | ${r.n} |`);
    L();
    L(`## 4. Cestas MISTAS (as ofertas se contradizem entre si num eixo que o nome não fixa): ${mistas.length}`);
    L();
    L('Ex.: 110V e 220V na mesma cesta (decisão do dono: voltagem, região, capacidade, tamanho e pack separam). Só sugestão: separar exige criar o master do outro lado.');
    L();
    L('| Eixo | Master | Grupos (ofertas) | Ofertas na minoria |'); L('|---|---|---|---|');
    for (const x of mistas.sort((a, b) => b.minoria - a.minoria).slice(0, 80)) L(`| ${x.eixo} | ${x.nome.slice(0, 70).replace(/\|/g, '/')} | ${Object.entries(x.grupos).map(([k, n]) => k + ':' + n).join(' ')} | ${x.minoria} |`);
    L();
    L('## 5. Efeito na média da cesta (preço atual das ofertas ativas, sem tirar o que a regra já exclui; antes x depois de tirar as ofertas em conflito duro)');
    L();
    L('| Cesta | Ofertas | Tiradas | Média antes | Média depois | Mediana antes | Mediana depois | O que saiu |'); L('|---|---|---|---|---|---|---|---|');
    for (const x of impactos.sort((a, b) => Math.abs(b.mediaDepois / b.mediaAntes - 1) - Math.abs(a.mediaDepois / a.mediaAntes - 1)).slice(0, 25)) L(`| ${x.nome.slice(0, 55).replace(/\|/g, '/')} | ${x.n} | ${x.removidas} | R$ ${x.mediaAntes.toFixed(2)} | R$ ${x.mediaDepois.toFixed(2)} | R$ ${x.medianaAntes.toFixed(2)} | R$ ${x.medianaDepois.toFixed(2)} | ${x.titulos.slice(0, 3).join(' ; ').replace(/\|/g, '/')} |`);
    fs.writeFileSync(path.join(ROOT, 'docs', 'backups', `cesta-nlp-impactos-${HOJE}.json`), JSON.stringify(impactos.sort((a, b) => Math.abs(b.mediaDepois / b.mediaAntes - 1) - Math.abs(a.mediaDepois / a.mediaAntes - 1)).slice(0, 40)));
    const saida = path.resolve(ROOT, arg('--saida') ?? 'docs/evidencias/cestas-nlp-sugestoes-2026-11-22.md');
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    fs.writeFileSync(saida, linhas.join('\n') + '\n');
    console.log(JSON.stringify({ masters: M.length, ofertas, trivial, fora, cestasComFora, cestasNomeDiv, acoes: acoes.length, aplicaveis: aplic.length, mistas: mistas.length, impactos: impactos.length, juncoes: juncoes.length, juncAplicaveis: juncAplicaveis.length, plano: arqPlano, relatorio: saida }));
  } finally { await sql.end(); }
}

async function aplicar() {
  const mod = cestaNlpModo();
  if (mod !== 'aplicar') { console.error(`CESTA_NLP=${process.env.CESTA_NLP ?? '(vazio)'}: modo ${mod}. Para aplicar use CESTA_NLP=aplicar. Nada foi gravado.`); process.exit(mod === 'off' ? 0 : 2); }
  const arqPlano = arg('--plano'); if (!arqPlano) throw new Error('--plano <arquivo> é obrigatório');
  const lote = Number(arg('--lote') ?? 20), nJunc = Number(arg('--juncoes') ?? 0);
  const plano = JSON.parse(fs.readFileSync(path.resolve(arqPlano), 'utf8')) as { acoes: AcaoOferta[]; juncoes: SugestaoJuncao[] };
  const eixos = (arg('--eixos') ?? '').split(',').filter(Boolean);
  const escolhidas = plano.acoes.filter((a) => a.aplicavel && (!eixos.length || a.conflitos.some((c) => eixos.includes(c.split(':')[0])))).slice(0, lote);
  // junções sem sobreposição: um master não entra em dois pares do mesmo lote
  const usados = new Set<string>();
  const juncs = plano.juncoes.filter((j) => {
    if (!j.aplicavel || usados.has(j.canonicoId) || usados.has(j.incorporarId)) return false;
    usados.add(j.canonicoId); usados.add(j.incorporarId); return true;
  }).slice(0, nJunc);
  console.log(`Plano: ${escolhidas.length} ofertas (mover ${escolhidas.filter((a) => a.tipo === 'mover').length}, quarentena ${escolhidas.filter((a) => a.tipo === 'quarentena').length}) e ${juncs.length} junções.`);
  if (!APPLY) { for (const a of escolhidas) console.log(`  [dry] ${a.tipo} | ${a.titulo.slice(0, 70)} | cesta: ${a.masterNome.slice(0, 50)} | ${a.conflitos[0]}`); for (const j of juncs) console.log(`  [dry] juntar ${j.incorporarId.slice(0, 8)} -> ${j.canonicoId.slice(0, 8)} conf ${j.confianca}`); console.log('DRY-RUN: nada gravado (use --apply).'); return; }
  const sql = connect();
  try {
    const antes = await enviosPorHora(sql);
    console.log('Envio antes (enviadas na última hora / hora anterior):', antes);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dirB = path.join(ROOT, 'docs', 'backups'); fs.mkdirSync(dirB, { recursive: true });
    const arqBackup = path.join(dirB, `cesta-nlp-backup-${ts}.ndjson`), arqLog = path.join(dirB, `cesta-nlp-log-${ts}.json`);
    const log: { quando: string; ofertas: Array<{ id: string; masterAntes: string; masterDepois: string | null; quarentenaAntes: string | null; tipo: string }>; juncoes: Array<{ canonico: string; incorporado: string; ofertas: string[] }> } = { quando: new Date().toISOString(), ofertas: [], juncoes: [] };
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = '15s'`);
      const ids = escolhidas.map((a) => a.ofertaId);
      if (ids.length) {
        const atual = await tx.unsafe(`SELECT id::text, master_product_id::text AS mid, status::text AS st, quarantined_at, quarantine_reason, (SELECT attributes->'catalogGate'->>'manual' FROM master_products m WHERE m.id = o.master_product_id) AS gm FROM affiliate_offers o WHERE id = ANY($1::uuid[]) FOR UPDATE`, [ids as any]) as any[];
        fs.writeFileSync(arqBackup, atual.map((r) => JSON.stringify(r)).join('\n') + '\n');
        const byId = new Map(atual.map((r) => [r.id, r]));
        for (const a of escolhidas) {
          const r = byId.get(a.ofertaId);
          if (!r || r.mid !== a.masterId || r.st !== 'active' || r.quarantined_at || r.gm === 'approved' || r.gm === 'rejected') { console.log('  pulada (mudou desde o plano):', a.ofertaId.slice(0, 8)); continue; }
          if (a.tipo === 'mover' && a.destinoId) {
            await tx.unsafe(`UPDATE affiliate_offers SET master_product_id = $1::uuid, updated_at = now() WHERE id = $2::uuid AND master_product_id = $3::uuid`, [a.destinoId, a.ofertaId, a.masterId]);
            log.ofertas.push({ id: a.ofertaId, masterAntes: a.masterId, masterDepois: a.destinoId, quarentenaAntes: null, tipo: 'mover' });
          } else {
            await tx.unsafe(`UPDATE affiliate_offers SET quarantined_at = now(), quarantine_reason = $1, updated_at = now() WHERE id = $2::uuid AND quarantined_at IS NULL`, [MOTIVO_CESTA_NLP, a.ofertaId]);
            log.ofertas.push({ id: a.ofertaId, masterAntes: a.masterId, masterDepois: null, quarentenaAntes: null, tipo: 'quarentena' });
          }
        }
      }
      for (const j of juncs) {
        const gms = await tx.unsafe(`SELECT id::text, attributes->'catalogGate'->>'manual' AS gm, attributes->>'mergedInto' AS merged FROM master_products WHERE id = ANY($1::uuid[])`, [[j.canonicoId, j.incorporarId] as any]) as any[];
        if (gms.length !== 2 || gms.some((g) => g.merged || g.gm === 'approved' || g.gm === 'rejected')) { console.log('  junção pulada (decisão humana ou arquivado):', j.incorporarId.slice(0, 8)); continue; }
        const mov = await tx.unsafe(`UPDATE affiliate_offers SET master_product_id = $1::uuid, updated_at = now() WHERE master_product_id = $2::uuid AND status IN ('active','draft') RETURNING id::text`, [j.canonicoId, j.incorporarId]) as any[];
        log.juncoes.push({ canonico: j.canonicoId, incorporado: j.incorporarId, ofertas: mov.map((r) => r.id) });
      }
      fs.writeFileSync(arqLog, JSON.stringify(log, null, 1));
    });
    console.log(`Gravado: ${log.ofertas.length} ofertas, ${log.juncoes.reduce((s, j) => s + j.ofertas.length, 0)} ofertas movidas por junção. Log: ${arqLog}`);
    await new Promise((r) => setTimeout(r, 20_000));
    const depois = await enviosPorHora(sql);
    console.log('Envio depois:', depois);
    if (antes.ultimaHora > 20 && depois.ultimaHora < antes.ultimaHora * 0.7) console.log('ATENÇÃO: o envio caiu mais de 30%; PARE e investigue (rollback disponível):', `rollback --log ${arqLog} --apply`);
  } finally { await sql.end(); }
}

async function rollback() {
  const arq = arg('--log'); if (!arq) throw new Error('--log <arquivo> é obrigatório');
  const log = JSON.parse(fs.readFileSync(path.resolve(arq), 'utf8')) as { ofertas: Array<{ id: string; masterAntes: string; masterDepois: string | null; tipo: string }>; juncoes: Array<{ canonico: string; incorporado: string; ofertas: string[] }> };
  console.log(`Rollback de ${log.ofertas.length} ofertas e ${log.juncoes.length} junções (${APPLY ? 'APLICANDO' : 'dry-run'}).`);
  if (!APPLY) return;
  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = '15s'`);
      for (const o of log.ofertas) {
        if (o.tipo === 'mover') await tx.unsafe(`UPDATE affiliate_offers SET master_product_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`, [o.masterAntes, o.id]);
        else await tx.unsafe(`UPDATE affiliate_offers SET quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE id = $1::uuid AND quarantine_reason = $2`, [o.id, MOTIVO_CESTA_NLP]);
      }
      for (const j of log.juncoes) if (j.ofertas.length) await tx.unsafe(`UPDATE affiliate_offers SET master_product_id = $1::uuid, updated_at = now() WHERE id = ANY($2::uuid[])`, [j.incorporado, j.ofertas as any]);
    });
    console.log('Rollback concluído.');
  } finally { await sql.end(); }
}

(async () => {
  if (cestaNlpModo() === 'off' && modo !== 'rollback') { console.log('CESTA_NLP=off: desligado, nada a fazer.'); return; }
  if (modo === 'sugerir') await sugerir();
  else if (modo === 'aplicar') await aplicar();
  else if (modo === 'rollback') await rollback();
  else throw new Error('modo desconhecido: ' + modo);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
