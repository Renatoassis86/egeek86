import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';
import { departamentoClicaveisCtes } from '@/server/queries/departamento';
import { verticalSql } from '@/lib/catalog/verticais';
import { ehItemMiudoOuDuvida } from '@/lib/catalog/item-miudo';
import { modeloGuia3d } from '@/lib/messaging/prioridade-3d';
import {
  decidir, monitorPrecoLigado, posicaoModelo, textoAvisoPreco, JANELA_MINIMO_DIAS,
  type Acao, type MenorPreco,
} from '@/lib/coupons/monitor-preco-impressoras';

/**
 * Monitor de preço das impressoras 3D (#114): aviso PRIVADO ao dono (TELEGRAM_ALERT_CHAT_ID) quando o menor preço de um modelo cai.
 * Ofertas elegíveis = as da guia 3D do Plus (departamentoClicaveisCtes: porteiro, sem quarentena, link pronto, frescor 24 h ML/Shopee e Amazon).
 * Grupo idêntico: combo e avulsa são modelos distintos (modeloGuia3d); Kobra por produto. Ordem: combo primeiro, Kobra por último.
 * Estado durável em collector_runs (job 'impressora-preco-monitor', meta.chave/cents/rede/tipo): sem tabela nova.
 * 1ª execução de um modelo grava só a linha de base, SEM avisar. Dry-run (sem COLLECTOR_ALERTS=1/chat/token): calcula e devolve, não grava.
 * Flag PRINTER_PRICE_ALERT (padrão ligada). Nunca lança, nunca imprime o chat/token, limite de tempo próprio.
 */
const JOB = 'impressora-preco-monitor';
const LIMITE_MS = 8000;
const MAX_AVISOS = 5;

export interface Linha { chave: string; atual: MenorPreco; acao: Acao; baseCents: number | null; min14: number | null }
export interface ResultadoMonitorPreco { ligado: boolean; dryRun: boolean; modelos: number; enviaria: number; enviados: number; baselines: number; linhas: Linha[]; avisos: string[] }

interface RowOferta { master_id: string; name: string; price: string | number; rede: string; loja: string | null; slug: string }

/** Menor preço atual por modelo (ordem do dono). Exportado para o dry-run e os testes. */
export async function menoresPrecosImpressoras(): Promise<MenorPreco[]> {
  const rows = (await db.execute<RowOferta & Record<string, unknown>>(sql`
    WITH ${departamentoClicaveisCtes('impressao3d', { vitrine: true })}
    SELECT m.id::text AS master_id, m.name, sb.current_price_cents AS price, sb.network_slug AS rede, sb.offer_slug AS slug,
           COALESCE(NULLIF(o.store_name, ''), s.nickname) AS loja
    FROM seller_best sb
    INNER JOIN master_products m ON m.id = sb.master_product_id
    INNER JOIN affiliate_offers o ON o.id = sb.id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE ${verticalSql('m', 'impressao3d')} AND m.name ~* '(bambu|kobra|anycubic)'
  `)) as unknown as RowOferta[];
  const melhor = new Map<string, MenorPreco>();
  for (const r of rows) {
    const preco = Number(r.price);
    if (!(preco > 0) || (r.rede !== 'mercado-livre' && r.rede !== 'amazon' && r.rede !== 'shopee')) continue;
    if (ehItemMiudoOuDuvida(r.name, preco, 'general', 'impressao3d')) continue;
    const m = modeloGuia3d(r.name);
    let chave: string; let rotulo: string;
    if (m) { chave = m.slug; rotulo = m.rotulo; }
    else if (/kobra/i.test(r.name)) { chave = `kobra:${r.master_id}`; rotulo = r.name; }
    else continue;
    const atual = melhor.get(chave);
    if (!atual || preco < atual.cents) melhor.set(chave, { chave, rotulo, cents: preco, rede: r.rede, loja: r.loja, slug: r.slug });
  }
  return [...melhor.values()].sort((a, b) => posicaoModelo(a.chave) - posicaoModelo(b.chave) || a.cents - b.cents);
}

interface Estado { base: { cents: number; rede: string } | null; min14: number | null; ultimoAvisoEm: Date | null; ultimoCents: number | null }

async function carregarEstados(): Promise<Map<string, Estado>> {
  const rows = (await db.execute<{ chave: string; tipo: string; cents: string; rede: string; at: Date | string }>(sql`
    SELECT meta->>'chave' AS chave, meta->>'tipo' AS tipo, meta->>'cents' AS cents, meta->>'rede' AS rede, started_at AS at
    FROM collector_runs WHERE job = ${JOB} AND started_at > now() - (${JANELA_MINIMO_DIAS}::int * interval '1 day') AND meta->>'chave' IS NOT NULL
    ORDER BY started_at ASC`)) as unknown as { chave: string; tipo: string; cents: string; rede: string; at: Date | string }[];
  const out = new Map<string, Estado>();
  for (const r of rows) {
    const e = out.get(r.chave) ?? { base: null, min14: null, ultimoAvisoEm: null, ultimoCents: null };
    const c = Number(r.cents);
    e.min14 = e.min14 == null ? c : Math.min(e.min14, c);
    e.ultimoCents = c;
    if (r.tipo === 'baseline' || r.tipo === 'aviso') e.base = { cents: c, rede: r.rede };
    if (r.tipo === 'aviso') e.ultimoAvisoEm = new Date(r.at);
    out.set(r.chave, e);
  }
  return out;
}

async function gravar(tipo: 'baseline' | 'aviso' | 'obs', m: MenorPreco): Promise<void> {
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES (${JOB}, ${m.rede}, now(), now(), 0, 'ok', ${JSON.stringify({ chave: m.chave, tipo, cents: m.cents, rede: m.rede, loja: m.loja, slug: m.slug })}::jsonb)`);
}

async function executar(now: Date): Promise<ResultadoMonitorPreco> {
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  const dryRun = process.env.COLLECTOR_ALERTS !== '1' || !chat || !process.env.TELEGRAM_BOT_TOKEN;
  const res: ResultadoMonitorPreco = { ligado: true, dryRun, modelos: 0, enviaria: 0, enviados: 0, baselines: 0, linhas: [], avisos: [] };
  const [menores, estados] = await Promise.all([menoresPrecosImpressoras(), carregarEstados()]);
  res.modelos = menores.length;
  for (const m of menores) {
    const est = estados.get(m.chave);
    const acao = decidir({ atual: m, base: est?.base ?? null, min14: est?.min14 ?? null, ultimoAvisoEm: est?.ultimoAvisoEm ?? null, now });
    res.linhas.push({ chave: m.chave, atual: m, acao, baseCents: est?.base?.cents ?? null, min14: est?.min14 ?? null });
    if (acao === 'baseline') {
      res.baselines++;
      if (!dryRun) await gravar('baseline', m);
      continue;
    }
    if (acao === 'nada') {
      if (!dryRun && est?.ultimoCents !== m.cents) await gravar('obs', m);
      continue;
    }
    res.enviaria++;
    const texto = textoAvisoPreco(acao, m, est!.base!.cents);
    if (dryRun) { res.avisos.push(texto); continue; }
    if (res.enviados >= MAX_AVISOS) continue;
    const r = await sendTelegramMessage(chat!, texto);
    if (r.ok) { await gravar('aviso', m); res.enviados++; }
  }
  return res;
}

export async function monitorarPrecoImpressoras(now: Date = new Date()): Promise<ResultadoMonitorPreco> {
  const vazio: ResultadoMonitorPreco = { ligado: monitorPrecoLigado(), dryRun: true, modelos: 0, enviaria: 0, enviados: 0, baselines: 0, linhas: [], avisos: [] };
  if (!vazio.ligado) return vazio;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<ResultadoMonitorPreco>((resolve) => { timer = setTimeout(() => resolve(vazio), LIMITE_MS); });
    const r = await Promise.race([executar(now), limite]);
    if (timer) clearTimeout(timer);
    return r;
  } catch (e) {
    console.error('[monitor-preco-impressoras] falhou:', e instanceof Error ? e.message : e);
    return vazio;
  }
}
