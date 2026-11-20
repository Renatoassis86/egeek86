// Sem 'server-only': configuração pura (sem banco, sem rede). Só importa TIPOS de config.ts (sem ciclo em tempo de execução).
import type { SegmentConfig } from './config';
import { REQUIRE_BRAND_KEYS } from './config-ampliacao';
import { combineTerms, dedupeTerms } from './seed-utils';

/**
 * FERRAMENTAS NA TECNOLOGIA (dono, 2026-11-20: "Deixe enviar ferramentas no grupo de tecnologia. Vamos diversificar."; R-106). Sem departamento nem loja nova:
 * dois tipos dentro da loja Tecnologia, com as MELHORES MARCAS abrindo a lista de termos (a semeadura vai na ordem dos termos; combineTerms intercala marca primeiro).
 * Só produto novo e em linha de marca reconhecida; item miúdo avulso (broca, disco, ponta, lixa, parafuso, bateria/refil/peça avulsa), faca/arma/cozinha, ferramenta
 * de impressão 3D (pertence à loja de Impressão 3D) e máquina de solda industrial ficam de fora (scope-ferramentas.ts + item-miudo.ts). Masters nascem em revisão.
 * Domínios do ML não medidos ao vivo: `domainUnconfirmed` + regex de varredura; o 1º dry-run mostra os domínios reais.
 */
export const MARCAS_FERRAMENTAS_TOP = ['bosch', 'dewalt', 'makita', 'black decker', 'stanley', 'tramontina pro', 'vonder', 'dremel', 'einhell', 'hikari', 'worx', 'milwaukee', 'irwin', 'gedore'];

const GTIN_P = { strategy: 'gtin_then_attrs' as const, fallbackAttrs: ['BRAND', 'MODEL'], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] };

function seg(d: { key: string; label: string; rank: number; domains: RegExp[]; excludeDomains?: RegExp[]; terms: string[]; note: string }): SegmentConfig {
  REQUIRE_BRAND_KEYS.add(d.key);
  return {
    key: d.key,
    vertical: 'tecnologia',
    label: d.label,
    domains: d.domains,
    ...(d.excludeDomains ? { excludeDomains: d.excludeDomains } : {}),
    terms: dedupeTerms(d.terms),
    profile: GTIN_P,
    targetRefreshMin: 60,
    seedRank: d.rank,
    domainUnconfirmed: true,
    callsPerRun: 60,
    rationale: `R-106 (2026-11-20). ${d.note}`,
  };
}

export const NOVOS_SEGMENTOS_FERRAMENTAS: SegmentConfig[] = [
  seg({
    key: 'ferramenta-eletrica', label: 'Ferramentas elétricas (furadeira, parafusadeira, serra, esmerilhadeira, lixadeira, soldador)', rank: 217,
    domains: [/DRILLS?|SCREWDRIVERS?|IMPACT_(DRIVERS|WRENCH)|ANGLE_GRINDERS?|GRINDERS?|SAWS?|JIGSAWS?|SANDERS?|PLANERS?|ROTARY_TOOLS?|HEAT_GUNS?|SOLDERING_IRONS?|POWER_TOOLS?|ROUTERS_(WOOD|POWER)|HAMMER/],
    excludeDomains: [/3D|PRINTER|KITCHEN|FOOD|MEAT|BONE|HAIR|NAIL|BEAUTY|TATTOO|CHAIN_?SAWS?_CHAINS|WELDING_(MACHINES|EQUIPMENT)/],
    terms: combineTerms('', ['furadeira de impacto', 'parafusadeira furadeira a bateria 12v', 'parafusadeira 20v', 'serra circular', 'serra tico tico', 'esmerilhadeira angular', 'lixadeira orbital', 'micro retifica', 'serra marmore', 'martelete rompedor', 'soprador termico', 'ferro de solda'], MARCAS_FERRAMENTAS_TOP),
    note: 'Ferramentas elétricas de marca, aparelho principal (kits com 2 aparelhos e peça avulsa ficam de fora pelo escopo). Soldador: ferro/estação; máquina de solda industrial NÃO.',
  }),
  seg({
    key: 'ferramenta-manual', label: 'Ferramentas manuais e kits (jogo de chaves, soquetes, maleta de ferramentas)', rank: 218,
    domains: [/TOOL_(SETS?|KITS?)|SOCKET_SETS?|WRENCH(ES)?|WRENCH_SETS?|SCREWDRIVER_SETS?|HAND_TOOLS?|TOOLBOXES|TOOL_BOXES|PLIERS|TORQUE_WRENCH/],
    excludeDomains: [/3D|PRINTER|KITCHEN|FOOD|KNIVES|KNIFE|HAIR|NAIL|BEAUTY|MANICURE|SANDPAPER|DRILL_BITS|SAW_BLADES|ABRASIVE/],
    terms: combineTerms('', ['jogo de chaves combinadas', 'jogo de soquetes', 'kit de ferramentas completo', 'maleta de ferramentas', 'jogo de chaves de fenda e philips', 'chave inglesa', 'torquimetro', 'caixa de ferramentas com ferramentas', 'jogo de chaves allen'], MARCAS_FERRAMENTAS_TOP),
    note: 'Kit completo e jogo de marca (o kit é o produto). Peça avulsa (broca, disco, ponta, lixa, refil) é item miúdo e fica de fora.',
  }),
];
