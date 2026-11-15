// Sem 'server-only': configuração pura (sem banco, sem rede). Só importa TIPOS de config.ts (sem ciclo em tempo de execução).
import type { SegmentConfig } from './config';
import { REQUIRE_BRAND_KEYS } from './config-ampliacao';
import { combineTerms, dedupeTerms } from './seed-utils';

/**
 * CIÊNCIA E TECNOLOGIA INDUSTRIAL (#60, pedido do dono 2026-11-15): "esses produtos de ciência, tecnologia industrial e demais itens de
 * tecnologia visíveis em nossa página". Medição antes (SELECT, 2026-11-15): ZERO masters de microscópio, telescópio, multímetro,
 * osciloscópio, paquímetro, Arduino/ESP32/Raspberry, estação de solda, scanner 3D, CNC e laser em qualquer departamento: o problema
 * era de COLETA (nenhuma consulta de semeadura), não de porteiro. Mapa de categorias: docs/mapa-categorias-ciencia-tecnologia-2026-11-15.md.
 *
 * Mesmas regras de sempre: só novo e em linha; peça, acessório, consumível e item miúdo ficam fora (scope-ciencia.ts + item-miudo.ts);
 * identidade forte (GTIN/MPN ou marca+modelo) e marca real obrigatória; masters nascem em `review` e seguem a esteira normal de aprovação.
 * Nenhuma barreira nova: só mais consultas (termos) e léxicos por tipo, no mesmo molde de config-tipos.ts.
 *
 * Domínios do ML NÃO medidos ao vivo: `domainUnconfirmed` + regex de varredura; o 1º dry-run mostra os domínios reais (skip
 * `dominio_fora_do_segmento`) e então se declara `searchDomain`. Orçamento por tipo = PROBE_CALLS_PER_RUN de config-tipos (60).
 */

const GTIN_P = (extras: string[] = ['ALPHANUMERIC_MODEL']) => ({ strategy: 'gtin_then_attrs' as const, fallbackAttrs: ['BRAND', 'MODEL'], keyExtras: extras });

interface Def {
  key: string;
  label: string;
  domains: RegExp[];
  excludeDomains?: RegExp[];
  terms: string[];
  rank: number;
  note: string;
  /** domain_id medido ao vivo no dry-run de 2026-11-15: filtra a busca e tira o `domainUnconfirmed`. */
  searchDomain?: string;
}

function seg(d: Def): SegmentConfig {
  REQUIRE_BRAND_KEYS.add(d.key);
  return {
    key: d.key,
    vertical: 'tecnologia',
    label: d.label,
    domains: d.domains,
    ...(d.excludeDomains ? { excludeDomains: d.excludeDomains } : {}),
    terms: dedupeTerms(d.terms),
    profile: GTIN_P(),
    targetRefreshMin: 60,
    seedRank: d.rank,
    ...(d.searchDomain ? { searchDomain: d.searchDomain } : { domainUnconfirmed: true }),
    callsPerRun: 60,
    rationale: `#60 (2026-11-15). ${d.note}`,
  };
}

export const NOVOS_SEGMENTOS_CIENCIA: SegmentConfig[] = [
  seg({
    key: 'microscopio', label: 'Microscópio', rank: 200, searchDomain: 'MLB-MICROSCOPES', domains: [/MICROSCOPES?/], excludeDomains: [/MEDICAL/],
    terms: combineTerms('microscopio', ['biologico', 'digital usb', 'estereoscopico', 'binocular', 'trinocular', 'para laboratorio', 'para eletronica'], ['bioptika', 'opticam', 'celestron', 'bresser', 'levenhuk', 'amscope', 'olympus', 'motic', 'leica', 'zeiss', 'andonstar', 'kasvi', 'microview', 'laborglas']),
    note: 'ML MLB4062/MLB4064 Microscópios (47,9 mil anúncios).',
  }),
  seg({
    key: 'telescopio', label: 'Telescópio', rank: 201, searchDomain: 'MLB-TELESCOPES', domains: [/TELESCOPES?/],
    terms: combineTerms('telescopio', ['refrator', 'refletor', 'astronomico', 'equatorial', 'azimutal', 'dobsoniano', 'computadorizado'], ['celestron', 'skywatcher', 'sky-watcher', 'bresser', 'levenhuk', 'orion', 'meade', 'greika', 'vivitar', 'tasco', 'zeiss', 'zhumell']),
    note: 'ML MLB80232 Telescópios (7,6 mil).',
  }),
  seg({
    key: 'binoculo', label: 'Binóculo e monóculo', rank: 202, searchDomain: 'MLB-BINOCULARS', domains: [/BINOCULARS?|MONOCULARS?/],
    terms: combineTerms('binoculo', ['profissional', '10x42', '12x50', '20x50', 'visao noturna', 'a prova dagua', 'com telemetro'], ['celestron', 'bushnell', 'nikon', 'vortex', 'bresser', 'levenhuk', 'tasco', 'zeiss', 'canon', 'olympus', 'steiner', 'pentax']),
    note: 'ML MLB4063 Binóculos e MLB70298 Monóculos.',
  }),
  seg({
    key: 'multimetro', label: 'Multímetro e alicate amperímetro', rank: 203, domains: [/MULTIMETERS?|CLAMP_METERS?|AMMETERS?|VOLTMETERS?|ELECTRIC_METERS?|DIGITAL_MULTI/], excludeDomains: [/ENERGY_METERS|WATER|GAS_METERS/],
    terms: combineTerms('', ['multimetro digital', 'multimetro true rms', 'alicate amperimetro digital', 'alicate amperimetro true rms', 'multimetro automotivo', 'multimetro de bancada'], ['fluke', 'minipa', 'hikari', 'icel', 'instrutherm', 'uni-t', 'bside', 'klein tools', 'tektronix', 'extech', 'victor', 'mastech', 'tenmars', 'brymen', 'hantek', 'proskit', 'bosch']),
    note: 'ML MLB30214 Multímetros (120 mil), MLB30162 Amperímetros.',
  }),
  seg({
    key: 'osciloscopio', label: 'Osciloscópio e analisador lógico', rank: 204, searchDomain: 'MLB-OSCILLOSCOPES', domains: [/OSCILLOSCOPES?|LOGIC_ANALYZERS?|SCOPES?$/],
    terms: combineTerms('', ['osciloscopio digital', 'osciloscopio portatil', 'osciloscopio 2 canais', 'osciloscopio 4 canais', 'osciloscopio usb', 'analisador logico usb'], ['rigol', 'siglent', 'hantek', 'owon', 'tektronix', 'keysight', 'uni-t', 'minipa', 'fnirsi', 'ads', 'ming he', 'saleae', 'pico technology', 'tektronics']),
    note: 'ML MLB45283 Osciloscópios (20 mil).',
  }),
  seg({
    key: 'paquimetro', label: 'Paquímetro e micrômetro', rank: 205, searchDomain: 'MLB-CALIPERS', domains: [/CALIPERS?|MICROMETERS?|VERNIER|DIAL_INDICATORS?/],
    terms: combineTerms('', ['paquimetro digital 150mm', 'paquimetro digital 200mm', 'paquimetro universal inox', 'micrometro externo digital', 'micrometro externo 0-25mm', 'relogio comparador digital'], ['mitutoyo', 'digimess', 'starrett', 'western', 'vonder', 'stanley', 'lee tools', 'zaas', 'insize', 'kingtool', 'tramontina pro', 'mtx', 'wurth', 'eda', 'cuberflex']),
    note: 'ML MLB30163 Paquímetros (42,8 mil), MLB30194 Micrômetros, MLB433459 Relógios Comparadores.',
  }),
  seg({
    key: 'balanca-precisao', label: 'Balança de precisão e analítica', rank: 206, searchDomain: 'MLB-PRECISION_SCALES', domains: [/PRECISION_SCALES?|ANALYTICAL|LABORATORY_SCALES?|JEWELRY_SCALES?|LAB_BALANCES?|^MLB-(SCALES|BALANCES)$/],
    excludeDomains: [/BODY|BATHROOM|KITCHEN|BABY|PET|LUGGAGE|PERSONAL/],
    terms: combineTerms('', ['balanca de precisao 0,01g', 'balanca analitica 0,001g', 'balanca de laboratorio', 'balanca semi analitica', 'balanca de precisao joalheria'], ['marte', 'shimadzu', 'bel engineering', 'ohaus', 'toledo', 'filizola', 'kern', 'digipeso', 'welmy', 'tecnal', 'acculab', 'mettler toledo']),
    note: 'ML MLB454860 Balanças de Laboratório. Balança de cozinha/corporal fica fora (nicho).',
  }),
  seg({
    key: 'termometro-infravermelho', label: 'Termômetro infravermelho e câmera térmica', rank: 207, searchDomain: 'MLB-INFRARED_THERMOMETERS', domains: [/INFRARED_THERMOMETERS?|THERMAL_CAMERAS?|PYROMETERS?|THERMOGRAPH|IR_THERMOMETERS?/],
    terms: combineTerms('', ['termometro infravermelho laser', 'termometro infravermelho industrial', 'pirometro digital', 'camera termica', 'camera termografica para celular', 'camera termica portatil'], ['fluke', 'minipa', 'icel', 'instrutherm', 'uni-t', 'flir', 'hikmicro', 'infiray', 'seek thermal', 'bosch', 'extech', 'testo', 'tenmars', 'hti']),
    note: 'ML MLB431216 Termômetros Infravermelhos (12 mil). Termômetro clínico de testa fica fora (nicho).',
  }),
  seg({
    key: 'placa-microcontrolada', label: 'Arduino, Raspberry Pi, ESP32 e placas de desenvolvimento', rank: 208, domains: [/^MLB-MICROCONTROLLER(S|_BOARDS)$|DEVELOPMENT_BOARDS?|SINGLE_BOARD/],
    terms: combineTerms('', ['arduino uno', 'arduino mega', 'arduino nano', 'raspberry pi 5', 'raspberry pi 4', 'raspberry pi zero 2 w', 'raspberry pi pico', 'esp32 devkit', 'nvidia jetson nano', 'placa de desenvolvimento stm32', 'micro:bit', 'beaglebone'], ['arduino', 'raspberry pi', 'espressif', 'waveshare', 'seeed studio', 'nvidia', 'bbc', 'sparkfun', 'adafruit', 'banana pi', 'orange pi', 'radxa', 'st', 'elegoo', 'makerhero', 'filipeflop', 'usinainfo']),
    note: 'ML MLB99779 Placas de Microcontroladores (278 mil anúncios; só placas de marca com GTIN/MPN; kits e sensores soltos de baixo valor ficam de fora pelo item-miudo).',
  }),
  seg({
    key: 'fonte-bancada', label: 'Fonte de bancada', rank: 209, domains: [/BENCH_POWER|LABORATORY_POWER|ADJUSTABLE_POWER|DC_POWER_SUPPL|VARIABLE_POWER|LAB_POWER|^MLB-POWER_SUPPLIES$/], excludeDomains: [/COMPUTER|PC_|ATX|LED|CCTV|SWITCHING_POWER_SUPPLIES_FOR/],
    terms: combineTerms('', ['fonte de bancada 30v 5a', 'fonte de bancada 30v 10a', 'fonte de bancada 60v', 'fonte ajustavel dc digital', 'fonte de bancada programavel', 'fonte de bancada linear'], ['minipa', 'hikari', 'icel', 'instrutherm', 'uni-t', 'rigol', 'siglent', 'owon', 'hantek', 'mastech', 'korad', 'longwei', 'yihua', 'tenma', 'gophert', 'kaiweets']),
    note: 'ML: o catálogo NÃO tem domínio de fonte de bancada (a busca devolve MLB-EMBEDDED_SWITCH_MODE_POWER_SUPPLIES e outros); rende ~0. Mantido por custo de 1 chamada por termo; ver doc (sem catálogo ML).',
  }),
  seg({
    key: 'estacao-solda', label: 'Estação de solda e retrabalho', rank: 210, searchDomain: 'MLB-SOLDERING_STATIONS', domains: [/SOLDERING_STATIONS?|REWORK_STATIONS?|HOT_AIR_STATIONS?|SOLDERING_IRONS?/], excludeDomains: [/WELDING/],
    terms: combineTerms('', ['estacao de solda digital', 'estacao de retrabalho smd', 'estacao de solda 936', 'estacao de ar quente', 'estacao de solda e ar quente 2 em 1', 'ferro de solda digital temperatura ajustavel', 'ferro de solda inteligente'], ['hikari', 'yaxun', 'quick', 'hakko', 'weller', 'atten', 'pinecil', 'miniware', 'sugon', 'jbc', 'aoyue', 'goot', 'ksger', 'tools hunt', 'tooltop', 'mechanic']),
    note: 'ML MLB48567 Estações de Solda (23,6 mil) e MLB48611 Ferros de Solda; só estação/ferro digital, nunca máquina de solda industrial (decisão do dono).',
  }),
  seg({
    key: 'scanner-3d', label: 'Scanner 3D', rank: 211, domains: [/3D_SCANNERS?|^MLB-SCANNERS$/],
    terms: combineTerms('scanner 3d', ['', 'portatil', 'a laser', 'de luz estruturada', 'para impressora 3d', 'de mesa'], ['creality', 'revopoint', 'shining3d', 'einscan', 'artec', 'thunk3d', 'raptor', 'scanner pop', 'polyga', 'matter and form', 'sol', 'elegoo', 'anycubic']),
    note: 'ML: o catálogo NÃO tem domínio de scanner 3D; ele cai em MLB-SCANNERS (misturado com scanner de documentos: 44 de 50 resultados de "scanner 3d revopoint" eram dele). O nicho exige 3d no título, então rende pouco. Sem searchDomain de propósito.',
  }),
  seg({
    key: 'maquina-cnc', label: 'Máquina CNC e router', rank: 212, searchDomain: 'MLB-CNC_ROUTERS', domains: [/^MLB-CNC_ROUTERS$|MILLING_MACHINES?/], excludeDomains: [/NETWORK|WIFI|WIRELESS|MODEM|CONTROLLERS?/],
    terms: combineTerms('', ['maquina cnc router', 'mini cnc', 'cnc 3018', 'cnc 6040', 'fresadora cnc de mesa', 'router cnc para madeira', 'cnc desktop'], ['genmitsu', 'sainsmart', 'shapeoko', 'carbide 3d', 'creality falcon', 'bantam', 'onefinity', 'xtool', 'two trees', 'sculpfun', 'sorotec', 'makera', 'proxxon', 'dremel']),
    note: 'ML MLB49118 CNC (55,6 mil) > MLB413212 Máquinas CNC. Roteador de rede nunca (excludeDomains + nicho).',
  }),
  seg({
    key: 'gravadora-laser', label: 'Gravadora e cortadora a laser', rank: 213, searchDomain: 'MLB-LASER_CUTTING_AND_ENGRAVING_MACHINES', domains: [/LASER_(ENGRAV|CUT|MACHIN)|ENGRAVING|LASER_MARKING/], excludeDomains: [/HAIR|TATTOO|BEAUTY|LEVEL|PRINTER|POINTER/],
    terms: combineTerms('', ['gravadora a laser', 'cortadora a laser', 'maquina de gravacao a laser', 'gravador laser 40w', 'gravador laser 10w', 'laser co2 desktop', 'gravadora laser fibra'], ['xtool', 'atomstack', 'sculpfun', 'longer', 'ortur', 'creality falcon', 'neje', 'two trees', 'glowforge', 'emblaser', 'monport', 'omtech', 'algolaser', 'ikier', 'twotrees']),
    note: 'ML MLB49118 CNC / máquinas a laser (a confirmar). Laser estético, depilação e nível a laser ficam fora (nicho).',
  }),
  seg({
    key: 'plotter-corte', label: 'Plotter de recorte e cortadora de vinil', rank: 214, searchDomain: 'MLB-CUTTING_PLOTTERS', domains: [/VINYL_CUTT|CUTTING_PLOTTERS?|PAPER_CUTT(ING|ERS)_MACHINES?|CRAFT_CUTT|DIE_CUTT/], excludeDomains: [/PRINTER|INK/],
    terms: combineTerms('', ['plotter de recorte', 'cricut maker', 'cricut explore', 'cricut joy', 'silhouette cameo 5', 'silhouette portrait', 'brother scanncut', 'cortadora de vinil', 'plotter de recorte 60cm'], ['cricut', 'silhouette', 'brother', 'graphtec', 'creation', 'refine', 'liyu', 'redsail', 'sizzix', 'cameo', 'xtool', 'jaguar', 'roland']),
    note: 'ML: Gráfica e Impressão / Artesanato (a confirmar). Plotter de impressão (HP DesignJet) segue em Impressoras.',
  }),
  seg({
    key: 'medidor-laser', label: 'Medidor de distância a laser', rank: 215, searchDomain: 'MLB-LASER_METERS', domains: [/^MLB-LASER_METERS$|RANGEFINDERS?/], excludeDomains: [/LEVEL/],
    terms: combineTerms('', ['trena a laser', 'medidor de distancia a laser', 'trena laser digital 40m', 'telemetro laser', 'medidor laser 60m', 'trena a laser 100m'], ['bosch', 'leica', 'stanley', 'makita', 'dewalt', 'hilti', 'mtx', 'hikari', 'wurth', 'lasertech', 'vonder', 'tramontina', 'fluke', 'uni-t', 'mileseey', 'worx']),
    note: 'ML MLB455212 Medidores de Distância (13 mil).',
  }),
];

