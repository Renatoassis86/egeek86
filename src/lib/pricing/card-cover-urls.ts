// Módulo PURO (sem banco, sem rede): ordem e variantes de URL das capas dos cards (fila #65, dono 2026-11-15).
// Nada aqui inventa imagem: só reescreve o ENDEREÇO da mesma foto para a versão maior que a própria CDN da loja serve.

const HOST_OK: Record<string, RegExp> = {
  'mercado-livre': /mlstatic\.com|mercadolivre/i,
  shopee: /shopee|susercontent|shp\.ee/i,
  amazon: /media-amazon|ssl-images-amazon/i,
};
const ANY_CDN = /mlstatic\.com|mercadolivre|shopee|susercontent|shp\.ee|media-amazon|ssl-images-amazon/i;

/** https obrigatório; o endereço tem de ser da CDN da MESMA loja da oferta (incidente 2026-11-11). Rede desconhecida: qualquer CDN conhecida. */
export function coverUrlOk(raw: unknown, networkSlug: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  if (!/^https:\/\//i.test(u)) return null;
  const re = (networkSlug && HOST_OK[networkSlug]) || ANY_CDN;
  return re.test(u) ? u : null;
}

/** Variantes do MESMO endereço, da melhor para a pior; a original vai primeiro. */
export function coverUrlVariants(url: string): string[] {
  const out: string[] = [url];
  const add = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };
  if (/mlstatic\.com/i.test(url)) {
    // ML: ...-I.jpg (miniatura), -V, -O (original), -F (cheia). Troca de sufixo e de extensão (webp -> jpg).
    const m = url.match(/^(.*)-([A-Z])\.(webp|jpe?g|png)(\?.*)?$/i);
    if (m) {
      const [, base, suf, ext, q = ''] = m;
      const cur = suf.toUpperCase();
      for (const s of ['F', 'O']) {
        if (s !== cur) add(`${base}-${s}.${ext}${q}`);
        if (/webp/i.test(ext)) add(`${base}-${s}.jpg${q}`);
      }
      if (cur !== 'V') add(`${base}-V.${ext}${q}`);
    }
    add(url.replace('/D_NQ_NP_2X_', '/D_NQ_NP_').replace('/D_Q_NP_2X_', '/D_Q_NP_'));
    if (/\/D_(NQ_NP|Q_NP)_(?!2X_)/.test(url)) add(url.replace(/\/D_NQ_NP_(?!2X_)/, '/D_NQ_NP_2X_'));
  } else if (/media-amazon|ssl-images-amazon/i.test(url)) {
    // Amazon: .../I/ID._AC_UL320_....jpg -> versão grande e original sem transformação.
    const m = url.match(/^(https:\/\/[^/]+\/images\/I\/[A-Za-z0-9%+_-]+)\._[^/]*\.(jpe?g|png|webp)$/);
    if (m) {
      add(`${m[1]}._AC_SL1000_.${m[2]}`);
      add(`${m[1]}.${m[2]}`);
    }
  } else if (/shopee|susercontent/i.test(url)) {
    // Shopee: sufixo _tn = miniatura.
    if (/_tn(\.[a-z]+)?$/i.test(url)) add(url.replace(/_tn(\.[a-z]+)?$/i, '$1'));
  }
  return out.slice(0, 5);
}

export interface CoverSource {
  url: string;
  networkSlug: string | null;
  official?: boolean;
}

/** Ordem dos candidatos de um master: a da própria oferta, depois as demais (oficial e rede com foto maior primeiro), sem repetir endereço. */
export function orderCoverCandidates(own: string | null, others: CoverSource[], defaults: string[]): string[] {
  const rank = (s: CoverSource) => (s.official ? 0 : 10) + (s.networkSlug === 'mercado-livre' ? 0 : s.networkSlug === 'amazon' ? 1 : 2);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string | null) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };
  push(own);
  for (const s of [...others].sort((a, b) => rank(a) - rank(b))) push(s.url);
  for (const d of defaults) push(coverUrlOk(d, null));
  return out.slice(0, 8);
}
