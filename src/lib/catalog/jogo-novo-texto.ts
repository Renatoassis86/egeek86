// R-119 (dono 2026-11-22): regras duras de TEXTO para o canal e a vitrine de GAMES. PURO.
//  (1) "so midia / sem caixa" = NAO NOVO (cartucho solto, disco solto, sem case, sem capa, sem manual...), em PT, EN e ES.
//  (2) "nao e jogo" = acessorio, bolsa, pacote de acessorio, controle, amiibo, cartao presente, assinatura, console, DLC avulso, codigo digital...
// Usado: vitrine de jogos, varredura de quarentena (todas as leituras publicas, mensagens e medias param de ver a oferta) e semeadura. So vale para o departamento games.

export const MOTIVO_JOGO_SO_MIDIA = 'jogo_so_midia_sem_caixa';
export const MOTIVO_NAO_JOGO = 'nao_jogo_acessorio';

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SO_MIDIA = new RegExp([
  // PT: apenas/somente/so (o|a) cartucho/disco/midia/jogo solto
  '\\b(apenas|somente|so|unicamente)\\s+(o\\s+|a\\s+|um\\s+|uma\\s+)?(cartucho|disco|midia|cd|game ?card|cartao de jogo)\\b',
  '\\b(cartucho|disco|midia|cd|game ?card)\\s+(solto|solta|avulso|avulsa|sem caixa|sem case)\\b',
  '\\b(jogo|game)\\s+(solto|solta|avulso)\\b',
  '\\bsem\\s+(a\\s+|o\\s+)?(caixa|case|capa|estojo|encarte|manual|embalagem|lacre|box)\\b',
  '\\b(caixa|case|capa|estojo|embalagem|lacre)\\s+(aberta|aberto|violad[oa]|rompid[oa]|rasgad[oa]|danificad[oa])\\b',
  // EN
  '\\b(loose|cart only|cartridge only|disc only|disk only|game only|cart-only|cartridge-only|no box|no case|without (the )?(box|case|manual|cover)|opened|open box|unsealed|no manual|disc only)\\b',
  // ES
  '\\b(solo|solamente|unicamente)\\s+(el\\s+|la\\s+)?(cartucho|disco|juego|cd)\\b',
  '\\bsin\\s+(la\\s+|el\\s+)?(caja|estuche|funda|manual|caratula|empaque|sello)\\b',
  '\\b(cartucho|disco)\\s+suelto\\b',
].join('|'));

/** O titulo (ou descricao) declara que o jogo vem sem caixa/so a midia/aberto: NAO e novo. Devolve o trecho que casou ou null. */
export function jogoSoMidia(texto: string | null | undefined): string | null {
  const m = SO_MIDIA.exec(sem(texto ?? ''));
  return m ? m[0].slice(0, 40) : null;
}

const NAO_JOGO = new RegExp([
  '\\b(pacote|bolsa|bolsinha|mochila|maleta|necessaire|estojo (para|de) (transporte|nintendo|switch|console)|case (para|protetor[a]?|rigid[oa]|de transporte)|capa protetora|capinha|protetor de tela|pelicula|skin|adesivo)\\b',
  '\\b(controle|controller|joystick|gamepad|volante|joy-?con|analogico|grip|thumb ?grip|alavanca|fliperama portatil)\\b',
  '\\b(suporte|dock|base de carregamento|carregador|fonte|adaptador|cabo|hub|memory card|cartao de memoria|sd card|micro ?sd)\\b',
  '\\b(headset|fone|fones|headphone|microfone|webcam|teclado|mouse|monitor|capture)\\b',
  '\\b(amiibo|figure|figuras?|figurine|action figure|boneco|boneca|pelucia|miniatura|chaveiro|caneca|camiseta|poster|quadro|colecionavel de parede)\\b',
  '\\b(cartao presente|cartao psn|cartao xbox|cartao nintendo|gift ?card|assinatura|subscription|game ?pass|nintendo switch online|playstation plus|psn plus|ps plus|xbox live|moedas|creditos|vbucks|v-bucks|robux|pontos)\\b',
  '\\b(console|video game portatil|kit console|bundle console)\\b',
  '\\b(dlc|expansion pass|passe de temporada|season pass|conteudo adicional|codigo digital|digital code|jogo digital|midia digital|download code|codigo de resgate|chave digital)\\b',
].join('|'));

/** Excecoes: titulo que e claramente um jogo mesmo com a palavra (ex.: "Control" em ingles nao entra; "jogo de console" nao e console). */
const EXCECAO_JOGO = /\b(jogo|game)\s+(de|para|do)\s+(console|videogame)\b/;

/** O titulo descreve algo que NAO e jogo (acessorio, bolsa, pacote de acessorio, cartao presente, assinatura, console, DLC, codigo digital). Devolve o termo ou null. */
export function naoEhJogoPorTexto(texto: string | null | undefined): string | null {
  const t = sem(texto ?? '');
  const m = NAO_JOGO.exec(t.replace(EXCECAO_JOGO, ' '));
  return m ? m[0].slice(0, 40) : null;
}

/** Atalho para as varreduras: motivo de quarentena (ou null) para um titulo de oferta do departamento games. So-midia vem primeiro. */
export function motivoJogoNaoNovoOuNaoJogo(titulo: string | null | undefined): { motivo: string; termo: string } | null {
  const a = jogoSoMidia(titulo);
  if (a) return { motivo: MOTIVO_JOGO_SO_MIDIA, termo: a };
  const b = naoEhJogoPorTexto(titulo);
  if (b) return { motivo: MOTIVO_NAO_JOGO, termo: b };
  return null;
}
