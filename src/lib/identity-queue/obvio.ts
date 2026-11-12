// AUTO-RESOLUCAO dos itens OBVIOS da fila de classificacao (dono, 2026-11-12: "casos obvios pode liberar"). PURO: sem banco, sem rede.
// Criterio OBJETIVO e CONSERVADOR; so produz um veredito quando a prova e inequivoca, e a acao e sempre reversivel (mesmo caminho do applyInTx,
// autor 'auto_obvio', desfazer no popup). Quem sobra continua para o dono. Nada e inferido por preco: o preco so IMPEDE (faixa estreita em torno da
// mediana do produto), nunca prova identidade.
//
// Veredito possivel (um por item, na ordem abaixo):
//  1. 'regra_do_dono'        : titulo igual/muito parecido ja decidido pelo dono no mesmo eixo (loadRules/findRule; feito pelo chamador).
//  2. 'evidencia_api'        : a API oficial (evidencia ja gravada) prova a resposta (judgeEvidence: usado -> "nao e este"; console novo, sem variacoes,
//                              atributo unico -> modelo/armazenamento com master de destino).
//  3. 'gtin_igual'           : eixo identidade/dispersao; GTIN do anuncio (API) == GTIN do master, condicao nova, preco entre 0,5x e 2x a mediana.
//  4. 'marca_modelo_coerentes': eixo identidade/dispersao; a API devolveu MARCA e MODELO (e capacidade, se houver) e todos aparecem no nome do master,
//                              condicao nova, preco entre 0,5x e 2x a mediana.
//  5. 'titulo_igual_ao_master': eixo identidade/dispersao; titulo do anuncio == nome do master (ou muito parecido com os mesmos numeros), sem marca de
//                              condicao/regiao/edicao diferente, SEM grupo de preco bimodal e preco entre 1/1,3x e 1,3x a mediana (a duvida era so a
//                              cerca de preco; o preco esta dentro da faixa normal do produto).
// Fora do criterio (continua para o dono): midia (digital x disco), modelo/armazenamento sem prova da API, itens de cobertura Amazon/Shopee/Plus
// (understood.origem), dispersao bimodal, preco fora da faixa, qualquer ambiguidade.
import { titleNorm, titlesSimilar, type QueueAxis, type QueueOption } from '@/lib/identity-queue/model';
import { judgeEvidence, type MlEvidence } from '@/lib/identity-queue/api-evidence';
import { titleIdentityBlock } from '@/lib/messaging/group-rules';
import { foldTitle } from '@/lib/catalog/dimensions';

export const OBVIO_RATIO_TITULO = 1.3;
export const OBVIO_RATIO_API_MIN = 0.5;
export const OBVIO_RATIO_API_MAX = 2;
/** Rotulo gravado em identity_decisions.decided_via. */
export const OBVIO_VIA = 'auto_obvio';

export type ObvioCriterio = 'evidencia_api' | 'gtin_igual' | 'marca_modelo_coerentes' | 'titulo_igual_ao_master';

export interface ObvioInput {
  axis: QueueAxis;
  source: string;
  options: QueueOption[];
  understood: Record<string, unknown>;
  itemTitle: string;
  masterName: string | null;
  masterGtin: string | null;
  evidence: MlEvidence | null;
  priceCents: number | null;
}

export interface ObvioVerdict { value: string; criterio: ObvioCriterio; motivo: string }

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D+/g, '');
const fold = (s: string) => foldTitle(s);

function ratioToMedian(i: ObvioInput): number | null {
  const med = Number(i.understood.medianaCents);
  const price = i.priceCents ?? Number(i.understood.precoCents);
  if (!(med > 0) || !(price > 0)) return null;
  return price / med;
}

/** Todos os tokens de `needle` (dobrado) aparecem como palavra em `hay`? */
function allTokensIn(needle: string, hay: string): boolean {
  const h = new Set(fold(hay).split(' ').filter(Boolean));
  const toks = fold(needle).split(' ').filter(Boolean);
  return toks.length > 0 && toks.every((t) => h.has(t));
}

export function judgeObvio(i: ObvioInput): ObvioVerdict | null {
  if (i.understood.origem) return null; // cobertura Amazon/Shopee/aprovacao Plus: duvida de cobertura e do dono
  // 2. Evidencia da API oficial (ja gravada): prova de console ou anuncio usado.
  if (i.evidence) {
    const v = judgeEvidence({ axis: i.axis, options: i.options, understood: i.understood }, i.evidence);
    if (v) return { value: v.value, criterio: 'evidencia_api', motivo: v.motivo };
  }
  if (i.axis !== 'identidade' || i.source !== 'dispersao') return null;
  const sim = i.options.find((o) => o.value === 'sim' && o.kind === 'escolha');
  if (!sim || !i.masterName) return null;
  const ratio = ratioToMedian(i);
  if (ratio == null) return null;
  // Condicao nunca pode estar em duvida (so produto novo): titulo do anuncio e nome do master passam pelo mesmo bloqueio das mensagens.
  if (titleIdentityBlock(i.itemTitle, i.masterName)) return null;
  const ev = i.evidence;
  if (ev && !ev.erro && ev.condition === 'new' && ratio >= OBVIO_RATIO_API_MIN && ratio <= OBVIO_RATIO_API_MAX) {
    // 3. GTIN igual.
    const g1 = digits(ev.attrs.GTIN);
    const g2 = digits(i.masterGtin);
    if (g1.length >= 8 && g1 === g2) return { value: 'sim', criterio: 'gtin_igual', motivo: `GTIN ${g1} do anúncio (API do ML) é o mesmo do produto` };
    // 4. Marca + modelo (+ capacidade) da API coerentes com o nome do master.
    const brand = ev.attrs.BRAND;
    const model = ev.attrs.MODEL ?? ev.attrs.ALPHANUMERIC_MODEL;
    const cap = ev.attrs.CAPACITY ?? ev.attrs.STORAGE_CAPACITY ?? ev.attrs.INTERNAL_MEMORY;
    if (brand && model && allTokensIn(brand, i.masterName) && allTokensIn(model, i.masterName) && (!cap || allTokensIn(cap, i.masterName))) {
      return { value: 'sim', criterio: 'marca_modelo_coerentes', motivo: `a API do ML informa marca ${brand}, modelo ${model}${cap ? `, capacidade ${cap}` : ''}, todos no nome do produto` };
    }
  }
  // 5. Titulo do anuncio == nome do master, preco dentro da faixa normal e sem grupo de preco separado.
  if (i.understood.bimodal === true) return null;
  if (ratio < 1 / OBVIO_RATIO_TITULO || ratio > OBVIO_RATIO_TITULO) return null;
  const igual = titleNorm(i.itemTitle) === titleNorm(i.masterName) || titlesSimilar(i.itemTitle, i.masterName);
  if (!igual) return null;
  return { value: 'sim', criterio: 'titulo_igual_ao_master', motivo: `título igual ao do produto e preço a ${ratio.toFixed(2).replace('.', ',')}x a mediana (faixa normal)` };
}
