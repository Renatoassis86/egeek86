// Sem 'server-only': módulo PURO (sem banco, sem rede), importável por rotas, mensageria, scripts tsx e testes.
/**
 * R-70 / L1: FONTE ÚNICA da regra "todo link que o usuário recebe é link de afiliado do dono" (dono, 2026-11-16).
 *
 * PADRÃO NEGADO: rede sem padrão registrado em REGISTRO (ou com `padrao: null`) = NENHUM link dela vale. Rede nova só passa a valer
 * quando alguém escreve o padrão aqui, o teste (scripts/test-link-afiliado-r70.ts) e o trigger do banco (migration 0063) acompanham.
 *
 * Configuração: a tag da Amazon e o id de ferramenta do ML vêm de variável de ambiente (AMAZON_ASSOCIATE_TAG, MELI_TOOL_ID) com o
 * valor do dono como padrão, lido SÓ aqui. A tabela `affiliate_link_config` (0063) guarda os mesmos valores para o trigger; o medidor
 * (scripts/medir-links-afiliado.ts) falha se divergirem.
 */

export interface ConfigAfiliado {
  amazonTag: string;
  mlToolId: string;
}

const PADRAO_TAG = 'manusmonteiro-20';
const PADRAO_TOOL = '23952458';
const ID_SEGURO = /^[A-Za-z0-9_-]{1,40}$/;

export function configAfiliado(env: Record<string, string | undefined> = process.env): ConfigAfiliado {
  const tag = (env.AMAZON_ASSOCIATE_TAG ?? '').trim();
  const tool = (env.MELI_TOOL_ID ?? '').trim();
  return { amazonTag: ID_SEGURO.test(tag) ? tag : PADRAO_TAG, mlToolId: /^[0-9]{1,20}$/.test(tool) ? tool : PADRAO_TOOL };
}

export type RedeSlug = 'amazon' | 'mercado-livre' | 'shopee' | 'magalu' | 'aliexpress' | 'kabum';

interface PadraoRede {
  /** Hosts (ou sufixos com ponto inicial) que pertencem à loja. Serve para reconhecer URL de loja em texto livre. */
  hosts: string[];
  /** Valida a URL já parseada. null = rede registrada SEM padrão: nenhum link vale. */
  padrao: ((u: URL, c: ConfigAfiliado) => boolean) | null;
  /** Reescreve para o padrão do dono quando possível (só Amazon); null = não há reescrita segura. */
  normalizar?: (u: URL, c: ConfigAfiliado) => string | null;
}

const todosIguais = (vals: string[], esperado: string) => vals.length > 0 && vals.every((v) => v === esperado);
const hostEh = (h: string, d: string) => h === d || h.endsWith(`.${d}`);

export const REGISTRO: Record<RedeSlug, PadraoRede> = {
  amazon: {
    hosts: ['amazon.com.br', 'amazon.com', 'amzn.to', 'amzn.com', 'a.co', 'amzn.eu'],
    // Só amazon.com.br com a tag do dono em TODOS os parâmetros `tag`. a.co/amzn.to não deixam verificar a tag: não valem.
    padrao: (u, c) => u.protocol === 'https:' && (u.hostname === 'www.amazon.com.br' || u.hostname === 'amazon.com.br') && todosIguais(u.searchParams.getAll('tag'), c.amazonTag),
    normalizar: (u, c) => {
      if (u.protocol !== 'https:' || !(u.hostname === 'www.amazon.com.br' || u.hostname === 'amazon.com.br')) return null;
      const n = new URL(u.toString());
      n.searchParams.delete('tag');
      n.searchParams.set('tag', c.amazonTag);
      return n.toString();
    },
  },
  'mercado-livre': {
    hosts: ['meli.la', 'mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com', 'mercadolibre.com.ar', 'mlstatic.com'],
    padrao: (u, c) => {
      if (u.protocol !== 'https:') return false;
      if (u.hostname === 'meli.la') return /^\/[A-Za-z0-9]{3,}\/?$/.test(u.pathname);
      return hostEh(u.hostname, 'mercadolivre.com.br') && todosIguais(u.searchParams.getAll('matt_tool'), c.mlToolId);
    },
  },
  shopee: {
    hosts: ['s.shopee.com.br', 'shopee.com.br', 'shp.ee', 'shopee.com'],
    padrao: (u) => u.protocol === 'https:' && u.hostname === 's.shopee.com.br' && /^\/[A-Za-z0-9]{3,}\/?$/.test(u.pathname),
  },
  // Registradas SEM padrão: nenhum link delas vale até o dono definir o programa de afiliados e alguém escrever o padrão aqui.
  magalu: { hosts: ['magazineluiza.com.br', 'magalu.com', 'magazinevoce.com.br'], padrao: null },
  aliexpress: { hosts: ['aliexpress.com', 'aliexpress.us', 's.click.aliexpress.com'], padrao: null },
  kabum: { hosts: ['kabum.com.br'], padrao: null },
};

/** Redes cujo padrão existe (as únicas que podem ter link válido). */
export const REDES_COM_PADRAO = (Object.keys(REGISTRO) as RedeSlug[]).filter((r) => REGISTRO[r].padrao !== null);

/** Links institucionais permitidos (lista PEQUENA e explícita): o site, o canal/grupos do Telegram e do WhatsApp do projeto. */
export const HOSTS_INSTITUCIONAIS = ['www.egeek86.com', 'egeek86.com', 't.me', 'chat.whatsapp.com', 'whatsapp.com', 'wa.me', 'telegram.me'] as const;

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

/** Rede dona do host (por registro), ou null se o host não é de loja conhecida. */
export function redeDoHost(hostname: string): RedeSlug | null {
  const h = hostname.toLowerCase();
  for (const r of Object.keys(REGISTRO) as RedeSlug[]) if (REGISTRO[r].hosts.some((d) => hostEh(h, d))) return r;
  return null;
}

export function ehHostInstitucional(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (HOSTS_INSTITUCIONAIS as readonly string[]).includes(h);
}

/**
 * `redeSlug` informado: a URL tem de ser da loja dessa rede E casar com o padrão dela. Rede desconhecida/sem padrão: false.
 * Sem `redeSlug`: a rede é deduzida do host (usado em texto de mensagem, onde só há a URL).
 */
export function ehLinkAfiliadoValido(url: string | null | undefined, redeSlug?: string | null, c: ConfigAfiliado = configAfiliado()): boolean {
  const u = parse(url);
  if (!u) return false;
  const doHost = redeDoHost(u.hostname);
  if (!doHost) return false;
  const rede = redeSlug == null ? doHost : (redeSlug as RedeSlug);
  if (!(rede in REGISTRO) || rede !== doHost) return false;
  const p = REGISTRO[rede].padrao;
  return p != null && p(u, c);
}

export interface OfertaLink {
  redeSlug: string | null | undefined;
  affiliateUrl: string | null | undefined;
  affiliateLinkPending?: boolean | null;
}

/** Link publicável da oferta, ou null (pendente, de outra rede, sem marca ou de rede sem padrão). Nunca devolve URL crua. */
export function linkAfiliadoDe(o: OfertaLink, c: ConfigAfiliado = configAfiliado()): string | null {
  if (o.affiliateLinkPending) return null;
  const url = (o.affiliateUrl ?? '').trim();
  return ehLinkAfiliadoValido(url, o.redeSlug, c) ? url : null;
}

/** Normaliza para o padrão do dono quando há reescrita segura (Amazon força a tag); ML cru/Shopee/outras: null (não há como inventar). */
export function normalizarLinkAfiliado(url: string | null | undefined, redeSlug: string | null | undefined, c: ConfigAfiliado = configAfiliado()): string | null {
  const u = parse(url);
  if (!u) return null;
  if (ehLinkAfiliadoValido(u.toString(), redeSlug, c)) return u.toString();
  const rede = redeSlug as RedeSlug;
  if (!(rede in REGISTRO) || redeDoHost(u.hostname) !== rede) return null;
  const n = REGISTRO[rede].normalizar?.(u, c) ?? null;
  return n && ehLinkAfiliadoValido(n, rede, c) ? n : null;
}

// ---------------------------------------------------------------------------
// Porteiro de mensagem (L4): confere CADA URL do texto, da legenda e dos botões
// ---------------------------------------------------------------------------

export interface ViolacaoLink {
  url: string;
  onde: 'texto' | 'botao';
  motivo: 'loja_sem_link_de_afiliado' | 'host_fora_da_lista' | 'url_invalida';
  rede: RedeSlug | null;
}

const URL_NO_TEXTO = /https?:\/\/[^\s"'<>)\]]+/gi;

/** Extrai as URLs do texto (HTML do Telegram incluso: href="...", texto cru e links escapados com &amp;). */
export function extrairUrls(texto: string): string[] {
  const limpo = texto.replace(/&amp;/g, '&');
  const achadas = limpo.match(URL_NO_TEXTO) ?? [];
  return [...new Set(achadas.map((u) => u.replace(/[.,;:!?]+$/, '')))];
}

/**
 * Padrão NEGADO: toda URL tem de ser (a) institucional da lista explícita ou (b) link de afiliado válido do dono. Qualquer outra,
 * inclusive loja sem marca, loja de rede sem padrão e host desconhecido, é violação. Devolve a lista (vazia = pode enviar).
 */
export function auditarUrlsDeMensagem(entrada: { texto?: string | null; botoes?: (string | null | undefined)[]; textoSimples?: string | null }, c: ConfigAfiliado = configAfiliado()): ViolacaoLink[] {
  const itens: { url: string; onde: 'texto' | 'botao' }[] = [];
  for (const t of [entrada.texto, entrada.textoSimples]) if (t) for (const u of extrairUrls(t)) itens.push({ url: u, onde: 'texto' });
  for (const b of entrada.botoes ?? []) if (b) itens.push({ url: b.trim(), onde: 'botao' });
  const out: ViolacaoLink[] = [];
  const vistos = new Set<string>();
  for (const it of itens) {
    const chave = `${it.onde}|${it.url}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const u = parse(it.url);
    if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) {
      out.push({ ...it, motivo: 'url_invalida', rede: null });
      continue;
    }
    if (ehHostInstitucional(u.hostname)) continue;
    const rede = redeDoHost(u.hostname);
    if (rede) {
      if (!ehLinkAfiliadoValido(it.url, rede, c)) out.push({ ...it, motivo: 'loja_sem_link_de_afiliado', rede });
      continue;
    }
    out.push({ ...it, motivo: 'host_fora_da_lista', rede: null });
  }
  return out;
}

/** Texto curto e SEM URL para registro/alerta (evita que o próprio alerta carregue o link ruim). */
export function resumoViolacoes(v: ViolacaoLink[]): string {
  return v
    .slice(0, 5)
    .map((x) => {
      let host = '?';
      try {
        host = new URL(x.url).hostname;
      } catch {
        /* url inválida */
      }
      return `${x.onde}:${x.motivo}:${host}`;
    })
    .join('; ');
}

// ---------------------------------------------------------------------------
// SQL (L3): predicados reutilizados por site, mensagens, painel, vitrines e sitemap
// ---------------------------------------------------------------------------

function aliasSeguro(alias: string): string {
  return alias.replace(/[^a-z0-9_]/gi, '');
}

/**
 * Predicado BARATO de visibilidade (LIKE, sem regex) para listas públicas: oferta sem pendência E com marca de afiliado do dono.
 * A checagem ESTRITA (regex por rede) roda no trigger (0063), no /go, no porteiro e no medidor; aqui o custo importa (listas grandes).
 */
export function linkPublicavelSql(alias = 'o', c: ConfigAfiliado = configAfiliado()): string {
  const a = aliasSeguro(alias);
  const url = `COALESCE(${a}.affiliate_url, '')`;
  return `(${a}.affiliate_link_pending = false AND (${url} LIKE 'https://meli.la/%' OR ${url} LIKE 'https://s.shopee.com.br/%' OR (${url} LIKE 'https://%amazon.com.br/%' AND ${url} LIKE '%tag=${c.amazonTag}%') OR (${url} LIKE 'https://%mercadolivre.com.br/%' AND ${url} LIKE '%matt_tool=${c.mlToolId}%')))`;
}

/** Versão ESTRITA em SQL (regex), para o medidor e para auditoria: espelha `ehLinkAfiliadoValido` por rede (`slugCol` = coluna do slug da rede). */
export function linkValidoEstritoSql(urlCol: string, slugCol: string, c: ConfigAfiliado = configAfiliado()): string {
  const u = urlCol.replace(/[^a-z0-9_.]/gi, '');
  const s = slugCol.replace(/[^a-z0-9_.]/gi, '');
  const tag = c.amazonTag;
  const tool = c.mlToolId;
  return `(
    (${s} = 'amazon' AND ${u} ~* '^https://(www[.])?amazon[.]com[.]br/' AND ${u} ~* '[?&]tag=${tag}(&|#|$)' AND ${u} !~* '[?&]tag=(?!${tag}(&|#|$))')
    OR (${s} = 'mercado-livre' AND (${u} ~ '^https://meli[.]la/[A-Za-z0-9]{3,}/?$'
         OR (${u} ~* '^https://([a-z0-9-]+[.])*mercadolivre[.]com[.]br/' AND ${u} ~* '[?&]matt_tool=${tool}(&|#|$)' AND ${u} !~* '[?&]matt_tool=(?!${tool}(&|#|$))')))
    OR (${s} = 'shopee' AND ${u} ~ '^https://s[.]shopee[.]com[.]br/[A-Za-z0-9]{3,}/?$')
  )`;
}
