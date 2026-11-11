/**
 * Teste da fundação de lojas (migrações 0032/0033, 2026-11-11). LEITURA + transações desfeitas; nenhuma escrita persistida.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-lojas.ts  (código 1 se algo falhar)
 * Cobre: leitura das lojas, paridade da loja games com as constantes atuais (RULES), vertical única por loja, sem fallback ao
 * canal de games, falha segura, vertical impressao3d aceita pelo CHECK (em transação desfeita) e recusa de vertical inválida.
 */
import { connect } from './_dup-shared';
import { RULES } from '../src/lib/messaging/group-rules';
import { VERTICALS } from '../src/lib/catalog/verticais';
import { DEPARTAMENTOS, FLAG_KEYS, decidirEstado } from '../src/lib/catalog/departamentos';
import { GAMES_STORE_LIMITS, DEFAULT_STORE_LIMITS, resolveLimits, lojaGamesPadrao } from '../src/lib/stores/lojas';

let fails = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

class Desfeito extends Error {}

async function main() {
  const { getStores, getStoreByVertical, chatForStore, mapLoja } = await import('../src/server/stores');

  // ---- Puras ----
  check('VERTICALS contém impressao3d e as 6 anteriores', ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte', 'impressao3d'].every((v) => (VERTICALS as readonly string[]).includes(v)) && VERTICALS.length === 7);
  check('departamento impressao3d registrado com flag dept_impressao3d', DEPARTAMENTOS.some((d) => d.slug === 'impressao3d' && d.flag === 'dept_impressao3d') && FLAG_KEYS.includes('dept_impressao3d'));
  check(
    'impressao3d fechada: trava mestra desligada => fechado',
    decidirEstado({ masterEnv: undefined, flag: { key: 'dept_impressao3d', enabled: true, rules: [] }, mastersVisiveis: 99 }) === 'fechado',
  );
  check('impressao3d fechada: sem linha de flag => fechado', decidirEstado({ masterEnv: '1', flag: null, mastersVisiveis: 99 }) === 'fechado');
  check('GAMES_STORE_LIMITS == RULES (dia, hora, espaçamento, som, noite, cartões, produto)',
    GAMES_STORE_LIMITS.dailyCap === RULES.DAILY_CAP && GAMES_STORE_LIMITS.hourlyCap === RULES.HOURLY_CAP && GAMES_STORE_LIMITS.spacingDayMin === RULES.SPACING_DAY_MIN &&
    GAMES_STORE_LIMITS.spacingNightMin === RULES.SPACING_NIGHT_MIN && GAMES_STORE_LIMITS.soundCap === RULES.SOUND_CAP && GAMES_STORE_LIMITS.night.from === RULES.NIGHT_FROM_HOUR &&
    GAMES_STORE_LIMITS.night.until === RULES.NIGHT_UNTIL_HOUR && GAMES_STORE_LIMITS.cardDailyCap === RULES.CARD_DAILY_CAP && GAMES_STORE_LIMITS.productGapMin === RULES.PRODUCT_GAP_MIN &&
    GAMES_STORE_LIMITS.blackFridayDailyCap === RULES.DAILY_CAP_BLACK_FRIDAY);
  check('GAMES_STORE_LIMITS.classCaps == RULES.CLASS_CAP (normal)', (Object.keys(RULES.CLASS_CAP) as (keyof typeof RULES.CLASS_CAP)[]).every((k) => GAMES_STORE_LIMITS.classCaps[k] === RULES.CLASS_CAP[k][0]));
  check('resolveLimits respeita tetos duros (999/dia => 400, 999/hora => 60, 0 min => 1)', (() => {
    const l = resolveLimits({ dailyCap: 999, hourlyCap: 999, spacingDayMin: 0 });
    return l.dailyCap === 400 && l.hourlyCap === 60 && l.spacingDayMin === 1;
  })());
  check('resolveLimits({}) devolve o padrão das lojas novas (60/12/3/5/10)', (() => {
    const l = resolveLimits({});
    return l.dailyCap === 60 && l.hourlyCap === 12 && l.spacingDayMin === 3 && l.spacingNightMin === 5 && l.soundCap === 10 && !l.classes.includes('plataforma');
  })());
  check('chatForStore: loja nova sem chat => undefined, mesmo com TELEGRAM_GROUP_CHAT_ID no ambiente (sem fallback ao games)',
    chatForStore({ slug: 'livros', telegramChatId: null }, { TELEGRAM_GROUP_CHAT_ID: '-100123' }) === undefined);
  check('chatForStore: games sem chat na tabela usa o ambiente (fallback de transição)', chatForStore({ slug: 'games', telegramChatId: null }, { TELEGRAM_GROUP_CHAT_ID: '-100123' }) === '-100123');
  check('chatForStore: chat gravado na loja prevalece', chatForStore({ slug: 'livros', telegramChatId: '-100999' }, { TELEGRAM_GROUP_CHAT_ID: '-100123' }) === '-100999');
  check('falha segura: lojaGamesPadrao() é só games com limites de hoje', lojaGamesPadrao().slug === 'games' && lojaGamesPadrao().limits.dailyCap === 400);
  check('mapLoja: stage inválido vira rascunho; vertical inválida é descartada', (() => {
    const s = mapLoja({ id: 'x', slug: 'teste', name: 'T', stage: 'lixo', telegram_chat_id: null, telegram_chat_title: null, telegram_verified_at: null, telegram_bot_can_post: false, whatsapp_group_url: null, limits: {}, ad_tag: null, brand: {}, archived_at: null, verticals: ['livros', 'inventada'] });
    return s.stage === 'rascunho' && s.verticals.length === 1 && s.verticals[0] === 'livros' && s.limits.dailyCap === DEFAULT_STORE_LIMITS.dailyCap;
  })());

  // ---- Banco (leitura) ----
  const lojas = await getStores({ fresh: true });
  const bySlug = new Map(lojas.map((l) => [l.slug, l]));
  check('getStores lê 7 lojas do banco', lojas.length === 7 && lojas.every((l) => l.id !== 'fallback-games'), lojas.map((l) => l.slug));
  const games = bySlug.get('games');
  check('loja games: stage ativa, sem chat id gravado (chat vem do ambiente)', !!games && games.stage === 'ativa' && games.telegramChatId === null);
  check('PARIDADE: limites da loja games lidos do banco == constantes atuais (RULES)', JSON.stringify(games?.limits) === JSON.stringify(GAMES_STORE_LIMITS), games?.limits);
  const demais = ['tecnologia', 'eletrodomesticos', 'eletroeletronicos', 'livros', 'esporte', 'impressao-3d'];
  check('demais lojas existem, em rascunho, sem chat id', demais.every((s) => { const l = bySlug.get(s); return !!l && l.stage === 'rascunho' && l.telegramChatId === null && !l.telegramBotCanPost; }));
  check('cada vertical pertence a exatamente UMA loja', VERTICALS.every((v) => lojas.filter((l) => (l.verticals as string[]).includes(v)).length === 1));
  check('vertical games -> loja games; impressao3d -> loja impressao-3d', (await getStoreByVertical('games'))?.slug === 'games' && (await getStoreByVertical('impressao3d'))?.slug === 'impressao-3d');
  check('vertical desconhecida => sem loja (null)', (await getStoreByVertical('inventada')) === null);
  check('lojas novas herdam o padrão sugerido (60/dia)', demais.every((s) => bySlug.get(s)?.limits.dailyCap === 60));

  const sql = connect();
  try {
    const orf = await sql`SELECT count(*)::int AS n FROM group_messages WHERE store_id IS NULL`;
    const tot = await sql`SELECT count(*)::int AS n FROM group_messages`;
    console.log(`info group_messages: ${tot[0].n} linhas, ${orf[0].n} sem store_id (linhas novas do envio só ganham store_id quando o envio passar a gravá-lo)`);
    const chk = await sql`SELECT conname, pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname IN ('master_products_vertical_chk','affiliate_offers_vertical_chk')`;
    check('CHECKs de vertical têm as 7 verticais', chk.length === 2 && chk.every((c) => (VERTICALS as readonly string[]).every((v) => String(c.d).includes(`'${v}'`))));

    // CHECK aceita impressao3d e recusa lixo, SEMPRE em transação desfeita.
    let aceitou = false;
    let recusou = false;
    try {
      await sql.begin(async (tx) => {
        const alvo = await tx`SELECT id FROM master_products WHERE vertical = 'tecnologia' AND name ~* 'impressora 3d' LIMIT 1`;
        if (!alvo.length) throw new Error('sem master de impressora 3D para ensaiar');
        await tx`UPDATE master_products SET vertical = 'impressao3d' WHERE id = ${alvo[0].id}`;
        aceitou = true;
        await tx.unsafe('SAVEPOINT s1');
        try {
          await tx`UPDATE master_products SET vertical = 'inventada' WHERE id = ${alvo[0].id}`;
        } catch {
          recusou = true;
        }
        await tx.unsafe('ROLLBACK TO SAVEPOINT s1');
        // Oferta: o CHECK de affiliate_offers também aceita (UPDATE desfeito).
        const of = await tx`SELECT id FROM affiliate_offers WHERE vertical = 'tecnologia' LIMIT 1`;
        if (of.length) await tx`UPDATE affiliate_offers SET vertical = 'impressao3d' WHERE id = ${of[0].id}`;
        throw new Desfeito();
      });
    } catch (e) {
      if (!(e instanceof Desfeito)) check(`ensaio do CHECK sem erro (${e instanceof Error ? e.message : String(e)})`, false);
    }
    check('CHECK de master_products aceita impressao3d (transação desfeita)', aceitou);
    check('CHECK recusa vertical inventada (transação desfeita)', recusou);
    const resto = await sql`SELECT count(*)::int AS n FROM master_products WHERE vertical = 'impressao3d'`;
    check('nada persistiu: 0 masters em impressao3d (nada foi movido)', resto[0].n === 0, resto[0]);
  } finally {
    await sql.end();
  }

  console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os testes de lojas passaram.');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
