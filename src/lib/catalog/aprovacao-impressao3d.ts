// Puro (sem banco, sem rede): critérios da APROVAÇÃO EM BLOCO do catálogo de Impressão 3D (plano 2026-11-11, trilha A4).
// Usado por scripts/aprovar-catalogo-loja.ts (dry-run/apply/rollback) e testado em scripts/test-impressao3d-aprovacao.ts.
//
// Regra por TIPO (só aprova quem tem o campo obrigatório escrito no título ou no atributo estruturado; nunca completa por suposição):
//   impressora : marca + modelo
//   filamento  : marca + material (PLA, PETG, ABS, TPU...) + diâmetro (1,75 ou 2,85 mm) + massa (250 g, 500 g, 1 kg...)
//   resina     : marca + tipo de resina + volume/massa
// Quem não passa fica em 'review' (nada é rejeitado por este script). Cor junta: cor nunca é critério.
// Divergência consciente do quadro A4: tipo (FDM/resina) e voltagem da impressora NÃO bloqueiam (viram aviso no log), porque o título
// do anúncio de marcas como a Bambu Lab não os traz; o modelo identifica o aparelho. Decisão do dono se quiser endurecer.

import { scopeIssue } from './vertical/scope';
import { diametroDe, massaOuVolumeDe, materialDe, tipoResinaDe } from './vertical/i3d-fields';

export { diametroDe, massaOuVolumeDe, materialDe, tipoResinaDe };

export const CRITERIA_I3D_VERSION = 1;
/** Rótulo gravado em catalogGate.approvedBy: `bloco:<criterio>:<data>` (plano A4). */
export const CRITERIA_I3D_LABEL = 'bloco:i3d-v1';

/** Faixa de preço de uma oferta em relação à mediana das ofertas ativas (plano A4). */
export const FAIXA_MEDIANA_MIN = 0.35;
export const FAIXA_MEDIANA_MAX = 3;
export const REPUTACOES_ACEITAS = ['5_green', '4_light_green'] as const;
export const VENDAS_MIN = 50;

export type TipoImpressao3d = 'impressora' | 'filamento' | 'resina';

export const SEGMENTO_TIPO: Record<string, TipoImpressao3d> = {
  'impressora-3d': 'impressora',
  'filamento-3d': 'filamento',
  'resina-3d': 'resina',
};

export interface OfertaCandidata {
  /** Preço atual em centavos. */
  priceCents: number;
  networkSlug: string;
  quarentena: boolean;
  sellerReputation: string | null;
  sellerSales: number | null;
  title: string;
}

export interface CandidatoI3d {
  id: string;
  name: string;
  segment: string | null;
  vertical: string;
  manufacturer: string | null;
  mpn: string | null;
  hasImage: boolean;
  /** attributes.catalogGate */
  gate: { verdict?: string; suggested?: string; manual?: string } | null;
  /** attributes.vertical.catalogAttributes (snapshot do que a API devolveu). */
  catalogAttributes: Record<string, unknown> | null;
  ofertas: OfertaCandidata[];
  /** Outro master (de qualquer departamento fora de games) com o mesmo título normalizado, ou com a mesma chave de identidade. */
  duplicado: boolean;
  /** attributes.vertical.identityKey (os campos material/diametro/massa/tipo/volume dela vieram do titulo OU do atributo estruturado da API no cadastro). */
  identityKey?: string | null;
}

export interface AvaliacaoI3d {
  aprovavel: boolean;
  /** 'rejeitavel' = usado/não-novo/porteiro rejeitou: o script NÃO grava rejected, só conta. */
  rejeitavel: boolean;
  motivos: string[];
  avisos: string[];
  tipo: TipoImpressao3d | null;
  campos: Record<string, string | null>;
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const USADO = /\b(usad[oa]s?|seminov[oa]s?|semi novo|segunda mao|recondicionad[oa]s?|refurbished|open ?box|reembalad[oa]s?|vitrine|mostruario|outlet|importad[oa]s?|internacional|paralelo|replica|sem lacre|lacre rompido|avariad[oa]s?|com defeito)\b/;
const PALAVRA_PROIBIDA = /afiliad/;

/** Texto onde procurar o campo: nome do master + valores (string) do snapshot de atributos do catálogo. */
function textoDe(c: CandidatoI3d): string {
  const attrs = c.catalogAttributes ? Object.values(c.catalogAttributes).filter((v): v is string => typeof v === 'string').join(' ') : '';
  return `${c.name} ${attrs}`;
}

function marcaDe(c: CandidatoI3d): string | null {
  const a = c.catalogAttributes?.BRAND;
  const v = (typeof a === 'string' && a.trim() ? a : c.manufacturer ?? '').trim();
  return v ? v : null;
}

function modeloDe(c: CandidatoI3d): string | null {
  const a = c.catalogAttributes?.MODEL;
  const v = (typeof a === 'string' && a.trim() ? a : c.mpn ?? '').trim();
  return v ? v : null;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function avaliarImpressao3d(c: CandidatoI3d): AvaliacaoI3d {
  const motivos: string[] = [];
  const avisos: string[] = [];
  const tipo = c.segment ? SEGMENTO_TIPO[c.segment] ?? null : null;
  const campos: Record<string, string | null> = {};
  let rejeitavel = false;

  if (c.vertical !== 'impressao3d') motivos.push('vertical_diferente_de_impressao3d');
  if (!tipo) motivos.push('segmento_sem_regra_nesta_onda'); // pecas/bicos/mesas ficam para a onda seguinte
  const v = c.gate?.verdict;
  if (v === 'approved') motivos.push('ja_aprovado');
  if (v === 'rejected' || c.gate?.manual === 'rejected') {
    motivos.push('rejeitado_pelo_dono');
    rejeitavel = true;
  }
  if (c.gate?.suggested === 'rejected') {
    motivos.push('porteiro_sugeriu_rejeitar');
    rejeitavel = true;
  } else if (c.gate?.suggested !== 'approved') motivos.push('sem_evidencia_positiva_do_porteiro');

  const textos = [c.name, ...c.ofertas.map((o) => o.title)];
  if (textos.some((t) => USADO.test(fold(t)))) {
    motivos.push('nao_e_produto_novo');
    rejeitavel = true;
  }
  if (textos.some((t) => PALAVRA_PROIBIDA.test(fold(t)))) motivos.push('palavra_proibida');
  if (c.segment) {
    const issue = scopeIssue(c.segment, c.name) ?? textos.slice(1).map((t) => scopeIssue(c.segment!, t)).find(Boolean) ?? null;
    if (issue) motivos.push(`escopo:${issue.reason}`);
  }
  if (!c.hasImage) motivos.push('sem_foto');
  if (c.duplicado) motivos.push('possivel_duplicata');
  if (c.catalogAttributes && Object.values(c.catalogAttributes).some((x) => typeof x === 'string' && x.trim().toLowerCase() === 'unknown')) motivos.push('atributo_unknown');

  // Ofertas: >= 1 ativa (fora de quarentena) ML/Shopee, com preço entre 0,35x e 3x da mediana, de vendedor com reputação aceita.
  const ativas = c.ofertas.filter((o) => !o.quarentena && o.priceCents > 0 && (o.networkSlug === 'mercado-livre' || o.networkSlug === 'shopee'));
  if (ativas.length < 1) motivos.push('sem_oferta_ativa_ml_ou_shopee');
  else {
    const med = mediana(ativas.map((o) => o.priceCents));
    const naFaixa = ativas.filter((o) => o.priceCents >= med * FAIXA_MEDIANA_MIN && o.priceCents <= med * FAIXA_MEDIANA_MAX);
    if (naFaixa.length < 1) motivos.push('nenhuma_oferta_na_faixa_da_mediana');
    const min = Math.min(...ativas.map((o) => o.priceCents));
    const max = Math.max(...ativas.map((o) => o.priceCents));
    if (ativas.length >= 2 && max / min > FAIXA_MEDIANA_MAX) motivos.push(`amplitude_acima_de_${FAIXA_MEDIANA_MAX}x`);
    const comReputacao = naFaixa.filter((o) => o.sellerReputation && (REPUTACOES_ACEITAS as readonly string[]).includes(o.sellerReputation) && (o.sellerSales ?? 0) >= VENDAS_MIN);
    if (comReputacao.length < 1) motivos.push('sem_vendedor_com_reputacao_aceita');
  }

  // Regra por tipo.
  const marca = marcaDe(c);
  campos.marca = marca;
  if (!marca) motivos.push('marca_ausente');
  const texto = textoDe(c);
  if (tipo === 'impressora') {
    const modelo = modeloDe(c);
    campos.modelo = modelo;
    if (!modelo) motivos.push('modelo_ausente');
    const t = fold(texto);
    const tec = /\b(fdm|fff|corexy)\b/.test(t) ? 'fdm' : /\b(resina|sla|lcd|msla|dlp)\b/.test(t) ? 'resina' : null;
    campos.tecnologia = tec;
    if (!tec) avisos.push('tecnologia_fdm_ou_resina_nao_escrita');
    const volt = /\b(110|127|220)\s?v\b|\bbivolt\b/.exec(t);
    campos.voltagem = volt ? volt[0] : null;
    if (!volt) avisos.push('voltagem_nao_escrita');
    campos.combo = /\bcombo\b/.test(t) ? 'combo' : null;
  } else if (tipo === 'filamento') {
    const material = materialDe(texto) ?? campoDaChave(c.identityKey, "material");
    const diametro = diametroDe(texto) ?? campoDaChave(c.identityKey, "diametro");
    const massa = massaOuVolumeDe(texto) ?? campoDaChave(c.identityKey, "massa");
    Object.assign(campos, { material, diametro, massa });
    if (!material) motivos.push('material_ausente');
    if (!diametro) motivos.push('diametro_ausente');
    if (!massa) motivos.push('massa_ausente_ou_ambigua');
  } else if (tipo === 'resina') {
    const tipoR = tipoResinaDe(texto) ?? campoDaChave(c.identityKey, "tipo");
    const volume = massaOuVolumeDe(texto) ?? campoDaChave(c.identityKey, "volume");
    Object.assign(campos, { tipoResina: tipoR, volume });
    if (!tipoR) motivos.push('tipo_de_resina_ausente');
    if (!volume) motivos.push('volume_ausente_ou_ambiguo');
  }

  return { aprovavel: motivos.length === 0, rejeitavel, motivos, avisos, tipo, campos };
}

/** Campo `nome=valor` da chave de identidade por campos (ex.: diametro=1.75mm). Ausente => null. */
function campoDaChave(chave: string | null | undefined, nome: string): string | null {
  if (!chave) return null;
  for (const parte of chave.split('|')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i) === nome) return parte.slice(i + 1) || null;
  }
  return null;
}
