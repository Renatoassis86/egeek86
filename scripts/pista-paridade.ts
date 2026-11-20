/**
 * R-112: RELATORIO DE PARIDADE da pista em sombra. SOMENTE LEITURA, leve (3 consultas com LIMIT, statement_timeout 15 s, 1 conexao).
 *   npx tsx --env-file=.env.local scripts/pista-paridade.ts [horas=1] [--canais=livros,impressao3d]
 * Compara, por canal e hora, o que a admissao decidiu em sombra (pista_decisao) com o que o envio ATUAL realmente enviou (group_messages enviada).
 *
 * CRITERIOS DE PARIDADE (definidos aqui, antes de medir; a ata exige 7 dias para desligar a fila global, a Fase 1 so valida a sombra):
 *   C1 acordo >= 80%: dos envios reais de produto unico que a sombra avaliou, pelo menos 80% foram 'enviaria' (ou 'coberto_pela_pista': a propria sombra ja teria enviado o master antes; a taxa estrita sai ao lado).
 *   C2 zero violacao: nenhuma decisao 'enviaria' viola R-70 (link de afiliado), R-81/R-101 (preco fresco), preco-isca, produto novo/em linha ou
 *      item barrado (os gates sao reavaliados aqui sobre as linhas 'enviaria' com os fatos atuais da oferta).
 *   C3 repeticao: nenhum master com duas decisoes 'enviaria' na janela (sinaliza; pode ser novidade de preco, a conferir).
 *   C4 vagas: nenhum canal/hora com 'enviaria' acima do teto (PISTA_TETO_HORA).
 * "A mais" = a sombra enviaria algo que o envio atual nao enviou (expirou/retido): e o ganho esperado da pista. "A menos" = o envio atual
 * enviou e a sombra descartaria: cada motivo e uma regra da pista a revisar.
 */
import { connect } from './_dup-shared';
import { canaisSombra, gatesInegociaveis, pistaConfig, type PistaConfig } from '../src/lib/pistas/admissao';
import { masterDeLinha, type FatosOferta } from '../src/lib/pistas/candidato';

export interface LinhaDecisao { canal: string; mensagem_id: string; master_id: string | null; tipo: string | null; decisao: 'enviaria' | 'descartaria'; motivo: string; janela: string; status: string; sent_at: string | null }
export interface LinhaReal { id: string; canal: string; sent_at: string; trigger: string; master_id: string | null }

export interface Paridade {
  canal: string; realEmEscopo: number; comDecisao: number; acordo: number; taxaAcordo: number | null; aMais: number; aMenos: number;
  /** Envios reais que a sombra descartaria SO porque ela mesma ja teria enviado o master antes (decisao simulada de outra proposta): nao e divergencia de regra. */
  cobertos: number; taxaComCobertura: number | null; comConfirmacao: number;
  motivosAMenos: Record<string, number>; statusAMais: Record<string, number>; enviariaPorHora: Record<string, number>; maxHora: number; maxTipoHora: number;
}
const FORA_DE_ESCOPO = new Set(['G4', 'RADAR']);
const grupo = (m: string) => m.replace(/_?\d+.*$/, '').slice(0, 40);

export function resumoParidade(decisoes: LinhaDecisao[], reais: LinhaReal[]): Paridade[] {
  const canais = new Set([...decisoes.map((d) => d.canal), ...reais.map((r) => r.canal)]);
  const porMsg = new Map(decisoes.map((d) => [d.mensagem_id, d]));
  return [...canais].sort().map((canal) => {
    const rs = reais.filter((r) => r.canal === canal && !FORA_DE_ESCOPO.has(r.trigger) && r.master_id);
    const comDec = rs.filter((r) => porMsg.has(r.id));
    const acordo = comDec.filter((r) => porMsg.get(r.id)!.decisao === 'enviaria').length;
    const cobertos = comDec.filter((r) => porMsg.get(r.id)!.decisao === 'descartaria' && porMsg.get(r.id)!.motivo.startsWith('coberto_pela_pista')).length;
    const comConfirmacao = comDec.filter((r) => porMsg.get(r.id)!.motivo.startsWith('ok_apos_confirmacao')).length;
    const motivosAMenos: Record<string, number> = {};
    for (const r of comDec) { const d = porMsg.get(r.id)!; if (d.decisao === 'descartaria') motivosAMenos[grupo(d.motivo)] = (motivosAMenos[grupo(d.motivo)] ?? 0) + 1; }
    const ds = decisoes.filter((d) => d.canal === canal);
    const mais = ds.filter((d) => d.decisao === 'enviaria' && d.status !== 'enviada');
    const statusAMais: Record<string, number> = {};
    for (const d of mais) statusAMais[d.status] = (statusAMais[d.status] ?? 0) + 1;
    const enviariaPorHora: Record<string, number> = {}; const tipoHora: Record<string, number> = {};
    for (const d of ds.filter((x) => x.decisao === 'enviaria')) {
      enviariaPorHora[d.janela] = (enviariaPorHora[d.janela] ?? 0) + 1;
      const k = `${d.janela}|${d.tipo ?? '-'}`; tipoHora[k] = (tipoHora[k] ?? 0) + 1;
    }
    return {
      canal, realEmEscopo: rs.length, comDecisao: comDec.length, acordo, taxaAcordo: comDec.length ? acordo / comDec.length : null,
      aMais: mais.length, aMenos: comDec.length - acordo, cobertos, taxaComCobertura: comDec.length ? (acordo + cobertos) / comDec.length : null, comConfirmacao, motivosAMenos, statusAMais, enviariaPorHora,
      maxHora: Math.max(0, ...Object.values(enviariaPorHora)), maxTipoHora: Math.max(0, ...Object.values(tipoHora)),
    };
  });
}

export const ACORDO_MIN = 0.8;
export function veredito(p: Paridade[], violacoes: number, repeticoes: number, cfg: PistaConfig): { c1: boolean | null; c2: boolean; c3: boolean; c4: boolean } {
  // C1 conta como acordo o 'enviaria' e o 'coberto pela pista' (a sombra ja teria enviado o master antes); a taxa estrita sai ao lado no relatorio.
  const com = p.reduce((a, x) => a + x.comDecisao, 0), ac = p.reduce((a, x) => a + x.acordo + x.cobertos, 0);
  return { c1: com ? ac / com >= ACORDO_MIN : null, c2: violacoes === 0, c3: repeticoes === 0, c4: p.every((x) => x.maxHora <= cfg.tetoHora) };
}

async function main() {
  const horas = Math.max(0.25, Math.min(48, Number(process.argv.slice(2).find((a) => /^[0-9.]+$/.test(a))) || 1));
  const argCanais = (process.argv.find((a) => a.startsWith('--canais=')) ?? '').slice(9);
  const canais = (argCanais ? argCanais.split(',') : canaisSombra()).filter(Boolean);
  const alvo = canais.length ? canais : ['livros', 'impressao3d'];
  const cfg = pistaConfig();
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '15s'`;
      const dec = await tx<LinhaDecisao[]>`
        SELECT d.canal, d.mensagem_id::text, d.master_id::text, d.tipo, d.decisao, d.motivo, d.janela::text, g.status, g.sent_at::text
        FROM pista_decisao d JOIN group_messages g ON g.id = d.mensagem_id
        WHERE d.criado_em >= now() - (${horas}::float * interval '1 hour') AND d.canal = ANY(${alvo}) LIMIT 4000`;
      const inicio = dec.length ? new Date(Math.min(...dec.map((d) => Date.parse(d.janela)))) : new Date(Date.now() - horas * 3_600_000);
      const reais = await tx<LinhaReal[]>`
        SELECT id::text, vertical::text AS canal, sent_at::text, trigger, master_product_id::text AS master_id FROM group_messages
        WHERE status = 'enviada' AND created_at >= ${inicio.toISOString()}::timestamptz - interval '1 hour' AND sent_at >= ${inicio.toISOString()}::timestamptz AND vertical = ANY(${alvo}) LIMIT 4000`;
      const p = resumoParidade([...dec], [...reais]);
      console.log(`== Paridade da sombra, ultimas ${horas} h, canais ${alvo.join(',')} (${dec.length} decisoes, ${reais.length} envios reais)`);
      console.table(p.map((x) => ({ canal: x.canal, reais_em_escopo: x.realEmEscopo, com_decisao: x.comDecisao, acordo: x.acordo, taxa_estrita: x.taxaAcordo == null ? 'n/d' : `${Math.round(x.taxaAcordo * 100)}%`, taxa_com_cobertura: x.taxaComCobertura == null ? 'n/d' : `${Math.round(x.taxaComCobertura * 100)}%`, cobertos: x.cobertos, com_confirmacao: x.comConfirmacao, a_mais: x.aMais, a_menos: x.aMenos, max_enviaria_hora: x.maxHora, max_tipo_hora: x.maxTipoHora })));
      for (const x of p) {
        console.log(`-- ${x.canal}: a MENOS (enviado de verdade, sombra descartaria):`, JSON.stringify(x.motivosAMenos));
        console.log(`-- ${x.canal}: a MAIS (sombra enviaria, nao saiu) por status final:`, JSON.stringify(x.statusAMais));
        console.log(`-- ${x.canal}: enviaria por hora:`, JSON.stringify(x.enviariaPorHora));
      }
      // C2: reavalia os gates sobre as linhas 'enviaria' (fatos atuais da oferta; frescor medido na criacao da proposta)
      const env = await tx<{ id: string; vertical: string; master_product_id: string | null; price_cents_detected: string | null; candidate: Record<string, unknown>; created_at: string; offer_id: string | null; motivo: string }[]>`
        SELECT g.id::text, g.vertical::text, g.master_product_id::text, g.price_cents_detected::text, g.candidate, g.created_at::text, g.offer_id::text, d.motivo
        FROM pista_decisao d JOIN group_messages g ON g.id = d.mensagem_id
        WHERE d.criado_em >= now() - (${horas}::float * interval '1 hour') AND d.canal = ANY(${alvo}) AND d.decisao = 'enviaria' LIMIT 1500`;
      const ids = [...new Set(env.map((e) => e.offer_id).filter((x): x is string => !!x))];
      const of = new Map<string, FatosOferta>();
      if (ids.length) {
        const os = await tx<{ id: string; affiliate_url: string | null; affiliate_link_pending: boolean; status: string; quarantined_at: string | null }[]>`SELECT id::text, affiliate_url, affiliate_link_pending, status::text, quarantined_at FROM affiliate_offers WHERE id = ANY(${ids}::uuid[])`;
        for (const o of os) of.set(o.id, { url: o.affiliate_url, pend: !!o.affiliate_link_pending, viva: o.status === 'active' && !o.quarantined_at });
      }
      let violacoes = 0; const exemplos: string[] = [];
      for (const e of env) {
        const f = e.offer_id ? of.get(e.offer_id) : undefined;
        const g = gatesInegociaveis({ master: masterDeLinha(e, f), agora: new Date(e.created_at), config: cfg });
        // oferta que ficou inativa DEPOIS da decisao nao e violacao da admissao; so contam link, frescor, isca, barrados e condicao
        // 'ok_apos_confirmacao_de_preco': a proposta tinha preco velho e a admissao so libera o envio DEPOIS do recheck ao vivo (R-81/R-88); a idade da proposta nao e violacao
        if (g && g !== 'oferta_inativa_ou_em_quarentena' && !(g.startsWith('preco_velho_') && e.motivo.startsWith('ok_apos_confirmacao'))) { violacoes++; if (exemplos.length < 5) exemplos.push(`${e.vertical}:${g}`); }
      }
      const porMaster = new Map<string, number>();
      for (const d of dec) if (d.decisao === 'enviaria' && d.master_id) porMaster.set(d.master_id, (porMaster.get(d.master_id) ?? 0) + 1);
      const repeticoes = [...porMaster.values()].filter((n) => n > 1).length;
      const v = veredito(p, violacoes, repeticoes, cfg);
      console.log(`C1 acordo >= ${ACORDO_MIN * 100}%: ${v.c1 == null ? 'sem dados' : v.c1 ? 'PASSA' : 'FALHA'} | C2 zero violacao (R-70/R-81/isca/novo/barrado): ${v.c2 ? 'PASSA' : 'FALHA'} (${violacoes}${exemplos.length ? ' ' + exemplos.join(' ') : ''}) | C3 repeticao: ${v.c3 ? 'PASSA' : `FALHA (${repeticoes} masters com mais de um enviaria; podem ter novidade de preco)`} | C4 vagas (teto ${cfg.tetoHora}/h): ${v.c4 ? 'PASSA' : 'FALHA'}`);
    });
  } finally { await sql.end({ timeout: 5 }); }
}
if (process.argv[1]?.includes('pista-paridade')) main().catch((e) => { console.error(String((e as Error)?.message ?? e).slice(0, 300)); process.exit(1); });
