/**
 * R-70: TODO link que o usuário recebe é link de afiliado do dono (dono, 2026-11-16). Puro (sem banco, sem rede, sem Telegram real).
 * Uso: npx tsx scripts/test-link-afiliado-r70.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  REGISTRO, REDES_COM_PADRAO, auditarUrlsDeMensagem, configAfiliado, ehLinkAfiliadoValido, extrairUrls, linkAfiliadoDe,
  linkPublicavelSql, linkValidoEstritoSql, normalizarLinkAfiliado,
} from '../src/lib/affiliate/link-afiliado';
import { sendTelegramGroupMessage } from '../src/lib/messaging/telegram-send';
import { CASOS_LINK } from './_link-afiliado-casos';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const cfg = configAfiliado({});

// Config: padrão do dono e override por ambiente; valor malicioso/inválido cai no padrão (nunca entra em SQL)
ok(cfg.amazonTag === 'manusmonteiro-20' && cfg.mlToolId === '23952458', 'config padrão do dono', cfg);
ok(configAfiliado({ AMAZON_ASSOCIATE_TAG: "x'; drop table--", MELI_TOOL_ID: 'abc' }).amazonTag === 'manusmonteiro-20', 'tag inválida cai no padrão');
ok(configAfiliado({ AMAZON_ASSOCIATE_TAG: 'outra-21', MELI_TOOL_ID: '777' }).mlToolId === '777', 'override por ambiente');

// L1: tabela de casos de referência (a mesma conferida contra as funções SQL da 0063)
for (const [url, rede, esperado] of CASOS_LINK) ok(ehLinkAfiliadoValido(url, rede, cfg) === esperado, `caso ${rede} ${url}`, esperado);

// Casos nomeados do pedido do dono
ok(!ehLinkAfiliadoValido('https://a.co/d/xyz1234', 'amazon', cfg), 'a.co sem tag (compartilhar do app) NÃO vale');
ok(!ehLinkAfiliadoValido('https://www.amazon.com.br/dp/B0ABC12345', 'amazon', cfg), 'amazon.com.br/dp sem tag NÃO vale');
ok(!ehLinkAfiliadoValido('https://www.amazon.com.br/dp/B0ABC12345?tag=alheia-20', 'amazon', cfg), 'tag de outra pessoa NÃO vale');
ok(!ehLinkAfiliadoValido('https://www.mercadolivre.com.br/p/MLB12345678', 'mercado-livre', cfg), 'ML /p/MLB cru NÃO vale');
ok(!ehLinkAfiliadoValido('https://www.mercadolivre.com.br/p/MLB12345678?matt_tool=111', 'mercado-livre', cfg), 'ML URL longa com matt_tool de outro id NÃO vale');
ok(!ehLinkAfiliadoValido('https://shopee.com.br/produto-i.1.2', 'shopee', cfg), 'Shopee fora de s.shopee NÃO vale');
ok(!ehLinkAfiliadoValido('https://meli.la/1AbCdEf', 'rede-nova-hipotetica', cfg), 'rede nova hipotética: padrão negado');
ok(!ehLinkAfiliadoValido('https://www.magazineluiza.com.br/x/p/1/', 'magalu', cfg), 'magalu registrada sem padrão: nada vale');
ok(REDES_COM_PADRAO.join() === 'amazon,mercado-livre,shopee', 'só 3 redes têm padrão', REDES_COM_PADRAO);
ok(Object.values(REGISTRO).every((r) => r.padrao === null || r.hosts.length > 0), 'toda rede com padrão declara hosts');

// linkAfiliadoDe: pendente ou inválida => null; nunca devolve URL crua
ok(linkAfiliadoDe({ redeSlug: 'mercado-livre', affiliateUrl: 'https://meli.la/1AbCdEf', affiliateLinkPending: true }, cfg) === null, 'pendente nunca publica');
ok(linkAfiliadoDe({ redeSlug: 'mercado-livre', affiliateUrl: 'https://www.mercadolivre.com.br/p/MLB1' }, cfg) === null, 'ML cru: null');
ok(linkAfiliadoDe({ redeSlug: 'amazon', affiliateUrl: 'https://www.amazon.com.br/dp/B0X?tag=manusmonteiro-20' }, cfg) !== null, 'Amazon com tag: devolve');

// L2: normalização (Amazon força a tag; o resto não inventa)
const n1 = normalizarLinkAfiliado('https://www.amazon.com.br/dp/B0X?tag=alheia-20&th=1', 'amazon', cfg);
ok(!!n1 && ehLinkAfiliadoValido(n1, 'amazon', cfg) && !n1.includes('alheia'), 'amazon: troca a tag alheia pela do dono', n1);
ok(normalizarLinkAfiliado('https://www.amazon.com.br/dp/B0X', 'amazon', cfg)?.includes('tag=manusmonteiro-20') === true, 'amazon sem tag: acrescenta');
ok(normalizarLinkAfiliado('https://a.co/d/xyz', 'amazon', cfg) === null, 'a.co não tem reescrita segura');
ok(normalizarLinkAfiliado('https://www.mercadolivre.com.br/p/MLB1', 'mercado-livre', cfg) === null, 'ML cru não vira meli.la sozinho (fica pendente)');

// L4: porteiro de mensagem (texto, texto simples e CADA URL de botão)
const GO = 'https://www.egeek86.com/go/ps5-slim?s=tg&m=abc123';
ok(auditarUrlsDeMensagem({ texto: `Oferta <a href="${GO.replace(/&/g, '&amp;')}">ver</a>`, botoes: [GO] }, cfg).length === 0, '/go do site e botão /go passam');
ok(auditarUrlsDeMensagem({ texto: 'Entre: https://chat.whatsapp.com/AbCdEf e https://t.me/egeek86', botoes: [] }, cfg).length === 0, 'convites institucionais passam');
ok(auditarUrlsDeMensagem({ texto: 'Link https://meli.la/1AbCdEf e https://s.shopee.com.br/AbC123' }, cfg).length === 0, 'links válidos no texto passam');
const bad1 = auditarUrlsDeMensagem({ texto: 'Compre: https://a.co/d/xyz1234' }, cfg);
ok(bad1.length === 1 && bad1[0].motivo === 'loja_sem_link_de_afiliado', 'a.co no texto barrado', bad1);
const bad2 = auditarUrlsDeMensagem({ texto: 'Oferta boa', botoes: ['https://www.mercadolivre.com.br/p/MLB12345678'] }, cfg);
ok(bad2.length === 1 && bad2[0].onde === 'botao', 'botão com URL ruim barrado', bad2);
ok(auditarUrlsDeMensagem({ texto: 'https://www.amazon.com.br/dp/B0X?tag=alheia-20' }, cfg).length === 1, 'tag de outra pessoa no texto barrada');
ok(auditarUrlsDeMensagem({ texto: 'veja https://exemplo.com/promo' }, cfg)[0]?.motivo === 'host_fora_da_lista', 'host desconhecido: padrão negado');
ok(auditarUrlsDeMensagem({ texto: 'x', botoes: ['javascript:alert(1)'] }, cfg)[0]?.motivo === 'url_invalida', 'botão não-http barrado');
ok(auditarUrlsDeMensagem({ texto: 'https://www.mercadolivre.com.br/p/MLB1.' }, cfg).length === 1, 'URL com ponto final também é conferida');
ok(extrairUrls('a https://x.com/a?b=1&amp;c=2, b').join() === 'https://x.com/a?b=1&c=2', 'extrai e desescapa &amp;');

(async () => {
  // sendTelegramGroupMessage: URL ruim NUNCA chega à rede
  let chamadas = 0;
  const fetchImpl = async () => { chamadas++; return { status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) }; };
  const r1 = await sendTelegramGroupMessage({ token: 't', chatId: '1', text: 'Oferta', button: { text: 'Comprar', url: 'https://www.mercadolivre.com.br/p/MLB12345678' }, fetchImpl });
  ok(!r1.ok && r1.blocked === true && r1.retryable === false && chamadas === 0, 'botão ruim: bloqueado sem tocar a rede', { r1, chamadas });
  const r2 = await sendTelegramGroupMessage({ token: 't', chatId: '1', text: 'Compre em https://a.co/d/xyz1234', fetchImpl });
  ok(!r2.ok && r2.blocked === true && chamadas === 0, 'texto com a.co: bloqueado', r2);
  const r3 = await sendTelegramGroupMessage({ token: 't', chatId: '1', text: 'Compre', plainText: 'Compre https://www.amazon.com.br/dp/B0X', fetchImpl });
  ok(!r3.ok && r3.blocked === true && chamadas === 0, 'texto simples (fallback) com Amazon sem tag: bloqueado', r3);
  const r4 = await sendTelegramGroupMessage({ token: 't', chatId: '1', text: `Oferta ${GO}`, button: { text: 'Comprar', url: GO }, fetchImpl });
  ok(r4.ok && !r4.blocked && chamadas === 1, 'mensagem boa segue', r4);

  // SQL: predicados incluem a configuração e não aceitam injeção
  ok(linkPublicavelSql('o', cfg).includes('affiliate_link_pending = false') && linkPublicavelSql('o', cfg).includes('manusmonteiro-20') && linkPublicavelSql('o; drop', cfg).startsWith('(od'), 'predicado SQL de visibilidade');
  ok(linkValidoEstritoSql('o.affiliate_url', 'n.slug', cfg).includes("'mercado-livre'") && linkValidoEstritoSql('o.affiliate_url', 'n.slug', cfg).includes('23952458'), 'predicado SQL estrito');

  // Config da migration 0063 = config do código (trigger e TS não podem divergir)
  const mig = fs.readFileSync('drizzle/migrations/0063_link_afiliado_obrigatorio.sql', 'utf8');
  ok(mig.includes(`('amazon_tag', '${cfg.amazonTag}')`) && mig.includes(`('ml_matt_tool', '${cfg.mlToolId}')`), 'migration 0063 usa a mesma config do código');
  ok(!/RAISE\s+EXCEPTION/i.test(mig), 'trigger nunca rejeita (a ingestão não quebra)');

  // GUARDAS ESTÁTICAS (mutação): cada camada continua ligada no código
  const le = (p: string) => fs.readFileSync(p, 'utf8');
  ok(/ehLinkAfiliadoValido/.test(le('src/app/go/[slug]/route.ts')) && /link-em-ativacao/.test(le('src/app/go/[slug]/route.ts')), 'L5: /go revalida o destino');
  ok(/auditarUrlsDeMensagem/.test(le('src/lib/messaging/telegram-send.ts')), 'L4: telegram-send audita texto e botão');
  ok(/porteiroDeEnvio/.test(le('src/server/messaging/group-queue.ts')), 'L4: group-queue chama o porteiro com banco');
  ok(/auditarUrlsDeMensagem/.test(le('src/server/notifications/send-telegram.ts')), 'L4: envio privado audita');
  ok(/auditarUrlsDeMensagem/.test(le('src/server/messaging/painel-impressoras.ts')), 'L4: painel privado audita');
  ok(/linkPublicavelFilter/.test(le('src/server/queries/affiliate.ts')) && /linkPublicavelFilter/.test(le('src/app/sitemap.ts')) && /linkPublicavelFilter/.test(le('src/server/messaging/group-offers.ts')), 'L3: site, sitemap e mensagens usam o predicado único');

  // Todo arquivo que ENVIA ao Telegram precisa do porteiro (ou estar na lista de exceções sem URL de produto)
  const SEM_URL_DE_PRODUTO = new Set(['src/server/stores-discover.ts', 'src/server/links/auditoria-links.ts', 'src/server/messaging/porteiro-links.ts']);
  const varre = (dir: string, out: string[] = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) varre(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p.split(path.sep).join('/'));
    }
    return out;
  };
  const arquivos = varre('src');
  for (const f of arquivos) {
    const t = le(f);
    if (/api\.telegram\.org\/bot/.test(t) && /sendMessage|sendPhoto/.test(t) && !SEM_URL_DE_PRODUTO.has(f)) ok(/auditarUrlsDeMensagem/.test(t), `emissor Telegram sem porteiro: ${f}`);
  }
  // Front: nenhum componente/página PÚBLICA com href externo de loja hardcoded (admin e coletores ficam fora)
  const LOJAS = /https?:\/\/[^"'`\s]*(amazon\.com|mercadolivre\.com|mercadolibre\.com|shopee\.com|magazineluiza\.com|magalu\.com|aliexpress\.com|kabum\.com|meli\.la|amzn\.to|a\.co\/)/i;
  for (const f of arquivos.filter((x) => /^src\/(app|components)\//.test(x) && !/^src\/(app|components)\/admin\//.test(x) && x.endsWith('.tsx'))) {
    const linhas = le(f).split('\n');
    linhas.forEach((l, i) => { if (/href\s*=/.test(l) && LOJAS.test(l)) ok(false, `href externo de loja hardcoded: ${f}:${i + 1}`); });
  }

  console.log(fails ? `\n${fails} FALHA(S)` : 'link-afiliado R-70: todos os casos passaram');
  process.exit(fails ? 1 : 0);
})();
