import 'server-only';
import { sql } from 'drizzle-orm';
import type { db as Db } from '@/lib/db';
import { NAO_E_ESTE, NAO_SEI, titleNorm, type QueueOption } from '@/lib/identity-queue/model';

type Exec = Pick<typeof Db, 'execute'>;

/** Marca do item na fila (understood.origem): o `applyInTx` ATIVA a oferta-rascunho da Amazon quando a resposta é "sim" (ver queue.ts). */
export const ORIGEM_DUVIDA_AMAZON = 'amazon_cobertura';

export interface DuvidaAmazon {
  offerId: string;
  masterId: string;
  masterNome: string;
  vertical: string;
  asin: string;
  titulo: string;
  motivo: string;
  fronteira: boolean;
  score: number;
  covM?: number;
  covC?: number;
}

/**
 * Rascunho da Amazon em DÚVIDA de identidade vira pergunta na FILA DE CLASSIFICAÇÃO (eixo 'identidade'; a fonte 'amazon' vai em `understood`, porque o
 * CHECK de `identity_review_items.source` só aceita chave_nd|confianca|dispersao|preco e não se altera esquema antes do congelamento de 20/11, mesmo
 * molde da Shopee, `shopee-fila.ts`). A oferta continua RASCUNHO (fora de média, selo, menor preço e vitrine) até o dono responder "sim".
 * Idempotente: (offer_id, axis) é único. Devolve true se criou o item.
 */
export async function enfileirarDuvidaAmazon(exec: Exec, d: DuvidaAmazon): Promise<boolean> {
  const options: QueueOption[] = [
    { value: 'sim', label: 'É o mesmo produto', hint: 'Entra na média deste produto (só histórico da Amazon, sem preço de outras lojas na mensagem)', kind: 'escolha' },
    NAO_E_ESTE,
    NAO_SEI,
  ];
  const understood = {
    origem: ORIGEM_DUVIDA_AMAZON, fonte: 'amazon', master: d.masterNome.slice(0, 160), asin: d.asin,
    tipo: d.fronteira ? 'fronteira' : 'duvida', score: Number(d.score.toFixed(2)),
    ...(d.covM != null ? { coberturaMaster: Number(d.covM.toFixed(2)) } : {}), ...(d.covC != null ? { coberturaTitulo: Number(d.covC.toFixed(2)) } : {}),
  };
  const r = await exec.execute(sql`
    INSERT INTO identity_review_items (offer_id, master_id, vertical, axis, source, reason, understood, options, title, title_norm)
    VALUES (${d.offerId}::uuid, ${d.masterId}::uuid, ${d.vertical}, 'identidade', 'confianca', ${`Amazon: ${d.motivo}`.slice(0, 300)}, ${JSON.stringify(understood)}::text::jsonb,
            ${JSON.stringify(options)}::text::jsonb, ${d.titulo.slice(0, 300)}, ${titleNorm(d.titulo)})
    ON CONFLICT (offer_id, axis) DO NOTHING
    RETURNING id::text AS id`);
  return (r as unknown as Array<{ id: string }>).length > 0;
}
