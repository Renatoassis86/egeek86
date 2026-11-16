import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { estadoAposConferencia, podeConferir, prioridadeDeConferencia, venceSemConferencia, type Agregado, type EstadoCandidato, type ResultadoCodigo } from '@/lib/coupons/candidato';
import { validateBatch } from './normalize';
import { ingestCouponBatch } from './store';

/** Camada de banco dos candidatos de cupom (R-79; migration 0064). SQL cru, como o resto dos cupons. Nunca guarda texto do post nem link de afiliado alheio. */

export interface LinhaCandidato {
  id: string; rede: string; codigo: string; valor_tipo: string | null; valor_num: string | null; minimo_cents: string | null; limite_cents: string | null;
  escopo_dito: string | null; fontes: string[]; contagem_fontes: number; primeira_vez_visto: string; ultima_vez_visto: string; esgotado_visto_em: string | null;
  estado: EstadoCandidato; motivo_estado: string | null; tentativas: number; conferido_em: string | null; lido_na_loja: unknown;
}

const TS = (c: string) => sql.raw(`to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${c}`);
const COLS = sql`id::text AS id, rede, codigo, valor_tipo, valor_num::text AS valor_num, minimo_cents::text AS minimo_cents, limite_cents::text AS limite_cents, escopo_dito, fontes, contagem_fontes,
  ${TS('primeira_vez_visto')}, ${TS('ultima_vez_visto')}, ${TS('esgotado_visto_em')}, estado, motivo_estado, tentativas, ${TS('conferido_em')}, lido_na_loja`;

/** Grava/atualiza candidatos (dedupe por rede+código). Estado de quem já foi conferido nunca volta para candidato. */
export async function gravarAgregados(ags: readonly Agregado[]): Promise<{ novos: number; atualizados: number }> {
  let novos = 0, atualizados = 0;
  for (const a of ags) {
    const r = (await db.execute(sql`
      INSERT INTO cupom_candidato (rede, codigo, valor_tipo, valor_num, minimo_cents, limite_cents, escopo_dito, fontes, contagem_fontes, primeira_vez_visto, ultima_vez_visto, esgotado_visto_em)
      VALUES (${a.rede}, ${a.codigo}, ${a.valorTipo}, ${a.valorNum}, ${a.minimoCents}, ${a.limiteCents}, ${a.escopoDito}, ${'{' + a.fontes.join(',') + '}'}::text[], ${a.fontes.length},
              ${a.primeiraVez.toISOString()}::timestamptz, ${a.ultimaVez.toISOString()}::timestamptz, ${a.esgotadoVistoEm ? a.esgotadoVistoEm.toISOString() : null}::timestamptz)
      ON CONFLICT (rede, codigo) DO UPDATE SET
        fontes = (SELECT array_agg(DISTINCT f) FROM unnest(cupom_candidato.fontes || EXCLUDED.fontes) f),
        contagem_fontes = (SELECT count(DISTINCT f) FROM unnest(cupom_candidato.fontes || EXCLUDED.fontes) f)::int,
        primeira_vez_visto = LEAST(cupom_candidato.primeira_vez_visto, EXCLUDED.primeira_vez_visto),
        ultima_vez_visto = GREATEST(cupom_candidato.ultima_vez_visto, EXCLUDED.ultima_vez_visto),
        esgotado_visto_em = GREATEST(cupom_candidato.esgotado_visto_em, EXCLUDED.esgotado_visto_em),
        valor_tipo = COALESCE(cupom_candidato.valor_tipo, EXCLUDED.valor_tipo), valor_num = COALESCE(cupom_candidato.valor_num, EXCLUDED.valor_num),
        minimo_cents = COALESCE(cupom_candidato.minimo_cents, EXCLUDED.minimo_cents), limite_cents = COALESCE(cupom_candidato.limite_cents, EXCLUDED.limite_cents),
        escopo_dito = CASE WHEN cupom_candidato.escopo_dito IS NULL OR cupom_candidato.escopo_dito IN ('desconhecido','produto') THEN EXCLUDED.escopo_dito ELSE cupom_candidato.escopo_dito END
      RETURNING (xmax = 0) AS novo`)) as unknown as { novo: boolean }[];
    if (r[0]?.novo) novos++; else atualizados++;
  }
  return { novos, atualizados };
}

/** Fila de conferência do ML (só ele tem validador por código), por prioridade; respeita 30 min entre conferências e 3 tentativas. */
export async function filaDeConferencia(now: Date, limite = 5): Promise<LinhaCandidato[]> {
  const rows = (await db.execute(sql`SELECT ${COLS} FROM cupom_candidato WHERE rede = 'mercado-livre' AND estado IN ('candidato','em_conferencia') ORDER BY ultima_vez_visto DESC LIMIT 200`)) as unknown as LinhaCandidato[];
  return rows
    .filter((r) => podeConferir({ estadoAtual: r.estado, tentativas: r.tentativas, ultimaConferenciaEm: r.conferido_em ? new Date(r.conferido_em) : null, now }))
    .map((r) => ({ r, p: prioridadeDeConferencia({ fontes: r.fontes, ultimaVez: new Date(r.ultima_vez_visto), escopoDito: (r.escopo_dito ?? 'desconhecido') as never, restrito: false, esgotadoVistoEm: r.esgotado_visto_em ? new Date(r.esgotado_visto_em) : null, rede: 'mercado-livre' }, now) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, limite)
    .map((x) => x.r);
}

/** Candidato sem aceite em 24 h da primeira vez visto vira expirado. */
export async function expirarVelhos(now: Date): Promise<number> {
  const rows = (await db.execute(sql`SELECT id::text AS id, ${TS('primeira_vez_visto')} FROM cupom_candidato WHERE estado IN ('candidato','em_conferencia')`)) as unknown as { id: string; primeira_vez_visto: string }[];
  const ids = rows.filter((r) => venceSemConferencia(new Date(r.primeira_vez_visto), now)).map((r) => r.id);
  for (const id of ids) await db.execute(sql`UPDATE cupom_candidato SET estado = 'expirado', motivo_estado = 'sem_aceite_em_24h' WHERE id = ${id}::uuid`);
  return ids.length;
}

export interface ResultadoConferencia { ok: boolean; erro?: string; estado?: EstadoCandidato; motivo?: string; ingestao?: string }

/**
 * Registra o resultado lido pela aba logada (Cupons > Inserir código). Só o que a LOJA mostrou entra em `lido_na_loja`. `aceito` com escopo declarado
 * "todo o site" (e só ele) entra em `coupon_items` como `loja_inteira` na fonte `portal_listagem` e segue o caminho normal (agulha + cofre: prova `lista_oficial_de_cupons`, TTL 120 min).
 * Escopo "selecionados"/categoria NÃO entra como plataforma inteira: fica validado só no candidato e é aplicado por item, com simulação.
 */
export async function registrarConferencia(codigo: string, resultado: ResultadoCodigo, now: Date): Promise<ResultadoConferencia> {
  const rows = (await db.execute(sql`SELECT ${COLS} FROM cupom_candidato WHERE rede = 'mercado-livre' AND codigo = ${codigo}`)) as unknown as LinhaCandidato[];
  const c = rows[0];
  if (!c) return { ok: false, erro: 'candidato_inexistente' };
  const dec = estadoAposConferencia({
    estadoAtual: c.estado, tentativas: c.tentativas, ultimaConferenciaEm: c.conferido_em ? new Date(c.conferido_em) : null,
    primeiraVez: new Date(c.primeira_vez_visto), esgotadoVistoEm: c.esgotado_visto_em ? new Date(c.esgotado_visto_em) : null, ultimaVez: new Date(c.ultima_vez_visto), now,
  }, resultado);
  const lido = resultado.resultado === 'aceito' ? JSON.stringify(resultado) : null;
  const prova = resultado.resultado === 'aceito' ? 'lista_oficial_de_cupons' : null;
  await db.execute(sql`UPDATE cupom_candidato SET estado = ${dec.estado}, motivo_estado = ${dec.motivo}, tentativas = tentativas + 1, conferido_em = ${now.toISOString()}::timestamptz,
    lido_na_loja = COALESCE(${lido}::jsonb, lido_na_loja), prova_tipo = COALESCE(${prova}, prova_tipo) WHERE id = ${c.id}::uuid`);
  let ingestao: string | undefined;
  if (resultado.resultado === 'aceito' && resultado.escopo === 'todo_o_site' && resultado.valorNum != null && resultado.valorTipo) {
    const body = loteParaIngestao(c.codigo, resultado, now);
    const v = validateBatch(body, now);
    if (!v.ok) ingestao = `recusado:${v.error}`;
    else if (v.rejected.length) ingestao = `recusado:${v.rejected[0]!.reason}`;
    else { const s = await ingestCouponBatch(v); ingestao = `ingerido:${JSON.stringify(s).slice(0, 120)}`; }
  }
  return { ok: true, estado: dec.estado, motivo: dec.motivo, ingestao };
}

/** Lote no contrato de /api/ingest/cupons para um cupom ACEITO pela loja com escopo declarado de plataforma inteira. */
export function loteParaIngestao(codigo: string, resultado: Extract<ResultadoCodigo, { resultado: 'aceito' }>, now: Date) {
  return {
      rede: 'mercado-livre', fonte_url: 'https://www.mercadolivre.com.br/cupons', lidos_em: now.toISOString(), leitura_completa: false,
      cupons: [{
        codigo: codigo, tipo: resultado.valorTipo === 'percentual' ? 'percentual' : 'valor_fixo', valor: resultado.valorNum, valor_unidade: resultado.valorTipo,
        minimo_compra_centavos: resultado.minimoCents ?? undefined, teto_desconto_centavos: resultado.limiteCents ?? undefined,
        escopo: 'loja_inteira', texto_bruto: `${resultado.nome ?? 'Cupom'} ${resultado.escopoTexto ?? ''} (código inserido na conta)`.trim(), condicoes_texto: resultado.escopoTexto ?? 'Em todo o Mercado Livre',
        condicoes: { nome: resultado.nome ?? null, via: 'candidato_inserir_codigo' },
        ...(resultado.validadeIso ? { validade_fim: resultado.validadeIso, validade_origem: 'texto_da_pagina', validade_texto: resultado.validadeTexto ?? 'Vence' } : {}),
      }],
  };
}
