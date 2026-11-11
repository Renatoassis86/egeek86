// Sem 'server-only': configuração pura (sem banco, sem rede), importável por coletor, scripts tsx e testes.
import type { Vertical } from '@/lib/catalog/verticais';
import { combineTerms, dedupeTerms } from './seed-utils';

/**
 * CONFIGURAÇÃO POR DEPARTAMENTO (vertical) E SEGMENTO. ADR 0008 itens 4 e 5; ata 2026-11-08, Fase 2.
 * Base empírica: docs/medicao-cobertura-verticais-2026-11-08.md (medição real, 58 chamadas ao ML).
 *
 * - `domains`: domain_id do catálogo do ML aceitos. A busca por termo traz lixo (medição: "ssd" trouxe notebook, "bola"
 *   trouxe balão e mochila), então o domínio do CATÁLOGO decide, nunca o termo buscado.
 * - `terms`: whitelist de termos de busca (marca/linha). Todos PROVISÓRIOS até o dono/guardião curar (ver `TERMS_STATUS`).
 * - `profile`: como se forma a chave de identidade forte (ver identity.ts).
 * - `seedRank`: ordem de semeadura (1 = primeiro), conforme a medição: melhor sinal primeiro, pior por último.
 *
 * Os valores de domínio vêm de REGEX derivadas dos domain_id observados na medição; só `MLB-BOOKS` foi conferido
 * ao vivo neste trabalho (dry-run de livros). Os demais precisam ser conferidos no primeiro dry-run de cada segmento.
 */

export type NonGamesVertical = Exclude<Vertical, 'games'>;

/** Estratégia de identidade do segmento (ver identity.ts). */
export type IdentityStrategy =
  /** Livro: só ISBN-13 (GTIN com prefixo 978/979 e dígito verificador válido). Sem ISBN => revisão. */
  | 'isbn_only'
  /** GTIN válido primeiro; depois MPN+marca; depois marca+modelo(+extras) com atributos obrigatórios; senão revisão. */
  | 'gtin_then_attrs'
  /** Sem identificador confiável na API (tênis): nunca gera chave forte, sempre revisão humana. */
  | 'review_only';

export interface SegmentConfig {
  key: string;
  vertical: NonGamesVertical;
  label: string;
  /** domain_id aceitos (já normalizados pelo ML, ex.: "MLB-GRAPHICS_CARDS"). */
  domains: RegExp[];
  /** domain_id que NUNCA entram, mesmo que casem `domains` (ex.: impressora 3D dentro de impressora). */
  excludeDomains?: RegExp[];
  /** domain_id EXATO para filtrar a própria busca (`&domain_id=`): só onde foi medido ao vivo; ausente => busca sem filtro. */
  searchDomain?: string;
  /** Whitelist de termos de busca em /products/search (provisória). Ordem = prioridade. */
  terms: string[];
  profile: {
    strategy: IdentityStrategy;
    /** Atributos OBRIGATÓRIOS da chave de fallback (sem GTIN/MPN). Ausente algum => revisão. */
    fallbackAttrs: string[];
    /** Atributos que, SE presentes, entram na chave (separam variantes: voltagem, capacidade...). Nunca juntam. */
    keyExtras: string[];
  };
  /** Frequência-alvo de recoleta em minutos (ata: TV/notebook 5-10 na BF, eletro 15-30, livros/esporte 60). */
  targetRefreshMin: number;
  /** Ordem de semeadura (1 = primeiro). */
  seedRank: number;
  /** Nota da medição que justifica a ordem. */
  rationale: string;
}

/** Estado de curadoria da whitelist de termos: 'provisorio' = proposta do engenheiro, NÃO aprovada pelo dono. */
export const TERMS_STATUS: 'provisorio' | 'aprovado' = 'provisorio';

/** Teto de recoleta imposto pelos termos do ML (5.3: conteúdo exibido atualizado ao menos a cada 6 h para anúncios). */
export const MAX_REFRESH_MIN = 360;

const BRAND_MODEL = ['BRAND', 'MODEL'];
const GTIN_PROFILE = (extras: string[] = ['ALPHANUMERIC_MODEL']) => ({ strategy: 'gtin_then_attrs' as const, fallbackAttrs: [...BRAND_MODEL], keyExtras: extras });

/**
 * AMPLIAÇÃO DA SEMEADURA (2026-11-10, ata cobertura dos nichos 6.3; dono autorizou até 480 chamadas/dia).
 * Medido em 10/11 com 28 chamadas de LEITURA: /products/search aceita `limit` até 50 e o filtro `domain_id` (livros: 50 de 50
 * no domínio, contra 7 de 10 sem filtro). Os domínios abaixo vieram dos histogramas dessa medição ou dos masters já criados
 * (atributo vertical.domainId); segmento sem `searchDomain` busca sem filtro e o domínio é conferido depois (como antes).
 * Termos: ordem = prioridade (a rodada curta pega os melhores); a lista é PROVISÓRIA até o dono curar (TERMS_STATUS).
 */
const LIVROS_TERMS = dedupeTerms([
  // RPG de mesa
  'livro rpg', 'rpg dungeons and dragons', 'rpg tormenta', 'rpg old dragon', 'rpg call of cthulhu', 'rpg vampiro a mascara', 'rpg pathfinder', 'livro de regras rpg', 'rpg 3det', 'rpg ordem paranormal',
  // programação e tecnologia
  'livro programação python', 'livro javascript', 'livro clean code', 'livro algoritmos', 'livro engenharia de software', 'livro inteligência artificial', 'livro banco de dados sql',
  'livro estruturas de dados', 'livro machine learning', 'livro desenvolvimento de jogos', 'livro game design', 'livro unity', 'livro java', 'livro c#', 'livro linux',
  // ficção científica
  'ficção científica', 'livro duna', 'livro fundação asimov', 'livro neuromancer', 'livro guia do mochileiro das galáxias', 'livro 1984', 'livro fahrenheit 451', 'livro cyberpunk', 'livro distopia', 'livro o problema dos três corpos',
  // fantasia
  'fantasia', 'livro senhor dos anéis', 'livro o hobbit', 'livro game of thrones', 'livro witcher', 'livro harry potter', 'livro brandon sanderson', 'livro mistborn', 'livro tolkien', 'livro fantasia épica',
  // mangá e HQ de games
  'mangá', 'mangá pokémon', 'mangá zelda', 'mangá dragon ball', 'mangá one piece', 'mangá naruto', 'mangá berserk', 'mangá demon slayer', 'mangá jujutsu kaisen', 'hq sonic', 'hq batman', 'hq marvel', 'graphic novel',
  // arte de jogos e guias oficiais
  'the art of', 'livro arte de jogos', 'art book video game', 'livro arte the legend of zelda', 'livro dark souls', 'livro elden ring', 'livro the last of us', 'livro minecraft', 'livro pokémon', 'guia oficial pokémon', 'livro história dos videogames', 'livro mario', 'livro cultura gamer',
  // gêneros amplos (rendimento menor; por último)
  'romance', 'infantil', 'autoajuda', 'história', 'negócios', 'receitas',
]);

export const SEGMENTS: SegmentConfig[] = [
  {
    key: 'livros',
    vertical: 'livros',
    label: 'Livros',
    domains: [/^MLB-BOOKS$/],
    searchDomain: 'MLB-BOOKS',
    terms: LIVROS_TERMS,
    profile: { strategy: 'isbn_only', fallbackAttrs: [], keyExtras: [] },
    targetRefreshMin: 60,
    seedRank: 1,
    rationale: 'GTIN (ISBN) em 10/10 dos resultados; catálogo com 16 vendedores. Recorte: livros de interesse gamer/geek (RPG, programação, ficção científica, mangá/HQ de games, arte, guias); sempre ISBN-13 brasileiro.',
  },
  {
    key: 'placa-de-video',
    vertical: 'tecnologia',
    label: 'Placa de vídeo',
    domains: [/GRAPHICS_CARDS/],
    searchDomain: 'MLB-GRAPHICS_CARDS',
    terms: dedupeTerms([
      'placa de video rtx 4060', 'placa de video rtx 5060', 'placa de video rx 7600',
      ...combineTerms('placa de video', ['rtx 4060', 'rtx 5060', 'rtx 5070', 'rx 7600', 'rtx 4070', 'rx 9060 xt'], ['asus', 'gigabyte', 'msi', 'galax', 'zotac', 'pny', 'xfx', 'sapphire']),
      'placa de video gddr6', 'placa de video 8gb', 'placa de video 16gb', 'placa de video rtx 3060', 'placa de video arc intel',
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: ['BRAND', 'SERIES', 'MODEL', 'EDITION', 'MEMORY_SIZE'], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 2,
    rationale: 'Domínio 10/10, GTIN 10/10; só 6 ofertas no catálogo medido.',
  },
  {
    key: 'impressora',
    vertical: 'tecnologia',
    label: 'Impressora',
    domains: [/PRINTERS$/],
    searchDomain: 'MLB-PRINTERS',
    excludeDomains: [/3D_PRINTERS/],
    terms: dedupeTerms([
      'impressora multifuncional ecotank', 'impressora multifuncional smart tank', 'impressora laser brother',
      ...combineTerms('impressora', ['multifuncional wifi', 'laser monocromática', 'térmica etiquetas'], ['epson', 'hp', 'canon', 'brother', 'samsung', 'elgin']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VERSION', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 3,
    rationale: 'Domínio 10/10, GTIN 8/10; catálogo medido com 5 ofertas e original_price em 4.',
  },
  {
    key: 'soundbar',
    vertical: 'eletroeletronicos',
    label: 'Soundbar',
    domains: [/HOME_THEATERS|SOUNDBAR/],
    searchDomain: 'MLB-HOME_THEATERS',
    terms: dedupeTerms([
      'soundbar samsung', 'soundbar jbl',
      ...combineTerms('soundbar', ['', 'dolby atmos', 'subwoofer sem fio', '2.1', '5.1'], ['lg', 'sony', 'philips', 'tcl', 'bose', 'yamaha', 'multilaser', 'mondial', 'harman kardon']),
      'barra de som tv', 'home theater 5.1',
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 4,
    rationale: 'GTIN 8/10, 3 ofertas; atenção ao 206 (paging.total 4, 3 itens).',
  },
  {
    key: 'air-fryer',
    vertical: 'eletrodomesticos',
    label: 'Air fryer',
    domains: [/AIR_FRYERS/],
    searchDomain: 'MLB-AIR_FRYERS',
    terms: dedupeTerms([
      'air fryer mondial', 'air fryer philips walita',
      ...combineTerms('air fryer', ['', '4l', '5l', '12l forno', 'digital', 'dupla'], ['britânia', 'electrolux', 'oster', 'cadence', 'arno', 'wap', 'fischer', 'gourmet', 'agratto', 'black decker']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY'] },
    targetRefreshMin: 30,
    seedRank: 5,
    rationale: 'Domínio 8/10, GTIN 7/10, 2 ofertas (média frágil com poucos vendedores).',
  },
  {
    key: 'bola',
    vertical: 'esporte',
    label: 'Bola de futebol',
    domains: [/FOOTBALL_BALLS/],
    searchDomain: 'MLB-FOOTBALL_BALLS',
    terms: dedupeTerms(['bola de futebol campo nike', ...combineTerms('bola de futebol', ['campo', 'society', 'futsal'], ['nike', 'adidas', 'penalty', 'puma', 'umbro', 'topper', 'kappa', 'mikasa'])]),
    // COLOR fora da chave: regra do dono "cor junta" (exceto tênis). Cor segue como atributo do master, não como identidade.
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 60,
    seedRank: 6,
    rationale: 'Domínio 8/10 (balão e mochila na busca), GTIN 10/10, 4 ofertas; 10 de 10 catálogos medidos sem vendedor (404) com o termo único da Nike.',
  },
  {
    key: 'notebook',
    vertical: 'tecnologia',
    label: 'Notebook',
    domains: [/NOTEBOOKS$/],
    searchDomain: 'MLB-NOTEBOOKS',
    terms: dedupeTerms([
      'notebook acer aspire 5', 'notebook lenovo ideapad', 'notebook dell inspiron',
      ...combineTerms('notebook', ['gamer rtx', 'gamer i5', 'ryzen 5', 'i7 16gb', 'ssd 512gb'], ['acer nitro', 'lenovo loq', 'asus tuf', 'dell g15', 'samsung galaxy book', 'avell', 'msi', 'gigabyte', 'hp victus', 'asus vivobook']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 7,
    rationale: 'GTIN 7/10, mas 2 de 2 catálogos medidos sem vendedor (404).',
  },
  {
    key: 'ssd',
    vertical: 'tecnologia',
    label: 'SSD',
    domains: [/HARD_DRIVES_AND_SSDS/],
    searchDomain: 'MLB-HARD_DRIVES_AND_SSDS',
    terms: dedupeTerms([
      'ssd nvme 1tb kingston', 'ssd 1tb wd',
      ...combineTerms('ssd', ['nvme 1tb', 'nvme 2tb', 'nvme 500gb', 'sata 480gb', 'm.2 gen4'], ['kingston', 'wd black', 'crucial', 'samsung 990', 'adata xpg', 'lexar', 'gigabyte', 'corsair', 'seagate firecuda', 'pny', 'kingspec', 'hikvision']),
      'ssd externo portátil', 'hd externo 1tb', 'hd interno 2tb',
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL, 'CAPACITY'], keyExtras: [] },
    targetRefreshMin: 30,
    seedRank: 8,
    rationale: 'GTIN 9/10; com o filtro de domínio 50 de 50 resultados no domínio (medido 10/11), mas 3 de 6 catálogos testados deram 404.',
  },
  {
    key: 'smart-tv',
    vertical: 'eletroeletronicos',
    label: 'Smart TV',
    domains: [/TELEVISIONS/],
    searchDomain: 'MLB-TELEVISIONS',
    terms: dedupeTerms([
      'smart tv 55 samsung', 'smart tv 50 lg',
      ...combineTerms('smart tv', ['43', '50', '55', '65', '75', '32'], ['samsung', 'lg', 'tcl', 'philips', 'aoc', 'sony', 'philco', 'hisense', 'multilaser', 'britânia']),
      'tv oled', 'tv qled 4k', 'tv mini led',
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 9,
    rationale: 'Domínio 10/10, GTIN 8/10, mas 2 de 2 catálogos medidos sem vendedor.',
  },
  {
    key: 'geladeira',
    vertical: 'eletrodomesticos',
    label: 'Geladeira',
    domains: [/REFRIGERATORS/],
    terms: dedupeTerms(['geladeira frost free electrolux', ...combineTerms('geladeira', ['frost free', 'inverse', 'side by side', 'duplex'], ['brastemp', 'consul', 'samsung', 'lg', 'electrolux', 'panasonic', 'philco', 'midea'])]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY'] },
    targetRefreshMin: 30,
    seedRank: 10,
    rationale: 'Domínio 10/10, GTIN 10/10, mas 2 de 2 catálogos sem vendedor; voltagem separa variantes.',
  },
  {
    key: 'maquina-de-lavar',
    vertical: 'eletrodomesticos',
    label: 'Máquina de lavar',
    domains: [/^MLB-WASHING_MACHINES/],
    terms: dedupeTerms(['maquina de lavar 12kg brastemp', ...combineTerms('lavadora de roupas', ['11kg', '12kg', '15kg', 'lava e seca'], ['brastemp', 'electrolux', 'consul', 'samsung', 'lg', 'philco', 'midea'])]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE', 'TOTAL_CAPACITY'] },
    targetRefreshMin: 30,
    seedRank: 11,
    rationale: 'Pior sinal de eletro: catálogos mini/brinquedo sem MODEL, 2 de 2 sem vendedor.',
  },
  {
    key: 'impressora-3d',
    vertical: 'tecnologia',
    label: 'Impressora 3D',
    domains: [/3D_PRINTERS$/],
    searchDomain: 'MLB-3D_PRINTERS',
    terms: dedupeTerms(['impressora 3d creality ender', 'impressora 3d bambu lab', ...combineTerms('impressora 3d', ['fdm', 'resina'], ['creality', 'bambu lab', 'anycubic', 'elegoo', 'flashforge', 'voxelab'])]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VERSION'] },
    targetRefreshMin: 60,
    seedRank: 12,
    rationale: 'Domínio misturado com filamento (3 de 10); catálogo medido com 1 vendedor.',
  },
  {
    key: 'tenis-de-corrida',
    vertical: 'esporte',
    label: 'Tênis de corrida',
    domains: [/SNEAKERS/],
    terms: ['tenis de corrida asics'],
    // Medição: GTIN 0/10. Sem identificador confiável: só revisão humana (tamanho é variante da oferta, nunca produto).
    profile: { strategy: 'review_only', fallbackAttrs: ['BRAND', 'MODEL', 'VERSION', 'GENDER', 'COLOR'], keyExtras: [] },
    targetRefreshMin: 60,
    seedRank: 13,
    rationale: 'Sem GTIN em 10/10 resultados; 0 catálogos com oferta em 2 tentativas. Só revisão.',
  },
  // ---- Segmentos NOVOS (2026-11-10). Domínios medidos no histograma de busca; GTIN/MODEL a confirmar no 1º dry-run. ----
  {
    key: 'teclado',
    vertical: 'tecnologia',
    label: 'Teclado mecânico/gamer',
    domains: [/^MLB-PC_KEYBOARDS$/],
    searchDomain: 'MLB-PC_KEYBOARDS',
    terms: dedupeTerms([
      ...combineTerms('teclado mecanico', ['', 'gamer rgb', '60%', 'tkl', 'sem fio'], ['redragon', 'logitech', 'razer', 'hyperx', 'corsair', 'keychron', 'fortrek', 'machenike', 'havit', 'akko', 'attack shark', 'royal kludge']),
      'teclado gamer', 'teclado gamer abnt2',
    ]),
    profile: GTIN_PROFILE(),
    targetRefreshMin: 30,
    seedRank: 14,
    rationale: 'Histograma: 43 de 50 no MLB-PC_KEYBOARDS (kits teclado+mouse ficam de fora por domínio); o porteiro exige nicho mecânico/gamer no título.',
  },
  {
    key: 'mouse',
    vertical: 'tecnologia',
    label: 'Mouse gamer',
    domains: [/^MLB-COMPUTER_MICE$/],
    searchDomain: 'MLB-COMPUTER_MICE',
    terms: dedupeTerms([
      ...combineTerms('mouse gamer', ['', 'sem fio', 'rgb', 'leve'], ['logitech g', 'razer', 'redragon', 'hyperx', 'corsair', 'attack shark', 'fortrek', 'pulsar', 'steelseries', 'havit', 'machenike']),
    ]),
    profile: GTIN_PROFILE(),
    targetRefreshMin: 30,
    seedRank: 15,
    rationale: 'Histograma: 32 de 50 no MLB-COMPUTER_MICE (mousepad e kit fora por domínio).',
  },
  {
    key: 'headset-gamer',
    vertical: 'tecnologia',
    label: 'Headset gamer',
    domains: [/^MLB-HEADPHONES$/],
    searchDomain: 'MLB-HEADPHONES',
    terms: dedupeTerms([
      ...combineTerms('headset gamer', ['', 'sem fio', '7.1', 'ps5', 'xbox'], ['hyperx', 'redragon', 'logitech g', 'razer', 'corsair', 'jbl quantum', 'astro', 'steelseries', 'fortrek', 'havit', 'edifier']),
    ]),
    profile: GTIN_PROFILE(),
    targetRefreshMin: 30,
    seedRank: 16,
    rationale: 'Histograma: 50 de 50 no MLB-HEADPHONES; o domínio é o mesmo do fone comum, então o porteiro exige headset/gamer no título.',
  },
  {
    key: 'monitor',
    vertical: 'tecnologia',
    label: 'Monitor',
    domains: [/^MLB-COMPUTER_MONITORS$/],
    searchDomain: 'MLB-COMPUTER_MONITORS',
    terms: dedupeTerms([
      ...combineTerms('monitor gamer', ['144hz', '165hz', '240hz', '27 polegadas', 'curvo', 'ultrawide', '4k'], ['lg', 'samsung odyssey', 'aoc', 'acer', 'asus', 'gigabyte', 'dell', 'philips', 'msi', 'redragon']),
      'monitor 24 polegadas', 'monitor 27 polegadas ips',
    ]),
    profile: GTIN_PROFILE(),
    targetRefreshMin: 30,
    seedRank: 17,
    rationale: 'Histograma: 49 de 50 no MLB-COMPUTER_MONITORS.',
  },
  {
    key: 'cadeira-gamer',
    vertical: 'tecnologia',
    label: 'Cadeira gamer',
    domains: [/^MLB-OFFICE_CHAIRS$/],
    searchDomain: 'MLB-OFFICE_CHAIRS',
    terms: dedupeTerms([
      ...combineTerms('cadeira gamer', ['', 'ergonômica', 'reclinável', 'big size'], ['dt3', 'thunderx3', 'pichau', 'mancer', 'dxracer', 'cougar', 'fortrek', 'redragon', 'husky', 'mad racer', 'tgt', 'corsair']),
    ]),
    profile: GTIN_PROFILE(),
    targetRefreshMin: 60,
    seedRank: 18,
    rationale: 'Histograma: 49 de 50 no MLB-OFFICE_CHAIRS (cadeira gamer não tem domínio próprio); o porteiro exige "gamer" no título. GTIN pode ser raro: medir.',
  },
  {
    key: 'memoria-ram',
    vertical: 'tecnologia',
    label: 'Memória RAM',
    domains: [/^MLB-RAM_MEMORY_MODULES$/],
    searchDomain: 'MLB-RAM_MEMORY_MODULES',
    terms: dedupeTerms([
      ...combineTerms('memoria ram', ['ddr5 16gb', 'ddr4 16gb', 'ddr4 8gb', 'ddr5 32gb', 'ddr4 32gb kit'], ['kingston fury', 'corsair vengeance', 'crucial', 'xpg', 'gskill', 'redragon', 'patriot', 'lexar', 'team group', 'adata']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 19,
    rationale: 'Histograma: 50 de 50 no MLB-RAM_MEMORY_MODULES. Memória de notebook (SODIMM) é produto diferente e fica separada pela chave (modelo).',
  },
  {
    key: 'processador',
    vertical: 'tecnologia',
    label: 'Processador',
    domains: [/^MLB-COMPUTER_PROCESSORS$/],
    searchDomain: 'MLB-COMPUTER_PROCESSORS',
    terms: dedupeTerms([
      ...combineTerms('processador', ['ryzen 5', 'ryzen 7', 'ryzen 9', 'intel core i5', 'intel core i7', 'intel core i9', 'ryzen 7 x3d'], ['amd', 'intel', 'am5', 'am4', 'lga 1700', 'lga 1851']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 20,
    rationale: 'Histograma: 27 de 50 no MLB-COMPUTER_PROCESSORS (resto: placa-mãe, kit de PC e mini PC, fora por domínio).',
  },
  {
    key: 'fone-de-ouvido',
    vertical: 'eletroeletronicos',
    label: 'Fone de ouvido',
    domains: [/^MLB-HEADPHONES$/],
    searchDomain: 'MLB-HEADPHONES',
    terms: dedupeTerms([
      ...combineTerms('fone de ouvido', ['bluetooth', 'sem fio true wireless', 'com cancelamento de ruido', 'over ear'], ['jbl', 'sony', 'apple airpods', 'samsung galaxy buds', 'xiaomi redmi buds', 'anker soundcore', 'bose', 'edifier', 'philips', 'qcy', 'lenovo']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 21,
    rationale: 'Histograma: 48 de 50 no MLB-HEADPHONES. Headset gamer pertence ao segmento da tecnologia (o porteiro tira "gamer/headset" daqui).',
  },
  {
    key: 'caixa-de-som',
    vertical: 'eletroeletronicos',
    label: 'Caixa de som',
    domains: [/^MLB-SPEAKERS$/],
    searchDomain: 'MLB-SPEAKERS',
    terms: dedupeTerms([
      ...combineTerms('caixa de som bluetooth', ['', 'portátil', 'à prova d\'água', 'party'], ['jbl', 'sony', 'jbl boombox', 'edifier', 'anker soundcore', 'philips', 'lenovo', 'xiaomi', 'bose', 'harman kardon', 'marshall']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 30,
    seedRank: 22,
    rationale: 'Histograma: 50 de 50 no MLB-SPEAKERS.',
  },
  {
    key: 'robo-aspirador',
    vertical: 'eletrodomesticos',
    label: 'Robô aspirador',
    domains: [/^MLB-ROBOT_VACUUMS$/],
    searchDomain: 'MLB-ROBOT_VACUUMS',
    terms: dedupeTerms([
      ...combineTerms('robo aspirador', ['', 'wifi', 'mop', 'mapeamento laser'], ['xiaomi', 'roborock', 'multilaser', 'electrolux', 'philco', 'wap', 'positivo', 'samsung', 'dreame', 'ecovacs', 'mondial']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 23,
    rationale: 'Histograma: 50 de 50 no MLB-ROBOT_VACUUMS.',
  },
  {
    key: 'cafeteira',
    vertical: 'eletrodomesticos',
    label: 'Cafeteira',
    domains: [/^MLB-ELECTRIC_COFFEE_MAKERS$/],
    searchDomain: 'MLB-ELECTRIC_COFFEE_MAKERS',
    terms: dedupeTerms([
      ...combineTerms('cafeteira', ['expresso', 'cápsulas', 'elétrica', 'italiana automática'], ['nespresso', 'dolce gusto', 'oster', 'philips walita', 'britânia', 'mondial', 'electrolux', 'delonghi', 'cadence', 'tres corações', 'arno']),
    ]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 30,
    seedRank: 24,
    rationale: 'Histograma: 36 de 50 no MLB-ELECTRIC_COFFEE_MAKERS (cafeteira manual e descalcificante fora por domínio).',
  },
  {
    key: 'esteira',
    vertical: 'esporte',
    label: 'Esteira ergométrica',
    domains: [/^MLB-TREADMILLS$/],
    searchDomain: 'MLB-TREADMILLS',
    terms: dedupeTerms([...combineTerms('esteira ergométrica', ['elétrica', 'dobrável', 'residencial'], ['movement', 'kikos', 'athletic', 'polimet', 'wellness', 'dream fitness', 'mormaii', 'oneal', 'caloi', 'philco', 'nautilus', 'techfit'])]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL', 'VOLTAGE'] },
    targetRefreshMin: 60,
    seedRank: 25,
    rationale: 'Histograma: 45 de 50 no MLB-TREADMILLS (lubrificante e correia fora por domínio e léxico). GTIN/vendedor a medir: esporte teve 404 em 10 de 10.',
  },
  {
    key: 'bicicleta-ergometrica',
    vertical: 'esporte',
    label: 'Bicicleta ergométrica',
    domains: [/^MLB-STATIONARY_BICYCLES$/],
    searchDomain: 'MLB-STATIONARY_BICYCLES',
    terms: dedupeTerms([...combineTerms('bicicleta ergométrica', ['spinning', 'horizontal', 'vertical'], ['movement', 'kikos', 'acte', 'polimet', 'wellness', 'dream fitness', 'oneal', 'mormaii', 'caloi'])]),
    profile: { strategy: 'gtin_then_attrs', fallbackAttrs: [...BRAND_MODEL], keyExtras: ['ALPHANUMERIC_MODEL'] },
    targetRefreshMin: 60,
    seedRank: 26,
    rationale: 'Histograma: 46 de 50 no MLB-STATIONARY_BICYCLES.',
  },
];

export function segmentByKey(key: string): SegmentConfig | undefined {
  return SEGMENTS.find((s) => s.key === key);
}

/** Segmentos de um departamento, na ordem de semeadura. */
export function segmentsOf(vertical: NonGamesVertical): SegmentConfig[] {
  return SEGMENTS.filter((s) => s.vertical === vertical).sort((a, b) => a.seedRank - b.seedRank);
}

/** Todos os segmentos na ordem de semeadura recomendada pela medição. */
export function seedOrder(): SegmentConfig[] {
  return [...SEGMENTS].sort((a, b) => a.seedRank - b.seedRank);
}

/** domain_id está entre os aceitos do segmento (e fora dos excluídos). */
export function domainMatches(seg: SegmentConfig, domainId: string | null | undefined): boolean {
  if (!domainId) return false;
  if (seg.excludeDomains?.some((r) => r.test(domainId))) return false;
  return seg.domains.some((r) => r.test(domainId));
}

/** Nome da variável de ambiente do kill-switch: VERTICAL_<NOME>_ENABLED (desligado por padrão). */
export function killSwitchEnvName(vertical: string): string {
  return `VERTICAL_${vertical.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ENABLED`;
}

/** Kill-switch ligado SOMENTE com '1' ou 'true' (qualquer outra coisa, inclusive ausente, é desligado). */
export function isVerticalEnabled(vertical: string, env: Record<string, string | undefined> = process.env): boolean {
  const v = (env[killSwitchEnvName(vertical)] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Intervalo de recoleta de um departamento: a menor frequência-alvo dos segmentos, limitada pelos termos do ML. */
export function refreshMinutesFor(vertical: NonGamesVertical, env: Record<string, string | undefined> = process.env): number {
  const override = Number(env[`VERTICAL_${vertical.toUpperCase()}_REFRESH_MIN`]);
  const base = segmentsOf(vertical).reduce((m, s) => Math.min(m, s.targetRefreshMin), Number.POSITIVE_INFINITY);
  const wanted = Number.isFinite(override) && override > 0 ? override : Number.isFinite(base) ? base : 30;
  return Math.min(Math.max(1, Math.floor(wanted)), MAX_REFRESH_MIN);
}
