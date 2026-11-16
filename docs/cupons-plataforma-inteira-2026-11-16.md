# Cupons de plataforma inteira e de loja inteira (auditoria e plano, 2026-11-16)

Pedido do dono (2026-11-16): "não acredito que hoje não teve nenhum cupom das lojas que valesse para a plataforma toda, ou seja, para todos os itens. Vamos rever isso." Fila #122. Só leitura de código e banco; nada foi lido ao vivo nas abas.

Vocabulário (como o banco guarda): `coupon_items.scope_kind = 'loja_inteira'` com `scope = {}` vale para QUALQUER oferta da rede (é o "plataforma inteira": ex. Shopee "TODAS AS LOJAS R$15 OFF acima de R$149"). Cupom de UMA loja é `lista_itens` com `vendedores`; de um departamento, `categoria`; de um anúncio, `produto`. Não existe `scope_kind = 'plataforma'`: o normalizador recusa `loja_inteira` com qualquer referência (`escopo_loja_inteira_nao_aceita_referencia`).

## 1. O que existe hoje por rede (medido em 2026-11-16, últimas 36 a 48 h)

| Rede | Quem lê | Escopo produzido | Cupom de plataforma/loja inteira |
|---|---|---|---|
| Shopee | `public/loops/shopee-cupons.js` (v1.1.0, 30 min), só `/m/cupom-de-desconto` | `loja_inteira` (rótulo "TODAS AS LOJAS"), `categoria` (demais rótulos) | 2 vistos (10% até R$10 e R$15 acima de R$149), ambos hoje `vencido`; primeira leitura 15/11 18:54Z, última 21:52Z |
| ML | `ml-cupons-portal.js` (portal `/cupons/filter?all=true&page=N`, 90 min), `ml-cupons-item.js` (por anúncio + modal `/cupons/pdp`) | `lista_itens` (vendedor, "Em produtos de X") e `categoria` ("Em Maquininhas"); 4.419 `lista_itens`; antes desta correção QUALQUER cartão sem "Em ..." caía em `sem_escopo_lido` | 0. Nunca foi produzido `loja_inteira` no ML |
| Amazon | `amazon-promocoes.js` (47 páginas `/promotion/psp/<ID>`), `cupons-24h.js` (selo por ASIN) | só `produto` (ASIN já ofertado) | 0. "Só no app: X% off em <departamento>" vira cupom POR ASIN dos cards, nunca "departamento inteiro" nem "Amazon inteira" |
| Magalu | pausada | n/a | n/a |

Cupons da Shopee gravados (`coupon_items`, 12 linhas): 2 `loja_inteira` (vencidos), 6 `categoria` (4 `nao_verificado`, 2 `verificado` mas "Produtos selecionados" e cashback), todos com `valid_until = NULL`.

## 2. Lacunas encontradas (causa medida, não suposta)

| # | Lacuna | Evidência | Estado |
|---|---|---|---|
| L1 | **Shopee: nenhum cupom lido tem validade** (`validity_source = 'ausente'`, 12 de 12). A agulha, para fonte "lista/campanha", exige validade futura lida (`validade_nao_lida`): mesmo `verificado`, o cupom da Shopee NUNCA entra em mensagem | `coupon_items` Shopee: `valid_until` NULL em todas; `evaluateAgulha` linha "else if (source !== 'item') return miss('validade_nao_lida')" | **Aberta; decisão do dono (D1) ou leitura da validade (plano 4.2)** |
| L2 | **Expiração indevida por leitura incompleta**: leituras da Shopee com 1, 2, 5, 6, 7 e 9 cartões; a de 15/11 20:04Z trouxe 1 cupom com `leitura_completa:true` e fechou 8; a de 23:37Z trouxe 2 e fechou 4. A página é desenhada pela metade em aba em segundo plano ou cartões viram "Esgotado" e voltam. Cada fechamento zera a sequência de 30 min: o cupom volta a `nao_verificado` e leva 30 min de novo | `collector_runs` job `cupons-assistida` rede shopee: r/v = 1/8, 5/0, 7/2, 6/1, 2/4; `coupon_reads` com `ausente` e depois `visto` | **Corrigida** (guarda no servidor, seção 3) |
| L3 | ML: cartão do portal sem "Em produtos de X" caía em `categoria` ou `sem_escopo_lido`; nenhum cartão que DECLARA "Em todo o Mercado Livre" virava `loja_inteira` | `ml-cupons-portal.js`, `montarCupom` | **Corrigida** (só com declaração explícita; sem declaração nada é presumido) |
| L4 | ML: os cupons de plataforma de verdade (ex.: "CUPOMPRAHOME", "DESCONTAOMELI", "Cupom de 5% no carrinho") não estão no portal de cupons por loja; aparecem em banners/páginas de campanha e são de DIGITAR código ou ativar no carrinho. `coupon_items` do ML está parado desde 12/11 11:48 (4.622 linhas de uma varredura avulsa) | fila #82, #116 | **Depende de leitura nas abas** (plano 4.3 e 4.4) e de cadastro manual curado (`scripts/cadastrar-cupom-manual.ts`) |
| L5 | Amazon: sem página geral de cupons legível (`/cupons` redireciona para a vitrine de departamentos). Promoção "X% off em <departamento>" (cards só dos ASINs já ofertados) não é cupom de departamento nem de plataforma; Exclusivo Prime (25% na finalização) é tratado por outro caminho (#66) | `amazon-promocoes.js`, memória `promocao-prime-e-alvo` | Aberta; plano 4.5 só mede se existe algo novo |
| L6 | Shopee: o loop só lê `/m/cupom-de-desconto`. Cupons de PLATAFORMA também aparecem em outras páginas da Shopee (central de cupons "Meus Vouchers" da conta, página da Black Friday/11.11, "Novos Cupons Shopee", vouchers de frete grátis/cashback em campanhas) e cupons de LOJA INTEIRA (cupom da loja, seguir loja) ficam na página de cada loja | `paginas` do loop (padrão 1 caminho; aceita até 4) | **Parcial**: o loop já aceita `paginas` extras sem mudar código; falta saber as URLs reais (plano 4.2) |
| L7 | **Estado `nao_verificado`**: o cupom só vira `verificado` com 2 leituras separadas por 30 min SEM sumir entre elas e só serve em mensagem por 120 min após a última leitura. Com leituras de 30 min e página oscilando, o cupom raramente alcança as duas condições juntas | `decideState`, `isUsableForMessage` | Atenuada por L2; o ciclo de 30 min com piso de 15 deixa a janela de 120 min viável |
| L8 | **Entrega ao cliente**: cupom de loja/categoria/plataforma só aparece como BLOCO dentro de mensagem de preço (`lookupVerifiedCoupon`). O gatilho CUPOM (mensagem própria) só nasce de cupom do ANÚNCIO. Não existe mensagem "cupom geral da plataforma" (a proposta `GROUP_CUPONS_GERAIS` da decisão 12 não foi implementada) e o site não lê `coupon_items` de plataforma para preço final | `docs/03-metodologia/CUPOM_NA_AGULHA.md` ("Limite conhecido"); nenhum leitor de `coupon_items` em `src/app` | **Aberta; depende de aval do dono (D2)** |
| L9 | Nome do cupom de plataforma na mensagem: o bloco usava o rótulo montado ("R$ 15 OFF") e ignorava o nome lido ("Cupom de R$ 15 no carrinho") e não dizia que vale para todos os itens | `label()` em `coupon-lookup.ts` | **Corrigida** |
| L10 | Compra mínima: o cupom de plataforma só entra na oferta cujo preço alcança o mínimo (ex.: R$149). Item de R$80 não recebe "R$15 OFF acima de R$149" (correto: isso é por carrinho) | `meetsMinimum`, agulha (c) | Regra mantida; apenas registrada |

## 3. O que foi corrigido em código (esta rodada)

1. **Guarda de fechamento por ausência** (`decideAbsenceClose` em `src/server/coupons/vigencia.ts`, usada em `ingestCouponBatch`): numa releitura `leitura_completa:true`, se fecharia 4 ou mais cupons E a leitura traz MENOS cupons do que os que seriam fechados E eles são 60% ou mais dos ativos da fonte, NÃO fecha (resposta traz `fechamento_recusado`). Menos de 4 cupons fecham como antes. Segurança: o cupom só serve em mensagem com `verified_at` dentro de 120 min; sem releitura sadia ele deixa de servir sozinho, então não sobra cupom morto divulgado. Amazon não é afetada (usa `leitura_completa:false`). Teste: casos medidos (1 lido x 8 a fechar NÃO fecha).
2. **ML, plataforma inteira** (`public/loops/ml-cupons-portal.js`, `PURO.ehEscopoPlataforma`): cartão que DECLARA "Em todo o Mercado Livre", "Em todo o site", "Em todos os produtos do Mercado Livre", "Em todas as categorias" vira `loja_inteira`; "Em produtos de X" continua `lista_itens`; sem declaração, nada é presumido. O servidor aceita o lote (testado).
3. **Mensagem** (`src/server/messaging/coupon-lookup.ts`, `StoredCoupon.nome` lido de `conditions->>'nome'`): cupom `loja_inteira` usa o nome lido (ex.: "Cupom de R$ 15 no carrinho") e acrescenta "Vale para todos os itens da Shopee/do Mercado Livre". Sem nome lido, mantém o rótulo antigo (nunca inventa).
4. Loop da Shopee v1.1.0 passa a repassar `fechamento_recusado` em `status().linhas` (sem trocar de versão; reinjetar só se quiser ver o campo).

Testes: `scripts/test-raspagem-cupons.ts` 57/57; `test-cupons` 113/113; `test-cupom-agulha` 111/111; `test-cupom-nome` 33/33; `test-gatilho-cupom` 94/94; `tsc --noEmit` limpo.

## 4. Plano de leitura nas abas (quem opera: o agente de abas, Chrome do dono)

Regras: só leitura, sem token, sem enviar, sem clicar em "Eu quero", "Usar", "Resgatar", "Aplicar". Cada trecho abaixo é colado inteiro no `javascript_tool` da aba indicada e devolve JSON. Devolver o JSON ao agente de cupons para decidir a mudança de código; não gravar nada. Respeitar captcha (se aparecer, parar; nunca contornar).

Ordem de prioridade: 4.1 (Shopee, valida a causa de L1/L2), 4.2 (validade), 4.3 (ML portal, valida L3), 4.4 (ML campanhas), 4.5 (Amazon).

### 4.1 Shopee: página "Pegue mais cupons" (aba em `https://shopee.com.br/m/cupom-de-desconto`, janela visível, não minimizada)

Objetivo: contar cartões disponíveis, esgotados e a taxa de desenho (rAF); mostrar o texto bruto de cada cartão (rótulo, título, condição, tags, validade se a tela mostrar).

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const BTN = /^(eu quero|esgotado|usar|usar depois|resgatar|resgatado|coletar|coletado)$/i;
  let n = 0, vivo = true; const q = () => { if (!vivo) return; n++; requestAnimationFrame(q); }; requestAnimationFrame(q); await sleep(1000); vivo = false;
  const ehBtn = (e) => e.children.length === 0 && BTN.test((e.textContent || '').trim());
  const ler = () => [].filter.call(document.querySelectorAll('button,div,span,a'), ehBtn).map((l) => {
    let c = l;
    while (c.parentElement) { const p = c.parentElement; if ([].filter.call(p.querySelectorAll('button,div,span,a'), ehBtn).length > 1) break; c = p; }
    return (c.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  });
  let ant = -1, est = 0, cart = [];
  for (let i = 0; i < 40; i++) { cart = ler(); window.scrollBy(0, 1200); await sleep(n < 20 ? 3000 : 1500); est = cart.length === ant ? est + 1 : 0; ant = cart.length; if (cart.length && est >= 3) break; }
  window.scrollTo(0, 0);
  const esg = cart.filter((l) => l.some((t) => /^esgotado$/i.test(t))).length;
  return JSON.stringify({ url: location.href, visibilidade: document.visibilityState, raf_hz: n, cartoes: cart.length, esgotados: esg, disponiveis: cart.length - esg, texto_valido_em_algum_cartao: cart.some((l) => l.some((t) => /v[aá]lido|termina|expira|at[eé]\s+\d/i.test(t))), cartoes_texto: cart.map((l) => l.join(' | ')).slice(0, 60) });
})()
```

Interpretar: `cartoes` muito abaixo do que se vê na tela = desenho parcial (aba estrangulada, `raf_hz` < 20). `texto_valido_em_algum_cartao:false` confirma L1 (a tela não traz validade).

### 4.2 Shopee: validade do voucher e outras páginas de voucher (L1, L6)

(a) Validade na janela "Condições" (somente ABRE o detalhe informativo do cartão; não clica em "Eu quero"). Rodar na mesma aba de 4.1, UMA vez, e só se o dono aceitar abrir o detalhe (ver D3):

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const alvos = [...document.querySelectorAll('button,div,span,a')].filter((e) => e.children.length === 0 && /^condi[cç][oõ]es$/i.test((e.textContent || '').trim())).slice(0, 3);
  const out = [];
  for (const a of alvos) {
    a.click(); await sleep(1800);
    const modal = document.querySelector('[role="dialog"],[class*="modal"],[class*="popup"],[class*="drawer"]');
    out.push({ texto: (modal ? modal.innerText : document.body.innerText.slice(-1500)).replace(/\s+/g, ' ').slice(0, 900) });
    const fechar = document.querySelector('[role="dialog"] [aria-label*="echar" i],[class*="close"],button[aria-label*="lose" i]'); if (fechar) fechar.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(900);
  }
  return JSON.stringify({ clicados: alvos.length, detalhes: out });
})()
```

Procurar nos textos por "Válido até", "Validade", "Período". Se existir, a extração entra no loop (campo `validade`); se não, só a decisão D1 resolve.

(b) Outras páginas de voucher da Shopee (descoberta; não envia nada). Rodar numa aba em `https://shopee.com.br/`:

```js
(async () => {
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ t: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80), h: a.getAttribute('href') })).filter((x) => /cupom|voucher|vale|frete gr|black|11\.11|campanha|cashback/i.test(x.t + ' ' + x.h));
  const un = {}; links.forEach((x) => { un[x.h] = x.t; });
  const alvos = ['/m/cupom-de-desconto', '/user/voucher-wallet', '/m/voucher-central', '/m/novos-cupons'];
  const sondas = [];
  for (const p of alvos) { try { const r = await fetch(p, { credentials: 'include', redirect: 'follow' }); sondas.push({ p, status: r.status, final: r.url.replace(location.origin, ''), tamanho: (await r.text()).length }); } catch (e) { sondas.push({ p, erro: String(e).slice(0, 80) }); } await new Promise((r) => setTimeout(r, 2500)); }
  return JSON.stringify({ candidatos: Object.entries(un).slice(0, 40), sondas });
})()
```

(c) Cupom de LOJA inteira (página de uma loja de interesse, ex. uma loja oficial; aba em `https://shopee.com.br/<loja>`): lê só o texto de cupons e do botão de seguir (nunca clica):

```js
(() => { const t = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean); const i = t.findIndex((s) => /cupons?( da loja)?|vouchers?/i.test(s)); return JSON.stringify({ url: location.href, titulo: document.title, amostra: t.slice(Math.max(0, i - 2), i + 30), linhas_com_off: t.filter((s) => /(R\$\s*\d|\d+\s*%)\s*OFF|desconto|frete gr[aá]tis|M[ií]n\.?\s*(Gasto)?/i.test(s)).slice(0, 25) }); })()
```

### 4.3 Mercado Livre: portal de cupons (L3), aba em `https://www.mercadolivre.com.br`, SEM captcha na tela

Objetivo: ver QUAIS textos de escopo existem nos cartões ("Em produtos de X", "Em <categoria>", "Em todo o ..."), para ajustar `ehEscopoPlataforma` com o texto real. 3 páginas, 6 s entre elas, leitura pura de GET de mesma origem.

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { paginas: [], escopos: {}, titulos_sem_em: [], captcha: false };
  for (const p of [1, 2, 3]) {
    const r = await fetch('/cupons/filter?all=true&page=' + p, { credentials: 'include' });
    const fim = r.url; const txt = await r.text();
    if (/captcha|account-verification|\/security/i.test(fim) || /n[aã]o sou um rob/i.test(txt.slice(0, 3000))) { out.captcha = true; break; }
    const subs = [...txt.matchAll(/"subtitle"\s*:\s*"((?:[^"\\]|\\.){1,120})"/g)].map((m) => m[1]);
    subs.forEach((s) => { const k = /^Em produtos d[eao]s?\s/i.test(s) ? 'Em produtos de <loja>' : s; out.escopos[k] = (out.escopos[k] || 0) + 1; });
    const ids = [...txt.matchAll(/"campaignId"\s*:\s*"?(\d+)"?/g)].length;
    out.paginas.push({ p, status: r.status, final: fim.replace(location.origin, ''), campanhas: ids, subtitulos: subs.length, tamanho: txt.length });
    await sleep(6000);
  }
  return JSON.stringify(out);
})()
```

Interpretar: qualquer chave de `escopos` diferente de "Em produtos de <loja>" e de categorias comuns que comece com "Em todo/todos/todas" confirma o formato de plataforma inteira; trazer as chaves exatas.

### 4.4 Mercado Livre: cupons de plataforma fora do portal (L4), códigos digitáveis

Rodar em duas abas/URLs, uma de cada vez: `https://www.mercadolivre.com.br/` (home) e `https://www.mercadolivre.com.br/ofertas`. Procura textos de cupom e códigos em maiúsculas (ex. CUPOMPRAHOME). Só lê o texto visível.

```js
(() => {
  const t = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
  const cup = t.map((s, i) => ({ i, s })).filter((x) => /cupom|cupons|c[oó]digo|voucher|off no carrinho|meli\+|mercado pago/i.test(x.s)).slice(0, 40);
  const codigos = [...new Set((document.body.innerText.match(/\b[A-Z][A-Z0-9]{5,19}\b/g) || []).filter((c) => /CUPOM|DESC|OFF|MELI|BLACK|FRETE|PRIME/.test(c)))].slice(0, 30);
  const links = [...document.querySelectorAll('a[href]')].filter((a) => /cupo|coupon|campanha/i.test(a.getAttribute('href') + ' ' + (a.innerText || ''))).map((a) => ({ t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70), h: a.getAttribute('href').slice(0, 120) })).slice(0, 25);
  return JSON.stringify({ url: location.href, linhas: cup, codigos_candidatos: codigos, links });
})()
```

Resultado esperado: o texto exato do banner (nome do cupom, "digite o código", valor, mínimo, validade) para o dono confirmar e o agente de cupons cadastrar o código curado com `scripts/cadastrar-cupom-manual.ts` (dry-run primeiro; sem código visto em tela, nunca cadastrar).

### 4.5 Amazon: existe cupom de plataforma ou de loja? (L5), aba em `https://www.amazon.com.br`

Leitura de 4 páginas de mesma origem, 4 s entre elas, só contando o que existe:

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const alvos = ['/cupons', '/gp/coupons', '/blackfriday', '/amazonprime'];
  const out = [];
  for (const p of alvos) {
    try {
      const r = await fetch(p, { credentials: 'include', redirect: 'follow' }); const txt = await r.text();
      const doc = new DOMParser().parseFromString(txt, 'text/html');
      const linhas = (doc.body ? doc.body.innerText : '').split('\n').map((s) => s.trim()).filter(Boolean);
      out.push({ p, status: r.status, final: r.url.replace(location.origin, ''), titulo: doc.title.slice(0, 80), psp: [...txt.matchAll(/\/promotion\/psp\/([A-Z0-9]+)/g)].length, cupom_cards: [...txt.matchAll(/couponBadge|couponText|Aplicar cupom|Economize\s+\d+%\s+com\s+cupom/gi)].length, linhas_cupom: linhas.filter((s) => /cupom|cupons|% off|economize/i.test(s)).slice(0, 15) });
    } catch (e) { out.push({ p, erro: String(e).slice(0, 80) }); }
    await sleep(4000);
  }
  return JSON.stringify(out);
})()
```

Interpretar: `cupom_cards` > 0 em página geral (não de produto) indica lista legível de cupons de página; `psp` conta promoções (já cobertas pelo laço). Promoção "Só no app" e "Exclusivo Prime" ficam como estão (regras do dono).

## 5. O que depende do dono

| # | Decisão | Opção sugerida |
|---|---|---|
| D1 | Cupom da Shopee/ML de plataforma que NÃO traz validade na tela (L1): aceitar na agulha, só para `loja_inteira`, com leitura fresca (120 min) e sem afirmar validade na mensagem ("confira o prazo no app")? Hoje a regra "lista sem validade nunca entra" o barra por inteiro | Aceitar só se 4.2(a) não achar validade; implementar com flag desligada por padrão |
| D2 | Mensagem própria "cupom geral da plataforma" (proposta `GROUP_CUPONS_GERAIS` da decisão 12: uma por plataforma por dia, cupom `todos`, ativar, verificado, não esgotado, nome lido) e linha no site | Aprovar; hoje o cupom de plataforma só aparece como bloco dentro de mensagem de preço |
| D3 | Abrir o "Condições" dos cartões da Shopee (apenas detalhe informativo, sem resgatar) para ler a validade (4.2a) | Aprovar uma leitura única de teste |
| D4 | Códigos de plataforma do ML (ex. CUPOMPRAHOME): cadastro curado pelo dono com código visto em tela e prazo | Cadastrar via script quando 4.4 achar o texto |

## 6. Operação

- Reinjetar `ml-cupons-portal.js` (agora com `loja_inteira`) após o deploy; antes, simulação (`enviar:false`) e conferir `simulacao()` por cartões com escopo `loja_inteira`.
- O loop da Shopee (v1.1.0) não precisa ser reinjetado: a proteção está no servidor.
- Medir depois do deploy (somente SELECT): cupons `loja_inteira` por rede e estado; `collector_runs` `cupons-assistida` com `fechamento_recusado` em `meta`; mensagens com "Vale para todos os itens".
