// Sem 'server-only': dados puros (sem banco, sem rede). Léxico da descoberta Shopee do departamento ESPORTE (2026-11-11).
//
// Tudo aqui é EDITÁVEL pelo dono/guardião: marcas, linhas de produto por marca, times, termos de busca e pisos de preço.
// O que não está no léxico NÃO vira master (cai em `sem_modelo`): a identidade forte (marca + modelo/linha + gênero) vem do
// TÍTULO da Shopee, que não traz atributo estruturado, então só se aceita linha de produto conhecida. Para ampliar a cobertura,
// rode o dry-run, leia as amostras de `sem_modelo` (títulos reais) e acrescente a linha que falta.
//
// Sintaxe das linhas ("canônica|alias1|alias2"): tudo em minúsculas, sem acento, hífen vira espaço, decimal "3.0" vira "3p0".
//   sufixo "+" na canônica = aceita número de versão logo depois (revolution+ => "revolution 7").
//   linhas sem "+" só casam literalmente (samba, "air force 1").

export interface MarcaDef {
  key: string;
  display: string;
  aliases: string[];
}

export const MARCAS: MarcaDef[] = [
  { key: 'nike', display: 'Nike', aliases: ['nike'] },
  { key: 'adidas', display: 'Adidas', aliases: ['adidas'] },
  { key: 'puma', display: 'Puma', aliases: ['puma'] },
  { key: 'asics', display: 'Asics', aliases: ['asics'] },
  { key: 'olympikus', display: 'Olympikus', aliases: ['olympikus'] },
  { key: 'mizuno', display: 'Mizuno', aliases: ['mizuno'] },
  { key: 'fila', display: 'Fila', aliases: ['fila'] },
  { key: 'under armour', display: 'Under Armour', aliases: ['under armour', 'underarmour'] },
  { key: 'new balance', display: 'New Balance', aliases: ['new balance', 'newbalance'] },
  { key: 'vans', display: 'Vans', aliases: ['vans'] },
  { key: 'converse', display: 'Converse', aliases: ['converse'] },
  { key: 'reebok', display: 'Reebok', aliases: ['reebok'] },
  { key: 'skechers', display: 'Skechers', aliases: ['skechers'] },
  { key: 'hoka', display: 'Hoka', aliases: ['hoka'] },
  { key: 'saucony', display: 'Saucony', aliases: ['saucony'] },
  { key: 'brooks', display: 'Brooks', aliases: ['brooks'] },
  { key: 'umbro', display: 'Umbro', aliases: ['umbro'] },
  { key: 'kappa', display: 'Kappa', aliases: ['kappa'] },
  { key: 'penalty', display: 'Penalty', aliases: ['penalty'] },
  { key: 'topper', display: 'Topper', aliases: ['topper'] },
  { key: 'mormaii', display: 'Mormaii', aliases: ['mormaii'] },
  { key: 'lacoste', display: 'Lacoste', aliases: ['lacoste'] },
  { key: 'diadora', display: 'Diadora', aliases: ['diadora'] },
  { key: 'oakley', display: 'Oakley', aliases: ['oakley'] },
  { key: 'jordan', display: 'Jordan', aliases: ['jordan'] },
  { key: 'lupo', display: 'Lupo', aliases: ['lupo'] },
  { key: 'speedo', display: 'Speedo', aliases: ['speedo'] },
  { key: 'joma', display: 'Joma', aliases: ['joma'] },
  { key: 'new era', display: 'New Era', aliases: ['new era'] },
  { key: 'selene', display: 'Selene', aliases: ['selene'] },
  { key: 'trifil', display: 'Trifil', aliases: ['trifil'] },
];

export type GrupoLinha = 'tenis' | 'roupa' | 'meia' | 'bone' | 'bolsa';

/** Linhas por marca e grupo. "+" = aceita número de versão. Só entra o que é linha de produto real do fabricante. */
export const LINHAS: Record<string, Partial<Record<GrupoLinha, string[]>>> = {
  nike: {
    tenis: [
      'air max+', 'air force 1', 'dunk', 'revolution+', 'downshifter+', 'pegasus+', 'vomero+', 'journey run', 'court vision', 'court borough', 'court legacy', 'cortez',
      'free run+', 'zoom fly+', 'winflo+', 'interact run', 'flex experience+', 'flex runner+', 'metcon+', 'structure+', 'infinity run+', 'invincible+', 'quest+', 'tanjun', 'waffle',
      'blazer', 'air zoom', 'air huarache', 'air monarch', 'air presto', 'vapormax|air vapormax', 'react infinity', 'react miler', 'star runner+', 'omni multi court', 'initiator',
      'defy all day', 'in season tr+', 'pegasus trail+', 'juniper trail+', 'zoomx', 'run swift+|swift run+', 'air rift',
    ],
    roupa: [
      'park+', 'academy+', 'miler', 'legend', 'strike+', 'club', 'club fleece', 'tech fleece', 'sportswear', 'essential', 'challenger', 'flex stride', 'run division',
      'windrunner', 'tempo', 'phenom', 'repel', 'element', 'victory', 'team club', 'sport clash', 'pro', 'fast', 'swift',
    ],
    meia: ['everyday', 'everyday plus', 'everyday cushioned', 'squad', 'elite', 'spark', 'multiplier'],
    bone: ['heritage86|heritage 86', 'club', 'aerobill', 'sportswear'],
    bolsa: ['brasilia+', 'elemental', 'hayward', 'classic', 'heritage', 'sportswear', 'academy team', 'utility', 'rpm'],
  },
  adidas: {
    tenis: [
      'ultraboost+|ultra boost+', 'runfalcon+', 'samba', 'gazelle', 'campus+', 'superstar', 'grand court+', 'duramo+', 'adizero+', 'stan smith', 'forum', 'handball spezial|spezial',
      'response+', 'galaxy+', 'breaknet+', 'courtblock', 'tensaur', 'questar+', 'lite racer+', 'kaptir+', 'retropy', 'hoops+', 'gamecourt', 'terrex', 'swift run+', 'nmd', 'zx',
      'ozweego', 'sl 72', 'vl court+', 'coreracer', 'cloudfoam', 'racer tr+', 'solarboost', 'supernova+', 'adistar+', 'boston+', 'prophere', 'eq21', 'rapidmove', 'x plrphase',
    ],
    roupa: [
      'tiro+', 'entrada+', 'squadra+', 'condivo+', 'tabela+', 'essentials', 'own the run', 'adizero', 'adicolor', 'trefoil', 'train essentials', 'aeroready', 'techfit',
      'designed 4 running', 'designed to move', 'club', 'classic', 'linear', 'parkhood', 'base layer',
    ],
    meia: ['performance', 'cushioned', 'light'],
    bone: ['baseball', 'trefoil', 'running', 'daily'],
    bolsa: ['classic', 'power+', 'linear', 'tiro', 'daily', 'motion', 'versatile'],
  },
  puma: {
    tenis: [
      'suede', 'rs x', 'carina', 'softride+', 'smash+', 'caven', 'court', 'anzarun', 'flyer', 'speedcat', 'palermo', 'rebound', 'st runner', 'disperse xt', 'enzo', 'pacer+',
      'velocity nitro+', 'deviate nitro+', 'electrify nitro+', 'magnify nitro+', 'fast r', 'future rider', 'cali', 'mayze', 'slipstream', 'kosmo rider', 'x ray',
    ],
    roupa: ['teamliga', 'teamrise', 'individualrise', 'essentials|ess', 'favourite', 'run favorite', 'ftblnxt', 'ftblplay', 'rise', 'liga', 'train all day', 'train favorite', 'power', 'squad', 'evostripe', 'classics'],
    meia: [],
    bone: ['essentials', 'metal cat'],
    bolsa: ['phase', 'plus', 'buzz', 'academy', 'campus'],
  },
  asics: {
    tenis: [
      'gel kayano+', 'gel nimbus+', 'gel cumulus+', 'gt 2000+', 'gt 1000+', 'gel pulse+', 'dynablast+', 'gel sonoma+', 'gel excite+', 'gel contend+', 'gel shogun', 'patriot+',
      'jolt+', 'versablast+', 'novablast+', 'gel 1130', 'gel quantum+', 'gel nyc', 'gel kahana+', 'gel venture+', 'gel pursue+', 'gel hypersonic+', 'magic speed+', 'metaspeed',
      'gel resolution+', 'upcourt+', 'gel game+', 'gel rocket+', 'gel lyte', 'gel dedicate+', 'gel 1090',
    ],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  olympikus: {
    tenis: ['corre supra+', 'corre ultraleve', 'corre nitro+', 'corre+', 'ultraleve', 'supra', 'nitro', 'proton+', 'vibe', 'agil', 'sprint', 'cuanto', 'delta', 'ignite'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  mizuno: {
    tenis: [
      'wave prophecy+', 'wave sky+', 'wave rider+', 'cyclone speed+', 'wave creation+', 'wave titan+', 'wave inspire+', 'wave legend+', 'wave dynasty+', 'wave mirai+', 'wave falcon+',
      'wave hayate+', 'wave vitality+', 'wave frontier+', 'wave nexus+', 'space+', 'nirvana+', 'hurricane+', 'jet+', 'atlantis+', 'rebellion', 'neo vista', 'wave stratos', 'wave',
    ],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  'new balance': {
    tenis: [
      '574', '990+', '530', '327', '550', '480', '9060', '2002r', '1080+', '860+', '880+', 'fresh foam+', 'fuelcell+', '237', '997h', '373', '515', '520', '580', 'arishi+', 'hierro+',
      'nitrel+', '1906r', '408', '410', '411', '412',
    ],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  fila: {
    tenis: ['float maxxi', 'float elite', 'float', 'racer+', 'disruptor+', 'venture+', 'hometown', 'acd', 'excelsior', 'kr3', 'recovery', 'finder', 'overpass', 'trend', 'landscape', 'melbourne', 'strada', 'fx 100', 'fx 300'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  'under armour': {
    tenis: ['charged assert+', 'charged+', 'hovr+', 'rogue+', 'surge+', 'assert+', 'pursuit+', 'commit+', 'essential', 'phantom', 'slight', 'speedform', 'tribase', 'project rock+', 'dynamic', 'bandit+', 'infinite', 'sonic', 'turbulence', 'machina'],
    roupa: ['tech', 'heatgear', 'coldgear', 'sportstyle', 'rival', 'launch', 'vanish', 'unstoppable', 'qualifier', 'project rock', 'challenger', 'streaker', 'playmaker', 'woven', 'storm', 'armour fleece', 'rush', 'motion'],
    meia: [],
    bone: ['blitzing+', 'iso chill', 'storm', 'trucker'],
    bolsa: ['hustle+', 'undeniable+', 'loudon', 'scrimmage', 'halftime', 'gameday', 'rival', 'storm'],
  },
  vans: {
    tenis: ['old skool', 'sk8 hi', 'authentic', 'era', 'slip on', 'knu skool', 'ultrarange', 'half cab', 'ward', 'sport low', 'lowland', 'filmore', 'comfycush', 'rowley', 'style 36'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  converse: {
    tenis: ['chuck taylor all star|all star', 'chuck 70', 'one star', 'chuck taylor'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  reebok: {
    tenis: ['club c+', 'classic leather', 'nano+', 'zig kinetica', 'energen', 'lite+', 'rush runner', 'floatride', 'aztrek', 'glide', 'workout plus', 'court advance', 'royal glide'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  skechers: {
    tenis: ['go walk+', 'go run+', 'arch fit+', 'd lites', 'uno', 'summits', 'flex appeal+', 'max cushioning', 'slip ins', 'bobs', 'squad', 'glide step', 'skech air', 'equalizer', 'ultra flex+', 'vapor foam', 'dynamight', 'go train'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  hoka: {
    tenis: ['clifton+', 'bondi+', 'mach+', 'arahi+', 'speedgoat+', 'challenger+', 'rincon+', 'carbon x+', 'transport', 'gaviota+', 'kawana+', 'skyflow', 'solimar', 'rocket x+', 'torrent+', 'anacapa', 'tecton'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  saucony: {
    tenis: ['ride+', 'triumph+', 'guide+', 'endorphin speed+', 'endorphin pro+', 'endorphin shift+', 'kinvara+', 'peregrine+', 'jazz', 'shadow', 'cohesion+', 'hurricane+', 'omni+', 'echelon+', 'axon+', 'grid', 'freedom+'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  brooks: {
    tenis: ['ghost max+', 'ghost+', 'adrenaline gts+', 'glycerin+', 'launch+', 'levitate+', 'cascadia+', 'hyperion+', 'caldera+', 'bedlam+', 'revel+', 'trace+', 'anthem+', 'transcend+', 'catamount', 'beast+', 'divide+'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  lacoste: {
    tenis: ['carnaby', 'court', 'lerond', 'powercourt', 'l001', 'l003', 'chaumont', 'europa', 'graduate'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  diadora: {
    tenis: ['mythos', 'n9000', 'equipe'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
  jordan: {
    tenis: ['air jordan+', 'jordan+'],
    roupa: [],
    meia: [],
    bone: [],
    bolsa: [],
  },
};

/** Times (nome canônico + apelidos), para camisa de time. Canônica é o nome de exibição. */
export const TIMES: Array<{ key: string; display: string; aliases: string[] }> = [
  { key: 'flamengo', display: 'Flamengo', aliases: ['flamengo'] },
  { key: 'corinthians', display: 'Corinthians', aliases: ['corinthians'] },
  { key: 'palmeiras', display: 'Palmeiras', aliases: ['palmeiras'] },
  { key: 'sao paulo', display: 'São Paulo', aliases: ['sao paulo', 'spfc'] },
  { key: 'santos', display: 'Santos', aliases: ['santos'] },
  { key: 'vasco', display: 'Vasco', aliases: ['vasco', 'vasco da gama'] },
  { key: 'gremio', display: 'Grêmio', aliases: ['gremio'] },
  { key: 'internacional', display: 'Internacional', aliases: ['internacional'] },
  { key: 'cruzeiro', display: 'Cruzeiro', aliases: ['cruzeiro'] },
  { key: 'atletico mineiro', display: 'Atlético Mineiro', aliases: ['atletico mineiro', 'atletico mg'] },
  { key: 'botafogo', display: 'Botafogo', aliases: ['botafogo'] },
  { key: 'fluminense', display: 'Fluminense', aliases: ['fluminense'] },
  { key: 'bahia', display: 'Bahia', aliases: ['bahia'] },
  { key: 'fortaleza', display: 'Fortaleza', aliases: ['fortaleza'] },
  { key: 'athletico paranaense', display: 'Athletico Paranaense', aliases: ['athletico paranaense', 'athletico pr'] },
  { key: 'coritiba', display: 'Coritiba', aliases: ['coritiba'] },
  { key: 'selecao brasileira', display: 'Seleção Brasileira', aliases: ['selecao brasileira', 'selecao do brasil', 'cbf'] },
  { key: 'argentina', display: 'Argentina', aliases: ['argentina'] },
  { key: 'portugal', display: 'Portugal', aliases: ['portugal'] },
  { key: 'real madrid', display: 'Real Madrid', aliases: ['real madrid'] },
  { key: 'barcelona', display: 'Barcelona', aliases: ['barcelona'] },
  { key: 'manchester united', display: 'Manchester United', aliases: ['manchester united'] },
  { key: 'manchester city', display: 'Manchester City', aliases: ['manchester city'] },
  { key: 'psg', display: 'PSG', aliases: ['psg', 'paris saint germain'] },
  { key: 'liverpool', display: 'Liverpool', aliases: ['liverpool'] },
  { key: 'arsenal', display: 'Arsenal', aliases: ['arsenal'] },
  { key: 'chelsea', display: 'Chelsea', aliases: ['chelsea'] },
  { key: 'juventus', display: 'Juventus', aliases: ['juventus'] },
  { key: 'bayern de munique', display: 'Bayern de Munique', aliases: ['bayern de munique', 'bayern munique', 'bayern'] },
];

/** Piso de preço por segmento (centavos): abaixo disso o anúncio de marca é isca/falsificado e NÃO vira master nem oferta. Heurística ajustável. */
export const PISO_PRECO_CENTAVOS: Record<string, number> = {
  tenis: 10000,
  'camisa-de-time': 4500,
  'camisa-de-time:time': 12000,
  regata: 3000,
  short: 4000,
  legging: 4500,
  agasalho: 9000,
  'meia-esportiva': 1500,
  bone: 3500,
  'mochila-esportiva': 6000,
  'bolsa-de-treino': 6000,
  'roupa-de-compressao': 4000,
};

/**
 * Categorias da Shopee (productCatId) MEDIDAS para esporte. Vazio de propósito: o id de categoria só entra depois de medido
 * (rota com ?probe=1 mostra o que a API devolve). Enquanto vazio, a descoberta é só por palavra-chave.
 */
export const CATEGORIAS_MEDIDAS: Array<{ catId: string; segmento: string; nota: string }> = [];

// ---------------------------------------------------------------------------------------------------------------------
// Chuteira, chinelo/slide e sandália (pedido do dono, 2026-11-12: "todos os tipos de calçado em Esporte"). Mesmo grupo 'tenis' do léxico
// (a linha identifica o modelo; o segmento — tênis, chuteira ou sandalia-chinelo — vem do substantivo do título). Só linhas de produto
// reais e conhecidas do fabricante; o que não está aqui cai em `sem_modelo` e aparece no dry-run para o guardião ampliar.
// ---------------------------------------------------------------------------------------------------------------------
if (!MARCAS.some((m) => m.key === 'havaianas')) MARCAS.push({ key: 'havaianas', display: 'Havaianas', aliases: ['havaianas'] });

export const LINHAS_CALCADO_EXTRA: Record<string, string[]> = {
  nike: ['mercurial+|mercurial vapor+|mercurial superfly+', 'phantom+|phantom gx+|phantom luna+', 'tiempo+|tiempo legend+', 'zoom vapor+', 'zoom superfly+', 'streetgato', 'lunar gato', 'premier+', 'victori one', 'benassi', 'offcourt+', 'calm slide|calm'],
  adidas: ['predator+', 'x crazyfast+', 'x speedportal+', 'copa pure+|copa+', 'f50+', 'deportivo+', 'goletto+', 'kaiser+', 'adilette+', 'adissage', 'adilette comfort|comfort slide'],
  puma: ['future+', 'ultra+', 'king+', 'leadcat+', 'popcat+', 'cool cat+', 'divecat+'],
  mizuno: ['morelia+', 'rebula+', 'alpha+', 'monarcida+'],
  umbro: ['score', 'velocita+', 'neo+', 'speed+', 'cypher', 'pro 5', 'toccare+', 'class'],
  penalty: ['storm+', 'max 1000', 'digital+', 'matis+', 'rocket+', 'brasil 70', 'lider', 'atf+', 'campo'],
  havaianas: ['top', 'brasil', 'slim', 'tradicional', 'you', 'urban', 'flash', 'hype'],
};
for (const [m, l] of Object.entries(LINHAS_CALCADO_EXTRA)) {
  LINHAS[m] ??= {};
  LINHAS[m].tenis = [...(LINHAS[m].tenis ?? []), ...l];
}
