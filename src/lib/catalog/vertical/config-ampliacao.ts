// Sem 'server-only': configuração pura (sem banco, sem rede). Só importa TIPOS de config.ts (sem ciclo em tempo de execução).
import type { SegmentConfig } from './config';
import { combineTerms, dedupeTerms } from './seed-utils';

/**
 * AMPLIAÇÃO DO CATÁLOGO DAS LOJAS (decisão do dono em 2026-11-11): esporte (tênis, roupas e acessórios), livros (biblioteca completa),
 * casa (eletrodomésticos) e eletrônicos. Aditiva: os segmentos antigos de config.ts ficam como estão; aqui entram segmentos novos e
 * termos extras (anexados ao FIM da lista, para não mexer nos índices de --terms-from das rodadas anteriores).
 *
 * Domínios (`searchDomain`) medidos AO VIVO em 2026-11-11 com /products/search (limit 50): cada um devolveu 50 de 50 resultados no domínio,
 * salvo onde a nota diz o contrário. Roupas do dia a dia (camiseta dry-fit, legging, short, jaqueta) NÃO existem como catálogo de produto
 * no ML (a busca devolve uniformes de torcedor, lembrancinhas e modeladores): só entram os domínios de catálogo listados abaixo.
 */

/** Segmentos que exigem marca real (rejeita ausente/"Genérica"): filtro "kit genérico sem marca". */
export const REQUIRE_BRAND_KEYS = new Set<string>(['air-fryer', 'geladeira', 'maquina-de-lavar', 'smart-tv', 'soundbar', 'fone-de-ouvido', 'caixa-de-som', 'robo-aspirador', 'cafeteira', 'esteira', 'bicicleta-ergometrica', 'bola']);

/** Chave de família (cor e tamanho NÃO separam): marca + modelo (+ linha, versão, gênero). */
const FAMILY = (required: string[], optional: string[]) => ({
  strategy: 'gtin_then_attrs' as const,
  fallbackAttrs: ['BRAND'],
  keyExtras: [] as string[],
  keyIgnoresGtin: true,
  familyKey: { required, optional },
});
const GTIN_P = (extras: string[] = ['ALPHANUMERIC_MODEL']) => ({ strategy: 'gtin_then_attrs' as const, fallbackAttrs: ['BRAND', 'MODEL'], keyExtras: extras });

interface Def {
  key: string;
  vertical: SegmentConfig['vertical'];
  label: string;
  domain: string;
  domains?: RegExp[];
  terms: string[];
  profile: SegmentConfig['profile'];
  rank: number;
  refresh?: number;
  note?: string;
}

function seg(d: Def): SegmentConfig {
  REQUIRE_BRAND_KEYS.add(d.key);
  return {
    key: d.key,
    vertical: d.vertical,
    label: d.label,
    domains: d.domains ?? [new RegExp(`^${d.domain}$`)],
    searchDomain: d.domain,
    terms: dedupeTerms(d.terms),
    profile: d.profile,
    targetRefreshMin: d.refresh ?? (d.vertical === 'esporte' ? 60 : 30),
    seedRank: d.rank,
    rationale: d.note ?? `Ampliação 2026-11-11. Domínio ${d.domain} medido ao vivo (50 de 50 no domínio).`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// ESPORTE
// ---------------------------------------------------------------------------------------------------------------------
const MARCAS_ESPORTE = ['nike', 'adidas', 'puma', 'asics', 'olympikus', 'mizuno', 'fila', 'under armour', 'new balance', 'vans', 'converse', 'reebok', 'skechers', 'hoka', 'saucony', 'brooks', 'umbro', 'kappa', 'penalty', 'topper', 'mormaii', 'lacoste', 'diadora', 'oakley', 'jordan'];

const TENIS_TERMS = [
  // modelos de maior saída por marca (rodada curta pega primeiro)
  'tenis nike air max', 'tenis nike revolution', 'tenis nike downshifter', 'tenis nike pegasus', 'tenis nike air force 1', 'tenis nike dunk', 'tenis nike vomero', 'tenis nike journey run',
  'tenis adidas ultraboost', 'tenis adidas runfalcon', 'tenis adidas samba', 'tenis adidas gazelle', 'tenis adidas campus', 'tenis adidas superstar', 'tenis adidas grand court', 'tenis adidas duramo', 'tenis adidas adizero',
  'tenis puma suede', 'tenis puma rs-x', 'tenis puma carina', 'tenis puma softride', 'tenis puma smash',
  'tenis asics gel kayano', 'tenis asics gel nimbus', 'tenis asics gel cumulus', 'tenis asics gt-2000', 'tenis asics gel pulse', 'tenis asics dynablast',
  'tenis olympikus corre', 'tenis olympikus ultraleve', 'tenis olympikus supra', 'tenis olympikus nitro',
  'tenis mizuno wave', 'tenis mizuno cyclone speed', 'tenis mizuno wave prophecy', 'tenis mizuno wave sky',
  'tenis new balance 574', 'tenis new balance 990', 'tenis new balance fresh foam', 'tenis new balance 530', 'tenis new balance 327',
  'tenis fila float', 'tenis fila racer', 'tenis fila disruptor', 'tenis under armour charged', 'tenis under armour hovr',
  'tenis vans old skool', 'tenis vans sk8-hi', 'tenis converse chuck taylor all star', 'tenis reebok club c', 'tenis skechers go walk', 'tenis hoka clifton', 'tenis saucony ride', 'tenis brooks ghost',
  // uso x marca (intercalado)
  ...combineTerms('tenis', ['corrida', 'caminhada', 'treino academia', 'futsal', 'skate', 'casual esportivo', 'basquete', 'voleibol', 'trail running', 'masculino', 'feminino', 'infantil'], MARCAS_ESPORTE.slice(0, 14)),
  ...combineTerms('tenis', ['masculino', 'feminino', 'corrida'], MARCAS_ESPORTE.slice(14)),
  'tenis de corrida', 'tenis de caminhada confortavel', 'tenis para academia', 'tenis futsal', 'tenis skate', 'tenis casual esportivo', 'tenis plataforma branco', 'tenis chunky',
];

// Chinelo, slide e sandália esportiva (pedido do dono 2026-11-12: todos os tipos de calçado). Domínio MLB-SANDALS_AND_CLOGS medido ao vivo em 12/11 (sonda: 35 de 50 em 'chinelo slide').
const SANDALIA_TERMS = [
  ...combineTerms('chinelo', ['slide', 'masculino', 'feminino', 'infantil'], ['nike', 'adidas', 'puma', 'olympikus', 'fila', 'mizuno', 'umbro', 'kappa', 'under armour', 'new balance', 'reebok', 'rider', 'havaianas']),
  ...combineTerms('sandalia', ['esportiva', 'trilha', 'masculina', 'feminina'], ['nike', 'adidas', 'puma', 'olympikus', 'fila', 'mizuno', 'under armour', 'skechers']),
  'chinelo nike victori one', 'chinelo adidas adilette', 'chinelo adidas adilette comfort', 'chinelo nike benassi', 'chinelo puma leadcat', 'chinelo olympikus slide', 'chinelo havaianas top', 'chinelo havaianas brasil', 'sandalia papete trilha', 'sandalia adidas adilette',
];

const CHUTEIRA_TERMS = [
  ...combineTerms('chuteira', ['campo', 'society', 'futsal', 'infantil', 'trava mista'], ['nike', 'adidas', 'puma', 'umbro', 'mizuno', 'penalty', 'topper', 'kappa', 'under armour', 'diadora', 'joma', 'new balance']),
  'chuteira nike phantom', 'chuteira nike mercurial', 'chuteira nike tiempo', 'chuteira adidas predator', 'chuteira adidas x crazyfast', 'chuteira adidas copa', 'chuteira puma future', 'chuteira puma ultra', 'chuteira puma king',
  'chuteira society', 'chuteira campo', 'tenis society', 'chuteira futsal', 'chuteira profissional',
];

const CAMISA_TERMS = [
  ...combineTerms('camisa', ['oficial', 'torcedor', 'treino', 'goleiro'], ['flamengo', 'corinthians', 'palmeiras', 'sao paulo', 'santos', 'vasco', 'gremio', 'internacional', 'cruzeiro', 'atletico mineiro', 'botafogo', 'fluminense', 'bahia', 'fortaleza', 'selecao brasileira', 'brasil', 'argentina', 'real madrid', 'barcelona', 'manchester united', 'psg']),
  'camisa nike oficial', 'camisa adidas oficial', 'camisa puma oficial', 'camisa umbro oficial', 'camisa new balance oficial', 'camisa topper', 'camisa kappa', 'camisa penalty', 'camisa de time original',
  'camiseta nike dri-fit', 'camiseta adidas treino', 'camiseta under armour', 'camiseta puma treino', 'camiseta mizuno', 'camiseta asics',
];

const MEIA_TERMS = [
  ...combineTerms('meia', ['esportiva', 'cano medio', 'cano longo', 'sapatilha', 'futebol', 'corrida'], MARCAS_ESPORTE.slice(0, 12)),
  'meiao futebol', 'meia nike squad', 'meia nike everyday', 'meia adidas', 'meia puma', 'meia olympikus', 'meia lupo sport', 'meia selene', 'meia trifil',
];

const BONE_TERMS = [
  ...combineTerms('bone', ['aba curva', 'aba reta', 'trucker', 'snapback', 'running', 'dad hat'], ['nike', 'adidas', 'new era', 'puma', 'oakley', 'mizuno', 'asics', 'fila', 'under armour', 'lacoste', 'vans', 'jordan', 'converse', 'reebok']),
  'bone new era 9forty', 'bone new era 39thirty', 'bone nike heritage86', 'bone adidas baseball', 'bone corinthians', 'bone flamengo', 'bone palmeiras', 'bone nba', 'bone mlb',
];

const MOCHILA_TERMS = [
  ...combineTerms('mochila', ['esportiva', 'academia', 'treino', 'notebook', 'unissex'], ['nike', 'adidas', 'puma', 'under armour', 'asics', 'fila', 'mizuno', 'new balance', 'umbro', 'penalty', 'oakley', 'reebok', 'topper']),
  'mochila nike brasilia', 'mochila nike elemental', 'mochila adidas classic', 'mochila puma phase', 'mochila under armour hustle',
];

const BOLSA_TERMS = combineTerms('bolsa', ['de treino', 'academia', 'esportiva', 'mala duffel'], ['nike', 'adidas', 'puma', 'under armour', 'asics', 'fila', 'mizuno', 'umbro', 'penalty']);

// ---------------------------------------------------------------------------------------------------------------------
const ESPORTE: SegmentConfig[] = [
  // Tênis: UM segmento para todos os usos (corrida, caminhada, treino, futsal/society, skate, casual). Chave de família marca+(linha)+modelo+(versão)+gênero:
  // cor e tamanho NÃO separam (cada cor/tamanho é um catálogo do ML, todos entram no mesmo master). Sem GTIN no catálogo de tênis (0/10 medido).
  seg({ key: 'tenis', vertical: 'esporte', label: 'Tênis esportivo e casual', domain: 'MLB-SNEAKERS', terms: TENIS_TERMS, rank: 13, profile: FAMILY(['BRAND', 'MODEL', 'GENDER'], ['LINE', 'VERSION']), note: 'Domínio 50 de 50; marca, modelo e gênero em 50 de 50; GTIN ausente. Catálogos sem vendedor (404) são a regra: 8 de 8 em amostra de 11/11.' }),
  seg({ key: 'sandalia-chinelo', vertical: 'esporte', label: 'Chinelo, slide e sandália esportiva', domain: 'MLB-SANDALS_AND_CLOGS', terms: SANDALIA_TERMS, rank: 78, profile: FAMILY(['BRAND', 'MODEL', 'GENDER'], ['LINE', 'VERSION']), note: 'Dominio medido em 12/11/2026; mistura moda feminina com esportivo: o nicho exige marca esportiva no titulo.' }),
  seg({ key: 'chuteira', vertical: 'esporte', label: 'Chuteira', domain: 'MLB-FOOTBALL_SHOES', terms: CHUTEIRA_TERMS, rank: 29, profile: FAMILY(['BRAND', 'MODEL', 'GENDER'], ['LINE', 'VERSION']) }),
  seg({ key: 'camisa-de-time', vertical: 'esporte', label: 'Camisa de time e esportiva', domain: 'MLB-FOOTBALL_KITS', terms: CAMISA_TERMS, rank: 30, profile: FAMILY(['BRAND', 'MODEL', 'GENDER'], ['LINE', 'VERSION']), note: 'Domínio MLB-FOOTBALL_KITS mistura camisa com lembrancinha (bolsa, caneca, almofada): o nicho exige "camisa/camiseta" no título e barra kit/conjunto/lembrança.' }),
  seg({ key: 'meia-esportiva', vertical: 'esporte', label: 'Meia esportiva', domain: 'MLB-FOOTBALL_SOCKS', terms: MEIA_TERMS, rank: 31, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']) }),
  seg({ key: 'bone', vertical: 'esporte', label: 'Boné', domain: 'MLB-HATS_AND_CAPS', terms: BONE_TERMS, rank: 32, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']) }),
  seg({ key: 'mochila-esportiva', vertical: 'esporte', label: 'Mochila esportiva', domain: 'MLB-BACKPACKS', terms: MOCHILA_TERMS, rank: 33, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']) }),
  seg({ key: 'bolsa-de-treino', vertical: 'esporte', label: 'Bolsa de treino', domain: 'MLB-TRAVEL_AND_TRAINING_BAGS', terms: BOLSA_TERMS, rank: 34, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']) }),
  seg({
    key: 'luva-de-goleiro', vertical: 'esporte', label: 'Luva de goleiro', domain: 'MLB-FOOTBALL_GOALKEEPER_GLOVES', rank: 35, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']),
    terms: [...combineTerms('luva de goleiro', ['', 'infantil', 'profissional', 'futsal'], ['nike', 'adidas', 'puma', 'umbro', 'reusch', 'poker', 'penalty', 'topper', 'kappa', 'rinat', 'sells']), 'luva goleiro nike vapor grip', 'luva goleiro adidas predator'],
  }),
  seg({
    key: 'luva-de-academia', vertical: 'esporte', label: 'Luva de academia', domain: 'MLB-GYM_GLOVES', rank: 36, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']),
    terms: [...combineTerms('luva de academia', ['', 'musculação', 'treino', 'crossfit'], ['nike', 'adidas', 'under armour', 'puma', 'mizuno', 'everlast', 'acte', 'new millen', 'gold sports', 'harbinger'])],
  }),
  seg({
    key: 'caneleira', vertical: 'esporte', label: 'Caneleira', domain: 'MLB-SHIN_GUARDS', rank: 37, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']),
    terms: [...combineTerms('caneleira', ['futebol', 'futsal', 'infantil', 'profissional'], ['nike', 'adidas', 'puma', 'umbro', 'penalty', 'topper', 'kappa', 'mizuno', 'poker', 'under armour'])],
  }),
  seg({
    key: 'bola-de-basquete', vertical: 'esporte', label: 'Bola de basquete', domain: 'MLB-BASKETBALL_BALLS', rank: 38, profile: GTIN_P(),
    terms: [...combineTerms('bola de basquete', ['', 'oficial', 'indoor outdoor', 'nba'], ['spalding', 'wilson', 'nike', 'molten', 'penalty', 'mikasa', 'adidas', 'topper', 'kappa']), 'bola basquete spalding tf-1000', 'bola basquete wilson nba'],
  }),
  seg({
    key: 'bola-de-volei', vertical: 'esporte', label: 'Bola de vôlei', domain: 'MLB-VOLLEYBALL_BALLS', rank: 39, profile: GTIN_P(),
    terms: [...combineTerms('bola de volei', ['', 'quadra', 'praia', 'oficial'], ['mikasa', 'molten', 'penalty', 'wilson', 'topper', 'nike', 'adidas', 'kappa', 'mizuno']), 'bola volei mikasa v200w', 'bola volei molten v5m'],
  }),
  seg({
    key: 'raquete-de-tenis', vertical: 'esporte', label: 'Raquete de tênis e squash', domain: 'MLB-TENNIS_AND_SQUASH_RACKETS', rank: 40, profile: GTIN_P(),
    terms: [...combineTerms('raquete de tenis', ['', 'infantil', 'profissional', 'squash'], ['wilson', 'head', 'babolat', 'prince', 'yonex', 'dunlop', 'tecnifibre', 'artengo', 'dropshot'])],
  }),
  seg({
    key: 'raquete-beach-tennis', vertical: 'esporte', label: 'Raquete de beach tennis', domain: 'MLB-PADDLE_TENNIS_RACKETS', rank: 41, profile: GTIN_P(),
    terms: [...combineTerms('raquete beach tennis', ['', 'carbono', 'fibra de vidro', 'profissional', 'iniciante'], ['drop shot', 'wilson', 'head', 'babolat', 'camewin', 'mormaii', 'oxer', 'quicksand', 'artengo', 'kikos', 'tsunami'])],
  }),
  seg({
    key: 'faixa-elastica', vertical: 'esporte', label: 'Faixa elástica', domain: 'MLB-RESISTANCE_BANDS', rank: 42, profile: GTIN_P(),
    terms: [...combineTerms('faixa elastica', ['', 'exercicio', 'mini band', 'tubing', 'pilates', 'kit niveis'], ['acte', 'kikos', 'liveup', 'proaction', 'mormaii', 'oneal', 'wellness', 'speedo', 'gold sports'])],
  }),
  seg({
    key: 'tornozeleira-de-peso', vertical: 'esporte', label: 'Tornozeleira de peso', domain: 'MLB-ANKLE_AND_WRIST_WEIGHTS', rank: 43, profile: GTIN_P(),
    terms: [...combineTerms('tornozeleira peso', ['', '1kg', '2kg', '5kg', 'ajustavel'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction'])],
  }),
  seg({
    key: 'halter', vertical: 'esporte', label: 'Halter', domain: 'MLB-DUMBBELLS', rank: 44, profile: GTIN_P(),
    terms: [...combineTerms('halter', ['', 'ajustavel', 'emborrachado', 'sextavado', 'par', 'musculacao'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'sepo', 'polimet', 'dream fitness', 'prottector'])],
  }),
  seg({
    key: 'kettlebell', vertical: 'esporte', label: 'Kettlebell', domain: 'MLB-KETTLEBELLS', rank: 45, profile: GTIN_P(),
    terms: [...combineTerms('kettlebell', ['', '4kg', '8kg', '12kg', '16kg', 'emborrachado', 'ferro fundido'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'polimet'])],
  }),
  seg({
    key: 'tapete-de-yoga', vertical: 'esporte', label: 'Tapete de yoga e exercício', domain: 'MLB-EXERCISE_AND_YOGA_MATS', rank: 46, profile: GTIN_P(),
    terms: [...combineTerms('tapete yoga', ['', 'pilates', 'tpe', 'antiderrapante', 'colchonete', 'eva'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'yangfit', 'newplan'])],
  }),
  seg({
    key: 'corda-de-pular', vertical: 'esporte', label: 'Corda de pular', domain: 'MLB-JUMP_ROPES', rank: 47, profile: GTIN_P(),
    terms: [...combineTerms('corda de pular', ['', 'rolamento', 'crossfit', 'speed rope', 'com contador'], ['acte', 'kikos', 'liveup', 'mormaii', 'oneal', 'wellness', 'gold sports', 'proaction', 'rx smart gear', 'everlast'])],
  }),
  seg({
    key: 'garrafa-esportiva', vertical: 'esporte', label: 'Garrafa e squeeze esportivo', domain: 'MLB-SPORT_AND_BAZAAR_BOTTLES', domains: [/^MLB-SPORT_AND_BAZAAR_BOTTLES$/, /^MLB-SHAKER_BOTTLES$/], rank: 48, profile: GTIN_P(),
    terms: [...combineTerms('garrafa', ['squeeze', 'academia 2 litros', 'termica esportiva', 'coqueteleira', 'motivacional'], ['stanley', 'nike', 'adidas', 'puma', 'under armour', 'contigo', 'hydro flask', 'thermos', 'invicta', 'mor', 'tupperware', 'acte', 'mormaii']), 'garrafa stanley quencher', 'garrafa hydro flask', 'garrafa contigo'],
  }),
  seg({
    key: 'eliptico', vertical: 'esporte', label: 'Elíptico', domain: 'MLB-ELLIPTICALS', rank: 49, profile: GTIN_P(['ALPHANUMERIC_MODEL', 'VOLTAGE']),
    terms: [...combineTerms('eliptico', ['', 'transport', 'magnetico', 'residencial'], ['movement', 'kikos', 'acte', 'polimet', 'wellness', 'dream fitness', 'oneal', 'mormaii', 'caloi', 'podiumfit', 'bonafit'])],
  }),
  seg({
    key: 'roupa-de-ciclismo', vertical: 'esporte', label: 'Roupa de ciclismo', domain: 'MLB-CYCLING_SETS', rank: 50, profile: FAMILY(['BRAND', 'MODEL', 'GENDER'], ['LINE', 'VERSION']),
    terms: [...combineTerms('', ['bermuda ciclista', 'camisa ciclismo', 'macacao ciclismo', 'jaqueta ciclismo', 'colete ciclismo', 'luva ciclismo'], ['asw', 'marcio may', 'elite', 'ert', 'sport x', 'refactor', 'pro tour', 'free force', 'mauro ribeiro', 'giro', 'specialized', 'shimano', 'dry fit'])],
  }),
  seg({
    key: 'roupa-de-compressao', vertical: 'esporte', label: 'Roupa e manga de compressão', domain: 'MLB-COMPRESSION_SLEEVES', rank: 51, profile: FAMILY(['BRAND', 'MODEL'], ['LINE', 'VERSION', 'GENDER']),
    terms: [...combineTerms('', ['manga de compressao', 'camisa de compressao', 'calca de compressao', 'bermuda de compressao', 'meia de compressao esportiva'], ['nike', 'adidas', 'under armour', 'puma', 'mizuno', 'asics', 'fila', 'olympikus', 'lupo', 'penalty', 'umbro', 'mormaii', 'kikos', 'acte'])],
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// CASA (eletrodomésticos)
// ---------------------------------------------------------------------------------------------------------------------
const MARCAS_COZINHA = ['electrolux', 'brastemp', 'consul', 'philco', 'mondial', 'britania', 'oster', 'philips walita', 'arno', 'cadence', 'midea', 'samsung', 'lg', 'tramontina', 'atlas', 'dako', 'esmaltec', 'fischer', 'suggar'];
const EL_VOLT = ['ALPHANUMERIC_MODEL', 'VOLTAGE'];

const CASA: SegmentConfig[] = [
  seg({
    key: 'fogao', vertical: 'eletrodomesticos', label: 'Fogão', domain: 'MLB-RANGES', rank: 52, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('fogao', ['4 bocas', '5 bocas', '6 bocas', 'piso', 'embutir', 'inox'], ['atlas', 'consul', 'brastemp', 'electrolux', 'dako', 'esmaltec', 'fischer', 'suggar', 'mueller', 'venax', 'tramontina', 'midea', 'philco', 'clarice'])],
  }),
  seg({
    key: 'cooktop', vertical: 'eletrodomesticos', label: 'Cooktop', domain: 'MLB-COOKTOPS', rank: 53, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('cooktop', ['inducao', 'a gas', '4 bocas', '5 bocas', 'vitroceramico', 'eletrico'], ['brastemp', 'electrolux', 'consul', 'fischer', 'tramontina', 'philco', 'mueller', 'dako', 'atlas', 'midea', 'suggar', 'cadence', 'britania'])],
  }),
  seg({
    key: 'micro-ondas', vertical: 'eletrodomesticos', label: 'Micro-ondas', domain: 'MLB-MICROWAVES', rank: 54, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('micro-ondas', ['20 litros', '25 litros', '30 litros', 'inox', 'grill', 'embutir'], ['electrolux', 'brastemp', 'consul', 'philco', 'panasonic', 'midea', 'samsung', 'lg', 'mondial', 'britania', 'oster', 'tramontina', 'cadence', 'fischer'])],
  }),
  seg({
    key: 'lava-loucas', vertical: 'eletrodomesticos', label: 'Lava-louças', domain: 'MLB-DISHWASHERS', rank: 55, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('lava-loucas', ['8 servicos', '10 servicos', '14 servicos', 'inox', 'embutir', 'compacta'], ['electrolux', 'brastemp', 'consul', 'midea', 'samsung', 'lg', 'philco', 'bosch', 'tramontina', 'colormaq', 'britania', 'suggar'])],
  }),
  seg({
    key: 'aspirador-de-po', vertical: 'eletrodomesticos', label: 'Aspirador de pó', domain: 'MLB-VACUUM_AND_STEAM_CLEANERS', rank: 56, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('aspirador de po', ['vertical', 'sem fio', 'portatil', 'agua e po', 'lava e aspira', 'trenó'], ['electrolux', 'wap', 'mondial', 'philco', 'britania', 'black decker', 'arno', 'karcher', 'philips walita', 'multilaser', 'dyson', 'xiaomi', 'midea', 'oster', 'cadence'])],
  }),
  seg({
    key: 'liquidificador', vertical: 'eletrodomesticos', label: 'Liquidificador', domain: 'MLB-BLENDERS', rank: 57, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('liquidificador', ['', 'alta potencia', '1200w', 'portatil', 'inox', 'turbo'], ['oster', 'philips walita', 'britania', 'mondial', 'arno', 'cadence', 'philco', 'electrolux', 'black decker', 'wap', 'walita', 'fischer', 'ninja', 'blendtec', 'tramontina', 'agratto', 'suggar'])],
  }),
  seg({
    key: 'batedeira', vertical: 'eletrodomesticos', label: 'Batedeira', domain: 'MLB-MIXERS', rank: 58, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('batedeira', ['planetaria', 'de mao', 'stand mixer', 'inox'], ['kitchenaid', 'oster', 'philips walita', 'britania', 'mondial', 'arno', 'cadence', 'philco', 'electrolux', 'black decker', 'fischer', 'tramontina', 'agratto', 'suggar'])],
  }),
  seg({
    key: 'ventilador', vertical: 'eletrodomesticos', label: 'Ventilador e circulador', domain: 'MLB-FANS', rank: 59, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('ventilador', ['de mesa', 'de coluna', 'de teto', 'parede', 'circulador de ar', 'torre'], ['arno', 'mondial', 'britania', 'ventisol', 'philco', 'cadence', 'electrolux', 'wap', 'lenoxx', 'loren sid', 'oster', 'fischer', 'agratto', 'tron'])],
  }),
  seg({
    key: 'ar-condicionado', vertical: 'eletrodomesticos', label: 'Ar-condicionado', domain: 'MLB-AIR_CONDITIONERS', rank: 60, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('ar condicionado split', ['9000 btus', '12000 btus', '18000 btus', '24000 btus', 'inverter', 'portatil'], ['springer midea', 'lg', 'samsung', 'philco', 'gree', 'electrolux', 'consul', 'elgin', 'carrier', 'daikin', 'agratto', 'tcl', 'hisense', 'fujitsu', 'komeco'])],
  }),
  seg({
    key: 'purificador-de-ar', vertical: 'eletrodomesticos', label: 'Purificador de ar', domain: 'MLB-AIR_PURIFIERS', rank: 61, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('purificador de ar', ['', 'hepa', 'ionizador', 'residencial'], ['philips', 'xiaomi', 'electrolux', 'samsung', 'lg', 'britania', 'wap', 'multilaser', 'dyson', 'honeywell', 'ibbl', 'mondial'])],
  }),
  seg({
    key: 'panela-eletrica', vertical: 'eletrodomesticos', label: 'Panela elétrica e arrozeira', domain: 'MLB-ELECTRIC_POTS_SKILLETS_AND_RICE_COOKERS', rank: 62, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('panela eletrica', ['de arroz', 'de pressao', 'multicooker', 'arrozeira', 'grill'], ['mondial', 'britania', 'oster', 'philips walita', 'electrolux', 'cadence', 'philco', 'black decker', 'arno', 'tramontina', 'fischer', 'agratto', 'panelux', 'cuisinart'])],
  }),
  seg({
    key: 'ferro-de-passar', vertical: 'eletrodomesticos', label: 'Ferro de passar', domain: 'MLB-IRONS', rank: 63, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('ferro de passar', ['a vapor', 'seco', 'vertical', 'ceramica', 'portatil', 'caldeira'], ['philips walita', 'black decker', 'arno', 'mondial', 'britania', 'oster', 'electrolux', 'cadence', 'philco', 'tefal', 'wap', 'lenoxx', 'fischer'])],
  }),
  seg({
    key: 'secadora-de-roupas', vertical: 'eletrodomesticos', label: 'Secadora de roupas', domain: 'MLB-DRYER_MACHINES', rank: 64, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('secadora de roupas', ['', '10kg', '11kg', '12kg', 'lava e seca', 'a gas'], ['brastemp', 'electrolux', 'consul', 'samsung', 'lg', 'midea', 'philco', 'colormaq', 'mueller', 'esmaltec'])],
  }),
  seg({
    key: 'freezer', vertical: 'eletrodomesticos', label: 'Freezer e frigobar', domain: 'MLB-FREEZERS', rank: 65, profile: GTIN_P(['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY']),
    terms: [...combineTerms('freezer', ['horizontal', 'vertical', 'dupla acao', 'adega', 'frigobar', 'conservador'], ['consul', 'brastemp', 'electrolux', 'midea', 'esmaltec', 'metalfrio', 'philco', 'gelopar', 'fricon', 'colormaq', 'venax', 'cônsul', 'panasonic'])],
  }),
  seg({
    key: 'forno-eletrico', vertical: 'eletrodomesticos', label: 'Forno elétrico', domain: 'MLB-OVENS', rank: 66, profile: GTIN_P(EL_VOLT),
    terms: [...combineTerms('forno', ['eletrico 44 litros', 'eletrico 30 litros', 'de embutir', 'a gas', 'eletrico bancada'], ['mondial', 'britania', 'oster', 'philco', 'electrolux', 'brastemp', 'consul', 'cadence', 'fischer', 'tramontina', 'black decker', 'suggar', 'layr', 'fogatti', 'nardelli'])],
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// ELETRÔNICOS
// ---------------------------------------------------------------------------------------------------------------------
const ELETRO_EL: SegmentConfig[] = [
  seg({
    key: 'camera-digital', vertical: 'eletroeletronicos', label: 'Câmera digital', domain: 'MLB-DIGITAL_CAMERAS', rank: 67, profile: GTIN_P(),
    terms: [...combineTerms('camera', ['digital', 'mirrorless', 'dslr', 'compacta', 'instantanea'], ['canon', 'nikon', 'sony', 'fujifilm', 'panasonic', 'olympus', 'kodak', 'leica', 'ricoh', 'gopro', 'insta360', 'dji'])],
  }),
  seg({
    key: 'camera-de-acao', vertical: 'eletroeletronicos', label: 'Câmera de ação', domain: 'MLB-VIDEO_CAMERAS', rank: 68, profile: GTIN_P(),
    terms: [...combineTerms('camera de acao', ['', '4k', '5k', '360', 'filmadora'], ['gopro hero', 'dji osmo', 'insta360', 'sjcam', 'akaso', 'xiaomi', 'sony', 'canon', 'panasonic', 'garmin'])],
  }),
  seg({
    key: 'camera-de-seguranca', vertical: 'eletroeletronicos', label: 'Câmera de segurança', domain: 'MLB-SURVEILLANCE_CAMERAS', rank: 69, profile: GTIN_P(),
    terms: [...combineTerms('camera de seguranca', ['wifi', 'externa', 'ip', 'dome', 'com audio', 'bateria solar'], ['intelbras', 'tapo tp-link', 'ezviz', 'hikvision', 'elgin', 'positivo casa inteligente', 'xiaomi', 'multilaser', 'imou', 'jfl', 'giga', 'dahua', 'yi', 'wyze', 'reolink'])],
  }),
  seg({
    key: 'projetor', vertical: 'eletroeletronicos', label: 'Projetor', domain: 'MLB-PROJECTORS', rank: 70, profile: GTIN_P(),
    terms: [...combineTerms('projetor', ['full hd', '4k', 'portatil', 'smart', 'led', 'mini'], ['epson', 'benq', 'xiaomi', 'samsung', 'lg', 'viewsonic', 'optoma', 'acer', 'philips', 'multilaser', 'elgin', 'xgimi', 'anker nebula', 'hisense'])],
  }),
  seg({
    key: 'tablet', vertical: 'eletroeletronicos', label: 'Tablet', domain: 'MLB-TABLETS', rank: 71, profile: GTIN_P(),
    terms: [...combineTerms('tablet', ['', '10 polegadas', '128gb', '64gb', 'wifi', '5g'], ['samsung galaxy tab', 'apple ipad', 'xiaomi redmi pad', 'lenovo tab', 'multilaser', 'positivo', 'philco', 'motorola', 'tcl', 'realme', 'huawei matepad', 'oppo', 'amazon fire', 'dl', 'oneplus', 'honor'])],
  }),
  seg({
    key: 'e-reader', vertical: 'eletroeletronicos', label: 'E-reader', domain: 'MLB-E_READERS', rank: 72, profile: GTIN_P(),
    terms: [...combineTerms('e-reader', ['', '16gb', '8gb', 'paperwhite', 'colorido'], ['kindle', 'kobo', 'onyx boox', 'pocketbook', 'tolino', 'amazon', 'positivo', 'daymaker', 'meebook', 'hisense']), 'kindle paperwhite', 'kindle 11a geracao', 'kindle scribe', 'kobo clara', 'kobo libra'],
  }),
  seg({
    key: 'smartwatch', vertical: 'eletroeletronicos', label: 'Smartwatch e smartband', domain: 'MLB-SMARTWATCHES', rank: 73, profile: GTIN_P(),
    terms: [...combineTerms('smartwatch', ['', 'gps', 'amoled', 'esportivo', 'feminino', 'infantil'], ['apple watch', 'samsung galaxy watch', 'xiaomi', 'amazfit', 'garmin', 'huawei', 'haylou', 'mi band', 'polar', 'suunto', 'fitbit', 'oppo', 'realme', 'motorola', 'multilaser', 'ticwatch', 'colmi', 'imilab', 'qcy', 'tcl']), 'xiaomi smart band', 'garmin forerunner', 'garmin venu', 'apple watch se', 'apple watch series 10', 'galaxy watch 7', 'galaxy fit'],
  }),
  seg({
    key: 'carregador', vertical: 'eletroeletronicos', label: 'Carregador de celular', domain: 'MLB-MOBILE_DEVICE_CHARGERS', rank: 74, profile: GTIN_P(),
    terms: [...combineTerms('carregador', ['usb c 20w', 'turbo 65w', 'gan', 'sem fio', 'veicular', 'iphone', 'samsung 25w'], ['apple', 'samsung', 'xiaomi', 'anker', 'baseus', 'ugreen', 'motorola', 'multilaser', 'geonav', 'philips', 'hrebos', 'kingston', 'aukey', 'belkin'])],
  }),
  seg({
    key: 'power-bank', vertical: 'eletroeletronicos', label: 'Power bank', domain: 'MLB-MOBILE_DEVICE_CHARGERS', rank: 75, profile: GTIN_P(),
    terms: [...combineTerms('power bank', ['10000mah', '20000mah', '30000mah', 'magsafe', 'carga rapida', 'slim'], ['anker', 'xiaomi', 'baseus', 'ugreen', 'samsung', 'apple', 'jbl', 'multilaser', 'geonav', 'philips', 'aukey', 'belkin', 'kingston', 'ravpower'])],
  }),
  seg({
    key: 'cabo-e-adaptador', vertical: 'eletroeletronicos', label: 'Cabo e adaptador', domain: 'MLB-AUDIO_AND_VIDEO_CABLES_AND_ADAPTERS', domains: [/_CABLES_AND_ADAPTERS$/], rank: 76, profile: GTIN_P(),
    terms: [...combineTerms('', ['cabo hdmi 2.1', 'cabo usb c', 'cabo lightning', 'cabo displayport', 'adaptador hdmi', 'cabo de rede cat6', 'adaptador usb c'], ['apple', 'samsung', 'anker', 'baseus', 'ugreen', 'belkin', 'multilaser', 'intelbras', 'elg', 'xiaomi', 'philips', 'amazon basics', 'cirilo', 'vention'])],
  }),
  seg({
    key: 'hub-usb', vertical: 'eletroeletronicos', label: 'Hub USB e dock', domain: 'MLB-USB_HUBS', rank: 77, profile: GTIN_P(),
    terms: [...combineTerms('hub usb', ['', 'c 7 em 1', '3.0', 'dock station', 'hdmi'], ['anker', 'baseus', 'ugreen', 'belkin', 'multilaser', 'elg', 'satechi', 'hyperx', 'sandisk', 'vention', 'lenovo', 'dell', 'hp', 'orico', 'tp-link'])],
  }),
];

export const NOVOS_SEGMENTOS: SegmentConfig[] = [...ESPORTE, ...CASA, ...ELETRO_EL];

// ---------------------------------------------------------------------------------------------------------------------
// TERMOS EXTRAS DE SEGMENTOS EXISTENTES (anexados ao fim)
// ---------------------------------------------------------------------------------------------------------------------
const EDITORAS = [
  'companhia das letras', 'intrinseca', 'rocco', 'record', 'planeta', 'harpercollins', 'sextante', 'globo livros', 'arqueiro', 'darkside', 'panini', 'jbc', 'pipoca e nanquim', 'companhia das letrinhas', 'moderna', 'ftd', 'saraiva', 'atica', 'scipione', 'editora do brasil',
  'vozes', 'paulus', 'thomas nelson', 'mundo cristao', 'novatec', 'casa do codigo', 'alta books', 'bookman', 'ltc', 'atlas', 'saraiva juridica', 'revista dos tribunais', 'juspodivm', 'gen forense', 'contexto', 'zahar', 'martins fontes', 'wmf martins fontes',
  'l&pm', 'penguin', 'principis', 'pandorga', 'ciranda cultural', 'todolivro', 'melhoramentos', 'escala', 'leya', 'galera record', 'verus', 'seguinte', 'fundamento', 'aleph', 'suma', 'alfaguara', 'bertrand brasil', 'edipro', 'gente', 'buzz', 'citadel', 'planeta estrategia',
  'benvira', 'elsevier', 'pearson', 'autentica', 'cultrix', 'pensamento', 'todavia', 'fosforo', 'editora 34', 'ubu', 'elefante', 'nova fronteira', 'best seller', 'bestbolso', 'harlequin', 'astral cultural', 'faro editorial', 'vergara riba', 'gutenberg', 'jambo', 'newpop', 'conrad', 'devir', 'mythos', 'editora abril', 'ediouro', 'agir', 'loyola', 'ave maria', 'canção nova', 'cpad', 'sinodal', 'ideias e letras', 'cia das letras',
];

const GENEROS_LIVROS = [
  // ficção
  'romance', 'romance contemporaneo', 'romance historico', 'romance policial', 'thriller', 'suspense psicologico', 'misterio', 'terror', 'horror', 'ficcao cientifica', 'distopia', 'fantasia', 'fantasia epica', 'realismo magico', 'conto', 'cronicas', 'poesia', 'teatro', 'classicos da literatura', 'literatura brasileira', 'literatura portuguesa', 'literatura estrangeira', 'romance lgbt', 'romance de epoca', 'new adult', 'chick lit', 'literatura erotica',
  // não ficção
  'autoajuda', 'desenvolvimento pessoal', 'inteligencia emocional', 'produtividade', 'habitos', 'estoicismo', 'mindfulness', 'meditacao', 'espiritualidade', 'psicologia', 'psicanalise', 'filosofia', 'sociologia', 'antropologia', 'politica', 'economia', 'financas pessoais', 'investimentos', 'educacao financeira', 'empreendedorismo', 'negocios', 'lideranca', 'gestao', 'marketing', 'vendas', 'carreira', 'comunicacao', 'oratoria', 'negociacao', 'administracao', 'contabilidade', 'recursos humanos',
  // biografia e história
  'biografia', 'autobiografia', 'memorias', 'historia do brasil', 'historia mundial', 'segunda guerra mundial', 'historia antiga', 'historia militar', 'historia da arte', 'arqueologia', 'geopolitica',
  // ciência e tecnologia
  'ciencia', 'divulgacao cientifica', 'fisica', 'quimica', 'biologia', 'matematica', 'astronomia', 'neurociencia', 'medicina', 'enfermagem', 'nutricao', 'odontologia', 'veterinaria', 'engenharia', 'arquitetura', 'programacao', 'ciencia de dados', 'cibersegurança', 'redes de computadores', 'excel', 'power bi', 'inteligencia artificial', 'python', 'javascript', 'java', 'c++', 'sql', 'devops', 'cloud', 'ux design', 'design grafico',
  // infantil e jovem
  'infantil', 'livro infantil ilustrado', 'livro para bebes', 'alfabetizacao', 'contos de fadas', 'fabulas', 'jovem adulto', 'young adult', 'juvenil', 'livro de colorir', 'atividades infantis', 'livro sonoro', 'pop up',
  // HQ, mangá, quadrinhos
  'manga', 'manga shonen', 'manga seinen', 'manga shoujo', 'light novel', 'hq', 'quadrinhos', 'graphic novel', 'comics', 'hq marvel', 'hq dc', 'turma da monica', 'asterix', 'tintim', 'maus', 'watchmen', 'sandman', 'one piece', 'naruto', 'dragon ball', 'attack on titan', 'chainsaw man', 'jujutsu kaisen', 'berserk', 'death note', 'vagabond', 'fullmetal alchemist', 'demon slayer', 'spy x family', 'my hero academia', 'bleach',
  // didáticos e concursos
  'didatico', 'ensino fundamental', 'ensino medio', 'vestibular', 'enem', 'concursos publicos', 'oab', 'direito constitucional', 'direito penal', 'direito civil', 'direito do trabalho', 'direito tributario', 'portugues', 'redacao', 'gramatica', 'ingles', 'espanhol', 'idiomas', 'dicionario', 'atlas', 'matematica ensino medio', 'fisica ensino medio', 'quimica ensino medio', 'historia ensino medio',
  // religião
  'biblia', 'biblia de estudo', 'catolico', 'evangelico', 'espirita', 'umbanda', 'budismo', 'islamismo', 'judaismo', 'esoterismo', 'astrologia', 'tarot', 'teologia', 'devocional',
  // saúde, culinária, lazer
  'saude', 'emagrecimento', 'dieta', 'yoga', 'receitas', 'culinaria', 'confeitaria', 'panificacao', 'vinhos', 'cafe', 'churrasco', 'vegetariano', 'maternidade', 'gestacao', 'educacao dos filhos', 'pets', 'jardinagem', 'artesanato', 'croche', 'costura', 'decoracao', 'viagem', 'guia de viagem',
  // artes e cultura
  'artes', 'fotografia', 'cinema', 'musica', 'teoria musical', 'violao', 'piano', 'desenho', 'pintura', 'moda', 'historia em quadrinhos', 'livro de arte', 'design', 'televisao', 'teatro', 'danca',
  // esportes e jogos
  'futebol', 'esportes', 'corrida', 'xadrez', 'poker', 'jogos de tabuleiro', 'rpg', 'rpg de mesa', 'd&d', 'tormenta', 'ordem paranormal', 'call of cthulhu', 'warhammer', 'magic the gathering', 'pokemon', 'minecraft', 'zelda', 'mario', 'fortnite', 'league of legends', 'the witcher',
  // box e coleções
  'box de livros', 'colecao completa', 'edicao de luxo', 'edicao especial', 'capa dura', 'livro de bolso', 'edicao de colecionador', 'best seller', 'mais vendidos', 'lancamentos', 'premio nobel', 'booker prize', 'pulitzer',
];

const AUTORES = [
  'machado de assis', 'clarice lispector', 'carlos drummond de andrade', 'jorge amado', 'guimaraes rosa', 'graciliano ramos', 'monteiro lobato', 'cecilia meireles', 'paulo coelho', 'luis fernando verissimo', 'rubem alves', 'ariano suassuna', 'lygia fagundes telles', 'conceicao evaristo', 'itamar vieira junior', 'djamila ribeiro', 'eliane brum', 'ruy castro', 'laurentino gomes', 'leandro karnal', 'mario sergio cortella', 'augusto cury', 'padre fabio de melo', 'thalita rebouças', 'colleen hoover', 'stephen king', 'agatha christie', 'george orwell', 'j.k. rowling', 'j.r.r. tolkien', 'george r.r. martin', 'brandon sanderson', 'neil gaiman', 'isaac asimov', 'frank herbert', 'philip k. dick', 'ray bradbury', 'aldous huxley', 'franz kafka', 'dostoievski', 'tolstoi', 'jane austen', 'charles dickens', 'edgar allan poe', 'h.p. lovecraft', 'julio verne', 'arthur conan doyle', 'sun tzu', 'maquiavel', 'nietzsche', 'platao', 'aristoteles', 'marco aurelio', 'seneca', 'epicteto', 'yuval noah harari', 'jordan peterson', 'robert kiyosaki', 'napoleon hill', 'dale carnegie', 'stephen covey', 'james clear', 'carol dweck', 'daniel kahneman', 'cal newport', 'simon sinek', 'ray dalio', 'warren buffett', 'benjamin graham', 'morgan housel', 'gustavo cerbasi', 'nathalia arcuri', 'thiago nigro', 'bruno perini', 'martha medeiros', 'jojo moyes', 'sarah j. maas', 'rick riordan', 'suzanne collins', 'veronica roth', 'john green', 'rainbow rowell', 'ali hazelwood', 'freida mcfadden', 'lucinda riley', 'ken follett', 'dan brown', 'jo nesbo', 'stieg larsson', 'gillian flynn', 'patricia highsmith', 'haruki murakami', 'eiichiro oda', 'masashi kishimoto', 'akira toriyama', 'junji ito', 'osamu tezuka', 'alan moore', 'frank miller', 'mauricio de sousa', 'ziraldo', 'maria clara machado', 'ruth rocha', 'ana maria machado', 'eva furnari', 'roald dahl', 'antoine de saint-exupery', 'lewis carroll', 'c.s. lewis',
];

export const TERMOS_EXTRAS: Record<string, string[]> = {
  livros: [
    ...GENEROS_LIVROS.map((g) => (g.startsWith('livro') ? g : `livro ${g}`)),
    ...EDITORAS.map((e) => `livro editora ${e}`),
    ...AUTORES.map((a) => `livro ${a}`),
    ...combineTerms('livro', ['romance', 'infantil', 'didatico', 'autoajuda'], ['intrinseca', 'rocco', 'companhia das letras', 'sextante', 'record', 'harpercollins', 'ftd', 'moderna', 'ciranda cultural', 'todolivro']),
  ],
  // Tecnologia e eletrônicos existentes: mais marcas/modelos
  'smart-tv': [...combineTerms('smart tv', ['4k', 'qled', 'oled', 'mini led', '85', '58', '40', '24'], ['samsung', 'lg', 'tcl', 'philips', 'aoc', 'sony', 'philco', 'hisense', 'multilaser', 'britania', 'semp', 'toshiba', 'panasonic', 'xiaomi', 'roku', 'google tv'])],
  soundbar: [...combineTerms('soundbar', ['3.1.2', '7.1', 'bluetooth', 'subwoofer'], ['samsung', 'jbl', 'lg', 'sony', 'philips', 'tcl', 'bose', 'yamaha', 'multilaser', 'mondial', 'harman kardon', 'xiaomi', 'edifier', 'polk', 'sonos', 'denon', 'hisense', 'jbl bar'])],
  'caixa-de-som': [...combineTerms('caixa de som', ['bluetooth jbl flip', 'jbl charge', 'jbl go', 'jbl xtreme', 'partybox', 'amplificada', 'gamer', 'pc', 'inteligente alexa', 'google nest'], ['jbl', 'sony', 'bose', 'edifier', 'anker', 'philips', 'lenovo', 'xiaomi', 'marshall', 'harman kardon', 'ultimate ears', 'amazon echo', 'multilaser', 'mondial', 'lenoxx', 'britania', 'tronsmart', 'divoom', 'pulse', 'altec lansing'])],
  'fone-de-ouvido': [...combineTerms('fone de ouvido', ['in ear', 'bluetooth esportivo', 'com fio p2', 'usb c', 'neckband', 'airpods pro'], ['jbl', 'sony', 'apple', 'samsung', 'xiaomi', 'anker soundcore', 'bose', 'edifier', 'philips', 'qcy', 'lenovo', 'motorola', 'multilaser', 'haylou', 'baseus', 'beats', 'sennheiser', 'jabra', 'oppo', 'huawei', 'skullcandy', 'logitech', 'tws', 'poco'])],
  'robo-aspirador': [...combineTerms('robo aspirador', ['pet', 'lavagem', 'lidar', 'base automatica'], ['xiaomi', 'roborock', 'multilaser', 'electrolux', 'philco', 'wap', 'positivo', 'samsung', 'dreame', 'ecovacs', 'mondial', 'irobot roomba', 'tp-link', 'eufy', 'britania', 'lg', 'ilife'])],
  cafeteira: [...combineTerms('cafeteira', ['dolce gusto', 'nespresso', 'italiana', 'prensa francesa', 'super automatica', 'filtro', 'inox'], ['nespresso', 'dolce gusto', 'oster', 'philips walita', 'britania', 'mondial', 'electrolux', 'delonghi', 'cadence', 'tres coracoes', 'arno', 'black decker', 'philco', 'tramontina', 'cuisinart', 'breville', 'saeco', 'lavazza', 'krups'])],
  'air-fryer': [...combineTerms('air fryer', ['3,5l', '6l', '7l', '10l', '15l forno', 'sem oleo', 'inox'], ['mondial', 'philips walita', 'britania', 'electrolux', 'oster', 'cadence', 'arno', 'wap', 'fischer', 'agratto', 'black decker', 'philco', 'midea', 'tramontina', 'lenoxx', 'suggar', 'ninja', 'cosori', 'tefal', 'multilaser', 'samsung', 'lg'])],
  geladeira: [...combineTerms('geladeira', ['270 litros', '350 litros', '400 litros', '500 litros', 'french door', 'duplex inox', 'frost free branca', 'uma porta', 'frigobar'], ['brastemp', 'consul', 'samsung', 'lg', 'electrolux', 'panasonic', 'philco', 'midea', 'esmaltec', 'colormaq', 'britania', 'continental', 'gelopar', 'fischer', 'smeg', 'bosch', 'whirlpool', 'tcl', 'hisense'])],
  'maquina-de-lavar': [...combineTerms('maquina de lavar', ['8kg', '10kg', '13kg', '17kg', 'lavadora de roupas', 'tanquinho', 'semiautomatica', 'top load', 'front load'], ['brastemp', 'electrolux', 'consul', 'samsung', 'lg', 'philco', 'midea', 'colormaq', 'mueller', 'esmaltec', 'suggar', 'panasonic', 'whirlpool', 'wanke', 'britania', 'tcl', 'mabe'])],
  esteira: [...combineTerms('esteira', ['eletrica 2.5hp', 'eletrica 3hp', 'dobravel', 'profissional', 'mecanica', 'caminhada', 'ergometrica residencial'], ['movement', 'kikos', 'athletic', 'polimet', 'wellness', 'dream fitness', 'mormaii', 'oneal', 'caloi', 'philco', 'nautilus', 'techfit', 'acte', 'ventisol', 'life fitness', 'proaction', 'gallant'])],
  'bicicleta-ergometrica': [...combineTerms('bicicleta ergometrica', ['spinning profissional', 'horizontal magnetica', 'vertical', 'dobravel', 'residencial', 'bike indoor'], ['movement', 'kikos', 'acte', 'polimet', 'wellness', 'dream fitness', 'oneal', 'mormaii', 'caloi', 'techfit', 'proaction', 'athletic', 'life fitness', 'gallant', 'ventisol'])],
  bola: [...combineTerms('bola', ['de futebol campo', 'de futsal', 'de futebol society', 'de futebol oficial', 'de futebol de areia', 'de futebol infantil', 'de futebol profissional'], ['nike', 'adidas', 'penalty', 'puma', 'umbro', 'topper', 'kappa', 'mikasa', 'molten', 'dualt', 'oficial brasileirao', 'champions league', 'copa do mundo', 'selecao brasileira', 'umbro neo', 'mitre', 'select', 'joma'])],
  'placa-de-video': [],
};

/** searchDomain a acrescentar em segmentos existentes que ainda não tinham (domínio conferido ao vivo no dry-run de 2026-11-11). */
export const SEARCH_DOMAIN_EXTRAS: Record<string, string> = {};
