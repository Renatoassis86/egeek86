// REGRAS DO DONO EXECUTAVEIS (2026-11-18: "o codigo ou nao finaliza a implementacao ou nao faz o que eu peco"). Cada regra pedida pelo dono vira uma verificacao aqui;
// o portao (npm run gate) roda este arquivo, entao uma mudanca que desfaca a regra nao passa. Fonte das regras: docs/03-metodologia/FLUXO_MESTRE.md (secoes 15.x) e CLAUDE.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERTICALS } from '../src/lib/catalog/verticais';
import { RELEASED_VERTICALS, RULES } from '../src/lib/messaging/group-rules';
import { AMAZON_MODE_VERTICALS } from '../src/lib/pricing/amazon-mode';
import { OFFER_FRESHNESS_DAYS } from '../src/lib/affiliate/price-verdict';
import { OFERTA_CLICAVEL_MAX_HORAS, OFERTA_CLICAVEL_MAX_HORAS_AMAZON } from '../src/lib/catalog/departamentos';
import { REDES_AUTO } from '../src/lib/aprovacao/auto-guarda';
import { VERTICAIS_SHOPEE_OUTRAS } from '../src/lib/catalog/vertical/shopee-rodizio';
import { LOJAS } from '../src/lib/catalog/inventario';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const regra = (id: string, ok: boolean, msg: string) => assert.ok(ok, `${id}: ${msg}`);

// ---- R-94/R-97: toda loja nasce completa. Vertical nova que falta em UMA lista e o erro que deixou a Beleza sem mensagens ----
const offers = read('src/server/messaging/group-offers.ts');
// Lista literal do codigo (sem regex dinamico): o trecho entre colchetes depois de um marcador.
const listaApos = (src: string, marcador: string): string[] => {
  const i = src.indexOf(marcador);
  if (i < 0) return [];
  const ini = src.indexOf('[', i);
  const fim = src.indexOf(']', ini);
  return src.slice(ini + 1, fim).split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean);
};
const releasedPlus = listaApos(offers, 'const RELEASED_PLUS =');
const deteccaoPadrao = listaApos(offers, 'opts.verticals ??');
for (const v of VERTICALS) {
  regra('R-94', RELEASED_VERTICALS.includes(v), `vertical ${v} fora de RELEASED_VERTICALS (group-rules.ts)`);
  regra('R-94', AMAZON_MODE_VERTICALS.includes(v), `vertical ${v} fora de AMAZON_MODE_VERTICALS`);
  regra('R-94', LOJAS.some((l) => l.slug === v), `vertical ${v} fora de LOJAS (inventario.ts)`);
  if (v !== 'games') {
    regra('R-94', releasedPlus.includes(v), `vertical ${v} fora de RELEASED_PLUS (group-offers.ts)`);
    // PENDENCIA CONHECIDA (checklist 2026-11-18, item Shopee): livros ainda sem categoria da Shopee configurada; a excecao some quando for implementado.
    if (v !== 'livros') regra('R-94', (VERTICAIS_SHOPEE_OUTRAS as readonly string[]).includes(v), `vertical ${v} fora do rodizio da Shopee`);
  }
  regra('R-94', deteccaoPadrao.includes(v), `vertical ${v} fora do padrao da deteccao (group-offers.ts)`);
}
const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string }[] };
for (const v of VERTICALS) if (v !== 'games') regra('R-97', vercel.crons.some((c) => c.path === `/api/cron/collect-vertical?v=${v}`), `sem cron de coleta para ${v}`);

// ---- R-90/R-100: o banco e de anuncios ativos; Amazon igual as outras lojas; a idade nao tira oferta do ar ----
regra('R-90', OFFER_FRESHNESS_DAYS >= 365 || !!process.env.OFFER_FRESHNESS_DAYS, 'janela de frescor voltou a 7 dias');
regra('R-90', OFERTA_CLICAVEL_MAX_HORAS_AMAZON === OFERTA_CLICAVEL_MAX_HORAS, 'Amazon com regra propria de idade');

// ---- R-93: aprovacao continua libera todas as lojas ----
for (const r of ['amazon', 'mercado-livre', 'shopee']) regra('R-93', REDES_AUTO.has(r), `rede ${r} fora da aprovacao continua`);

// ---- R-96: a vitrine de jogos ate R$ 200 e um PLUS: nao mexe no ciclo normal de envio (dono, 2026-11-18) ----
const vit = ['src/server/messaging/vitrine-games.ts', 'src/lib/messaging/vitrine-games.ts', 'src/app/api/cron/vitrine-games/route.ts', 'src/server/messaging/vitrine-games-capa.tsx'].map(read).join('\n');
regra('R-96', !/group-queue|group-auto|group-offers|group-rules|group-plan/.test(vit), 'a vitrine importa o motor do ciclo normal');
regra('R-96', !/(INSERT INTO|UPDATE|DELETE FROM)\s+group_messages/i.test(vit), 'a vitrine escreve em group_messages (conta nos tetos do ciclo normal)');
regra('R-96', vercel.crons.some((c) => c.path === '/api/cron/vitrine-games'), 'a vitrine tem cron proprio');
const ciclo = read('src/server/messaging/group-auto.ts') + read('src/app/api/cron/group-messages/route.ts');
regra('R-96', !/vitrine-games|rodarVitrineGames/.test(ciclo), 'o ciclo normal chama a vitrine');
regra('R-96', /silent: true/.test(read('src/server/messaging/vitrine-games.ts')), 'a vitrine deixa de ser silenciosa');

// ---- R-99: link de compra no texto de toda postagem do Telegram ----
const gm = read('src/lib/messaging/group-messages.ts');
regra('R-99', /comLinkDeCompra\(render\(input, 'tg'\), input, 'tg'\)/.test(gm) && /comLinkDeCompra\(render\(input, channel\), input, channel\)/.test(gm), 'montagem do texto sem o link de compra');

// ---- R-100: diversidade (tipo, produto, rede), teto de tipo ----
const gr = read('src/lib/messaging/group-rules.ts');
regra('R-100', RULES.TIPO_MAX_SHARE_PCT <= 20, 'teto de tipo acima de 20%');
regra('R-100', gr.includes('masterCountOf') && gr.includes('redeCountOf') && gr.includes('GROUP_DIVERSIDADE'), 'ordenacao sem produto/rede');

// ---- R-98: envio por loja com concorrencia limitada ao pool do banco, janela propria por loja ----
const auto = read('src/server/messaging/group-auto.ts');
regra('R-98', /GROUP_SEND_CONC\) \|\| 3/.test(auto) && !/await Promise\.all\(\[\.\.\.porLoja\.values\(\)\]\.map/.test(auto), 'envio de todas as lojas ao mesmo tempo');
const q = read('src/server/messaging/group-queue.ts');
regra('R-98', q.includes('rn_v') && q.includes('perV'), 'janela do envio sem divisao por loja');

// ---- R-70: todo link ao usuario e de afiliado do dono (padrao negado no envio) ----
regra('R-70', read('src/lib/messaging/telegram-send.ts').includes('auditarUrlsDeMensagem'), 'envio sem auditoria de link');

// ---- pronto = no Guia: toda regra citada aqui existe no Fluxo Mestre ----
const guia = read('docs/03-metodologia/FLUXO_MESTRE.md');
for (const id of ['R-93', 'R-94', 'R-95', 'R-96', 'R-97', 'R-98', 'R-99', 'R-100']) regra(id, guia.includes(`${id},`) || guia.includes(`${id} `), 'regra ausente do Fluxo Mestre');

console.log('test-regras-do-dono: OK');
