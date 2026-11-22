// Sem 'server-only': NLP leve e determinístico (sem API, sem custo, sem banco). Importável por coletor, scripts e testes.
//
// CESTA POR MODELO (R-114). Extrai de um TÍTULO de anúncio a "chave de modelo": marca, tipo, código de modelo/MPN,
// capacidades, tamanho, voltagem, pack, bundle, edição, região, variante, plataforma. O que NÃO separa (cor, ruído
// comercial) é descartado. A comparação e as restrições duras estão em `comparar.ts`.

/** Dobra acentos e caixa; símbolos de marca somem; mantém letras, dígitos, hífen e barra para códigos. */
export function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[®™©]/g, ' ')
    .replace(/['’´`]/g, '');
}

// ---------------------------------------------------------------------------
// Léxicos
// ---------------------------------------------------------------------------

/** Ruído comercial: descreve o anúncio, não o produto. */
export const RUIDO = new Set([
  'original', 'originais', 'lacrado', 'lacrada', 'novo', 'nova', 'novos', 'novas', 'oficial', 'nacional', 'brasil', 'br', 'ptbr', 'pt',
  'frete', 'gratis', 'garantia', 'promocao', 'promo', 'oferta', 'imperdivel', 'lancamento', 'pronta', 'pronto', 'entrega', 'envio',
  'imediato', 'imediata', 'rapido', 'rapida', 'nf', 'nfe', 'nota', 'fiscal', 'full', 'sem', 'juros', 'hoje', 'melhor', 'preco', 'barato',
  'kit', 'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'em', 'no', 'na', 'por', 'ao', 'the', 'of',
  'and', 'for', 'with', 'by', 'p', 'c', 'cor', 'tipo', 'modelo', 'versao', 'linha', 'serie', 'marca', 'produto', 'item', 'unidade', 'un',
  'unid', 'original', 'premium', 'qualidade', 'alta', 'excelente', 'ideal', 'perfeito', 'perfeita', 'super', 'top', 'importado', 'importada',
  'cp', 'pcs', 'peca', 'pecas', 'mais', 'ate', 'x', 'gamer', 'profissional', 'portatil', 'digital', 'eletrico', 'eletrica', 'edicao', 'edition', 'full', 'hd', 'fisica', 'fisico', 'midia', 'jogo', 'game', 'games', 'disco', 'bluetooth', 'wireless', 'sem', 'fio',
]);

/** Cor comum NÃO separa (decisão do dono): sai do núcleo. */
export const CORES = new Set([
  'preto', 'preta', 'branco', 'branca', 'azul', 'vermelho', 'vermelha', 'verde', 'rosa', 'roxo', 'roxa', 'cinza', 'prata', 'prateado',
  'prateada', 'dourado', 'dourada', 'amarelo', 'amarela', 'laranja', 'bege', 'marrom', 'grafite', 'titanio', 'natural', 'midnight', 'black',
  'white', 'blue', 'red', 'green', 'pink', 'purple', 'gray', 'grey', 'silver', 'gold', 'yellow', 'orange', 'coral', 'turquesa', 'lilas',
  'violeta', 'translucido', 'transparente', 'floral', 'estampado', 'estampada', 'liso', 'lisa', 'metal', 'metalico', 'metalica', 'neon', 'camuflado', 'camuflada', 'cobalt', 'cosmic', 'starlight', 'volcanic', 'nocturnal', 'escuro',
  'claro', 'multicolor', 'colorido', 'colorida', 'bicolor', 'nude', 'off', 'marfim', 'vinho', 'petroleo', 'chumbo', 'carvao', 'inox', 'aco',
]);

/** Palavras que marcam o início da parte de COMPATIBILIDADE ("para PS5"): o que vem depois não identifica o item. */
const COMPAT_RE = /\b(?:para|compativel(?:\s+com)?|compat(?:ivel)?|p\/|serve\s+(?:em|no|na)|cabe\s+(?:em|no|na)|for|fits|compatible\s+with|uso\s+(?:no|na|em))\b/;

/** Marcas conhecidas (multi-palavra com espaço). Complementado em tempo de execução por `fabricantes` do banco. */
export const MARCAS_BASE: string[] = [
  'sony', 'microsoft', 'nintendo', 'sega', 'samsung', 'lg', 'apple', 'xiaomi', 'motorola', 'lenovo', 'dell', 'hp', 'asus', 'acer', 'msi', 'gigabyte',
  'philips', 'panasonic', 'jbl', 'bose', 'harman kardon', 'sennheiser', 'audio-technica', 'audio technica', 'edifier', 'anker', 'baseus', 'ugreen', 'qcy',
  'haylou', 'redmi', 'poco', 'realme', 'oppo', 'huawei', 'tcl', 'aoc', 'philco', 'britania', 'mondial', 'electrolux', 'brastemp', 'consul', 'midea', 'arno',
  'oster', 'cadence', 'wap', 'karcher', 'bosch', 'makita', 'dewalt', 'black decker', 'tramontina', 'multilaser', 'intelbras', 'positivo', 'logitech',
  'razer', 'corsair', 'hyperx', 'redragon', 'thunderx3', 'dt3', 'kingston', 'sandisk', 'seagate', 'western digital', 'wd', 'crucial', 'adata', 'pny',
  'nvidia', 'amd', 'intel', 'canon', 'nikon', 'epson', 'brother', 'fujifilm', 'gopro', 'dji', 'insta360', 'akaso', 'sjcam', 'creality', 'anycubic',
  'elegoo', 'bambu lab', 'bambu', 'prusa', 'flashforge', 'sunlu', 'esun', 'polymaker', 'tp-link', 'tp link', 'tplink', 'd-link', 'netgear', 'ubiquiti',
  'garmin', 'amazfit', 'fitbit', 'amazon', 'google', 'meta', 'oculus', 'valve', 'hori', 'pdp', 'powera', 'turtle beach', 'astro', 'steelseries', 'rode',
  'shure', 'maono', 'fifine', 'boya', 'hikvision', 'ezviz', 'roborock', 'dreame', 'wyze', 'cricut', 'adidas', 'nike', 'puma', 'olympikus', 'mizuno',
  'penalty', 'topper', 'umbro', 'wilson', 'spalding', 'speedo', 'fila', 'asics', 'new balance', 'under armour', 'skechers', 'havaianas', 'loreal',
  'maybelline', 'nivea', 'natura', 'boticario', 'avon', 'eudora', 'risque', 'vult', 'mac', 'medicube', 'kerastase', 'schwarzkopf', 'taiff', 'gama',
  'hyperkin', 'analogue', '8bitdo', 'retro-bit', 'switch', 'ea', 'capcom', 'bandai namco', 'square enix', 'ubisoft', 'activision', 'warner', 'konami',
  'tomy', 'hasbro', 'mattel', 'lego', 'funko', 'estrela', 'grow', 'playmobil', 'sunny', 'candide', 'intrinseca', 'rocco', 'companhia das letras',
  'panini', 'jbc', 'newpop', 'darkside', 'record', 'sextante', 'planeta', 'principis', 'harpercollins', 'globo livros', 'arqueiro', 'leya', 'melhoramentos',
  'ugreen', 'vonder', 'mitutoyo', 'fluke', 'rigol', 'hantek', 'fnirsi', 'electro', 'semp', 'multi', 'lenoxx', 'mallory', 'suggar', 'faet', 'fischer',
  'gallant', 'agratto', 'ventisol', 'springer', 'komeco', 'springer midea', 'carrier', 'daikin', 'elgin', 'fujitsu', 'gree', 'hisense', 'toshiba',
  'sharp', 'roku', 'xbox', 'playstation', 'ps5',
].filter((m) => m !== 'switch' && m !== 'ea' && m !== 'ps5' && m !== 'playstation' && m !== 'xbox');

/** Tipos em que Pro/Max/Ultra/Slim/Lite/Plus... definem outro produto (em vestuário, "mini" e "se" são tamanho/ruído). */
const TIPOS_COM_VARIANTE = new Set(['console', 'controle', 'headset', 'fone', 'celular', 'tablet', 'notebook', 'placa_video', 'processador', 'camera', 'caixa_som', 'impressora3d', 'filamento', 'tv', 'monitor', 'power_bank', 'aspirador']);

// Tipos de produto (a ordem importa: o mais específico primeiro). `acessorio` marca peça/acessório (nunca entra na cesta do principal).
interface RegraTipo { tipo: string; re: RegExp; acessorio?: boolean; maxIdx?: number }
const TIPOS: RegraTipo[] = [
  // acessórios e peças (vencem o produto principal quando o título começa por eles)
  { tipo: 'capa_case', maxIdx: 12, re: /\b(?:capa|capinha|case|estojo|bolsa|bag|mochila|maleta|pouch|sleeve|funda)\b/, acessorio: true },
  { tipo: 'pelicula', re: /\b(?:pelicula|protetor\s+de\s+tela|vidro\s+temperado|screen\s+protector)\b/, acessorio: true },
  { tipo: 'suporte_base', re: /\b(?:suporte|base\s+(?:de\s+)?(?:carregamento|vertical|refrigerad\w+|cooler)|dock|stand|tripe|trip[oó]de|grip|escudo|protetor|skin|adesivo|sticker|capa\s+anti[\s-]?poeira|anti[\s-]?poeira|filtro\s+de\s+poeira)\b/, acessorio: true },
  { tipo: 'power_bank', re: /\b(?:power\s*bank|carregador\s+portatil|bateria\s+externa)\b/ },
  { tipo: 'cabo_adaptador', re: /\b(?:cabo|adaptador|conversor|hub|extensor|extensao|conector|fonte\s+de\s+alimentacao|carregador|charger|cable|cord)\b/, acessorio: true },
  { tipo: 'peca_reposicao', re: /\b(?:motor(?=\s+\d)|motor\s+(?:para|de)|sensor\s+(?:de\s+)?temperatura|termostato|resistencia\s+(?:para|de)|helices?|tampa\s+(?:para|de)|puxador(?:es)?\s+(?:de\s+)?(?:cesta|gaveta)|engrenagens?|parafusos?|painel\s+(?:para|de)|tapetes?\s+(?:de\s+)?(?:silicone|papel)|forminhas?|papel\s+(?:para|descartavel)|pe\s+de\s+borracha|apoios?\s+de\s+borracha|nozzle|hotend|extrusor|bateria\s+(?:para|de\s+reposicao)|reposicao|filtro|escova\s+lateral|sacos?\s+(?:para\s+)?aspirador|ponteira|almofada|earpad|ear\s?pad|espuma\s+(?:para\s+)?fone|placa\s+de\s+constru|mesa\s+pei|build\s*plate|lamina\s+de\s+reposicao)\b/, acessorio: true },
  { tipo: 'peca_reposicao', re: /^(?=.*\b(?:air\s*fryer|fritadeira|aspirador|liquidificador|geladeira|batedeira|cafeteira)\b)(?:botao|botoes|cestos?|bandejas?|grades?|cesta|gaveta|timer|tampa|puxador|alca|cabo)\b/, acessorio: true },
  { tipo: 'peca_reposicao', re: /^(?=.*\b(?:impressora|3d|esteira|aspirador)\b)(?:correia|cinto|bico)\b/, acessorio: true },
  { tipo: 'cartao_gift', re: /\b(?:gift\s*card|cartao\s+presente|cartao\s+psn|cartao\s+xbox|codigo\s+digital|\bpsn\s+card)\b/, acessorio: true },
  // principais
  { tipo: 'console', re: /\bconsole\b|\bplaystation\s+portal\b/ },
  { tipo: 'controle', re: /\b(?:controle|controlador|controller|joystick|gamepad|manete|dualsense|dualshock|joy[\s-]?con|pro\s+controller)\b/ },
  { tipo: 'headset', re: /\b(?:headset|headphone|head\s+phone)\b/ },
  { tipo: 'fone', re: /\b(?:fone|fones|earphone|earbuds?|airpods|auricular|in[\s-]?ear|tws)\b/ },
  { tipo: 'impressora3d', re: /\b(?:impressora\s+3d|3d\s+printer)\b/ },
  { tipo: 'filamento', re: /\b(?:filamento|filament)\b/ },
  { tipo: 'resina', re: /\b(?:resina|resin)\b/ },
  { tipo: 'tv', re: /\b(?:tv|televisor|televisao|smart\s+tv)\b/ },
  { tipo: 'notebook', re: /\b(?:notebook|laptop|macbook|ultrabook|chromebook)\b/ },
  { tipo: 'tablet', re: /\b(?:tablet|ipad|galaxy\s+tab)\b/ },
  { tipo: 'celular', re: /\b(?:celular|smartphone|iphone|galaxy\s+[sazm]\d+|galaxy\s+(?:z|note)|moto\s+[a-z]\d+|redmi\s+(?:note\s+)?\d+|poco\s+[a-z]\d+|pixel\s+\d+|telefone\s+celular)\b/ },
  { tipo: 'monitor', re: /\b(?:monitor)\b/ },
  { tipo: 'placa_mae', re: /\b(?:placa[\s-]?mae|motherboard)\b/ },
  { tipo: 'placa_video', re: /\b(?:placa\s+de\s+video|gpu|geforce|radeon)\b/ },
  { tipo: 'processador', re: /\b(?:processador|ryzen|core\s+i[3579])\b/ },
  { tipo: 'memoria_ram', re: /\b(?:memoria\s+ram|ddr[345])\b/ },
  { tipo: 'ssd_hd', re: /\b(?:ssd|hd\s+externo|hard\s+disk|disco\s+rigido)\b/ },
  { tipo: 'cartao_memoria', re: /\b(?:cartao\s+de\s+memoria|micro\s?sd|sd\s?card|pen\s?drive|pendrive)\b/ },
  { tipo: 'mouse', re: /\b(?:mouse)\b/ },
  { tipo: 'teclado', re: /\b(?:teclado|keyboard)\b/ },
  { tipo: 'caixa_som', re: /\b(?:caixa\s+(?:de\s+)?som|soundbar|speaker|alto[\s-]?falante)\b/ },
  { tipo: 'camera', re: /\b(?:camera|webcam|gopro|filmadora)\b/ },
  { tipo: 'air_fryer', re: /\b(?:air\s*fryer|fritadeira)\b/ },
  { tipo: 'aspirador', re: /\b(?:aspirador|robo\s+aspirador|vacuum)\b/ },
  { tipo: 'geladeira', re: /\b(?:geladeira|refrigerador|freezer)\b/ },
  { tipo: 'ar_condicionado', re: /\b(?:ar\s+condicionado|split)\b/ },
  { tipo: 'maquina_lavar', re: /\b(?:lavadora|maquina\s+de\s+lavar|lava\s+e\s+seca|secadora)\b/ },
  { tipo: 'fogao', re: /\b(?:fogao|cooktop)\b/ },
  { tipo: 'livro', re: /\b(?:biblia|editora|editorial|capa\s+mole|livro|box\s+de\s+livros|hq|manga|romance|biografia|edicao\s+brochura|capa\s+(?:dura|comum)|brochura)\b|\bisbn\b/ },
  { tipo: 'perfume', re: /\b(?:perfume|eau\s+de|colonia|parfum)\b/ },
  { tipo: 'bola', re: /\b(?:bola)\b/ },
  { tipo: 'cadeira', re: /\b(?:cadeira)\b/ },
];

/** Variantes que definem produto diferente (Slim x Pro, S24 x S24 Ultra, RTX 4060 x 4060 Ti, Switch x Lite). */
const VARIANTES = new Set([
  'pro', 'max', 'ultra', 'plus', 'mini', 'lite', 'slim', 'oled', 'fe', 'ti', 'xl', 'se', 'air', 'edge', 'elite', 'neo', 'fold', 'flip', 'core',
  'standard', 'basic', 'basico', 'advanced', 'gt', 'xt', 'xtx', 'vr', 'vr2', 'portal', 'fat', 'one', 'go',
]);
/** Palavras de variante que são só ruído de anúncio em alguns tipos. */
const VARIANTE_NEUTRA = new Set(['standard', 'basic', 'basico', 'one', 'go', 'core', 'air']);

const EDICOES = /\b(?:edicao\s+(?:limitada|especial|colecionador|de\s+colecao|comemorativa|aniversario|definitiva|de\s+colecionador)|limited\s+edition|special\s+edition|collector'?s?|colecionador|deluxe|ultimate|gold\s+edition|anniversary|aniversario|\d{2}\s+anos|steelbook|day\s?one|goty|game\s+of\s+the\s+year|definitiv[eo]a?|remastered|remaster|remake|greatest\s+hits|platinum|essentials|player'?s\s+choice|nintendo\s+selects|edicao\s+de\s+luxo)\b/g;

const REGIAO_IMPORT = /\b(?:importad[oa]s?|importacao|japones[a]?|jap|americano|americana|europeu|europeia|chines|chinesa|coreano|coreana|direct\s+from\s+japan|from\s+japan|plug\s+(?:eu|us|uk|au)|versao\s+(?:global|internacional|americana|europeia|japonesa|chinesa|asiatica)|edicao\s+(?:japonesa|americana|europeia|asiatica)|global\s+version|internacional|international\s+version|regiao\s+(?:usa|eur|jp|asia))\b/;
/** Siglas de região só valem em MAIÚSCULAS no título cru ("usa" é o verbo; "PaL" é marca/cor). */
const REGIAO_SIGLA = /(?:^|[^A-Za-z0-9])(?:USA|EUA|EUR|UK|JP|JPN|PAL|NTSC(?:-[UJC])?)(?=$|[^A-Za-z0-9])/;

const CONDICAO_NAO_NOVA = /\b(?:open\s?box|usad[oa]s?|seminov[oa]s?|recondicionad[oa]s?|refurbished|renovad[oa]s?|vitrine|mostruario|pre[\s-]?owned|segunda\s+mao|com\s+defeito|sucata|retirada\s+de\s+pecas|desbloquead[oa]s?|chipad[oa]s?|dualboot|tinfoil)\b/;

const PLATAFORMAS: Array<[string, RegExp]> = [
  ['switch2', /\b(?:nintendo\s+)?switch\s*2\b|\bns2\b/],
  ['switch', /\b(?:nintendo\s+)?switch\b|\bnsw\b/],
  ['ps5', /\b(?:playstation|play\s+station)\s*5\b|\bps\s*5\b/],
  ['ps4', /\b(?:playstation|play\s+station)\s*4\b|\bps\s*4\b/],
  ['ps3', /\b(?:playstation|play\s+station)\s*3\b|\bps\s*3\b/],
  ['xbox_series', /\bxbox\s*series\b|\bseries\s*[xs]\b|\bxsx\b/],
  ['xbox_one', /\bxbox\s*one\b|\bxone\b/],
  ['xbox_360', /\bxbox\s*360\b/],
  ['pc', /\b(?:pc|windows|steam)\b/],
];

// ---------------------------------------------------------------------------
// Atributos
// ---------------------------------------------------------------------------

export interface Atributos {
  /** Título dobrado (sem acento/caixa), depois de normalizar unidades. */
  texto: string;
  /** Parte que descreve o item (antes de "para/compatível com"). */
  cabeca: string;
  /** Parte de compatibilidade (depois de "para"), nunca identifica o item. */
  compat: string;
  marca: string | null;
  /** Todas as marcas fortes citadas na cabeça (a primeira é `marca`). */
  marcas: string[];
  /** Tipo "jogo" deduzido só pela plataforma (sem a palavra jogo/mídia): conflito de tipo com ele é só dúvida. */
  tipoInferido: boolean;
  /** Variante só conta quando o tipo é de produto com linha (console, celular, fone...). */
  tipoComVariante: boolean;
  /** Marca lida é só chip/sistema/franquia (AMD, Google, Pokémon): não separa produto. */
  marcaFraca: boolean;
  tipo: string | null;
  acessorio: boolean;
  /** Códigos de modelo fortes (MPN: 6+ caracteres, letras e dígitos). */
  mpn: string[];
  /** Códigos curtos de modelo (g435, p2s, a2650, x80l). */
  codigos: string[];
  /** CPU/GPU lidos (i5 13420h, ryzen 5600h, rtx 4060). */
  cpuGpu: string[];
  /** Armazenamento em GB (1TB = 1000). */
  armazenamento: number[];
  ram: number[];
  /** Capacidades sem rótulo (GB). */
  capSemRotulo: number[];
  /** Medidas de peso/volume em g/ml (1kg = 1000). */
  medidas: number[];
  /** Polegadas (x10 para aceitar 15,6). */
  polegadas: number[];
  /** '110' | '220' | 'bivolt'. */
  voltagens: string[];
  /** Especificações numéricas por unidade: litros, watts, mAh, Hz, MP, Ah, Wh ("1.400W" = 1400). */
  specs: Record<string, number[]>;
  /** Resolução em K (4k, 8k, 12k, 16k). */
  resolucoes: string[];
  pack: number;
  bundle: boolean;
  /** Itens citados no bundle ("+ ams", "com 2 jogos"). */
  componentes: string[];
  edicoes: string[];
  importado: boolean;
  variantes: string[];
  plataformas: string[];
  /** Sequência numérica do nome (iphone 15, mario kart 8, geração 3). */
  numeros: string[];
  isbn: string | null;
  ean: string | null;
  naoNovo: boolean;
  /** Nome da linha/modelo logo depois da marca ("tune buds", "wave beam"): 2 palavras de nome, sem descritores. */
  linha: string[];
  /** Tokens do núcleo (sem ruído, cor, atributos já lidos nem compatibilidade). */
  nucleo: string[];
  /** Sequência numérica do NOME do item principal (Fogão 4 bocas, Mario Kart 8, Inspiron 15), sem decimais nem componentes de bundle. */
  seq: string[];
}

/** Converte "1,5 TB"/"512gb" em GB (1TB = 1000; 1024 = 1000). */
function paraGb(num: string, un: string): number {
  const n = parseFloat(num.replace(',', '.'));
  let gb = un.startsWith('t') ? n * 1000 : n;
  if (gb === 1024) gb = 1000;
  if (gb === 2048) gb = 2000;
  return Math.round(gb);
}

/** Palavras descritivas que nunca são nome de linha/modelo. */
export const DESCRITORES = new Set([
  'fone', 'fones', 'ouvido', 'ouvidos', 'headset', 'headphone', 'headphones', 'earbuds', 'earphone', 'bluetooth', 'sem', 'fio', 'com', 'fios', 'wireless', 'tws', 'intra', 'auricular', 'auriculares', 'over', 'ear', 'on', 'in',
  'cancelamento', 'ruido', 'ativo', 'anc', 'resistente', 'agua', 'poeira', 'microfone', 'som', 'portatil', 'estereo', 'stereo', 'gamer', 'gaming', 'jogos', 'pc', 'ps4', 'ps5', 'xbox', 'switch',
  'smart', 'tv', 'led', 'uhd', 'fhd', 'qled', 'hdr', 'hdmi', 'usb', 'wifi', 'mouse', 'teclado', 'controle', 'console', 'celular', 'notebook', 'tablet', 'camera', 'acao', 'ultra', 'mini', 'pro', 'max', 'plus', 'lite',
  'de', 'do', 'da', 'para', 'e', 'a', 'o', 'em', 'novo', 'nova', 'original', 'oficial', 'edicao', 'serie', 'series', 'versao', 'modelo', 'linha', 'tipo',
]);

const ROMANOS: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16 };

const SOMENTE_UNIDADE = /^\d+(?:[.,]\d+)?(?:gb|tb|mb|kb|hz|khz|mhz|ghz|w|kw|v|mah|ah|wh|mm|cm|m|pol|p|k|l|ml|kg|g|x|un|pcs|ms|db|rpm|bar|psi|fps|lm|nm|gbps|mbps|btu|btus|a|dpi|cpm|ppm|nits|mp|lumens|bit|bits|pin|pins|canais|cores|week|weeks|anos|ano|meses|volts?|volt|khz|lumen|mms|cms|kmh|rpm|km|hp|cv|kpa|ppm)$/;
const SPEC_IGNORAR = /^(?:usb\d?|hdmi\d?|wifi\d?|wi-?fi|bt\d?|bluetooth|ddr\d?|gddr\d?|lpddr\d?x?|pcie\d?|nvme|type-?c|usb-?c|usb-?a|\d+k|\d+p|\d+hz|\d+gb|\d+tb|\d+mb|\d+w|\d+v|\d+mah|\d+x\d+(?:x\d+)?(?:mm|cm)?|\d+g|4g|5g|3g|3d|2d|ps[2345]|xbox\d*|nsw|ns2|rj45|rgb|argb|led|lcd|oled\d*|uhd|fhd|qhd|hdr\d*|hdr|dolby|atmos|anc|ipx?\d+|ip\d{2}|7\.1|5\.1|2\.1|2k|4k|8k|1080p|720p|1440p|2160p)$/;

/** Marcas conhecidas ordenadas por tamanho (multi-palavra antes). */
export interface LexicoMarcas { lista: string[]; re: RegExp }
/** Marca "fraca": chip, sistema ou franquia; nunca separa produto sozinha. */
export const MARCAS_FRACAS = new Set(['amd', 'intel', 'nvidia', 'google', 'amazon', 'roku', 'android', 'microsoft windows', 'pokemon', 'lego', 'marvel', 'disney', 'nvidia geforce']);
const EXTRA_PROIBIDO = /\b(?:fone|ouvido|mouse|teclado|cadeira|bola|air\s*fryer|fritadeira|caixa|controle|console|filamento|resina|kit|jogo|gamer|capa|cabo)\b/;
export function montarLexicoMarcas(extras: string[] = []): LexicoMarcas {
  const set = new Set<string>();
  const base = new Set(MARCAS_BASE);
  const comuns = new Set([...RUIDO, ...CORES, ...VARIANTES, 'gold', 'life', 'grow', 'atlas', 'poker', 'eos', 'premium', 'tomate', 'mac', 'pro', 'max', 'one', 'star', 'power', 'sport', 'sports', 'home', 'smart', 'plus', 'top', 'ultra', 'mega', 'nova', 'new', 'best', 'prime']);
  for (const m of [...MARCAS_BASE, ...MARCAS_FRACAS, ...extras]) {
    const f = dobrar(m).replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (f.length < 2 || /^(?:marca|outros?|generic\w*|sem marca)$/.test(f)) continue;
    if (!base.has(m) && !MARCAS_FRACAS.has(f)) {
      // fabricante vindo do banco: sem palavra comum, sem tipo de produto, no máximo 3 palavras
      if (comuns.has(f) || EXTRA_PROIBIDO.test(f) || f.split(' ').length > 3 || f.length > 24 || f.length < 3 || TIPOS.some((r) => r.re.test(f)) || /^(?:projetor|monitor|fritadeira|aspirador|bola|tenis|tapete|livro|mochila|bolsa|camisa|camiseta|bermuda|short|meia|bone)$/.test(f)) continue;
    }
    set.add(f);
  }
  const lista = [...set].sort((a, b) => b.length - a.length);
  const esc = lista.map((m) => m.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&').replace(/ /g, '[\\s-]+'));
  return { lista, re: new RegExp(`(?:^|[^a-z0-9])(${esc.join('|')})(?=$|[^a-z0-9])`) };
}
let LEXICO_PADRAO: LexicoMarcas | null = null;

export function extrairAtributos(titulo: string, lexico?: LexicoMarcas): Atributos {
  const lx = lexico ?? (LEXICO_PADRAO ??= montarLexicoMarcas());
  let t = dobrar(titulo);
  // polegadas: 55", 55”, 55'' , 55 pol, 55 polegadas, 15.6 inch
  t = t.replace(/(\d{2,3}(?:[.,]\d)?)\s?(?:"|”|“|″|''|pol\b\.?|polegadas?|inch(?:es)?|in\b)/g, ' $1pol ');
  // 1 tb -> 1tb ; 512 gb -> 512gb
  t = t.replace(/(\d+(?:[.,]\d+)?)\s+(tb|gb|mb|kb|hz|khz|mhz|ghz|kg|ml|mm|cm|mah|w|v)\b/g, '$1$2');
  t = t.replace(/([a-z]\d{1,3})\+(?=$|[^a-z0-9])/g, '$1 plus ');
  t = t.replace(/[*【】\[\]()（）{}<>]/g, ' ');
  t = t.replace(/\s+/g, ' ');

  const iCompat = t.search(COMPAT_RE);
  let cabeca = iCompat > 2 ? t.slice(0, iCompat) : t;
  let compat = iCompat > 2 ? t.slice(iCompat) : '';
  // "Jogo para PS5 God of War": a cabeça sem nome próprio (só "jogo") não separa nada; vale o título inteiro.
  if (compat && cabeca.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !RUIDO.has(w) && !/^(?:jogo|game|midia|fisica|digital|console|controle)$/.test(w)).length < 1) {
    cabeca = t;
    compat = '';
  }

  // O que vem depois de "+", "com" ou "ams" é componente do bundle, não define o item principal (corte só com 4+ palavras antes).
  const principal = ((): string => {
    const re = /\s\+\s|\s(?:com|c\/)\s|\sams\b|\sace\s*\d?\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cabeca))) {
      if (cabeca.slice(0, m.index).split(/\s+/).filter(Boolean).length >= 4) return cabeca.slice(0, m.index);
    }
    return cabeca;
  })();

  // ---- tipo e papel
  let tipo: string | null = null;
  let acessorio = false;
  {
    let melhor = Infinity;
    for (const r of TIPOS) {
      const m = r.re.exec(principal);
      // acessório/peça só vale como cabeça do título (primeiros 40 caracteres): "...com cabo XLR" no fim não faz do item um cabo
      if (m && m.index < melhor && !(r.acessorio && m.index > (r.maxIdx ?? 40))) {
        melhor = m.index;
        tipo = r.tipo;
        acessorio = !!r.acessorio;
      }
    }
  }
  // Título que COMEÇA pelo nome do aparelho ("Nintendo Switch Lite...", "PlayStation 5 Slim...", "Bundle Nintendo Switch 2 + ...") é o console; jogo começa pelo nome do jogo.
  if ((!tipo || tipo === 'jogo') && /^(?:console\s+|novo\s+|kit\s+|bundle\s+|sony\s+|microsoft\s+|nintendo\s+)*(?:nintendo\s+switch(?!\s*(?:sports|online|party|labo|play))|playstation\s*[345]|ps[345]|xbox\s*(?:series|one))\b/.test(principal) && !/\b(?:jogo|midia|game|edition|controle|headset|capa|fisic[oa])\b/.test(principal) && /\b(?:oled|lite|slim|pro|digital|fat|console|bundle|joy[\s-]?con|\d+\s?(?:gb|tb)|series\s*[xs])\b|\bswitch\s*2\b/.test(principal.replace(/^(?:console\s+|novo\s+|kit\s+|bundle\s+)*(?:sony\s+|microsoft\s+|nintendo\s+)*(?:nintendo\s+switch|playstation|ps|xbox)\s*\d?\s*/, ' ')) ) tipo = 'console';
  if (/^(?:console\s+)?bundle\s+(?:sony\s+|microsoft\s+|nintendo\s+)*(?:nintendo\s+switch|playstation\s*[345]|ps[345]|xbox\s*(?:series|one))\b/.test(principal)) tipo = 'console';
  // Console sem a palavra "console" mas com capacidade ("Microsoft Xbox Series S 512 GB SSD"): é o aparelho, não um SSD.
  if ((tipo === 'ssd_hd' || tipo === 'memoria_ram' || tipo === 'cartao_memoria' || !tipo) && /\b(?:xbox\s*series\s*[xs]|xbox\s*one(?:\s*[xs])?|ps[345]\s*(?:slim|pro|fat)|playstation\s*[345](?:\s*(?:slim|pro|fat))?|nintendo\s*switch\s*(?:oled|lite|2)?)\b[^|]{0,30}\d+\s?(?:gb|tb)\b/.test(principal) && !/\b(?:jogo|midia|controle|headset|capa|cartao|expansao|ssd\s+para)\b/.test(principal)) tipo = 'console';

  // ---- identificadores fortes
  const digitos = t.replace(/[^0-9 ]/g, ' ').split(/\s+/);
  let isbn: string | null = null;
  let ean: string | null = null;
  for (const d of digitos) {
    if (/^97[89]\d{10}$/.test(d)) isbn = d;
    else if (/^\d{13}$/.test(d) || /^\d{12}$/.test(d)) ean = d;
  }
  const isbnTxt = /isbn[:\s-]*([0-9-]{10,17})/.exec(t);
  if (!isbn && isbnTxt) {
    const dd = isbnTxt[1].replace(/-/g, '');
    if (/^97[89]\d{10}$/.test(dd)) isbn = dd;
  }

  // ---- capacidades (armazenamento x RAM x sem rótulo)
  const armazenamento: number[] = [];
  const ram: number[] = [];
  const capSemRotulo: number[] = [];
  {
    const re = /(\d+(?:[.,]\d+)?)(tb|gb)\b/g;
    const caps: Array<{ gb: number; ctx: string; i: number }> = [];
    const pos: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) pos.push([m.index, m.index + m[0].length]);
    re.lastIndex = 0;
    let k = 0;
    while ((m = re.exec(t))) {
      const gb = paraGb(m[1], m[2]);
      const ini = k > 0 ? Math.max(pos[k - 1][1], m.index - 14) : Math.max(0, m.index - 14);
      const fim = k + 1 < pos.length ? Math.min(pos[k + 1][0], pos[k][1] + 14) : pos[k][1] + 14;
      caps.push({ gb, ctx: t.slice(ini, m.index) + '|' + t.slice(pos[k][1], fim), i: m.index });
      k++;
    }
    for (const c of caps) {
      const [antes, depois] = c.ctx.split('|');
      if (/\b(?:ram|memoria|ddr\d?|lpddr\d?x?)\b/.test(depois) || /\b(?:ram|memoria|ddr\d?)\s*(?:de\s*)?$/.test(antes)) ram.push(c.gb);
      else if (/\b(?:ssd|hd|nvme|armazenamento|storage|emmc|rom|interna|disco|sd|microsd|cartao|pendrive|pen\s?drive|m\.?2)\b/.test(depois) || /\b(?:ssd|hd|nvme|armazenamento|storage|rom)\s*(?:de\s*)?$/.test(antes)) armazenamento.push(c.gb);
      else capSemRotulo.push(c.gb);
    }
    // Notebook/celular com duas capacidades sem rótulo: a menor é RAM (<=64) e a maior armazenamento.
    if ((tipo === 'notebook' || tipo === 'celular' || tipo === 'tablet') && capSemRotulo.length === 2) {
      const [a, b] = [...capSemRotulo].sort((x, y) => x - y);
      if (a <= 64 && b > a) {
        if (!ram.length) ram.push(a);
        if (!armazenamento.length) armazenamento.push(b);
        capSemRotulo.length = 0;
      }
    }
  }

  // ---- medidas (peso/volume), em g ou ml
  const medidas: number[] = [];
  {
    const re = /(\d+(?:[.,]\d+)?)(kg|g|ml)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const n = parseFloat(m[1].replace(',', '.'));
      const u = m[2];
      medidas.push(Math.round(u === 'kg' ? n * 1000 : n));
    }
  }

  // ---- polegadas
  const polegadas: number[] = [];
  {
    const re = /(\d{2,3}(?:[.,]\d)?)pol\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) polegadas.push(Math.round(parseFloat(m[1].replace(',', '.')) * 10));
    if (!polegadas.length && tipo === 'tv') {
      const mm = /\b(?:tv|televisor|televisao)\D{0,18}?\b(\d{2,3})\b(?!\s*(?:hz|w|v|gb|tb|x|k\b|p\b))/.exec(cabeca);
      if (mm) {
        const n = Number(mm[1]);
        if (n >= 20 && n <= 110) polegadas.push(n * 10);
      }
    }
  }

  // ---- voltagem
  const voltagens: string[] = [];
  {
    if (/\bbi[\s-]?volt\b|\b110\s*\/\s*220\b|\b127\s*\/\s*220\b|\b110v\s*\/\s*220v\b|\b127v\s*\/\s*220v\b/.test(t)) voltagens.push('bivolt');
    else {
      const re = /\b(\d{2,3})\s?(?:v|volts?)\b(?!\s*(?:dc|cc))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        const v = Number(m[1]);
        if ([110, 115, 120, 127].includes(v)) voltagens.push('110');
        else if ([220, 230, 240].includes(v)) voltagens.push('220');
      }
    }
  }

  // ---- specs por unidade
  const specs: Record<string, number[]> = {};
  {
    const re = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s?(litros?|l|w|watts?|mah|hz|mp|ah|wh|hp|cv)\b/g;
    for (const m of t.matchAll(re)) {
      let num = m[1];
      if (/^\d{1,3}(?:\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');
      const v = parseFloat(num.replace(',', '.'));
      const u = m[2].startsWith('l') ? 'l' : m[2].startsWith('w') && m[2] !== 'wh' ? 'w' : m[2];
      if (Number.isFinite(v) && v > 0) (specs[u] ??= []).push(v);
    }
    for (const u of Object.keys(specs)) specs[u] = uniqN(specs[u]);
  }

  // ---- resolução (4k x 8k; 12k x 16k em resina)
  const resolucoes: string[] = [];
  for (const m of t.matchAll(/\b(\d{1,2})k\b/g)) if (Number(m[1]) >= 2) resolucoes.push(m[1] + 'k');

  // ---- pack
  let pack = 1;
  {
    const re = /\b(?:kit|pack|pacote|caixa|conjunto|lote)\s*(?:com|c\/|de)?\s*(\d{1,3})\s*(?:un\w*|pcs|pecas?|pares?|itens?|refis?|rolos?|bolas?|livros?|cartuchos?|filamentos?|resinas?|garrafas?|pacotes?|tubos?)\b|\b(\d{1,3})\s*(?:un\b|unid\w*|unidades|pcs|pecas|pares|rolos)\b|\b(\d{1,2})\s*x\s*(?:\d+(?:g|kg|ml|l)\b)/;
    const m = re.exec(t);
    if (m) {
      const n = Number(m[1] ?? m[2] ?? m[3]);
      if (n >= 2 && n <= 200) pack = n;
    }
  }

  // ---- edição
  const edicoes = new Set<string>();
  for (const m of t.matchAll(EDICOES)) {
    const e = m[0].replace(/\s+/g, '_').replace(/^edicao_/, '').replace(/^limited_edition$/, 'limitada').replace(/^special_edition$/, 'especial');
    edicoes.add(e.replace(/^definitiv[eo]a?$/, 'definitive').replace(/de_colecionador/, 'collector').replace(/collector'?s?|colecionador/, 'collector').replace(/aniversario|anniversary|^\d{2}_anos$/, 'aniversario').replace(/de_colecao/, 'collector'));
  }
  if (tipo !== 'jogo') {
    for (const e of [...edicoes]) if (!['limitada', 'especial', 'collector', 'aniversario', 'deluxe', 'comemorativa', 'de_colecao'].includes(e)) edicoes.delete(e);
  }
  // "Edição Zelda", "Animal Crossing Edition": edição temática/limitada (a palavra após/antes de "edição" que não é padrão)
  if (tipo !== 'livro') {
    const IGN = /^(?:padrao|standard|standart|nacional|brasileira|brasileiro|fisica|fisico|original|oficial|switch|nintendo|playstation|xbox|series|game|games|jogo|midia|base|portugues|brasil|com|para|the|and|por|uma|dos|das|sem|nova|novo|lacrada|lacrado|regular|digital|especial|limitada|limited|special|collectors?|colecionador|deluxe|ultimate|gold|definitiva|definitive|aniversario|anniversary|ps[345]|pro|slim|oled|lite|ed|v\d|de|do|da|em|no|na|um|e|o|a)$/;
    for (const m of t.matchAll(/\bedicao\s+([a-z]{3,})\b/g)) if (!IGN.test(m[1])) edicoes.add('ed_' + m[1]);
    for (const m of t.matchAll(/\b([a-z]{3,})\s+edition\b/g)) if (!IGN.test(m[1])) edicoes.add('ed_' + m[1]);
  }
  const importado = (REGIAO_IMPORT.test(cabeca) || REGIAO_SIGLA.test(titulo)) && !/\bnacional\b/.test(cabeca);

  // ---- plataformas (na cabeça; para acessório vale também a compat)
  const plataformas: string[] = [];
  {
    // "Jogo ... Para PS4/PS5": para jogo, acessório, controle e headset a parte "para X" É a plataforma; em console não.
    const base = cabeca + (tipo === 'console' ? '' : ' ' + compat);
    for (const [p, re] of PLATAFORMAS) if (re.test(base)) plataformas.push(p);
    if (plataformas.includes('switch2') && plataformas.includes('switch')) {
      // "Switch 2" contém "switch": só 'switch' puro se aparece sem o 2
      if (!/\bswitch\b(?!\s*2)/.test(base)) plataformas.splice(plataformas.indexOf('switch'), 1);
    }
  }

  if (tipo === 'controle' && !plataformas.length && !/\b(?:gamer|sem\s+fio|wireless|bluetooth|dualsense|dualshock|joy[\s-]?con|usb|gamepad|joystick|manete)\b/.test(t)) tipo = null;
  let tipoInferido = false;
  if (!tipo && plataformas.length < 3 && (plataformas.some((p) => p !== 'pc') || /\b(?:midia\s+fisica|midia\s+digital)\b/.test(t))) { tipo = 'jogo'; tipoInferido = !/\b(?:midia\s+(?:fisica|digital)|jogo)\b/.test(t); }

  // ---- variantes (palavras que mudam o produto): só nas 9 primeiras palavras do item principal; "4K Ultra HD" não é variante
  const variantes: string[] = [];
  {
    const toks = principal.replace(/\bultra\s*hd\b|\buhd\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 9);
    for (const tk of toks) if (VARIANTES.has(tk) && !VARIANTE_NEUTRA.has(tk)) variantes.push(tk);
    if (tipo === 'console' && /\bdigital\b/.test(principal) && !/\bpro\b/.test(principal)) variantes.push('digital');
    const xs = /\bseries\s*([xs])\b|\bxbox\s*series\s*([xs])\b/.exec(principal);
    if (xs && tipo === 'console') variantes.push('series_' + (xs[1] ?? xs[2]));
  }

  // ---- bundle e componentes: "combo/kit/bundle" explícito OU componentes (itens) depois de "+" / "com" ("Sem AMS" não conta)
  const componentes: string[] = [];
  let bundle = false;
  {
    const ehJogoTitulo = tipo === 'jogo';
    const limpo = cabeca.replace(/\b(?:sem|s\/)\s+\w+/g, ' ');
    if (/\b(?:combo|bundle|pacote\s+com|kit\s+com)\b/.test(limpo)) bundle = true;
    const NORM: Record<string, string> = { controles: 'controle', manete: 'controle', manetes: 'controle', joystick: 'controle', joysticks: 'controle', jogos: 'jogo', games: 'jogo', game: 'jogo', filamentos: 'filamento', resinas: 'resina' };
    const LEX = /\b(controles?|manetes?|joysticks?|jogos?|games?|ams|headset|mouse|teclado|mochila|bomba|dock|filamentos?|resinas?|volante|brinde)\b/g;
    const add = (w: string) => { const n = NORM[w] ?? w; if (!componentes.includes(n)) componentes.push(n); };
    // partes depois de " + " (hardware; em jogo o "+" é parte do nome: "Mario + Rabbids")
    if (!ehJogoTitulo) {
      const partes = limpo.split(/\s\+\s/).slice(1);
      for (const parte of partes) {
        // só a PRIMEIRA palavra do trecho depois do "+" (o resto é descrição)
        const PARADA = /^(?:bluetooth|wireless|wifi|garantia|nota|frete|envio|alta|mais|para|com|sem|fio|usb|rgb|led|hdmi|original|novo|nova|sensor)$/;
        const ws = parte.replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/);
        let w = ws[0] ?? '';
        // "+ Jogo Digital Mario Kart": o componente é o NOME do jogo; "+ JOGO (envio...)": o componente é "jogo"
        if (/^(?:jogos?|games?)$/.test(w)) {
          const nx = ws.slice(1).filter((x) => !/^(?:digital|fisico|novo|nova|original|de|do|da|e|\d+)$/.test(x))[0];
          w = nx && /^[a-z]{3,}$/.test(nx) && !PARADA.test(nx) ? nx : 'jogo';
        }
        if (/^[a-z]{3,}$/.test(w) && !PARADA.test(w)) add(w);
      }
    }
    // "com N controles", "com ams": itens do pacote (somente os da lista; "com fio", "com microfone" são descrição)
    const depoisCom = limpo.split(/\s(?:com|c\/)\s/).slice(1).join(' ');
    if (tipo && ['console', 'impressora3d', 'notebook', 'camera', 'headset', 'celular', 'tablet'].includes(tipo)) for (const m of depoisCom.matchAll(LEX)) add(m[1]);
    if (/\bams\b/.test(limpo.replace(/\bsem\s+ams\b/g, ' '))) add('ams');
    componentes.sort();
    if (componentes.length) bundle = true;
  }

  if (tipo === 'controle' || tipo === 'headset') for (let i = variantes.length - 1; i >= 0; i--) if (['oled', 'lite', 'slim', 'mini'].includes(variantes[i])) variantes.splice(i, 1);

  // ---- códigos
  const mpn: string[] = [];
  const codigos: string[] = [];
  const cpuGpu: string[] = [];
  {
    // CPU/GPU
    const reCpu = /\b(?:i[3579][\s-]?\d{4,5}[a-z]{0,2}|ryzen\s*[3579]\s*\d{4}[a-z]{0,2}|core\s+ultra\s*[579]\s*\d{3}[a-z]?|(?:(?<=macbook\s(?:air\s|pro\s)?)|(?<=ipad\s(?:air\s|pro\s)?)|(?<=apple\s))m[1-4](?:\s*(?:pro|max|ultra))?(?=\s|$)|snapdragon\s*[a-z0-9 ]{2,10}|rtx\s?\d{4}(?:\s?(?:ti|super))?|gtx\s?\d{3,4}(?:\s?ti)?|rx\s?\d{4}(?:\s?(?:xt|xtx))?|arc\s?[ab]\d{3})\b/g;
    for (const m of t.matchAll(reCpu)) cpuGpu.push(m[0].replace(/[\s-]+/g, ''));
    // tokens com letra e dígito
    for (const raw of t.split(/[\s,;:()\[\]{}|]+/)) {
      if (!raw) continue;
      const tok = raw.replace(/^[\-./]+|[\-./]+$/g, '');
      if (!tok || !/[a-z]/.test(tok) || !/\d/.test(tok)) continue;
      if (SOMENTE_UNIDADE.test(tok) || SPEC_IGNORAR.test(tok) || /^\d+pol$/.test(tok) || SOMENTE_UNIDADE.test(tok.replace(/[\-/.]/g, ''))) continue;
      const limpo = tok.replace(/[\-/.]/g, '').replace(/(?<=\d[a-z]?)combo$/, '');
      if (/^cl\d+$/.test(limpo) || /^\d+r?x\d+$/.test(limpo) || /^\d+(?:kg|g|ml)\w*$/.test(limpo) || tok.includes('+')) continue;
      if (/^\d+v\d+v$/.test(limpo) || /^\d+[a-z]+\d+[a-z]+$/.test(limpo) && /(?:khz|hz|mah|gb|tb|mb|bit|mm|cm)/.test(limpo)) continue;
      if ((limpo.length < 3 && !(/^[a-z]\d$/.test(limpo) && tipo !== null && ['impressora3d', 'celular', 'tablet', 'console', 'camera', 'aspirador', 'placa_video', 'notebook', 'monitor', 'headset', 'caixa_som'].includes(tipo))) || limpo.length > 24) continue;
      if (/^(?:p[23]|a[34]|b2b|c1)$/.test(limpo) && tipo !== 'impressora3d') continue;
      if (cpuGpu.some((c) => c === limpo)) continue;
      if (/^(?:i[3579]\d{4,5}[a-z]{0,2}|rtx\d{4}|gtx\d{3,4}|rx\d{4}|\d{2,3}pol)$/.test(limpo)) continue;
      if (/^(?:ps[2-5]|xbox\d*|ns2|nsw|switch\d?)$/.test(limpo)) continue;
      if (/^\d+[a-z]{1,2}$/.test(limpo) && limpo.length <= 4 && /^\d+(?:st|nd|rd|th|a|o|x|k|g|m)$/.test(limpo)) continue;
      const dig = (limpo.match(/\d/g) ?? []).length;
      if (limpo.length >= 6 && dig >= 3) mpn.push(limpo);
      else codigos.push(limpo);
      // "AT-LP60XBT-SV": cada parte com letra e dígito também é um código (a forma colada fica para o MPN)
      if (/[-/]/.test(tok)) {
        for (const parte of tok.split(/[-/]+/)) {
          if (!parte || !/[a-z]/.test(parte) || !/\d/.test(parte) || parte.length < 3) continue;
          if (SOMENTE_UNIDADE.test(parte) || SPEC_IGNORAR.test(parte) || parte === limpo) continue;
          const pd = (parte.match(/\d/g) ?? []).length;
          if (parte.length >= 6 && pd >= 3) mpn.push(parte); else codigos.push(parte);
        }
      }
    }
    // iPhone/Galaxy "s24" etc já entram como código curto; "p2s", "a1", "x1c" idem.
  }

  // ---- sequência numérica (nome)
  const numeros: string[] = [];
  {
    const ger = /\b(\d)\s?(?:a|o)?\s?geracao\b|\bgeracao\s*(\d)\b|\b(\d)(?:st|nd|rd|th)\s+gen\b|\bgen\s*(\d)\b/.exec(t);
    if (ger) numeros.push('g' + (ger[1] ?? ger[2] ?? ger[3] ?? ger[4]));
  }

  // ---- marca
  let marca: string | null = null;
  let marcaFraca = false;
  const todasMarcas: string[] = [];
  {
    // prefere marca forte: varre as ocorrências e escolhe a primeira que não é fraca (chip/sistema/franquia)
    const reG = new RegExp(lx.re.source, 'g');
    const fonte = ' ' + cabeca + ' ';
    let m: RegExpExecArray | null = null;
    let fraca: RegExpExecArray | null = null;
    let cur: RegExpExecArray | null;
    while ((cur = reG.exec(fonte))) {
      reG.lastIndex = cur.index + cur[0].length - 1;
      if (MARCAS_FRACAS.has(cur[1].replace(/[\s-]+/g, ' '))) { fraca ??= cur; continue; }
      m = cur;
      break;
    }
    if (!m && fraca) { m = fraca; marcaFraca = true; }
    // todas as marcas fortes (a lista de masters/ofertas cita a marca do produto e, às vezes, a da peça ou da linha)
    const reT = new RegExp(lx.re.source, 'g');
    let q: RegExpExecArray | null;
    while ((q = reT.exec(fonte))) {
      reT.lastIndex = q.index + q[0].length - 1;
      const nome = q[1].replace(/[\s-]+/g, ' ');
      if (!MARCAS_FRACAS.has(nome) && !todasMarcas.includes(nome)) todasMarcas.push(nome);
    }
    if (!m) {
      if (tipo === 'console' || /\b(?:dualsense|dualshock|joy[\s-]?con|pro\s+controller|xbox\s+wireless|xbox\s+controller)\b/.test(cabeca)) {
        if (plataformas.some((p) => p === 'ps5' || p === 'ps4' || p === 'ps3') || /dualsense|dualshock/.test(cabeca)) marca = 'sony';
        else if (plataformas.some((p) => p.startsWith('xbox')) || /xbox/.test(cabeca)) marca = 'microsoft';
        else if (plataformas.some((p) => p.startsWith('switch')) || /joy[\s-]?con|pro\s+controller/.test(cabeca)) marca = 'nintendo';
      }
    }
    if (m) marca = m[1].replace(/[\s-]+/g, ' ').replace(/^tp link$|^tplink$/, 'tp-link').replace(/^bambu$/, 'bambu lab').replace(/^audio technica$/, 'audio-technica');
  }

  // ---- linha: 2 palavras de nome logo depois da marca
  const linha: string[] = [];
  if (marca) {
    const marcaToks = marca.split(' ');
    const toks = principal.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    let i = toks.findIndex((_, k) => marcaToks.every((mt, d) => toks[k + d] === mt));
    if (i >= 0) {
      for (i += marcaToks.length; i < toks.length && linha.length < 2; i++) {
        const tk = toks[i];
        if (DESCRITORES.has(tk) || RUIDO.has(tk) || CORES.has(tk) || /^\d+$/.test(tk) || SOMENTE_UNIDADE.test(tk)) { if (linha.length) break; continue; }
        if (tk.length < 3) continue;
        linha.push(tk);
      }
    }
  }

  // ---- núcleo: tokens sem ruído, cor, unidades, atributos, e SEM a compatibilidade
  const nucleo: string[] = [];
  {
    const marcaToks = new Set((marca ?? '').split(' '));
    const toks = cabeca.replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s-+\s|\s-+|-+\s/g, ' ').split(/\s+/).filter(Boolean);
    for (const raw of toks) {
      const tk = raw.replace(/^-+|-+$/g, '');
      if (tk.length < 2 && !/^\d$/.test(tk)) continue;
      if (RUIDO.has(tk) || CORES.has(tk)) continue;
      if (SOMENTE_UNIDADE.test(tk) || /^\d+pol$/.test(tk)) continue;
      if (/^(?:110v|127v|220v|bivolt|bi-volt)$/.test(tk)) continue;
      if (marcaToks.has(tk)) continue;
      nucleo.push(tk);
    }
  }

  const seq = uniq(
    principal
      .replace(/\bnintendo\s+switch\s*2\b|\bswitch\s*2\b|\b(?:playstation|ps)\s*[2345]\b|\bxbox\s*series\s*[xs]\b|\bxbox\s*(?:series|one|360)\b|\bseries\s*[xs]\b|\bgen(?:eracao)?\s*\d\b/g, ' ')
      .replace(/\d+\s*%/g, ' ')
      .replace(/\d+[.,]\d+/g, ' ')
      .replace(/\d+\s*x\s*\d+(?:\s*x\s*\d+)?/g, ' ')
      .replace(/\d+\s*(?:nits|canais|hz|khz|w|watts?|mah|gb|tb|v|pol|l|litros?|ml|kg|g|cm|mm|m|mp|dpi|rpm|bar|btus?|pa|%|anos|k|p)\b/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
      .map((w, i, arr) => {
        const r = ROMANOS[w];
        if (r === undefined) return w;
        if (w.length === 1) { const nx = arr[i + 1]; return i === arr.length - 1 || (nx !== undefined && /^\d+$/.test(nx)) ? String(r) : w; }
        return arr.length >= 2 ? String(r) : w;
      })
      .map((w) => (tipo === 'jogo' && /^20[1-3]\d$/.test(w) ? w.slice(2) : w))
      .filter((w) => /^(?:[1-9]\d{0,3}|0)$/.test(w))
      .filter((w) => !(tipo !== 'jogo' && Number(w) >= 1990 && Number(w) <= 2040))
      .filter((w) => !(tipo === 'tv' && polegadas.includes(Number(w) * 10))),
  );
  return {
    texto: t, cabeca, compat, marca, marcas: todasMarcas, marcaFraca, tipoInferido, tipoComVariante: !!tipo && TIPOS_COM_VARIANTE.has(tipo), tipo, acessorio, seq, linha,
    mpn: uniq(mpn), codigos: uniq(codigos), cpuGpu: uniq(cpuGpu),
    armazenamento: uniqN(armazenamento), ram: uniqN(ram), capSemRotulo: uniqN(capSemRotulo), medidas: uniqN(medidas), polegadas: uniqN(polegadas),
    voltagens: uniq(voltagens), specs, resolucoes: uniq(resolucoes), pack, bundle, componentes: uniq(componentes), edicoes: uniq([...edicoes]),
    importado, variantes: uniq(variantes), plataformas: uniq(plataformas), numeros: uniq(numeros),
    isbn, ean, naoNovo: CONDICAO_NAO_NOVA.test(t), nucleo,
  };
}

const uniq = (a: string[]): string[] => [...new Set(a)].sort();
const uniqN = (a: number[]): number[] => [...new Set(a)].sort((x, y) => x - y);
