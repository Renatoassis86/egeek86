// CENTRAL DE APROVACAO (/admin/aprovacao, dono 2026-11-12). PURO: sem banco, sem 'server-only' (testavel sem rede).
// Classifica cada item que espera o dono num MOTIVO e explica, em portugues simples, por que precisa de aprovacao humana e o que acontece ao
// aprovar ou recusar. Nada aqui inventa dado: a queda so existe com referencia real (>= 5 ofertas na media unica).
import type { QueueOption } from '@/lib/identity-queue/model';

export type Motivo = 'produto_novo' | 'rascunho' | 'cobertura' | 'fronteira' | 'plus' | 'dispersao' | 'midia' | 'modelo' | 'armazenamento' | 'preco';

export interface Explicacao { titulo: string; porque: string; aprovar: string; recusar: string; exigeEscolha: boolean }

const VISIVEL = 'A oferta passa a valer para a aba Black Friday e para as mensagens do Telegram e do WhatsApp (as da Amazon só saem com preço confirmado nos últimos 40 minutos).';

export const EXPLICACOES: Record<Motivo, Explicacao> = {
  produto_novo: {
    titulo: 'Produto novo em análise',
    porque: 'A Amazon trouxe um produto que ainda não existe no nosso catálogo. O sistema não consegue provar sozinho que o nome, a versão e a voltagem batem com o produto certo, então ele fica guardado em rascunho, fora de preços, da Black Friday e das mensagens.',
    aprovar: `Você confirma que é um produto novo e em linha. O produto entra no catálogo e ${VISIVEL}`,
    recusar: 'A oferta continua guardada, fora da média, da Black Friday e das mensagens. Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
  rascunho: {
    titulo: 'Oferta guardada em rascunho',
    porque: 'A oferta foi lida na Amazon com preço, mas o sistema só libera sozinho quando tem certeza de que é o mesmo produto do catálogo. Enquanto isso ela fica em rascunho, fora de preços, da Black Friday e das mensagens.',
    aprovar: `Você confirma que é o mesmo produto. ${VISIVEL}`,
    recusar: 'A oferta continua em rascunho (fora de tudo). Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
  cobertura: {
    titulo: 'Amazon: confirmar que é o mesmo produto',
    porque: 'O título da Amazon parece o do produto do catálogo, mas a coincidência não é total. Pode ser outra versão, edição ou voltagem, e misturar versões estraga a média.',
    aprovar: `Você confirma que é o mesmo produto. ${VISIVEL}`,
    recusar: 'A oferta continua em rascunho e sai da fila. Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
  fronteira: {
    titulo: 'Amazon: caso de fronteira',
    porque: 'O anúncio está no limite do que o sistema aceita sozinho (falta o modelo, a voltagem aparece só de um lado ou o título é parecido, mas não igual). Só uma pessoa decide com segurança.',
    aprovar: `Você confirma que é o mesmo produto. ${VISIVEL}`,
    recusar: 'A oferta continua em rascunho e sai da fila. Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
  plus: {
    titulo: 'Loja Plus: confirmar produto',
    porque: 'Produto de uma das lojas novas (casa, eletrônicos, esporte, livros, impressão 3D, tecnologia) cujo título não prova sozinho que é o produto do catálogo.',
    aprovar: 'A oferta fica no produto do catálogo e entra na média dele. Se já estava ativa, ela continua no ar.',
    recusar: 'A oferta sai da média e vai para revisão. Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
  dispersao: {
    titulo: 'Preço muito diferente dos outros',
    porque: 'O preço desta oferta destoa do grupo do mesmo produto. Pode ser outra versão (por exemplo digital no lugar do disco) ou um erro de preço. O sistema avisa, mas quem confirma é uma pessoa.',
    aprovar: 'Você confirma que é o mesmo produto. A oferta segue no ar e na média (se o preço for de fato um ponto fora da curva, o tratamento de outlier existente continua protegendo a média única). Isso não muda a visibilidade na Black Friday: ela já estava visível.',
    recusar: 'A oferta sai da média e vai para revisão. Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
  midia: {
    titulo: 'Disco ou digital? O título não diz',
    porque: 'No console, a versão com leitor de disco e a versão digital têm preços bem diferentes (cerca de R$ 500) e títulos quase iguais. Ninguém pode chutar esta resposta: ela muda a média do produto.',
    aprovar: 'Você escolhe a opção certa nos botões abaixo. A oferta vai para o produto correto e entra na média certa.',
    recusar: 'A oferta sai da média e vai para revisão (nada é apagado).',
    exigeEscolha: true,
  },
  modelo: {
    titulo: 'Qual modelo? O título não diz',
    porque: 'O título não diz se é o PS5 original, o Slim ou o Pro. São produtos diferentes, com preços diferentes. É uma resposta de fato: não dá para adivinhar pelo preço.',
    aprovar: 'Você escolhe o modelo certo nos botões abaixo. A oferta vai para o produto correto e entra na média certa.',
    recusar: 'A oferta sai da média e vai para revisão (nada é apagado).',
    exigeEscolha: true,
  },
  armazenamento: {
    titulo: 'Qual armazenamento ou voltagem?',
    porque: 'O título não diz a capacidade (ou a voltagem). Versões diferentes custam diferente e não podem entrar na mesma média.',
    aprovar: 'Você escolhe a opção certa nos botões abaixo. A oferta vai para o produto correto.',
    recusar: 'A oferta sai da média e vai para revisão (nada é apagado).',
    exigeEscolha: true,
  },
  preco: {
    titulo: 'Preço suspeito',
    porque: 'O preço lido é absurdo perto dos outros (muito acima ou impossível). Pode ser erro de leitura da loja.',
    aprovar: 'Você confirma que o preço está certo. A oferta continua como está.',
    recusar: 'Você marca o preço como errado: a oferta sai de toda leitura (quarentena). Nada é apagado e dá para desfazer.',
    exigeEscolha: false,
  },
};

export interface ItemBase {
  axis: string;
  origem: string | null;
  tipo: string | null;
  /** true = oferta em rascunho; masterEmRevisao = master com veredito 'review' no porteiro do catálogo. */
  draft: boolean;
  masterEmRevisao: boolean;
}

export function motivoDe(i: ItemBase): Motivo {
  if (i.axis === 'midia') return 'midia';
  if (i.axis === 'modelo') return 'modelo';
  if (i.axis === 'armazenamento') return 'armazenamento';
  if (i.axis === 'preco') return 'preco';
  if (i.origem === 'amazon_cobertura') return i.masterEmRevisao ? 'produto_novo' : i.tipo === 'fronteira' ? 'fronteira' : 'cobertura';
  if (i.origem === 'aprovacao-plus-v3') return 'plus';
  if (i.origem === 'sem_item') return i.masterEmRevisao ? 'produto_novo' : 'rascunho';
  return 'dispersao';
}

/** Valor da opção que significa APROVAR / RECUSAR no eixo do item (null = o dono precisa escolher uma opção real). */
export function valorAprovar(axis: string, options: QueueOption[]): string | null {
  const alvo = axis === 'preco' ? 'preco_certo' : axis === 'identidade' ? 'sim' : null;
  return alvo && options.some((o) => o.value === alvo && o.kind === 'escolha') ? alvo : null;
}
export function valorRecusar(axis: string, options: QueueOption[]): string | null {
  if (axis === 'preco' && options.some((o) => o.value === 'preco_errado')) return 'preco_errado';
  return options.some((o) => o.value === 'nao_e_este') ? 'nao_e_este' : null;
}

export const MIN_OFERTAS_QUEDA = 5;

/** Queda real = (referência - preço) / referência, só com referência de >= 5 ofertas. Sem isso: null (nunca inventa). */
export function quedaReal(priceCents: number | null, refCents: number | null, nRefs: number | null): number | null {
  if (priceCents == null || refCents == null || nRefs == null) return null;
  if (!(refCents > 0) || !(priceCents > 0) || nRefs < MIN_OFERTAS_QUEDA) return null;
  return (refCents - priceCents) / refCents;
}

/** Queda acima disto é sinal de anomalia (versão errada, preço de lista inflado), não de oportunidade: o cartão avisa. */
export const QUEDA_SUSPEITA = 0.5;

export const LOJA_ROTULO: Record<string, string> = { amazon: 'Amazon', shopee: 'Shopee', 'mercado-livre': 'Mercado Livre', magalu: 'Magalu' };

export type CartaoKey = { tipo: 'item' | 'oferta'; id: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseKey(key: unknown): CartaoKey | null {
  if (typeof key !== 'string') return null;
  const m = /^(item|oferta):(.+)$/.exec(key);
  if (!m || !UUID.test(m[2])) return null;
  return { tipo: m[1] as 'item' | 'oferta', id: m[2] };
}
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
