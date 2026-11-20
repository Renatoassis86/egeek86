// Sem 'server-only': configuração pura (sem banco, sem rede). Só importa TIPOS de config.ts (sem ciclo em tempo de execução).
import type { SegmentConfig } from './config';
import { REQUIRE_BRAND_KEYS } from './config-ampliacao';
import { combineTerms, dedupeTerms } from './seed-utils';

/**
 * VARIEDADE DE TIPOS E MARCAS (dono, 2026-11-20: "Vamos aumentar a variedade de produtos"; R-108).
 * Medido em 24 h (group_messages): Casa mandou 54% de air fryer (97 de 178), Esporte 65 bolas, Livros e Impressão 3D pouco. A causa não era só a ordem:
 * (1) vários tipos que o dono quer (extratora, adega, padeira, vaporizador, balança, climatizador, kimono, natação, cama elástica, jaqueta, badminton,
 * rede/tabela, gimbal, lente, rádio, babá eletrônica, barbeador, hidratante corporal) não tinham segmento de semeadura; (2) Livros tinha UM só segmento
 * de 564 termos (um só orçamento de chamadas para todos os gêneros). Aqui entram segmentos NOVOS, cada um com orçamento próprio, com as MELHORES MARCAS
 * (ou os títulos/autores mais vendidos) abrindo a lista de termos. A taxonomia de envio (tipos-produto.ts) ganha os mesmos tipos, e o rodízio por tipo
 * (pool-diversidade.ts) dá um turno a cada um sem código novo.
 *
 * Só produto NOVO e em linha de marca; usado, retrô, foto com mão, peça/acessório solto e item miúdo seguem barrados pelo porteiro (gate.ts, item-miudo.ts,
 * scope-variedade.ts). Masters nascem pelo mesmo caminho da semeadura (nenhum caminho novo de escrita).
 * Domínio do ML: só `MLB-BOOKS` é conferido ao vivo; os demais ficam `domainUnconfirmed` (busca sem domain_id, regex de varredura) até o 1º dry-run.
 * Ranks 700+ (depois de tudo): nunca semeado vai primeiro dentro da fila, então estes tipos abrem a próxima rodada de cada loja.
 */

const GTIN_P = (extras: string[] = ['ALPHANUMERIC_MODEL']) => ({ strategy: 'gtin_then_attrs' as const, fallbackAttrs: ['BRAND', 'MODEL'], keyExtras: extras });
const EL_VOLT = ['ALPHANUMERIC_MODEL', 'VOLTAGE'];
const FAMILIA = {
  strategy: 'gtin_then_attrs' as const,
  fallbackAttrs: ['BRAND'],
  keyExtras: [] as string[],
  keyIgnoresGtin: true,
  familyKey: { required: ['BRAND', 'MODEL', 'GENDER'], optional: ['LINE', 'VERSION'] },
};
const ISBN = { strategy: 'isbn_only' as const, fallbackAttrs: [] as string[], keyExtras: [] as string[] };

interface Def {
  key: string;
  vertical: SegmentConfig['vertical'];
  label: string;
  rank: number;
  domains: RegExp[];
  excludeDomains?: RegExp[];
  terms: string[];
  profile?: SegmentConfig['profile'];
  /** Domínio exato conferido ao vivo (só livros). */
  searchDomain?: string;
  brand?: boolean;
  refresh?: number;
  note?: string;
}

function seg(d: Def): SegmentConfig {
  const confirmed = !!d.searchDomain;
  if (d.brand !== false && !confirmed) REQUIRE_BRAND_KEYS.add(d.key);
  return {
    key: d.key,
    vertical: d.vertical,
    label: d.label,
    domains: d.domains,
    ...(d.excludeDomains ? { excludeDomains: d.excludeDomains } : {}),
    ...(d.searchDomain ? { searchDomain: d.searchDomain } : {}),
    terms: dedupeTerms(d.terms),
    profile: d.profile ?? GTIN_P(),
    targetRefreshMin: d.refresh ?? (d.vertical === 'esporte' || d.vertical === 'livros' ? 60 : 30),
    seedRank: d.rank,
    ...(confirmed ? {} : { domainUnconfirmed: true }),
    callsPerRun: 60,
    rationale: d.note ?? 'Variedade 2026-11-20 (R-108): tipo sem segmento de semeadura. Domínio a confirmar no 1º dry-run (regex de varredura, busca sem domain_id).',
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CASA (eletrodomésticos): o que o dono listou e ainda não tinha segmento. Marcas fortes abrem cada lista.
// ---------------------------------------------------------------------------------------------------------------------
const CASA_VAR: SegmentConfig[] = [
  seg({
    key: 'extratora-higienizadora', vertical: 'eletrodomesticos', label: 'Extratora e higienizadora de estofados e carpetes', rank: 700, profile: GTIN_P(EL_VOLT),
    domains: [/CARPET_CLEANERS|UPHOLSTERY|EXTRACTORS|STEAM_CLEANERS|CLEANING_MACHINES|^MLB-VACUUM_AND_STEAM_CLEANERS$/],
    terms: [
      ...combineTerms('', ['extratora de sujeira', 'higienizadora de estofados', 'extratora portatil', 'spot cleaner', 'limpadora a vapor'], ['wap', 'karcher', 'electrolux', 'bissell', 'black decker', 'mondial', 'britania', 'philco', 'arno', 'oster', 'ciclone']),
      'wap spot cleaner w3', 'wap spot cleaner w2', 'karcher puzzi 8/1', 'karcher puzzi 10/1', 'bissell crosswave', 'bissell spotclean',
    ],
  }),
  seg({
    key: 'climatizador-portatil', vertical: 'eletrodomesticos', label: 'Climatizador evaporativo e ar-condicionado portátil', rank: 701, profile: GTIN_P(EL_VOLT),
    domains: [/AIR_COOLERS|EVAPORATIVE|PORTABLE_AIR|^MLB-AIR_CONDITIONERS$/],
    terms: combineTerms('', ['climatizador evaporativo', 'climatizador de ar', 'ar condicionado portatil', 'climatizador quente e frio'], ['ventisol', 'electrolux', 'mondial', 'britania', 'springer', 'midea', 'consul', 'philco', 'wap', 'cadence', 'arno', 'elgin', 'gree', 'lorenzetti']),
  }),
  seg({
    key: 'adega-cervejeira', vertical: 'eletrodomesticos', label: 'Adega climatizada, cervejeira e frigobar', rank: 702, profile: GTIN_P(['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY']),
    domains: [/WINE_(COOLERS|CELLARS)|BEER|BEVERAGE_COOLERS|MINI_?BARS?|MINI_REFRIGERATORS|^MLB-FREEZERS$|WINE/],
    terms: combineTerms('', ['adega climatizada', 'adega 12 garrafas', 'adega 24 garrafas', 'cervejeira', 'frigobar', 'expositor de bebidas'], ['dako', 'philco', 'brastemp', 'electrolux', 'consul', 'tramontina', 'cuisinart', 'midea', 'esmaltec', 'cadence', 'panasonic', 'venax', 'britania', 'fricon']),
  }),
  seg({
    key: 'maquina-de-pao', vertical: 'eletrodomesticos', label: 'Máquina de pão (padeira)', rank: 703, profile: GTIN_P(EL_VOLT),
    domains: [/BREAD_(MAKERS|MACHINES)|BAKERS|BREAD/],
    terms: combineTerms('', ['maquina de pao', 'padeira eletrica', 'padeira automatica', 'maquina de fazer pao'], ['britania', 'oster', 'mondial', 'philco', 'cadence', 'black decker', 'tramontina', 'electrolux', 'arno', 'multilaser', 'kenwood']),
  }),
  seg({
    key: 'vaporizador-de-roupas', vertical: 'eletrodomesticos', label: 'Vaporizador de roupas e passadeira a vapor', rank: 704, profile: GTIN_P(EL_VOLT),
    domains: [/GARMENT_STEAMERS|CLOTHES_STEAMERS|STEAMERS|^MLB-IRONS$/],
    terms: combineTerms('', ['vaporizador de roupas', 'passadeira a vapor vertical', 'steamer de roupas', 'vaporizador portatil de roupas'], ['mondial', 'arno', 'britania', 'philips walita', 'black decker', 'cadence', 'oster', 'tefal', 'rowenta', 'philco', 'electrolux', 'xiaomi']),
  }),
  seg({
    key: 'balanca-digital', vertical: 'eletrodomesticos', label: 'Balança digital (corporal, bioimpedância e de cozinha)', rank: 705,
    domains: [/BODY_SCALES|BATHROOM_SCALES|BODY_FAT|KITCHEN_SCALES|DIGITAL_SCALES|^MLB-SCALES$/], excludeDomains: [/PRECISION|LABORATORY|INDUSTRIAL|JEWELRY|TRUCK|LUGGAGE|ANALYTICAL/],
    terms: combineTerms('', ['balanca digital corporal', 'balanca bioimpedancia', 'balanca de banheiro', 'balanca de cozinha digital', 'balanca inteligente bluetooth'], ['xiaomi', 'omron', 'g tech', 'multilaser', 'camry', 'techline', 'mondial', 'electrolux', 'britania', 'tomate', 'accu chek', 'withings', 'tanita']),
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// ESPORTE
// ---------------------------------------------------------------------------------------------------------------------
const ESPORTE_VAR: SegmentConfig[] = [
  seg({
    key: 'kimono-artes-marciais', vertical: 'esporte', label: 'Kimono de jiu-jitsu, judô e karatê', rank: 710, profile: FAMILIA,
    domains: [/KIMONO|MARTIAL_ARTS_(UNIFORMS|CLOTHING|APPAREL)|JUDO|KARATE|JIU_JITSU|BJJ/],
    terms: combineTerms('', ['kimono jiu jitsu', 'kimono judo', 'kimono karate', 'kimono trancado', 'kimono infantil', 'kimono brim'], ['koral', 'keiko', 'shiroi', 'atama', 'torah', 'venum', 'naja', 'mizuno', 'tatami', 'pretorian', 'fuji', 'adidas', 'dragao', 'hayabusa']),
  }),
  seg({
    key: 'natacao-equipamento', vertical: 'esporte', label: 'Natação (nadadeira, snorkel, touca, prancha e palmar)', rank: 711,
    domains: [/SWIM_(FINS|CAPS|PADDLES|KICKBOARDS)|SNORKEL|SWIMMING_(CAPS|FINS|ACCESSORIES|EQUIPMENT)|DIVING_(FINS|MASKS)|FLIPPERS|SWIM/], excludeDomains: [/GOGGLES/],
    terms: combineTerms('', ['nadadeira', 'snorkel', 'touca de natacao', 'prancha de natacao', 'palmar de natacao', 'kit snorkel mascara'], ['speedo', 'arena', 'nike', 'hammerhead', 'mormaii', 'tyr', 'cressi', 'mares', 'seac', 'oxer', 'finis', 'zoggs']),
  }),
  seg({
    key: 'cama-elastica', vertical: 'esporte', label: 'Cama elástica e trampolim', rank: 712,
    domains: [/TRAMPOLINES?|MINI_TRAMPOLINES?|REBOUNDERS?/],
    terms: combineTerms('', ['cama elastica', 'cama elastica 305', 'cama elastica fitness', 'mini cama elastica', 'trampolim infantil'], ['bel fix', 'acte', 'kikos', 'wellness', 'polimet', 'proaction', 'jump', 'mor', 'elite', 'oneal']),
  }),
  seg({
    key: 'jaqueta-esportiva', vertical: 'esporte', label: 'Jaqueta corta-vento e agasalho esportivo', rank: 713, profile: FAMILIA,
    domains: [/SPORTS?_JACKETS|WINDBREAKERS|TRACKSUITS|TRAINING_JACKETS|ATHLETIC_JACKETS|TRACK_JACKETS|RUNNING_JACKETS/], excludeDomains: [/LEATHER|BIKER|MOTORCYCLE|WORK|HUNTING|RAIN_?COATS?/],
    terms: combineTerms('', ['jaqueta corta vento', 'jaqueta esportiva', 'agasalho esportivo', 'jaqueta corrida', 'jaqueta termica esportiva'], ['nike', 'adidas', 'puma', 'under armour', 'mizuno', 'asics', 'olympikus', 'fila', 'umbro', 'penalty', 'lupo', 'oxer']),
  }),
  seg({
    key: 'badminton', vertical: 'esporte', label: 'Badminton (raquete e petecas)', rank: 714,
    domains: [/BADMINTON/],
    terms: combineTerms('', ['raquete de badminton', 'kit badminton', 'peteca badminton', 'raquete badminton profissional'], ['yonex', 'victor', 'li ning', 'wilson', 'head', 'dunlop', 'babolat', 'carlton', 'kawasaki', 'vollo', 'acte']),
  }),
  seg({
    key: 'rede-trave-tabela', vertical: 'esporte', label: 'Rede de vôlei, trave de futebol e tabela de basquete', rank: 715,
    domains: [/VOLLEYBALL_NETS|SPORTS_NETS|SOCCER_GOALS|FOOTBALL_GOALS|BASKETBALL_(HOOPS|BACKBOARDS|GOALS)|HOOPS|GOALS|SPORT_NETS/], excludeDomains: [/FISHING|TENNIS_TABLE|PING|HAIR|MOSQUITO|PET|CAMERA|TOYS/],
    terms: combineTerms('', ['rede de volei', 'tabela de basquete', 'trave de futebol', 'rede de futevolei', 'poste de volei', 'mini trave society', 'aro de basquete'], ['spalding', 'wilson', 'mikasa', 'penalty', 'oxer', 'acte', 'kikos', 'vollo', 'proaction', 'rudel', 'molten']),
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// ELETROELETRÔNICOS
// ---------------------------------------------------------------------------------------------------------------------
const ELETRO_VAR: SegmentConfig[] = [
  seg({
    key: 'gimbal-estabilizador', vertical: 'eletroeletronicos', label: 'Gimbal e estabilizador de celular e câmera', rank: 720,
    domains: [/GIMBAL|STABILIZER|CAMERA_STABILIZ/],
    terms: combineTerms('', ['gimbal celular', 'gimbal camera', 'estabilizador de camera', 'osmo mobile', 'gimbal 3 eixos'], ['dji', 'zhiyun', 'hohem', 'feiyu', 'insta360', 'moza', 'ulanzi', 'fimi', 'benro']),
  }),
  seg({
    key: 'lente-camera', vertical: 'eletroeletronicos', label: 'Lente para câmera fotográfica', rank: 721,
    domains: [/CAMERA_LENSES|PHOTOGRAPHIC_LENS|LENSES_FOR_CAMERA|CAMERA_LENS/], excludeDomains: [/CONTACT|EYEGLASS|GLASSES|PHONE|PROTECTOR|FILTER|SUNGLASS|OPTIC|LASER/],
    terms: combineTerms('', ['lente 50mm', 'lente 18-55mm', 'lente 70-200mm', 'lente grande angular', 'lente teleobjetiva', 'lente 35mm'], ['canon', 'nikon', 'sony', 'sigma', 'tamron', 'fujifilm', 'viltrox', 'yongnuo', 'samyang', 'panasonic']),
  }),
  seg({
    key: 'radio-portatil', vertical: 'eletroeletronicos', label: 'Rádio portátil e rádio-relógio', rank: 722,
    domains: [/RADIOS?$|RADIO_(RECEIVERS|CLOCKS|PLAYERS)|PORTABLE_RADIOS|AM_FM/], excludeDomains: [/CAR_|AUTOMOTIVE|WALKIE|TWO_WAY|CB_|HAM_/],
    terms: combineTerms('', ['radio portatil', 'radio am fm', 'radio relogio', 'radio retro bluetooth', 'radio a pilha'], ['philco', 'lenoxx', 'motobras', 'sony', 'panasonic', 'multilaser', 'mondial', 'britania', 'tecsun', 'elgin', 'sansui']),
  }),
  seg({
    key: 'baba-eletronica', vertical: 'eletroeletronicos', label: 'Babá eletrônica', rank: 723,
    domains: [/BABY_MONITORS|BABY_VIDEO|BABY_CAMERA/],
    terms: combineTerms('', ['baba eletronica', 'baba eletronica com camera', 'baba eletronica wifi', 'monitor de bebe'], ['motorola', 'philips avent', 'multikids', 'safety 1st', 'infanti', 'chicco', 'tapo', 'xiaomi', 'baby', 'yoosee', 'hello baby', 'vtech']),
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// BELEZA
// ---------------------------------------------------------------------------------------------------------------------
const BELEZA_VAR: SegmentConfig[] = [
  seg({
    key: 'barbeador-aparador', vertical: 'beleza', label: 'Barbeador, aparador e depilador elétrico', rank: 730, profile: GTIN_P(EL_VOLT),
    domains: [/SHAVERS|TRIMMERS|RAZORS|HAIR_CLIPPERS|EPILATORS|DEPILATORS|BEARD|GROOMING/],
    terms: combineTerms('', ['barbeador eletrico', 'aparador de barba', 'aparador de pelos', 'depilador eletrico', 'maquina de cortar cabelo', 'trimmer'], ['philips', 'gillette', 'braun', 'wahl', 'panasonic', 'remington', 'babyliss', 'philco', 'mondial', 'britania', 'taiff', 'kemei']),
  }),
  seg({
    key: 'hidratante-corporal', vertical: 'beleza', label: 'Hidratante corporal', rank: 731,
    domains: [/BODY_(LOTION|MOISTURIZER|CREAM|BUTTER|OIL)|BODY_CARE|MOISTURIZING_(LOTION|CREAMS)|LOTIONS/],
    terms: combineTerms('', ['hidratante corporal', 'hidratante corporal pele seca', 'body lotion', 'manteiga corporal', 'oleo corporal'], ['nivea', 'natura', 'dove', 'granado', 'neutrogena', 'cerave', 'eucerin', 'la roche posay', 'lubriderm', 'vasenol', 'palmers', 'o boticario', 'johnsons']),
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// LIVROS: um segmento por gênero (cada um com orçamento próprio de chamadas), todos no domínio MLB-BOOKS (conferido ao vivo), ISBN-13 obrigatório.
// Os termos abrem com os títulos/autores mais vendidos e as editoras fortes; combos de título x editora vêm depois.
// ---------------------------------------------------------------------------------------------------------------------
const L = (d: Omit<Def, 'vertical' | 'domains' | 'profile' | 'searchDomain' | 'brand'>): SegmentConfig =>
  seg({ ...d, vertical: 'livros', domains: [/^MLB-BOOKS$/], searchDomain: 'MLB-BOOKS', profile: ISBN, brand: false, note: 'Variedade 2026-11-20 (R-108): gênero de livro com orçamento próprio. Domínio MLB-BOOKS conferido ao vivo; só ISBN-13.' });

const LIVROS_VAR: SegmentConfig[] = [
  L({
    key: 'livros-manga', label: 'Mangás', rank: 740,
    terms: [
      'manga naruto', 'manga one piece', 'manga jujutsu kaisen', 'manga demon slayer', 'manga chainsaw man', 'manga berserk', 'manga vagabond', 'manga dragon ball', 'manga attack on titan', 'manga my hero academia',
      'manga spy x family', 'manga death note', 'manga fullmetal alchemist', 'manga tokyo ghoul', 'manga bleach', 'manga blue lock', 'manga vinland saga', 'manga kaiju n 8', 'manga oshi no ko', 'manga frieren',
      'manga sakamoto days', 'manga dandadan', 'manga solo leveling', 'manga dr stone', 'manga haikyuu', 'manga hunter x hunter', 'manga fire force', 'manga monster naoki urasawa', 'manga akira', 'manga uzumaki junji ito',
      'manga panini', 'manga jbc', 'manga newpop', 'manga pipoca e nanquim', 'manga box', 'manga edicao especial', 'manga pokemon adventures', 'manga zelda',
    ],
  }),
  L({
    key: 'livros-hq-comics', label: 'HQs, quadrinhos e graphic novels', rank: 741,
    terms: [
      'hq batman panini', 'hq spider man panini', 'hq x men panini', 'hq watchmen', 'hq sandman', 'hq marvel', 'hq dc comics', 'graphic novel darkside', 'hq maus', 'hq saga', 'hq umbrella academy', 'hq turma da monica',
      'hq superman', 'hq lanterna verde', 'hq vingadores', 'hq coringa', 'hq homem aranha', 'hq deadpool', 'hq guerra infinita', 'hq sonic', 'hq mauricio de sousa', 'hq grafic msp', 'hq the walking dead', 'hq hellboy',
      'hq pipoca e nanquim', 'hq devir', 'hq darkside', 'hq comics colecao', 'graphic novel',
    ],
  }),
  L({
    key: 'livros-fantasia-ficcao', label: 'Fantasia e ficção científica', rank: 742,
    terms: [
      'livro harry potter rocco', 'livro senhor dos aneis', 'livro o hobbit', 'livro game of thrones', 'livro a guerra dos tronos', 'livro duna', 'livro fundacao asimov', 'livro the witcher', 'livro percy jackson intrinseca',
      'livro a roda do tempo', 'livro mistborn', 'livro trono de vidro', 'livro fourth wing', 'livro empyrean', 'livro neuromancer', 'livro 1984', 'livro admiravel mundo novo', 'livro cronicas de narnia', 'livro brandon sanderson',
      'livro george r r martin', 'livro o problema dos tres corpos', 'livro fahrenheit 451', 'livro ready player one', 'livro jogos vorazes', 'livro eragon', 'livro a seleção', 'livro o nome do vento', 'livro dragon age',
      'fantasia aleph', 'ficcao cientifica aleph', 'fantasia harpercollins', 'fantasia intrinseca', 'fantasia darkside', 'fantasia galera',
    ],
  }),
  L({
    key: 'livros-policial-suspense', label: 'Policial, suspense e terror', rank: 743,
    terms: [
      'livro agatha christie', 'livro sherlock holmes', 'livro stephen king', 'livro harlan coben', 'livro gillian flynn', 'livro dan brown', 'livro jo nesbo', 'livro a paciente silenciosa', 'livro garota exemplar', 'livro o codigo da vinci',
      'livro it a coisa', 'livro o iluminado', 'livro misery', 'livro h p lovecraft', 'livro edgar allan poe', 'livro dracula', 'livro frankenstein', 'livro stieg larsson', 'livro freida mcfadden', 'livro a empregada',
      'suspense intrinseca', 'suspense harpercollins', 'suspense suma', 'terror darkside', 'thriller psicologico', 'livro crime e misterio',
    ],
  }),
  L({
    key: 'livros-infantojuvenil', label: 'Infantil e juvenil', rank: 744,
    terms: [
      'livro diario de um banana', 'livro o pequeno principe', 'livro turma da monica', 'livro peppa pig', 'livro bluey', 'livro dog man', 'livro a culpa e das estrelas', 'livro wonder', 'livro o menino do pijama listrado',
      'livro guia dos curiosos', 'livro ciranda cultural', 'livro todolivro', 'livro infantil ilustrado', 'livro infantil capa dura', 'livro minecraft', 'livro pokemon infantil', 'livro disney infantil', 'livro percy jackson',
      'livro heartstopper', 'livro a menina que roubava livros', 'livro o diario de anne frank', 'livro harry potter', 'livro monteiro lobato', 'livro ruth rocha', 'livro ziraldo', 'livro companhia das letrinhas', 'livro galera junior',
    ],
  }),
  L({
    key: 'livros-biblia-teologia', label: 'Bíblia, teologia e vida cristã', rank: 745,
    terms: [
      'biblia sagrada nvi', 'biblia de estudo', 'biblia thompson', 'biblia king james', 'biblia da mulher', 'biblia sagrada arc', 'biblia nvt', 'biblia letra grande', 'biblia anotada', 'biblia de estudo genebra',
      'devocional diario', 'livro mere cristianismo', 'livro c s lewis', 'livro teologia sistematica grudem', 'livro o peregrino', 'livro tim keller', 'livro john piper', 'livro charles spurgeon', 'livro a cabana',
      'biblia sociedade biblica do brasil', 'biblia thomas nelson', 'biblia vida nova', 'biblia cpad', 'livro mundo cristao', 'livro editora fiel', 'livro hagnos', 'livro vida nova', 'livro ultimato', 'livro cultura crista',
    ],
  }),
  L({
    key: 'livros-financas-negocios', label: 'Finanças, negócios e desenvolvimento pessoal', rank: 746,
    terms: [
      'livro pai rico pai pobre', 'livro o investidor inteligente', 'livro a psicologia financeira', 'livro habitos atomicos', 'livro rapido e devagar', 'livro mindset', 'livro essencialismo', 'livro a arte da guerra',
      'livro trabalho focado', 'livro o poder do habito', 'livro como fazer amigos e influenciar pessoas', 'livro os segredos da mente milionaria', 'livro o homem mais rico da babilonia', 'livro investimentos', 'livro de zero a um',
      'livro a coragem de ser imperfeito', 'livro inteligencia emocional', 'livro o milagre da manha', 'livro a startup enxuta', 'livro o poder do agora', 'livro pense e enriqueca', 'livro sextante', 'livro best business',
      'livro harpercollins negocios', 'livro alta books negocios', 'livro buzz editora', 'livro citadel', 'livro benvira', 'livro gente editora',
    ],
  }),
  L({
    key: 'livros-classicos', label: 'Clássicos da literatura', rank: 747,
    terms: [
      'livro dom casmurro', 'livro machado de assis', 'livro orgulho e preconceito', 'livro crime e castigo', 'livro os miseraveis', 'livro o morro dos ventos uivantes', 'livro moby dick', 'livro a metamorfose', 'livro grande sertao veredas',
      'livro capitaes da areia', 'livro jorge amado', 'livro clarice lispector', 'livro cem anos de solidao', 'livro o apanhador no campo de centeio', 'livro o grande gatsby', 'livro fernando pessoa', 'livro carlos drummond de andrade',
      'livro guimaraes rosa', 'livro o cortico', 'livro memorias postumas de bras cubas', 'livro jane austen', 'livro dostoievski', 'livro tolstoi', 'livro george orwell', 'livro a revolucao dos bichos', 'livro lima barreto',
      'classico penguin companhia', 'classico zahar', 'classico martin claret', 'classico l pm pocket', 'classico antofagica', 'classico principis', 'classico pandorga',
    ],
  }),
  L({
    key: 'livros-biografia-ciencia', label: 'Biografias, história e ciência popular', rank: 748,
    terms: [
      'livro steve jobs', 'livro elon musk', 'livro ayrton senna', 'livro o diario de anne frank', 'livro becoming michelle obama', 'livro sapiens', 'livro homo deus', 'livro armas germes e aco', 'livro breve historia do tempo',
      'livro cosmos carl sagan', 'livro o gene egoista', 'livro astrofisica para apressados', 'livro 1808', 'livro 1822', 'livro brasil uma historia', 'livro uma breve historia da humanidade', 'livro churchill', 'livro napoleao',
      'livro getulio', 'livro os engenheiros do caos', 'livro biografia', 'livro autobiografia', 'livro memorias', 'livro historia do brasil', 'livro segunda guerra mundial', 'livro historia da arte gombrich',
    ],
  }),
  L({
    key: 'livros-artes-design', label: 'Artes, design, fotografia e música', rank: 749,
    terms: [
      'livro design grafico', 'livro fotografia', 'livro teoria das cores', 'livro desenho anatomia', 'livro como desenhar manga', 'livro storyboard', 'livro arquitetura', 'livro teoria musical', 'livro violao metodo', 'livro piano metodo',
      'livro ux design', 'livro tipografia', 'livro ilustracao', 'livro historia da musica', 'livro cinema roteiro', 'livro tecnicas de pintura', 'livro arte moderna', 'livro quadrinhos como fazer', 'livro the art of',
      'livro taschen', 'livro gustavo gili', 'livro rosari', 'livro senac sp design',
    ],
  }),
];

export const NOVOS_SEGMENTOS_VARIEDADE: SegmentConfig[] = [...CASA_VAR, ...ESPORTE_VAR, ...ELETRO_VAR, ...BELEZA_VAR, ...LIVROS_VAR];

// ---------------------------------------------------------------------------------------------------------------------
// TERMOS EXTRAS de segmentos que JÁ existem (anexados ao fim; mais modelos e marcas por tipo). Marca forte abre cada lista.
// ---------------------------------------------------------------------------------------------------------------------
export const TERMOS_EXTRAS_VARIEDADE: Record<string, string[]> = {
  // Esporte: tênis de corrida por marca de corrida de verdade; garrafa térmica; camping.
  tenis: combineTerms('tenis de corrida', ['', 'masculino', 'feminino', 'amortecimento', 'longa distancia'], ['asics', 'mizuno', 'hoka', 'brooks', 'saucony', 'on running', 'new balance', 'olympikus', 'nike', 'adidas', 'puma', 'salomon']),
  'garrafa-esportiva': combineTerms('garrafa termica', ['', '1 litro', '473ml', 'inox', 'com canudo'], ['stanley', 'thermos', 'hydro flask', 'contigo', 'owala', 'tramontina', 'invicta', 'soprano', 'termolar', 'lifestraw']),
  camping: combineTerms('', ['barraca camping 4 pessoas', 'barraca camping 2 pessoas', 'saco de dormir', 'cadeira de camping', 'colchonete inflavel camping', 'fogareiro camping'], ['nautika', 'mor', 'guepardo', 'coleman', 'azteq', 'ntk', 'echolife', 'bel fix', 'naturehike', 'quechua', 'decathlon']),
  patins: combineTerms('patins', ['inline', 'quad', 'infantil ajustavel', 'ajustavel adulto', 'fitness'], ['oxer', 'traxart', 'bel sports', 'roller derby', 'seba', 'powerslide', 'fila', 'rollerblade', 'bel fix']),
  // Eletrônicos: TV por tamanho, fone, caixa, câmera de segurança e projetor com as marcas mais fortes.
  'smart-tv': combineTerms('smart tv', ['32 polegadas', '43 polegadas', '50 polegadas', '55 polegadas', '65 polegadas', '75 polegadas', '85 polegadas'], ['samsung', 'lg', 'tcl', 'philips', 'aoc', 'philco', 'sony', 'hisense', 'semp', 'xiaomi', 'multilaser']),
  'fone-de-ouvido': combineTerms('fone bluetooth', ['tws', 'in ear', 'over ear', 'com cancelamento de ruido', 'esportivo'], ['jbl', 'samsung galaxy buds', 'apple airpods', 'xiaomi redmi buds', 'motorola', 'sony', 'soundcore anker', 'edifier', 'qcy', 'philips', 'baseus', 'haylou', 'bose']),
  'caixa-de-som': combineTerms('caixa de som', ['bluetooth portatil', 'amplificada', 'party', 'a prova dagua', 'torre'], ['jbl flip', 'jbl charge', 'jbl go', 'jbl partybox', 'sony', 'bose soundlink', 'marshall', 'harman kardon', 'ultimate ears', 'soundcore anker', 'tribit', 'edifier', 'philco', 'lenoxx']),
  'camera-de-seguranca': combineTerms('camera de seguranca', ['wifi', 'ip externa', 'interna 360', 'full hd', 'com visao noturna'], ['intelbras', 'tapo tp link', 'xiaomi', 'imou', 'ezviz', 'hikvision', 'positivo casa inteligente', 'multilaser', 'elsys']),
  projetor: combineTerms('projetor', ['full hd', '4k', 'portatil', 'smart android'], ['epson', 'benq', 'xgimi', 'nebula anker', 'lg cinebeam', 'samsung freestyle', 'philips neopix', 'wanbo', 'magcubic', 'viewsonic']),
};
