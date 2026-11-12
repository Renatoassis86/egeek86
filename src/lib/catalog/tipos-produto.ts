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
  { slug: 'cabos-acessorios', rotulo: 'Cabos e acessórios', re: r(' (cabo|cabos|hub|adaptador|suporte|controle remoto|pelicula|capa) ') },
  { slug: 'carregadores', rotulo: 'Carregadores e baterias', re: r(' (carregador|fonte carregador|power bank|powerbank|mobile power|bateria externa|pilha|pilhas) ') },
  { slug: 'soundbar', rotulo: 'Soundbar', re: r(' (soundbar|sound bar|home theater) ') },
  { slug: 'projetor', rotulo: 'Projetor', re: r(' (projetor|projector) ') },
  { slug: 'camera-seguranca', rotulo: 'Câmera de segurança', re: r(' (camera|cameras) .*(seguranca|vigilancia)| cftv ') },
  { slug: 'camera-acao', rotulo: 'Câmera de ação', re: r(' (camera|cameras|filmadora) .*(acao|sports|action)| gopro | insta360 ') },
  { slug: 'camera-foto', rotulo: 'Câmeras fotográficas', re: r(' (mirrorless|dslr|camera fotografica|camera instantanea|instax) ') },
  { slug: 'fones', rotulo: 'Fones de ouvido', re: r(' (fone|fones|headphone|headset|earbuds|earphone|tws|airpods) ') },
  { slug: 'caixa-de-som', rotulo: 'Caixas de som', re: r(' (caixa de som|caixinha de som|caixa acustica|speaker|alto falante) ') },
  { slug: 'smart-tv', rotulo: 'Smart TV', re: r(' (smart tv|tv|tvs|televisao|televisor) ') },
  { slug: 'tablet-leitor', rotulo: 'Tablets e leitores', re: r(' (tablet|ipad|e reader|kindle) ') },
  { slug: 'relogios', rotulo: 'Relógios inteligentes', re: r(' (smartwatch|smart watch|relogio inteligente|smartband) ') },
];

const CASA: TipoDef[] = [
  { slug: 'air-fryer', rotulo: 'Air fryer', re: r(' (air fryer|airfryer|fritadeira|fryer) ') },
  { slug: 'geladeira-freezer', rotulo: 'Geladeira e freezer', re: r(' (geladeira|refrigerador|freezer|frigobar|adega|cervejeira) ') },
  { slug: 'lavadora-secadora', rotulo: 'Lavadora e secadora', re: r(' (lavadora|lava e seca|lava roupas|secadora|tanquinho|maquina de lavar|lava loucas) ') },
  { slug: 'ar-condicionado', rotulo: 'Ar-condicionado', re: r(' (ar condicionado|split|btus?|climatizador) ') },
  { slug: 'fogao-cooktop', rotulo: 'Fogão e cooktop', re: r(' (fogao|cooktop|coifa|depurador) ') },
  { slug: 'micro-ondas', rotulo: 'Micro-ondas', re: r(' (micro ondas|microondas) ') },
  { slug: 'forno', rotulo: 'Fornos', re: r(' (forno|fornos) (?!.*(air fryer|airfryer|fryer))') },
  { slug: 'aspirador', rotulo: 'Aspiradores', re: r(' (aspirador|aspiradora|robo aspirador|vassoura eletrica) ') },
  { slug: 'ventilador', rotulo: 'Ventiladores', re: r(' (ventilador|circulador|ventiladores) ') },
  { slug: 'purificador', rotulo: 'Purificadores de ar', re: r(' (purificador|ozonizador|ionizador|umidificador) ') },
  { slug: 'batedeira-liquidificador', rotulo: 'Batedeiras e liquidificadores', re: r(' (batedeira|liquidificador|mixer|processador de alimentos|espremedor) ') },
  { slug: 'ferro-passar', rotulo: 'Ferros de passar', re: r(' (ferro|ferros) ') },
  { slug: 'cafeteira', rotulo: 'Cafeteiras e panelas elétricas', re: r(' (cafeteira|chaleira|sanduicheira|grill|panela eletrica|panela de arroz|arrozeira) ') },
];

const TECNOLOGIA: TipoDef[] = [
  { slug: 'placa-de-video', rotulo: 'Placas de vídeo', re: r(' (placa de video|placa video|gpu|rtx|gtx|radeon rx|geforce) ') },
  { slug: 'ssd-hd', rotulo: 'SSD e HD', re: r(' (ssd|hdd|nvme|disco rigido|disco solido|hd externo|hd interno|hd sata) ') },
  { slug: 'notebook', rotulo: 'Notebooks', re: r(' (notebook|laptop|macbook|ultrabook|chromebook) ') },
  { slug: 'monitor', rotulo: 'Monitores', re: r(' (monitor|monitores) ') },
  { slug: 'impressora', rotulo: 'Impressoras', re: r(' (impressora|impressoras|multifuncional|ecotank) ') },
  { slug: 'processador', rotulo: 'Processadores', re: r(' (processador|ryzen|core i[3579]|intel core) ') },
  { slug: 'memoria-ram', rotulo: 'Memória RAM', re: r(' (memoria ram|ddr[345]|memoria ddr) ') },
  { slug: 'placa-mae-gabinete', rotulo: 'Placa-mãe, fonte e gabinete', re: r(' (placa mae|motherboard|gabinete|fonte atx|fonte 80|water cooler|cooler) ') },
  { slug: 'headset', rotulo: 'Headsets', re: r(' (headset|headphone|fone) ') },
  { slug: 'mouse', rotulo: 'Mouses', re: r(' (mouse|mouses) ') },
  { slug: 'teclado', rotulo: 'Teclados', re: r(' (teclado|teclados) ') },
  { slug: 'roteador', rotulo: 'Roteadores e redes', re: r(' (roteador|repetidor|switch|access point|modem) ') },
  { slug: 'webcam', rotulo: 'Webcams', re: r(' (webcam) ') },
];

const ESPORTE: TipoDef[] = [
  { slug: 'bicicleta', rotulo: 'Bicicletas', re: r(' (bicicleta|bike|ciclismo) ') },
  { slug: 'esteira-eliptico', rotulo: 'Esteiras e elípticos', re: r(' (esteira|eliptico|ergometrica|spinning) ') },
  { slug: 'raquete', rotulo: 'Raquetes', re: r(' (raquete|raquetes|beach tennis) ') },
  { slug: 'bola', rotulo: 'Bolas', re: r(' (bola|bolas) ') },
  { slug: 'tenis-calcado', rotulo: 'Tênis e calçados', re: r(' (tenis|chuteira|sapatilha|sandalia|chinelo) ') },
  { slug: 'halter-peso', rotulo: 'Halteres e pesos', re: r(' (halter|halteres|kettlebell|anilha|tornozeleira|barra|supino|caneleira de peso) ') },
  { slug: 'fitness', rotulo: 'Fitness e funcional', re: r(' (corda de pular|corda pular|corda|faixa elastica|elastico|tapete yoga|yoga|colchonete|pilates|abdominal|crossfit) ') },
  { slug: 'protecao', rotulo: 'Luvas e proteção', re: r(' (luva|luvas|caneleira|caneleiras|joelheira|munhequeira|protetor) ') },
  { slug: 'bolsas-mochilas', rotulo: 'Mochilas e bolsas', re: r(' (mochila|bolsa|mala|sacola|saco) ') },
  { slug: 'garrafas', rotulo: 'Garrafas e squeezes', re: r(' (garrafa|squeeze|coqueteleira|copo termico) ') },
  { slug: 'bones', rotulo: 'Bonés e acessórios', re: r(' (bone|bones|viseira|touca|pochete) ') },
  { slug: 'meias-roupas', rotulo: 'Meias e roupas', re: r(' (meia|meias|camisa|camiseta|short|bermuda|legging) ') },
];

const IMPRESSAO3D: TipoDef[] = [
  { slug: 'filamentos', rotulo: 'Filamentos', re: r(' (filamento|filamentos) ') },
  { slug: 'resinas', rotulo: 'Resinas', re: r(' (resina|resinas) ') },
  { slug: 'pecas', rotulo: 'Peças e acessórios', re: r(' (bico|nozzle|hotend|extrusora|mesa|ptfe|correia|ventoleira|placa de impressao|spatula|espatula|lamina|fita) ') },
  { slug: 'impressoras', rotulo: 'Impressoras 3D', re: r(' (impressora|impressoras|printer) ') },
];

const LIVROS: TipoDef[] = [
  { slug: 'hq-manga', rotulo: 'HQs e mangás', re: r(' (hq|hqs|manga|quadrinhos|graphic novel) ') },
  { slug: 'rpg', rotulo: 'RPG de mesa', re: r(' (rpg|pathfinder|old dragon|3det|savage worlds|savage pathfinder|cthulhu|dungeons|d d|dark eye|vampiro a mascara|jyhad) ') },
  { slug: 'programacao', rotulo: 'Programação e tecnologia', re: r(' (programacao|algoritmo|algoritmos|javascript|python|java|full stack|software|estruturas de dados|linguagem de programacao|banco de dados|orientacao a objetos|orientada a objetos|c ) ') },
  { slug: 'romance', rotulo: 'Romance e ficção', re: r(' (romance|romances|ficcao|novela|conto|contos|fantasia|thriller|vampiro) ') },
  { slug: 'ciencias-engenharia', rotulo: 'Ciências e engenharia', re: r(' (engenharia|matematica|algebricas|algebra|fisica|quimica|inteligencia artificial|estatistica|calculo|asp net|vb net) ') },
  { slug: 'guias-games', rotulo: 'Guias de games', re: r(' (guia oficial|guia de estrategia|call of duty) ') },
  { slug: 'direito-negocios', rotulo: 'Direito e negócios', re: r(' (direito|juridico|contabil|administracao|marketing|negocios|gestao|lideranca|inovacao) ') },
  { slug: 'saude', rotulo: 'Saúde e bem-estar', re: r(' (medicina|saude|psicologia|autoajuda|coaching|nutricao|diagnostico|oncologia) ') },
];

export const TIPOS_POR_DEPT: Record<DepartamentoSlug, readonly TipoDef[]> = {
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

export function rotuloTipo(dept: string, slug: string): string | null {
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
