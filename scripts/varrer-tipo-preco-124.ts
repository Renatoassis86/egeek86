/**
 * VARREDURA (R-69, dono, 2026-11-16): mede, SEM ALTERAR NADA, a classe de erro "queda/alta/abaixo da media/minimo calculados sobre cotacao de TIPO diferente"
 * (Pix x cheio na Amazon; mesmo vendedor e mesmo anuncio nas demais), nas cotacoes e nas mensagens ja enviadas, e escreve docs/varredura-tipo-preco-2026-11-16.md.
 *   npx tsx --env-file=.env.local scripts/varrer-tipo-preco-124.ts [--backup docs/backups/tipo-preco-amazon-124-....ndjson]
 * --backup = o NDJSON da correcao (scripts/corrigir-tipo-preco-amazon-124.ts): as cotacoes Pix PROVADAS ja corrigidas, para medir o "antes".
 * Mensagens ja publicadas NAO sao apagadas nem corrigidas: so listadas (id, canal, horario, texto) para o dono decidir.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';
import { assinaturaTrocaPixCheio } from '../src/lib/pricing/tipo-preco';

const bi = process.argv.indexOf('--backup');
const BACKUP = bi > 0 ? process.argv[bi + 1] : null;
const SAIDA = 'docs/varredura-tipo-preco-2026-11-16.md';
const brl = (c: number | string | null) => (c == null ? '-' : `R$ ${(Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
const hora = (d: Date | string) => new Date(d).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
const cortar = (t: string | null, n = 260) => (t ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

type Cot = { offer_id: string; id: string; p: number; l: number | null; at: Date; rede: string };

(async () => {
  const sql = connect();
  const out: string[] = [];
  const W = (s = '') => out.push(s);
  try {
    // ---------- cotacoes (45 dias) de todas as redes com a assinatura de troca de tipo ----------
    const rows = (await sql`
      SELECT s.offer_id::text offer_id, s.id::text id, s.price_cents::float8 p, s.list_price_cents::float8 l, s.collected_at at, n.slug rede, o.seller_id
      FROM affiliate_price_snapshots s JOIN affiliate_offers o ON o.id = s.offer_id JOIN affiliate_networks n ON n.id = o.network_id
      WHERE s.collected_at > now() - interval '45 days' AND n.slug IN ('amazon', 'shopee', 'mercado-livre') AND (n.slug <> 'mercado-livre' OR o.seller_id IS NOT NULL)
      ORDER BY s.offer_id, s.collected_at, s.id`) as unknown as (Cot & { seller_id: string | null })[];
    const por = new Map<string, Cot[]>();
    for (const r of rows) { if (!por.has(r.offer_id)) por.set(r.offer_id, []); por.get(r.offer_id)!.push(r); }
    const flips: Record<string, { ofertas: Set<string>; pares: number }> = {};
    const flipsAmazon: { offer: string; de: number; para: number; at: Date }[] = [];
    for (const [id, a] of por) {
      const rede = a[0].rede;
      const R = (flips[rede] ??= { ofertas: new Set(), pares: 0 });
      for (let i = 1; i < a.length; i++) {
        const x = a[i - 1], y = a[i];
        const lo = x.p < y.p ? x : y;
        if (!assinaturaTrocaPixCheio(x.p, y.p, lo.l)) continue;
        const volta = (a[i + 1] && Math.abs(a[i + 1].p - x.p) / x.p < 0.006) || (a[i - 2] && Math.abs(a[i - 2].p - y.p) / y.p < 0.006);
        if (!volta) continue;
        R.pares++; R.ofertas.add(id);
        if (rede === 'amazon') flipsAmazon.push({ offer: id, de: x.p, para: y.p, at: y.at });
      }
    }

    // ---------- provadas (backup da correcao) ----------
    const provadas: { id: string; offer: string; pix: number; cheio: number; at: Date }[] = [];
    if (BACKUP) {
      const l = fs.readFileSync(BACKUP, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
      const novos = await sql`SELECT id::text id, price_cents::float8 p, pix_cents::float8 pix FROM affiliate_price_snapshots WHERE id = ANY(${l.filter((x) => x.t === 'snap').map((x) => x.r.id)}::bigint[])`;
      const nv = new Map(novos.map((r) => [r.id as string, r]));
      for (const x of l.filter((z) => z.t === 'snap')) { const n = nv.get(String(x.r.id)); if (n) provadas.push({ id: String(x.r.id), offer: x.r.offer_id, pix: Number(x.r.price_cents), cheio: Number(n.p), at: new Date(x.r.collected_at) }); }
    }
    const ofProvadas = new Set(provadas.map((p) => p.offer));

    W('# Varredura do tipo de preco (R-69) - 2026-11-16');
    W();
    W('Somente leitura (nada apagado nem postado). Regra e causa: ver `docs/03-metodologia/FLUXO_MESTRE.md` R-69 e `docs/causa-raiz-tipo-preco-2026-11-16.md`.');
    W();
    W('> Residuo conhecido (NAO e tipo de preco): na Amazon o card da busca mostra a oferta em destaque (buybox) e o vendedor ROTACIONA (ex.: WEMAK x TNTinfoLoja x 3D MARKET no P2S Combo); o card nao informa o vendedor e `affiliate_offers.seller_id` esta vazio nas 2.894 ofertas ativas da Amazon. Por isso restam ofertas oscilando entre vendedores com a assinatura abaixo. Pendencia da fila #128 (gravar o vendedor do buybox por cotacao a partir da leitura de pagina, que ja o le).');
    W();
    W('## (a) Queda/alta falsa por troca de tipo de preco, por rede (45 dias de cotacoes)');
    W();
    W('Assinatura: cotacoes consecutivas com razao 0,95 ou 0,90 (ou igual a lista do outro lado), com RETORNO ao valor anterior em ate 2 leituras. ML so ofertas com vendedor (placeholder fora).');
    W();
    W('| rede | ofertas com troca | pares de troca | leitura |');
    W('|---|---|---|---|');
    for (const rede of ['amazon', 'mercado-livre', 'shopee']) {
      const R = flips[rede] ?? { ofertas: new Set(), pares: 0 };
      const nota = rede === 'amazon' ? 'Pix x cheio: CAUSA PROVADA (card com "a vista no Pix" x card sem); corrigido na origem e no historico provado'
        : rede === 'mercado-livre' ? 'a coleta grava o campo unico `price` da API; nao existe leitura Pix/meli+ separada: a assinatura aqui e PROMOCAO real que liga e desliga (preco que volta ao original), nao tipo de preco'
          : 'a coleta grava o menor preco entre os modelos do anuncio: a assinatura e variacao real de preco, nao tipo; sem leitura de preco Pix';
      W(`| ${rede} | ${R.ofertas.size} | ${R.pares} | ${nota} |`);
    }
    W();
    W(`Amazon, historico PROVADO e corrigido (cheio como preco da serie, Pix como atributo, backup NDJSON \`${BACKUP ?? '(informe --backup)'}\`): **${provadas.length} cotacoes em ${ofProvadas.size} ofertas**.`);
    W();
    if (provadas.length) {
      W('| oferta | cotacao | preco gravado (era Pix) | preco cheio (agora) | lida em |');
      W('|---|---|---|---|---|');
      for (const p of provadas.slice(0, 40)) W(`| ${p.offer.slice(0, 8)} | ${p.id} | ${brl(p.pix)} | ${brl(p.cheio)} | ${hora(p.at)} |`);
      W();
    }

    // ---------- mensagens publicadas (7 dias) das ofertas Amazon afetadas ----------
    const ofertasAfetadas = [...new Set([...ofProvadas, ...flipsAmazon.map((f) => f.offer)])];
    const msgs = ofertasAfetadas.length ? await sql`
      SELECT gm.id::text id, gm.trigger, gm.channel, gm.sent_at, gm.price_cents_detected::float8 p, gm.avg_cents::float8 avg, gm.text_body, gm.offer_id::text offer_id, left(o.title, 60) titulo
      FROM group_messages gm JOIN affiliate_offers o ON o.id = gm.offer_id
      WHERE gm.status = 'enviada' AND gm.sent_at > now() - interval '7 days' AND gm.offer_id = ANY(${ofertasAfetadas}::uuid[]) ORDER BY gm.sent_at` : [];
    const valoresPix = new Map<string, Set<number>>();
    for (const p of provadas) { if (!valoresPix.has(p.offer)) valoresPix.set(p.offer, new Set()); valoresPix.get(p.offer)!.add(p.pix); }
    for (const f of flipsAmazon) { if (!valoresPix.has(f.offer)) valoresPix.set(f.offer, new Set()); valoresPix.get(f.offer)!.add(Math.min(f.de, f.para)); }
    const ehPix = (m: { offer_id: string; p: number }) => valoresPix.get(m.offer_id)?.has(m.p) ?? false;
    const falaQueda = (t: string | null) => /queda|abaixo da m[eé]dia|m[ií]nimo|menor pre[cç]o|\bera R\$/i.test(cortar(t, 4000));
    const afetadas = msgs.filter((m) => ehPix(m as never));
    const comSerieMista = msgs.filter((m) => !ehPix(m as never) && ofProvadas.has(m.offer_id as string)).length;
    W('## (b) "Abaixo da media", "minimo de 15 dias", "novo minimo" e queda calculados sobre cotacao de tipo diferente: mensagens PUBLICADAS (7 dias)');
    W();
    W(`Ofertas da Amazon com troca de tipo (provada ou pela assinatura): **${ofertasAfetadas.length}**. Mensagens enviadas dessas ofertas nos ultimos 7 dias: **${msgs.length}**; dessas, com o PRECO da mensagem = lado Pix da troca (a media, o minimo e o "abaixo da media" saem do mesmo tipo misturado): **${afetadas.length}**; outras ${comSerieMista} mensagens com preco no lado cheio mas cuja media/minimo de 15 dias saiu de serie com Pix misturado (oferta com cotacao Pix provada).`);
    W();
    W('Nada foi apagado nem corrigido no Telegram. Lista para o dono decidir:');
    W();
    W('| group_message_id | canal | gatilho | enviado | oferta | preco da mensagem | e o preco Pix da troca? | texto |');
    W('|---|---|---|---|---|---|---|---|');
    for (const m of afetadas) W(`| ${String(m.id).slice(0, 8)} | ${m.channel} | ${m.trigger} | ${hora(m.sent_at as Date)} | ${String(m.offer_id).slice(0, 8)} ${String(m.titulo)} | ${brl(m.p as number)} | ${ehPix(m as never) ? 'SIM' : 'nao'} | ${cortar(m.text_body as string).replace(/\|/g, '/')} |`);
    W();

    // ---------- painel privado (queda) ----------
    const q = await sql`
      SELECT r.id::text rid, r.started_at, r.meta->>'chave' chave, r.meta->>'oferta' oferta, n.slug rede, left(o.title, 70) titulo
      FROM collector_runs r JOIN affiliate_offers o ON o.id = (r.meta->>'oferta')::uuid JOIN affiliate_networks n ON n.id = o.network_id
      WHERE r.job = 'lista-impressoras-queda' AND r.started_at > now() - interval '8 days' ORDER BY r.started_at`;
    W('## (b2) Painel privado (impressoras): avisos de queda dos ultimos 8 dias');
    W();
    W(`Avisos de queda/gatilho registrados: **${q.length}**; da Amazon: **${q.filter((x) => x.rede === 'amazon').length}**. Para cada um da Amazon, a oferta e o preco do aviso (chave \`oferta|q|centavos\`) contra a serie corrigida:`);
    W();
    W('| quando | oferta | chave | preco do aviso e Pix? (cotacao provada) |');
    W('|---|---|---|---|');
    for (const x of q.filter((z) => z.rede === 'amazon')) {
      const pr = x.chave ? Number(String(x.chave).split('|').pop()) : NaN;
      const pix = Number.isFinite(pr) && (valoresPix.get(x.oferta)?.has(pr) ?? false);
      W(`| ${hora(x.started_at)} | ${String(x.oferta).slice(0, 8)} ${x.titulo} | ${x.chave ?? '(formato antigo, sem chave)'} | ${pix ? 'SIM: aviso falso (troca Pix x cheio)' : 'nao provado'} |`);
    }
    W();
    W('Caso do dono: aviso `f2dadb6c...|q|807490` (R$ 8.074,90, 2026-11-16 01:21Z) = cotacao Pix provada do P2S Combo (8.499,90 x 0,95): aviso falso.');
    W();

    // ---------- (c) cupom lido de texto ----------
    const cup = await sql`
      SELECT count(*)::int n,
             count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM offer_coupon_reads r WHERE r.offer_id = gm.offer_id AND r.campaign_id IS NOT NULL AND r.read_at <= gm.sent_at AND r.read_at > gm.sent_at - interval '30 minutes'))::int sem_campanha
      FROM group_messages gm WHERE gm.trigger = 'CUPOM' AND gm.status = 'enviada' AND gm.channel = 'tg' AND gm.sent_at > now() - interval '7 days'`;
    W('## (c) Cupom/beneficio lido de texto de pagina (coordenado com o cofre de cupons, R-64 a R-68)');
    W();
    W(`Mensagens CUPOM enviadas no Telegram em 7 dias: **${cup[0].n}**; sem leitura com campaign_id nos 30 min anteriores ao envio: **${cup[0].sem_campanha}**. A lista nominal dos avisos de anuncio sem prova (46 em 48 h, com group_message_id, canal, horario e texto) e do agente do cofre: \`docs/avisos-cupom-sem-prova-2026-11-16.md\`. Esta varredura NAO a duplica nem edita \`src/lib/coupons\`, \`src/server/coupons\`.`);
    W();

    // ---------- (d) isca ----------
    const isca = await sql`
      SELECT count(*)::int n FROM group_messages gm JOIN preco_isca_marcas k ON k.offer_id = gm.offer_id AND k.price_cents = gm.price_cents_detected AND k.liberado_em IS NULL
      WHERE gm.status = 'enviada' AND gm.sent_at > now() - interval '7 days' AND gm.sent_at > k.marcado_em`;
    const isca2 = await sql`
      SELECT count(*)::int n FROM group_messages gm JOIN affiliate_offers o ON o.id = gm.offer_id
      WHERE gm.status = 'enviada' AND gm.sent_at > now() - interval '7 days' AND o.quarantine_reason = 'preco_isca_abaixo_dos_outros_anuncios'`;
    W('## (d) Preco-isca (R-61): sobrou mensagem?');
    W();
    W(`Mensagens enviadas em 7 dias com preco igual a uma cotacao marcada como isca VIGENTE, enviadas DEPOIS da marca: **${isca[0].n}**. Mensagens (qualquer horario) de ofertas hoje em quarentena por isca: **${isca2[0].n}** (enviadas antes da marca; historico, nao reabre).`);
    W();
    fs.writeFileSync(SAIDA, out.join('\n') + '\n');
    console.log(out.slice(0, 40).join('\n').slice(0, 3000));
    console.log('\n-> escrito', SAIDA);
  } finally {
    await sql.end();
  }
})().then(() => process.exit(0)).catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
