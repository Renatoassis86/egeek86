# Loop da coleta assistida da Amazon (aba logada)

Código: `scripts/chrome/amazon-assistida.js` (cópia idêntica servida em `public/loops/amazon-assistida.js` -> `https://www.egeek86.com/loops/amazon-assistida.js`). Substitui o loop antigo `window.__AMZ4`, que existia só na aba. Servidor (contrato): `src/app/api/ingest/amazon-assistida/route.ts`, `src/server/collector/amazon-assisted.ts`, `src/lib/affiliate/amazon-identity.ts`. Testes: `npx tsx scripts/test-amazon-assistida.ts`.

## Injetar (aba logada em https://www.amazon.com.br)
O token (`AMAZON_INGEST_TOKEN`) vem de fora, fica só na closure e nunca no arquivo nem em localStorage. O arquivo apaga `window.__AMZA_CFG` ao ler.

```js
window.__AMZA_CFG = { api: 'https://www.egeek86.com', token: '<AMAZON_INGEST_TOKEN>', enviar: false, lote: 10 };
fetch('https://www.egeek86.com/loops/amazon-assistida.js').then(r => r.text()).then(eval);
```
Opcionais: `modos` (`['refresh','discover']` por padrão; também `'queue'`), `vertical`, `pausaMs` (`[4000,9000]`), `cicloMin` (120), `idleMin` (10).

Primeiro SEMPRE com `enviar: false` (simulação: busca e lê de verdade, valida o payload e não faz POST). Só depois de conferir `status().ultimaAmostra`, reinjetar com `enviar: true`. Reinjetar substitui o loop vivo. Se o `__AMZ4` antigo ainda roda na aba, `status().legadoAMZ4` fica `true`: parar o antigo antes (dois loops duplicam a carga).

## O que o vigia confere
`JSON.stringify(window.__amza.status())` (nunca contém o token):
- `running`, `stopped`, `enviar`, `relogio` (`worker` ou `setTimeout`), `versao`.
- Mesmos nomes do loop antigo: `cycle`, `cycleStart`, `done`, `total`, `posted`, `errs`, `redeRetry`, `lastOk`. Extras: `modo`, `buscas`, `semResultados`, `paginasLidas`, `descartes`, `enviosFalhos`, `excecoes`, `stats` (último retorno do servidor), `pausa` (`{ate, motivo, min, seguidos}` quando em recuo), `proximoCicloEm`, `erros`, `linhas`, `ultimaAmostra`.
- Saudável: `running: true`, `lastOk` recente (ou `pausa` com `ate` no futuro e motivo conhecido), `posted` crescendo. Parado só por `window.__amza.stop()` do operador.
- No servidor: cada POST grava `collector_runs` (job `amazon-assistida`); o sinal de "laço parado" é > 90 min sem lote. Não há batimento próprio (a rota `cupons-heartbeat` é do loop de cupom e misturaria o vigia).

## Como funciona
1. Início do ciclo: foto das filas `GET /api/ingest/amazon-assistida?mode=refresh` e `mode=discover` (páginas de 200; a fila se reordena a cada gravação, por isso a foto).
2. Para cada item `{id, q}`: `fetch('/s?k=<q>', {credentials:'include'})`, parser puro, linha `{id, q, r:[{a,t,p,l,s,i}]}`. Patrocinado vai com `s:1, p:null`; orgânico sem preço é omitido; busca com "nenhum resultado" vai com `r:[]`; HTML irreconhecível NÃO vai (evita marcar `sem_match` por engano).
3. Lotes de `lote` linhas (máx. 40) em `POST` com `round: "amza-c<ciclo>-<modo>"`. O horário é carimbado pelo servidor.
4. `stats.paginas_pendentes` `[{id,a}]`: abre `/dp/ASIN`, lê o preço do bloco de preço do produto e reenvia `{a,t,p,l,s:1,pg:1,i}` (uma volta só).
5. Pausa aleatória de 4 a 9 s entre buscas (campo opcional `cadencia_s` na fila, se um dia existir, sobe o piso).

## Regra "nenhum loop para"
Rede, 5xx, 429/403/503 da Amazon, captcha, login, token (401), origem (403), servidor desligado (503) e layout irreconhecível viram pausa com recuo (teto 30 min; respeita `Retry-After`) e retomam sozinhos, repetindo o mesmo item. Exceção no ciclo é registrada e o loop segue (reinicia em 60 s). Só `stop()` do operador encerra.
