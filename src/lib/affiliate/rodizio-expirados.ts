// Rodízio de reconferência das ofertas EXPIRADAS do Mercado Livre (C6, decisão do dono 2026-11-14). PURO: sem banco e sem rede.
//
// Problema: master cujas ofertas do ML estão TODAS expiradas nunca entra na fila de coleta (só 'active'/'draft' vencem o refresh),
// então fica sem preço mesmo que o produto volte a ser vendido. Solução: uma fatia pequena por execução, com cursor por last_checked_at,
// entra na MESMA coleta por catálogo (mesma identidade, mesmas guardas, mesmo carimbo): a oferta só volta a 'active' (ou nasce oferta nova
// do vendedor) quando a API devolve o anúncio com preço > 0 AGORA. Nunca reativa sem leitura.
//
// Só 'expired' (nunca 'paused': pausa é decisão do dono, p.ex. fora de linha) e só master com veredito do porteiro 'approved'.
import { foldTitle } from '@/lib/catalog/dimensions';
import { mentionsRetroPlatformOnly } from '@/lib/catalog/gate';

export interface RodizioConfig {
  ativo: boolean;
  /** Catálogos reconferidos por execução do coletor (cada um custa 1 chamada + títulos). */
  porRun: number;
  /** Mesma oferta só volta ao rodízio depois deste intervalo (o carimbo last_checked_at avança a cada checagem com resposta). */
  horasEntreChecagens: number;
}

export function rodizioConfig(env: Record<string, string | undefined> = process.env): RodizioConfig {
  const num = (v: string | undefined, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), max) : d;
  };
  return {
    ativo: (env.COLLECT_RODIZIO_EXPIRADOS ?? '').toLowerCase() === 'on',
    porRun: num(env.COLLECT_RODIZIO_POR_RUN, 20, 1, 60),
    horasEntreChecagens: num(env.COLLECT_RODIZIO_HORAS, 12, 1, 168),
  };
}

export interface RodizioCandidato {
  id: string;
  externalRef: string;
  networkId: string;
  networkSlug: string;
  masterProductId: string;
  masterName: string;
  productType: string;
  vertical: string;
  lastCheckedAt: Date | null;
}

/** SELECT único (dry-run e coletor usam o mesmo texto). `__HORAS__` e `__LIMITE__` são inteiros já saneados.
 * Escopo: games (jogo/console/acessório de plataforma em linha) e impressão 3D (prioridade Kobra/Bambu). A prioridade entra no ORDER BY
 * ANTES do LIMIT para que Kobra/Bambu e games não sejam cortados por candidatos mais antigos de baixa prioridade. */
export const RODIZIO_SELECT_SQL = `
SELECT * FROM (
  SELECT DISTINCT ON (o.external_ref)
    o.id::text AS id, o.external_ref AS "externalRef", o.network_id::text AS "networkId", n.slug AS "networkSlug",
    o.master_product_id::text AS "masterProductId", m.name AS "masterName", m.product_type::text AS "productType",
    o.vertical AS vertical, o.last_checked_at AS "lastCheckedAt",
    CASE
      WHEN o.vertical = 'impressao3d' AND m.name ~* '(kobra|bambu)' THEN 0
      WHEN m.product_type::text IN ('game', 'console') THEN 1
      WHEN m.product_type::text = 'accessory' THEN 2
      ELSE 3
    END AS prio
  FROM affiliate_offers o
  JOIN affiliate_networks n ON n.id = o.network_id AND n.slug = 'mercado-livre'
  JOIN master_products m ON m.id = o.master_product_id
  WHERE o.status = 'expired'
    AND o.external_ref IS NOT NULL
    AND o.quarantined_at IS NULL
    AND o.vertical IN ('games', 'impressao3d')
    AND m.attributes -> 'catalogGate' ->> 'verdict' = 'approved'
    AND (o.vertical <> 'games' OR m.game_platform_gen::text NOT IN ('xbox_one', 'xbox_360', 'unknown'))
    AND (o.last_checked_at IS NULL OR o.last_checked_at < now() - make_interval(hours => __HORAS__))
    AND NOT EXISTS (
      SELECT 1 FROM affiliate_offers a
      WHERE a.master_product_id = m.id AND a.network_id = o.network_id AND a.status IN ('active', 'draft')
    )
  ORDER BY o.external_ref, o.last_checked_at ASC NULLS FIRST
) t
ORDER BY t.prio ASC, t."lastCheckedAt" ASC NULLS FIRST
LIMIT __LIMITE__`;

export function rodizioSelectSql(horas: number, limite: number): string {
  const h = Math.max(1, Math.floor(horas));
  const l = Math.max(1, Math.floor(limite));
  return RODIZIO_SELECT_SQL.replace('__HORAS__', String(h)).replace('__LIMITE__', String(l));
}

const PRIORIDADE_3D = /\b(?:kobra|bambu)\b/;

/** 0 = impressora 3D Kobra/Bambu, 1 = jogo/console, 2 = acessório, 3 = o resto. Menor primeiro. */
export function prioridadeRodizio(c: Pick<RodizioCandidato, 'vertical' | 'masterName' | 'productType'>): 0 | 1 | 2 | 3 {
  if (c.vertical === 'impressao3d' && PRIORIDADE_3D.test(foldTitle(c.masterName))) return 0;
  if (c.productType === 'game' || c.productType === 'console') return 1;
  if (c.productType === 'accessory') return 2;
  return 3;
}

/**
 * Escolhe até `limite` catálogos: prioridade, depois a checagem mais antiga (nunca checado primeiro). Sem repetir catálogo,
 * sem os que já estão na fila normal do ciclo e sem plataforma fora de linha/retrô citada no título do master.
 */
export function escolherRodizio(
  candidatos: RodizioCandidato[],
  opts: { limite: number; catalogosNaFila?: Set<string> }
): RodizioCandidato[] {
  const vistos = new Set<string>();
  const ok = candidatos.filter((c) => {
    const chave = `${c.networkId}:${c.externalRef}`;
    if (vistos.has(chave) || opts.catalogosNaFila?.has(chave)) return false;
    if (mentionsRetroPlatformOnly(foldTitle(c.masterName))) return false;
    vistos.add(chave);
    return true;
  });
  ok.sort((a, b) => {
    const p = prioridadeRodizio(a) - prioridadeRodizio(b);
    if (p !== 0) return p;
    const ta = a.lastCheckedAt ? a.lastCheckedAt.getTime() : -Infinity;
    const tb = b.lastCheckedAt ? b.lastCheckedAt.getTime() : -Infinity;
    return ta !== tb ? ta - tb : a.id < b.id ? -1 : 1;
  });
  return ok.slice(0, Math.max(0, opts.limite));
}
