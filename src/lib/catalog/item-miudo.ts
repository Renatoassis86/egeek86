// REGRA ÚNICA: "o que é item miúdo de baixo valor no Espaço Geek 86". PURO: sem banco, sem rede, sem 'server-only'.
//
// Decisão do dono (2026-11-13, palavras dele): "Eu não quero em nosso banco peças, cabos, essas coisas que têm custos
// pequenos, tipo objetos de impressão 3D, grips, essas coisas eu não quero. São coisas pequenas." Vale para TODOS os departamentos.
//
// Só entra produto PRINCIPAL do departamento: console, jogo, controle/headset/volante de marca, impressora 3D/filamento/resina,
// hardware e periférico relevante, livro, eletrodoméstico, TV/áudio, calçado/equipamento esportivo.
// Fora: peça de reposição, cabo, carregador avulso, adaptador, conector, grip, capa/película, adesivo/skin/cartela, suporte/base avulsos,
// parafuso/abraçadeira, objeto/miniatura impresso em 3D, enfeite/expositor e acessório genérico.
//
// A decisão é por TIPO/TÍTULO e piso de valor POR FAMÍLIA, nunca por preço sozinho (filamento, livro e jogo baratos são legítimos).
// Três vereditos (mesma lógica da regra de console):
//   'sim'     miúdo com prova no título (peça, cabo, grip...): nunca aprovado, nunca vitrine; autoriza barrar na entrada e limpar o catálogo;
//   'ambiguo' acessório menor (pen drive, mouse pad, garrafa, suplemento...) abaixo do piso da família, ou acessório de games sem
//             substantivo principal: NUNCA ganha 'approved' automático e fica fora do site até o dono decidir; não é limpo sozinho;
//   'nao'     não é miúdo.
// Console: o aparelho é decidido por src/lib/catalog/console-videogame.ts; aqui só se aproveita o 'nao' forte de peça/acessório.

import { avaliarConsoleVideoGame, normalizarConsole } from '@/lib/catalog/console-videogame';
import { TIPOS_POR_DEPT } from '@/lib/catalog/tipos-produto';

export type VereditoMiudo = 'sim' | 'ambiguo' | 'nao';

export type FamiliaMiudo =
  | 'games_jogo'
  | 'games_acessorio'
  | 'games_console'
  | 'tecnologia'
  | 'eletroeletronicos'
  | 'eletrodomesticos'
  | 'esporte'
  | 'livros'
  | 'impressao3d'
  | 'outra';

export interface ResultadoMiudo {
  veredito: VereditoMiudo;
  familia: FamiliaMiudo;
  /** Código curto e estável do motivo (auditável). */
  motivo: string;
  /** Termo do título que decidiu. */
  termo: string | null;
}

export interface AtributosMiudo {
  /** Tipo de produto gravado (game, accessory, console, general...). */
  plataforma?: string | null;
}

/**
 * Piso de valor por família, em centavos. Vale SÓ para acessório menor (termo "fraco"): abaixo dele o item vira 'ambiguo'.
 * Termo "forte" (peça, cabo, grip, adesivo, impresso em 3D...) é miúdo em qualquer preço. Livro e jogo nunca são miúdos por preço.
 */
export const PISO_MIUDO_CENTAVOS: Record<FamiliaMiudo, number> = {
  games_jogo: 0,
  games_acessorio: 6_000,
  games_console: 0,
  tecnologia: 12_000,
  eletroeletronicos: 6_000,
  eletrodomesticos: 6_000,
  esporte: 4_500,
  livros: 0,
  impressao3d: 3_000,
  outra: 0,
};

const MIL = (s: string) => new RegExp(s);

/** Prova inequívoca em QUALQUER posição: nenhum produto principal se anuncia assim (nem como característica). */
const FORTE_EM_QUALQUER_LUGAR = MIL(
  ' (reposicao|parafuso|parafusos|abracadeira|abracadeiras|cartela|cartelas|adesivo|adesivos|sticker|stickers|decal|decals|skin|skins|' +
    'impresso em 3d|impressa em 3d|impressos em 3d|impressas em 3d|feito em 3d|feita em 3d|arquivo stl|stl|' +
    'expositor|expositores|enfeite|enfeites|letreiro|letreiros|chaveiro|chaveiros|porta cartuchos|porta cartuchos|porta cartoes|' +
    'kit de reposicao|pecas de reposicao|pecas para impressora|peca para impressora|pecas de impressora|peca de impressora|' +
    'strap|aperto|cabo flexivel|controlador carregador|acessorio impresso|acessorios impressos|action figure impressa|miniatura impressa|miniaturas impressas) ',
);

/** Substantivo-cabeça miúdo (vale quando aparece ANTES de qualquer produto principal): peça, cabo, grip, capa, base... */
const CABECA_FORTE = MIL(
  ' (cabo|cabos|cabeamento|carregador|carregadores|adaptador|adaptadores|conector|conectores|extensor|extensores|hub|hubs|' +
    'grip|grips|capa|capas|capinha|capinhas|case|cases|pelicula|peliculas|protetor de tela|vidro temperado|' +
    'suporte|suportes|base|bases|stand|dock|docks|apoio|' +
    'porca|porcas|mola|molas|engrenagem|engrenagens|correia|correias|polia|polias|rolamento|rolamentos|ventoinha|ventoinhas|motor|motores|' +
    'frontal|frontais|carcaca|carcacas|refil|refis|tampa|tampas|lamina|laminas|resistencia|vedacao|junta|' +
    'analogico|analogicos|gatilho|gatilhos|botao|botoes|d pad|dpad|thumb|thumbstick|thumbsticks|flat|flats|' +
    'bico|bicos|nozzle|nozzles|hotend|extrusora|extrusor|bocal|ptfe|fep|cuba|' +
    'ferramenta|ferramentas|espatula|alicate|lixa|lixas|pasta termica|lubrificante|cola|' +
    'peca|pecas|kit de acabamento|kit de limpeza|' +
    'miniatura|miniaturas|estatueta|estatuetas|busto|bustos|vaso|vasos|' +
    'controle remoto|filtro de linha|extensao|tomada|fita led) ',
);

/** Cabeça "fraca": acessório menor que só é miúdo abaixo do piso da família. */
const CABECA_FRACA: Partial<Record<FamiliaMiudo, RegExp>> = {
  tecnologia: MIL(' (mouse pad|mousepad|mousepads|pen drive|pendrive|flash drive|cartao de memoria|cartao sd|micro ?sd|microsd|tapete|apoio de pulso|limpador) '),
  eletroeletronicos: MIL(' (power bank|powerbank|bateria externa|pilha|pilhas|bateria|baterias|lampada|lampadas|antena|controle universal|smart plug|tomada inteligente|pen drive|pendrive|cartao de memoria|micro ?sd|microsd) '),
  eletrodomesticos: MIL(' (filtro|jarra|copo|cesto|forma|assadeira|grelha|tabua|utensilio|utensilios|escova|esponja|saco|sacos) '),
  esporte: MIL(
    ' (garrafa|squeeze|corda de pular|corda pular|corda|luva|luvas|caneleira|caneleiras|tornozeleira|munhequeira|meia|meias|faixa|elastico|' +
      'protetor|rolo|balanca|oculos de natacao|touca|toalha|bomba|apito|cone|cones|sache|saches|gel|capsulas|vitamina|vitaminas) ',
  ),
  games_acessorio: MIL(' (cartao de memoria|micro ?sd|microsd|sd express|cartao|memory card|pen drive|pendrive) '),
};

/** Suplemento no departamento de esporte: não é equipamento esportivo; o dono decide (sempre 'ambiguo', qualquer preço). */
const SUPLEMENTO = MIL(' (whey|creatina|omega|vitamina|vitaminas|bcaa|pre treino|colageno|hipercalorico|glutamina|multivitaminico|termogenico|sache|saches|capsulas|gel|barra de proteina) ');

/** Acessório principal de games (controle, headset...): o substantivo que prova que o acessório não é miúdo. */
const PRINCIPAL_GAMES_ACESSORIO = MIL(
  ' (controle|controles|controlador|controladores|controller|joystick|joypad|joycons|split pad|pad pro|keypad|cambio|shifter|flight stick|gamepad|manete|joy ?con|dualsense|dual sense|dualshock|pro controller|headset|fone|fones|volante|' +
    'teclado|mouse|monitor|cadeira|microfone|webcam|placa de captura|capturadora|ssd|hd externo|fliperama|arcade stick|fight stick|' +
    'kit de controles|kit com controles) ',
);

/** Cabeças miúdas próprias de games (somem do acessório principal): bateria, porta-controle, troféu, alça, punho, mini volante... */
const CABECA_GAMES_EXTRA = MIL(
  ' (bateria|baterias|bat|pilha|pilhas|uporte|porta|trofeu|strap|alca|alcas|punho|punhos|aperto|mini volante|kontrol freek|freek|estacao|estacoes|organizador|caixa vazia|caixas vazias|cooler|rack) ',
);

/** Ruído no começo de título (para a regra das primeiras palavras do jogo/livro). */
const RUIDO = new Set([
  'novo', 'nova', 'novos', 'novas', 'kit', 'kits', 'par', 'pares', 'combo', 'conjunto', 'jogo', 'de', 'do', 'da', 'com', 'e', 'o', 'a', 'um', 'uma',
  'unidade', 'unidades', 'pcs', 'pc', 'original', 'oficial', 'lacrado', 'promocao', 'oferta', 'b', 'c', 'mais',
]);

function primeiro(re: RegExp, t: string): { index: number; termo: string } | null {
  const m = re.exec(t);
  return m ? { index: m.index, termo: m[0].trim() } : null;
}

/** Os dois primeiros tokens significativos (sem ruído, sem número) formam o começo do título. */
function comecoDoTitulo(t: string): string {
  const toks = t.trim().split(' ').filter((x) => x && !RUIDO.has(x) && !/^\d+$/.test(x));
  return ` ${toks.slice(0, 2).join(' ')} `;
}

/** Quantas palavras significativas (sem ruído e sem número) vêm antes do índice. */
function tokensAntes(t: string, idx: number): number {
  return t.slice(0, idx).trim().split(' ').filter((x) => x && !RUIDO.has(x) && !/^\d+$/.test(x)).length;
}

/** Família de preço a partir do departamento e do tipo gravado. */
export function familiaMiudo(vertical: string | null | undefined, tipo: string | null | undefined): FamiliaMiudo {
  switch (vertical) {
    case 'games':
      return tipo === 'console' ? 'games_console' : tipo === 'accessory' || tipo === 'acessorio' ? 'games_acessorio' : 'games_jogo';
    case 'tecnologia':
    case 'eletroeletronicos':
    case 'eletrodomesticos':
    case 'esporte':
    case 'livros':
    case 'impressao3d':
      return vertical;
    default:
      return 'outra';
  }
}

/** Tipo (slug) do departamento e posição da palavra que o decidiu, no texto normalizado. */
function tipoComPosicao(vertical: string, t: string): { slug: string; index: number } | null {
  const defs = (TIPOS_POR_DEPT as Record<string, readonly { slug: string; re: RegExp }[] | undefined>)[vertical];
  if (!defs) return null;
  let melhor: { slug: string; index: number } | null = null;
  for (const d of defs) {
    const m = d.re.exec(t);
    if (m && (melhor === null || m.index < melhor.index)) melhor = { slug: d.slug, index: m.index };
  }
  return melhor;
}

/** Tipos do departamento cujo próprio substantivo é peça/acessório miúdo (vale em qualquer preço). */
const TIPO_FORTE: Record<string, ReadonlySet<string>> = {
  eletroeletronicos: new Set(['cabos-acessorios']),
  impressao3d: new Set(['pecas', 'ferramentas']),
};

/**
 * Veredito completo. `preco` em centavos (menor oferta ativa ou mediana; null = desconhecido, não vira 'ambiguo').
 * `tipo` = product_type gravado ('game' | 'accessory' | 'console' | 'general'...); `vertical` = departamento.
 */
export function avaliarItemMiudo(
  titulo: string,
  preco: number | null | undefined,
  tipo: string | null | undefined,
  vertical: string | null | undefined,
  atributos?: AtributosMiudo,
): ResultadoMiudo {
  const familia = familiaMiudo(vertical, tipo);
  const out = (veredito: VereditoMiudo, motivo: string, termo: string | null = null): ResultadoMiudo => ({ veredito, familia, motivo, termo });
  const t = normalizarConsole(titulo ?? '');
  if (t.trim() === '') return out('nao', 'titulo_vazio');
  const piso = PISO_MIUDO_CENTAVOS[familia];
  const abaixoDoPiso = preco != null && preco > 0 && preco < piso;

  // Console: a regra do aparelho já decide; só o 'nao' forte de peça/acessório conta como miúdo (retrô é outra regra).
  if (familia === 'games_console') {
    const c = avaliarConsoleVideoGame(titulo, preco ?? null, { plataforma: atributos?.plataforma ?? null });
    // Jogo de VR tipado como console ("Deracine: Playstation VR - Playstation 4") é jogo mal tipado, não peça: vai ao dono, não é miúdo inequívoco.
    const ehTermoVr = /^(vr|vr2|psvr|psvr2|playstation vr)$/.test(c.termo ?? '') && !/^((console|sony|novo|playstation) )*(playstation|psvr|ps) ?vr/i.test((titulo ?? '').trim());
    if (c.veredito === 'nao' && c.forte && !ehTermoVr && (c.motivo === 'peca_ou_enfeite' || c.motivo === 'acessorio_antes_do_aparelho')) return out('sim', `console_${c.motivo}`, c.termo);
    return out('nao', 'console_decidido_pela_regra_de_aparelho');
  }

  // 1. Prova inequívoca em qualquer posição (peça de reposição, parafuso, adesivo, objeto impresso em 3D, expositor...).
  const forteQ = primeiro(FORTE_EM_QUALQUER_LUGAR, t);
  if (forteQ) {
    // Jogo digital/físico que cita "skin" ou "adesivos" como bônus é jogo: só vale em título que não anuncia jogo de plataforma.
    if (familia !== 'games_jogo' || !/ (ps ?[45]|playstation|xbox|switch|pc|steam) .*(midia fisica|fisico|edicao|standard|deluxe|bonus)/.test(t)) {
      return out('sim', 'item_miudo_por_termo', forteQ.termo);
    }
  }

  // 2. Games.
  if (familia === 'games_jogo') {
    // Título de jogo: só o substantivo miúdo logo na abertura ("Suporte Controle Xbox", "Caixa Mario ... Cartão de Jogos") prova que não é jogo.
    const c = comecoDoTitulo(t);
    const k = primeiro(CABECA_FORTE, c);
    if (k && /^(cabo|cabos|carregador|adaptador|conector|grip|grips|capa|capas|case|cases|suporte|suportes|base|bases|stand|dock|apoio|pelicula|peliculas|motor|frontal|caixa)$/.test(k.termo)) return out('sim', 'item_miudo_na_abertura', k.termo);
    if (/^ caixa /.test(c) && / (cartao|cartoes|jogos|micro sd|games|apoio de mesa|organizador) /.test(t)) return out('sim', 'item_miudo_na_abertura', 'caixa');
    return out('nao', 'jogo');
  }
  if (familia === 'games_acessorio') {
    // O produto é a CABEÇA do título (antes de "para/compatível"): "Bateria para Controle Xbox" é bateria, "Controle Xbox Wireless" é controle.
    const corte = t.search(/ (para|pra|p|compativel|compativeis|for|compat) /);
    const cabecaT = corte > 0 ? t.slice(0, corte + 1) : t;
    const forteH = [primeiro(CABECA_FORTE, cabecaT), primeiro(CABECA_GAMES_EXTRA, cabecaT)].filter((x) => x !== null).sort((a, b) => a!.index - b!.index)[0] ?? null;
    const princH = primeiro(PRINCIPAL_GAMES_ACESSORIO, cabecaT);
    // Aparelho completo tipado como acessório (ex.: "PS4 500GB Completo + Cabo HDMI"): não é miúdo (outra regra cuida do tipo).
    if (avaliarConsoleVideoGame(titulo, preco ?? null).veredito === 'sim') return out('nao', 'aparelho_tipado_acessorio');
    if (forteH && (!princH || forteH.index < princH.index)) return out('sim', 'item_miudo_por_cabeca', forteH.termo);
    if (princH) return out('nao', 'acessorio_principal', princH.termo);
    const fraco = primeiro(CABECA_FRACA.games_acessorio!, t);
    if (fraco) return abaixoDoPiso || preco == null ? out('ambiguo', 'acessorio_menor_abaixo_do_piso', fraco.termo) : out('nao', 'acessorio_menor_acima_do_piso', fraco.termo);
    return out('ambiguo', 'acessorio_generico_sem_produto_principal');
  }

  // 3. Livros: só objeto de papelaria/brinde logo na abertura; nunca por preço.
  if (familia === 'livros') {
    const c = comecoDoTitulo(t);
    if (!/ (livro|autor|editora|romance|volume|vol|edicao|capa mole|capa dura) /.test(t)) {
      const k = / (caderno|cadernos|agenda|planner|marcador|marca pagina|poster|camiseta|caneca|luminaria|caneta|lapis|adesivo) /.exec(c);
      if (k) return out('sim', 'papelaria_ou_brinde', k[0].trim());
    }
    return out('nao', 'livro');
  }

  // 4. Demais departamentos: o tipo do departamento (tipos-produto) marca o substantivo principal; o miúdo vale se vier antes dele.
  const tipoDept = vertical ? tipoComPosicao(vertical, t) : null;
  // O substantivo miúdo é a cabeça do título: nas primeiras palavras significativas ("Cabo Antiderrapante" no fim de um canivete não conta).
  const cabecaBruta = primeiro(CABECA_FORTE, t);
  let cabeca = cabecaBruta && tokensAntes(t, cabecaBruta.index) <= 4 ? cabecaBruta : null;
  // "Carregador Portátil Power Bank 20000mah" é power bank (acessório menor, decidido pelo piso), não carregador avulso.
  if (cabeca?.termo === 'carregador' && / (power ?bank|carregador portatil|bateria externa) /.test(t)) cabeca = null;
  const slugForte = tipoDept && TIPO_FORTE[vertical ?? '']?.has(tipoDept.slug);
  if (cabeca || slugForte) {
    const posMiudo = Math.min(cabeca?.index ?? Infinity, slugForte ? tipoDept!.index : Infinity);
    const principalAntes = tipoDept && !slugForte && tipoDept.index < posMiudo;
    if (!principalAntes) return out('sim', 'item_miudo_por_cabeca', cabeca?.termo ?? tipoDept?.slug ?? null);
  }
  const fracoRe = CABECA_FRACA[familia];
  if (familia === 'esporte') {
    const sup = primeiro(SUPLEMENTO, t);
    if (sup && (!tipoDept || tipoDept.slug === 'suplementos' || sup.index <= tipoDept.index)) return out('ambiguo', 'suplemento_nao_e_equipamento', sup.termo);
  }
  if (fracoRe) {
    const fraco = primeiro(fracoRe, t);
    if (fraco) {
      // O principal do departamento vem antes? (ex.: "Notebook com Pen Drive") então não é miúdo.
      const principalAntes = tipoDept && !isFracoSlug(vertical ?? '', tipoDept.slug) && tipoDept.index < fraco.index;
      if (!principalAntes) return abaixoDoPiso ? out('ambiguo', 'acessorio_menor_abaixo_do_piso', fraco.termo) : out('nao', 'acessorio_menor_acima_do_piso', fraco.termo);
    }
  }
  return out('nao', 'produto_principal');
}

/** Slugs de tipos "menores" (não valem como produto principal ao decidir a ordem das palavras). */
function isFracoSlug(vertical: string, slug: string): boolean {
  const s: Record<string, string[]> = {
    tecnologia: ['mousepad', 'armazenamento-portatil'],
    eletroeletronicos: ['carregadores', 'cabos-acessorios'],
    esporte: ['garrafas', 'protecao', 'bones', 'natacao', 'meias-roupas', 'suplementos', 'recuperacao', 'fitness'],
  };
  return (s[vertical] ?? []).includes(slug);
}

/** Miúdo inequívoco (nunca entra: classificador, porteiro, coleta, vitrine). */
export function ehItemMiudo(
  titulo: string,
  preco?: number | null,
  tipo?: string | null,
  vertical?: string | null,
  atributos?: AtributosMiudo,
): boolean {
  return avaliarItemMiudo(titulo, preco, tipo, vertical, atributos).veredito === 'sim';
}

/** Miúdo ou dúvida (nunca ganha 'approved' automático; fica fora do site até o dono decidir). */
export function ehItemMiudoOuDuvida(
  titulo: string,
  preco?: number | null,
  tipo?: string | null,
  vertical?: string | null,
  atributos?: AtributosMiudo,
): boolean {
  return avaliarItemMiudo(titulo, preco, tipo, vertical, atributos).veredito !== 'nao';
}
