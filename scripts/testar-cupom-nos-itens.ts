/**
 * TESTE DE UM CUPOM DE PLATAFORMA CONTRA OS NOSSOS ITENS (R-79). SOMENTE LEITURA. Nunca grava, nunca divulga, nunca compra.
 * Entrada: --codigo X (usa o que a LOJA mostrou em cupom_candidato.lido_na_loja; sem leitura da loja usa o DITO e marca como HIPÓTESE),
 *          ou --valor 220 --tipo reais|percentual [--minimo 1499] [--limite 220] --escopo todo_o_site|selecionados|categoria.
 * Saída: quantas ofertas ativas do ML alcançam o mínimo, quantas o cupom "sim" cobre (só escopo declarado pela loja), quantas "dependem de simulação",
 * desconto estimado (interno; preço final público só com prova de simulação, R-66) e, com --retest, a oferta mais barata que alcança o mínimo para a
 * simulação de carrinho (até antes de pagar, remover o item depois) + o saldo da hora no limite SIMULACOES_POR_HORA.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/testar-cupom-nos-itens.ts --codigo TODO1511SITE [--retest]
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { aplicaNaOferta, type CupomLidoNaLoja, type EscopoDito } from '../src/lib/coupons/candidato';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

(async () => {
  const now = new Date();
  let cupom: CupomLidoNaLoja; let origem = '';
  const codigo = arg('codigo')?.toUpperCase();
  if (codigo) {
    const [c] = (await db.execute(sql`SELECT valor_tipo, valor_num::float AS v, minimo_cents::float AS mn, limite_cents::float AS lm, escopo_dito, estado, lido_na_loja FROM cupom_candidato WHERE rede = 'mercado-livre' AND codigo = ${codigo}`)) as unknown as { valor_tipo: 'reais' | 'percentual' | null; v: number | null; mn: number | null; lm: number | null; escopo_dito: EscopoDito | null; estado: string; lido_na_loja: { valorTipo: 'reais' | 'percentual'; valorNum: number; minimoCents: number | null; limiteCents: number | null; escopo: EscopoDito; validadeIso: string | null } | null }[];
    if (!c) { console.error('candidato não encontrado (rode o coletor antes)'); process.exit(1); }
    if (c.lido_na_loja) {
      const l = c.lido_na_loja;
      cupom = { valorTipo: l.valorTipo, valorNum: l.valorNum, minimoCents: l.minimoCents, limiteCents: l.limiteCents, escopo: l.escopo, validoAte: l.validadeIso ? new Date(l.validadeIso) : null };
      origem = `LIDO NA LOJA (estado ${c.estado})`;
    } else {
      if (!c.valor_tipo || !c.v) { console.error('candidato sem valor dito'); process.exit(1); }
      cupom = { valorTipo: c.valor_tipo, valorNum: c.v, minimoCents: c.mn, limiteCents: c.lm, escopo: c.escopo_dito === 'todo_o_site' ? 'selecionados' : (c.escopo_dito ?? 'desconhecido'), validoAte: null };
      origem = `HIPÓTESE (dito pela comunidade, NÃO provado; estado ${c.estado}); escopo tratado como "selecionados" até a loja declarar`;
    }
  } else {
    cupom = { valorTipo: (arg('tipo') as 'reais' | 'percentual') ?? 'reais', valorNum: Number(arg('valor')), minimoCents: arg('minimo') ? Math.round(Number(arg('minimo')) * 100) : null, limiteCents: arg('limite') ? Math.round(Number(arg('limite')) * 100) : null, escopo: (arg('escopo') as EscopoDito) ?? 'desconhecido', validoAte: null };
    origem = 'PARÂMETROS MANUAIS';
  }
  console.log(`Cupom: ${cupom.valorTipo === 'reais' ? brl(cupom.valorNum * 100) : cupom.valorNum + '%'} | mínimo ${cupom.minimoCents ? brl(cupom.minimoCents) : 'n/d'} | limite ${cupom.limiteCents ? brl(cupom.limiteCents) : 'n/d'} | escopo ${cupom.escopo} | ${origem}`);

  const ofertas = (await db.execute(sql`
    SELECT o.id::text AS id, o.title, o.external_ref, o.current_price_cents::int AS preco, nn.slug AS rede, o.vertical
    FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
    WHERE o.status = 'active' AND nn.slug = 'mercado-livre' AND NOT o.affiliate_link_pending AND o.quarantined_at IS NULL AND o.last_checked_at > now() - interval '48 hours'`)) as unknown as { id: string; title: string; external_ref: string | null; preco: number; rede: string; vertical: string }[];
  const cont = { total: ofertas.length, sim: 0, depende: 0, abaixo_do_minimo: 0, cupom_vencido: 0, outros: 0 };
  const alcance: typeof ofertas = [];
  let somaDesc = 0;
  for (const o of ofertas) {
    const a = aplicaNaOferta(cupom, { id: o.id, rede: o.rede, precoCents: o.preco }, now);
    if (a.aplica === 'sim') { cont.sim++; alcance.push(o); somaDesc += a.descontoEstimadoCents; }
    else if (a.aplica === 'depende') { cont.depende++; alcance.push(o); somaDesc += a.descontoEstimadoCents; }
    else if (a.motivo === 'abaixo_do_minimo') cont.abaixo_do_minimo++;
    else if (a.motivo === 'cupom_vencido') cont.cupom_vencido++;
    else cont.outros++;
  }
  console.log('Ofertas ativas do ML (link de afiliado, sem quarentena, checadas em 48 h):', JSON.stringify(cont));
  console.log(`Alcançam o mínimo: ${alcance.length}; desconto estimado médio (INTERNO, não é preço final): ${alcance.length ? brl(Math.round(somaDesc / alcance.length)) : 'n/d'}`);
  if (cupom.escopo !== 'todo_o_site') console.log('Escopo NÃO declarado como "todo o site" pela loja: nenhuma oferta pode dizer "vale para todos os itens"; cada uma depende de simulação (R-62/R-66).');
  const porVertical: Record<string, number> = {}; for (const o of alcance) porVertical[o.vertical] = (porVertical[o.vertical] ?? 0) + 1;
  console.log('Por vertical entre as que alcançam o mínimo:', JSON.stringify(porVertical));
  alcance.sort((x, y) => y.preco - x.preco);
  for (const o of alcance.slice(0, 8)) console.log(`  ${brl(o.preco)}  ${o.title.slice(0, 70)}  (${o.external_ref ?? 's/ref'})`);

  if (process.argv.includes('--retest')) {
    const limite = Math.max(1, Number(process.env.SIMULACOES_POR_HORA) || 30);
    const [u] = (await db.execute(sql`SELECT count(*)::int AS n FROM coupon_validation_trail WHERE uso = 'simulacao_de_checkout' AND at > now() - interval '1 hour'`)) as unknown as { n: number }[];
    const alvo = [...alcance].sort((x, y) => x.preco - y.preco)[0];
    console.log(`\nRETESTE: simulações na última hora ${u?.n ?? 0}/${limite}.`);
    if (!alvo) console.log('Nenhuma oferta alcança o mínimo: nada a simular.');
    else if ((u?.n ?? 0) >= limite) console.log('Limite por hora atingido: aguardar.');
    else console.log(`Item de teste (o mais barato que alcança o mínimo): ${alvo.id} ${alvo.external_ref ?? ''} ${brl(alvo.preco)}\n  1) abrir o anúncio na aba logada; 2) "Adicionar ao carrinho" (nunca "Comprar agora"); 3) no carrinho/resumo, ler o cupom aplicado e o valor final; 4) PARAR antes de pagar; 5) remover o item e conferir o carrinho;\n  6) POST /api/ingest/cofre-simulacao { rows:[{ offer_id, coupon_ref, resultado:'aplicado'|'nao_aplicado', valor_final_cents, nome, minimo_cents }] }. Sem dado de cartão.`);
  }
  process.exit(0);
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
