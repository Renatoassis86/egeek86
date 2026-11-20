// Sem 'server-only': classificação PURA de tipo de produto por departamento (sem banco, sem rede), testável.
import type { DepartamentoSlug } from '@/lib/catalog/departamentos';

/**
 * TIPOS DE PRODUTO POR DEPARTAMENTO (pedido do dono, 2026-11-12: "todos os itens de cada área, o máximo de
 * produtos por tipo").
 *
 * O tipo é DERIVADO do título do master aprovado (nunca inventado, nunca gravado no banco). Vence a regra cuja
 * palavra-chave aparece PRIMEIRO no título (o substantivo principal costuma abrir o título: "Cabo HDMI para TV" é
 * Cabos, não Smart TV; "Resina para Impressora 3D" é Resina; "SSD para Notebook" é SSD). Empate de posição: ordem da
 * lista. Sem regra que case => 'outros'.
 *
 * O texto é normalizado (minúsculas, sem acento, só letras/números) e as regras casam em fronteira de palavra.
 */

export interface TipoDef {
  slug: string;
  rotulo: string;
  /** Casa no título normalizado (sem acento, minúsculo, pontuação virou espaço). */
  re: RegExp;
}

export const TIPO_OUTROS = 'outros';
export const ROTULO_OUTROS = 'Outros';

/** Minúsculas, sem acento, só [a-z0-9] separados por espaço único, com espaço nas pontas (facilita fronteira). */
export function normalizarTitulo(s: string): string {
  const base = (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${base} `;
}

const r = (src: string) => new RegExp(src);

const ELETRONICOS: TipoDef[] = [
  { slug: 'cabos-acessorios', rotulo: 'Cabos e acessórios', re: r(' (cabo|cabos|hub|adaptador|controle remoto|pelicula|capa (para|de|protetora|case|anti)|suporte (para|de|articulado|fixo|universal|veicular|gamer)) ') },
  { slug: 'carregadores', rotulo: 'Carregadores e baterias', re: r(' (carregador|carregamento|charger|fonte (usb|turbo|universal|pd|tipo c)|conversor de voltagem|transformador|fonte carregador|power bank|powerbank|mobile power|bateria externa|pilha|pilhas) ') },
  { slug: 'soundbar', rotulo: 'Soundbar', re: r(' (soundbar|sound bar|home theater) ') },
  { slug: 'projetor', rotulo: 'Projetor', re: r(' (projetor|projector) ') },
  { slug: 'camera-seguranca', rotulo: 'Câmera de segurança', re: r(' (camera|cameras) .*(seguranca|vigilancia)| cftv ') },
  { slug: 'camera-acao', rotulo: 'Câmera de ação', re: r(' (camera|cameras|filmadora) .*(acao|sports|sportiva|action)| gopro | insta360 | osmo action ') },
  { slug: 'gimbal', rotulo: 'Gimbals e estabilizadores', re: r(' (gimbal|gimbals|estabilizador (de )?(camera|celular|smartphone)|osmo mobile|ronin) ') },
  { slug: 'lente-camera', rotulo: 'Lentes para câmera', re: r(' (lente|lentes|objetiva|teleobjetiva) (?=.*(\\d+ ?mm|canon|nikon|sony|sigma|tamron|fujifilm|samyang|viltrox|yongnuo|dslr|mirrorless))') },
  { slug: 'camera-foto', rotulo: 'Câmeras fotográficas', re: r(' (mirrorless|dslr|camera fotografica|camera instantanea|camera digital|camera compacta|camera infantil|coolpix|instax) ') },
  { slug: 'drone', rotulo: 'Drones', re: r(' (drone|drones) ') },
  { slug: 'tv-box', rotulo: 'TV Box e streaming', re: r(' (tv box|tvbox|fire tv|fire stick|chromecast|apple tv|mi box|streaming player) ') },
  { slug: 'microfone', rotulo: 'Microfones', re: r(' (microfone|microfones|lapela) ') },
  { slug: 'audio-hifi', rotulo: 'Receivers, amplificadores e toca-discos', re: r(' (receiver|amplificador|amplificadores|vitrola|toca discos|toca disco) ') },
  { slug: 'casa-inteligente', rotulo: 'Casa inteligente', re: r(' (lampada (inteligente|smart|wifi)|smart plug|tomada inteligente|fechadura (digital|eletronica|inteligente)|campainha (inteligente|wifi)|video porteiro|controle universal|echo dot|echo show|interruptor inteligente|sensor inteligente) ') },
  { slug: 'fones-tws', rotulo: 'Fones sem fio (TWS e earbuds)', re: r(' fone (de ouvido )?(bluetooth )?(sem fio )?(tws|true wireless|in ear|intra auricular|earbuds?) | (tws|earbuds?|airpods|galaxy buds|redmi buds|true wireless) ') },
  { slug: 'fones', rotulo: 'Fones de ouvido', re: r(' (fone|fones|headphone|headset|earbuds|earphone|tws|airpods) ') },
  { slug: 'caixa-amplificada', rotulo: 'Caixas amplificadas e party', re: r(' (caixa|caixinha) (de som )?(amplificada|acustica|party|karaoke|torre|potente|multiuso) | partybox | party box ') },
  { slug: 'caixa-de-som', rotulo: 'Caixas de som', re: r(' (caixa de som|caixinha de som|caixa som|caixa amplificada|caixa acustica|speaker|alto falante) ') },
  { slug: 'radio-portatil', rotulo: 'Rádios portáteis', re: r(' (radio|radios) (portatil|relogio|am fm|fm|retro|a pilha|bluetooth)| radio relogio ') },
  { slug: 'baba-eletronica', rotulo: 'Babás eletrônicas', re: r(' (baba eletronica|babas eletronicas|monitor de bebe|monitor para bebe) ') },
  { slug: 'smart-tv', rotulo: 'Smart TV', re: r(' (smart tv|tv|tvs|televisao|televisor) ') },
];

const CASA: TipoDef[] = [
  { slug: 'air-fryer', rotulo: 'Air fryer', re: r(' (air fryer|airfryer|fritadeira|fryer) ') },
  { slug: 'bebedouro', rotulo: 'Bebedouros e filtros de água', re: r(' (bebedouro|bebedouros|purificador de agua|filtro de agua|filtro de barro) ') },
  { slug: 'geladeira-freezer', rotulo: 'Geladeira e freezer', re: r(' (geladeira|refrigerador|freezer|frigobar) ') },
  { slug: 'lavadora-pressao', rotulo: 'Lavadoras de alta pressão', re: r(' (lavadora (de )?alta pressao|lavadora (de )?pressao|hidrolavadora|karcher) ') },
  { slug: 'lavadora-secadora', rotulo: 'Lavadora e secadora', re: r(' (lavadora|lava e seca|lava roupas|lava louca|secadora|tanquinho|maquina de lavar|lava loucas) ') },
  // R-108 (2026-11-20, variedade): tipos que ficavam dentro de outro e davam um turno só no rodízio. Os específicos vêm ANTES do geral (empate de posição = ordem da lista).
  { slug: 'climatizador', rotulo: 'Climatizadores e ar portátil', re: r(' (climatizador|climatizadores|ventilador climatizador|ar condicionado portatil) ') },
  { slug: 'adega-cervejeira', rotulo: 'Adegas e cervejeiras', re: r(' (adega|adegas|cervejeira|cervejeiras|expositor refrigerado) ') },
  { slug: 'ar-condicionado', rotulo: 'Ar-condicionado', re: r(' (ar condicionado|split|btus?) ') },
  { slug: 'coifa-depurador', rotulo: 'Coifas e depuradores', re: r(' (coifa|coifas|depurador|depuradores|exaustor de cozinha) ') },
  { slug: 'fogao-cooktop', rotulo: 'Fogão e cooktop', re: r(' (fogao|cooktop|exaustor) ') },
  { slug: 'micro-ondas', rotulo: 'Micro-ondas', re: r(' (micro ondas|microondas) ') },
  { slug: 'forno', rotulo: 'Fornos', re: r(' (forno|fornos) (?!.*(air fryer|airfryer|fryer))') },
  { slug: 'cadeirinha-auto', rotulo: 'Cadeirinhas infantis para auto', re: r(' (cadeirinha|cadeirinhas|bebe conforto|assento de elevacao|cadeira (infantil )?(para|de) (auto|carro)|cadeira de carro infantil|cadeira orbital|i size) ') },
  { slug: 'robo-aspirador', rotulo: 'Robôs aspiradores', re: r(' (robo aspirador|robo de limpeza|robo limpador|robo varredor|robot vacuum|robot aspirador|aspirador (de po )?robo|roborock) ') },
  { slug: 'extratora-limpeza', rotulo: 'Extratoras e higienizadoras', re: r(' (extratora|extratoras|higienizadora|higienizadoras|higienizador|spot cleaner|limpadora a vapor|lavadora de estofados|limpeza de carpetes|limpeza de sofa|limpador de carpetes) ') },
  { slug: 'aspirador-sem-fio', rotulo: 'Aspiradores verticais e sem fio', re: r(' (aspirador|aspiradora|vassoura eletrica) (?=.*(sem fio|vertical|portatil|de mao|ciclonico|recarregavel|dyson))| dyson (v[0-9]+|digital slim|omni|gen5) ') },
  { slug: 'aspirador', rotulo: 'Aspiradores', re: r(' (aspirador|aspiradora|vassoura eletrica) ') },
  { slug: 'ventilador-teto', rotulo: 'Ventiladores de teto', re: r(' (ventilador|ventiladores) de teto ') },
  { slug: 'ventilador', rotulo: 'Ventiladores', re: r(' (ventilador|circulador|ventiladores) ') },
  { slug: 'umidificador', rotulo: 'Umidificadores e desumidificadores', re: r(' (umidificador|umidificadores|desumidificador|desumidificadores) ') },
  { slug: 'purificador', rotulo: 'Purificadores de ar', re: r(' (purificador|purificadores|ozonizador|ionizador) (?!de agua)') },
  { slug: 'batedeira', rotulo: 'Batedeiras', re: r(' (batedeira|batedeiras|stand mixer) ') },
  { slug: 'liquidificador', rotulo: 'Liquidificadores', re: r(' (liquidificador|liquidificadores|blender) ') },
  { slug: 'processador-alimentos', rotulo: 'Processadores e mixers', re: r(' (processador de alimentos|mini processador|multiprocessador|processador|mixer|triturador|picador) ') },
  { slug: 'espremedor-suco', rotulo: 'Espremedores e extratores de suco', re: r(' (centrifuga|extrator de sucos|extrator de suco|juicer|espremedor|espremedores) ') },
  { slug: 'vaporizador-roupas', rotulo: 'Vaporizadores de roupas', re: r(' (vaporizador|vaporizadores|steamer|passadeira a vapor|passadeira) ') },
  { slug: 'ferro-passar', rotulo: 'Ferros de passar', re: r(' (ferro|ferros) (de passar|de engomar|a vapor|com vapor|vapor|eletrico|seco|para passar|de roupa|de roupas)| ferro passar ') },
  { slug: 'panela-eletrica', rotulo: 'Panelas elétricas e arrozeiras', re: r(' (panela eletrica|panela de pressao eletrica|panela de pressao digital|panela de arroz|arrozeira|multicooker|panela multifuncional|slow cooker) ') },
  { slug: 'sanduicheira-grill', rotulo: 'Sanduicheiras, grills e waffles', re: r(' (sanduicheira|grill|grelhador|waffle|wafleira|crepeira|pipoqueira|cuscuzeira|omeleteira|sorveteira|fondue|churrasqueira eletrica) ') },
  { slug: 'chaleira-eletrica', rotulo: 'Chaleiras elétricas', re: r(' (chaleira|chaleiras) ') },
  { slug: 'maquina-pao', rotulo: 'Máquinas de pão', re: r(' (maquina de pao|padeira|fabricante de pao) ') },
  { slug: 'cafeteira', rotulo: 'Cafeteiras', re: r(' (cafeteira|cafeteiras|maquina de cafe|cafe expresso) ') },
  { slug: 'torradeira', rotulo: 'Torradeiras', re: r(' (torradeira|torradeiras|tostador) ') },
  { slug: 'aquecedor-agua', rotulo: 'Aquecedores de água e chuveiros', re: r(' (aquecedor (eletrico )?(de|para) agua|aquecedor de passagem|boiler|chuveiro|chuveiros|ducha) ') },
  { slug: 'aquecedor', rotulo: 'Aquecedores de ambiente', re: r(' (aquecedor|aquecedores|termoventilador) ') },
  { slug: 'balanca-digital', rotulo: 'Balanças digitais', re: r(' (balanca|balancas|bioimpedancia) ') },
  { slug: 'maquina-costura', rotulo: 'Máquinas de costura', re: r(' (maquina de costura|maquina costura|maquinas de costura) ') },
];

const TECNOLOGIA: TipoDef[] = [
  // Ciência e tecnologia industrial (#60, 2026-11-15). Vêm ANTES dos tipos gerais: em empate de posição vence a ordem da lista
  // (ex.: "Scanner 3D" não é Scanner de documentos; "Fonte de bancada" não é Placa-mãe, fonte e gabinete).
  { slug: 'instrumentos-opticos', rotulo: 'Microscópios, telescópios e binóculos', re: r(' (microscopio|microscopios|estereomicroscopio|telescopio|telescopios|binoculo|binoculos|monoculo) ') },
  { slug: 'medicao-eletrica', rotulo: 'Multímetros, osciloscópios e fontes de bancada', re: r(' (multimetro|multimetros|osciloscopio|osciloscopios|analisador logico|alicate amperimetro|alicate multimetro|amperimetro|voltimetro|fonte de bancada|fonte ajustavel|fonte regulavel|fonte variavel) ') },
  { slug: 'medicao-precisao', rotulo: 'Paquímetros, balanças de precisão e medidores', re: r(' (paquimetro|paquimetros|micrometro|micrometros|relogio comparador|balanca de precisao|balanca analitica|balanca de laboratorio|termometro infravermelho|termometro laser|pirometro|camera termica|camera termografica|trena a laser|trena laser|medidor de distancia a laser|telemetro) ') },
  { slug: 'prototipagem', rotulo: 'Arduino, Raspberry Pi, ESP32 e prototipagem', re: r(' (arduino|raspberry|esp32|esp8266|jetson|stm32|micro bit|microbit|beaglebone|placa de desenvolvimento|microcontrolador) ') },
  { slug: 'estacao-solda', rotulo: 'Estações de solda e retrabalho', re: r(' (estacao de solda|estacao de retrabalho|estacao retrabalho|estacao de ar quente|ferro de solda digital) ') },
  { slug: 'fabricacao-digital', rotulo: 'Scanners 3D, CNC, laser e plotters de recorte', re: r(' (scanner 3d|escaner 3d|digitalizador 3d|cnc|fresadora cnc|gravadora a laser|gravador a laser|gravadora laser|cortadora a laser|cortadora laser|maquina a laser|laser engraver|plotter de recorte|plotter de corte|cortadora de vinil|cricut|silhouette cameo|silhouette portrait|scanncut) ') },
  { slug: 'nas-servidor', rotulo: 'NAS e servidores', re: r(' (nas (de rede|[0-9] baias?|[0-9] bay|synology|qnap|ugreen|asustor|terramaster)|servidor|servidores|synology|qnap|diskstation) ') },
  { slug: 'placa-de-video', rotulo: 'Placas de vídeo', re: r(' (placa de video|placa video|gpu|rtx|gtx|radeon rx|geforce) ') },
  { slug: 'ssd-hd', rotulo: 'SSD e HD', re: r(' (ssd|hdd|nvme|disco rigido|disco solido|hd externo|hd interno|hd sata) ') },
  { slug: 'notebook', rotulo: 'Notebooks', re: r(' (notebook|laptop|macbook|ultrabook|chromebook) ') },
  { slug: 'monitor', rotulo: 'Monitores', re: r(' (monitor|monitores) ') },
  { slug: 'impressora', rotulo: 'Impressoras', re: r(' (impressora|impressoras|multifuncional|ecotank) ') },
  { slug: 'processador', rotulo: 'Processadores', re: r(' (processador|ryzen|core i[3579]|intel core) ') },
  { slug: 'memoria-ram', rotulo: 'Memória RAM', re: r(' (memoria ram|ddr[345]|memoria ddr) ') },
  { slug: 'placa-mae-gabinete', rotulo: 'Placa-mãe, fonte e gabinete', re: r(' (placa mae|motherboard|gabinete|fonte atx|fonte 80|water cooler|cooler) | fonte .*(80 plus|atx|pfc|[0-9]{3,4}w) ') },
  { slug: 'headset', rotulo: 'Headsets', re: r(' (headset|headphone|fone) ') },
  { slug: 'ferramentas-eletricas', rotulo: 'Ferramentas elétricas', re: r(' (furadeira|furadeiras|parafusadeira|parafusadeiras|aparafusadeira|esmerilhadeira|esmerilhadeiras|lixadeira|lixadeiras|plaina eletrica|micro retifica|martelete|soprador termico|pistola de calor|serra (circular|tico tico|marmore|sabre|de bancada|esquadria)|tico tico|ferro de solda|ferro de soldar|soldador) ') },
  { slug: 'ferramentas-manuais', rotulo: 'Ferramentas manuais e kits', re: r(' (jogo de (chaves|soquetes|ferramentas)|kit de ferramentas|kit ferramentas|maleta de ferramentas|caixa de ferramentas|chave inglesa|torquimetro|chave combinada) ') },
  { slug: 'mousepad', rotulo: 'Mousepads', re: r(' (mousepad|mousepads|mouse pad) ') },
  { slug: 'mouse', rotulo: 'Mouses', re: r(' (mouse|mouses) ') },
  { slug: 'teclado', rotulo: 'Teclados', re: r(' (teclado|teclados) ') },
  { slug: 'roteador', rotulo: 'Roteadores e redes', re: r(' (roteador|repetidor|switch|access point|modem|placa de rede|cartao pcie|adaptador (usb )?wi ?fi|placa wi ?fi) ') },
  { slug: 'webcam', rotulo: 'Webcams', re: r(' (webcam) ') },
  { slug: 'armazenamento-portatil', rotulo: 'Pendrives e cartões de memória', re: r(' (pendrive|pen drive|flash drive|cartao de memoria|cartao sd|microsd|micro sd|microsdxc) ') },
  { slug: 'scanner', rotulo: 'Scanners', re: r(' (scanner|scanners) ') },
  { slug: 'nobreak', rotulo: 'Nobreaks', re: r(' (nobreak|no break|estabilizador de (tensao|energia)|estabilizador (bivolt|monovolt|1000|2000|300|500|600|1500)) ') },
  { slug: 'mesa-digitalizadora', rotulo: 'Mesas digitalizadoras', re: r(' (mesa digitalizadora|mesas digitalizadoras|tablet grafico|wacom|xp pen|huion) ') },
  { slug: 'captura', rotulo: 'Placas de captura', re: r(' (placa de captura|placas de captura|capturadora|capture card) ') },
  { slug: 'cadeira-gamer', rotulo: 'Cadeiras gamer', re: r(' (cadeira|cadeiras) (gamer|gaming|ergonomica|ergonomicas|de escritorio|presidente|para (pc|computador|escritorio|jogos))') },
  { slug: 'moveis-gamer', rotulo: 'Mesas, racks e estantes gamer', re: r(' (mesa (gamer|gaming|para (pc|computador|escritorio|jogos)|de (escritorio|computador))|escrivaninha gamer|rack (gamer|para (pc|computador))|estante gamer|bancada gamer) ') },
  { slug: 'computador-desktop', rotulo: 'Computadores e mini PCs', re: r(' (all in one|mini pc|desktop|computador|computadores|pc gamer) ') },
  { slug: 'celular', rotulo: 'Celulares e smartphones', re: r(' (celular|celulares|smartphone|smartphones|iphone|galaxy [asmz] ?\\d+|redmi|poco [xfm]\\d+|moto [gex]\\d+) ') },
  { slug: 'tablet-leitor', rotulo: 'Tablets e leitores', re: r(' (tablet|ipad|e reader|kindle|galaxy tab|tab [as]\\d+) ') },
  { slug: 'relogios', rotulo: 'Relógios inteligentes', re: r(' (smartwatch|smart watch|relogio inteligente|relogio smart|smartband|galaxy watch|apple watch|amazfit|mi band) ') },
];

const ESPORTE: TipoDef[] = [
  { slug: 'ciclismo-capacete-roupa', rotulo: 'Capacetes e roupas de ciclismo', re: r(' (capacete|capacetes) (de |para )?(ciclismo|bike|bicicleta|mtb|speed|urbano)|(bermuda|jersey|culote|macacao|camisa|roupa|jaqueta|colete|sapatilha) (de |para )?ciclismo ') },
  { slug: 'bicicleta', rotulo: 'Bicicletas', re: r(' (bicicleta|bike|ciclismo) ') },
  { slug: 'esteira-eliptico', rotulo: 'Esteiras e elípticos', re: r(' (esteira|eliptico|ergometrica|spinning) ') },
  { slug: 'badminton', rotulo: 'Badminton', re: r(' (raquete|raquetes|kit|conjunto)? ?(de )?(badminton|peteca|petecas) ') },
  { slug: 'tenis-de-mesa', rotulo: 'Tênis de mesa', re: r(' (raquete|raquetes) (de )?(ping pong|tenis de mesa)| (ping pong|tenis de mesa) |mesa de ping pong') },
  { slug: 'raquete-beach-tennis', rotulo: 'Raquetes de beach tennis', re: r(' (raquete|raquetes) (de )?beach tennis| beach tennis ') },
  { slug: 'raquete', rotulo: 'Raquetes', re: r(' (raquete|raquetes|beach tennis) ') },
  { slug: 'bola-pilates', rotulo: 'Bolas de pilates e suíça', re: r(' (bola|bolas) (de )?(pilates|suica|yoga|ginastica|fitness|overball|equilibrio) ') },
  { slug: 'bola-quadra', rotulo: 'Bolas de basquete, vôlei e handebol', re: r(' (bola|bolas) (de |do |para )?(basquete|volei|voleibol|futevolei|handebol|beach tennis|golfe|rugby|softbol|beisebol|tenis) ') },
  { slug: 'bola', rotulo: 'Bolas', re: r(' (bola|bolas) ') },
  { slug: 'chuteira', rotulo: 'Chuteiras', re: r(' (chuteira|chuteiras|tenis (society|futsal|de futsal|de futebol|de campo)) ') },
  { slug: 'tenis-corrida', rotulo: 'Tênis de corrida e caminhada', re: r(' (tenis|tenisinho) (de |para )?(corrida|running|caminhada|maratona) ') },
  { slug: 'chinelo-sandalia', rotulo: 'Chinelos e sandálias', re: r(' (chinelo|chinelos|sandalia|sandalias|slide|slides|papete|papetes) ') },
  { slug: 'tenis-calcado', rotulo: 'Tênis e sapatilhas', re: r(' (tenis|sapatilha|sapatenis|tenisinho) ') },
  { slug: 'halter-peso', rotulo: 'Halteres e pesos', re: r(' (halter|halteres|kettlebell|anilha|anilhas|tornozeleira|barra|barras|supino|caneleira de peso) ') },
  { slug: 'fitness', rotulo: 'Fitness e funcional', re: r(' (faixa de exercicio|faixa exercicio|escada de agilidade|estaca de agilidade|barreiras? de agilidade|step|jump box|box jump|aneis de ginastica|anel de ginastica|mini band|miniband|treino funcional|corda de pular|corda pular|corda|faixa elastica|elastico|tapete yoga|yoga|colchonete|pilates|abdominal|crossfit) ') },
  { slug: 'artes-marciais', rotulo: 'Artes marciais e boxe', re: r(' (kimono|kimonos|quimono|jiu jitsu|judo|karate|muay thai|luva (de )?(boxe|muay thai|mma|kickboxing)|luvas (de )?(boxe|muay thai|mma)|saco de pancada|saco de boxe|bandagem|bandagens) ') },
  { slug: 'protecao', rotulo: 'Luvas e proteção', re: r(' (luva|luvas|caneleira|caneleiras|joelheira|munhequeira|cotoveleira|manguito|protetor (de )?palma) | protetor (bucal|de canela|de joelho|de cotovelo|de tornozelo|de ombro|de punho|de cabeca|tibial|genital) ') },
  { slug: 'bolsas-mochilas', rotulo: 'Mochilas e bolsas', re: r(' (mochila|bolsa|mala (de )?(academia|esportiva|treino|ginastica)|sacola) ') },
  { slug: 'garrafas', rotulo: 'Garrafas e squeezes', re: r(' (garrafa|squeeze|coqueteleira|copo termico) ') },
  { slug: 'bones', rotulo: 'Bonés e acessórios', re: r(' (bone|bones|viseira|touca|pochete) ') },
  { slug: 'cama-elastica', rotulo: 'Camas elásticas e trampolins', re: r(' (cama elastica|camas elasticas|trampolim|trampolins|mini trampolim|pula pula) ') },
  { slug: 'jaqueta-esportiva', rotulo: 'Jaquetas e agasalhos esportivos', re: r(' (jaqueta|jaquetas|agasalho|agasalhos|corta vento|moletom|casaco esportivo|blusa termica|calca de treino) ') },
  { slug: 'rede-quadra', rotulo: 'Redes, traves e tabelas', re: r(' (rede|redes) (de )?(volei|futevolei|badminton|biribol|futebol|futsal|society|beach tennis|quadra)|(trave|traves|tabela de basquete|tabelas de basquete|poste de volei|coluna de volei|aro de basquete) ') },
  { slug: 'musculacao', rotulo: 'Estações e bancos de musculação', re: r(' (estacao de musculacao|estacao musculacao|multi estacao|banco (de )?musculacao|banco (reto|ajustavel|inclinavel|supino|olimpico|declinado)) ') },
  { slug: 'recuperacao', rotulo: 'Rolos e recuperação muscular', re: r(' (rolo (de )?(massagem|liberacao)|foam roller|massageador|pistola de massagem) ') },
  { slug: 'skate', rotulo: 'Skates e longboards', re: r(' (skate|skates|longboard|cruiser) ') },
  { slug: 'patins', rotulo: 'Patins', re: r(' (patins|patim|roller) ') },
  { slug: 'patinete', rotulo: 'Patinetes', re: r(' (patinete|patinetes|scooter) ') },
  { slug: 'natacao', rotulo: 'Natação', re: r(' (oculos (de )?natacao|touca (de )?natacao|nadadeira|nadadeiras|snorkel|pranchinha) ') },
  { slug: 'camping', rotulo: 'Camping', re: r(' (camping|acampamento|barraca|barracas|saco de dormir|fogareiro|lampiao|colchonete inflavel) ') },
  { slug: 'trilha-camping', rotulo: 'Trilha e montanhismo', re: r(' (trekking|montanhismo|bastao (de )?(caminhada|trekking)|polainas|mochila cargueira|lanterna de cabeca) ') },
  { slug: 'pesca', rotulo: 'Pesca', re: r(' (vara de pescar|vara de pesca|molinete|carretilha|pesca) ') },
  { slug: 'suplementos', rotulo: 'Suplementos', re: r(' (whey|creatina|omega|vitamina|vitafor|bcaa|pre treino|colageno|hipercalorico|glutamina|multivitaminico|termogenico) ') },
  { slug: 'meias-roupas', rotulo: 'Meias e roupas', re: r(' (meia|meias|camisa|camiseta|short|bermuda|legging) ') },
];

const IMPRESSAO3D: TipoDef[] = [
  { slug: 'filamentos', rotulo: 'Filamentos', re: r(' (filamento|filamentos) ') },
  { slug: 'resinas', rotulo: 'Resinas', re: r(' (resina|resinas) ') },
  { slug: 'pecas', rotulo: 'Peças e acessórios', re: r(' (bico|nozzle|hotend|extrusora|mesa (aquecida|de impressao|magnetica|flexivel|pei|de vidro|de construcao)|placa pei|ptfe|correia|ventoleira|placa de impressao|spatula|espatula|lamina|fita (kapton|pei|termica|isolante)) ') },
  { slug: 'lavagem-cura', rotulo: 'Lavagem e cura de resina', re: r(' (kit de lavagem|lavagem e cura|estacao de lavagem|wash and cure|wash cure|curadora|lavadora e curadora) ') },
  { slug: 'secador-filamento', rotulo: 'Secadores de filamento', re: r(' (secador de filamento|secadora de filamento|dry ?box|dryer) ') },
  { slug: 'ferramentas', rotulo: 'Ferramentas de acabamento', re: r(' (kit de acabamento|alicate|limas|raspador|raspadora|espatula|estilete|ferramenta raspadora) ') },
  { slug: 'impressoras', rotulo: 'Impressoras 3D', re: r(' (impressora|impressoras|printer) ') },
];

const LIVROS: TipoDef[] = [
  { slug: 'manga', rotulo: 'Mangás', re: r(' (manga|mangas|naruto|one piece|jujutsu|demon slayer|kimetsu|chainsaw man|berserk|vagabond|dragon ball|attack on titan|shingeki|my hero|boku no hero|spy x family|death note|fullmetal|tokyo ghoul|bleach|blue lock|vinland|kaiju|oshi no ko|frieren|sakamoto days|dandadan|solo leveling|dr stone|haikyuu|hunter x hunter|newpop|pipoca e nanquim) ') },
  { slug: 'hq-manga', rotulo: 'HQs e quadrinhos', re: r(' (hq|hqs|quadrinhos|quadrinho|graphic novel|graphic novels|panini|kotoyama) ') },
  { slug: 'rpg', rotulo: 'RPG de mesa', re: r(' (rpg|pathfinder|old dragon|3det|savage worlds|savage pathfinder|cthulhu|dungeons|d d|dark eye|vampiro a mascara|jyhad|ordem paranormal|cellbit|jambo editora|tormenta (20|alpha|daemon|rpg)|vendeta oculta) ') },
  { slug: 'programacao', rotulo: 'Programação e tecnologia', re: r(' (programacao|algoritmo|algoritmos|javascript|python|java|full stack|software|estruturas de dados|linguagem de programacao|banco de dados|sql|analise de dados|ciencia de dados|orientacao a objetos|orientada a objetos|c ) ') },
  { slug: 'fantasia-ficcao', rotulo: 'Fantasia e ficção científica', re: r(' (fantasia|ficcao cientifica|distopia|cyberpunk|harry potter|senhor dos aneis|hobbit|game of thrones|guerra dos tronos|duna|fundacao|witcher|percy jackson|narnia|mistborn|trono de vidro|fourth wing|a roda do tempo|sanderson|tolkien) ') },
  { slug: 'policial-suspense', rotulo: 'Policial, suspense e terror', re: r(' (thriller|suspense|policial|misterio|terror|agatha christie|sherlock holmes|stephen king|harlan coben|gillian flynn|dan brown|jo nesbo|lovecraft|edgar allan poe|dracula|frankenstein|stieg larsson|freida mcfadden|vampiro) ') },
  { slug: 'infantojuvenil', rotulo: 'Infantil e juvenil', re: r(' (infantil|infantojuvenil|juvenil|diario de um banana|pequeno principe|turma da monica|peppa|bluey|dog man|menino do pijama|culpa e das estrelas|jogos vorazes|monteiro lobato|ruth rocha|ziraldo|ciranda cultural|todolivro) ') },
  { slug: 'classicos', rotulo: 'Clássicos da literatura', re: r(' (classico|classicos|dom casmurro|machado de assis|orgulho e preconceito|crime e castigo|miseraveis|morro dos ventos uivantes|moby dick|metamorfose|grande sertao|capitaes da areia|cem anos de solidao|apanhador|grande gatsby|jane austen|dostoievski|tolstoi|george orwell|revolucao dos bichos|fernando pessoa|drummond|clarice lispector|guimaraes rosa|jorge amado|lima barreto|cortico|memorias postumas) ') },
  { slug: 'biblia-teologia', rotulo: 'Bíblia, teologia e vida cristã', re: r(' (biblia|biblias|teologia|devocional|cristianismo|cristao|cristaos|c s lewis|spurgeon|tim keller|john piper|peregrino|grudem) ') },
  { slug: 'financas-negocios', rotulo: 'Finanças e desenvolvimento pessoal', re: r(' (pai rico|investidor inteligente|psicologia financeira|habitos atomicos|rapido e devagar|mindset|essencialismo|arte da guerra|trabalho focado|poder do habito|fazer amigos|mente milionaria|homem mais rico da babilonia|investimentos|financas|riqueza|startup enxuta|pense e enriqueca|produtividade|empreendedorismo|desenvolvimento pessoal) ') },
  { slug: 'biografia-ciencia', rotulo: 'Biografias e ciência popular', re: r(' (biografia|biografias|autobiografia|memorias|sapiens|homo deus|armas germes e aco|breve historia do tempo|cosmos|gene egoista|astrofisica|steve jobs|elon musk|ayrton senna|anne frank|michelle obama|churchill|napoleao|carl sagan|stephen hawking) ') },
  { slug: 'artes-design', rotulo: 'Artes, design e música', re: r(' (design grafico|fotografia|teoria das cores|desenho|ilustracao|tipografia|storyboard|arquitetura|teoria musical|violao|piano|cinema|roteiro|taschen|historia da arte|ux design|arte moderna|pintura) ') },
  { slug: 'romance', rotulo: 'Romance e ficção', re: r(' (romance|romances|ficcao|novela|conto|contos) ') },
  { slug: 'ciencias-engenharia', rotulo: 'Ciências e engenharia', re: r(' (engenharia|matematica|algebricas|algebra|fisica|quimica|inteligencia artificial|estatistica|calculo|asp net|vb net) ') },
  { slug: 'guias-games', rotulo: 'Guias de games', re: r(' (guia oficial|guia de estrategia|call of duty) ') },
  { slug: 'direito-negocios', rotulo: 'Direito e negócios', re: r(' (direito|juridico|contabil|administracao|marketing|negocios|gestao|lideranca|inovacao|economia|empresarial|inteligencia competitiva|concurso|concursos) ') },
  { slug: 'humanidades', rotulo: 'História, filosofia e sociedade', re: r(' (historia|historiografia|filosofia|sociologia|politica|antropologia|geografia|religiao|parentesco|estruturas de poder) ') },
  { slug: 'idiomas', rotulo: 'Idiomas e gramática', re: r(' (lingua|ingles|espanhol|japones|japonesa|gramatica|dicionario) ') },
  { slug: 'culinaria', rotulo: 'Culinária', re: r(' (receitas|culinaria|gastronomia) ') },
  { slug: 'saude', rotulo: 'Saúde e bem-estar', re: r(' (medicina|saude|psicologia|autoajuda|coaching|nutricao|diagnostico|oncologia|inteligencia emocional|inteligencia relacional|inteligencia social) ') },
];

// BELEZA (dono, 2026-11-17: "principalmente maquiagens, de preferência das melhores marcas"). Maquiagem abre a lista (vence empate de posição).
const BELEZA: TipoDef[] = [
  { slug: 'batom-labios', rotulo: 'Batons e lábios', re: r(' (batom|batons|lip tint|gloss|labial|lapis labial|lip oil|balm labial|hidratante labial|lip liner|liquid lip) ') },
  { slug: 'base-corretivo', rotulo: 'Bases e corretivos', re: r(' (base liquida|base facial|base de maquiagem|base mate|base matte|base stick|corretivo|primer|bb cream|cc cream|skin tint|fundacao|foundation|concealer) ') },
  { slug: 'po-blush-iluminador', rotulo: 'Pós, blush e iluminadores', re: r(' (po compacto|po facial|po solto|po translucido|blush|rubor|iluminador|bronzer|contorno|highlighter|setting powder|fixador de maquiagem|spray fixador) ') },
  { slug: 'olhos', rotulo: 'Olhos e sobrancelhas', re: r(' (sombra|sombras|paleta de sombras|paleta|mascara de cilios|mascara para cilios|rimel|delineador|lapis de olho|kajal|sobrancelha|gel de sobrancelha|cilios) ') },
  { slug: 'unhas', rotulo: 'Unhas', re: r(' (esmalte|esmaltes|acetona|base fortalecedora|top coat|removedor de esmalte|gel para unhas) ') },
  { slug: 'protetor-solar', rotulo: 'Protetores solares', re: r(' (protetor solar|filtro solar|bloqueador solar|sunscreen|fps ?[0-9]+) ') },
  { slug: 'skincare', rotulo: 'Skincare', re: r(' (medicube|serum|sérum|hidratante facial|pad|pads|almofada|almofadas|eye cream|jelly cream|cream|creme capsula|creme facial|balm demaquilante|gel demaquilante|booster|toner|essence|peptide|kojic|cica|protetor solar|filtro solar|limpeza facial|sabonete facial|esfoliante facial|tonico facial|agua micelar|creme anti idade|anti idade|acido hialuronico|vitamina c|retinol|niacinamida|mascara facial|contorno dos olhos) ') },
  { slug: 'secador-prancha', rotulo: 'Secadores e pranchas', re: r(' (secador|secadores|secador de cabelo|prancha|pranchas|chapinha|babyliss|modelador|alisador|escova secadora|escova rotativa|ondulador) ') },
  { slug: 'barbeador-aparador', rotulo: 'Barbeadores e aparadores', re: r(' (barbeador|barbeadores|aparador|aparadores|depilador|depiladores|trimmer|maquina de cortar cabelo|maquina de acabamento|lamina de barbear) ') },
  { slug: 'shampoo-condicionador', rotulo: 'Shampoos e condicionadores', re: r(' (shampoo|shampoos|condicionador|condicionadores|co wash) ') },
  { slug: 'cabelo', rotulo: 'Cabelo (tratamento e finalizador)', re: r(' (mascara capilar|treatment|tratamento capilar|bonacure|osis|igora|gliss|silhouette|pasta modeladora|leave in|oleo capilar|finalizador|creme para pentear|escova progressiva|tintura|coloracao|ampola capilar|botox capilar|reparador de pontas) ') },
  { slug: 'perfume-masculino', rotulo: 'Perfumes masculinos', re: r(' (perfume|perfumes|eau de parfum|eau de toilette|colonia|parfum|deo colonia) (?=.*(masculino|homem|men|pour homme|for men|him|uomo|man))') },
  { slug: 'perfume-feminino', rotulo: 'Perfumes femininos', re: r(' (perfume|perfumes|eau de parfum|eau de toilette|colonia|parfum|deo colonia) (?=.*(feminino|mulher|women|pour femme|for her|donna|ladies|girl|woman|her))') },
  { slug: 'perfumaria', rotulo: 'Perfumes', re: r(' (perfume|perfumes|eau de parfum|eau de toilette|colonia|body splash|parfum|deo colonia) ') },
  { slug: 'hidratante-corporal', rotulo: 'Hidratantes corporais', re: r(' (hidratante corporal|hidratantes corporais|body lotion|locao hidratante|manteiga corporal|creme corporal|oleo corporal) ') },
  { slug: 'corpo-banho', rotulo: 'Corpo e banho', re: r(' (hidratante corporal|body lotion|oleo corporal|sabonete liquido|esfoliante corporal|desodorante|creme para as maos|creme para os pes) ') },
  { slug: 'acessorios-maquiagem', rotulo: 'Pincéis e acessórios', re: r(' (pincel|pinceis|esponja de maquiagem|beauty blender|kit de pinceis|necessaire|curvex|curvador de cilios|espelho de maquiagem) ') },
];

// BRINQUEDOS E COLECIONAVEIS (dono, 2026-11-20, R-105). Marca/linha forte abre cada tipo; peca, refil e acessorio avulso nao entram (gate.ts).
const BRINQUEDOS: TipoDef[] = [
  { slug: 'lego-blocos', rotulo: 'LEGO e blocos de montar', re: r(' (lego|playmobil|blocos de montar|bloco de montar) ') },
  { slug: 'action-figure', rotulo: 'Bonecos e action figures', re: r(' (action figure|action figures|funko|funko pop|marvel legends|figuarts|s h figuarts|nendoroid|figma|boneco colecionavel|figure colecionavel|hot toys|banpresto|pop mart|labubu) ') },
  { slug: 'miniatura-carrinho', rotulo: 'Carrinhos e miniaturas', re: r(' (hot wheels|matchbox|maisto|majorette|greenlight|burago|carrinho colecionavel|miniatura de carro|miniatura colecionavel) ') },
  { slug: 'jogo-tabuleiro', rotulo: 'Jogos de tabuleiro e cartas', re: r(' (jogo de tabuleiro|tabuleiro|baralho|pokemon tcg|booster|magic the gathering|banco imobiliario|jogo da vida|catan|carcassonne|ticket to ride|dixit|uno|jogo de cartas|card game) ') },
  { slug: 'quebra-cabeca', rotulo: 'Quebra-cabeças', re: r(' (quebra cabeca|quebra cabecas|puzzle|cubo magico|rubik) ') },
  { slug: 'pelucia', rotulo: 'Pelúcias', re: r(' (pelucia|pelucias|plush|jellycat) ') },
  { slug: 'boneca', rotulo: 'Bonecas', re: r(' (boneca|bonecas|barbie|monster high|polly pocket|baby alive|lol surprise|bratz|rainbow high) ') },
  { slug: 'replica-estatua', rotulo: 'Réplicas e estátuas', re: r(' (estatua|estatuas|replica|busto|diorama|sabre de luz|infinity gauntlet) ') },
  { slug: 'kits-montar', rotulo: 'Kits de montar', re: r(' (gunpla|gundam|model kit|kit de montar|maquete|revell|tamiya) ') },
];

export const TIPOS_POR_DEPT: Record<DepartamentoSlug, readonly TipoDef[]> = {
  brinquedos: BRINQUEDOS,
  beleza: BELEZA,
  eletroeletronicos: ELETRONICOS,
  eletrodomesticos: CASA,
  tecnologia: TECNOLOGIA,
  esporte: ESPORTE,
  impressao3d: IMPRESSAO3D,
  livros: LIVROS,
};

/** Slug do tipo de um produto (ou 'outros'). Função pura. */
export function classificarTipo(dept: string, titulo: string): string {
  const defs = (TIPOS_POR_DEPT as Record<string, readonly TipoDef[] | undefined>)[dept];
  if (!defs) return TIPO_OUTROS;
  const t = normalizarTitulo(titulo);
  let melhor: string = TIPO_OUTROS;
  let pos = Infinity;
  for (const d of defs) {
    const m = d.re.exec(t);
    if (m && m.index < pos) {
      pos = m.index;
      melhor = d.slug;
    }
  }
  return melhor;
}

/**
 * Loja de Impressao 3D em 3 SECOES (dono, 2026-11-15, #63): Impressoras, Filamentos e Demais itens (resinas, secadores, lavagem e cura,
 * ferramentas e o resto que passa nas regras). `demais` e um filtro de secao (todo tipo que nao e impressora nem filamento), nao um tipo de titulo.
 */
export const TIPO_3D_DEMAIS = 'demais';
export const SECOES_3D = [
  { slug: 'impressoras', rotulo: 'Impressoras', ancora: 'impressoras' },
  { slug: 'filamentos', rotulo: 'Filamentos', ancora: 'filamentos' },
  { slug: TIPO_3D_DEMAIS, rotulo: 'Demais itens', ancora: 'demais-itens' },
] as const;
/** true se o tipo de titulo pertence ao filtro `tipo` do departamento (trata `demais` da Impressao 3D). */
export function tipoPertenceAoFiltro(dept: string, tipoDoMaster: string, filtro: string): boolean {
  if (dept === 'impressao3d' && filtro === TIPO_3D_DEMAIS) return tipoDoMaster !== 'impressoras' && tipoDoMaster !== 'filamentos';
  return tipoDoMaster === filtro;
}

export function rotuloTipo(dept: string, slug: string): string | null {
  if (dept === 'impressao3d' && slug === TIPO_3D_DEMAIS) return 'Demais itens';
  if (slug === TIPO_OUTROS) return ROTULO_OUTROS;
  const defs = (TIPOS_POR_DEPT as Record<string, readonly TipoDef[] | undefined>)[dept];
  return defs?.find((d) => d.slug === slug)?.rotulo ?? null;
}

export interface TipoContagem {
  slug: string;
  rotulo: string;
  n: number;
}

/**
 * Contagem por tipo a partir dos títulos reais; só tipos com pelo menos 1 produto; ordem decrescente de contagem
 * ('Outros' sempre por último).
 */
export function contarTipos(dept: string, titulos: readonly string[]): TipoContagem[] {
  const m = new Map<string, number>();
  for (const t of titulos) {
    const s = classificarTipo(dept, t);
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  const out: TipoContagem[] = [];
  for (const [slug, n] of m) {
    const rotulo = rotuloTipo(dept, slug);
    if (rotulo && n > 0) out.push({ slug, rotulo, n });
  }
  return out.sort((a, b) => (a.slug === TIPO_OUTROS ? 1 : b.slug === TIPO_OUTROS ? -1 : b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR')));
}

/** Valida o parâmetro ?tipo= contra a lista do departamento (aceita só slug conhecido, ou null). */
export function normalizarTipo(dept: string, v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().slice(0, 40);
  return rotuloTipo(dept, s) ? s : null;
}
