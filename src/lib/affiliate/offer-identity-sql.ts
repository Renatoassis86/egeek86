// Sem 'server-only' nem banco: só fragmentos de SQL (drizzle `sql`), importável por queries e scripts de dry-run.
import { sql, type SQL } from 'drizzle-orm';

/**
 * Espelho em SQL de `offerTitleFlags` (offer-identity.ts) sobre `affiliate_offers.title`:
 * condição (Open Box, usado, seminovo, recondicionado, vitrine, loose; "revisado" só em hardware)
 * e cross-gen de JOGO. Aproximação deliberada com regex do Postgres: o título chega com acento
 * (`[aã]`, `[eé]`), enquanto a função TS dobra os acentos antes. A paridade com a função TS é
 * medida pelo dry-run da etapa 1 (ADR 0006).
 */
const OFFER_CONDITION_RE = String.raw`(open[ -]?box|\yusad[oa]s?\y|seminov[oa]s?|recondicionad[oa]s?|refurbished|pre[ -]?(?:owned|played)|second[ -]?hand|\yused\y(?! cars?\y)|segunda m[aã]o|\yvitrine\y|mostru[aá]rio|\yloose\y|defeito|sucata|retirada de pe[cç]as|quebrad[oa]|n[aã]o liga|conserto|desbloquead[oa])`;
const OFFER_HARDWARE_USED_RE = String.raw`\yrevisad[oa]s?\y`;
const OFFER_CROSSGEN_PS = [String.raw`(\yps ?4\y|playstation ?4\y)`, String.raw`(\yps ?5\y|playstation ?5\y)`];
const OFFER_CROSSGEN_XBOX = [
  String.raw`(xbox ?one|\yxone\y|\yxb1\y)`,
  String.raw`(xbox ?series|xbox ?s[eé]rie\y|\ys[eé]ries? [xs]\y|\yxsx\y|\yone ?([/|,&+-]| e | and | ou ) ?(xbox ?)?s[eé]rie)`,
  String.raw`(xbox ?360|\yx360\y)`,
];
// FORMATO físico x digital (decisão do dono, 2026-11-03): espelho de `deriveGameFormat` (game-classification.ts).
const OFFER_DIGITAL_RE = String.raw`((?<!polyphony |bluepoint |sucker |bad )\ydigital\y(?! devil| eclipse| extremes| foundry| dreams)|\ydigitais\y|\ypsn\y|\ye-? ?shop\y|\ydownload\y|\ybaixar\y|chave de ativa[cç][aã]o|gift ?card|cart[aã]o presente|\ylicen[cç]a\y|envio (?:por|via) e-?mail|xbox live)`;
const OFFER_DIGITAL_BONUS_RE = String.raw`((b[oô]nus|brinde|dlc|extras?|itens?|conte[uú]dos?|pre[ -]?(?:order|venda)).{0,25}digit|digit[a-z]*.{0,12}(b[oô]nus|brinde|dlc|extra|resgate))`;
const OFFER_PHYSICAL_RE = String.raw`(\yf[ií]sic[oa]s?\y|\yphysical\y|blu[ -]?ray|\ycartucho\y|\ydisco\y(?! elysium)|steel ?book|\ylacrad[oa]s?\y|cd[ -]?rom)`;
const OFFER_COMPAT_RE = String.raw`compat[ií]vel|retrocompat|roda n[oa]\y|jog[aá]vel|funciona n[oa]\y`;

/**
 * `titleCol` = título da oferta; `masterTypeCol` = product_type do master (cross-gen só vale para jogo).
 * `lowerTitle` = expressão que devolve o título JÁ em minúsculas (calculada uma vez por linha pelo chamador):
 * ILIKE e `~*` dobram caixa caractere a caractere e custavam ~365 ms por consulta sobre ~17,6 mil títulos.
 */
export function offerExcludedTitleSql(lowerTitle: string, masterTypeCol: string, masterFormatCol?: string): SQL {
  const t = sql.raw(lowerTitle.replace(/[^a-z0-9_.]/gi, ''));
  const type = sql.raw(masterTypeCol.replace(/[^a-z0-9_.]/gi, ''));
  const isGameCol = sql`${type}::text = 'game'`;
  const lit = (re: string) => sql.raw(`'${re.replace(/'/g, "''")}'`);
  const has = (re: string) => sql`${t} ~ ${lit(re)}`;
  const like = (pattern: string) => sql`${t} LIKE ${lit(pattern)}`;
  // O CASE força o pré-filtro barato (LIKE) a rodar antes: a regex só roda nos poucos títulos que passam.
  const pre = sql`${t} LIKE ANY (ARRAY['%open%box%','%usad%','%seminov%','%recondicion%','%refurb%','%owned%','%played%','%second%hand%','%used%','%segunda m%','%vitrine%','%mostru%','%loose%','%defeito%','%sucata%','%pe_as%','%quebrad%','%liga%','%conserto%','%desbloquead%'])`;
  const crossPre = sql`((${like('%ps%4%')} AND ${like('%ps%5%')}) OR ${like('%xbox%')} OR ${like('%xone%')} OR ${like('%switch%2%')})`;
  // FORMATO (jogo): master sem formato provado fica fora; título que prova o formato OPOSTO ao do master também.
  // `masterFormatCol` = master_products.game_format. Sem a coluna (chamadores antigos) esta camada não age.
  let formatClause = sql`false`;
  if (masterFormatCol) {
    const fmt = sql.raw(masterFormatCol.replace(/[^a-z0-9_.]/gi, ''));
    const digitalPre = sql`(${like('%digit%')} OR ${like('%psn%')} OR ${like('%shop%')} OR ${like('%download%')} OR ${like('%baixar%')} OR ${like('%chave%')} OR ${like('%gift%')} OR ${like('%cart_o presente%')} OR ${like('%licen%')} OR ${like('%mail%')} OR ${like('%xbox live%')})`;
    const physicalPre = sql`(${like('%sic%')} OR ${like('%physical%')} OR ${like('%ray%')} OR ${like('%cartucho%')} OR ${like('%disco%')} OR ${like('%steel%')} OR ${like('%lacrad%')} OR ${like('%rom%')})`;
    const titleDigital = sql`(CASE WHEN ${digitalPre} THEN (${has(OFFER_DIGITAL_RE)} AND NOT ${has(OFFER_DIGITAL_BONUS_RE)}) ELSE false END)`;
    const titlePhysical = sql`(CASE WHEN ${physicalPre} THEN ${has(OFFER_PHYSICAL_RE)} ELSE false END)`;
    // Master tipado 'game' com título de console/acessório (tipo errado no cadastro): formato não se aplica.
    const hardwareTitle = has(String.raw`(^|[^a-z])(console|controle|headset|joystick|dualsense|dualshock|volante)([^a-z]|$)`);
    formatClause = sql`(${isGameCol} AND NOT ${hardwareTitle} AND (
      ${fmt}::text = 'unknown'
      OR (${fmt}::text = 'physical' AND ${titleDigital} AND NOT ${titlePhysical})
      OR (${fmt}::text = 'digital' AND ${titlePhysical} AND NOT ${titleDigital})
    ))`;
  }
  return sql`(
    ${formatClause}
    OR CASE WHEN ${pre} THEN ${has(OFFER_CONDITION_RE)} ELSE false END
    OR (NOT ${isGameCol} AND CASE WHEN ${like('%revisad%')} THEN ${has(OFFER_HARDWARE_USED_RE)} ELSE false END)
    OR (${isGameCol} AND CASE WHEN ${crossPre} THEN (NOT ${has(OFFER_COMPAT_RE)} AND (
      (${has(OFFER_CROSSGEN_PS[0])} AND ${has(OFFER_CROSSGEN_PS[1])})
      OR (${has(OFFER_CROSSGEN_XBOX[0])} AND ${has(OFFER_CROSSGEN_XBOX[1])})
      OR (${has(OFFER_CROSSGEN_XBOX[2])} AND (${has(OFFER_CROSSGEN_XBOX[0])} OR ${has(OFFER_CROSSGEN_XBOX[1])}))
      OR (${has(String.raw`switch ?2\y`)} AND ${has(String.raw`switch(?! ?2\y)`)})
    )) ELSE false END)
  )`;
}
