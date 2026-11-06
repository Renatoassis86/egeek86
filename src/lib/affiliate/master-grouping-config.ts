// Configuração ÚNICA da coleta por (rede, master) do Mercado Livre. Sem server-only: pura (testável em tsx).

/**
 * FLAG `COLLECT_MASTER_GROUPING` (ata do Conselho de 2026-11-06, decisão 1 do dono). DESLIGADA por padrão.
 *
 * Problema que corrige: master com 2+ catálogos ML era coletado por catálogo, e todos os grupos gravavam na MESMA
 * oferta do vendedor (cada um com o preço do seu anúncio), o que fazia o preço oscilar a cada ciclo (RE3: 188,76 /
 * 190,02 / 192,12) e expirar/reativar ofertas. Com a flag, o coletor resolve TODOS os catálogos do master no mesmo ciclo,
 * grava para cada vendedor o MENOR anúncio dele entre os catálogos (preço real observado) e só expira o vendedor que
 * sumiu de TODOS os catálogos, e só se TODAS as chamadas do master deram certo (falha parcial = nada gravado/expirado).
 *
 * COMO LIGAR (duas variáveis, ambas necessárias; exige novo deploy/reinício; piloto de 72 h exige autorização do dono):
 *   COLLECT_MASTER_GROUPING=1
 *   COLLECT_MASTER_GROUPING_MASTERS=48f4279e-d37a-4369-b8fe-499e81c461cb,6813e83f-ef94-4b10-b54d-6e844c8a05b5
 *       (lista de ids COMPLETOS de master_products, separados por vírgula; "*" = todos os masters)
 * Flag ligada SEM a lista não agrupa nenhum master (proteção contra ligar o catálogo inteiro por engano).
 *
 * COMO DESLIGAR (rollback, sem migration a desfazer): remover COLLECT_MASTER_GROUPING (ou qualquer valor diferente de
 * "1") e reiniciar. Desligada, o coletor se comporta EXATAMENTE como antes (agrupamento por catálogo).
 */
export interface MasterGroupingScope {
  enabled: boolean;
  /** true = "*": todos os masters. */
  all: boolean;
  /** ids completos (minúsculos) dos masters-piloto. */
  masterIds: ReadonlySet<string>;
}

export type EnvLike = Record<string, string | undefined>;

export function getMasterGroupingScope(env: EnvLike = process.env): MasterGroupingScope {
  const enabled = env.COLLECT_MASTER_GROUPING === '1';
  const raw = (env.COLLECT_MASTER_GROUPING_MASTERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const all = raw.includes('*');
  return { enabled, all, masterIds: new Set(raw.filter((s) => s !== '*')) };
}

export function shouldGroupByMaster(masterProductId: string, scope: MasterGroupingScope): boolean {
  if (!scope.enabled) return false;
  if (scope.all) return true;
  return scope.masterIds.has(masterProductId.toLowerCase());
}
