// Sem 'server-only': função pura (regex + tabelas), importável por queries do
// servidor, coletores, scripts tsx e testes.
import { avaliarConsoleVideoGame } from '@/lib/catalog/console-videogame';
import type { ProductType } from '@/db/schema';
import { classifyCatalogItem, foldTitle, type CatalogDimension } from '@/lib/catalog/dimensions';
import { titleIsLegacyPlatformOnly } from '@/lib/catalog/platform';
import { mentionsMultipleGenerations } from '@/lib/affiliate/game-classification';

/**
 * PORTEIRO DO CATÁLOGO (decisão do dono, 2026-11-02).
 *
 * "Só trabalho com itens originais. Só jogos, consoles e acessórios para os
 * games." Uma ÚNICA função pura decide, para cada master (e seus títulos de
 * oferta), um de três veredictos, sempre com motivo auditável:
 *
 *   approved  entra em vitrine, busca, monitorar, sitemap e indicadores;
 *   review    suspeito ou sem evidência positiva: INVISÍVEL ao público e fora
 *             de média/mediana até um humano aprovar (override `manual`);
 *   rejected  não original ou fora do escopo: invisível; só um humano reverte.
 *
 * Camadas (a primeira que dispara decide):
 *   1. override manual do dono (`manual: 'approved'`) vence TUDO, exceto
 *      não-original determinístico (cópia/pirata nunca é liberada por override);
 *   2. `classifyCatalogItem` (dimensions.ts): merch, peça, off-catalog, usado,
 *      clone de controle, console modificado, digital, DLC;
 *   3. léxico NÃO ORIGINAL (pirata, réplica, cópia, paralelo, ISO, destravado,
 *      "X mil jogos", clones de hardware, repro, cartucho "N em 1"...);
 *   4. léxico FORA DO ESCOPO (brinquedo, lego, mantinha, caderno, guia, deck...);
 *   5. evidência positiva: jogo precisa de plataforma OU formato físico;
 *   6. sinal auxiliar de preço (SÓ envia à revisão, nunca rejeita): mídia
 *      física de plataforma legada com mediana abaixo do piso.
 *
 * O preço NUNCA decide sozinho a rejeição (parecer do estatístico): a taxa de
 * erro dele é desconhecida e a cópia cara passaria. Aqui ele só prioriza fila.
 *
 * Este módulo é a fonte única: coleta/descoberta/cadastro (entrada) e vitrine,
 * busca, monitorar, sitemap, indicadores (saída) o consomem.
 */

export const GATE_VERSION = 1;

/** Piso (centavos) de mídia física NOVA de plataforma legada, abaixo do qual o master vai à revisão (decisão do dono pendente; recomendação do gamer-veterano: R$ 60-70). */
export const LEGACY_PHYSICAL_PRICE_FLOOR_CENTS = 6000;
/** Piso (centavos) para QUALQUER midia fisica NOVA de jogo, em qualquer plataforma (sinal auxiliar, so revisao). */
export const ANY_PHYSICAL_PRICE_FLOOR_CENTS = 3000;

export type GateVerdict = 'approved' | 'review' | 'rejected';
export type GateCategory =
  | 'ok'
  | 'not_original'
  | 'out_of_scope'
  | 'used'
  | 'unverified'
  | 'suspect_price'
  | 'owner_decision';

export interface GateInput {
  name: string;
  productType: ProductType;
  gameFormat?: string | null;
  /** game_platform_gen gravado ('unknown' = nunca identificada). */
  gamePlatformGen?: string | null;
  /** Títulos das ofertas ativas do master (o anúncio pode dizer mais que o master). */
  offerTitles?: string[];
  /** Mediana dos preços ativos do master, em centavos (só para o sinal auxiliar). */
  medianPriceCents?: number | null;
  /** Veredito humano gravado em attributes.catalogGate.manual. */
  manual?: GateVerdict | null;
}

export interface GateResult {
  verdict: GateVerdict;
  category: GateCategory;
  reason: string;
  matched: string | null;
  /** Dimensão efetiva (aba) quando aprovado/em revisão; hidden = fora da cartela. */
  dimension: CatalogDimension;
  bundle: boolean;
  version: number;
}

interface Rule {
  reason: string;
  re: RegExp;
}

function first(rules: Rule[], t: string): { reason: string; matched: string } | null {
  let best: { reason: string; matched: string; index: number } | null = null;
  for (const r of rules) {
    const m = r.re.exec(t);
    if (m && (best === null || m.index < best.index)) best = { reason: r.reason, matched: m[0], index: m.index };
  }
  return best ? { reason: best.reason, matched: best.matched } : null;
}

// ---------------------------------------------------------------------------
// 3. NÃO ORIGINAL — determinístico (texto já passa por foldTitle: sem acento)
// "original" NUNCA entra aqui nem libera nada: vendedor de cópia também escreve "original".
// ---------------------------------------------------------------------------
const NOT_ORIGINAL: Rule[] = [
  { reason: 'pirata_copia', re: /\bpirata\b|\bpirataria\b|\bpiratead\w*|\bcopias?\b|\bcopiad[oa]s?\b|\bbootleg\w*|\bfalsific\w*|\bfake\b|\bknock ?off\b|\bunlicensed\b|\bburned\b|\bnao original\b|\bnot original\b|\bno original\b|\bnon ?original\b/ },
  { reason: 'replica_1_1', re: /\breplicas?\b|\bprimeira linha\b|\btipo original\b|\bestilo original\b|\bsimilar ao original\b/ },
  { reason: 'paralelo', re: /\bparalel[oa]s?\b/ },
  { reason: 'midia_iso_gravada', re: /\biso\b|\bmidia gravada\b|\bgravad[oa]\b|\bcd ?r\b|\bdvd ?r\b|\bmidia (?:digital )?(?:em )?(?:dvd|cd)\b|\bdisco gravado\b|\bmidia ps2 (?:gravad|copia)/ },
  { reason: 'repro_cartucho', re: /\brepro\b|\brepro label\b|\breprodu(?:zid|cao de cartucho)\w*|\bcartucho (?:paralelo|reproduzido|repro)\b|\bmulti ?cartuchos?\b|\bmulti ?jogos\b/ },
  { reason: 'destravado_modificado', re: /\bdestravad\w*|\bdestrava\b|\bchipad\w*|\bmod ?chip\w*|\bmodificad[oa]s?\b|\bjailbreak\w*|\bjailbroken\b|\bcfw\b|\bopl\b|\brgh\b|\bhackead\w*|\bhackeado\b|\bdesbloq\w*|\bgold ?hen\b|\bliberad[oa] para jogos? (?:baixados|piratas)\b/ },
  { reason: 'milhares_de_jogos', re: /\b\d{1,3}(?: ?\d{3})? ?mil jogos?\b|\bmil jogos\b|\bjogos? (?:instalad\w+|baixad\w+|na memoria|dentro|pre ?instalad\w+|embutid\w+|inclusos)\b|(?<!xbox )(?<!x ?)\b(?!360\b)\d{3,5} jogos\b|\b\d{2,3} jogos? (?:clas+icos|retro|embutid\w+|inclusos|instalad\w+)\b/ },
  { reason: 'cartucho_n_em_1', re: /\b(?:cartuchos?|fitas?|jogos?|game|games|console|retro)\b.*\b\d{2,4} ?em ?1\b|\b\d{2,4} ?em ?1\b.*\b(?:cartuchos?|fitas?|jogos?|games?|retro)\b/ },
  { reason: 'clone_hardware', re: /\bgame ?stick\b|\bstick lite\b|\bpoly ?station\b|\bgame ?box\b|\bsuper game\b|\bfamiclone\b|\bfamily game\b|\btv game\b|\bmini game\b|\bretro (?:station|game|console|arcade)\b|\bconsole retro\b|\bvideo ?game retro\b|\bm8 (?:game|console|stick)\b|\b(?:gd10|y3 lite|x5 pro|x7 plus|data frog|sup (?:game|x))\b|\bemulador\b|\bmega ?drive (?:3 em 1|mini clone)\b|\bsuper ?nintendo clone\b|\b8 ?bits? hdmi\b|\b16 ?bits? hdmi\b/ },
  { reason: 'embalagem_sem_jogo', re: /\bcapas? (?:avulsas?|customizadas?|personalizadas?|impressas?|de reposicao)\b|\bsomente (?:a |o )?(?:capa|caixa|manual|encarte|case|label|etiqueta)\b|\bapenas (?:a |o )?(?:capa|caixa|manual|encarte|label)\b|\bso (?:a |o )?(?:capa|caixa|manual|encarte)\b|\bcapa e encarte\b|\bcaixa vazia\b/ },
];

// ---------------------------------------------------------------------------
// 4. FORA DO ESCOPO — acrescenta ao que classifyCatalogItem já cobre
// ---------------------------------------------------------------------------
/** Brinquedo ambíguo: "Lego Star Wars" / "Hot Wheels" / tabuleiro são NOMES de videogames legítimos quando há plataforma de console ou "videogame". */
const TOY_SOFT = /\blegos?\b|\bhot wheels\b|\btabuleiro\b|\bmonopoly\b|\bbanco imobiliario\b/;
const STRICT_PLATFORM = /\b(?:ps ?[1-5]|psp|vita|playstation|x ?box|x ?360|xone|switch|wii|wii ?u|3ds|2ds|gamecube|n64|nsw2?|steam|pc)\b/;

const OUT_OF_SCOPE: Rule[] = [
  { reason: 'brinquedo', re: /\bbrinquedos?\b|\blegos? \d{4,6}\b|\bplayset\b|\bblocos? de montar\b|\bbloquinhos?\b|\bjakks\b|\bnerf\b|\bcarrinhos?\b|\bbonecas?\b|\bplaymobil\b|\bmega bloks?\b|\bjogo educativ\w*|\bjogo pedagogic\w*|\bjogo da memoria\b|\bdomino\b|\bxadrez\b|\bjogo de (?:cartas|dados|mesa|construcao|montar)\b|\bioio\b|\byoyo\b|\byo ?yo\b|\bboliche\b|\bflowpack\b|\btoys?\b|\bjuguetes?\b|\bpiao\b|\bpelucia\b|\bpeluche\b/ },
  { reason: 'enxoval_casa', re: /\bmantinhas?\b|\bmantas?\b|\bbaldes?\b|\benxoval\b|\blencol\b|\bfronha\b|\bedredom\b|\bcolcha\b|\btravesseiro\b|\bcortina\b|\bbebe\b|\bpijama\b|\blancheira\b|\bguarda ?chuva\b|\bjogo (?:de|da) (?:cama|toalha|banho|panelas?|xicaras?|copos?|talheres?|mesa|quarto|sala|facas?|louca|pratos?)\b|\bporta ?retrato\b|\bporta ?lapis\b|\bporta ?treco\b|\bporta ?chaves?\b|\bcofre\b|\bcealeira\b/ },
  { reason: 'papelaria', re: /\bcadernos?\b|\bbrochur\w+|\bagenda\b|\btilibra\b|\bjandaia\b|\bfolhas pautadas\b|\b\d+ ?fls\b|\bfls\b|\bsketchbook\b|\bplanner\b|\bbloco de notas\b|\bcaneta\b|\blapis\b|\bborracha escolar\b|\bestojo escolar\b|\bmarca ?texto\b|\bmochila\b|\blanyard\b|\bcuaderno\b/ },
  { reason: 'colecionavel_nao_jogo', re: /\bneca\b|\btotaku\b|\brevoltech\b|\bbanpresto\b|\bq ?posket\b|\bnendoroid\b|\bhot toys\b|\bfigma\b|\bsh ?figuarts\b|\bfunko\b|\bpop!? vinyl\b|\bkotobukiya\b|\bgood smile\b|\bstorm collectibles\b|\bjada toys\b|\bfandombox\b|\bmcfarlane\b|\bprime ?1\b|\bsideshow\b|\bkidrobot\b|\bgashapon\b|\bchibi\b|\bpelicula(?! protetora)\b.*\bcolecion/ },
  { reason: 'guia_livro', re: /\bultimania\b|\bguidebooks?\b|\bguide ?books?\b|\bguia (?:oficial|de jogo|completo|definitivo)\b|\bofficial guide\b|\bmaterial collection\b|\bcharacter making\b|\bsuperposter\b|\bsuper poster\b|\beditora europa\b|\bpanini\b|\bmanga\b|\bquadrinhos\b|\bcomic\b|\bsoundtrack\b|\btrilha sonora\b|\bvinil\b/ },
  { reason: 'tcg_deck', re: /(?<!steam )\bdeck\b|\bmagic the gathering\b|\bmagic\b.*\b(?:commander|deck|booster|carta)s?\b|\byu ?gi ?oh\b|\bcommander deck\b|\bpokemon tcg\b|\bcartas? avulsas?\b|\bcard singles?\b/ },
  { reason: 'vestuario_moto', re: /\bcapacetes?\b|\bjaqueta\b|\bluvas?\b|\bbotas?\b|\bcamisetas?\b|\bcasaco\b|\bmoletom\b|\bcalcas?\b|\bbermuda\b|\bbolsa (?:feminina|masculina|esportiva)\b|\bcapa de (?:celular|iphone|galaxy|chuva)\b|\bmotociclista\b/ },
  { reason: 'decoracao_festa', re: /\btopo de bolo\b|\bkit festa\b|\bad?\w*desivos?\b|\bstickers?\b|\bdecoracao de festa\b|\bconvite\b|\bpainel (?:de festa|decorativo)\b|\bbalao\b|\bgarrafa termica\b|\bmarmita\b|\bcaixa organizadora\b|\bplacas? de parede\b/ },
  { reason: 'medida_figura', re: /\b\d{1,3} ?cm\b(?!.*\b(?:cabo|fonte|cartao|sd)\b)/ },
  { reason: 'peca_interna', re: /\b(?:ventoinha interna|cooler interno|pasta termica|lente laser|porta hdmi|soquete|flat cable|placa mae|motherboard)\b/ },
  { reason: 'ferramenta_arma', re: /\bfacas? (?:tatica|de (?:cozinha|caca|sobrevivencia|camping))\b|\bka ?bar\b|\bcanivete\b|\bmachado\b|\bespada (?:de |em )?(?:madeira|plastico|espuma)\b|\bpistola de brinquedo\b/ },
];

// ---------------------------------------------------------------------------
// Revisão por julgamento (nunca rejeição automática)
// ---------------------------------------------------------------------------
/**
 * Fabricantes conhecidos de acessório de game (decisão 4/5 do dono, adotada por delegação em 2026-11-03).
 * NÃO inclui Sony/Microsoft/Nintendo: esses nomes também são plataforma e provariam "marca" para qualquer
 * porta-cartão com "Nintendo Switch" no título.
 */
const ACCESSORY_MAKER = /\b(?:redragon|havit|logitech|corsair|thrustmaster|hyperx|razer|steelseries|8bitdo|powera|hori|turtle beach|astro gaming|jbl|anker|elgato|sandisk|kingston|hyperkin|nacon|pdp|snakebyte|gamesir|ipega|dobe|bigben|orzly|case logic|dreamgear|brook|scuf|nyko)\b/;
/** Marca oficial/licenciadora, aceita como "marca legítima" só no caso de acessório SEM plataforma (decisão 4). */
const OFFICIAL_BRAND = /\b(?:sony|microsoft|nintendo)\b/;

/** Hardware de emulação de marca (Anbernic, Retroid...): FORA do escopo (decisão 5 do dono, adotada por delegação em 2026-11-03, reversível). */
const EMULATION_BRANDS = /\banbernic\b|\bretroid\b|\bpowkiddy\b|\bmiyoo\b|\bretro ?fun\b|\bstation\b.*\bretro\b|\bretro\b.*\b(?:portatil|handheld)\b|\bhandheld\b.*\bretro\b/;
/** Estojo/porta de cartões e jogos: acessório de armazenamento SE tiver plataforma; marca "Mario" decorativa não prova original. */
const PORTA_CARTAO = /\bporta ?(?:cartao|cartoes|cartucho|cartuchos|jogos?)\b|\bestojo (?:para |de )?(?:cartuchos?|cartoes|jogos)\b|\borganizador de (?:cartuchos?|jogos|cartoes)\b/;
const TECTOY_CLONE = /\btectoy\b.*\b(?:3 em 1|mega drive|master system)\b|\bmaster system\b.*\b(?:\d+ jogos?|hdmi)\b|\bmega drive\b.*\b(?:hdmi|\d+ jogos?|wireless)\b/;

const PLATFORM_EVIDENCE =
  /\b(?:ps ?[1-5]|psp|vita|playstation|x ?box|x ?360|xone|switch|nintendo|wii|wii ?u|3ds|2ds|ds|gamecube|n64|snes|nes|game ?boy|gba|sega|mega ?drive|master system|atari|dreamcast|saturn|pc|steam|epic|nsw2?)\b/;
const PHYSICAL_EVIDENCE = /\bfisic[oa]\b|\bmidia fisica\b|\bblu ?ray\b|\bcartucho\b|\bdisco\b|\blacrad[oa]\b|\bformato fisico\b/;
/** Plataformas legadas (PS2 e anteriores, portáteis antigos) cujo jogo NOVO original tem piso de preço. */
const LEGACY_PLATFORM = /\b(?:ps ?[12]|psone|playstation ?[12]|psp|wii|gamecube|game ?cube|n64|nintendo 64|snes|super nintendo|nes|game ?boy|gba|mega ?drive|master system|dreamcast|saturn|atari|(?:nintendo )?ds|3ds)\b/;

/**
 * Console RETRÔ (decisão do dono, 2026-11-03): o monitoramento de preço de mercado trabalha só com itens NOVOS;
 * retrô fica para drops e leilões. Gerações antigas (PS1 a PS3, PSP/Vita, Xbox clássico/360, Wii/Wii U, DS/3DS,
 * GameCube, N64, SNES/NES, Game Boy, Sega, Atari). PS4/Xbox One/Switch seguem no escopo (ainda vendidos novos).
 * Vale só para a dimensão console e para o nome do master; título que cita geração atual (bundle, "compatível") não rejeita.
 */
const RETRO_CONSOLE =
  /\b(?:ps ?[123]|psone|playstation ?[123]|playstation (?:fat|portatil|classic)|psp|ps vita|playstation vita|xbox one(?: [sx])?|xbox 360|x ?360|xbox classic|xbox original|wii u|wii|gamecube|game ?cube|n64|nintendo 64|snes|super nintendo|nintendo nes|nes classic|game ?boy|gba|nintendo ds|ds lite|dsi|3ds|2ds|mega ?drive|master system|dreamcast|saturn|atari)\b/;
export const RETRO_GAME_PLATFORM = /\b(?:ps ?[123]|psone|playstation ?[123]|psp|ps vita|playstation vita|xbox one(?: [sx])?|xbox 360|x ?360|xbox classic|xbox original|wii u|wii|gamecube|game ?cube|n64|nintendo 64|snes|super nintendo|game ?boy|gba|nintendo ds|nds|dsi|3ds|2ds|mega ?drive|master system|dreamcast)\b/;
export const MODERN_CONSOLE = /\b(?:ps ?[45]|playstation ?[45]|xbox series|series [sx]|switch)\b/;

/**
 * EXCEÇÃO (dono, 2026-11-12): hardware de ESTILO retrô fabricado e vendido NOVO hoje por marca que o faz (Hyperkin, Analogue, Retro-Bit, 8BitDo)
 * entra no monitoramento (caso: Hyperkin SupaBoy). Continua fora: usado, seminovo, recondicionado, open box, lote, fora de linha, mídia/console
 * antigo de segunda mão e qualquer marca fora desta lista. Título já dobrado (minúsculas, sem acento).
 */
const NEW_RETRO_MAKER = /\b(?:hyperkin|analogue|retro ?-?bit|8 ?-?bitdo)\b/;
const NOT_NEW_WORDS = /\b(?:usad[oa]s?|seminov[oa]s?|recondicionad[oa]s?|renewed|refurbished|open ?box|reembalad[oa]s?|lote|pecas?|sucata|defeito|vintage)\b/;
export function isNewRetroStyleHardware(foldedTitle: string): boolean {
  return NEW_RETRO_MAKER.test(foldedTitle) && !NOT_NEW_WORDS.test(foldedTitle);
}

/**
 * Plataforma retrô ou fora de linha citada no TEXTO (título de anúncio já em minúsculas, sem acento). Título que cita também
 * PS5/PS4/Series X|S/Switch segue moderno. Reutilizado pela coleta da Amazon (dono, 2026-11-11: só produto novo e em linha).
 */
export function mentionsRetroPlatformOnly(foldedTitle: string): string | null {
  if (isNewRetroStyleHardware(foldedTitle)) return null;
  const rg = RETRO_GAME_PLATFORM.exec(foldedTitle) ?? RETRO_CONSOLE.exec(foldedTitle);
  return rg && !MODERN_CONSOLE.test(foldedTitle) ? rg[0] : null;
}

const RAW_ONE_TO_ONE = /(?<![\d:])1\s*:\s*1(?![\d:])/;
/** "Genérico/sem marca": imitação em console/jogo é rejeição; em acessório (cabo, case) vai à revisão (genérico não é cópia por si). */
/** Escala de boneco/estátua (1/12, 1/6, 1:7, "One:12") no texto CRU: o fold apaga a pontuação. "1/12 meses"/"12x" não contam. */
const RAW_SCALE = /(?<![\d.,/])1\s*[/:]\s*(?:4|6|7|8|9|10|12|18)(?![\dx.,]|\s*(?:meses|parcelas|x\b))|\bone[:\s-]*12\b/i;
const SCALE_FIGURE_BRAND = /\bmezco\b|\bhiya toys\b|\bthreezero\b|\bmedicom\b|\bbearbricks?\b|\bs ?h ?figuarts\b|\bfigma\b|\bfiguma\b|\bmafex\b|\bestatuetas?\b|\bstatues?\b|\baction figures?\b/;
const GENERIC_BRAND = /\bgenerico\b|\bgenerica\b|\bsem marca\b/;

const HARDWARE_HINT = /\bfonte (?:dc|ac|de energia|bivolt)\b|\bgrip\b|\bempunhadura\b|\bcabo\b|\bcarregador\b|\badaptador\b|\bsuporte\b|\bbateria\b/;
/** Headset/fone gamer (substantivo principal). */
const HEADSET_NOUN = /\bheadsets?\b|\bheadphones?\b|\bfones? (?:de ouvido )?gamer\b|\bfones?\b/;
const GOOD_PLATFORM_GEN =(g?: string | null) => !!g && g !== 'unknown';

function result(
  verdict: GateVerdict,
  category: GateCategory,
  reason: string,
  matched: string | null,
  dimension: CatalogDimension,
  bundle: boolean,
): GateResult {
  return { verdict, category, reason, matched, dimension, bundle, version: GATE_VERSION };
}

const NOT_ORIGINAL_CLASSIFIER_REASONS = /^(?:clone_|console_modificado|desbloqueio|jogos_a_escolha)/;

/** Veredito do porteiro. Pura: mesma entrada, mesma saída. */
export function evaluateCatalogGate(input: GateInput): GateResult {
  const name = input.name ?? '';
  const t = foldTitle(name);
  const offerFolded = (input.offerTitles ?? []).map(foldTitle).filter(Boolean);
  const haystacks = [t, ...offerFolded];

  // Não original (determinístico) nunca é liberado por override manual.
  // "1:1" (réplica fiel) precisa do texto cru: o fold apaga a pontuação.
  const raw11 = [name, ...(input.offerTitles ?? [])].find((x) => RAW_ONE_TO_ONE.test(x));
  if (raw11) return result('rejected', 'not_original', 'replica_1_1', '1:1', 'off_catalog', false);
  for (const h of haystacks) {
    const no = first(NOT_ORIGINAL, h);
    if (no) return result('rejected', 'not_original', no.reason, no.matched, 'off_catalog', false);
  }

  const base = classifyCatalogItem(name, input.productType, input.gameFormat ?? null);
  const baseDim = base.dimension;
  const bundle = !!base.bundle;

  if (input.manual === 'approved') {
    return result('approved', 'ok', 'aprovado_manualmente', null, baseDim, bundle);
  }
  if (input.manual === 'rejected') {
    return result('rejected', 'owner_decision', 'rejeitado_manualmente', null, baseDim, bundle);
  }

  // Console retrô: fora do monitoramento de novos (drops e leilões). Reversível: override manual 'approved' passa acima.
  if (baseDim === 'console') {
    // Regra única de console (dono, 2026-11-13): Xbox One/360, PS1-3, emulador e equivalentes fora de linha não são console do site.
    const fl = avaliarConsoleVideoGame(name);
    if (fl.veredito === 'nao' && fl.forte && fl.motivo === 'retro_ou_fora_de_linha') return result('rejected', 'out_of_scope', 'console_fora_de_linha', fl.termo, 'off_catalog', false);
    const retro = RETRO_CONSOLE.exec(t);
    if (retro && !MODERN_CONSOLE.test(t) && !isNewRetroStyleHardware(t)) return result('rejected', 'out_of_scope', 'console_retro_fora_do_escopo', retro[0], 'off_catalog', false);
  }

  // Jogo de plataforma retrô (PS1-PS3, PSP/Vita, Xbox 360 e anteriores, Wii, DS/3DS, GameCube...): fora do monitoramento (dono, 2026-11-04).
  if (baseDim === 'game') {
    const rg = RETRO_GAME_PLATFORM.exec(t);
    if (rg && !MODERN_CONSOLE.test(t) && !isNewRetroStyleHardware(t)) return result('rejected', 'out_of_scope', 'jogo_plataforma_retro_fora_do_escopo', rg[0], 'off_catalog', false);
  }

  // Decisão 4 do dono (2026-11-03): headset legítimo sem plataforma no título (Redragon, Havit,
  // Logitech G335...) não é rejeição; vai à REVISÃO para um humano conferir. Só vale quando nenhuma
  // regra de não original / fora do escopo dispara no título do master ou das ofertas.
  if (base.reason === 'acessorio_sem_plataforma' && HEADSET_NOUN.test(t)) {
    const blocked = haystacks.some((h) => first(OUT_OF_SCOPE, h) || first(NOT_ORIGINAL, h) || GENERIC_BRAND.test(h));
    if (!blocked) return result('review', 'owner_decision', 'headset_sem_plataforma', 'headset', 'accessory', bundle);
  }
  // Decisão 4 generalizada (delegação 2026-11-03): qualquer acessório de MARCA LEGÍTIMA conhecida sem plataforma no
  // título vai à REVISÃO (não rejeita). Marca desconhecida continua rejeitada pela regra de dimensão.
  if (base.reason === 'acessorio_sem_plataforma') {
    const brand = ACCESSORY_MAKER.exec(t) ?? OFFICIAL_BRAND.exec(t);
    const blocked = haystacks.some((h) => first(OUT_OF_SCOPE, h) || first(NOT_ORIGINAL, h) || GENERIC_BRAND.test(h));
    if (brand && !blocked) return result('review', 'owner_decision', 'acessorio_marca_sem_plataforma', brand[0], 'accessory', bundle);
  }

  // 2. Regras de dimensão já existentes (merch, peça, off-catalog, usado, clone de controle...)
  if (baseDim !== 'game' && baseDim !== 'console' && baseDim !== 'accessory') {
    const cat: GateCategory =
      base.reason === 'usado'
        ? 'used'
        : base.reason && NOT_ORIGINAL_CLASSIFIER_REASONS.test(base.reason)
          ? 'not_original'
          : 'out_of_scope';
    return result('rejected', cat, base.reason ?? 'fora_da_cartela', base.matched, baseDim, bundle);
  }

  // Boneco/estátua colecionável por escala ou marca (Pyramid Head 1/12 Mezco One:12): não é jogo nem acessório
  const scaleRaw = [name, ...(input.offerTitles ?? [])].map((x) => RAW_SCALE.exec(x)).find(Boolean);
  if (scaleRaw) return result('rejected', 'out_of_scope', 'colecionavel_escala', scaleRaw[0], 'off_catalog', false);
  for (const h of haystacks) {
    const fg = SCALE_FIGURE_BRAND.exec(h);
    if (fg) return result('rejected', 'out_of_scope', 'colecionavel_marca_figura', fg[0], 'off_catalog', false);
  }

  // Acessório cujo título só cita plataforma LEGADA (Memory Card PS2): plataforma conhecida fora do enum,
  // fora do escopo atual; decisão 4 do dono (acessório sem plataforma conhecida) manda para REVISÃO (invisível).
  if (baseDim === 'accessory' && titleIsLegacyPlatformOnly(name)) {
    return result('review', 'owner_decision', 'acessorio_plataforma_legada', null, 'accessory', bundle);
  }

  // 4. Fora do escopo (títulos do master e das ofertas)
  for (const h of haystacks) {
    const oos = first(OUT_OF_SCOPE, h);
    if (oos) return result('rejected', 'out_of_scope', oos.reason, oos.matched, 'off_catalog', false);
  }

  for (const h of haystacks) {
    const toy = TOY_SOFT.exec(h);
    if (toy && !STRICT_PLATFORM.test(h) && !/\bvideo ?game\b/.test(h)) {
      return result('rejected', 'out_of_scope', 'brinquedo', toy[0], 'off_catalog', false);
    }
  }

  let dimension: CatalogDimension = baseDim;
  const mentionsPlatform = haystacks.some((h) => PLATFORM_EVIDENCE.test(h));

  for (const h of haystacks) {
    const g = GENERIC_BRAND.exec(h);
    if (g) {
      return dimension === 'accessory'
        ? result('review', 'owner_decision', 'acessorio_generico_sem_marca', g[0], dimension, bundle)
        : result('rejected', 'not_original', 'generico_sem_marca', g[0], 'off_catalog', false);
    }
  }

  // Hardware de emulação de marca e clones Tectoy: julgamento do dono
  for (const h of haystacks) {
    const emu = isNewRetroStyleHardware(h) ? null : EMULATION_BRANDS.exec(h);
    if (emu) return result('rejected', 'out_of_scope', 'hardware_emulacao_marca', emu[0], 'off_catalog', false);
    const em = TECTOY_CLONE.exec(h);
    if (em) return result('review', 'owner_decision', 'hardware_emulacao_ou_clone_tectoy', em[0], dimension, bundle);
  }

  // Porta-cartão/estojo de jogos: acessório de armazenamento, só com plataforma
  for (const h of haystacks) {
    const pc = PORTA_CARTAO.exec(h);
    if (pc) {
      if (!mentionsPlatform) return result('rejected', 'out_of_scope', 'porta_cartao_sem_plataforma', pc[0], 'off_catalog', false);
      // Decisão 5 (delegação 2026-11-03): com plataforma E fabricante de acessório conhecido = aceita; só plataforma = revisão.
      const maker = haystacks.map((x) => ACCESSORY_MAKER.exec(x)).find(Boolean);
      if (maker) return result('approved', 'ok', 'porta_cartao_marca_e_plataforma', maker[0], 'accessory', false);
      return result('review', 'owner_decision', 'porta_cartao_organizador', pc[0], 'accessory', false);
    }
  }

  // Jogo com cara de acessorio (fonte, grip, cabo...): tipo gravado no banco duvidoso
  if (dimension === 'game') {
    const hw = haystacks.map((h) => HARDWARE_HINT.exec(h)).find(Boolean);
    if (hw) return result('review', 'unverified', 'jogo_com_cara_de_acessorio', hw[0], dimension, bundle);
  }

  // 5. Evidência positiva: jogo precisa de plataforma OU formato físico estruturado/no título
  if (dimension === 'game') {
    const hasPlatform = mentionsPlatform || GOOD_PLATFORM_GEN(input.gamePlatformGen);
    const hasPhysical = String(input.gameFormat ?? '').toLowerCase() === 'physical' || haystacks.some((h) => PHYSICAL_EVIDENCE.test(h));
    if (!hasPlatform && !hasPhysical) {
      return result('review', 'unverified', 'jogo_sem_plataforma_nem_formato_fisico', null, dimension, bundle);
    }
  }

  // 6. Sinal auxiliar de preço (SÓ revisão): mídia física NOVA de plataforma legada abaixo do piso
  if (
    dimension === 'game' &&
    input.medianPriceCents != null &&
    input.medianPriceCents > 0 &&
    String(input.gameFormat ?? '').toLowerCase() !== 'digital' &&
    (input.medianPriceCents < ANY_PHYSICAL_PRICE_FLOOR_CENTS ||
      (input.medianPriceCents < LEGACY_PHYSICAL_PRICE_FLOOR_CENTS && haystacks.some((h) => LEGACY_PLATFORM.test(h))))
  ) {
    return result('review', 'suspect_price', 'fisico_abaixo_do_piso', `mediana ${input.medianPriceCents}c`, dimension, bundle);
  }

  return result('approved', 'ok', 'sem_sinal_de_risco', null, dimension, bundle);
}

/** true = aparece em vitrine/busca/indicadores. */
export function isGateApproved(r: GateResult): boolean {
  return r.verdict === 'approved';
}

/** Valor gravado em master_products.attributes.catalogGate (sem dado volátil). */
export interface PersistedGate {
  verdict: GateVerdict;
  category: GateCategory;
  reason: string;
  matched: string | null;
  version: number;
  at: string;
  /** Decisão humana; vence o automático (exceto não-original determinístico). */
  manual?: GateVerdict;
}

export function toPersistedGate(r: GateResult, at: string, manual?: GateVerdict | null): PersistedGate {
  const out: PersistedGate = { verdict: r.verdict, category: r.category, reason: r.reason, matched: r.matched, version: r.version, at };
  if (manual) out.manual = manual;
  return out;
}

// ---------------------------------------------------------------------------
// PONTOS DE ENTRADA (coleta, descoberta, cadastro manual)
// ---------------------------------------------------------------------------

/**
 * true = o título é rejeitado de cara (não original / fora do escopo / usado /
 * digital): NÃO cadastrar master nem oferta. 'review' NÃO bloqueia aqui: o
 * master é criado com veredito 'review' gravado (invisível ao público).
 */
export function isRejectedByGate(title: string, productType: ProductType = 'game'): boolean {
  return evaluateCatalogGate({ name: title, productType }).verdict === 'rejected';
}

/**
 * `attributes` inicial de um master novo: vazio quando aprovado; com
 * `catalogGate` quando o porteiro manda para revisão (a camada SQL dos
 * indicadores e da vitrine já o esconde desde o primeiro segundo).
 */
export function entryGateAttributes(
  title: string,
  productType: ProductType = 'game',
  extra: Partial<GateInput> = {},
): Record<string, unknown> {
  const r = evaluateCatalogGate({ name: title, productType, ...extra });
  if (r.verdict === 'approved' && productType === 'game' && mentionsMultipleGenerations(title)) {
    // Decisão do dono (2026-11-03): jogo que cita duas gerações (PS4/PS5, Xbox One/Series) sem deixar claro o
    // disco nasce "em revisão" e não entra na média de nenhuma geração até ser conferido (um produto por geração).
    const review: GateResult = { ...r, verdict: 'review', category: 'unverified', reason: 'geracao_ambigua', matched: 'cross-gen' };
    return { catalogGate: toPersistedGate(review, new Date().toISOString()) };
  }
  return r.verdict === 'approved' ? {} : { catalogGate: toPersistedGate(r, new Date().toISOString()) };
}
