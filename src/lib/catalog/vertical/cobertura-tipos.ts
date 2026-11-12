// Sem 'server-only': tabela pura (sem banco, sem rede). Fonte do mapa tipo x loja do pedido do dono de 2026-11-12.
import { segmentByKey, type NonGamesVertical } from './config';
import { NOVOS_SEGMENTOS_TIPOS } from './config-tipos';

/**
 * MAPA TIPO x LOJA (pedido do dono, 2026-11-12: "para cada área, existe alguma restrição de itens? quero TODOS os itens relacionados").
 * Cada linha é um tipo de produto que o dono espera ver na loja. `segmento` aponta o segmento de semeadura (config.ts) que o cobre; `null`
 * = nenhum, e `causa` diz por quê. A situação "depois" é CALCULADA da configuração (não escrita à mão), então o teste quebra se um
 * segmento sair do ar. A situação "antes" (hoje no banco) vem do inventário (docs/inventario-catalogo/*.csv), lida pela simulação.
 */

/** Por que um tipo está ausente. */
export type CausaAusencia =
  /** Faltava semente/consulta (não existia segmento): resolvido por esta ampliação, salvo quando marcado outra causa. */
  | 'sem_semente'
  /** O escopo de título/nicho barra o tipo (scope.ts). */
  | 'escopo'
  /** O porteiro do departamento (gate.ts, de outro agente) manda o tipo sempre para revisão. */
  | 'porteiro'
  /** Decisão de negócio do dono pendente (regulado, fora do recorte, sem identidade possível). */
  | 'decisao_dono'
  /** O Mercado Livre não tem catálogo de produto para o tipo (medido): só anúncio livre, que a regra de identidade não aceita. */
  | 'sem_catalogo_ml';

export interface TipoEsperado {
  loja: NonGamesVertical;
  tipo: string;
  segmento: string | null;
  causa?: CausaAusencia;
  nota?: string;
}

const t = (loja: NonGamesVertical, tipo: string, segmento: string | null, causa?: CausaAusencia, nota?: string): TipoEsperado => ({ loja, tipo, segmento, ...(causa ? { causa } : {}), ...(nota ? { nota } : {}) });

const E = 'eletroeletronicos' as const;
const T = 'tecnologia' as const;
const C = 'eletrodomesticos' as const;
const S = 'esporte' as const;
const L = 'livros' as const;
const I = 'impressao3d' as const;

export const TIPOS_ESPERADOS: TipoEsperado[] = [
  // ---- Eletrônicos ----
  t(E, 'Smart TV', 'smart-tv'),
  t(E, 'Soundbar', 'soundbar'),
  t(E, 'Home theater', 'soundbar', undefined, 'mesmo domínio MLB-HOME_THEATERS do soundbar'),
  t(E, 'Receiver e amplificador de som', 'receiver-amplificador'),
  t(E, 'Caixa de som', 'caixa-de-som'),
  t(E, 'Fone de ouvido', 'fone-de-ouvido'),
  t(E, 'Microfone', 'microfone'),
  t(E, 'Toca-discos', 'toca-discos'),
  t(E, 'Projetor', 'projetor'),
  t(E, 'Câmera digital', 'camera-digital'),
  t(E, 'Câmera de ação', 'camera-de-acao'),
  t(E, 'Câmera de segurança', 'camera-de-seguranca'),
  t(E, 'Drone', 'drone'),
  t(E, 'TV Box e streaming', 'tv-box'),
  t(E, 'Celular e smartphone', 'celular'),
  t(E, 'Tablet', 'tablet'),
  t(E, 'E-reader', 'e-reader'),
  t(E, 'Smartwatch e smartband', 'smartwatch'),
  t(E, 'Casa inteligente', 'casa-inteligente'),
  t(E, 'Carregador', 'carregador'),
  t(E, 'Power bank', 'power-bank'),
  t(E, 'Cabo e adaptador', 'cabo-e-adaptador'),
  t(E, 'Hub USB e dock', 'hub-usb'),
  t(E, 'Suporte, rack, antena e controle remoto de TV', null, 'escopo', 'acessório: barrado de propósito (scope.ts e OUT_OF_SCOPE do departamento)'),
  // ---- Casa e eletrodomésticos ----
  t(C, 'Geladeira', 'geladeira'),
  t(C, 'Freezer e frigobar', 'freezer'),
  t(C, 'Fogão', 'fogao'),
  t(C, 'Cooktop', 'cooktop'),
  t(C, 'Forno elétrico', 'forno-eletrico'),
  t(C, 'Micro-ondas', 'micro-ondas'),
  t(C, 'Air fryer', 'air-fryer'),
  t(C, 'Lava-louças', 'lava-loucas'),
  t(C, 'Máquina de lavar', 'maquina-de-lavar'),
  t(C, 'Secadora de roupas', 'secadora-de-roupas'),
  t(C, 'Aspirador de pó', 'aspirador-de-po'),
  t(C, 'Robô aspirador', 'robo-aspirador'),
  t(C, 'Ar-condicionado', 'ar-condicionado'),
  t(C, 'Ventilador e circulador', 'ventilador'),
  t(C, 'Aquecedor', 'aquecedor'),
  t(C, 'Purificador de ar', 'purificador-de-ar'),
  t(C, 'Umidificador e desumidificador', 'umidificador-desumidificador'),
  t(C, 'Liquidificador', 'liquidificador'),
  t(C, 'Batedeira', 'batedeira'),
  t(C, 'Processador de alimentos e mixer', 'processador-de-alimentos'),
  t(C, 'Espremedor', 'espremedor'),
  t(C, 'Cafeteira', 'cafeteira'),
  t(C, 'Chaleira elétrica', 'chaleira-eletrica'),
  t(C, 'Panela elétrica e arrozeira', 'panela-eletrica'),
  t(C, 'Sanduicheira, grill e waffle', 'sanduicheira-grill'),
  t(C, 'Torradeira', 'torradeira'),
  t(C, 'Ferro de passar', 'ferro-de-passar'),
  t(C, 'Coifa e depurador', 'coifa'),
  t(C, 'Bebedouro e purificador de água', 'bebedouro-purificador-agua'),
  t(C, 'Lavadora de alta pressão', 'lavadora-alta-pressao'),
  t(C, 'Máquina de costura', 'maquina-de-costura'),
  t(C, 'Chuveiro e ducha elétrica', 'chuveiro-eletrico', undefined, 'aprovado pelo dono em 2026-11-12'),
  t(C, 'Aquecedor de água (a gás, elétrico, solar)', 'aquecedor-de-agua', undefined, 'aprovado pelo dono em 2026-11-12'),
  // ---- Tecnologia ----
  t(T, 'Notebook', 'notebook'),
  t(T, 'Computador desktop, mini PC e all-in-one', 'computador-desktop'),
  t(T, 'Monitor', 'monitor'),
  t(T, 'Placa de vídeo', 'placa-de-video'),
  t(T, 'Processador', 'processador'),
  t(T, 'Placa-mãe', 'placa-mae'),
  t(T, 'Memória RAM', 'memoria-ram'),
  t(T, 'SSD e HD interno', 'ssd'),
  t(T, 'HD e SSD externo', 'hd-ssd-externo'),
  t(T, 'Pendrive', 'pendrive'),
  t(T, 'Cartão de memória', 'cartao-de-memoria'),
  t(T, 'Gabinete de PC', 'gabinete-pc'),
  t(T, 'Fonte de PC', 'fonte-pc'),
  t(T, 'Cooler e water cooler', 'cooler-pc'),
  t(T, 'Teclado', 'teclado'),
  t(T, 'Mouse', 'mouse'),
  t(T, 'Mousepad', 'mousepad'),
  t(T, 'Headset gamer', 'headset-gamer'),
  t(T, 'Webcam', 'webcam'),
  t(T, 'Placa de captura', 'placa-de-captura'),
  t(T, 'Mesa digitalizadora', 'mesa-digitalizadora'),
  t(T, 'Cadeira gamer', 'cadeira-gamer'),
  t(T, 'Roteador', 'roteador'),
  t(T, 'Repetidor, mesh e access point', 'repetidor-mesh'),
  t(T, 'Switch de rede', 'switch-rede'),
  t(T, 'Adaptador wifi', 'adaptador-wifi'),
  t(T, 'Nobreak', 'nobreak'),
  t(T, 'Impressora (jato de tinta, laser, térmica)', 'impressora'),
  t(T, 'Scanner de documentos', 'scanner-de-documentos'),
  t(T, 'Mesa gamer', 'mesa-gamer', undefined, 'aprovado pelo dono em 2026-11-12 (móvel gamer)'),
  t(T, 'Rack gamer', 'rack-gamer', undefined, 'aprovado pelo dono em 2026-11-12 (móvel gamer)'),
  // ---- Esporte ----
  t(S, 'Tênis (corrida, caminhada, treino, casual)', 'tenis'),
  t(S, 'Chuteira', 'chuteira'),
  t(S, 'Camisa de time e esportiva', 'camisa-de-time'),
  t(S, 'Roupa de compressão', 'roupa-de-compressao'),
  t(S, 'Roupa de ciclismo', 'roupa-de-ciclismo'),
  t(S, 'Meia esportiva', 'meia-esportiva'),
  t(S, 'Boné', 'bone'),
  t(S, 'Mochila esportiva', 'mochila-esportiva'),
  t(S, 'Bolsa de treino', 'bolsa-de-treino'),
  t(S, 'Bola de futebol', 'bola'),
  t(S, 'Bola de basquete', 'bola-de-basquete'),
  t(S, 'Bola de vôlei', 'bola-de-volei'),
  t(S, 'Raquete de tênis e squash', 'raquete-de-tenis'),
  t(S, 'Raquete de beach tennis', 'raquete-beach-tennis'),
  t(S, 'Tênis de mesa', 'tenis-de-mesa'),
  t(S, 'Luva de goleiro', 'luva-de-goleiro'),
  t(S, 'Caneleira', 'caneleira'),
  t(S, 'Luva de boxe e MMA', 'luva-de-boxe'),
  t(S, 'Saco de pancada', 'saco-de-pancada'),
  t(S, 'Óculos de natação', 'oculos-de-natacao'),
  t(S, 'Bicicleta', 'bicicleta'),
  t(S, 'Capacete de ciclismo', 'capacete-de-ciclismo'),
  t(S, 'Skate e longboard', 'skate'),
  t(S, 'Patins', 'patins'),
  t(S, 'Patinete e scooter', 'patinete'),
  t(S, 'Esteira ergométrica', 'esteira'),
  t(S, 'Bicicleta ergométrica', 'bicicleta-ergometrica'),
  t(S, 'Elíptico', 'eliptico'),
  t(S, 'Estação de musculação', 'estacao-de-musculacao'),
  t(S, 'Banco de musculação e supino', 'banco-de-musculacao'),
  t(S, 'Barra e anilha', 'barra-e-anilha'),
  t(S, 'Halter', 'halter'),
  t(S, 'Kettlebell', 'kettlebell'),
  t(S, 'Tornozeleira de peso', 'tornozeleira-de-peso'),
  t(S, 'Luva de academia', 'luva-de-academia'),
  t(S, 'Faixa elástica', 'faixa-elastica'),
  t(S, 'Tapete de yoga e exercício', 'tapete-de-yoga'),
  t(S, 'Bola de pilates', 'bola-de-pilates'),
  t(S, 'Rolo de massagem', 'foam-roller'),
  t(S, 'Corda de pular', 'corda-de-pular'),
  t(S, 'Garrafa e squeeze esportivo', 'garrafa-esportiva'),
  t(S, 'Suplementos (whey, creatina...)', 'suplemento', undefined, 'aprovado pelo dono em 2026-11-12: só lacrado, novo e sem "vencimento próximo" (nicho)'),
  t(S, 'Camping', 'camping', undefined, 'aprovado pelo dono em 2026-11-12'),
  t(S, 'Pesca (vara, molinete, carretilha)', 'pesca', undefined, 'aprovado pelo dono em 2026-11-12; isca, anzol e linha ficam fora'),
  t(S, 'Trilha e montanhismo', 'trilha', undefined, 'aprovado pelo dono em 2026-11-12'),
  t(S, 'Roupa fitness do dia a dia (legging, short, camiseta dry-fit)', null, 'sem_catalogo_ml', 'medido em 11/11: a busca devolve uniformes, lembrancinhas e modeladores, não catálogo de produto'),
  // ---- Livros ----
  t(L, 'Livros por gênero, editora e autor (ficção, não ficção, infantil, didático, religião, saúde, artes, esportes)', 'livros', undefined, '~650 termos em livros (gêneros, editoras, autores); a execução é que ficou curta (245 produtos)'),
  t(L, 'Mangá, HQ e graphic novel', 'livros', undefined, 'termos próprios dentro de livros (domínio MLB-BOOKS)'),
  t(L, 'Livros de RPG, programação, arte de jogos', 'livros'),
  t(L, 'Papelaria, caderno, agenda e planner', null, 'escopo', 'barrado de propósito (OUT_OF_SCOPE de livros)'),
  // ---- Impressão 3D ----
  t(I, 'Impressora 3D (FDM e resina)', 'impressora-3d'),
  t(I, 'Filamento (PLA, PETG, ABS, TPU, ASA, nylon)', 'filamento-3d'),
  t(I, 'Resina', 'resina-3d'),
  t(I, 'Peças (bico, hotend, mesa PEI, extrusor, correia)', 'peca-impressora-3d', undefined, 'entra em revisão: a vitrine exige compatibilidade escrita no título (decisão do conselho)'),
  t(I, 'Secador e dry box de filamento', 'secador-filamento'),
  t(I, 'Estação de lavar e curar resina', 'lavadora-curadora-resina'),
  t(I, 'Scanner 3D', null, 'porteiro', 'OUT_OF_SCOPE.impressao3d em gate.ts barra "scanner" sempre; liberar exige mudar o porteiro (outro agente)'),
  t(I, 'Caneta 3D', null, 'porteiro', 'OUT_OF_SCOPE.impressao3d em gate.ts barra "caneta 3d" sempre; liberar exige mudar o porteiro (outro agente)'),
  t(I, 'Ferramentas de pós-processamento (espátula, alicate, lixa)', 'ferramenta-impressao-3d', undefined, 'aprovado pelo dono em 2026-11-12; vitrine exige "3d"/uso no título'),
];

export type Situacao = 'coberto' | 'parcial' | 'ausente';

/** Mínimo de termos para o tipo contar como coberto (abaixo disso a consulta é rasa). */
export const MIN_TERMOS_COBERTO = 12;

const NOVOS = new Set(NOVOS_SEGMENTOS_TIPOS.map((s) => s.key));

/** O segmento já existia antes da ampliação de tipos de 2026-11-12? */
export function existiaAntes(tipo: TipoEsperado): boolean {
  return tipo.segmento != null && !NOVOS.has(tipo.segmento);
}

/** Situação DEPOIS, calculada da configuração: coberto = segmento com domínio medido e consultas suficientes; parcial = domínio a confirmar ou consultas rasas. */
export function situacaoDepois(tipo: TipoEsperado): Situacao {
  if (!tipo.segmento) return 'ausente';
  const seg = segmentByKey(tipo.segmento);
  if (!seg) return 'ausente';
  if (seg.domainUnconfirmed || seg.terms.length < MIN_TERMOS_COBERTO) return 'parcial';
  return 'coberto';
}
