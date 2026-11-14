// Sem 'server-only': configuração pura (sem banco, sem rede). Só importa TIPOS de config.ts (sem ciclo em tempo de execução).
import type { SegmentConfig } from './config';
import { REQUIRE_BRAND_KEYS } from './config-ampliacao';
import { combineTerms, dedupeTerms } from './seed-utils';

/**
 * AMPLIAÇÃO POR TIPO (pedido do dono, 2026-11-12): "quero TODOS os itens relacionados a cada área; o máximo de produtos por TIPO em
 * cada loja; não tem limites". Aditiva: não mexe nos segmentos de config.ts / config-ampliacao.ts; só acrescenta tipos que não existiam.
 *
 * ATENÇÃO (dado real x hipótese): os domain_id destes tipos NÃO foram medidos ao vivo (esta rodada não chama a API do ML; a cota é
 * desconhecida). Cada segmento sai com `domainUnconfirmed: true`: `domains` é regex de varredura e a busca roda SEM `domain_id`. O
 * 1º dry-run de cada tipo mostra os domínios reais devolvidos (skip `dominio_fora_do_segmento`); então se corrige a regex e se
 * declara `searchDomain`. Domínio errado custa 1 chamada por termo (a paginação para na 1ª página sem resultado no domínio) e nunca
 * cria master: `evaluateIdentity` devolve `off_domain` antes de qualquer outra coisa.
 *
 * Todos os masters nascem em `review` (invisíveis) pela semeadura; o porteiro e a fila de classificação decidem a vitrine.
 */

type Vert = SegmentConfig['vertical'];

const GTIN_P = (extras: string[] = ['ALPHANUMERIC_MODEL']) => ({ strategy: 'gtin_then_attrs' as const, fallbackAttrs: ['BRAND', 'MODEL'], keyExtras: extras });

/** Orçamento da 1ª rodada exploratória de um tipo com domínio não confirmado (basta para ver os domínios e os primeiros candidatos). */
export const PROBE_CALLS_PER_RUN = 60;

interface Def {
  key: string;
  vertical: Vert;
  label: string;
  domains: RegExp[];
  excludeDomains?: RegExp[];
  terms: string[];
  rank: number;
  profile?: SegmentConfig['profile'];
  refresh?: number;
  callsPerRun?: number;
  note?: string;
}

function seg(d: Def): SegmentConfig {
  REQUIRE_BRAND_KEYS.add(d.key);
  return {
    key: d.key,
    vertical: d.vertical,
    label: d.label,
    domains: d.domains,
    ...(d.excludeDomains ? { excludeDomains: d.excludeDomains } : {}),
    terms: dedupeTerms(d.terms),
    profile: d.profile ?? GTIN_P(),
    targetRefreshMin: d.refresh ?? (d.vertical === 'esporte' ? 60 : 30),
    seedRank: d.rank,
    domainUnconfirmed: true,
    callsPerRun: d.callsPerRun ?? PROBE_CALLS_PER_RUN,
    rationale: d.note ?? 'Ampliação por tipo 2026-11-12. Domínio a confirmar no 1º dry-run (regex de varredura, busca sem domain_id).',
  };
}

const EL_VOLT = ['ALPHANUMERIC_MODEL', 'VOLTAGE'];

// ---------------------------------------------------------------------------------------------------------------------
// ELETRÔNICOS
// ---------------------------------------------------------------------------------------------------------------------
const ELETRO: SegmentConfig[] = [
  seg({
    key: 'celular', vertical: 'tecnologia', label: 'Celular e smartphone', rank: 100, domains: [/^MLB-CELLPHONES$/, /SMARTPHONES/],
    terms: [
      'iphone 16', 'iphone 15', 'galaxy s25', 'galaxy a56', 'galaxy a36', 'galaxy a16', 'redmi note 14', 'moto g85', 'moto g55',
      ...combineTerms('celular', ['128gb', '256gb', '5g', '64gb', '512gb'], ['samsung galaxy', 'motorola moto g', 'xiaomi redmi', 'apple iphone', 'realme', 'poco', 'infinix', 'tcl', 'honor', 'oppo', 'nothing phone', 'asus rog phone', 'zte']),
    ],
  }),
  seg({
    key: 'tv-box', vertical: 'eletroeletronicos', label: 'TV Box e streaming', rank: 101, domains: [/TV_BOX|STREAMING|MEDIA_PLAYER|ANDROID_TV/],
    terms: [...combineTerms('tv box', ['', '4k', 'android', '8k', 'wifi 6'], ['xiaomi', 'mxq', 'aqua', 'intelbras', 'proeletronic', 'multilaser', 'tanix', 'h96', 'mi box', 'transpeed']), 'fire tv stick', 'chromecast com google tv', 'apple tv 4k', 'roku express', 'xiaomi tv stick'],
  }),
  seg({
    key: 'receiver-amplificador', vertical: 'eletroeletronicos', label: 'Receiver e amplificador de som', rank: 102, domains: [/AMPLIFIERS|RECEIVERS/],
    terms: [...combineTerms('receiver', ['av', 'home theater', 'bluetooth', 'stereo'], ['yamaha', 'denon', 'sony', 'pioneer', 'onkyo', 'marantz', 'harman kardon']), 'amplificador de som bluetooth', 'amplificador integrado hifi'],
  }),
  seg({
    key: 'microfone', vertical: 'eletroeletronicos', label: 'Microfone', rank: 103, domains: [/MICROPHONES/],
    terms: combineTerms('microfone', ['usb', 'condensador', 'lapela sem fio', 'streaming', 'dinamico'], ['blue yeti', 'hyperx', 'razer', 'fifine', 'maono', 'rode', 'shure', 'boya', 'behringer', 'sennheiser', 'audio-technica', 'samson', 'tonor', 'elgato', 'redragon']),
  }),
  seg({
    key: 'toca-discos', vertical: 'eletroeletronicos', label: 'Toca-discos', rank: 104, domains: [/TURNTABLES|RECORD_PLAYERS|VINYL/],
    terms: [...combineTerms('toca discos', ['', 'bluetooth', 'vinil', 'bivolt'], ['audio-technica', 'pro-ject', 'philips', 'sony', 'crosley', 'multilaser', 'lenco', 'denon', 'numark', 'pioneer dj', 'fluance', 'mondial'])],
  }),
  seg({
    key: 'casa-inteligente', vertical: 'eletroeletronicos', label: 'Casa inteligente (lâmpada, tomada, fechadura, assistente)', rank: 105,
    domains: [/^MLB-SMART_(BULBS|PLUGS|LOCKS|SPEAKERS|HOME\w*)/, /VOICE_ASSISTANTS/, /SMART_LIGHT/],
    terms: [...combineTerms('', ['lampada inteligente wifi', 'tomada inteligente', 'fechadura digital', 'assistente virtual', 'interruptor inteligente', 'fita led inteligente', 'campainha inteligente com camera'], ['positivo casa inteligente', 'tp-link tapo', 'xiaomi', 'intelbras', 'philips hue', 'amazon echo', 'ezviz', 'samsung smartthings', 'elgin', 'yale', 'philco', 'multilaser']), 'alexa echo dot', 'google nest hub', 'echo show'],
  }),
  seg({
    key: 'drone', vertical: 'eletroeletronicos', label: 'Drone', rank: 106, domains: [/DRONES/],
    terms: [...combineTerms('drone', ['', '4k', 'com camera', 'fpv', 'mini', 'profissional'], ['dji', 'dji mini', 'dji air', 'dji mavic', 'fimi', 'potensic', 'holy stone', 'syma', 'hubsan', 'autel', 'xiaomi'])],
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// TECNOLOGIA
// ---------------------------------------------------------------------------------------------------------------------
const TEC_BRANDS_PC = ['asus', 'msi', 'gigabyte', 'asrock', 'biostar', 'pichau', 'corsair', 'cooler master', 'redragon', 'deepcool', 'thermaltake', 'nzxt', 'lian li', 'fortrek', 'gamemax', 'bluecase', 'pcyes', 'montech', 'noctua', 'arctic', 'xpg', 'evga', 'seasonic'];

const TECNOLOGIA: SegmentConfig[] = [
  seg({
    key: 'placa-mae', vertical: 'tecnologia', label: 'Placa-mãe', rank: 110, domains: [/MOTHERBOARDS/],
    terms: combineTerms('placa mae', ['am5', 'am4', 'lga 1700', 'lga 1851', 'b650', 'b550', 'z790', 'b760', 'h610', 'x870'], ['asus', 'msi', 'gigabyte', 'asrock', 'biostar', 'pichau', 'machinist', 'huananzhi']),
  }),
  seg({
    key: 'gabinete-pc', vertical: 'tecnologia', label: 'Gabinete de PC', rank: 111, domains: [/COMPUTER_CASES|PC_CASES|PC_CABINETS|COMPUTER_CABINETS|COMPUTER_TOWERS/],
    terms: combineTerms('gabinete gamer', ['', 'rgb', 'atx', 'mid tower', 'mesh', 'vidro temperado', 'mini itx'], ['pichau', 'redragon', 'corsair', 'nzxt', 'cooler master', 'lian li', 'thermaltake', 'fortrek', 'gamemax', 'k-mex', 'bluecase', 'pcyes', 'montech', 'deepcool']),
  }),
  seg({
    key: 'fonte-pc', vertical: 'tecnologia', label: 'Fonte de PC', rank: 112, domains: [/COMPUTER_POWER_SUPPL|PC_POWER_SUPPL|ATX_POWER|^MLB-POWER_SUPPLIES$/],
    terms: combineTerms('fonte atx', ['500w', '650w', '750w', '850w', '1000w', '80 plus bronze', '80 plus gold', 'modular'], ['corsair', 'cooler master', 'evga', 'seasonic', 'thermaltake', 'gigabyte', 'msi', 'xpg', 'redragon', 'pichau', 'deepcool', 'gamemax', 'mancer', 'aerocool']),
  }),
  seg({
    key: 'cooler-pc', vertical: 'tecnologia', label: 'Cooler e water cooler', rank: 113, domains: [/CPU_COOLERS|COMPUTER_COOLERS|COMPUTER_COOLING|WATER_COOLERS|HEATSINKS/],
    terms: combineTerms('', ['water cooler 240mm', 'water cooler 360mm', 'air cooler cpu', 'cooler para processador am5', 'cooler lga 1700'], ['corsair', 'cooler master', 'deepcool', 'pichau', 'redragon', 'nzxt', 'noctua', 'arctic', 'thermalright', 'gamdias', 'id-cooling', 'lian li', 'pcyes', 'fortrek']),
  }),
  seg({
    key: 'roteador', vertical: 'tecnologia', label: 'Roteador', rank: 114, domains: [/ROUTERS/],
    terms: combineTerms('roteador', ['wifi 6', 'wifi 6 ax', 'gigabit', 'mesh', '4g chip', 'wifi 7', 'dual band'], ['tp-link', 'intelbras', 'tenda', 'asus', 'mercusys', 'huawei', 'xiaomi', 'multilaser', 'd-link', 'ubiquiti', 'netgear', 'linksys']),
  }),
  seg({
    key: 'repetidor-mesh', vertical: 'tecnologia', label: 'Repetidor de sinal, mesh e access point', rank: 115, domains: [/REPEATERS|RANGE_EXTENDERS|ACCESS_POINTS|MESH/],
    terms: [...combineTerms('', ['repetidor wifi', 'access point', 'sistema mesh', 'powerline'], ['tp-link', 'intelbras', 'tenda', 'asus', 'mercusys', 'ubiquiti', 'multilaser', 'd-link', 'netgear', 'xiaomi'])],
  }),
  seg({
    key: 'switch-rede', vertical: 'tecnologia', label: 'Switch de rede', rank: 116, domains: [/NETWORK_SWITCHES|ETHERNET_SWITCHES|^MLB-SWITCHES$/],
    terms: combineTerms('switch', ['gigabit 8 portas', 'gigabit 16 portas', 'poe', '5 portas', '24 portas'], ['tp-link', 'intelbras', 'tenda', 'd-link', 'ubiquiti', 'mercusys', 'netgear', 'multilaser', 'cisco', 'huawei']),
  }),
  seg({
    key: 'adaptador-wifi', vertical: 'tecnologia', label: 'Adaptador e placa de rede wifi', rank: 117, domains: [/NETWORK_ADAPTERS|WIFI_ADAPTERS|WIRELESS_ADAPTERS|NETWORK_CARDS/],
    terms: combineTerms('adaptador wifi', ['usb', 'pci express', 'bluetooth', 'wifi 6', 'ac1200'], ['tp-link', 'intelbras', 'tenda', 'asus', 'mercusys', 'multilaser', 'd-link', 'ugreen', 'edimax']),
  }),
  seg({
    key: 'webcam', vertical: 'tecnologia', label: 'Webcam', rank: 118, domains: [/WEBCAMS/],
    terms: combineTerms('webcam', ['full hd', '4k', 'com microfone', 'streaming', '1080p'], ['logitech', 'razer', 'microsoft', 'elgato', 'aoc', 'multilaser', 'hp', 'trust', 'fifine', 'ugreen', 'rapoo', 'redragon', 'hikvision']),
  }),
  seg({
    key: 'pendrive', vertical: 'tecnologia', label: 'Pendrive', rank: 119, domains: [/FLASH_DRIVES|USB_FLASH|PEN_DRIVES|PENDRIVES/],
    terms: combineTerms('pendrive', ['32gb', '64gb', '128gb', '256gb', 'usb 3.0', 'usb c', '1tb'], ['sandisk', 'kingston', 'multilaser', 'hp', 'pny', 'samsung', 'lexar', 'adata', 'corsair', 'verbatim']),
  }),
  seg({
    key: 'cartao-de-memoria', vertical: 'tecnologia', label: 'Cartão de memória', rank: 120, domains: [/MEMORY_CARDS|SD_CARDS|MICRO_SD/],
    terms: combineTerms('cartao de memoria', ['micro sd 64gb', 'micro sd 128gb', 'micro sd 256gb', 'sd 128gb', 'micro sd 512gb', 'a2 v30'], ['sandisk', 'kingston', 'samsung', 'lexar', 'pny', 'multilaser', 'adata', 'western digital', 'transcend']),
  }),
  seg({
    key: 'hd-ssd-externo', vertical: 'tecnologia', label: 'HD e SSD externo', rank: 121, domains: [/EXTERNAL_(HARD_DRIVES|SSD|STORAGE|DRIVES)|PORTABLE_(SSD|HARD)/],
    terms: [...combineTerms('', ['hd externo 1tb', 'hd externo 2tb', 'hd externo 4tb', 'ssd externo 500gb', 'ssd externo 1tb', 'ssd externo 2tb'], ['seagate', 'wd', 'samsung t7', 'sandisk', 'toshiba', 'adata', 'lacie', 'kingston', 'crucial', 'transcend'])],
  }),
  seg({
    key: 'nobreak', vertical: 'tecnologia', label: 'Nobreak', rank: 122, domains: [/UNINTERRUPTIBLE|NO_?BREAK|^MLB-UPS(_|$)/],
    terms: combineTerms('nobreak', ['600va', '1200va', '1500va', 'senoidal', 'gamer', 'bivolt'], ['sms', 'apc', 'ts shara', 'intelbras', 'ragtech', 'nhs', 'exceline', 'forceline', 'eaton', 'lyonn']),
  }),
  seg({
    key: 'mousepad', vertical: 'tecnologia', label: 'Mousepad gamer', rank: 123, domains: [/MOUSE_PADS|MOUSEPADS/],
    terms: combineTerms('mousepad gamer', ['', 'grande', 'speed', 'control', 'rgb', 'extended'], ['redragon', 'razer', 'steelseries', 'hyperx', 'logitech', 'corsair', 'fortrek', 'havit', 'zeroone', 'pichau']),
  }),
  seg({
    key: 'mesa-digitalizadora', vertical: 'tecnologia', label: 'Mesa digitalizadora', rank: 124, domains: [/GRAPHIC_TABLETS|DRAWING_TABLETS|DIGITIZERS/],
    terms: combineTerms('mesa digitalizadora', ['', 'com tela', 'wacom', 'pen display', 'pequena'], ['wacom', 'huion', 'xp-pen', 'gaomon', 'veikk', 'parblo', 'ugee', 'one by wacom']),
  }),
  seg({
    key: 'computador-desktop', vertical: 'tecnologia', label: 'Computador desktop, mini PC e all-in-one', rank: 125, domains: [/^MLB-DESKTOP|MINI_PCS?|ALL_IN_ONE|^MLB-COMPUTERS$/],
    terms: [...combineTerms('', ['pc gamer', 'mini pc', 'all in one', 'desktop', 'computador completo'], ['pichau', 'dell optiplex', 'lenovo thinkcentre', 'hp elitedesk', 'intel nuc', 'beelink', 'minisforum', 'apple mac mini', 'apple imac', 'asus', 'acer', 'positivo'])],
  }),
  seg({
    key: 'placa-de-captura', vertical: 'tecnologia', label: 'Placa de captura', rank: 126, domains: [/CAPTURE_CARDS|VIDEO_CAPTURE|CAPTURE_DEVICES/],
    terms: combineTerms('placa de captura', ['hdmi', '4k', 'usb', 'streaming', 'pci express'], ['elgato', 'avermedia', 'razer', 'ugreen', 'blackmagic', 'hagibis', 'mirabox']),
  }),
  // Móveis gamer (decisão do dono, 2026-11-12: entram mesa e rack gamer). Só produto NOVO e em linha; peça avulsa, tampo sem estrutura e móvel usado ficam fora (nicho + porteiro).
  seg({
    key: 'mesa-gamer', vertical: 'tecnologia', label: 'Mesa gamer', rank: 180, domains: [/GAMING_DESKS|COMPUTER_DESKS|^MLB-DESKS$|GAMER_DESKS/], excludeDomains: [/CHAIRS|DRAWING|DRAFTING/],
    terms: combineTerms('mesa gamer', ['', 'com led', 'em l', 'ergonomica', 'com gaveta', 'com suporte monitor', 'escrivaninha gamer', 'ajustavel em altura', '120 cm', '140 cm'], ['pichau', 'dt3', 'thunderx3', 'dxracer', 'mad racer', 'fortrek', 'redragon', 'gamer pro', 'office gamer', 'cougar', 'gtx', 'bluecase', 'pctop', 'maxracer', 'tgt', 'multilaser']),
    note: 'Móvel gamer aprovado pelo dono em 2026-11-12. Domínio a confirmar no 1º dry-run.',
  }),
  seg({
    key: 'rack-gamer', vertical: 'tecnologia', label: 'Rack gamer (rack de TV e setup)', rank: 181, domains: [/GAMING_RACKS|TV_STANDS|TV_RACKS|MEDIA_CONSOLES|RACKS_FOR_TV|ENTERTAINMENT_CENTERS/], excludeDomains: [/SERVER|NETWORK/],
    terms: combineTerms('rack gamer', ['', 'para tv', 'com led', 'para console', 'estante gamer', 'painel tv gamer', 'suporte para console'], ['pichau', 'dt3', 'thunderx3', 'fortrek', 'redragon', 'gamer pro', 'office gamer', 'tgt', 'multilaser', 'bluecase', 'pctop']),
    note: 'Móvel gamer aprovado pelo dono em 2026-11-12. Rack de servidor/rede (19 pol.) fica fora pelo nicho.',
  }),
  seg({
    key: 'scanner-de-documentos', vertical: 'tecnologia', label: 'Scanner de documentos', rank: 127, domains: [/SCANNERS/], excludeDomains: [/3D/],
    terms: combineTerms('scanner', ['de mesa', 'portatil', 'a4', 'adf', 'fotografico'], ['epson', 'canon', 'brother', 'hp', 'fujitsu', 'plustek', 'kodak', 'avision']),
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// IMPRESSÃO 3D (peças e pós-processamento; scanner 3D e caneta 3D ficam FORA: o porteiro do departamento os manda sempre para revisão)
// ---------------------------------------------------------------------------------------------------------------------
const I3D: SegmentConfig[] = [
  seg({
    key: 'peca-impressora-3d', vertical: 'impressao3d', label: 'Peça de impressora 3D (bico, hotend, mesa, extrusor, correia)', rank: 130,
    domains: [/3D_PRINTER_(PARTS|ACCESSORIES|COMPONENTS|SPARE)|3D_PRINTING_(PARTS|SUPPLIES)|HOTENDS|NOZZLES|EXTRUDERS/],
    terms: combineTerms('', ['bico nozzle', 'hotend', 'extrusor', 'mesa pei', 'placa de impressao', 'correia gt2', 'kit hotend', 'cama aquecida'], ['creality', 'bambu lab', 'anycubic', 'elegoo', 'e3d', 'bondtech', 'prusa', 'sovol', 'flashforge', 'biqu', 'micro swiss', 'trianglelab', 'artillery']).concat(['sensor bltouch impressora 3d', 'placa mae impressora 3d', 'display tela impressora 3d', 'ventoinha hotend impressora 3d']),
    note: 'Peças entram com compatibilidade ESCRITA no título (decisão do conselho): a aprovação de impressão 3D precisa exigir o modelo da impressora antes de liberar a vitrine. Masters nascem em revisão.',
  }),
  seg({
    key: 'secador-filamento', vertical: 'impressao3d', label: 'Secador e dry box de filamento', rank: 131, domains: [/FILAMENT_DRY|DRYERS/],
    terms: [...combineTerms('', ['secador de filamento', 'estufa filamento', 'dry box filamento'], ['sunlu', 'esun', 'creality', 'polymaker', 'elegoo', 'anycubic', 'overture', 'bambu lab']), 'sunlu filadryer', 'esun edry', 'creality space pi', 'polymaker polybox'],
  }),
  seg({
    key: 'lavadora-curadora-resina', vertical: 'impressao3d', label: 'Estação de lavar e curar resina', rank: 132, domains: [/CURING|WASH_AND_CURE|RESIN_CURING|UV_CURING/],
    terms: [...combineTerms('', ['estacao lavar e curar resina', 'curadora uv resina', 'lavadora de resina'], ['anycubic', 'elegoo', 'creality', 'flashforge', 'phrozen', 'sunlu']), 'anycubic wash and cure', 'elegoo mercury', 'creality uw-02'],
  }),
  seg({
    key: 'ferramenta-impressao-3d', vertical: 'impressao3d', label: 'Ferramentas de pós-processamento e bancada de impressão 3D', rank: 182,
    domains: [/3D_PRINTING_TOOLS|3D_PRINTER_TOOLS|DEBURRING|SCRAPERS|PLIERS|SPATULAS|CUTTING_PLIERS|HAND_TOOLS|SANDPAPER|HOBBY_TOOLS|MODELING_TOOLS|CRAFT_KNIVES/],
    terms: combineTerms('', ['kit ferramentas impressao 3d', 'espatula impressao 3d', 'removedor de rebarba', 'alicate de corte rente', 'lixa dagua kit', 'estilete de precisao', 'kit pos processamento 3d', 'raspador de mesa', 'pinca de precisao', 'alicate de bico'], ['creality', 'elegoo', 'anycubic', 'sunlu', 'bambu lab', 'tramontina', 'stanley', 'vonder', 'gedore', 'tekna', 'hobbycraft', 'xcelite', 'jakemy']),
    note: 'Ferramentas aprovadas pelo dono em 2026-11-12. Exigem a palavra "3d" ou o uso (pós-processamento, rebarba, resina) no título para ir à vitrine; ferramenta genérica fica em revisão.',
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// CASA (eletrodomésticos)
// ---------------------------------------------------------------------------------------------------------------------
const MARCAS_CASA = ['electrolux', 'brastemp', 'consul', 'philco', 'mondial', 'britania', 'oster', 'philips walita', 'arno', 'cadence', 'midea', 'tramontina', 'black decker', 'fischer', 'suggar', 'agratto'];

const CASA: SegmentConfig[] = [
  seg({
    key: 'coifa', vertical: 'eletrodomesticos', label: 'Coifa e depurador', rank: 140, profile: GTIN_P(EL_VOLT), domains: [/RANGE_HOODS|COOKER_HOODS|KITCHEN_HOODS|EXTRACTORS|PURIFIERS_FOR_KITCHEN/],
    terms: combineTerms('coifa', ['parede', 'ilha', 'embutir', 'depurador', 'inox 60cm', '90cm'], ['electrolux', 'brastemp', 'consul', 'suggar', 'fogatti', 'tramontina', 'nardelli', 'cadence', 'philco', 'mueller', 'venax', 'esmaltec']),
  }),
  seg({
    key: 'bebedouro-purificador-agua', vertical: 'eletrodomesticos', label: 'Bebedouro e purificador de água', rank: 141, profile: GTIN_P(EL_VOLT), domains: [/WATER_PURIFIERS|WATER_DISPENSERS|DRINKING_FOUNTAINS/],
    terms: combineTerms('', ['bebedouro de agua', 'purificador de agua', 'filtro de agua', 'bebedouro industrial', 'purificador refrigerado'], ['ibbl', 'electrolux', 'latina', 'colormaq', 'esmaltec', 'masterfrio', 'consul', 'brastemp', 'karina', 'philco', 'libell', 'europa']),
  }),
  seg({
    key: 'umidificador-desumidificador', vertical: 'eletrodomesticos', label: 'Umidificador e desumidificador', rank: 142, profile: GTIN_P(EL_VOLT), domains: [/HUMIDIFIERS|DEHUMIDIFIERS/],
    terms: combineTerms('', ['umidificador de ar', 'umidificador ultrassonico', 'desumidificador de ar', 'umidificador aromatizador'], ['xiaomi', 'electrolux', 'britania', 'mondial', 'philco', 'arno', 'multilaser', 'philips', 'cadence', 'agratto', 'kasa']),
  }),
  seg({
    key: 'aquecedor', vertical: 'eletrodomesticos', label: 'Aquecedor', rank: 143, profile: GTIN_P(EL_VOLT), domains: [/HEATERS|OIL_RADIATORS|FAN_HEATERS/],
    terms: combineTerms('aquecedor', ['eletrico', 'a oleo', 'de ambiente', 'ceramico', 'halogeneo', 'portatil'], ['cadence', 'mondial', 'britania', 'arno', 'philco', 'ventisol', 'electrolux', 'lenoxx', 'wap', 'agratto']),
  }),
  seg({
    key: 'chaleira-eletrica', vertical: 'eletrodomesticos', label: 'Chaleira elétrica', rank: 144, profile: GTIN_P(EL_VOLT), domains: [/ELECTRIC_KETTLES|WATER_KETTLES/],
    terms: combineTerms('chaleira eletrica', ['', 'inox', '1,7l', 'vidro', 'digital controle de temperatura'], MARCAS_CASA),
  }),
  seg({
    key: 'sanduicheira-grill', vertical: 'eletrodomesticos', label: 'Sanduicheira, grill e waffle', rank: 145, profile: GTIN_P(EL_VOLT), domains: [/SANDWICH_MAKERS|ELECTRIC_GRILLS|WAFFLE|GRILLS_AND_SANDWICH/],
    terms: combineTerms('', ['sanduicheira', 'grill eletrico', 'maquina de waffle', 'grill e sanduicheira', 'crepeira eletrica'], ['mondial', 'britania', 'oster', 'philco', 'cadence', 'arno', 'black decker', 'agratto', 'fischer', 'cuisinart']),
  }),
  seg({
    key: 'torradeira', vertical: 'eletrodomesticos', label: 'Torradeira', rank: 146, profile: GTIN_P(EL_VOLT), domains: [/TOASTERS/],
    terms: combineTerms('torradeira', ['', 'eletrica', 'inox', '2 fatias', '4 fatias'], ['mondial', 'britania', 'oster', 'philco', 'cadence', 'arno', 'black decker', 'agratto', 'philips walita']),
  }),
  seg({
    key: 'processador-de-alimentos', vertical: 'eletrodomesticos', label: 'Processador de alimentos, mixer e multiprocessador', rank: 147, profile: GTIN_P(EL_VOLT), domains: [/FOOD_PROCESSORS|HAND_MIXERS|HAND_BLENDERS|MULTI_PROCESSORS|CHOPPERS/],
    terms: combineTerms('', ['processador de alimentos', 'mixer', 'multiprocessador', 'mini processador', 'triturador eletrico'], ['oster', 'philips walita', 'britania', 'mondial', 'arno', 'cadence', 'black decker', 'electrolux', 'philco', 'tramontina', 'fischer']),
  }),
  seg({
    key: 'espremedor', vertical: 'eletrodomesticos', label: 'Espremedor e centrífuga de sucos', rank: 148, profile: GTIN_P(EL_VOLT), domains: [/JUICERS|CITRUS_PRESSES|JUICE_EXTRACTORS/],
    terms: combineTerms('', ['espremedor de frutas', 'espremedor de laranja', 'centrifuga de sucos', 'extrator de sucos', 'espremedor de citricos'], ['mondial', 'britania', 'oster', 'philco', 'cadence', 'arno', 'philips walita', 'black decker', 'agratto', 'fischer']),
  }),
  seg({
    key: 'lavadora-alta-pressao', vertical: 'eletrodomesticos', label: 'Lavadora de alta pressão', rank: 149, profile: GTIN_P(EL_VOLT), domains: [/PRESSURE_WASHERS|HIGH_PRESSURE|WATER_BLASTERS/],
    terms: combineTerms('lavadora de alta pressao', ['', '1800 psi', '2000 psi', 'residencial', 'bivolt'], ['karcher', 'wap', 'black decker', 'electrolux', 'bosch', 'tramontina', 'mondial', 'lavor', 'makita', 'worker', 'tekna']),
  }),
  seg({
    key: 'maquina-de-costura', vertical: 'eletrodomesticos', label: 'Máquina de costura', rank: 150, profile: GTIN_P(EL_VOLT), domains: [/SEWING_MACHINES/],
    terms: combineTerms('maquina de costura', ['', 'domestica', 'portatil', 'overloque', 'galoneira', 'industrial reta'], ['singer', 'brother', 'janome', 'elgin', 'silver star', 'lanmax', 'bernina', 'jack', 'consul', 'typical']),
  }),
  seg({
    key: 'chuveiro-eletrico', vertical: 'eletrodomesticos', label: 'Chuveiro e ducha elétrica', rank: 183, profile: GTIN_P(EL_VOLT), domains: [/ELECTRIC_SHOWERS|SHOWER_HEADS|SHOWER_HEATERS|^MLB-SHOWERS$|ELECTRIC_SHOWER/],
    terms: combineTerms('chuveiro eletrico', ['', '5500w', '7500w', '220v', '127v', 'ducha eletronica', 'multitemperaturas', 'com pressurizador', 'ducha higienica'], ['lorenzetti', 'hydra', 'fame', 'corona', 'enerbras', 'zagonel', 'bello', 'blukit', 'mor', 'sintex', 'tramontina', 'cardal', 'fortlev']),
    note: 'Aprovado pelo dono em 2026-11-12. Resistência avulsa e acabamento de registro ficam fora (nicho).',
  }),
  seg({
    key: 'aquecedor-de-agua', vertical: 'eletrodomesticos', label: 'Aquecedor de água (a gás, elétrico e solar)', rank: 184, profile: GTIN_P(EL_VOLT), domains: [/WATER_HEATERS|GAS_WATER_HEATERS|ELECTRIC_WATER_HEATERS|STORAGE_WATER_HEATERS|TANKLESS|BOILERS_FOR_WATER/],
    terms: combineTerms('aquecedor de agua', ['', 'a gas', 'gn', 'glp', 'eletrico 50 litros', 'de passagem', 'eletrico', 'solar', 'boiler', 'digital'], ['rinnai', 'komeco', 'lorenzetti', 'bosch', 'orbis', 'cumulus', 'soprano', 'rheem', 'mondial', 'springer', 'electrolux', 'ariston']),
    note: 'Aprovado pelo dono em 2026-11-12. Convive com o tipo "aquecedor" (ambiente): o nicho de lá já barra "aquecedor de água".',
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// ESPORTE
// ---------------------------------------------------------------------------------------------------------------------
const MARCAS_FITNESS = ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'polimet', 'dream fitness', 'techfit', 'movement', 'athletic', 'sepo', 'prottector', 'pretorian', 'everlast'];

const ESPORTE: SegmentConfig[] = [
  seg({
    key: 'bicicleta', vertical: 'esporte', label: 'Bicicleta', rank: 160, domains: [/^MLB-BICYCLES$|MOUNTAIN_BIKES|ROAD_BIKES|URBAN_BIKES|ELECTRIC_BIKES|BMX_BIKES|FOLDING_BIKES/], excludeDomains: [/STATIONARY|EXERCISE/],
    terms: combineTerms('', ['bicicleta aro 29', 'bicicleta aro 26', 'bicicleta aro 20 infantil', 'bicicleta aro 24', 'mountain bike 21 marchas', 'bicicleta speed', 'bicicleta eletrica', 'bicicleta dobravel', 'bicicleta gravel', 'bicicleta bmx'], ['caloi', 'houston', 'oggi', 'sense', 'tsw', 'gts', 'absolute', 'track bikes', 'groove', 'specialized', 'trek', 'soul', 'audax', 'sundown', 'mormaii', 'athor', 'vikingx', 'south']),
  }),
  seg({
    key: 'patins', vertical: 'esporte', label: 'Patins', rank: 161, domains: [/ROLLER_SKATES|INLINE_SKATES|QUAD_SKATES/],
    terms: combineTerms('patins', ['inline', 'quad', 'infantil ajustavel', 'roller', 'profissional'], ['traxart', 'bel sports', 'oxelo', 'fila', 'moov', 'seba', 'rollerblade', 'powerslide', 'impala', 'mormaii', 'bob burnquist']),
  }),
  seg({
    key: 'skate', vertical: 'esporte', label: 'Skate e longboard', rank: 162, domains: [/SKATEBOARDS|LONGBOARDS|SKATE_/],
    terms: combineTerms('skate', ['', 'completo', 'montado', 'longboard', 'cruiser', 'infantil', 'street'], ['element', 'mormaii', 'santa cruz', 'bob burnquist', 'powell', 'tony hawk', 'vans', 'chaves', 'bel sports', 'oxelo', 'traxart', 'dc shoes']),
  }),
  seg({
    key: 'patinete', vertical: 'esporte', label: 'Patinete e scooter', rank: 163, domains: [/KICK_SCOOTERS|SCOOTERS|ELECTRIC_SCOOTERS/],
    terms: combineTerms('patinete', ['', 'eletrico', 'infantil', 'dobravel', 'adulto', 'freestyle'], ['xiaomi', 'segway ninebot', 'oxelo', 'bel sports', 'dm toys', 'mormaii', 'multilaser', 'zippy toys', 'kikos', 'razor']),
  }),
  seg({
    key: 'banco-de-musculacao', vertical: 'esporte', label: 'Banco de musculação e supino', rank: 164, domains: [/WEIGHT_BENCHES|EXERCISE_BENCHES|BENCHES_FOR_GYM|BENCH_PRESS/],
    terms: combineTerms('banco', ['supino', 'regulavel', 'musculacao', 'com suporte de barra', 'dobravel', 'inclinado'], MARCAS_FITNESS.slice(0, 12)),
  }),
  seg({
    key: 'estacao-de-musculacao', vertical: 'esporte', label: 'Estação de musculação', rank: 165, profile: GTIN_P(['ALPHANUMERIC_MODEL', 'VOLTAGE']), domains: [/HOME_GYMS|MULTI_GYMS|GYM_STATIONS|MULTIGYMS|STRENGTH_TRAINING_MACHINES/],
    terms: combineTerms('estacao de musculacao', ['', 'completa', 'multifuncional', 'residencial', 'com leg press', 'smith'], MARCAS_FITNESS.slice(0, 12)),
  }),
  seg({
    key: 'barra-e-anilha', vertical: 'esporte', label: 'Barra e anilha de peso', rank: 166, domains: [/BARBELLS|WEIGHT_PLATES|WEIGHT_LIFTING/],
    terms: [...combineTerms('', ['barra olimpica', 'anilha olimpica', 'anilha emborrachada', 'barra w', 'kit anilhas', 'barra reta musculacao'], MARCAS_FITNESS.slice(0, 11))],
  }),
  seg({
    key: 'luva-de-boxe', vertical: 'esporte', label: 'Luva de boxe e MMA', rank: 167, domains: [/BOXING_GLOVES|MARTIAL_ARTS_GLOVES|MMA_GLOVES/],
    terms: combineTerms('luva de boxe', ['', 'muay thai', 'mma', 'profissional', 'infantil', 'treino 12oz'], ['everlast', 'venum', 'rival', 'pretorian', 'punch', 'fairtex', 'twins', 'bad boy', 'adidas', 'leader', 'rudel', 'madison']),
  }),
  seg({
    key: 'saco-de-pancada', vertical: 'esporte', label: 'Saco de pancada', rank: 168, domains: [/PUNCHING_BAGS|HEAVY_BAGS|BOXING_BAGS/],
    terms: combineTerms('saco de pancada', ['', 'pedestal', 'cheio', 'muay thai 1,20', 'de teto', 'infantil'], ['pretorian', 'punch', 'everlast', 'madison', 'rudel', 'leader', 'acte', 'kikos', 'liveup', 'oneal']),
  }),
  seg({
    key: 'oculos-de-natacao', vertical: 'esporte', label: 'Óculos de natação', rank: 169, domains: [/SWIM_GOGGLES|SWIMMING_GOGGLES|SWIM_MASKS/],
    terms: combineTerms('oculos de natacao', ['', 'espelhado', 'infantil', 'antiembacante', 'profissional'], ['speedo', 'arena', 'nike', 'hammerhead', 'mormaii', 'tyr', 'zoggs', 'oxer', 'cressi', 'finis']),
  }),
  seg({
    key: 'foam-roller', vertical: 'esporte', label: 'Rolo de massagem e liberação miofascial', rank: 170, domains: [/FOAM_ROLLERS|MASSAGE_ROLLERS|MASSAGE_BALLS|MYOFASCIAL/],
    terms: combineTerms('', ['rolo de espuma foam roller', 'rolo de massagem', 'bola de massagem', 'rolo de liberacao miofascial', 'massageador muscular'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'theragun', 'hypervolt']),
  }),
  seg({
    key: 'bola-de-pilates', vertical: 'esporte', label: 'Bola de pilates e suíça', rank: 171, domains: [/EXERCISE_BALLS|SWISS_BALLS|PILATES_BALLS|FITNESS_BALLS/],
    terms: combineTerms('bola de pilates', ['', 'suica 65cm', '75cm', 'com bomba', 'antiestouro', 'overball'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'sepo', 'carci']),
  }),
  seg({
    key: 'capacete-de-ciclismo', vertical: 'esporte', label: 'Capacete de ciclismo', rank: 172, domains: [/BIKE_HELMETS|CYCLING_HELMETS|HELMETS_FOR_BIKES/],
    terms: combineTerms('capacete de ciclismo', ['', 'mtb', 'speed', 'infantil', 'com led', 'urbano'], ['absolute', 'asw', 'oggi', 'giro', 'specialized', 'bell', 'bontrager', 'high one', 'sol', 'bike tech', 'mormaii', 'sense']),
  }),
  seg({
    key: 'tenis-de-mesa', vertical: 'esporte', label: 'Tênis de mesa (raquete, mesa, bolinha)', rank: 173, domains: [/TABLE_TENNIS|PING_PONG/],
    terms: combineTerms('', ['raquete de ping pong', 'mesa de ping pong', 'bolinha de ping pong', 'kit tenis de mesa', 'raquete tenis de mesa profissional'], ['butterfly', 'dhs', 'stiga', 'donic', 'yasaka', 'klopf', 'proaction', 'acte', 'nittaku', 'vollo']),
  }),
  // Suplementos (decisão do dono, 2026-11-12). Alimento: só embalagem lacrada, NOVA e dentro da validade (o catálogo exige condition=new; o nicho barra "vencimento próximo"/"validade curta").
  seg({
    key: 'suplemento', vertical: 'esporte', label: 'Suplementos (whey, creatina, pré-treino, aminoácidos)', rank: 185, domains: [/PROTEIN_SUPPLEMENTS|WHEY|CREATINE|AMINO_ACIDS|PRE_WORKOUT|SPORTS_SUPPLEMENTS|SPORT_NUTRITION|DIETARY_SUPPLEMENTS|SUPPLEMENTS/],
    terms: combineTerms('', ['whey protein', 'creatina monohidratada', 'pre treino', 'bcaa', 'glutamina', 'hipercalorico', 'albumina', 'colageno', 'omega 3', 'cafeina', 'multivitaminico', 'barra de proteina', 'termogenico', 'isolado whey'], ['max titanium', 'growth supplements', 'integralmedica', 'probiotica', 'dux nutrition', 'optimum nutrition', 'black skull', 'darkness', 'essential nutrition', 'universal', 'dymatize', 'new millen', 'atlhetica', 'bodyaction', 'vitafor', 'soldiers nutrition']),
    refresh: 60,
    note: 'Aprovado pelo dono em 2026-11-12. Identidade: GTIN do catálogo (embalagem/peso/sabor separados quando o ML separa; sabor não junta). Sem lote ou validade no catálogo: a regra é lacrado, novo, sem "vencimento próximo".',
  }),
  seg({
    key: 'camping', vertical: 'esporte', label: 'Camping (barraca, saco de dormir, fogareiro, colchonete)', rank: 186, domains: [/CAMPING|TENTS|SLEEPING_BAGS|CAMP_STOVES|SLEEPING_PADS|CAMPING_CHAIRS|HAMMOCKS|CAMP_COOKWARE/],
    terms: combineTerms('', ['barraca de camping', 'saco de dormir', 'colchonete camping', 'fogareiro camping', 'cadeira de camping', 'lampiao camping', 'isolante termico camping', 'rede de descanso', 'mesa dobravel camping', 'caixa termica', 'cooler 50 litros'], ['nautika', 'mor', 'azteq', 'guepardo', 'ntk', 'echolife', 'bel fix', 'coleman', 'quechua', 'naturehike', 'invictus', 'curtlo', 'termolar', 'soprano']),
    refresh: 60,
    note: 'Aprovado pelo dono em 2026-11-12.',
  }),
  seg({
    key: 'pesca', vertical: 'esporte', label: 'Pesca (vara, molinete, carretilha)', rank: 187, domains: [/FISHING_RODS|FISHING_REELS|FISHING|ANGLING/], excludeDomains: [/LURES|BAITS|HOOKS|LINES|ACCESSORIES/],
    terms: combineTerms('', ['vara de pesca', 'molinete', 'carretilha', 'vara telescopica', 'vara de carretilha', 'kit pesca completo', 'vara pesca maritima', 'molinete 4000', 'carretilha perfil baixo'], ['marine sports', 'albatroz', 'shimano', 'daiwa', 'okuma', 'saint plus', 'maruri', 'pioneer', 'sumax', 'lumis', 'abu garcia', 'penn', 'nautika']),
    refresh: 60,
    note: 'Aprovado pelo dono em 2026-11-12. Só equipamento principal (vara, molinete, carretilha); isca, anzol e linha ficam fora (domínios excluídos e nicho).',
  }),
  seg({
    key: 'trilha', vertical: 'esporte', label: 'Trilha e montanhismo (mochila cargueira, bastão, lanterna de cabeça)', rank: 188, domains: [/HIKING|TREKKING|BACKPACKS_FOR_HIKING|TRAIL|HEADLAMPS|TREKKING_POLES|MOUNTAINEERING|HYDRATION_PACKS/],
    terms: combineTerms('', ['mochila de trilha', 'mochila cargueira', 'bastao de trekking', 'lanterna de cabeca', 'mochila de hidratacao', 'bota de trilha', 'corta vento trilha', 'capa de chuva mochila', 'bussola', 'filtro de agua portatil'], ['quechua', 'nautika', 'curtlo', 'ntk', 'azteq', 'guepardo', 'deuter', 'osprey', 'columbia', 'salomon', 'timberland', 'camelbak', 'naturehike', 'invictus']),
    refresh: 60,
    note: 'Aprovado pelo dono em 2026-11-12. Domínio a confirmar; "mochila esportiva" (academia) tem segmento próprio.',
  }),
];

export const NOVOS_SEGMENTOS_TIPOS: SegmentConfig[] = [...ELETRO, ...TECNOLOGIA, ...I3D, ...CASA, ...ESPORTE];

// ---------------------------------------------------------------------------------------------------------------------
// TERMOS EXTRAS DE SEGMENTOS JÁ EXISTENTES (anexados ao fim; mais modelos e marcas por tipo, sem teto)
// ---------------------------------------------------------------------------------------------------------------------
const NB_BRANDS = ['acer', 'lenovo', 'dell', 'hp', 'asus', 'samsung', 'apple', 'positivo', 'multilaser', 'avell', 'vaio', 'msi', 'gigabyte', 'lg gram', 'huawei', 'xiaomi redmibook', 'razer', 'alienware', 'infinix'];

export const TERMOS_EXTRAS_TIPOS: Record<string, string[]> = {
  notebook: [
    ...combineTerms('notebook', ['i3 8gb', 'i5 16gb', 'ryzen 7 16gb', 'core ultra', 'ryzen 5 7520u', 'celeron', 'oled', 'touch 2 em 1', '15.6 full hd', '14 polegadas'], NB_BRANDS),
    'macbook air m2', 'macbook air m3', 'macbook pro m3', 'chromebook', 'notebook gamer rtx 4050', 'notebook gamer rtx 4060', 'notebook gamer rtx 5060',
  ],
  'placa-de-video': [
    ...combineTerms('placa de video', ['rtx 4060 ti', 'rtx 5050', 'rtx 5080', 'rx 7800 xt', 'rx 9070 xt', 'rx 9060 xt', 'gtx 1650', 'gtx 1660 super', 'rtx 3050', 'rtx 4070 super', 'arc b580'], ['asus', 'gigabyte', 'msi', 'galax', 'zotac', 'pny', 'xfx', 'sapphire', 'powercolor', 'asrock', 'colorful', 'palit']),
  ],
  monitor: [
    ...combineTerms('monitor', ['gamer 32 polegadas', 'ultrawide 34', 'portatil usb c', '100hz ips', '75hz 24 polegadas', 'oled', 'profissional 4k', 'full hd 21.5', 'led 19 polegadas'], ['lg', 'samsung', 'aoc', 'acer', 'asus', 'gigabyte', 'dell', 'philips', 'msi', 'benq', 'viewsonic', 'hp', 'lenovo', 'positivo', 'multilaser', 'koorui', 'pichau', 'redragon', 'bluecase', 'mancer']),
  ],
  ssd: [
    ...combineTerms('ssd', ['nvme 4tb', 'nvme 2tb gen4', 'sata 1tb', 'sata 240gb', 'sata 960gb', 'm.2 pcie 4.0', 'nvme gen5'], ['kingston', 'wd', 'crucial', 'samsung', 'adata', 'lexar', 'gigabyte', 'corsair', 'seagate', 'pny', 'kingspec', 'hikvision', 'sabrent', 'patriot', 'netac', 'fanxiang', 'goldenfir', 'solidigm', 'sk hynix']),
    'hd interno 1tb', 'hd interno 4tb', 'hd 3.5 sata', 'hd sata notebook 2.5',
  ],
  teclado: [...combineTerms('teclado', ['mecanico 75%', 'mecanico 65%', 'mecanico hot swap', 'gamer sem fio', 'low profile', 'switch red', 'switch blue', 'switch brown'], ['redragon', 'logitech', 'razer', 'hyperx', 'corsair', 'keychron', 'fortrek', 'machenike', 'havit', 'akko', 'attack shark', 'royal kludge', 'steelseries', 'asus rog', 'epomaker', 'ducky'])],
  mouse: [...combineTerms('mouse', ['gamer ultraleve', 'gamer 8000 dpi', 'gamer 26000 dpi', 'sem fio 2.4g', 'vertical ergonomico', 'gamer mmo'], ['logitech g', 'razer', 'redragon', 'hyperx', 'corsair', 'attack shark', 'fortrek', 'pulsar', 'steelseries', 'havit', 'machenike', 'glorious', 'zowie', 'asus rog', 'endgame gear', 'lamzu'])],
  'headset-gamer': [...combineTerms('headset', ['gamer usb', 'gamer p2', 'gamer bluetooth', 'gamer ps4', 'gamer pc', 'gamer 2.4g'], ['hyperx', 'redragon', 'logitech g', 'razer', 'corsair', 'jbl quantum', 'astro', 'steelseries', 'fortrek', 'havit', 'edifier', 'asus rog', 'turtle beach', 'pulse sony', 'xbox', 'onikuma', 'cloud', 'dazz'])],
  'cadeira-gamer': [...combineTerms('cadeira gamer', ['couro', 'tecido', 'com apoio de pe', 'rgb', 'xl', 'racer'], ['dt3', 'thunderx3', 'pichau', 'mancer', 'dxracer', 'cougar', 'fortrek', 'redragon', 'husky', 'mad racer', 'tgt', 'corsair', 'bluecase', 'pctop', 'maxracer', 'cadeira office gamer'])],
  'memoria-ram': [...combineTerms('memoria ram', ['ddr5 64gb', 'ddr4 3200 16gb', 'ddr4 notebook sodimm', 'ddr5 6000 32gb', 'ddr3 8gb'], ['kingston', 'corsair', 'crucial', 'xpg', 'gskill', 'redragon', 'patriot', 'lexar', 'team group', 'adata', 'pichau', 'husky', 'fanxiang', 'netac', 'hyperx fury'])],
  processador: [...combineTerms('processador', ['ryzen 5 5600', 'ryzen 7 5700x3d', 'ryzen 5 7600', 'ryzen 7 9800x3d', 'intel core i3 12100f', 'intel core i5 14400f', 'intel core ultra 7', 'ryzen 9 9950x'], ['amd', 'intel'])],
  impressora: [...combineTerms('impressora', ['multifuncional tanque de tinta', 'laser colorida', 'jato de tinta', 'termica cupom', 'matricial', 'a3'], ['epson', 'hp', 'canon', 'brother', 'samsung', 'elgin', 'xerox', 'ricoh', 'kyocera', 'lexmark', 'zebra', 'argox', 'bematech', 'daruma'])],
  // Impressão 3D: mais marcas e modelos (a lista original ficou curta para o mercado)
  'impressora-3d': [...combineTerms('impressora 3d', ['', 'fdm', 'resina', 'corexy', 'multicolor', 'laser', 'grande formato'], ['neptune', 'kobra', 'ender', 'saturn', 'mars', 'photon', 'halot', 'k1 max', 'centauri', 'prusa', 'snapmaker', 'two trees', 'longer', 'geeetech', 'tronxy', 'bambu lab h2d', 'bambu lab a1 mini', 'creality hi', 'flsun', 'kingroon'])],
  'filamento-3d': [...combineTerms('filamento', ['pla 1kg', 'petg 1kg', 'abs 1kg', 'tpu 1kg', 'pla silk', 'pla matte', 'pla carbono', 'pla+ 1kg', 'asa 1kg', 'pa nylon', 'pla madeira', 'pla glow'], ['hatchbox', 'geeetech', 'kingroon', 'sunlu', 'esun', 'eryone', 'jayo', 'polymaker', 'prusament', 'amolen', 'tianse', 'sain smart', 'tecnoprint', 'cliever', '3d fila', 'flashforge', 'inland', 'rosa 3d', 'filamentos brasil', 'atomic filament', 'reprap brasil'])],
  'resina-3d': [...combineTerms('resina', ['3d standard', '3d abs like', '3d water washable', '3d 8k', '3d tough', '3d flexible', 'castable', 'plant based'], ['elegoo', 'anycubic', 'creality', 'siraya tech', 'phrozen', 'esun', 'sunlu', 'jayo', 'amazon basics', 'liqcreate', 'formlabs', 'monocure', 'uniz', 'tecnoprint', 'wanhao'])],
};
