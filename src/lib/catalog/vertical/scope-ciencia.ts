// Sem 'server-only': dados puros do léxico (aparelho x acessório) e do recorte de nicho dos segmentos de ciência e tecnologia
// industrial (#60, 2026-11-15; config-ciencia.ts). Importado por scope.ts; não importa nada além do tipo (sem ciclo).
// Termos em minúsculas e sem acento (o título passa por fold() antes).
import type { SegmentLexiconData } from './scope-ampliacao';

const w = (words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`);
const lex = (noun: string[], accessory: string[]): SegmentLexiconData => ({ noun: w(noun), accessory: w(accessory) });

export const LEX_CIENCIA: Record<string, SegmentLexiconData> = {
  microscopio: lex(['microscopio', 'microscopios', 'estereomicroscopio'], ['lamina', 'laminas', 'laminula', 'ocular', 'objetiva', 'lente avulsa', 'adaptador', 'camera avulsa', 'capa', 'suporte', 'kit de laminas', 'corante', 'peca', 'pecas', 'reposicao', 'lampada', 'iluminador avulso', 'base']),
  telescopio: lex(['telescopio', 'telescopios', 'luneta astronomica'], ['ocular', 'oculares', 'filtro', 'filtros', 'tripe', 'adaptador', 'barlow', 'capa', 'buscador', 'suporte', 'lente avulsa', 'peca', 'pecas', 'reposicao', 'lanterna', 'mapa', 'planisferio']),
  binoculo: lex(['binoculo', 'binoculos', 'monoculo'], ['capa', 'alca', 'tripe', 'adaptador', 'estojo', 'bolsa', 'tampa', 'ocular avulsa', 'protetor', 'suporte', 'peca', 'pecas', 'reposicao']),
  multimetro: lex(['multimetro', 'multimetros', 'alicate amperimetro', 'alicate multimetro', 'amperimetro', 'voltimetro'], ['ponteira', 'ponteiras', 'cabo de teste', 'garra', 'garras', 'capa', 'estojo', 'maleta vazia', 'fusivel', 'bateria', 'pilha', 'adaptador', 'sonda', 'kit de ponteiras', 'peca', 'pecas', 'reposicao', 'suporte']),
  osciloscopio: lex(['osciloscopio', 'osciloscopios', 'analisador logico'], ['ponteira', 'ponteiras', 'sonda', 'sondas', 'cabo', 'bnc', 'capa', 'estojo', 'adaptador', 'bateria', 'peca', 'pecas', 'reposicao', 'suporte', 'curso', 'livro']),
  paquimetro: lex(['paquimetro', 'paquimetros', 'micrometro', 'micrometros', 'relogio comparador'], ['bateria', 'pilha', 'capa', 'estojo', 'maleta vazia', 'encosto', 'bico', 'bicos', 'peca', 'pecas', 'reposicao', 'suporte', 'base', 'adaptador', 'cabo']),
  'balanca-precisao': lex(['balanca de precisao', 'balanca analitica', 'balanca de laboratorio', 'balanca semi analitica', 'balanca de joalheria'], ['peso padrao', 'pesos padrao', 'kit de pesos', 'prato', 'capa', 'bateria', 'pilha', 'adaptador', 'fonte', 'peca', 'pecas', 'reposicao', 'calibracao', 'pinca', 'suporte', 'celula de carga avulsa']),
  'termometro-infravermelho': lex(['termometro infravermelho', 'termometro laser', 'termometro digital infravermelho', 'pirometro', 'camera termica', 'termografica'], ['capa', 'bateria', 'pilha', 'estojo', 'suporte', 'tripe', 'adaptador', 'peca', 'pecas', 'reposicao', 'sonda avulsa', 'protetor']),
  'placa-microcontrolada': lex(['arduino', 'raspberry', 'raspberry pi', 'esp32', 'esp8266', 'jetson', 'microcontrolador', 'placa de desenvolvimento', 'pico', 'stm32', 'micro bit', 'microbit', 'beaglebone'], ['capa', 'case', 'gabinete', 'cabo', 'fonte', 'dissipador', 'cooler', 'ventoinha', 'shield', 'display', 'tela', 'sensor', 'modulo', 'cartao', 'adaptador', 'suporte', 'carregador', 'bateria', 'kit de sensores', 'jumper', 'jumpers', 'protoboard', 'led', 'leds', 'livro', 'curso', 'peca', 'pecas', 'reposicao', 'hat', 'camera']),
  'fonte-bancada': lex(['fonte de bancada', 'fonte ajustavel', 'fonte regulavel', 'fonte dc ajustavel', 'fonte de laboratorio', 'fonte variavel'], ['cabo', 'garra', 'garras', 'ponteira', 'capa', 'fusivel', 'adaptador', 'conector', 'peca', 'pecas', 'reposicao', 'suporte', 'plug']),
  'estacao-solda': lex(['estacao de solda', 'estacao de retrabalho', 'estacao retrabalho', 'estacao de ar quente', 'ferro de solda digital'], ['ponta', 'pontas', 'bico', 'bicos', 'resistencia', 'suporte', 'esponja', 'estanho', 'fluxo', 'pasta', 'sugador', 'cabo', 'fonte', 'adaptador', 'peca', 'pecas', 'reposicao', 'lupa', 'capa', 'kit de pontas', 'cabo de ferro']),
  'scanner-3d': lex(['scanner 3d', 'escaner 3d', 'digitalizador 3d', 'scanner tridimensional'], ['tripe', 'mesa giratoria', 'plataforma', 'pasta', 'spray', 'capa', 'case', 'adaptador', 'cabo', 'suporte', 'marcadores', 'targets', 'peca', 'pecas', 'reposicao', 'licenca', 'software']),
  'maquina-cnc': lex(['cnc', 'router cnc', 'fresadora cnc', 'fresadora', 'maquina cnc', 'mini cnc'], ['fresa', 'fresas', 'broca', 'brocas', 'pinca', 'pincas', 'mandril', 'spindle avulso', 'motor', 'driver', 'placa controladora', 'controladora', 'fuso', 'guia', 'rolamento', 'cabo', 'suporte', 'morsa', 'grampo', 'kit de fresas', 'peca', 'pecas', 'reposicao', 'software', 'curso', 'cola', 'tapete']),
  'gravadora-laser': lex(['gravadora a laser', 'gravador a laser', 'gravadora laser', 'cortadora a laser', 'cortadora laser', 'maquina de corte a laser', 'maquina de gravacao a laser', 'maquina a laser', 'laser engraver', 'maquina de gravar a laser', 'cortador a laser'], ['lente', 'lentes', 'espelho', 'oculos de protecao', 'oculos', 'tubo laser avulso', 'fonte laser', 'modulo laser avulso', 'extensao', 'kit de extensao', 'colmeia', 'mesa colmeia', 'exaustor', 'filtro', 'compressor de ar', 'bomba', 'chiller', 'cabo', 'suporte', 'peca', 'pecas', 'reposicao', 'material', 'compensado', 'mdf', 'acrilico', 'tinta', 'software', 'curso']),
  'plotter-corte': lex(['plotter', 'plotter de recorte', 'plotter de corte', 'cortadora de vinil', 'cricut', 'silhouette cameo', 'silhouette portrait', 'scanncut', 'maquina de corte de papel'], ['lamina', 'laminas', 'faca', 'facas', 'tapete', 'tapetes', 'mat', 'cutting mat', 'vinil', 'adesivo', 'papel', 'caneta', 'canetas', 'suporte', 'porta lamina', 'ferramenta', 'kit de ferramentas', 'cabo', 'fonte', 'capa', 'peca', 'pecas', 'reposicao', 'tinta', 'cartucho', 'bobina', 'rolo', 'espatula']),
  'medidor-laser': lex(['medidor de distancia a laser', 'trena a laser', 'trena laser', 'medidor laser de distancia', 'telemetro', 'telemetro a laser'], ['capa', 'estojo', 'bateria', 'pilha', 'tripe', 'suporte', 'adaptador', 'oculos', 'alvo', 'peca', 'pecas', 'reposicao']),
};

/** Recorte de nicho (mesma semântica de scope.ts NICHO): `require` precisa casar; `forbid` não pode casar. */
export const NICHO_CIENCIA: Record<string, { require?: RegExp; forbid?: RegExp }> = {
  microscopio: { forbid: /\b(brinquedo|infantil|kit cientifico infantil|lupa de bolso|clip para celular|laminas preparadas)\b/ },
  telescopio: { forbid: /\b(brinquedo|luneta de brinquedo|luneta pirata|cabo telescopico|vara telescopica|escada telescopica|haste telescopica)\b/ },
  binoculo: { forbid: /\b(brinquedo|oculos|fantasia)\b/ },
  multimetro: { require: /\b(multimetro|alicate amperimetro|alicate multimetro|amperimetro|voltimetro)\b/, forbid: /\b(painel|medidor de energia|medidor de bateria|testador de bateria|tomada)\b/ },
  osciloscopio: { forbid: /\b(sonda avulsa|ponteira de osciloscopio|curso|apostila)\b/ },
  paquimetro: { forbid: /\b(aula|curso|apostila|brinde|chaveiro)\b/ },
  'balanca-precisao': { require: /\b(precisao|analitica|laboratorio|joalheria|joia|semi analitica)\b/, forbid: /\b(corporal|banheiro|bioimpedancia|cozinha|nutricional|bagagem|mala|pet|bebe|caminhao|plataforma|gado|peixe|pescaria)\b/ },
  'termometro-infravermelho': { require: /\b(infravermelho|laser|termografica|termica|pirometro)\b/, forbid: /\b(febre|testa|corporal|culinario|alimento|cozinha|bebe|pet|churrasco|forno)\b/ },
  'placa-microcontrolada': { require: /\b(arduino|raspberry|esp32|esp8266|jetson|stm32|pico|micro ?bit|beaglebone|placa de desenvolvimento|microcontrolador)\b/, forbid: /\b(chinelo|sabor|fruta|geleia|cabo hdmi)\b/ },
  'fonte-bancada': { require: /\b(bancada|laboratorio|ajustavel|regulavel|variavel)\b/, forbid: /\b(atx|gabinete|pc gamer|notebook|led strip|fita led|camera|cftv)\b/ },
  'estacao-solda': { require: /\b(estacao|retrabalho|ar quente)\b/, forbid: /\b(maquina de solda|inversora|mig|tig|eletrodo|soldagem industrial|solda a gas)\b/ },
  'scanner-3d': { require: /\b3d\b/, forbid: /\b(impressora 3d|filamento|resina|caneta 3d|obd|automotivo|documentos|codigo de barras)\b/ },
  'maquina-cnc': { require: /\bcnc\b|\b(fresadora|router)\b/, forbid: /\b(roteador wifi|roteador wi fi|wireless|tp link|tplink|intelbras|gigabit|torno mecanico manual|fresadora manual)\b/ },
  'gravadora-laser': { require: /\blaser\b/, forbid: /\b(depilacao|tatuagem|remocao|estetica|nivel a laser|nivel laser|trena|ponteiro|apontador|jogo de luz|lanterna|mira laser|sala de cinema|projetor laser|impressora laser|toner)\b/ },
  'plotter-corte': { forbid: /\b(plotter de impressao|plotter hp|designjet|plotter de grande formato|impressora|sublimacao|tinta|toner)\b/ },
  'medidor-laser': { require: /\b(laser|telemetro)\b/, forbid: /\b(nivel a laser|nivel laser|linhas|cruz|pointer|apontador|mira|brinquedo)\b/ },
};
