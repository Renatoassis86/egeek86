/**
 * Sinopses reais dos jogos da cartela a partir da API oficial da WikipÃ©dia (MediaWiki), CC BY-SA.
 * Nunca inventa texto: sÃ³ grava o resumo da pÃ¡gina quando o tÃ­tulo casa e a pÃ¡gina Ã© de jogo.
 * Sem match seguro, o jogo fica sem sinopse.
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/fetch-sinopses.ts            (dry-run, amostra)
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/fetch-sinopses.ts --all      (dry-run, todos)
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/fetch-sinopses.ts --all --apply
 *
 * --apply sÃ³ preenche description quando ela Ã© NULL e guarda a fonte em attributes.synopsis_source.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifyCatalogItem, foldTitle } from '../src/lib/catalog/dimensions';

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const UA = 'EspacoGeek86/1.0 (https://www.egeek86.com)';

const NOISE =
  /\b(jogo|jogos|game|games|midia|fisica|fisico|lacrado|lacrada|novo|nova|original|ps[1-5]|playstation ?[1-5]?|xbox( ?(360|one|series ?[xs]?))?|series ?[xs]|nintendo|switch|wii ?u?|3ds|ds|pc|dublado|legendado|portugues|br|pt|edicao|edition|standard|deluxe|day one|versao|brasil|para|de|do|da|ntsc|pal|mod|oficial|import(ado)?|cd|dvd|bluray)\b/g;

function cleanTitle(name: string): string {
  let t = foldTitle(name).replace(/[\[\(].*?[\]\)]/g, ' ');
  t = t.replace(/['â€™`]/g, '').replace(NOISE, ' ').replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}
const EDITION_OK = new Set(['reimagined','collectors','collector','remastered','remaster','remake','edition','editions','tales','collection','definitive','goty','complete','ultimate','anniversary','console','special','day','one','launch','gold','premium','legacy','enhanced','hd','trilogy','bundle','pack','the','and']);
const tokens = (s: string) => foldTitle(s).replace(/['â€™`]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

async function wikiLookup(lang: 'pt' | 'en', term: string, cleaned: string) {
  const suffix = lang === 'pt' ? ' jogo eletrÃ´nico' : ' video game';
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(term + suffix)}` +
    `&prop=extracts|pageprops|info&exintro=1&explaintext=1&exsentences=4&inprop=url&redirects=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = (await res.json()) as { query?: { pages?: Record<string, any> } };
  const pages = Object.values(json.query?.pages ?? {}).sort((a: any, b: any) => (a.index ?? 9) - (b.index ?? 9));
  const want = tokens(cleaned);
  for (const p of pages as any[]) {
    const title = tokens(String(p.title).replace(/\(.*?\)/g, ''));
    const extract = String(p.extract ?? '').trim();
    if (!extract || extract.length < 80) continue;
    // tÃ­tulo da pÃ¡gina precisa estar contido no tÃ­tulo limpo; sobras sÃ³ podem ser palavras (nunca nÃºmero/algarismo romano,
    // para nÃ£o confundir "Final Fantasy VII" com "Final Fantasy" nem sequÃªncias de uma mesma franquia)
    const inWant = title.every((w) => want.includes(w));
    const extras = want.filter((w) => !title.includes(w));
    const extrasOk = extras.length <= 2 && extras.every((w) => EDITION_OK.has(w));
    const longEnough = title.join('').length >= 6;
    const isGame = lang === 'pt' ? /jogo eletr[Ã´o]nico|videogame|video game|jogo de/i.test(extract) : /video game|is a .*game|role-playing|simulation/i.test(extract);
    if (inWant && extrasOk && longEnough && isGame) {
      return { text: extract, url: String(p.fullurl), title: String(p.title), lang };
    }
  }
  return null;
}

async function main() {
  const rows = (await db.execute(sql`
    select id, name, product_type from master_products
    where product_type = 'game' and description is null
    order by name`)) as unknown as Array<{ id: string; name: string; product_type: any }>;
  const games = rows.filter((r) => classifyCatalogItem(r.name, r.product_type).dimension === 'game');
  const list = ALL ? games : games.filter((_, i) => i % Math.ceil(games.length / 40) === 0).slice(0, 40);
  console.log(`jogos publicos sem sinopse: ${games.length}; processando ${list.length}; apply=${APPLY}`);

  let hit = 0;
  for (const g of list) {
    const cleaned = cleanTitle(g.name);
    if (cleaned.length < 3) { console.log(`- SEM    | ${g.name}`); continue; }
    let r = await wikiLookup('pt', cleaned, cleaned);
    if (!r) r = await wikiLookup('en', cleaned, cleaned);
    if (!r) { console.log(`- SEM    | ${g.name}  [${cleaned}]`); continue; }
    hit++;
    console.log(`+ ${r.lang.toUpperCase()}  | ${g.name}  ->  ${r.title}\n      ${r.text.slice(0, 110).replace(/\n/g, ' ')}...`);
    if (APPLY) {
      const attrs = JSON.stringify({ synopsis_source: { name: `WikipÃ©dia (${r.lang})`, url: r.url, license: 'CC BY-SA 4.0' } });
      await db.execute(sql`update master_products set description = ${r.text},
        attributes = attributes || ${attrs}::jsonb where id = ${g.id} and description is null`);
    }
    await new Promise((res) => setTimeout(res, 120));
  }
  console.log(`\nacertos: ${hit}/${list.length}`);
  process.exit(0);
}
main();
