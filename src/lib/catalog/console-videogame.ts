// REGRA ÚNICA: "o que é um console no Espaço Geek 86". PURO: sem banco, sem rede, sem 'server-only'.
//
// Decisão do dono (repetida em 2026-11-13): Console = SOMENTE video game de mesa ou portátil, NOVO e EM LINHA
// (PlayStation 5, Xbox Series S|X, Nintendo Switch/Lite/OLED/Switch 2, Steam Deck, ROG Ally, Legion Go, MSI Claw e equivalentes).
// Peça de reposição, motor, abraçadeira, base, suporte, frontal/placa decorativa, adesivo, cartela, capa, cabo, kit, skin,
// controle avulso, jogo e qualquer acessório NÃO são console. Plataforma no título não basta: o objeto vendido tem de ser o aparelho.
//
// Uso: classificador de tipo (product-type-classifier), porteiro do catálogo (gate), vitrines (selecionar) e a seção Consoles da home.
// 2026-11-14: PS4 (e Xbox One, Xbox One S/X, PS3 e anteriores) saiu de linha: fora, mesmo vendido novo por terceiros.
// Três vereditos: 'sim' (entra), 'nao' (fica fora) e 'ambiguo' (fora do site até o dono decidir; nunca é limpo automaticamente).
// `forte` = o 'nao' tem prova inequívoca de peça/acessório/retrô no título (só ela autoriza limpeza automática do catálogo).

export type VereditoConsole = 'sim' | 'nao' | 'ambiguo';

export type FamiliaConsole = 'ps5' | 'xbox_series' | 'switch' | 'switch_2' | 'pc_portatil';

export interface ResultadoConsole {
  veredito: VereditoConsole;
  familia: FamiliaConsole | null;
  /** Código curto e estável do motivo (auditável). */
  motivo: string;
  /** Termo do título que decidiu. */
  termo: string | null;
  /** 'nao' com prova inequívoca de peça/acessório/retrô (autoriza limpeza do catálogo). */
  forte: boolean;
}

export interface AtributosConsole {
  /** game_platform_gen gravado ('unknown' nunca prova console). */
  plataforma?: string | null;
}

/** Normaliza: minúsculas, sem acento, só [a-z0-9] com espaço único e espaço nas pontas. */
export function normalizarConsole(s: string): string {
  const base = (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[+&]/g, ' mais ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${base} `;
}

// ---------------------------------------------------------------------------
// Aparelhos (marca + modelo). O modelo/geração é obrigatório: "Playstation" sozinho não é aparelho.
// ---------------------------------------------------------------------------

const APARELHOS: Array<{ familia: FamiliaConsole; re: RegExp }> = [
  { familia: 'switch_2', re: / (nintendo )?switch 2 | switch2 | nsw ?2 / },
  { familia: 'switch', re: / nintendo switch | switch (lite|oled|v1|v2) | nintendo switch (lite|oled) / },
  { familia: 'ps5', re: / (ps ?5|ps5|playstation ?5|play station ?5|cfi ?[127]\d{3}\w*)( |$)/ },
  { familia: 'xbox_series', re: / xbox (series|serie) ?[sx]? | xbox series | series [sx] / },
  { familia: 'pc_portatil', re: / (steam deck|rog ally|rog xbox ally|xbox ally|legion go|msi claw|steam machine|ayaneo|ayn odin) / },
];

/** Aparelhos fora de linha / retrô / emulação: nunca console do site (dono: só novo e em linha; Xbox One e PS4 inclusos desde 2026-11-14). */
const RETRO =
  / (ps ?[123]|ps[123]|playstation ?[123]|play station ?[123]|psp|ps vita|vita|xbox 360|x360|xbox one|xone|xbox classic|xbox original|wii|wii u|gamecube|game cube|nintendo ds|nds|3ds|2ds|n64|nintendo 64|snes|super nintendo|nes|mega drive|megadrive|master system|dreamcast|atari|game boy|gameboy|famicom|neo geo|game stick|gamestick|retro|retrô|emulador|emulacao|anbernic|powkiddy|miyoo|retroid|trimui|tv game|polystation|arcade|fliperama|mini console|mini classic|classic edition) /;

/** PS4 como aparelho (fora de linha desde 2026-11-14): só barra quando NÃO há aparelho em linha no título ("Console PS5 + jogo PS4" segue valendo pelo PS5). */
const PS4_APARELHO = / (ps ?4|ps4|playstation ?4|play station ?4|cuh ?\d{4}\w*)( |$)/;

/** Prova inequívoca de peça/acessório/enfeite em QUALQUER posição do título (o aparelho nunca se anuncia assim). */
const PECA_FORTE =
  / (motor|motores|frontal|frontais|abracadeira|abracadeiras|cartela|cartelas|adesivo|adesivos|sticker|stickers|decal|skin|skins|reposicao|carcaca|carcacas|robotica|pelicula|peliculas|revista|figure|figuras|poster|encarte|laser|lente|engrenagem|engrenagens|parafuso|parafusos|flat|flats|fita|conector|conectores|botao|botoes|gatilho|gatilhos|analogico|analogicos|thumb grip|thumbstick|tela de vidro|tela para|tela touch|vidro temperado|spider man 3d|peca|pecas|mica|micas|jig|rcm|loader|transmissor|copinho|microsd|sandisk|tela display|display lcd|vr|vr2|psvr|psvr2|playstation vr|realidade virtual|volantes|estacao organizadora|pacote de acessorios|caixa de switch|estojo) /;

/** Acessório/peça/jogo que, ANTES do nome do aparelho, é o produto ("Base Horizontal para PS5", "Controle PS5"). */
const PORTAL_REMOTO = / (playstation portal|ps portal|player remoto|reprodutor remoto|console remoto|(ps ?5|playstation ?5) portatil) /;

/** Acessório de hardware (não jogo) que, antes do aparelho, é o produto. */
const ACESSORIO_NOUN =
  / (base|bases|suporte|suportes|stand|dock|docks|capa|capas|case|cases|bolsa|bolsas|maleta|mochila|estojo|organizador|cabo|cabos|hdmi|adaptador|carregador|carregadores|fonte|fontes|bateria|baterias|controle|controles|controller|controllers|joystick|joysticks|gamepad|manete|manetes|joy con|joycon|dualsense|dual sense|dualshock|pro controller|headset|fone|fones|volante|camera|webcam|cooler|ventoinha|refrigeracao|ventilador|grip|alca|cartao|memory|ssd|hd|unidade|leitor|disco rigido|placa|placas|caixa|hub|usb|rgb) /;

const SUBSTANTIVO_NAO_APARELHO =
  / (base|bases|suporte|suportes|stand|dock|docks|capa|capas|case|cases|bolsa|bolsas|maleta|mochila|estojo|organizador|cabo|cabos|hdmi|adaptador|carregador|carregadores|fonte|fontes|bateria|baterias|controle|controles|controller|controllers|joystick|joysticks|gamepad|manete|manetes|joy con|joycon|dualsense|dual sense|dualshock|pro controller|headset|fone|fones|volante|camera|webcam|cooler|ventoinha|refrigeracao|ventilador|grip|alca|cartao|memory|ssd|hd|unidade|leitor|disco rigido|placa|placas|jogo|jogos|game|midia|dlc|bonus|pre venda|expansao|volume|vol|livro|guia|funko|boneco|miniatura|colecao|colecionavel|chave|codigo|gift card|cartao presente|assinatura|plus|essential|pass) /;

/** Palavras de ruído no começo do título (não são o substantivo principal). */
const RUIDO_INICIO = new Set([
  'novo', 'nova', 'novos', 'novas', 'lacrado', 'lacrada', 'original', 'oficial', 'sony', 'microsoft', 'nintendo', 'valve', 'asus',
  'lenovo', 'msi', 'console', 'consoles', 'videogame', 'video', 'game', 'de', 'mesa', 'portatil', 'hibrido', 'a', 'o', 'um', 'uma',
  'playstation', 'xbox', 'lancamento', 'consola', 'bundle', 'pacote', 'kit', 'combo', 'promocao', 'oferta', 'top', 'garantia', 'importado', 'pronta', 'entrega', 'brasil', 'nacional', 'nf', 'com', 'e', 'da', 'do',
]);

/** Descritores do próprio aparelho que podem vir logo depois do modelo ("PS5 Slim Digital 1TB Branco"). */
const DESCRITOR_APARELHO =
  /^(slim|fat|pro|digital|disco|disc|midia|fisica|standard|padrao|edition|edicao|console|novo|nova|lacrado|original|sony|microsoft|nintendo|xbox|series|serie|s|x|lite|oled|v1|v2|\d+|gb|tb|ssd|branco|branca|preto|preta|azul|vermelho|vermelha|cinza|verde|rosa|neon|coral|amarelo|cfi\w*|nsha\w*|hibrido|portatil|bivolt|2|5|4)$/;

const PACOTE = / (bundle|pacote|combo|kit) /;

const SUBSTANTIVO_CONSOLE = / (console|consoles|consola|videogame|video game|video games|aparelho de video game) /;

/** Piso de preço sensato por família, em centavos (abaixo disso o anúncio não é o aparelho novo). */
export const PISO_CENTAVOS: Record<FamiliaConsole, number> = {
  ps5: 150_000,
  xbox_series: 150_000,
  switch: 90_000,
  switch_2: 250_000,
  pc_portatil: 200_000,
};
/** Abaixo desta fração do piso o preço sozinho já prova que não é o aparelho (ainda assim só 'nao' fraco). */
const FRACAO_PISO_IMPOSSIVEL = 0.4;

function primeiroIndice(re: RegExp, t: string): { index: number; termo: string } | null {
  const m = re.exec(t);
  return m ? { index: m.index, termo: m[0].trim() } : null;
}

/** Posição (em tokens) do índice de caractere, descontado o ruído do começo. */
function tokensAntesDoIndice(t: string, idx: number): string[] {
  const antes = t.slice(0, idx).trim();
  const toks = antes ? antes.split(' ') : [];
  let i = 0;
  while (i < toks.length && RUIDO_INICIO.has(toks[i]!)) i++;
  return toks.slice(i);
}

/**
 * Veredito completo. `preco` em centavos (menor oferta ativa ou mediana; null = desconhecido, não barra).
 */
export function avaliarConsoleVideoGame(titulo: string, preco?: number | null, atributos?: AtributosConsole): ResultadoConsole {
  const t0 = normalizarConsole(titulo);
  // "video game" / "videogame" é o substantivo do aparelho, não a palavra "game" (jogo).
  const t = t0.replace(/ video ?games? /g, ' videogame ');
  const out = (veredito: VereditoConsole, familia: FamiliaConsole | null, motivo: string, termo: string | null, forte = false): ResultadoConsole => ({
    veredito,
    familia,
    motivo,
    termo,
    forte,
  });
  if (t.trim() === '') return out('nao', null, 'titulo_vazio', null);

  // Aparelho reconhecido (marca + modelo), pelo primeiro que aparece.
  let ap: { familia: FamiliaConsole; index: number; termo: string } | null = null;
  for (const a of APARELHOS) {
    const m = primeiroIndice(a.re, t);
    if (m && (!ap || m.index < ap.index)) ap = { familia: a.familia, index: m.index, termo: m.termo };
  }

  // 0. Player remoto (PlayStation Portal): não é video game (só transmite o PS5); decisão do dono.
  if (PORTAL_REMOTO.test(t)) return out('ambiguo', ap?.familia ?? null, 'portal_player_remoto', 'playstation portal');

  // 1. Peça/enfeite inequívoco em qualquer posição.
  const peca = primeiroIndice(PECA_FORTE, t);
  if (peca) return out('nao', ap?.familia ?? null, 'peca_ou_enfeite', peca.termo, true);

  // 2. Retrô / fora de linha / emulação (sem aparelho moderno no título).
  const retro = primeiroIndice(RETRO, t);
  if (retro) {
    if (!ap) return out('nao', null, 'retro_ou_fora_de_linha', retro.termo, true);
    return out('ambiguo', ap.familia, 'cita_aparelho_moderno_e_retro', retro.termo);
  }

  if (!ap) {
    const ps4 = primeiroIndice(PS4_APARELHO, t);
    if (ps4 && !SUBSTANTIVO_NAO_APARELHO.test(t.slice(0, ps4.index + 1))) {
      // Palavras soltas antes do PS4 ("Scarlet Nexus - Playstation 4"): é JOGO de PS4 tipado como console; jogo de PS4 segue valendo (não é prova forte).
      if (tokensAntesDoIndice(t, ps4.index).length > 0) return out('nao', null, 'plataforma_no_fim_do_titulo', ps4.termo);
      return out('nao', null, 'retro_ou_fora_de_linha', ps4.termo, true);
    }
    // 3. Sem aparelho conhecido.
    const sub = primeiroIndice(SUBSTANTIVO_NAO_APARELHO, t);
    if (sub) return out('nao', null, 'acessorio_ou_jogo_sem_aparelho', sub.termo, true);
    if (SUBSTANTIVO_CONSOLE.test(t)) return out('ambiguo', null, 'console_de_marca_ou_modelo_desconhecido', null);
    if (atributos?.plataforma === 'unknown') return out('nao', null, 'plataforma_unknown_sem_aparelho', null);
    return out('nao', null, 'titulo_nao_anuncia_aparelho', null);
  }

  // 4. Aparelho reconhecido: ele tem de ser o PRODUTO (cabeça do título), não o alvo de compatibilidade.
  const antes = tokensAntesDoIndice(t, ap.index);
  const prefixo = t.slice(0, ap.index + 1);
  const nounConsoleIdx = SUBSTANTIVO_CONSOLE.exec(prefixo)?.index ?? -1;
  const nounAcc = primeiroIndice(ACESSORIO_NOUN, prefixo);
  // Acessório antes do aparelho (e antes de qualquer "console"): "Base Horizontal para PS5", "Controle PS5".
  if (nounAcc && (nounConsoleIdx < 0 || nounAcc.index < nounConsoleIdx)) {
    return out('nao', ap.familia, 'acessorio_antes_do_aparelho', nounAcc.termo, true);
  }
  // Pacote/bundle com o aparelho (jogo + console): vale pelo preço, que prova o hardware.
  if (PACOTE.test(t)) {
    const piso = PISO_CENTAVOS[ap.familia];
    if (preco != null && preco >= piso) return out('sim', ap.familia, 'pacote_com_aparelho', ap.termo);
    if (preco != null && preco > 0) return out('nao', ap.familia, 'preco_incompativel_com_aparelho', ap.termo);
    return out('ambiguo', ap.familia, 'pacote_sem_preco', ap.termo);
  }
  const nounGame = primeiroIndice(SUBSTANTIVO_NAO_APARELHO, prefixo);
  if (nounGame && nounConsoleIdx < 0) return out('nao', ap.familia, 'jogo_ou_item_antes_do_aparelho', nounGame.termo);
  if (antes.length > 0 && nounConsoleIdx < 0) {
    // Palavras soltas antes do modelo ("Mario Kart Switch 2", "Civilization VII - Playstation 5"): jogo ou item com o nome da plataforma.
    return out('nao', ap.familia, 'plataforma_no_fim_do_titulo', ap.termo);
  }

  // 4b. Acessório logo depois do modelo ("PS5 DualSense Controle", "Switch Pro Controller"): o aparelho é só a compatibilidade.
  const depois = t.slice(ap.index + ap.termo.length + 1).trim();
  const toksDepois = depois ? depois.split(' ') : [];
  let j = 0;
  while (j < toksDepois.length && DESCRITOR_APARELHO.test(toksDepois[j]!)) j++;
  if (j < toksDepois.length) {
    const prox = primeiroIndice(SUBSTANTIVO_NAO_APARELHO, ` ${toksDepois.slice(j, j + 2).join(' ')} `);
    if (prox && prox.index <= 1 && !(j > 0 && /^\d+$/.test(toksDepois[j - 1]!))) return out('nao', ap.familia, 'acessorio_logo_apos_aparelho', prox.termo, true);
  }

  // 5. Preço compatível com o aparelho novo (quando conhecido).
  if (preco != null && preco > 0) {
    const piso = PISO_CENTAVOS[ap.familia];
    if (preco < piso) {
      return preco < piso * FRACAO_PISO_IMPOSSIVEL
        ? out('nao', ap.familia, 'preco_incompativel_com_aparelho', ap.termo)
        : out('ambiguo', ap.familia, 'preco_abaixo_do_piso_da_familia', ap.termo);
    }
  }

  return out('sim', ap.familia, 'aparelho_de_video_game', ap.termo);
}

/** Atalho booleano: só 'sim' é console. Ambíguo e não nunca entram em Consoles. */
export function ehConsoleDeVideoGame(titulo: string, preco?: number | null, atributos?: AtributosConsole): boolean {
  return avaliarConsoleVideoGame(titulo, preco, atributos).veredito === 'sim';
}
