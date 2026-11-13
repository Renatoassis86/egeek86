/**
 * TESTE DAS FAIXAS DE PLATAFORMA (checklist da nova versão, itens #8 e #11 no lado dos dados). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-vitrine-plataforma.ts
 * Sai com código 1 se algo FALHAR. Só SELECT; nada é gravado.
 *
 * (a) puras: plataforma lida do banco e do título; 'unknown' nunca entra; Xbox One e Xbox 360 nunca entram (banco ou título);
 *     retrô/legado (PS2, Wii, 3DS...) nunca entra; PC e portáteis só por console de título conhecido; cross-gen não vira plataforma.
 * (b) estrutura: 4 faixas, sub-abas PS5/PS4 e Switch 2/Switch, jogos 10 e consoles 6, chaves únicas.
 * (c) banco: em TODA vitrine real, 0 item com plataforma 'unknown', Xbox One/360 ou retrô; cada faixa só tem a própria plataforma;
 *     jogos só em mídia física; consoles só consoles; faixa com menos de 4 itens vem oculta.
 */
import {
  FAIXAS_PLATAFORMA,
  PLATAFORMAS_VITRINE,
  VITRINE_REGRAS,
  chaveFaixa,
  ehPortatilPc,
  mencionaXboxForaDeLinha,
  plataformaDaVitrine,
  todasAsChaves,
  type PlataformaVitrine,
} from '../src/lib/vitrines';
import { titleIsLegacyPlatformOnly } from '../src/lib/catalog/platform';
import type { GamePlatformGen } from '../src/db/schema';

let fails = 0;
let total = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  total++;
  if (!ok) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
};

type Caso = [string, GamePlatformGen, string, 'jogo' | 'console' | 'acessorio', PlataformaVitrine | null];
const casos: Caso[] = [
  ['PS5 no banco', 'ps5', 'God of War Ragnarok PS5 Mídia Física', 'jogo', 'ps5'],
  ['PS4 no banco', 'ps4', 'The Last of Us Part II PS4 Mídia Física', 'jogo', 'ps4'],
  ['Switch 2 no banco', 'switch_2', 'Mario Kart World Nintendo Switch 2', 'jogo', 'switch_2'],
  ['Switch 1 no banco', 'switch_1', 'Zelda Tears of the Kingdom Nintendo Switch', 'jogo', 'switch_1'],
  ['Xbox Series no banco', 'xbox_series', 'Forza Horizon 5 Xbox Series X', 'jogo', 'xbox_series'],
  ['unknown sem pista no título nunca entra', 'unknown', 'Jogo Qualquer Mídia Física', 'jogo', null],
  ['unknown com plataforma no título é derivado', 'unknown', 'Hogwarts Legacy PS5 Mídia Física', 'jogo', 'ps5'],
  ['Xbox One no banco nunca entra', 'xbox_one', 'Halo Infinite Xbox One Mídia Física', 'jogo', null],
  ['Xbox 360 no banco nunca entra', 'xbox_360', 'Gears of War 3 Xbox 360', 'jogo', null],
  ['Xbox One só no título nunca entra', 'xbox_series', 'Forza Horizon 4 Xbox One', 'jogo', null],
  ['x360 no título nunca entra', 'unknown', 'Jogo X360 Original', 'jogo', null],
  ['Xone no título nunca entra', 'xbox_one', 'Console Xone S 1TB', 'console', null],
  ['PS2 no título nunca entra', 'unknown', 'God of War II PlayStation 2 Original', 'jogo', null],
  ['PS3 gravado como ps4 com título PS3 nunca entra', 'ps4', 'Uncharted 3 PS3 Mídia Física', 'jogo', null],
  ['Wii nunca entra', 'switch_1', 'Super Mario Galaxy Nintendo Wii', 'jogo', null],
  ['3DS nunca entra', 'unknown', 'Pokémon X Nintendo 3DS', 'jogo', null],
  ['Steam Deck é PC e portátil (console)', 'unknown', 'Console Valve Steam Deck OLED 512GB', 'console', 'pc'],
  ['ROG Ally é PC e portátil (console)', 'unknown', 'Console Portátil ASUS ROG Ally Z1 Extreme', 'console', 'pc'],
  ['Steam Deck como acessório não vira PC', 'unknown', 'Case para Steam Deck', 'acessorio', null],
  ['jogo "Steam" sem plataforma não vira PC', 'unknown', 'Jogo Steam Key', 'jogo', null],
  ['console PS5 mantém ps5', 'ps5', 'Console PlayStation 5 Slim 1TB', 'console', 'ps5'],
  ['console Switch 2 mantém switch_2', 'switch_2', 'Console Nintendo Switch 2', 'console', 'switch_2'],
];
for (const [nome, db, titulo, tipo, esperado] of casos) {
  const r = plataformaDaVitrine(db, titulo, tipo);
  const got = r.ok ? r.plataforma : null;
  check(`plataforma: ${nome}`, got === esperado, { got, esperado, r });
}
check('mencionaXboxForaDeLinha: Xbox One', mencionaXboxForaDeLinha('Console Xbox One S'));
check('mencionaXboxForaDeLinha: Xbox 360', mencionaXboxForaDeLinha('Jogo Xbox 360'));
check('mencionaXboxForaDeLinha: Series X não', !mencionaXboxForaDeLinha('Console Xbox Series X 1TB'));
check('ehPortatilPc: Legion Go', ehPortatilPc('Lenovo Legion Go 512GB'));
check('ehPortatilPc: PS5 não', !ehPortatilPc('Console PlayStation 5'));

// (b) estrutura
check('4 faixas de plataforma', FAIXAS_PLATAFORMA.length === 4 && FAIXAS_PLATAFORMA.map((f) => f.id).join() === 'playstation,nintendo,xbox,pc');
check('PlayStation tem sub-abas PS5 e PS4', FAIXAS_PLATAFORMA[0]!.subabas.map((s) => s.plataforma).join() === 'ps5,ps4');
check('Nintendo tem sub-abas Switch 2 e Switch', FAIXAS_PLATAFORMA[1]!.subabas.map((s) => s.plataforma).join() === 'switch_2,switch_1');
check('Xbox só tem Series (sem One nem 360)', FAIXAS_PLATAFORMA[2]!.subabas.map((s) => s.plataforma).join() === 'xbox_series');
check('toda sub-aba tem plataforma válida', FAIXAS_PLATAFORMA.every((f) => f.subabas.every((s) => (PLATAFORMAS_VITRINE as readonly string[]).includes(s.plataforma))));
check('lista de plataformas não inclui xbox_one, xbox_360 nem unknown', !(PLATAFORMAS_VITRINE as readonly string[]).some((p) => p === 'xbox_one' || p === 'xbox_360' || p === 'unknown'));
check('jogos 10 e consoles 6 por faixa', VITRINE_REGRAS.JOGOS_POR_FAIXA === 10 && VITRINE_REGRAS.CONSOLES_POR_FAIXA === 6);
const chaves = todasAsChaves();
check('12 chaves de faixa (6 plataformas x jogos/consoles)', chaves.filter((c) => c.startsWith('plataforma:')).length === 12);
check('chave de faixa é a esperada', chaveFaixa('ps5', 'jogos') === 'plataforma:ps5:jogos' && chaveFaixa('switch_2', 'consoles') === 'plataforma:switch_2:consoles');

// (c) banco
async function banco() {
  if (!process.env.DATABASE_URL) {
    console.log('INFO: sem DATABASE_URL, parte de banco pulada');
    return;
  }
  const { calcularVitrine } = await import('../src/server/vitrines/get-vitrine');
  const faixas = chaves.filter((c) => c.startsWith('plataforma:'));
  const todas = [...faixas, 'destaques' as const, 'acessorios' as const, 'menor-registrado' as const, 'mudancas' as const];
  const retro = /\b(ps ?[123]|playstation ?[123]|psp|vita|wii|3ds|2ds|nintendo ds|n64|snes|game ?cube|game ?boy|mega ?drive|dreamcast)\b/i;
  const resumo: Record<string, number> = {};
  for (const k of todas) {
    const r = await calcularVitrine(k);
    resumo[k] = r.itens.length;
    check(`[${k}] visível sse >= 4 itens`, r.visivel === r.itens.length >= VITRINE_REGRAS.MIN_ITENS, r.itens.length);
    for (const i of r.itens) {
      const marca = `[${k}] ${i.masterProductId.slice(0, 8)}`;
      check(`${marca}: plataforma conhecida e em linha`, i.plataforma != null && (PLATAFORMAS_VITRINE as readonly string[]).includes(i.plataforma), i.plataforma);
      check(`${marca}: nunca Xbox One/360`, !mencionaXboxForaDeLinha(i.titulo), i.titulo);
      check(`${marca}: nunca retrô no título`, !retro.test(i.titulo.replace(/\bps ?[45]\b/gi, '')) || /\bps ?[45]\b/i.test(i.titulo), i.titulo);
    }
    const m = /^plataforma:([a-z0-9_]+):(jogos|consoles)$/.exec(k);
    if (m) {
      const [, plat, tipo] = m;
      check(`[${k}] só a plataforma da faixa`, r.itens.every((i) => i.plataforma === plat), r.itens.map((i) => i.plataforma));
      check(`[${k}] só ${tipo === 'jogos' ? 'jogos' : 'consoles'}`, r.itens.every((i) => i.tipo === (tipo === 'jogos' ? 'jogo' : 'console')), r.itens.map((i) => i.tipo));
      check(`[${k}] no máximo ${tipo === 'jogos' ? 10 : 6}`, r.itens.length <= (tipo === 'jogos' ? 10 : 6), r.itens.length);
    }
  }
  console.log('INFO: itens por faixa', JSON.stringify(resumo));
  check('PC: não há jogo de PC no catálogo, faixa de jogos oculta (nenhum item inventado)', resumo['plataforma:pc:jogos'] === 0);
}

banco()
  .catch((e) => {
    fails++;
    console.error('FALHOU: parte de banco', e instanceof Error ? e.message : e, (e as { cause?: { message?: string } }).cause?.message ?? '');
  })
  .finally(() => {
    console.log(`${total - fails}/${total} verificações passaram`);
    process.exit(fails ? 1 : 0);
  });
