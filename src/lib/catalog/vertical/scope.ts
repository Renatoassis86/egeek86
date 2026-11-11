// Sem 'server-only': funções puras (sem banco, sem rede), importáveis por coletor, scripts tsx e testes.

/**
 * ESCOPO DO TÍTULO (ata 2026-11-08, achados do dry-run 2): o domain_id do catálogo do ML às vezes deixa passar
 *   (1) PACOTES: "Samsung Smart Tv 55 4k U8000h + Samsung Smart Tv 32 Hd." (2 produtos num catálogo só);
 *   (2) ACESSÓRIO/PEÇA: "Assadeira Forma Air Fryer Philips Walita" dentro de MLB-AIR_FRYERS.
 * Nos dois casos o resultado é REVISÃO (nunca master automático, nunca rejeição definitiva), com motivo e termo.
 *
 * As regras são lexicais e explicáveis; cada uma tem uma salvaguarda contra falso positivo (ver testes).
 */

/** Minúsculas, sem acento, só [a-z0-9 ], espaços colapsados (cópia local para não criar ciclo com identity.ts). */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ScopeIssue {
  kind: 'combo' | 'acessorio' | 'nicho';
  reason: 'combo_pacote' | 'acessorio_ou_peca' | 'fora_do_nicho';
  /** Trecho que disparou (auditoria). */
  matched: string;
}

interface SegmentLexicon {
  /** Substantivo do próprio aparelho/produto do segmento (evidência positiva de que o título é o aparelho). */
  noun: RegExp;
  /** Termos de acessório/peça de reposição do segmento. */
  accessory: RegExp;
}

const GENERIC_ACCESSORY = 'cabo|capa|suporte|adaptador|pelicula|protetor|mochila|bolsa|garantia|brinde|bonus|gratis';

const LEX: Record<string, SegmentLexicon> = {
  'placa-de-video': {
    noun: /\b(placa de video|geforce|radeon|rtx|gtx|gpu)\b/,
    accessory: /\b(suporte|cabo|riser|backplate|bracket|waterblock|dissipador|adaptador|capa|fan|ventilador|pasta termica)\b/,
  },
  impressora: {
    noun: /\b(impressora|multifuncional)\b/,
    accessory: /\b(cartucho|cartuchos|tinta|tintas|refil|toner|cabecote|cabeca|fita|rolo|fusor|mola|suporte|cabo|capa|bulk|reservatorio|etiqueta|etiquetas|papel)\b/,
  },
  'impressora-3d': {
    noun: /\b(impressora 3d|impressora)\b/,
    accessory: /\b(filamento|filamentos|resina|bico|nozzle|hotend|extrusor|correia|mesa|cama|ventilador|fonte|suporte|cabo|capa|placa)\b/,
  },
  notebook: {
    noun: /\b(notebook|laptop|ultrabook|macbook|chromebook)\b/,
    accessory: /\b(carregador|fonte|bateria|tela|teclado|capa|mochila|bolsa|suporte|cabo|dobradica|cooler|pelicula|adaptador|dock|hub|tampa|base|protetor)\b/,
  },
  ssd: {
    noun: /\b(ssd|hd|hdd)\b/,
    accessory: /\b(case|gabinete|adaptador|cabo|dissipador|suporte|caddy|enclosure|carcaca|capa|bandeja)\b/,
  },
  soundbar: {
    noun: /\b(soundbar|sound bar|barra de som|home theater)\b/,
    accessory: /\b(suporte|controle|cabo|rack|painel|capa|antena|adaptador|fonte|subwoofer|pe|pes|pedestal|protetor)\b/,
  },
  'smart-tv': {
    noun: /\b(smart tv|tv|televisor|televisao)\b/,
    accessory: /\b(controle|tela|painel|placa|suporte|rack|capa|cabo|antena|pelicula|fonte|lente|conversor|pedestal|display|modulo|inversor|backlight|tira|base|pes|tampa|protetor|mainboard)\b/,
  },
  'air-fryer': {
    noun: /\b(air fryer|airfryer|fritadeira)\b/,
    accessory: /\b(assadeira|forma|cesto|cuba|grelha|espeto|espetos|tampa|resistencia|filtro|revestimento|papel|forro|tapete|suporte|capa|panela|bandeja|gaveta|peca|pecas|reposicao|acessorio|acessorios)\b/,
  },
  geladeira: {
    noun: /\b(geladeira|refrigerador|frigobar|freezer)\b/,
    accessory: /\b(prateleira|gaveta|borracha|vedacao|puxador|filtro|termostato|gaxeta|cesto|bandeja|porta ovos|peca|pecas|reposicao|capa|suporte)\b/,
  },
  'maquina-de-lavar': {
    noun: /\b(maquina de lavar|lavadora|lava e seca|lava seca)\b/,
    accessory: /\b(filtro|mangueira|base|suporte|capa|motor|bomba|correia|tampa|cesto|amortecedor|rolamento|placa|painel|peca|pecas|reposicao)\b/,
  },
  bola: {
    noun: /\b(bola|bolas)\b/,
    accessory: /\b(bomba|bolsa|saco|rede|capa|mochila|agulha|pino|calibrador|suporte|porta)\b/,
  },
  // ---- Segmentos novos (ampliação da semeadura, 2026-11-10) ----
  teclado: {
    noun: /\b(teclado|keyboard)\b/,
    accessory: /\b(keycap|keycaps|capa|protetor|cabo|descanso|apoio|extrator|lubrificante|kit de teclas)\b/,
  },
  mouse: {
    noun: /\b(mouse|mice)\b/,
    accessory: /\b(mousepad|pad|grip|skate|skates|feet|capa|cabo|suporte|bungee|receptor|dongle)\b/,
  },
  'headset-gamer': {
    noun: /\b(headset|fone|fones|headphone|auricular)\b/,
    accessory: /\b(almofada|almofadas|espuma|capa|case|suporte|cabo|adaptador|estojo|bag|haste|presilha|ear pads|earpads|cushion)\b/,
  },
  'fone-de-ouvido': {
    noun: /\b(fone|fones|headphone|headset|earbuds?|earphones?|auricular|airpods)\b/,
    accessory: /\b(almofada|almofadas|espuma|capa|case|suporte|cabo|adaptador|estojo|bag|haste|presilha|ear pads|earpads|cushion|ponteira|ponteiras|protetor)\b/,
  },
  monitor: {
    noun: /\b(monitor)\b/,
    accessory: /\b(suporte|braco|articulado|cabo|capa|pelicula|fonte|base|protetor|adaptador|filtro|painel)\b/,
  },
  'cadeira-gamer': {
    noun: /\b(cadeira|poltrona)\b/,
    accessory: /\b(rodinha|rodinhas|rodizio|rodizios|almofada|almofadas|apoio|capa|pistao|base|braco|bracos|encosto|forro|protetor|kit)\b/,
  },
  'memoria-ram': {
    noun: /\b(memoria|ram|ddr\d)\b/,
    accessory: /\b(dissipador|heatsink|suporte|cabo|adaptador|capa)\b/,
  },
  processador: {
    noun: /\b(processador|cpu|ryzen|intel core|core i\d)\b/,
    accessory: /\b(cooler|pasta termica|suporte|dissipador|adaptador|soquete|socket|ventoinha|water cooler|kit)\b/,
  },
  'caixa-de-som': {
    noun: /\b(caixa de som|caixa acustica|speaker|soundbox)\b/,
    accessory: /\b(suporte|capa|case|bag|cabo|bateria|controle|alca|tripe|pedestal|bolsa)\b/,
  },
  'robo-aspirador': {
    noun: /\b(robo aspirador|aspirador robo|aspirador|robot)\b/,
    accessory: /\b(filtro|filtros|escova|escovas|mop|pano|panos|bateria|dock|base|carregador|refil|refis|saco|sacos|reservatorio|kit|acessorio|acessorios|peca|pecas)\b/,
  },
  cafeteira: {
    noun: /\b(cafeteira|maquina de cafe|expresso|espresso)\b/,
    accessory: /\b(capsula|capsulas|filtro|filtros|porta filtro|jarra|vidro|reposicao|resistencia|bomba|garrafa|descalcificante|limpador|kit|peca|pecas)\b/,
  },
  esteira: {
    noun: /\b(esteira)\b/,
    accessory: /\b(correia|lona|lubrificante|oleo|silicone|tapete|capa|protetor|motor|placa|painel|sensor|rolo|peca|pecas|kit|manta)\b/,
  },
  'bicicleta-ergometrica': {
    noun: /\b(bicicleta|bike|ergometrica|spinning)\b/,
    accessory: /\b(pedal|pedais|selim|banco|capa|suporte|tapete|sensor|kit)\b/,
  },
};

/**
 * Exigência de NICHO por segmento (o domínio do ML é mais largo que o recorte do Espaço Geek 86):
 *  - `require`: o título precisa casar (ex.: cadeira gamer vive em MLB-OFFICE_CHAIRS; só entra a que diz "gamer");
 *  - `forbid`: o título NÃO pode casar (ex.: fone comum não pode ser headset gamer, que tem segmento próprio).
 * Falhou => revisão com reason 'fora_do_nicho' (nunca master automático, nunca rejeição definitiva).
 */
const NICHO: Record<string, { require?: RegExp; forbid?: RegExp }> = {
  teclado: { require: /\b(mecanico|mechanical|gamer|gaming|rgb|switch)\b/ },
  mouse: { require: /\b(gamer|gaming|rgb|dpi)\b/ },
  'headset-gamer': { require: /\b(headset|gamer|gaming)\b/ },
  'fone-de-ouvido': { forbid: /\b(gamer|gaming|headset)\b/ },
  'cadeira-gamer': { require: /\b(gamer|gaming)\b/ },
};

export function nichoIssue(segmentKey: string, name: string): ScopeIssue | null {
  const rule = NICHO[segmentKey];
  if (!rule) return null;
  const folded = fold(name);
  if (rule.forbid) {
    const m = rule.forbid.exec(folded);
    if (m) return { kind: 'nicho', reason: 'fora_do_nicho', matched: m[0] };
  }
  if (rule.require && !rule.require.test(folded)) return { kind: 'nicho', reason: 'fora_do_nicho', matched: 'sem_termo_do_nicho' };
  return null;
}

/** Segmentos sem léxico (livros: "capa dura" é legítimo; tênis: só revisão de qualquer forma). */
const NO_SCOPE_LEXICON = new Set(['livros', 'tenis-de-corrida']);

/** Palavras-especificação que NÃO são produto, mesmo parecendo código de modelo (ex.: gddr6, usb3, hdr10). */
const SPEC_TOKEN = /^(g?ddr\d*x?|usb\w*|hdmi\w*|wifi\d*|pcie\w*|pci|nvme|m2|hdr\d*|dolby\w*|dts\w*|atmos|bluetooth\w*|sata\w*|\d+k|\d+hz|\d+w|\d+gb|\d+tb|\d+mb|\d+l|\d+v|\d+p|\d+x|\d+gbps|\d+mbps|usbc|type\w*|ip\d+\w*|\d+d)$/;

function hasModelCodeOnly(part: string): boolean {
  const toks = part.split(' ').filter(Boolean);
  if (toks.length === 0 || toks.length > 3) return false;
  return toks.some((t) => t.length >= 5 && /[a-z]/.test(t) && /\d/.test(t) && !SPEC_TOKEN.test(t));
}

/** Pedaços separados por " +" (espaço antes do sinal). "S23+" (sinal colado) e "Dungeons & Dragons" não separam. */
export function splitPlus(name: string): string[] {
  return name
    .split(/\s\+/)
    .map((p) => fold(p))
    .filter(Boolean);
}

/**
 * Pacote/combo:
 *  A) "+" separando >= 2 pedaços que SÃO produto do segmento (contêm o substantivo do aparelho; ou, a partir do 2º
 *     pedaço, só um código de modelo curto: "Soundbar Hw-b450f + Hw-b400f"). Lista de especificações
 *     ("Dolby Atmos + DTS:X", "Wi-Fi + Bluetooth") não conta: não tem substantivo nem código de modelo.
 *  B) "+" juntando o aparelho a acessório/brinde ("Smart Tv 43 + Suporte", "Bola + Bomba").
 *  C) palavra de pacote com quantidade: "Kit 2 ...", "Kit com ...", "Combo ...", "Pacote ...", "Leve 2".
 *     "Kit Home Theater 5.1" (kit é o produto) NÃO dispara.
 */
export function comboIssue(segmentKey: string, name: string): ScopeIssue | null {
  if (NO_SCOPE_LEXICON.has(segmentKey)) return null;
  const lex = LEX[segmentKey];
  const folded = fold(name);

  const bundleWord = /\b(?:(kit|combo|pacote|conjunto)\s+(?:de\s+|com\s+|c\s+)?(?:\d+|com|c)\b|(combo|pacote)\b|leve\s+\d+)/.exec(folded);
  if (bundleWord) {
    return { kind: 'combo', reason: 'combo_pacote', matched: bundleWord[0] };
  }

  const parts = splitPlus(name);
  if (parts.length >= 2 && lex) {
    const isProduct = (p: string, idx: number) => lex.noun.test(p) || (idx > 0 && hasModelCodeOnly(p));
    const prod = parts.filter(isProduct).length;
    if (parts[0] && lex.noun.test(parts[0]) && prod >= 2) {
      return { kind: 'combo', reason: 'combo_pacote', matched: `+ (${parts.length} pedacos, ${prod} produtos)` };
    }
    const generic = new RegExp(`\\b(${GENERIC_ACCESSORY})\\b`);
    for (let i = 1; i < parts.length; i++) {
      const m = lex.accessory.exec(parts[i]) ?? generic.exec(parts[i]);
      if (m && !isProduct(parts[i], i)) return { kind: 'combo', reason: 'combo_pacote', matched: `+ ${m[0]}` };
    }
  }
  return null;
}

/**
 * Acessório/peça: o título COMEÇA pelo acessório (até a 4ª palavra) e o substantivo do aparelho, se aparecer, vem DEPOIS
 * ("Assadeira Forma Air Fryer", "Tela Hdr da Smart TV LG", "Controle Remoto Samsung Tv"); ou o padrão
 * "<coisa> para/compatível com <aparelho>" sem o aparelho antes de "para" ("Película para Smart Tv").
 * Aparelho legítimo não dispara: o substantivo vem primeiro ("Smart Tv 55 Tela Plana", "Air Fryer com Cesto", "Soundbar para Tv").
 */
export function accessoryIssue(segmentKey: string, name: string): ScopeIssue | null {
  if (NO_SCOPE_LEXICON.has(segmentKey)) return null;
  const lex = LEX[segmentKey];
  if (!lex) return null;
  const folded = fold(name);
  const tokenIdx = (charIdx: number) => (charIdx <= 0 ? 0 : folded.slice(0, charIdx).trim().split(' ').length);

  const acc = lex.accessory.exec(folded);
  const noun = lex.noun.exec(folded);
  if (acc) {
    const accTok = tokenIdx(acc.index);
    if (accTok <= 3 && (!noun || acc.index < noun.index)) {
      return { kind: 'acessorio', reason: 'acessorio_ou_peca', matched: acc[0] };
    }
  }
  if (noun) {
    const forRe = /\b(para|p|compativel com|compativel|serve em|cabe em)\s+(?:a |o |as |os |sua |seu )?/g;
    let m: RegExpExecArray | null;
    while ((m = forRe.exec(folded))) {
      const after = m.index + m[0].length;
      // O aparelho aparece logo depois de "para" e NÃO apareceu antes dele: o título descreve algo feito PARA o aparelho.
      if (noun.index >= after && noun.index - after <= 4 && noun.index > m.index) {
        return { kind: 'acessorio', reason: 'acessorio_ou_peca', matched: `${m[1]} ${noun[0]}` };
      }
    }
  }
  return null;
}

/** Combo primeiro (mais específico), depois acessório. */
export function scopeIssue(segmentKey: string, name: string): ScopeIssue | null {
  return comboIssue(segmentKey, name) ?? accessoryIssue(segmentKey, name) ?? nichoIssue(segmentKey, name);
}

// ---------------------------------------------------------------------------
// Variantes de cor (regra do dono: "cor junta", exceto tênis)
// ---------------------------------------------------------------------------

const COLOR_WORDS =
  /\b(cor\s?\d+|colorid[oa]s?|multicolor|preto|preta|branco|branca|azul|vermelho|vermelha|verde|amarelo|amarela|rosa|roxo|roxa|laranja|cinza|prata|prateado|prateada|dourado|dourada|grafite|marrom|bege|black|white|blue|red|green|silver|gold|pink|gray|grey|yellow|orange)\b/g;

/** Título sem palavras de cor (e sem "cor01"/"cor 10"): chave para achar a MESMA oferta em cores diferentes. */
export function colorlessTitleKey(title: string): string {
  const tokens = fold(title).replace(COLOR_WORDS, ' ').split(' ').filter(Boolean);
  return Array.from(new Set(tokens)).sort().join(' ');
}
