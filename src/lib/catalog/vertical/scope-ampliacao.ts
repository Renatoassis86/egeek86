// Sem 'server-only': dados puros do léxico (aparelho x acessório) e do recorte de nicho dos segmentos da ampliação de 2026-11-11.
// Importado por scope.ts; não importa nada (sem ciclo). Termos já em minúsculas, sem acento (o título passa por fold() antes).

export interface SegmentLexiconData {
  noun: RegExp;
  accessory: RegExp;
}

const w = (words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`);
const lex = (noun: string[], accessory: string[]): SegmentLexiconData => ({ noun: w(noun), accessory: w(accessory) });

const SPORT_BRANDS =
  'nike|adidas|puma|asics|olympikus|mizuno|fila|under armour|new balance|vans|converse|reebok|skechers|hoka|saucony|brooks|umbro|kappa|penalty|topper|mormaii|lacoste|diadora|oakley|jordan|new era|champion|quiksilver|billabong|columbia|speedo|everlast';

export const LEX_AMPLIACAO: Record<string, SegmentLexiconData> = {
  // ---- esporte ----
  tenis: lex(['tenis', 'sapatenis', 'tenisinho'], ['palmilha', 'palmilhas', 'cadarco', 'cadarcos', 'limpador', 'kit de limpeza', 'impermeabilizante', 'protetor', 'protetores', 'forma', 'esticador', 'saco', 'bolsa', 'sapateira', 'desodorante', 'spray', 'escova', 'cola', 'solado', 'salto', 'biqueira', 'cabedal', 'caixa', 'shampoo', 'detergente', 'esponja', 'apagador']),
  'sandalia-chinelo': lex(['chinelo', 'chinelos', 'sandalia', 'sandalias', 'slide', 'slides', 'papete', 'papetes', 'rasteira'], ['palmilha', 'solado', 'sapateira', 'suporte', 'organizador', 'cabide', 'saco', 'bolsa', 'limpador', 'tira avulsa', 'tiras', 'cordao', 'pantufa', 'pantufas', 'descartavel', 'hotel', 'spa', 'ortopedico', 'ortopedica']),
  chuteira: lex(['chuteira', 'chuteiras', 'society', 'futsal', 'tenis'], ['trava', 'travas', 'cadarco', 'palmilha', 'bolsa', 'sapateira', 'saco', 'protetor', 'limpador', 'kit', 'caneleira', 'meiao', 'meia', 'fita', 'capa', 'mochila', 'bomba', 'tornozeleira', 'sacola', 'porta']),
  'camisa-de-time': lex(['camisa', 'camiseta', 'jersey', 'uniforme', 'regata', 'agasalho', 'jaqueta', 'blusa', 'moletom'], ['patch', 'emblema', 'escudo', 'bordado', 'aplique', 'adesivo', 'cabide', 'moldura', 'quadro', 'display', 'expositor', 'capa', 'saco', 'estojo', 'short', 'shorts', 'calcao', 'meiao', 'meia', 'bermuda']),
  'meia-esportiva': lex(['meia', 'meias', 'meiao', 'meioes', 'sock', 'socks'], ['porta', 'cabide', 'organizador', 'suporte', 'saco', 'caixa', 'gancho', 'tape', 'fita', 'prendedor', 'elastico']),
  bone: lex(['bone', 'bones', 'viseira'], ['suporte', 'cabide', 'organizador', 'limpador', 'forma', 'molde', 'capa', 'caixa', 'porta', 'estojo', 'clip', 'ima', 'regulador', 'fecho', 'etiqueta', 'patch', 'aplique', 'kit de limpeza', 'lavador']),
  'mochila-esportiva': lex(['mochila', 'mochilas', 'sacola', 'pochete'], ['capa', 'protetor', 'organizador', 'alca', 'alcas', 'zipper', 'ziper', 'cadeado', 'chaveiro', 'fecho', 'etiqueta', 'identificador', 'rodinha', 'kit', 'ferragem', 'suporte', 'clip', 'gancho', 'porta']),
  'bolsa-de-treino': lex(['bolsa', 'bolsas', 'mala', 'sacola', 'duffel'], ['capa', 'protetor', 'organizador', 'alca', 'alcas', 'zipper', 'ziper', 'cadeado', 'chaveiro', 'fecho', 'etiqueta', 'identificador', 'kit', 'ferragem', 'suporte']),
  'luva-de-goleiro': lex(['luva', 'luvas'], ['bolsa', 'saco', 'bag', 'spray', 'limpador', 'lavador', 'cola', 'porta', 'cabide', 'fita', 'case', 'estojo', 'tape']),
  'luva-de-academia': lex(['luva', 'luvas', 'munhequeira', 'munhequeiras'], ['bolsa', 'saco', 'case', 'spray', 'limpador', 'porta', 'estojo']),
  caneleira: lex(['caneleira', 'caneleiras', 'protetor de canela'], ['bolsa', 'saco', 'bag', 'fita', 'tape', 'porta', 'elastico', 'prendedor', 'atadura']),
  'bola-de-basquete': lex(['bola', 'bolas'], ['bomba', 'bolsa', 'saco', 'rede', 'capa', 'mochila', 'agulha', 'pino', 'calibrador', 'suporte', 'porta', 'carrinho', 'cesta', 'tabela', 'aro', 'kit']),
  'bola-de-volei': lex(['bola', 'bolas'], ['bomba', 'bolsa', 'saco', 'rede', 'capa', 'mochila', 'agulha', 'pino', 'calibrador', 'suporte', 'porta', 'carrinho', 'poste', 'kit']),
  'raquete-de-tenis': lex(['raquete', 'raquetes'], ['corda', 'cordas', 'overgrip', 'grip', 'capa', 'bolsa', 'raqueteira', 'antivibrador', 'vibration', 'dampener', 'fita', 'bag', 'protetor', 'kit', 'mochila', 'cordao', 'bola', 'bolas']),
  'raquete-beach-tennis': lex(['raquete', 'raquetes'], ['corda', 'cordas', 'overgrip', 'grip', 'capa', 'bolsa', 'raqueteira', 'antivibrador', 'fita', 'bag', 'protetor', 'kit', 'mochila', 'bola', 'bolas', 'rede']),
  'faixa-elastica': lex(['faixa', 'faixas', 'elastico', 'elasticos', 'extensor', 'mini band', 'tubing'], ['bolsa', 'case', 'porta', 'ancora', 'suporte', 'gancho', 'ganchos', 'estojo']),
  'tornozeleira-de-peso': lex(['tornozeleira', 'tornozeleiras', 'peso', 'pesos', 'caneleira de peso', 'munhequeira'], ['bolsa', 'saco', 'case', 'porta', 'velcro', 'refil', 'areia']),
  halter: lex(['halter', 'halteres', 'dumbbell', 'par de halteres'], ['suporte', 'rack', 'prateleira', 'expositor', 'capa', 'bolsa', 'trava', 'travas', 'mola', 'presilha', 'clip', 'pegador', 'protetor', 'tapete', 'piso', 'tampa']),
  kettlebell: lex(['kettlebell', 'kettlebells'], ['suporte', 'rack', 'capa', 'bolsa', 'protetor', 'tapete', 'piso', 'corrente', 'cinto']),
  'tapete-de-yoga': lex(['tapete', 'tapetes', 'colchonete', 'mat', 'yoga mat', 'esteira de yoga'], ['bolsa', 'saco', 'case', 'cinta', 'alca', 'strap', 'toalha', 'capa', 'suporte', 'spray', 'limpador', 'porta', 'bag', 'estojo', 'cinto']),
  'corda-de-pular': lex(['corda', 'cordas'], ['bolsa', 'suporte', 'rolamento', 'cabo', 'manopla', 'punho', 'haste', 'peca', 'pecas', 'reposicao', 'contador', 'fita']),
  'garrafa-esportiva': lex(['garrafa', 'garrafas', 'squeeze', 'coqueteleira', 'shaker', 'cantil', 'caramanhola'], ['tampa', 'canudo', 'bico', 'alca', 'capa', 'porta', 'suporte', 'bolsa', 'escova', 'limpador', 'pastilha', 'isolador', 'refil', 'vedacao', 'anel', 'borracha', 'tampinha', 'case', 'protetor', 'bag', 'funil', 'bucha']),
  eliptico: lex(['eliptico', 'elipticos', 'transport'], ['pedal', 'pedais', 'sensor', 'capa', 'tapete', 'correia', 'display', 'painel', 'placa', 'peca', 'pecas', 'reposicao', 'kit', 'cabo', 'manivela', 'tampa', 'protetor', 'motor', 'rolamento']),
  'roupa-de-ciclismo': lex(['bermuda', 'camisa', 'camiseta', 'macacao', 'conjunto', 'jersey', 'culote', 'colete', 'bretelle', 'short', 'shorts', 'calca', 'casaco', 'jaqueta', 'agasalho', 'luva', 'luvas'], ['cabide', 'etiqueta', 'patch', 'aplique', 'saco', 'bolsa', 'zipper', 'ziper']),
  'roupa-de-compressao': lex(['manga', 'mangas', 'camisa', 'calca', 'legging', 'bermuda', 'short', 'shorts', 'meia', 'meias', 'top', 'regata', 'colete', 'compressao'], ['cabide', 'etiqueta', 'patch', 'saco', 'bolsa', 'zipper', 'ziper']),
  // ---- casa ----
  fogao: lex(['fogao', 'fogoes'], ['grelha', 'grelhas', 'trempe', 'trempes', 'queimador', 'queimadores', 'tampa', 'botao', 'knob', 'mangueira', 'regulador', 'valvula', 'vidro', 'acendedor', 'espalhador', 'cobertura', 'protetor', 'capa', 'peca', 'pecas', 'reposicao', 'pe', 'pes']),
  cooktop: lex(['cooktop', 'cooktops'], ['grelha', 'grelhas', 'trempe', 'trempes', 'queimador', 'mangueira', 'panela', 'frigideira', 'tampa', 'capa', 'protetor', 'adaptador', 'difusor', 'peca', 'pecas', 'reposicao']),
  'micro-ondas': lex(['micro ondas', 'microondas'], ['prato', 'giratorio', 'suporte', 'capa', 'tampa', 'cobertura', 'rack', 'forma', 'panela', 'vaporizador', 'recipiente', 'cesto', 'porta', 'filtro', 'touca', 'protetor', 'fusivel', 'magnetron', 'placa', 'peca', 'pecas', 'reposicao']),
  'lava-loucas': lex(['lava loucas', 'lava louca', 'lavadora de loucas'], ['detergente', 'sabao', 'sal', 'abrilhantador', 'pastilha', 'pastilhas', 'capsula', 'capsulas', 'cesto', 'cestos', 'suporte', 'mangueira', 'filtro', 'braco', 'aspersor', 'peca', 'pecas', 'reposicao', 'tampa', 'limpador', 'tablete', 'tabletes', 'finish', 'calgonit']),
  'aspirador-de-po': lex(['aspirador', 'aspiradora'], ['saco', 'sacos', 'filtro', 'filtros', 'bocal', 'escova', 'escovas', 'mangueira', 'bateria', 'cabo', 'tubo', 'haste', 'acessorio', 'acessorios', 'peca', 'pecas', 'reposicao', 'adaptador', 'refil', 'refis', 'rodinha', 'cabeca', 'cabecote', 'capa', 'suporte', 'bico', 'extensor', 'motor', 'carregador']),
  liquidificador: lex(['liquidificador', 'liquidificadores'], ['copo', 'jarra', 'helice', 'lamina', 'faca', 'facas', 'tampa', 'base', 'motor', 'vedacao', 'vedador', 'acoplamento', 'junta', 'suporte', 'capa', 'peca', 'pecas', 'reposicao', 'filtro', 'refil', 'adaptador', 'botao', 'rolamento']),
  batedeira: lex(['batedeira', 'batedeiras'], ['tigela', 'tigelas', 'bowl', 'batedor', 'batedores', 'haste', 'hastes', 'gancho', 'ganchos', 'tampa', 'capa', 'base', 'peca', 'pecas', 'reposicao', 'acessorio', 'motor', 'engrenagem', 'protetor', 'adaptador', 'jarra']),
  ventilador: lex(['ventilador', 'ventiladores', 'circulador', 'climatizador'], ['helice', 'helices', 'grade', 'grades', 'motor', 'capacitor', 'suporte', 'controle', 'base', 'tampa', 'capa', 'cabo', 'botao', 'peca', 'pecas', 'reposicao', 'protetor', 'filtro', 'telecomando', 'placa', 'painel']),
  'ar-condicionado': lex(['ar condicionado', 'ar cond', 'split'], ['controle', 'capa', 'suporte', 'filtro', 'filtros', 'mangueira', 'dreno', 'tubulacao', 'cobre', 'instalacao', 'limpador', 'gas', 'valvula', 'capacitor', 'placa', 'sensor', 'motor', 'helice', 'painel', 'protetor', 'cobertura', 'carenagem', 'bomba', 'peca', 'pecas', 'reposicao', 'adaptador', 'cabo']),
  'purificador-de-ar': lex(['purificador', 'purificadores', 'ionizador'], ['filtro', 'filtros', 'refil', 'refis', 'hepa', 'carvao', 'capa', 'peca', 'pecas', 'reposicao', 'controle', 'adaptador']),
  'panela-eletrica': lex(['panela eletrica', 'arrozeira', 'panela de arroz', 'multicooker', 'panela de pressao eletrica', 'panela de pressao', 'grill'], ['tampa', 'cuba', 'copo medidor', 'concha', 'cesto', 'vaporeira', 'resistencia', 'valvula', 'borracha', 'vedacao', 'anel', 'peca', 'pecas', 'reposicao', 'capa', 'forma', 'suporte', 'espatula', 'tigela', 'vedante', 'cabo', 'botao']),
  'ferro-de-passar': lex(['ferro', 'passadeira', 'estacao de passar'], ['tabua', 'base', 'sola', 'reservatorio', 'tanque', 'capa', 'forro', 'suporte', 'cabo', 'resistencia', 'termostato', 'peca', 'pecas', 'reposicao', 'cobertura', 'filtro', 'agua', 'anticalcario', 'jarra', 'tampa', 'protetor', 'refil', 'tapete']),
  'secadora-de-roupas': lex(['secadora', 'lava e seca', 'lava seca'], ['mangueira', 'filtro', 'duto', 'suporte', 'base', 'rack', 'empilhamento', 'peca', 'pecas', 'reposicao', 'bolinha', 'bolas', 'capa', 'cabo', 'sensor', 'correia', 'tambor', 'resistencia', 'rolamento', 'motor', 'placa', 'porta', 'vedacao', 'termostato', 'varal', 'cesto']),
  freezer: lex(['freezer', 'freezers', 'congelador', 'frigobar', 'adega'], ['prateleira', 'cesto', 'gaveta', 'borracha', 'vedacao', 'puxador', 'termostato', 'gaxeta', 'trava', 'cesta', 'divisoria', 'tampa', 'peca', 'pecas', 'reposicao', 'capa', 'suporte', 'rodizio', 'rodizios', 'pe', 'termometro', 'controlador', 'compressor', 'motor', 'filtro', 'condensador', 'fechadura', 'dobradica', 'etiqueta']),
  'forno-eletrico': lex(['forno', 'fornos'], ['forma', 'formas', 'assadeira', 'grelha', 'bandeja', 'pedra', 'tampa', 'resistencia', 'termostato', 'botao', 'vidro', 'lampada', 'luva', 'capa', 'suporte', 'peca', 'pecas', 'reposicao', 'tela', 'espeto', 'cobertura', 'porta', 'dobradica', 'trava', 'gabarito', 'cesto', 'rack', 'prateleira', 'ferramenta', 'filtro']),
  // ---- eletrônicos ----
  'camera-digital': lex(['camera', 'camara', 'mirrorless', 'dslr', 'reflex'], ['lente', 'lentes', 'bolsa', 'capa', 'case', 'bateria', 'carregador', 'cartao', 'tripe', 'tripod', 'flash', 'alca', 'cinta', 'filtro', 'protetor', 'pelicula', 'suporte', 'cabo', 'adaptador', 'controle', 'remoto', 'gabinete', 'visor', 'grip', 'mochila']),
  'camera-de-acao': lex(['camera', 'gopro', 'filmadora', 'action cam', 'osmo'], ['suporte', 'ventosa', 'housing', 'case', 'bateria', 'monopod', 'bastao', 'selfie', 'capa', 'mount', 'caixa', 'kit', 'carregador', 'cartao', 'tripe', 'protetor', 'pelicula', 'adaptador', 'cabo', 'alca', 'cinta', 'mochila']),
  'camera-de-seguranca': lex(['camera', 'cameras', 'cam'], ['suporte', 'fonte', 'cabo', 'capa', 'case', 'caixa', 'protetor', 'conector', 'balun', 'adaptador', 'cartao', 'bateria', 'painel', 'lente', 'cupula', 'carcaca']),
  projetor: lex(['projetor', 'projetores', 'datashow', 'data show'], ['suporte', 'tela', 'lampada', 'controle', 'bolsa', 'case', 'capa', 'cabo', 'filtro', 'lente', 'adaptador', 'tripe', 'painel', 'rack', 'mala', 'projecao']),
  tablet: lex(['tablet', 'ipad', 'galaxy tab', 'pad'], ['capa', 'case', 'pelicula', 'suporte', 'caneta', 'teclado', 'bateria', 'tela', 'display', 'touch', 'carregador', 'cabo', 'adaptador', 'bolsa', 'sleeve', 'pencil', 'stylus', 'protetor', 'kit', 'vidro', 'conector', 'flex', 'placa', 'dobradica', 'mochila', 'tripe', 'apoio', 'estojo']),
  'e-reader': lex(['kindle', 'e reader', 'ereader', 'kobo', 'leitor digital', 'boox'], ['capa', 'case', 'pelicula', 'protetor', 'suporte', 'luz', 'sleeve', 'bolsa', 'carregador', 'cabo', 'fonte', 'bateria', 'kit', 'adaptador', 'estojo', 'tampa', 'dock']),
  smartwatch: lex(['smartwatch', 'smart watch', 'watch', 'relogio inteligente', 'smartband', 'band', 'smart band', 'fit'], ['pulseira', 'pulseiras', 'correia', 'capa', 'case', 'pelicula', 'protetor', 'carregador', 'cabo', 'base', 'dock', 'suporte', 'bateria', 'fecho', 'fivela', 'bumper', 'aro', 'moldura', 'vidro', 'kit', 'adaptador', 'estojo']),
  carregador: lex(['carregador', 'carregadores', 'fonte', 'charger'], ['cabo', 'capa', 'suporte', 'case', 'adaptador', 'tomada', 'extensor', 'organizador', 'clip', 'protetor', 'plug', 'conector', 'porta', 'bolsa', 'estojo', 'base']),
  'power-bank': lex(['power bank', 'powerbank', 'carregador portatil', 'bateria externa', 'bateria portatil', 'carregador de emergencia'], ['capa', 'case', 'cabo', 'bolsa', 'estojo', 'suporte', 'adaptador', 'etiqueta', 'celula', 'celulas', 'placa', 'modulo', 'circuito', 'shell', 'caixa vazia']),
  'cabo-e-adaptador': lex(['cabo', 'cabos', 'adaptador', 'adaptadores', 'conversor', 'extensor', 'hdmi', 'displayport', 'usb', 'lightning', 'type c', 'cable'], ['organizador', 'protetor', 'presilha', 'clipe', 'abracadeira', 'suporte', 'bolsa', 'caixa', 'etiqueta', 'gancho', 'mola', 'capa', 'fita', 'velcro', 'canaleta', 'terminal', 'ferramenta', 'alicate', 'testador']),
  'hub-usb': lex(['hub', 'dock', 'docking', 'adaptador'], ['suporte', 'capa', 'cabo', 'fonte', 'case', 'bolsa', 'organizador', 'tampa', 'protetor']),
};

/** Recorte de nicho (mesma semântica de scope.ts NICHO): `require` precisa casar; `forbid` não pode casar. */
const MERCH = 'bolsa|chaveiro|caneca|almofada|toalha|bandeira|copo|boneco|miniatura|quadro|ima|adesivo|figurinha|album|bola|pelucia|cortina|capa de|lembranca|lembrancinha|porta|mochila|tapete|fantasia|cobertor|lencol|manta|panela|garrafa';

export const NICHO_AMPLIACAO: Record<string, { require?: RegExp; forbid?: RegExp }> = {
  tenis: { forbid: /\b(chinelo|chinelos|sandalia|sandalias|bota|botas|coturno|salto|social|pantufa|pantufas|sapato|sapatilha|rasteira|mocassim|bebe|recem nascido)\b/ },
  'sandalia-chinelo': { require: /\b(nike|adidas|puma|olympikus|fila|mizuno|umbro|kappa|under armour|new balance|reebok|skechers|rider|havaianas|asics|hoka|oakley|mormaii|penalty|topper|crocs)\b/, forbid: /\b(salto|plataforma feminina|anabela|infantil bebe|bebe|recem nascido|pantufa|pantufas|bota|botas|coturno|social|mocassim)\b/ },
  chuteira: { forbid: /\b(trava avulsa|travas|chinelo|sandalia|bola|meiao|caneleira)\b/ },
  'camisa-de-time': {
    require: /\b(camisa|camiseta|jersey|regata|agasalho|jaqueta|blusa|moletom)\b/,
    forbid: new RegExp(`\\b(conjunto|kit|combo|${MERCH})\\b`),
  },
  'meia-esportiva': { require: /\b(meia|meias|meiao|meioes|sock|socks)\b/, forbid: /\b(calca|pantufa|bebe|sapatilha descartavel|compressao medica|varizes)\b/ },
  bone: { require: new RegExp(`\\b(${SPORT_BRANDS}|esportivo|corrida|running|academia|treino|nba|nfl|mlb|flamengo|corinthians|palmeiras|sao paulo|santos|vasco|gremio|selecao|brasil)\\b`), forbid: /\b(touca|chapeu|palha|pescador|bebe|fantasia|festa|cowboy|country|lenco|bandana|gorro)\b/ },
  'mochila-esportiva': { require: new RegExp(`\\b(${SPORT_BRANDS}|esportiv[ao]|academia|treino|fitness|corrida|futebol|ciclismo|hidratacao|trekking)\\b`), forbid: /\b(escolar infantil personagem|pet|cachorro|gato|bebe|maternidade|lancheira|rodinhas?)\b/ },
  'bolsa-de-treino': { require: new RegExp(`\\b(${SPORT_BRANDS}|esportiv[ao]|academia|treino|fitness|duffel|futebol|ginastica)\\b`), forbid: /\b(maternidade|bebe|pet|termica|lancheira|cosmeticos|necessaire|carteira)\\b/ },
  'luva-de-goleiro': { require: /\b(goleiro|goalkeeper|keeper)\b/ },
  'luva-de-academia': { forbid: /\b(goleiro|moto|motociclista|ciclismo|descartavel|latex|nitrilica|cozinha|jardinagem|soldador|termica)\b/ },
  caneleira: { forbid: /\b(peso|tornozeleira|musculacao|ortopedica)\b/ },
  'bola-de-basquete': { require: /\b(basquete|basketball|nba)\b/ },
  'bola-de-volei': { require: /\b(volei|volleyball|voleibol)\b/ },
  'faixa-elastica': { forbid: /\b(cabelo|cabelos|tecido|costura|roupa|sutia|cinta modeladora|lingerie)\b/ },
  'tornozeleira-de-peso': { require: /\b(peso|pesos|kg|musculacao|treino|academia)\b/ },
  'garrafa-esportiva': { forbid: /\b(termica cafe|bule|infantil personagem|chaleira|jarra|vinho|bebe|mamadeira)\b/ },
  'tapete-de-yoga': { forbid: /\b(banheiro|cozinha|sala|quarto|porta|pet|antiderrapante banheiro|capacho|passadeira)\b/ },
  'roupa-de-ciclismo': { require: /\b(ciclismo|ciclista|bike|bicicleta|mtb|speed)\b/ },
  'roupa-de-compressao': { require: /\b(compressao|esportiv[ao]|treino|corrida|running|academia)\b/, forbid: /\b(varizes|medica|pos cirurgica|cirurgico|gestante|modeladora|cotovelo)\b/ },
  'forno-eletrico': { forbid: /\b(micro ondas|microondas|fogao|air fryer|airfryer|fritadeira|torradeira|toaster|pizza portatil)\b/ },
  'panela-eletrica': { forbid: /\b(air fryer|airfryer|fritadeira)\b/ },
  'ventilador': { forbid: /\b(exaustor|usb|portatil de mao|mini|mao|climatizador de ar evaporativo gamer|cooler)\b/ },
  'ar-condicionado': { forbid: /\b(portatil de veiculo|automotivo|caminhao|capa|controle remoto universal)\b/ },
  'camera-digital': { forbid: /\b(brinquedo|infantil de brinquedo|espia|oculta|webcam|descartavel|camera de seguranca|trilha|caca|videomonitoramento)\b/ },
  'camera-de-acao': { require: /\b(acao|gopro|osmo|insta360|sjcam|akaso|action|360|filmadora|4k|5k)\b/, forbid: /\b(dashcam|camera veicular|espia|oculta|brinquedo|seguranca residencial)\b/ },
  'camera-de-seguranca': { forbid: /\b(brinquedo|falsa|fake|simulada|dummy|espia oculta|veicular|dashcam)\b/ },
  projetor: { forbid: /\b(lampada para projetor|carro|veicular|brinquedo|infantil de historias|laser de luzes|estrelas|galaxia|luz noturna|abajur)\b/ },
  tablet: { forbid: /\b(tablet infantil de brinquedo|mesa digitalizadora|grafica|desenho digital|aprendizagem brinquedo|lousa)\b/ },
  'e-reader': { forbid: /\b(infantil de brinquedo)\b/ },
  smartwatch: { forbid: /\b(brinquedo|infantil de brinquedo|relogio analogico|relogio de pulso quartzo)\b/ },
  carregador: { forbid: /\b(power bank|powerbank|portatil|bateria externa|carregador de pilhas?|carregador de bateria|automotivo bateria)\b/ },
  'power-bank': { require: /\b(power bank|powerbank|portatil|bateria externa|bateria portatil|carregador portatil)\b/ },
  'hub-usb': { forbid: /\b(hub de energia|hub zigbee|hub inteligente|hub smart|ethernet apenas)\b/ },
};
