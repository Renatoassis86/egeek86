// Sem 'server-only': lógica pura, importável por coletores, queries, scripts tsx e testes.
import { compareIdentity, normalizeTitle, type IdentityDivergence } from '@/lib/affiliate/dedup';
import { mentionsMultipleGenerations } from '@/lib/affiliate/game-classification';

/**
 * RECHECAGEM DE IDENTIDADE DA OFERTA (decisões do dono, 2026-11-03).
 *
 * A cesta de cada produto só pode conter o MESMO produto. Ao ligar ou atualizar
 * uma oferta, o título do anúncio é comparado com o do master por todos os eixos
 * de identidade (plataforma, geração, edição, região, relançamento, condição,
 * modelo, capacidade, variante S/X, numeral, conteúdo). Em divergência a oferta
 * NÃO é ligada cegamente: fica "em revisão" e não entra em média, mediana, menor
 * preço nem selo (nem do master em que estava, nem de nenhum outro) até um humano
 * conferir. Nada é apagado.
 *
 * Open Box e usado/seminovo/recondicionado são CONDIÇÃO própria: fora da cesta de
 * novos e fora do público, como o usado. Anúncio que cita duas gerações (PS4 e
 * PS5, Xbox One e Series, Switch 1 e 2) sem deixar claro o disco também fica em
 * revisão: "compatível com PS5" não conta como segunda geração.
 */

export type OfferCondition = 'new' | 'open_box' | 'used';

/** Por que a oferta ficou fora dos indicadores ('ok' = entra normalmente). */
export type OfferIdentityReason = 'ok' | 'open_box' | 'used' | 'geracao_ambigua' | 'formato_desconhecido' | 'divergencia';

export interface OfferIdentityResult {
  /** true = fora de média/mediana/menor preço/selo/vitrine até conferência humana. */
  excluded: boolean;
  reason: OfferIdentityReason;
  condition: OfferCondition;
  /** Divergências duras (ou, em 'ok', nenhuma). */
  divergences: IdentityDivergence[];
  /** Resumo curto e auditável para log/CSV. */
  summary: string;
}

/** Palavras genéricas que não identificam a franquia (cobertura de título). */
const GENERIC_TOKENS = new Set([
  'wii', 'wiiu', 'ds', '3ds', '2ds', 'ps1', 'ps2', 'ps3', 'psp', 'vita', 'gamecube', 'n64', 'snes', 'nes', 'gba',
  'sega', 'genesis', 'mega', 'drive', 'dreamcast', 'atari', 'pc', 'xbox', 'one', 'series', 'serie', 'x', 's',
  'sony', 'microsoft', 'nintendo', 'playstation', 'switch', 'ou', 'e', 'a', 'o', 'console', 'controle', 'kit',
  // editoras e descritores que o vendedor acrescenta ao anúncio sem mudar o jogo
  'bandai', 'namco', 'capcom', 'ubisoft', 'activision', 'konami', 'square', 'enix', 'warner', 'bros', 'rockstar',
  'bethesda', 'take', 'two', 'ea', 'electronic', 'arts', 'sports', 'cd', 'projekt', 'santa', 'monica', 'naughty',
  'dog', 'aventura', 'acao', 'rpg', 'luta', 'corrida', 'esporte', 'tiro', 'terror', 'simulacao', 'estrategia',
  'plataforma', 'multiplayer', 'jogador', 'jogadores', 'online', 'offline', 'coop', 'cooperativo', 'infantil',
  'familia', 'store', 'loja', 'games', 'game', 'accessory', 'tom', 'clancy', 'clancys', 'marvel', 'marvels', 'disney',
]);

/** Palavras do nome do master que o anúncio costuma abreviar ("Zelda" x "The Legend of Zelda"). */
const DROPPABLE = new Set(['legend', 'tom', 'clancy', 'clancys', 'marvel', 'marvels', 'sid', 'meiers', 'meier']);

function wordTokens(core: string): Set<string> {
  return new Set(core.split(' ').filter((t) => t && !/^\d+$/.test(t) && !GENERIC_TOKENS.has(t)));
}

/**
 * Condição e geração do anúncio, sem olhar o master. É o que a camada SQL
 * (`offerIdentityVisibleSql`, public-offers.ts) espelha por expressão regular.
 */
export function offerTitleFlags(
  title: string,
  productType?: string | null
): { condition: OfferCondition; crossGen: boolean } {
  const n = normalizeTitle(title, { productType });
  const condition: OfferCondition = n.markers.includes('openbox')
    ? 'open_box'
    : n.markers.some((m) => m === 'usado' || m === 'seminovo' || m === 'loose')
      ? 'used'
      : 'new';
  return { condition, crossGen: mentionsMultipleGenerations(title) };
}

/**
 * Compara o título do anúncio com o do master. `master.productType` evita
 * inferir o tipo pelo título (cor só é ignorada em hardware; em jogo "Pokémon
 * Red" e "Pokémon Blue" continuam diferentes).
 */
export function evaluateOfferIdentity(
  offerTitle: string,
  master: { name: string; productType?: string | null; gameFormat?: string | null }
): OfferIdentityResult {
  // Formato (físico x digital, decisão do dono 2026-11-03): o do master é o título dele, senão o atributo gravado.
  // O da oferta é o do próprio título; sem prova, herda o do master (o catálogo do ML é um por formato).
  const m = normalizeTitle(master.name, { productType: master.productType, gameFormat: master.gameFormat });
  const o = normalizeTitle(offerTitle, { productType: master.productType, gameFormat: m.format === 'na' ? null : m.format });
  const flags = offerTitleFlags(offerTitle, master.productType);

  if (flags.condition !== 'new') {
    const reason: OfferIdentityReason = flags.condition === 'open_box' ? 'open_box' : 'used';
    return { excluded: true, reason, condition: flags.condition, divergences: [], summary: `condição ${flags.condition}` };
  }
  const isGame = (master.productType ?? o.kind) === 'game';
  if (flags.crossGen && isGame) {
    return {
      excluded: true,
      reason: 'geracao_ambigua',
      condition: 'new',
      divergences: [{ axis: 'geracao_cruzada', detail: `[${o.gens.join(',')}]`, hard: true }],
      summary: `cita mais de uma geração [${o.gens.join(',')}]`,
    };
  }

  // Master de jogo sem formato provado: nada que se ligue a ele tem formato provado; fica em revisão (fora das médias).
  if (isGame && m.format === 'unknown') {
    return {
      excluded: true,
      reason: 'formato_desconhecido',
      condition: 'new',
      divergences: [{ axis: 'formato', detail: 'master sem formato provado (físico/digital)', hard: true }],
      summary: 'formato físico/digital não provado',
    };
  }
  const hard = compareIdentity(o, m).filter((d) => d.hard);

  // Franquia/título. O núcleo de reserva ("accessory", "console") de item sem nome não conta como palavra.
  const mw = m.coreTitle === m.kind ? new Set<string>() : wordTokens(m.coreTitle);
  if (mw.size > 0) {
    const ow = o.coreTitle === o.kind ? new Set<string>() : wordTokens(o.coreTitle);
    let shared = 0;
    for (const t of mw) if (ow.has(t)) shared++;
    if (shared === 0 && ow.size > 0) {
      hard.push({ axis: 'titulo', detail: `nenhum termo em comum com o master (${[...mw].slice(0, 4).join(' ')})`, hard: true });
    } else if (shared > 0 && isGame) {
      // Subtítulo: o anúncio tem palavra que o master não tem ("Persona 5" x "Persona 5 Royal", "God of War" x
      // "God of War Ragnarok"), ou o master tem palavra distintiva que o anúncio omite. Só jogo (em acessório a
      // descrição varia demais; lá vale o código de modelo, ver compareIdentity). Editoras/descritores não contam.
      const onlyOffer = [...ow].filter((t) => !mw.has(t) && !DROPPABLE.has(t));
      const onlyMaster = [...mw].filter((t) => !ow.has(t));
      const jac = shared / (mw.size + ow.size - shared);
      const masterMissesDistinctive = onlyMaster.some((t) => !DROPPABLE.has(t));
      if (jac < 0.8 && (onlyOffer.length > 0 || masterMissesDistinctive)) {
        hard.push({
          axis: 'titulo',
          detail: `palavras diferentes: anúncio {${onlyOffer.slice(0, 3).join(' ')}} x master {${onlyMaster.slice(0, 3).join(' ')}}`,
          hard: true,
        });
      }
    }
  }

  if (hard.length === 0) return { excluded: false, reason: 'ok', condition: 'new', divergences: [], summary: 'ok' };
  return {
    excluded: true,
    reason: 'divergencia',
    condition: 'new',
    divergences: hard,
    summary: hard.map((d) => `${d.axis}: ${d.detail}`).join('; '),
  };
}
