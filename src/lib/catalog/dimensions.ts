// Sem 'server-only': lógica pura (regex + tabelas), importável por queries do
// servidor, scripts tsx e testes.
import type { ProductType } from '@/db/schema';
import { isBundleTitle } from '@/lib/affiliate/product-type-classifier';

/**
 * DIMENSÕES DO CATÁLOGO PÚBLICO (decisão do dono, 2026-10-31).
 *
 * "Se há um campo de procurar jogos, só jogos; se procurar consoles, só
 * consoles; se procurar eletro, só eletro. Não quero itens de games que sejam
 * acessórios, chaveiros e outros itens que não estejam em nossa cartela."
 *
 * Cartela da vertical GAMES (ordem = preferência de exibição):
 *   1. game       jogo (mídia física ou digital)
 *   2. console    hardware de console/portátil
 *   3. accessory  acessório que se usa COM jogos/consoles (controle, headset,
 *                 carregador/dock, cartão de memória, cabo, capa/case de
 *                 console, volante, joystick arcade, HD/SSD de console...)
 *
 * Fora da cartela (ESCONDIDO de toda vitrine, busca, autocomplete, contador,
 * ranking e tabela pública; continua no banco e no histórico):
 *   merchandise  chaveiro, action figure, pelúcia, vestuário, pôster, caneca,
 *                quadro, decoração, cartas, livros/artbooks/mangá, brindes
 *   part         peça avulsa/reparo (analógico, gatilho, carcaça, flat flex),
 *                embalagem vazia, encarte, faceplate, réplica
 *   off_catalog  produto de outra vertical que a busca de games não serve
 *                (cadeira, teclado, mouse, TV, PC, filme em Blu-ray, câmera...)
 *                — candidato às dimensões futuras (tecnologia, eletro).
 *
 * EXTENSÍVEL: uma nova vertical (ex.: 'tecnologia', 'eletro') entra em
 * `VERTICALS` com suas próprias dimensões e vira uma aba pública; nada mais
 * precisa mudar nas consultas, que perguntam sempre a `isPublicDimension`.
 */

export type CatalogDimension =
  | 'game'
  | 'console'
  | 'accessory'
  | 'merchandise'
  | 'part'
  | 'off_catalog';

export type CatalogVertical = 'games'; // futuras: 'tecnologia' | 'eletro'

export interface DimensionDef {
  id: CatalogDimension;
  vertical: CatalogVertical | null;
  label: string;
  /** Aba pública? false = escondida em toda superfície pública. */
  public: boolean;
  /** Menor = mais preferido (jogos > consoles > acessórios). */
  rank: number;
}

export const DIMENSIONS: Record<CatalogDimension, DimensionDef> = {
  game: { id: 'game', vertical: 'games', label: 'Jogos', public: true, rank: 0 },
  console: { id: 'console', vertical: 'games', label: 'Consoles', public: true, rank: 1 },
  accessory: { id: 'accessory', vertical: 'games', label: 'Acessórios de jogo', public: true, rank: 2 },
  merchandise: { id: 'merchandise', vertical: null, label: 'Merchandising', public: false, rank: 90 },
  part: { id: 'part', vertical: null, label: 'Peças e embalagens', public: false, rank: 91 },
  off_catalog: { id: 'off_catalog', vertical: null, label: 'Fora da cartela', public: false, rank: 92 },
};

/** Vertical -> dimensões públicas (abas), já em ordem de preferência. */
export const VERTICALS: Record<CatalogVertical, CatalogDimension[]> = {
  games: ['game', 'console', 'accessory'],
};

/** Tipos públicos da vertical de games, em ordem de preferência (jogos > consoles > acessórios). */
export const PUBLIC_PRODUCT_TYPES: readonly ProductType[] = VERTICALS.games as ProductType[];

export function isPublicDimension(d: CatalogDimension): boolean {
  return DIMENSIONS[d].public;
}

/** Aba (product_type) correspondente a uma dimensão pública; null se escondida. */
export function dimensionToProductType(d: CatalogDimension): ProductType | null {
  return d === 'game' || d === 'console' || d === 'accessory' ? d : null;
}

export function productTypeRank(t: ProductType): number {
  return DIMENSIONS[t].rank;
}

// ---------------------------------------------------------------------------
// Classificação por título (salvaguarda: a vitrine não depende só do campo do banco)
// ---------------------------------------------------------------------------

export interface DimensionResult {
  dimension: CatalogDimension;
  /** 'db' = o tipo gravado foi mantido; 'title' = regra de título corrigiu. */
  source: 'db' | 'title';
  /** Regra que disparou (auditável); null quando source = 'db'. */
  reason: string | null;
  matched: string | null;
  /** Kit/lote/combo/bundle. Console+jogo: aba Consoles com selo "Bundle", FORA da média/menor preço do console puro. Lote de jogos: jogo com flag, fora da média de jogo único. */
  bundle?: boolean;
}

/** Sem acento, minúsculo, pontuação vira espaço (padrões abaixo são ASCII). */
export function foldTitle(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

interface Rule {
  reason: string;
  re: RegExp;
}

function firstIndex(rules: Rule[], t: string): { reason: string; matched: string; index: number } | null {
  let best: { reason: string; matched: string; index: number } | null = null;
  for (const r of rules) {
    const m = r.re.exec(t);
    if (m && (best === null || m.index < best.index)) best = { reason: r.reason, matched: m[0], index: m.index };
  }
  return best;
}

/** Qualquer menção a plataforma de jogo (inclui as legadas fora do enum). Só para decidir "tem cara de jogo/console?". */
const PLATFORM_MENTION =
  /\b(?:ps ?[1-5]|psp|vita|playstation|x ?box|x ?360|xone|switch|nintendo|wii|wii ?u|3ds|2ds|ds|gamecube|n64|snes|nes|game ?boy|gba|sega|mega ?drive|atari|dreamcast|pc|steam|epic)\b/;

/** Mídia de jogo explícita. */
const MEDIA_SIGNAL =
  /\b(?:jogos?|midia|fisic[oa]|games?|cartucho|dlc|colecionador|collectors?|deluxe|gold|definitiva|completa)\b|\bblu ?ray\b/;

// --- Merchandise (inequívoco: vence qualquer outro sinal) -------------------
const MERCH_STRONG: Rule[] = [
  { reason: 'chaveiro', re: /\bchaveiros?\b|\bkeychains?\b|\bmolduras? de chave/ },
  { reason: 'action_figure', re: /\baction ?figures?\b|\bfigures?\b|\bfigurines?\b|\bfiguras?\b|\bminifiguras?\b|\bestatuas?\b|\bbonecos?\b|\bbonecas?\b|\bfunko\b|\bamiibo\b|\bdiorama\b|\bbusto\b/ },
  { reason: 'pelucia', re: /\bpelucias?\b|\bplush\b/ },
  { reason: 'vestuario', re: /\bcamisetas?\b|\bcamisas?\b|\bmoletom\b|\bjaquetas?\b|\bmeias?\b|\bchinelos?\b|\bfantasias?\b|\bcosplay\b|\bboxer\b|\bcueca\b/ },
  { reason: 'caneca_copo', re: /\bcanecas?\b|\bcopos?\b|\bgarrafas?\b|\blancheiras?\b|\bporta ?copos?\b|\btaca\b/ },
  { reason: 'poster_quadro', re: /\bposte(?:r|res)\b|\bquadros?\b|\bplacas? decorativas?\b|\bbanner\b|\btapetes?\b|\bcobertor\b|\btoalha\b/ },
  { reason: 'decoracao', re: /\bluminarias?\b|\babajur\b|\bdecoracao\b|\bdecorativ[oa]s?\b|\balmofadas?\b|\badesivos?\b|\bstickers?\b|\bimas? (?:de geladeira|decorativ)|\bbaloes?\b|\bcortador(?:es)? (?:de biscoito|marcador)\b/ },
  { reason: 'cartas_baralho', re: /\btrading cards?\b|\bcard ?game\b|\bcartas (?:colecionaveis|pokemon|de jogar|yu ?gi ?oh|magic)\b|\bpokemon tcg\b/ },
  { reason: 'livro_artbook', re: /\bartbooks?\b|\bart books?\b|\blivros?\b|\bmangas?\b|\bhqs?\b|\brevistas?\b|\bguia estrategico\b|\bstrategy guide\b|\benciclopedia\b|\bhistoria em quadrinhos\b/ },
  { reason: 'brinde_diverso', re: /\bsouvenir\b|\bmochilas?\b|\bbijuteria\b|\bcolar\b|\bpulseiras?\b|\bbroche\b|\bquebra ?cabecas?\b|\brelogios?\b|\bmascaras? de dormir\b|\boculos\b|\bdetonados?\b|\bsuper fa\b/ },
];

/** Merchandise de sinal fraco: só vale quando o título NÃO tem mídia de jogo ("Jogo X + Boné" continua jogo). */
const MERCH_WEAK: Rule[] = [
  { reason: 'brinde_bonus', re: /\bbrindes?\b|\bminiaturas?\b|\bmascaras?\b|\bkit itens\b|\bitens do jogo\b|\bcolecionavel\b|\bcolecionaveis\b|\bbones?\b|\bbaralhos?\b|\bboosters?\b/ },
];

// --- Fora da cartela de games (outras verticais) -----------------------------
const OFF_CATALOG: Rule[] = [
  { reason: 'mobiliario', re: /\bcadeiras?\b|\bmesa gamer\b|\bescrivaninha\b|\bpoltrona\b/ },
  { reason: 'periferico_pc', re: /\bteclados?\b|\bmouses?\b|\bmouse ?pad\b|\bmousepad\b|\bwebcam\b|\bmonitor(?:es)?\b|\bnotebook\b|\bpc gamer\b|\bplacas? de video\b|\bxeon\b|\bprocessador\b|\bgabinete (?:gamer|atx|mid|pc)\b|\bmemoria ram\b|\broteador\b/ },
  { reason: 'audio_video_foto', re: /\bsmart ?tvs?\b|\btelevis(?:or|ao)\b|\bsoundbar\b|\bcaixas? de som\b|\balto ?falantes?\b|\bprojetor\b|\bdrone\b|\btv (?:\d|led|4k|hdr)/ },
  { reason: 'outros_ramos', re: /\bbicicleta\b|\bmtb\b|\bguidao\b|\bcontrole remoto (?:de |para )?(?:tv|ar|portao)|\bcontrole de ar\b/ },
];
/** Filme/série em disco: só quando o título não cita plataforma de jogo. */
const MOVIE_DISC = /\bblu ?ray\b|\bdvd\b|\bfilmes?\b|\bserie completa\b/;

// --- Peça avulsa / reparo / embalagem (nunca é jogo nem acessório de uso) ----
/** Termos de reparo/reposição: peça em qualquer posição do título. */
const PART_STRONG: Rule[] = [
  { reason: 'reparo_reposicao', re: /\breposicao\b|\bsubstituicao\b|\breparo\b|\breparos\b|\bferramentas?\b|\bpecas?\b|\bkit de reparo\b|\bconserto\b|\barquivo de personalizacao\b/ },
  { reason: 'condutiva_flat', re: /\bcondutiv[oa]s?\b|\bflat ?flex\b|\bpotenciometros?\b|\bmolas?\b|\bsensores? (?:hall|analogic)/ },
  { reason: 'analogico_3d', re: /\banalogicos? 3d\b|\b3d analogicos?\b|\bhall effect (?:analogic|stick|sensor)/ },
  { reason: 'embalagem_vazia', re: /\bcaixa vazia\b|\bsteelbook (?:vazio|sem)\b|\bsomente (?:o |a |os |as )?(?:encartes?|caixa|capa|manual|case|estojo)\b|\bapenas (?:o |a |os |as )?(?:encartes?|caixa|capa|manual)\b/ },
  { reason: 'carcaca_faceplate', re: /\bcarcacas?\b|\bfaceplates?\b|\bdock cover\b|\breplicas?\b|\bplaca frontal\b/ },
];
/** Peças que só valem como "peça" se aparecem ANTES do substantivo principal ("Kit 2 Botões ... para Controle"). */
const PART_WEAK: Rule[] = [
  { reason: 'botao_gatilho', re: /\bbot(?:ao|oes)\b|\bgatilhos?\b|\bthumbsticks?\b|\bthumb ?grips? ?(?:caps?)?\b/ },
  { reason: 'analogico', re: /\banalogicos?\b|\bsticks? analogic/ },
];

// --- Substantivos principais -------------------------------------------------
/** Acessório de uso COM jogos/consoles. `capa`/`case` só no sentido de proteção de console. */
const ACCESSORY_NOUNS: Rule[] = [
  { reason: 'controle', re: /\bcontroles?\b|\bcontrolador(?:es)?\b|\bcontroller\b|\bjoysticks?\b|\bjoy ?cons?\b|\bpro controller\b|\bdual ?sense\b|\bdual ?shock\b|\bdouble ?shock\b|\bgamepads?\b|\bmanetes?\b|\bjoypad\b/ },
  { reason: 'volante_arcade', re: /\bvolantes?\b|\bpedais\b|\bfight(?:ing)? sticks?\b|\barcade sticks?\b|\bfightstick\b|\balavancas? arcade\b|\bguitarra\b/ },
  { reason: 'audio', re: /\bheadsets?\b|\bfones?\b|\bheadphones?\b|\bfones de ouvido\b/ },
  { reason: 'energia', re: /\bcarregad(?:or|ora|ores|oras)\b|\bfontes?\b|\bbaterias?\b|\bpilhas?\b|\bcabos?\b|\badaptad(?:or|ores)\b|\bdocks?\b|\bestacao de (?:carregamento|acoplamento)\b|\bcharging\b|\bcharger\b|\bhub\b/ },
  { reason: 'armazenamento', re: /\bcartao de memoria\b|\bmemory card\b|\bmicro ?sd\b|\bhd externo\b|\bssd externo\b|\bdisco rigido\b|\bhdd\b|\bexpansao de memoria\b|\bssd nvme\b/ },
  { reason: 'protecao_suporte', re: /\bcapa (?:protetora|para|de silicone|de protecao|rigida|transparente|case)\b|\bcases? (?:protetor|para|de protecao|rigido|transparente|de transporte|organizador)\b|\bcaixa (?:de|para) (?:transporte|guardar|(?:nintendo )?switch|console|ps ?\d|playstation|xbox)\b|\bsacos? de armazenamento\b|\bestojo\b|\bbolsa (?:para|de transporte)\b|\bcoldre\b|\bprotetor(?:es)?\b|\bpeliculas?\b|\bskins?\b|\bgrips?\b|\bsuportes?\b|\borganizador\b|\bcooler\b|\brefrigerador\b|\bventoinha\b|\bventilador\b|\bresfriamento\b|\bbase (?:vertical|de carregamento)\b/ },
  { reason: 'acessorios_generico', re: /\bacessorios?\b|\bvirtual boy\b|\bplaystation portal\b|\bkinect\b|\bcameras? (?:para|ps|nintendo|switch|playstation|xbox|hd)\b|\bplay ?charge\b|\bmanta\b|\bgrip\b/ },
];

/** Console: aparelho. Tudo com lookbehind simples em JS moderno (Node 18+). */
const CONSOLE_NOUNS: Rule[] = [
  { reason: 'console_noun', re: /(?<!\b(?:para|edicao|versao|um|no|do|de|em|sem)\s)\bconsoles?\b/ },
  { reason: 'videogame', re: /\bvideo ?game\b/ },
  { reason: 'modelo_hardware', re: /\bps ?[45] slim\b|\bplaystation ?[45] slim\b|\bswitch (?:lite|oled|v[12])\b|\boled\b|\bcfi ?\d|\bxbox series [sx]\b.*\b\d{3,4} ?gb\b/ },
  { reason: 'capacidade', re: /\b\d ?tb\b|\b\d ?tera\b|\b\d{3,4} ?gb\b.*\b(?:ps ?[45]|xbox|switch|playstation)\b|\b(?:ps ?[45]|xbox|switch|playstation)\b.*\b\d{3,4} ?gb\b/ },
  { reason: 'desbloqueado', re: /\bdesbl|\bdesb\b|\bd e s b l o q\b/ },
  { reason: 'bundle_console', re: /\bbundle\b/ },
  { reason: 'ps_original', re: /\b(?:ps ?[123]|playstation ?[123]) (?:super )?(?:original|slim|fat)\b|\bpsone\b|\bplaystation [123]\b.*\bcor\b/ },
  { reason: 'legado_completo', re: /\b(?:playstation|ps) ?[123]\b.*\bcompleto\b|\bcompleto\b.*\b(?:playstation|ps) ?[123]\b/ },
];
/**
 * Título que COMEÇA pelo nome do aparelho e depois lista acessórios/jogos
 * ("Playstation 5 com 2 controles + FIFA 26"): é o console com itens. Só vale
 * quando há acessório no título e nenhuma mídia explícita (ver classifyCatalogItem).
 */
const PLATFORM_LEAD = /^(?:console |sony |microsoft |nintendo )*(?:playstation ?[1-5]|ps ?[1-5]|xbox (?:360|one|series [sx])|nintendo switch(?: 2| lite| oled)?)\b/;
/** O que vem antes do match indica "para/compatível com X": X é o alvo de compatibilidade, não o produto. */
const COMPAT_PREFIX = /\b(?:para|compativel(?: com)?|compatible|for|p)\s+(?:o |a )?(?:\w+ )?$/;
/** Pré-venda/bônus/DLC: o item é jogo com brinde digital/físico, não merchandise. */
const BONUS_CONTEXT = /\b(?:pre ?order|bonus|dlc|digital deluxe)\b/;
/** Título que é só o nome do aparelho ("Xbox Série S", "Nintendo Switch 2") sem jogo nem acessório. */
const BARE_CONSOLE = /^(?:microsoft |sony |nintendo )?(?:xbox series [sx]|xbox one(?: [sx])?|ps ?[45]|playstation ?[2345]|nintendo switch(?: 2)?|switch 2)$/;

function normalizeForNouns(t: string): string {
  // "Sem controle/cabo/fonte" nega o acessório; não é item do acessório.
  return t.replace(/\bsem (?:o )?(?:controles?|cabos?|fontes?|jogos?|dock|carregador(?:es)?)\b/g, ' sem_item ');
}

/**
 * Classifica o item por título + tipo gravado no banco. Regras:
 *  - merchandise/off-catalog/peça inequívocos vencem tudo (inclusive o tipo do banco);
 *  - acessório e console por título só corrigem quando o substantivo principal
 *    aparece ANTES de qualquer sinal de mídia de jogo ("Jogo X + Controle" fica jogo;
 *    "Controle Zelda" vira acessório);
 *  - NUNCA promove acessório/console do banco a jogo e NUNCA usa plataforma
 *    'unknown' como critério (plataforma é eixo separado, ver derivePlatformFromTitle).
 */
function classifyCore(name: string, dbType: ProductType): DimensionResult {
  const kept = (dimension: CatalogDimension): DimensionResult => ({ dimension, source: 'db', reason: null, matched: null });
  const hit = (dimension: CatalogDimension, reason: string, matched: string): DimensionResult => ({
    dimension,
    source: dimension === dbType ? 'db' : 'title',
    reason,
    matched,
  });

  const t = normalizeForNouns(foldTitle(name));
  if (!t) return kept(dbType);
  const mentionsPlatform = PLATFORM_MENTION.test(t);

  // 1. Merchandise inequívoco (pré-venda/bônus/DLC com brinde NÃO é merchandise)
  const merch = BONUS_CONTEXT.test(t) ? null : firstIndex(MERCH_STRONG, t);
  if (merch) return hit('merchandise', merch.reason, merch.matched);
  const merchWeak = firstIndex(MERCH_WEAK, t);
  if (merchWeak && !MEDIA_SIGNAL.test(t)) return hit('merchandise', merchWeak.reason, merchWeak.matched);
  // "Kit ..." sem plataforma nem mídia de jogo: kit de fã/colecionador, não jogo
  if (!mentionsPlatform && /^kit\b/.test(t) && !MEDIA_SIGNAL.test(t)) return hit('merchandise', 'kit_sem_plataforma', 'kit');
  // Número de volume sem plataforma nem mídia: mangá/livro ("Dragon Ball Vol 3")
  if (!mentionsPlatform && /\bvol(?:ume)? ?\d+\b/.test(t)) return hit('merchandise', 'volume_sem_plataforma', 'vol');

  // 2. Outras verticais
  const off = firstIndex(OFF_CATALOG, t);
  if (off) return hit('off_catalog', off.reason, off.matched);
  if (!mentionsPlatform && MOVIE_DISC.test(t)) return hit('off_catalog', 'filme_em_disco', 'blu-ray/dvd');

  // 3. Peça avulsa / embalagem
  const partStrong = firstIndex(PART_STRONG, t);
  if (partStrong) return hit('part', partStrong.reason, partStrong.matched);

  const acc = firstIndex(ACCESSORY_NOUNS, t);
  let con = firstIndex(CONSOLE_NOUNS, t);
  const media = MEDIA_SIGNAL.exec(t);
  const mediaIdx = media ? media.index : Infinity;

  // "Encarte" com mídia de jogo no título é o jogo com encarte reimpresso; sem mídia é a peça solta
  if (!media && /\bencartes?\b/.test(t)) return hit('part', 'encarte', 'encarte');

  // "para/compatível com Nintendo Switch OLED ...": o aparelho é só o alvo de compatibilidade
  if (con && acc && COMPAT_PREFIX.test(t.slice(0, con.index))) con = null;
  // modelo solto ("OLED", "Switch Lite") sem capacidade nem "console" ao lado de um acessório: é compatibilidade, não o aparelho
  if (con && acc && con.reason === 'modelo_hardware' && !/\bconsole\b|\b\d{2,4} ?gb\b|\b\d ?tb\b/.test(t)) con = null;
  // "Playstation 5 com 2 controles + jogo": começa pelo aparelho e lista itens
  // (só com "com/+ N controles"; "PS5 Controle Dualsense" continua acessório)
  if (!con && acc && !media && PLATFORM_LEAD.test(t) && /\bcom \d* ?(?:controles?|manetes?)\b|\+ ?\d* ?(?:controles?|manetes?)\b/.test(t)) {
    con = { reason: 'plataforma_inicio', matched: 'plataforma no início', index: 0 };
  }

  const partWeak = firstIndex(PART_WEAK, t);
  if (partWeak && (!acc || partWeak.index < acc.index) && partWeak.index < mediaIdx) {
    return hit('part', partWeak.reason, partWeak.matched);
  }

  // 4. Acessório x console: o substantivo que aparece primeiro é o produto
  let pick: { dimension: 'accessory' | 'console'; reason: string; matched: string; index: number } | null = null;
  if (acc && (!con || acc.index <= con.index)) pick = { dimension: 'accessory', ...acc };
  else if (con) pick = { dimension: 'console', ...con };

  if (pick) {
    // Mídia de jogo ANTES do substantivo => é o jogo ("Jogo Mario Kart + Volante")
    if (mediaIdx < pick.index && dbType === 'game') return kept('game');
    // "console" sem especificação de hardware no meio/fim do título costuma ser a plataforma ("... Console Xbox One Capcom")
    const weakConsole = pick.dimension === 'console' && (pick.reason === 'videogame' || (pick.reason === 'console_noun' && pick.index > 12));
    if (weakConsole && dbType === 'game') return kept('game');
    // bundle sem sinal de hardware de console: "Bundle" de jogos
    if (pick.reason === 'bundle_console' && (!mentionsPlatform || media || /\b(?:add ?ons?|digital|dlc|pack|jogos)\b|\d \+ \d/.test(t))) {
      return kept(dbType);
    }
    return hit(pick.dimension, pick.reason, pick.matched);
  }

  // Título que é só o nome do aparelho: console (a menos que o banco diga acessório/jogo com contexto)
  if (BARE_CONSOLE.test(t)) return hit('console', 'nome_nu_de_plataforma', t);

  return kept(dbType);
}

/** Tipo efetivo (aba) ou null quando o item está fora da cartela e deve ser escondido. */
export function effectiveCatalogType(name: string, dbType: ProductType): ProductType | null {
  return dimensionToProductType(classifyCatalogItem(name, dbType).dimension);
}

/** true = item aparece em alguma aba pública. */
export function isPublicCatalogItem(name: string, dbType: ProductType): boolean {
  return effectiveCatalogType(name, dbType) !== null;
}

/**
 * Ordem de exibição entre abas (jogos > consoles > acessórios), usada para
 * desempate quando uma mesma lista mistura tipos (ex.: autocomplete sem aba).
 */
export function comparePreference(a: ProductType, b: ProductType): number {
  return productTypeRank(a) - productTypeRank(b);
}


// ---------------------------------------------------------------------------
// Camada final (ata do Conselho Geek 2026-10-31): fora da cartela por situação
// de venda, plataforma obrigatória no acessório, flag de bundle.
// Precedência: fora-da-cartela > console como item principal > acessório > jogo.
// ---------------------------------------------------------------------------

/** Plataformas de CONSOLE (PC/Steam não bastam para um acessório de jogo). */
const CONSOLE_PLATFORM =
  /\b(?:ps ?[1-5]|psp|vita|playstation|x ?box|x ?360|xone|switch|nintendo|wii|wii ?u|3ds|2ds|gamecube|n64|snes|game ?boy|gba|sega|mega ?drive|atari|dreamcast|dualsense|dualshock|joy ?con)\b/;
const PHYSICAL_SIGNAL = /\bfisic[oa]\b|\bmidia fisica\b|\bblu ?ray\b|\bcartucho\b|\bdisco\b|\blacrad[oa]\b/;
const USED_RE = /\busad[oa]s?\b|\bseminov[oa]s?\b|\bopen ?box\b|\brecondicionad[oa]s?\b|\brevisad[oa]\b/;
const CLONE_RE = /\bclones?\b|\bgame ?stick\b|\bretro (?:game|console|arcade)\b|\bconsole (?:retro|portatil) .*\b(?:4k|hdmi)\b|\bsem fio portatil 4k\b|\b\d{3,5} jogos? (?:embutidos|inclusos)\b|\bemulador\b/;
const DIGITAL_RE = /\bdigital\b(?! devil)|\bcodigo\b|\bgift ?card\b|\bcartao presente\b|\bpsn\b|\bchave de ativacao\b/;
const CONSOLE_MOD_RE = /\bdesbl\w*|\bdesb\b|\bgoldhen\b|\blojinha\b|\bbdj\b|\bbaixar jogos\b|\bjogos digitais\b|\bpirat\w*|\bdisco de desbloqueio\b/;
const DLC_RE = /\bdlc\b|\badd ?ons?\b|\bseason pass\b|\bpasse de temporada\b|\bexpansao\b|\bpacote de melhoria\b|\bupgrade pack\b/;
const COLLECTOR_RE = /\bsteelbook\b|\b(?:colecionador|collectors?)\b.*\b(?:sem (?:o )?(?:jogo|disco|midia)|apenas|somente)\b/;
const GAME_WORD = /\bjogos?\b|\bgames?\b|\bmidia\b/;

export function classifyCatalogItem(name: string, dbType: ProductType): DimensionResult {
  const t = foldTitle(name);
  const hide = (dimension: CatalogDimension, reason: string, matched: string): DimensionResult => ({
    dimension,
    source: 'title',
    reason,
    matched,
    bundle: false,
  });
  if (!t) return { dimension: dbType, source: 'db', reason: null, matched: null, bundle: false };

  const used = USED_RE.exec(t);
  if (used) return hide('off_catalog', 'usado', used[0]);
  const clone = CLONE_RE.exec(t);
  if (clone) return hide('off_catalog', 'clone_generico', clone[0]);

  const physical = PHYSICAL_SIGNAL.test(t);
  const mentionsConsole = CONSOLE_PLATFORM.test(t);
  // Colecionável/steelbook sem disco, jogo nem mídia: peça de coleção, não jogo
  if (COLLECTOR_RE.test(t) && !physical && !GAME_WORD.test(t) && !/\b(?:ps ?[45]|xbox|switch|nintendo|playstation)\b/.test(t)) {
    return hide('merchandise', 'colecionavel_sem_midia', 'colecionador/steelbook');
  }

  const core = classifyCore(name, dbType);
  const bundle = isBundleTitle(name) || /\bbundle\b/.test(t);
  const out: DimensionResult = { ...core, bundle };

  if (out.dimension === 'game') {
    if (DLC_RE.test(t) && !physical) return { ...hide('off_catalog', 'dlc_isolado', DLC_RE.exec(t)![0]), bundle };
    if (DIGITAL_RE.test(t) && !physical) return { ...hide('off_catalog', 'digital_codigo', DIGITAL_RE.exec(t)![0]), bundle };
  }
  // Console modificado/desbloqueado ou com loja de jogos baixados não é o aparelho de varejo
  if (out.dimension === 'console') {
    const mod = CONSOLE_MOD_RE.exec(t);
    if (mod) return { ...hide('off_catalog', 'console_modificado', mod[0]), bundle };
  }
  // Acessório só vale com plataforma de console no título
  if (out.dimension === 'accessory' && !mentionsConsole) {
    return { ...hide('off_catalog', 'acessorio_sem_plataforma', 'sem plataforma'), bundle };
  }
  return out;
}
