// Puro (sem banco, sem rede). Extratores de CAMPOS de identidade da Impressão 3D a partir de texto (título/atributos).
// Usados pela identidade (identity.ts) e pela aprovação em bloco (aprovacao-impressao3d.ts), para as duas regras concordarem.

/** Minúsculas, sem acento; mantém [a-z0-9.,+] para preservar "1,75", "pla+" e "1.75mm". */
export function foldCampo(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Material do filamento em forma canônica (a ordem importa: subtipos antes de "pla"). Silk é subtipo próprio (aparência e preço distintos). */
const MATERIAIS: Array<[string, RegExp]> = [
  ['PETG', /\bpetg\b/],
  ['PLA+', /\bpla ?\+|\bpla plus\b|\bpla pro\b/],
  ['PLA-SILK', /\b(silk|seda)\b/],
  ['PLA', /\bpla\b/],
  ['ABS', /\babs\b/],
  ['TPU', /\b(tpu|tpe|flexivel)\b/],
  ['ASA', /\basa\b/],
  ['NYLON', /\b(nylon|pa12|pa6)\b/],
  ['PC', /\bpolicarbonato\b/],
  ['PVA', /\bpva\b/],
  ['HIPS', /\bhips\b/],
];

const ESPECIAIS: Array<[string, RegExp]> = [
  ['WOOD', /\b(wood|madeira)\b/],
  ['CARBONO', /\b(carbono|carbon fiber|fibra de carbono|cf)\b/],
  ['GLOW', /\b(glow|brilha no escuro|fosforescente)\b/],
];

export function materialDe(texto: string): string | null {
  const t = foldCampo(texto);
  for (const [nome, re] of MATERIAIS) {
    if (re.test(t)) {
      const esp = ESPECIAIS.find(([, r]) => r.test(t));
      return esp ? nome + '-' + esp[0] : nome;
    }
  }
  return null;
}

/** Diâmetro 1,75 ou 2,85 mm ("1.75" sem "mm" também vale). */
export function diametroDe(texto: string): string | null {
  const t = foldCampo(texto);
  const m = /\b(1[.,]75|2[.,]85)\s?(?:mm)?(?![0-9])/.exec(t);
  return m ? m[1].replace(',', '.') + 'mm' : null;
}

/**
 * Massa/volume: "1kg", "500 g", "250ml", "1l". Mais de um valor DIFERENTE no texto é ambíguo => null (nunca escolhe um).
 * O diâmetro (1.75mm) não conta como massa.
 */
export function massaOuVolumeDe(texto: string): string | null {
  const t = foldCampo(texto).replace(/\b(1[.,]75|2[.,]85)\s?mm\b/g, ' ');
  const achados = new Set<string>();
  const re = /\b(\d+(?:[.,]\d+)?)\s?(kg|g|gr|ml|l|litro|litros)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const un = m[2] === 'gr' ? 'g' : m[2].startsWith('litro') ? 'l' : m[2];
    achados.add(`${m[1].replace(',', '.')}${un}`);
  }
  if (achados.size !== 1) return null;
  return [...achados][0];
}

const TIPOS_RESINA: Array<[string, RegExp]> = [
  ['standard', /\b(standard|padrao|comum)\b/],
  ['abs-like', /\babs like\b/],
  ['water-washable', /\b(water washable|lavavel|lavavel em agua|wash)\b/],
  ['flexivel', /\b(flexivel|flex|semiflexivel)\b/],
  ['tough', /\b(tough|resistente|rigida|engenharia)\b/],
  ['transparente', /\b(transparente|clear|cristal)\b/],
  ['plant-based', /\bplant based\b|\bvegetal\b/],
  ['castable', /\b(castable|fundicao|joalheria)\b/],
  ['alta-resolucao', /\b(8k|12k|alta resolucao|alta precisao|high detail)\b/],
];

export function tipoResinaDe(texto: string): string | null {
  const t = foldCampo(texto).replace(/-/g, ' ');
  for (const [nome, re] of TIPOS_RESINA) if (re.test(t)) return nome;
  return null;
}

// ---------------------------------------------------------------------------
// Impressora 3D: chave por FAMÍLIA do modelo (cor junta também para o aparelho)
// ---------------------------------------------------------------------------

/**
 * O ML cataloga a MESMA impressora várias vezes (cor, GTIN e voltagem diferentes: "A1 Prateado", "A1 Cinza Sem AMS", "A1 Fdm Aberta").
 * Para as marcas com léxico de famílias conferido, a chave é marca + família + variante (combo | solo); cor, GTIN e voltagem não separam.
 * Marca/família fora do léxico => null (a identidade segue o caminho normal por GTIN/MPN/modelo: nunca se inventa família).
 * Léxico (onda 1): Bambu Lab, Creality, Anycubic e Elegoo. As demais marcas entram quando o dry-run mostrar duplicidade e a lista for conferida.
 * Ordem importa: família mais específica primeiro.
 */
interface MarcaImpressora {
  chave: string;
  marca: RegExp;
  familias: Array<[string, RegExp]>;
  /** Variante "combo" (com AMS/CFS/filamento do fabricante). */
  combo: RegExp;
}

const MARCAS_IMPRESSORA: MarcaImpressora[] = [
  {
    chave: 'bambu lab',
    marca: /\bbambu\b/,
    familias: [
      ['a1-mini', /\ba1 ?(mini|m)\b/],
      ['a1', /\ba1(?=combo|\b)/],
      ['p1s', /\bp1s\b/],
      ['p1p', /\bp1p\b/],
      ['p2s', /\bp2s\b/],
      ['x1c', /\b(x1c|x1 carbon)\b/],
      ['x1e', /\bx1e\b/],
      ['h2d', /\bh2d\b/],
      ['h2s', /\bh2s\b/],
      ['h2c', /\bh2c\b/],
      ['a2l', /\ba2l\b/],
      ['x2d', /\bx2d\b/],
    ],
    combo: /(combo|\bcom ams\b|\bams lite\b)/,
  },
  {
    chave: 'creality',
    marca: /\bcreality\b/,
    familias: [
      ['ender-3-v3-se', /\bender ?3 v3 se\b/],
      ['ender-3-v3-ke', /\bender ?3 v3 ke\b/],
      ['ender-3-v3-plus', /\bender ?3 v3 plus\b/],
      ['ender-3-v3', /\bender ?3 v3\b/],
      ['ender-3-s1-pro', /\bender ?3 s1 pro\b/],
      ['ender-3-s1-plus', /\bender ?3 s1 plus\b/],
      ['ender-3-s1', /\bender ?3 s1\b/],
      ['ender-3-v2', /\bender ?3 v2\b/],
      ['ender-5-max', /\bender ?5 max\b/],
      ['ender-5-plus', /\bender ?5 plus\b/],
      ['ender-5-s1', /\bender ?5 s1\b/],
      ['k1-max', /\bk1 max\b/],
      ['k1c', /\bk1c\b/],
      ['k1-se', /\bk1 se\b/],
      ['k1', /\bk1\b/],
      ['k2-pro', /\bk2 pro\b/],
      ['k2-plus', /\bk2 plus\b/],
      ['k2', /\bk2\b/],
      ['hi', /\bcreality hi\b/],
      ['cr-200b-pro', /\bcr ?200b pro\b/],
      ['halot-one-plus', /\bhalot one plus\b/],
      ['halot-one', /\bhalot one\b/],
      ['halot-mage', /\bhalot mage\b/],
      ['halot-r6', /\bhalot r6\b/],
      ['halot-14k', /\bhalot 14k\b/],
    ],
    combo: /(\bcombo\b|\bcfs\b)/,
  },
  {
    chave: 'anycubic',
    marca: /\banycubic\b/,
    familias: [
      ['kobra-s1-v2', /\bkobra s1 v2\b/],
      ['kobra-s1', /\bkobra s1\b/],
      ['kobra-3-max', /\bkobra 3 max\b/],
      ['kobra-3-v2', /\bkobra 3 v2\b/],
      ['kobra-3', /\bkobra 3\b/],
      ['kobra-x', /\bkobra x\b/],
      ['photon-mono-m7-max', /\b(photon )?mono m7 max\b/],
      ['photon-mono-m7-pro', /\b(photon )?mono m7 pro\b/],
      ['photon-mono-m7', /\b(photon )?mono m7\b/],
      ['photon-mono-m5s', /\b(photon )?mono m5s\b/],
      ['photon-mono-4', /\bphoton mono 4\b/],
      ['photon-mono-se', /\bphoton mono se\b/],
      ['photon-mono-x-6k', /\bphoton mono x 6k\b/],
      ['photon-m3-plus', /\bphoton m3 plus\b/],
      ['photon-p1', /\bphoton p1\b/],
    ],
    combo: /\bcombo\b/,
  },
  {
    chave: 'elegoo',
    marca: /\belegoo\b/,
    familias: [
      ['centauri-carbon-2', /\bcentauri carbon 2\b/],
      ['centauri-carbon', /\bcentauri carbon\b/],
      ['neptune-4-plus', /\bneptune 4 plus\b/],
      ['neptune-4-pro', /\bneptune 4 pro\b/],
      ['neptune-4-max', /\bneptune 4 max\b/],
      ['neptune-4', /\bneptune 4\b/],
      ['saturn-4-ultra', /\bsaturn 4 ultra\b/],
      ['saturn-4', /\bsaturn 4\b/],
      ['mars-5-ultra', /\bmars 5 ultra\b/],
      ['mars-3', /\bmars 3\b/],
      ['orangestorm-giga', /\borangestorm giga\b/],
    ],
    combo: /\bcombo\b/,
  },
];

/** A marca do aparelho tem léxico de famílias (Bambu Lab, Creality)? Se tem e a família não é reconhecida, o item vai para REVISÃO (nunca cria master solto). */
export function marcaComLexico(marca: string | null, titulo: string): boolean {
  const m = foldCampo(marca ?? '');
  const t = foldCampo(titulo);
  const c = MARCAS_IMPRESSORA.filter((x) => x.marca.test(m));
  return c.length === 1 || (c.length === 0 && MARCAS_IMPRESSORA.filter((x) => x.marca.test(t)).length === 1);
}

export function chaveImpressora3d(marca: string | null, titulo: string, modelo: string | null): string | null {
  const m = foldCampo(marca ?? '');
  const t = foldCampo(titulo);
  // A marca vem do atributo; se o atributo não traz a marca (ou traz lixo), o título decide, mas só com UMA marca citada.
  const candidatas = MARCAS_IMPRESSORA.filter((x) => x.marca.test(m));
  const porTitulo = MARCAS_IMPRESSORA.filter((x) => x.marca.test(t));
  const alvo = candidatas.length === 1 ? candidatas[0] : candidatas.length === 0 && porTitulo.length === 1 ? porTitulo[0] : null;
  if (!alvo) return null;
  let fam: string | null = null;
  for (const src of [t, foldCampo(modelo ?? '')]) {
    for (const [nome, re] of alvo.familias) {
      if (re.test(src)) {
        fam = nome;
        break;
      }
    }
    if (fam) break;
  }
  if (!fam) return null;
  const semAms = /\bsem (ams|cfs)\b/.test(t);
  const combo = !semAms && alvo.combo.test(t);
  return `bm:impressora-3d|brand=${alvo.chave}|familia=${fam}|variante=${combo ? 'combo' : 'solo'}`;
}

/** Marcas que o ML grafa de mais de um jeito (mesma marca, chaves diferentes seriam duplicata). Sem espaços; só aliases conferidos. */
export function marcaCanonica(marca: string): string {
  const k = foldCampo(marca).replace(/[^a-z0-9]+/g, '');
  const ALIAS: Record<string, string> = { multifila: 'multfila', '3dfila': '3dfila', filamentosmultfila: 'multfila' };
  return ALIAS[k] ?? k;
}
