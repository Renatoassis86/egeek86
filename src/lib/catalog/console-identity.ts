// Identidade de CONSOLE (hardware) do departamento games. PURO: sem banco, sem 'server-only'.
// Auditoria de consoles (2026-11-11, dono): um console = UM master = UMA média. Reaproveita o léxico de
// src/lib/affiliate/dedup.ts (normalizeTitle: marcadores de condição/região/edição), game-classification.ts
// (derivePlatformFromTitle) e product-type-classifier.ts (isBundleTitle). Não reinventa essas regras; só acrescenta
// os eixos de hardware que o dedup não expõe de forma estruturada (versão Fat/Slim/Pro, mídia, edição temática, pacote).
//
// CHAVE = família | modelo | mídia | armazenamento(só Xbox) | edição | região | avulso ou pacote:<assinatura>
//   - família: ps5, xbox_series, switch_1, switch_2 (PS4/Xbox One/360 = fora de linha: escopo 'legacy', nunca entram).
//   - modelo: PS5 fat|slim|pro; Xbox series_s|series_x; Switch standard|lite|oled; 'nd' = o título não prova.
//   - mídia: disc|digital (PS5 sem Pro, Xbox Series X). Sem a palavra digital => disco PRESUMIDO (mesma prova de
//     'assumed_no_digital_marker' dos jogos; Sony chama o disco de "Standard"). Pro/Series S/Switch: 'na'.
//   - armazenamento: eixo SÓ no Xbox (S 512 GB x S 1 TB são produtos). No PS5 a capacidade NÃO separa (decisão do dono,
//     2026-11-03, dedup.ts `capacityIgnored`): quem a carrega é o modelo (Fat 825, Slim 1 TB, Pro 2 TB). No Switch, o modelo.
//   - edição: edição limitada de verdade (Wolverine, 30 anos, Zelda, Splatoon...). Região separa (importado/JPN/EUA/EUR).
//   - pacote: console + jogo/controle extra/assinatura/cartão. Por 'composição' (compareIdentity: marcador bundle é
//     divergência dura) NUNCA entra na média do console avulso; vira identidade própria, agrupada pela assinatura do conteúdo.
// Cor NÃO separa. Open Box, usado, vitrine, desbloqueado/modificado: condição própria, fora das médias.
import { normalizeTitle } from '@/lib/affiliate/dedup';
import { derivePlatformFromTitle } from '@/lib/affiliate/game-classification';
import { isBundleTitle } from '@/lib/affiliate/product-type-classifier';
import { foldTitle, titleHardwareKind, titleLeadsWithAccessory } from '@/lib/catalog/dimensions';

export type ConsoleFamily = 'ps5' | 'xbox_series' | 'switch_1' | 'switch_2';
export type ConsoleScope = 'in' | 'legacy' | 'not_console';
export type ConsoleCondition = 'new' | 'used' | 'open_box' | 'modded';
export type ConsoleConfidence = 'alta' | 'media' | 'baixa';

export interface ConsoleIdentity {
  scope: ConsoleScope;
  /** Por que está fora (not_console/legacy) ou nota principal. */
  reason: string | null;
  family: ConsoleFamily | null;
  model: string;
  media: 'disc' | 'digital' | 'na';
  mediaSource: 'titulo' | 'presumida' | 'implicita';
  storageGb: number | null;
  edition: string | null;
  region: string | null;
  pack: boolean;
  packSignature: string | null;
  packReasons: string[];
  condition: ConsoleCondition;
  confidence: ConsoleConfidence;
  /** Chave de identidade COMPLETA (inclui pacote). null quando fora de escopo. */
  key: string | null;
  /** Mesma chave sem o pacote (o "console avulso" correspondente). */
  baseKey: string | null;
  /** Pontos que o título não prova (revisão humana). */
  unresolved: string[];
}

export const LEGACY_FAMILIES = new Set(['ps4', 'xbox_one', 'xbox_360']);

const NOT_CONSOLE_DENY =
  /\b(portal|cooler|dissipador|ventoinha|fan|hdmi|unidade de leitor|unidade de disco|disc drive|base|suporte|stand|capa|case|skin|adesivo|bateria|bat eria|bau|chip|mouse|teclado|volante|headset|fone|fones|carregador|cabo|adaptador|transmissor|camera|pulse|cartao de memoria|caixa vazia|peca|pecas|reposicao|placa|ci|circuito|pro controller|controlador|revista|hwfly|picofly|poshernomics|wolf fang|dock|estacao|organizador|acessorio|acessorios|pelicula|vidro|protetor|mochila|bolsa|portatil|dlxed|deluxe edition|faceplate|emblema|letreiro|grade|lcd|display|mica|porta de|pre order|preorder|bonus|manager)\b/;
/** O título anuncia aparelho? (substantivo console/videogame, ou modelo+família). */
const CONSOLE_NOUN = /\b(console|consoles|videogame|video game)\b/;
const MODEL_WORD = /\b(v1|v2|slim|pro|fat|digital|disco|disc|oled|lite|cfi ?\d|series [sx]|serie [sx]|xbox series|825 ?gb|1 ?tb|2 ?tb|512 ?gb|500 ?gb|256 ?gb|64 ?gb|32 ?gb|standard|padrao|bundle|pacote)\b/;

const MODDED = /\b(desbloquead[oa]s?|desbloqueio|desbloqueavel|desb|d e s b l o q|tinfoil|atmosphere|kamikaze|dual ?boot|modificad[oa]|hackeado|picofly|hwfly|lotado de jogos|cheio de jogos|jogos instalados|cartao cheio|serial desb)\b/;

/** Edições limitadas de hardware (design próprio). Ordem importa. slug -> regex sobre o título dobrado. */
const EDITIONS: Array<[string, RegExp]> = [
  ['wolverine', /\bwolverine\b/],
  ['aniversario_30', /\b(30 ?anos|30(th|o)? aniversario|30th anniversary|aniversario de 30)\b/],
  ['halo_infinite', /\bhalo infinite\b/],
  ['diablo_iv', /\bdiablo\b/],
  ['zelda', /\b(zelda|hyrule|tears of the kingdom|totk)\b/],
  ['splatoon', /\bsplatoon\b/],
  ['animal_crossing', /\banimal crossing\b/],
  ['pokemon_dialga_palkia', /\b(dialga|palkia)\b/],
  ['pokemon_sv', /\bpokemon (scarlet|violet|escarlate|violeta)\b/],
  ['mario_vermelho', /\b(mario (red|vermelho)|edicao mario|mario edition)\b/],
  ['limitada', /\b(edicao limitada|limited edition|edicao especial|special edition|colecionador|collector)\b/],
];
/** Edição temática só vale como edição quando o título a chama de edição/modelo (senão é o jogo vindo no pacote). */
const THEME_EDITION_CONTEXT = /\b(edition|edicao|modelo|special|limitada|limited|hyrule|colecionador)\b/;

/** Conteúdo que torna o anúncio um PACOTE (jogo/acessório/assinatura vendido junto). slug canônico. */
const PACK_CONTENT: Array<[string, RegExp]> = [
  ['astro bot', /\bastro ?bot\b/],
  ['gran turismo', /\b(gran turismo|gt ?7)\b/],
  ['god of war', /\bgod of war\b/],
  ['fortnite', /\bfortnite\b/],
  ['nba 2k', /\bnba ?2k ?\d*\b/],
  ['ea fc', /\b(ea )?(sports )?(fc|fifa) ?\d{2}\b|\bea sports fc\b/],
  ['call of duty', /\b(call of duty|cod)\b/],
  ['spider man', /\bspider ?man\b/],
  ['horizon', /\bhorizon\b/],
  ['ratchet', /\bratchet\b/],
  ['demons souls', /\bdemons souls\b/],
  ['last of us', /\blast of us\b/],
  ['minecraft', /\bminecraft\b/],
  ['hogwarts', /\bhogwarts\b/],
  ['mario kart', /\bmario ?kart\b/],
  ['mario wonder', /\b(mario (bros )?wonder|super mario bros wonder)\b/],
  ['pokemon legends', /\bpokemon legends\b/],
  ['forza', /\bforza\b/],
  ['halo', /\bhalo\b/],
  ['jogos', /(\+|\bcom\b|\be\b) ?(\d+ |dois |duas |tres |varios |um |1 )?jogos?\b|\b\d+ jogos\b/],
  ['assinatura', /\b(\d+ meses( de)? (assinatura|nintendo|online|game ?pass|ps ?plus)|assinatura|nintendo (switch )?online|nso|game ?pass|ps ?plus)\b/],
  ['cartao sd', /\b(micro ?sd|cartao sd|sd de \d+ ?gb|\+ ?sd|\d+ ?gb sd|com sd)\b/],
  ['controle extra', /\b([2-9]|dois|duas|tres) controles?\b|\bcontrole adicional\b|\bcom controle extra\b|\+ ?(um |1 )?(controle|dualsense|joy ?con)\b/],
  ['headset', /\b(headset|fone)\b/],
  ['camera', /\bcamera\b/],
];

function parseStorageGb(t: string): number | null {
  const tb = /\b(\d{1,2}(?:[.,]\d)?) ?(?:tb|tera)\b/.exec(t);
  if (tb) {
    const v = Math.round(parseFloat(tb[1].replace(',', '.')) * 1000);
    return v === 1024 ? 1000 : v;
  }
  const gb = /\b(\d{2,4}) ?gb\b/.exec(t);
  if (gb) {
    const v = Number(gb[1]);
    if (v === 500 || v === 512) return 512;
    if (v === 1024) return 1000;
    if (v === 2048) return 2000;
    return v;
  }
  return null;
}

function emptyIdentity(scope: ConsoleScope, reason: string, family: ConsoleFamily | null = null): ConsoleIdentity {
  return {
    scope, reason, family, model: 'nd', media: 'na', mediaSource: 'implicita', storageGb: null, edition: null, region: null,
    pack: false, packSignature: null, packReasons: [], condition: 'new', confidence: 'baixa', key: null, baseKey: null, unresolved: [],
  };
}

/** Lê a identidade de console a partir de UM título (de master ou de oferta). Não consulta banco. */
export interface ParseOptions {
  /** PS5 sem Slim/Pro/Fat no título: 'base' (padrão, igual ao dedup) ou 'nd' (não prova; identidade própria até o dono decidir). */
  ps5Unmarked?: 'base' | 'nd';
}

export function parseConsoleTitle(rawTitle: string, opts: ParseOptions = { ps5Unmarked: 'base' }): ConsoleIdentity {
  const title = rawTitle.replace(/\bp\.? ?s\.? ?5\b/gi, 'ps5').replace(/\bp\.? ?s\.? ?4\b/gi, 'ps4');
  const t = foldTitle(title);

  // 1) Família. Cross-family/ambíguo ('unknown') não entra.
  const plat = derivePlatformFromTitle(t);
  if (LEGACY_FAMILIES.has(plat)) return emptyIdentity('legacy', `fora de linha (${plat})`);
  const family = (['ps5', 'xbox_series', 'switch_1', 'switch_2'] as const).find((f) => f === plat) ?? null;
  if (!family) return emptyIdentity('not_console', 'família não identificada no título');

  // 2) É aparelho? Acessório/peça/jogo/portal ficam de fora (não são console).
  const denied = NOT_CONSOLE_DENY.exec(t);
  const noun = CONSOLE_NOUN.test(t);
  const modelWord = MODEL_WORD.test(t);
  if (titleLeadsWithAccessory(title)) return emptyIdentity('not_console', 'título começa por acessório', family);
  if (denied && !(noun && !/\b(portal|cooler|dissipador|hdmi|leitor|unidade|cabo|capa|case|base|suporte|bateria|chip|hwfly|picofly|dlxed|deluxe edition)\b/.test(denied[0]))) {
    return emptyIdentity('not_console', `acessório/peça/jogo (${denied[0]})`, family);
  }
  // PS5 e Xbox Series não são portáteis: "PS5 portátil" é gadget/clone, nunca o console (o Switch é "híbrido/portátil" de verdade).
  if ((family === 'ps5' || family === 'xbox_series') && /\bportatil\b/.test(t)) return emptyIdentity('not_console', 'PS5/Xbox "portátil" não é o console', family);
  if (!noun && !modelWord) return emptyIdentity('not_console', 'sem substantivo de aparelho nem modelo (provável jogo)', family);
  // Evidência POSITIVA de aparelho: o classificador de dimensão do catálogo vê console, ou o título abre com 'Console', ou é Switch com
  // modelo (o classificador erra 'Nintendo Switch Console NSHA...'). Sinal de jogo vence o resto ("Football Manager Console 2024").
  const evidence = titleHardwareKind(title) === 'console' || /^(console|videogame|video game)\b/.test(t) || /^(pacote|kit|bundle)\b.*\bconsole\b/.test(t) || (family.startsWith('switch') && /\b(lite|oled)\b/.test(t) && /\b\d+ ?gb\b/.test(t)) || (family.startsWith('switch') && /\bswitch( 2)? (lite|oled|v1|v2|console|\d+ ?gb)\b|\bnsha\d/.test(t));
  if (!evidence) return emptyIdentity('not_console', 'sem evidência positiva de aparelho (classificador do catálogo não vê console)', family);

  const n = normalizeTitle(title, { productType: 'console' });
  const markers = new Set(n.markers);

  // 3) Condição.
  let condition: ConsoleCondition = 'new';
  if (markers.has('openbox')) condition = 'open_box';
  else if (markers.has('usado') || markers.has('seminovo') || markers.has('loose')) condition = 'used';
  if (MODDED.test(t)) condition = condition === 'new' ? 'modded' : condition;

  // 4) Região.
  const regionMarker = ['japao', 'regiaousa', 'regiaoeur', 'regiaoasia', 'importado'].find((m) => markers.has(m)) ?? null;
  const region = regionMarker ?? (/\b(internacional|versao global|global version)\b/.test(t) ? 'importado' : null);

  // 5) Edição temática (removida do texto antes de procurar jogo no pacote).
  let edition: string | null = null;
  let tNoEdition = t;
  for (const [slug, re] of EDITIONS) {
    const m = re.exec(t);
    if (!m) continue;
    const themed = slug !== 'limitada' && slug !== 'wolverine' && slug !== 'aniversario_30' && slug !== 'halo_infinite' && slug !== 'diablo_iv';
    if (themed && !THEME_EDITION_CONTEXT.test(t) && !(family.startsWith('switch') && /\b(oled|lite)\b/.test(t) && slug === 'zelda')) continue;
    edition = slug;
    tNoEdition = t.replace(re, ' ');
    break;
  }
  // "Mario Kart 8 Deluxe" não é a edição Mario vermelha.
  if (edition === 'mario_vermelho' && /\bmario ?kart\b/.test(t)) edition = null;

  // 6) Pacote.
  const packReasons: string[] = [];
  for (const [slug, re] of PACK_CONTENT) if (re.test(tNoEdition)) packReasons.push(slug);
  // "com 1 controle"/"1 controle" é o controle da caixa; só 2+ conta (já no regex). "jogos" só conta como pacote.
  const bundleHeur = isBundleTitle(title) || /\+/.test(t) || /\b(pacote|bundle|kit|combo|lote)\b/.test(t);
  if (edition === 'limitada' && packReasons.length === 0 && !/\+|\bbundle\b|\bpacote\b/.test(t)) {
    // edição limitada pura
  }
  const pack = packReasons.length > 0 || (bundleHeur && !(edition && !/\+|\bbundle\b|\bpacote\b|\bkit\b|\bcombo\b/.test(t)));
  if (pack && packReasons.length === 0) packReasons.push('anuncio_de_pacote');
  // 'jogos' genérico some quando o título nomeia o jogo (Astro Bot + 2 jogos = Astro Bot).
  const named = packReasons.filter((r) => r !== 'jogos' && r !== 'anuncio_de_pacote');
  const sigParts = named.length ? named : packReasons;
  const packSignature = pack ? [...new Set(sigParts)].sort().join('+') : null;

  // 7) Modelo, mídia, armazenamento.
  const storageGb = parseStorageGb(t);
  const unresolved: string[] = [];
  let model = 'nd';
  let media: ConsoleIdentity['media'] = 'na';
  let mediaSource: ConsoleIdentity['mediaSource'] = 'implicita';
  const digital = /\b(digital|all digital|sem leitor|sem disco)\b/.test(t) && !/\b(leitor de disco|com leitor|com disco)\b/.test(t);
  const discWord = /\b(disco|disc|leitor|blu ?ray|standard|padrao|fisic[oa])\b/.test(t);

  if (family === 'ps5') {
    // Modelo explícito: Pro, Slim ou Fat/original. 'base' = PS5 original (o Fat). Sem marcador de modelo o dedup.ts já trata o
    // título como o PS5 "sem marcador" (slim/pro/fat são marcadores de hardware), então 'base' é a mesma regra, agora explícita.
    if (/\bpro\b/.test(t) || /\bcfi ?7\d{3}\b/.test(t) || storageGb === 2000) model = 'pro';
    else if (/\bslim\b/.test(t) || /\bcfi ?2\d{3}\b/.test(t)) model = 'slim';
    else if (/\bfat\b/.test(t) || /\bcfi ?1\d{3}\b/.test(t)) model = 'base';
    if (model === 'pro') {
      media = 'na';
    } else {
      media = digital ? 'digital' : 'disc';
      mediaSource = digital || discWord ? 'titulo' : 'presumida';
      if (model === 'nd') {
        // Inferência só quando fecha: 1 TB = Slim (o Fat nunca teve 1 TB).
        if (storageGb === 1000) { model = 'slim'; unresolved.push('Slim inferido do armazenamento de 1 TB (título não diz Slim)'); }
        else if (opts.ps5Unmarked === 'base') { model = 'base'; unresolved.push('sem marcador Slim/Pro/Fat: tratado como PS5 original, como o dedup'); }
      }
    }
    if (model === 'nd') unresolved.push('versão Fat/Slim não provada pelo título');
    if (mediaSource === 'presumida') unresolved.push('mídia presumida (sem a palavra digital/disco)');
  } else if (family === 'xbox_series') {
    const v = n.variant;
    if (v === 'series_s' || v === 'series_x') model = v;
    else if (/\bseries? s\b|\bxss\b/.test(t) && !/\bseries? x\b/.test(t)) model = 'series_s';
    else if (/\bseries? x\b|\bxsx\b/.test(t) && !/\bseries? s\b/.test(t)) model = 'series_x';
    if (model === 'series_x') {
      media = digital ? 'digital' : 'disc';
      mediaSource = digital || discWord ? 'titulo' : 'presumida';
      if (mediaSource === 'presumida') unresolved.push('mídia do Series X presumida (sem a palavra digital/disco)');
    } else {
      media = 'na'; // Series S é só digital: não é eixo
    }
    if (model === 'nd') unresolved.push('Series S ou X não provado pelo título');
    if (storageGb == null) unresolved.push('armazenamento não citado');
  } else if (family === 'switch_1') {
    model = /\boled\b/.test(t) ? 'oled' : /\blite\b/.test(t) ? 'lite' : 'standard';
  } else if (family === 'switch_2') {
    model = 'standard';
  }

  // 8) Chave. Edição define o produto: modelo/mídia/armazenamento não entram quando há edição limitada (PS5/Xbox) e,
  //    no Switch, o modelo continua (Lite x OLED têm edições próprias).
  const parts: string[] = [family];
  if (edition) {
    if (family.startsWith('switch')) parts.push(model);
    else parts.push('ed');
    parts.push(`ed:${edition}`);
  } else {
    parts.push(model, media);
    if (family === 'xbox_series') parts.push(storageGb != null ? `${storageGb}gb` : 'nd');
  }
  parts.push(region ?? 'br');
  const baseKey = parts.join('|');
  const key = pack ? `${baseKey}|pacote:${packSignature}` : `${baseKey}|avulso`;

  const confidence: ConsoleConfidence =
    unresolved.length === 0 ? 'alta' : unresolved.some((u) => u.includes('não prova')) ? 'baixa' : 'media';

  return {
    scope: 'in', reason: null, family, model, media, mediaSource, storageGb, edition, region, pack, packSignature, packReasons, condition,
    confidence, key, baseKey: `${baseKey}|avulso`, unresolved,
  };
}

/** Dois pacotes são o mesmo pacote? (assinatura de conteúdo igual; chave inteira igual). */
export function sameIdentityKey(a: ConsoleIdentity, b: ConsoleIdentity): boolean {
  return a.key != null && a.key === b.key;
}
