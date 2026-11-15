/**
 * Cadastro MANUAL de cupom por código (#116), para o que nenhuma tela das lojas mostra à conta lida (ex.: "Cupom: DESCONTAOMELI" digitado no carrinho).
 * Quem cadastra informa o que LEU/RECEBEU; nada é inventado e nenhum código vem do repositório. Grava em coupon_items com source_kind = 'manual_dono'
 * (a tabela aceita; a rota de ingestão NÃO aceita, de propósito: aba nenhuma consegue gravar manual). Linhas manuais ficam FORA da busca automática
 * de mensagens (findVerifiedCoupons e listActiveCoupons excluem 'manual_dono'): o código chega às mensagens pelo cadastro de campanhas do dono (admin).
 *
 *   npx tsx --env-file=.env.local scripts/cadastrar-cupom-manual.ts --rede mercado-livre --codigo CODIGO --percentual 10 --minimo 100 --teto 50 \
 *       --ate 2026-11-30 --por "Nome de quem leu" --nome "Nome do cupom" --fonte-url https://www.mercadolivre.com.br/...        # dry-run (padrão)
 *   ... mesmos argumentos + --apply                                   # grava (backup NDJSON em docs/backups)
 *   npx tsx --env-file=.env.local scripts/cadastrar-cupom-manual.ts --rollback docs/backups/<arquivo>.ndjson [--apply]   # desfaz (dry-run sem --apply)
 *
 * Argumentos: --rede mercado-livre|shopee|amazon, --codigo (4 a 20: A-Z 0-9 _ -), --percentual N | --reais N (valor), --minimo R$ (opcional), --teto R$ (opcional),
 * --ate AAAA-MM-DD (fim do dia em Brasília; obrigatório e no futuro), --por (quem leu; obrigatório), --nome (opcional), --fonte-url (https do domínio da rede; obrigatório).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hostAllowedForNetwork, isNetwork } from '../src/server/coupons/normalize';
import type { CouponNetwork } from '../src/server/coupons/types';

export interface ManualInput {
  rede: string;
  codigo: string;
  percentual?: number;
  reais?: number;
  minimoReais?: number;
  tetoReais?: number;
  ate: string;
  por: string;
  nome?: string;
  fonteUrl: string;
  lidoEm: Date;
}
export interface ManualRow {
  network_slug: CouponNetwork; code: string; kind: 'percentual' | 'valor_fixo'; value_num: number; value_unit: 'percentual' | 'reais';
  min_order_cents: number | null; max_discount_cents: number | null; conditions_raw: string; conditions: Record<string, string | number | boolean | null>;
  source_url: string; source_kind: 'manual_dono'; raw_text: string; valid_until: string; validity_raw: string; state: 'verificado'; state_reason: string;
  verified_by: string; read_at: string; dedup_hash: string;
}

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,19}$/;
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** PURA: valida o que o cadastrante informou e devolve a linha a gravar (ou o motivo da recusa). */
export function planManualCoupon(i: ManualInput): { ok: true; row: ManualRow } | { ok: false; reason: string } {
  if (!isNetwork(i.rede)) return { ok: false, reason: 'rede_invalida' };
  const network = i.rede;
  const code = String(i.codigo ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code) || !/[A-Z]/.test(code)) return { ok: false, reason: 'codigo_invalido (4 a 20 caracteres A-Z 0-9 _ -, com letra)' };
  const por = String(i.por ?? '').trim();
  if (!por || por.length > 60 || /[^\p{L}\p{N} ._-]/u.test(por)) return { ok: false, reason: 'por_obrigatorio (quem leu o cupom; letras e números)' };
  if (!i.fonteUrl || !hostAllowedForNetwork(i.fonteUrl, network)) return { ok: false, reason: 'fonte_url_fora_da_rede (https do domínio da loja)' };
  const temPct = i.percentual !== undefined, temRs = i.reais !== undefined;
  if (temPct === temRs) return { ok: false, reason: 'informe exatamente um: --percentual ou --reais' };
  const valor = (temPct ? i.percentual : i.reais) as number;
  if (!Number.isFinite(valor) || valor <= 0 || (temPct && valor > 100) || valor > 100000) return { ok: false, reason: 'valor_invalido' };
  const cents = (v: number | undefined) => (v === undefined ? null : Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) : NaN);
  const min = cents(i.minimoReais), teto = cents(i.tetoReais);
  if (Number.isNaN(min) || Number.isNaN(teto)) return { ok: false, reason: 'minimo_ou_teto_invalido' };
  if (!temPct && min !== null && valor * 100 > min) return { ok: false, reason: 'valor_maior_que_o_minimo_incoerente' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(i.ate ?? ''));
  if (!m) return { ok: false, reason: 'ate_invalido (AAAA-MM-DD)' };
  const until = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1, 2, 59, 59)); // fim do dia em Brasília
  if (Number.isNaN(until.getTime()) || until.getUTCDate() < 1 || until.getTime() <= i.lidoEm.getTime()) return { ok: false, reason: 'ate_no_passado_ou_invalido' };
  const nome = i.nome ? String(i.nome).trim().slice(0, 80) : null;
  const kind = temPct ? 'percentual' : 'valor_fixo';
  const value_unit = temPct ? 'percentual' : 'reais';
  const regra = `${temPct ? `${fmt(valor)}%` : `R$ ${fmt(valor)}`} de desconto`;
  const conditions_raw = `Cupom ${code}: ${regra}${min ? `, compra mínima R$ ${fmt(min / 100)}` : ''}${teto ? `, limite de R$ ${fmt(teto / 100)}` : ''}. Cadastrado por ${por}.`;
  const dedup = createHash('sha256').update(JSON.stringify([network, code, kind, valor, value_unit, min, teto, 'loja_inteira', 'manual'])).digest('hex');
  return {
    ok: true,
    row: {
      network_slug: network, code, kind, value_num: valor, value_unit, min_order_cents: min, max_discount_cents: teto, conditions_raw,
      conditions: { uso: 'codigo_digitado', cadastrado_por: por, ...(nome ? { nome } : {}) }, source_url: i.fonteUrl, source_kind: 'manual_dono',
      raw_text: `${nome ?? `Cupom: ${code}`} | ${regra} | Cadastro manual de ${por}`, valid_until: until.toISOString(), validity_raw: `informado por ${por}: até ${i.ate}`,
      state: 'verificado', state_reason: 'cadastro_manual_do_dono', verified_by: `dono:${por}`, read_at: i.lidoEm.toISOString(), dedup_hash: dedup,
    },
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}
const num = (v: string | undefined) => (v === undefined ? undefined : Number(String(v).replace(',', '.')));

async function main() {
  const APPLY = process.argv.includes('--apply');
  const rollbackFile = arg('rollback') ?? (process.argv.includes('--rollback') ? '' : undefined);
  const { connect } = await import('./_dup-shared');
  const sql = connect();
  try {
    if (rollbackFile !== undefined) {
      if (!rollbackFile || !fs.existsSync(rollbackFile)) { console.error('Informe --rollback docs/backups/<arquivo>.ndjson existente.'); process.exitCode = 1; return; }
      const linhas = fs.readFileSync(rollbackFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { acao: 'insert' | 'update'; id: string; antes?: Record<string, unknown> });
      console.log(`${APPLY ? 'ROLLBACK' : 'DRY-RUN do rollback'}: ${linhas.length} linha(s) de ${rollbackFile}`);
      if (!APPLY) { linhas.forEach((l) => console.log(`  ${l.acao === 'insert' ? 'apagaria' : 'restauraria'} ${l.id}`)); return; }
      for (const l of linhas) {
        if (l.acao === 'insert') await sql`DELETE FROM coupon_items WHERE id = ${l.id}::uuid AND source_kind = 'manual_dono'`;
        else if (l.antes) {
          const a = l.antes as Record<string, string | number | null>;
          await sql`UPDATE coupon_items SET value_num = ${a.value_num as string}, min_order_cents = ${a.min_order_cents as string | null}, max_discount_cents = ${a.max_discount_cents as string | null},
            conditions_raw = ${a.conditions_raw as string}, conditions = ${JSON.stringify(a.conditions)}::jsonb, raw_text = ${a.raw_text as string}, valid_until = ${a.valid_until as string | null}::timestamptz,
            validity_raw = ${a.validity_raw as string | null}, state = ${a.state as string}, state_reason = ${a.state_reason as string | null}, verified_at = ${a.verified_at as string | null}::timestamptz,
            verified_by = ${a.verified_by as string | null}, last_seen_at = ${a.last_seen_at as string}::timestamptz, updated_at = now()
            WHERE id = ${l.id}::uuid AND source_kind = 'manual_dono'`;
        }
      }
      console.log('Rollback concluído.');
      return;
    }

    const plan = planManualCoupon({
      rede: arg('rede') ?? '', codigo: arg('codigo') ?? '', percentual: num(arg('percentual')), reais: num(arg('reais')), minimoReais: num(arg('minimo')), tetoReais: num(arg('teto')),
      ate: arg('ate') ?? '', por: arg('por') ?? '', nome: arg('nome'), fonteUrl: arg('fonte-url') ?? '', lidoEm: new Date(),
    });
    if (!plan.ok) { console.error(`Recusado: ${plan.reason}`); process.exitCode = 1; return; }
    const r = plan.row;
    console.log('Linha a gravar:', JSON.stringify({ ...r, verified_by: r.verified_by }, null, 1));
    const ex = await sql<Record<string, unknown>[]>`SELECT * FROM coupon_items WHERE network_slug = ${r.network_slug} AND dedup_hash = ${r.dedup_hash}`;
    console.log(ex.length ? `Já existe (id ${ex[0].id}, source_kind ${ex[0].source_kind}): seria ATUALIZADA.` : 'Não existe: seria INSERIDA.');
    if (ex.length && ex[0].source_kind !== 'manual_dono') { console.error('Existe com outra origem; recusado (nunca sobrescreve leitura automática).'); process.exitCode = 1; return; }
    if (!APPLY) { console.log('DRY-RUN: nada gravado. Repita com --apply.'); return; }

    fs.mkdirSync('docs/backups', { recursive: true });
    const backup = path.join('docs/backups', `cadastrar-cupom-manual-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`);
    let id: string;
    if (ex.length) {
      id = ex[0].id as string;
      const antes = { value_num: ex[0].value_num, min_order_cents: ex[0].min_order_cents, max_discount_cents: ex[0].max_discount_cents, conditions_raw: ex[0].conditions_raw, conditions: ex[0].conditions, raw_text: ex[0].raw_text,
        valid_until: (ex[0].valid_until as Date | null)?.toISOString() ?? null, validity_raw: ex[0].validity_raw, state: ex[0].state, state_reason: ex[0].state_reason,
        verified_at: (ex[0].verified_at as Date | null)?.toISOString() ?? null, verified_by: ex[0].verified_by, last_seen_at: (ex[0].last_seen_at as Date).toISOString() };
      fs.writeFileSync(backup, JSON.stringify({ acao: 'update', id, antes }) + '\n');
      await sql`UPDATE coupon_items SET value_num = ${r.value_num}, min_order_cents = ${r.min_order_cents}, max_discount_cents = ${r.max_discount_cents}, conditions_raw = ${r.conditions_raw},
        conditions = ${JSON.stringify(r.conditions)}::jsonb, raw_text = ${r.raw_text}, valid_until = ${r.valid_until}::timestamptz, validity_raw = ${r.validity_raw}, state = 'verificado',
        state_reason = ${r.state_reason}, verified_at = ${r.read_at}::timestamptz, verified_by = ${r.verified_by}, last_seen_at = ${r.read_at}::timestamptz, updated_at = now() WHERE id = ${id}::uuid`;
    } else {
      const ins = await sql<{ id: string }[]>`
        INSERT INTO coupon_items (network_slug, code, kind, value_num, value_unit, min_order_cents, max_discount_cents, conditions_raw, conditions, audience, scope_kind, scope,
          source_url, source_kind, raw_text, valid_until, validity_source, validity_raw, state, state_reason, first_seen_at, streak_started_at, last_seen_at, verified_at, verified_by, dedup_hash)
        VALUES (${r.network_slug}, ${r.code}, ${r.kind}, ${r.value_num}, ${r.value_unit}, ${r.min_order_cents}, ${r.max_discount_cents}, ${r.conditions_raw}, ${JSON.stringify(r.conditions)}::jsonb,
          'todos', 'loja_inteira', '{}'::jsonb, ${r.source_url}, 'manual_dono', ${r.raw_text}, ${r.valid_until}::timestamptz, 'texto_da_pagina', ${r.validity_raw}, 'verificado', ${r.state_reason},
          ${r.read_at}::timestamptz, ${r.read_at}::timestamptz, ${r.read_at}::timestamptz, ${r.read_at}::timestamptz, ${r.verified_by}, ${r.dedup_hash})
        RETURNING id::text AS id`;
      id = ins[0].id;
      fs.writeFileSync(backup, JSON.stringify({ acao: 'insert', id }) + '\n');
    }
    console.log(`Gravado (id ${id}). Backup/rollback: npx tsx --env-file=.env.local scripts/cadastrar-cupom-manual.ts --rollback ${backup} --apply`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && /cadastrar-cupom-manual/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exitCode = 1; });
