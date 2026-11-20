// Sem 'server-only': dados puros do léxico (aparelho x acessório) dos segmentos de variedade de 2026-11-20 (config-variedade.ts, R-108).
// Importado por scope.ts; só importa o TIPO de scope-ampliacao.ts (sem ciclo). Termos em minúsculas, sem acento (o título passa por fold() antes).
import type { SegmentLexiconData } from './scope-ampliacao';

const w = (words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`);
const lex = (noun: string[], accessory: string[]): SegmentLexiconData => ({ noun: w(noun), accessory: w(accessory) });

/** Livro: o título quase sempre cita o gênero/autor; só objeto de papelaria, brinde ou boneco logo na abertura é acessório. */
const LIVRO = lex(
  ['livro', 'livros', 'box', 'colecao', 'edicao', 'volume', 'vol', 'manga', 'mangas', 'hq', 'biblia', 'romance', 'classico'],
  ['caderno', 'agenda', 'planner', 'fichario', 'marca pagina', 'poster', 'camiseta', 'caneca', 'luminaria', 'papelaria', 'chaveiro', 'pelucia', 'funko', 'action figure', 'capa de livro', 'porta livro', 'estante', 'apoio de livro'],
);

export const LEX_VARIEDADE: Record<string, SegmentLexiconData> = {
  // ---- casa ----
  'extratora-higienizadora': lex(['extratora', 'higienizadora', 'spot cleaner', 'limpadora a vapor', 'lavadora de estofados'], ['bico', 'bicos', 'mangueira', 'escova', 'filtro', 'filtros', 'reservatorio', 'tanque avulso', 'capa', 'peca', 'pecas', 'reposicao', 'detergente', 'shampoo', 'solucao', 'kit de limpeza', 'refil', 'adaptador', 'cabo']),
  'climatizador-portatil': lex(['climatizador', 'climatizadores', 'ar condicionado portatil', 'ar condicionado'], ['filtro', 'filtros', 'colmeia', 'mangueira', 'duto', 'kit de instalacao', 'controle remoto', 'suporte', 'capa', 'peca', 'pecas', 'reposicao', 'gelo', 'adaptador', 'saida de ar', 'janela']),
  'adega-cervejeira': lex(['adega', 'adegas', 'cervejeira', 'cervejeiras', 'frigobar', 'frigobares', 'expositor refrigerado'], ['prateleira', 'prateleiras', 'porta', 'gaxeta', 'vedacao', 'termostato', 'capa', 'peca', 'pecas', 'reposicao', 'suporte', 'rack', 'porta garrafas', 'organizador', 'cesto', 'luminoso']),
  'maquina-de-pao': lex(['maquina de pao', 'padeira', 'maquina de fazer pao'], ['forma', 'formas', 'pa', 'misturador', 'receita', 'livro', 'mistura', 'preparo', 'capa', 'tampa', 'peca', 'pecas', 'reposicao', 'cuba', 'cesta']),
  'vaporizador-de-roupas': lex(['vaporizador', 'passadeira', 'steamer', 'passadeira a vapor'], ['tabua', 'cabide', 'luva', 'filtro', 'tanque', 'reservatorio', 'bico', 'mangueira', 'capa', 'peca', 'pecas', 'reposicao', 'agua', 'descalcificante', 'acolchoado', 'refil']),
  'balanca-digital': lex(['balanca', 'balancas', 'bioimpedancia'], ['bateria', 'baterias', 'pilha', 'pilhas', 'tampa', 'pe', 'pes', 'borracha', 'peca', 'pecas', 'reposicao', 'capa', 'sensor avulso', 'celula de carga', 'tapete', 'display avulso', 'pesos']),
  // ---- esporte ----
  'kimono-artes-marciais': lex(['kimono', 'kimonos', 'quimono', 'gi', 'uniforme'], ['faixa', 'faixas', 'bolsa', 'mochila', 'patch', 'patches', 'bordado', 'cabide', 'sabao', 'lavagem', 'protetor', 'luva', 'luvas', 'protetor bucal', 'saco', 'aplique', 'etiqueta', 'cinto avulso']),
  'natacao-equipamento': lex(['nadadeira', 'nadadeiras', 'snorkel', 'touca', 'toucas', 'prancha de natacao', 'palmar', 'palmares', 'mascara de mergulho', 'pull buoy'], ['estojo', 'bolsa', 'saco', 'case', 'spray', 'antiembacante', 'protetor', 'guia', 'reposicao', 'peca', 'pecas', 'kit de limpeza', 'cordao', 'apito']),
  'cama-elastica': lex(['cama elastica', 'trampolim', 'camas elasticas', 'trampolins'], ['lona', 'molas', 'mola', 'rede de protecao', 'rede', 'capa', 'cobertura', 'pe', 'pes', 'peca', 'pecas', 'reposicao', 'escada', 'tapete', 'protetor de molas', 'ancoragem', 'kit de reparo']),
  'jaqueta-esportiva': lex(['jaqueta', 'jaquetas', 'agasalho', 'corta vento', 'casaco esportivo', 'blusa de treino'], ['patch', 'emblema', 'escudo', 'bordado', 'aplique', 'adesivo', 'cabide', 'etiqueta', 'zipper', 'ziper', 'botao', 'capuz avulso', 'forro avulso', 'miniatura', 'boneco']),
  badminton: lex(['badminton', 'raquete de badminton', 'peteca', 'petecas'], ['cordas', 'corda', 'grip', 'overgrip', 'capa', 'bolsa', 'case', 'sacola', 'rede', 'poste', 'tubo', 'fita', 'peca', 'pecas', 'reposicao', 'cola', 'miniatura']),
  'rede-trave-tabela': lex(['rede de volei', 'rede de futevolei', 'rede', 'tabela de basquete', 'tabela', 'trave', 'traves', 'poste de volei', 'aro de basquete', 'aro'], ['bola', 'bomba', 'apito', 'fita', 'corda', 'cabo', 'mastro avulso', 'ancoragem', 'cesta avulsa', 'peca', 'pecas', 'reposicao', 'capa', 'brinquedo', 'mini', 'trofeu', 'medalha', 'placar']),
  // ---- eletrônicos ----
  'gimbal-estabilizador': lex(['gimbal', 'estabilizador', 'osmo mobile', 'ronin'], ['tripe', 'bolsa', 'case', 'capa', 'suporte', 'clamp', 'adaptador', 'cabo', 'bateria', 'carregador', 'placa', 'protetor', 'peca', 'pecas', 'reposicao', 'contrapeso', 'filtro']),
  'lente-camera': lex(['lente', 'lentes', 'objetiva', 'objetivas', 'teleobjetiva'], ['tampa', 'parasol', 'filtro', 'adaptador', 'anel', 'bolsa', 'capa', 'case', 'protetor', 'limpeza', 'caneta', 'pano', 'kit de limpeza', 'celular', 'smartphone', 'contato', 'contatos', 'oculos']),
  'radio-portatil': lex(['radio', 'radios', 'radio relogio', 'radio portatil'], ['antena', 'cabo', 'fonte', 'adaptador', 'capa', 'case', 'suporte', 'bateria', 'peca', 'pecas', 'reposicao', 'carregador', 'controle', 'carro', 'automotivo', 'amador', 'comunicador', 'walkie']),
  'baba-eletronica': lex(['baba eletronica', 'babas eletronicas', 'monitor de bebe', 'baba'], ['suporte', 'capa', 'case', 'cabo', 'fonte', 'adaptador', 'bateria', 'carregador', 'peca', 'pecas', 'reposicao', 'cartao de memoria', 'tripe', 'brinquedo']),
  // ---- beleza ----
  'barbeador-aparador': lex(['barbeador', 'barbeadores', 'aparador', 'aparadores', 'depilador', 'depiladores', 'maquina de cortar cabelo', 'trimmer', 'maquina de acabamento'], ['lamina', 'laminas', 'cabeca', 'cabecas', 'refil', 'refis', 'pente', 'pentes', 'guia', 'guias', 'oleo', 'lubrificante', 'capa', 'estojo', 'suporte', 'base', 'carregador', 'peca', 'pecas', 'reposicao', 'bateria', 'espuma', 'gel de barbear', 'pos barba']),
  'hidratante-corporal': lex(['hidratante', 'hidratantes', 'body lotion', 'manteiga corporal', 'locao hidratante', 'oleo corporal', 'creme corporal'], ['amostra', 'amostras', 'miniatura', 'mini kit', 'brinde', 'refil vazio', 'pote vazio', 'frasco vazio', 'dispenser', 'kit revenda', 'atacado', 'expositor', 'display']),
  // ---- livros ----
  'livros-manga': LIVRO,
  'livros-hq-comics': LIVRO,
  'livros-fantasia-ficcao': LIVRO,
  'livros-policial-suspense': LIVRO,
  'livros-infantojuvenil': LIVRO,
  'livros-biblia-teologia': LIVRO,
  'livros-financas-negocios': LIVRO,
  'livros-classicos': LIVRO,
  'livros-biografia-ciencia': LIVRO,
  'livros-artes-design': LIVRO,
};

/** Recorte de nicho (o domínio do ML é mais largo que o tipo): o que nunca é o produto do segmento. */
export const NICHO_VARIEDADE: Record<string, { require?: RegExp; forbid?: RegExp }> = {
  'lente-camera': { forbid: /\b(celular|smartphone|contato|contatos|oculos|clip|selfie|gatinho|cosmetica|colorida|astigmatismo)\b/ },
  'radio-portatil': { forbid: /\b(radio comunicador|walkie|amador|px|ham|cb|relogio de pulso|automotivo|carro)\b/ },
  'baba-eletronica': { forbid: /\b(baba de cama|baba infantil de pano|brinquedo|pet|animal)\b/ },
  'balanca-digital': { forbid: /\b(joalheria|ouro|precisao|laboratorio|industrial|caminhao|bagagem|mala|gado|plataforma|comercial|pet|animal)\b/ },
  'cama-elastica': { forbid: /\b(infantil inflavel|pula pula inflavel|brinquedo inflavel|castelo)\b/ },
  'jaqueta-esportiva': { forbid: /\b(couro|motoqueiro|moto|jeans|social|blazer|impermeavel de pesca|caca)\b/ },
  badminton: { forbid: /\b(squash|tenis de mesa|ping pong)\b/ },
  'rede-trave-tabela': { forbid: /\b(pesca|mosquiteiro|cabelo|tenis de mesa|ping pong|pet|gato|cachorro|arremesso)\b/ },
  'barbeador-aparador': { forbid: /\b(brinquedo|barbeador de brinquedo|barbear infantil)\b/ },
  'vaporizador-de-roupas': { forbid: /\b(facial|inalador|vaporizador de ambiente|cigarro|vape|narguile|aromaterapia)\b/ },
  'extratora-higienizadora': { forbid: /\b(brinquedo|piscina|janela|vidro)\b/ },
  'climatizador-portatil': { forbid: /\b(carro|automotivo|veicular|usb|mini ventilador|de mesa mini)\b/ },
  'adega-cervejeira': { forbid: /\b(brinquedo|porta garrafas|suporte de garrafas|rack de vinho|decoracao)\b/ },
  'maquina-de-pao': { forbid: /\b(maquina de costura|brinquedo|massa de pao pronta|mistura)\b/ },
  'kimono-artes-marciais': { forbid: /\b(infantil de fantasia|fantasia|roupao|roupao de banho|pijama)\b/ },
  'natacao-equipamento': { forbid: /\b(piscina inflavel|boia|colete|brinquedo de piscina|macarrao)\b/ },
};
