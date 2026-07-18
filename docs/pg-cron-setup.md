# Agendamento via Supabase pg_cron + pg_net

Este projeto **não roda mais nada sozinho por padrão** — as rotas `/api/cron/collect-prices`
(coleta de preço) e `/api/cron/notify-price-drops` (alerta diário) só disparam quando algo
as chama. Este runbook liga isso de verdade, uma vez, direto no banco Supabase.

**Pré-requisito: só rodar depois de existir um deploy em produção real** (URL pública
estável). Rodar isso ainda em localhost não faz sentido — o `net.http_post` precisa
conseguir alcançar a URL de fora.

## Por que isso não está numa migration do Drizzle

O corpo do job carrega a URL de produção e o `CRON_SECRET` — informação de ambiente, não
de schema. Colocar isso numa migration versionada faria o `CRON_SECRET` (que é secreto)
ficar dentro do histórico de migrations do repositório, e faria qualquer replay de
migrations tentar reagendar o cron apontando pra URL errada num ambiente diferente (ex:
staging). Por isso isso é rodado manualmente, uma vez, no SQL Editor do Supabase.

## Passo 1 — confirmar as extensões

No SQL Editor do Supabase (Dashboard → SQL Editor), rode:

```sql
select extname, extversion from pg_extension where extname in ('pg_cron', 'pg_net');
```

Se não aparecer nada, habilite em Dashboard → Database → Extensions (procure `pg_cron` e
`pg_net`, clique em Enable em cada uma). A maioria dos projetos Supabase já vem com essas
duas habilitadas, mas **confirme, não assuma**.

## Passo 2 — agendar os jobs

Troque `<DOMINIO>` pela URL de produção real (ex: `espacogeek86.com.br`) e `<CRON_SECRET>`
pelo valor de `CRON_SECRET` do `.env` de produção. Rode no SQL Editor:

**Importante: `net.http_get`, não `net.http_post`** — as três rotas (`/api/cron/*`) só
implementam `GET`. Usar `http_post` retorna 405 (Method Not Allowed) — o job do cron
"roda" (aparece `succeeded` em `cron.job_run_details`), mas a chamada HTTP em si falha
silenciosamente (só aparece o 405 em `net._http_response`). Erro real já cometido uma vez
nesta configuração — confirme sempre em `net._http_response` depois de agendar, não só em
`cron.job_run_details`.

```sql
-- Coleta de preço: a cada 5 minutos. O WHERE dentro de collectPrices() já decide
-- por linha quem está devido (5min pra jogos acompanhados, 15min pro resto) —
-- um único job serve pros dois "níveis" de atualização.
select cron.schedule(
  'geek-deals-collect-prices',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://<DOMINIO>/api/cron/collect-prices',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 110000
  );
  $$
);

-- Alerta diário de queda de preço: 12:00 UTC = 09:00 horário de Brasília.
select cron.schedule(
  'geek-deals-notify-price-drops',
  '0 12 * * *',
  $$
  select net.http_get(
    url := 'https://<DOMINIO>/api/cron/notify-price-drops',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Descoberta de produto novo no catálogo do Mercado Livre: a cada 30min.
-- discoverNewProducts() processa só uma fatia da lista de termos por
-- execução (rotação por cursor em system_config, ver discover-products.ts)
-- — com 89 termos no total e 16 por execução (paralelizado, TERM_CONCURRENCY
-- em discover-products.ts), uma volta completa leva ~6 execuções (~3h).
select cron.schedule(
  'geek-deals-discover-products',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://<DOMINIO>/api/cron/discover-products',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 110000
  );
  $$
);
```

`net.http_post` é assíncrono (fire-and-forget) — o job do cron não fica esperando a
resposta HTTP. O resultado de cada chamada fica registrado em `net._http_response`, útil
pra debugar se algo não estiver disparando.

## Passo 3 — verificar que está rodando de verdade

```sql
-- Confirma que os dois jobs existem e estão ativos.
select jobid, jobname, schedule, active from cron.job;

-- Depois de alguns minutos, confirma execuções recentes.
select * from cron.job_run_details order by start_time desc limit 10;

-- Confirma que as chamadas HTTP de fato saíram e voltaram com status 200.
select * from net._http_response order by created desc limit 10;
```

Essa última checagem é a prova real de que o bug original ("o cron nunca rodou sozinho")
foi corrigido — antes disso, tudo só era testado via curl manual.

## Configurar o webhook do Telegram (passo separado, também manual)

Depois do deploy, registre o webhook do bot uma única vez (troque `<TOKEN>`,
`<DOMINIO>` e `<TELEGRAM_WEBHOOK_SECRET>` pelos valores reais):

```
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMINIO>/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## Como parar/remover um job (se precisar)

```sql
select cron.unschedule('geek-deals-collect-prices');
select cron.unschedule('geek-deals-notify-price-drops');
select cron.unschedule('geek-deals-discover-products');
```

## Descoberta automática de produto — lembrete

`geek-deals-discover-products` cadastra sozinho todo produto novo achado no
catálogo do Mercado Livre (jogos Switch/PS4/PS5/Xbox e consoles/hardware) e
`geek-deals-collect-prices` cadastra sozinho todo vendedor novo de um
produto já existente — **os dois já entram como `active` direto, publicados
na hora, sem esperar nenhum comando** (decisão explícita do usuário,
2026-07-17: vitrine sempre cheia importa mais que garantir link de afiliado
real em 100% dos itens desde o primeiro instante).

**Trade-off aceito conscientemente**: o link de afiliado que gera comissão
de verdade continua exigindo geração manual no painel do Mercado Livre por
produto (não existe fórmula pra aplicar em lote) — até alguém trocar,
o item fica no ar com um link honesto pra página pública do produto,
**sem rastreio de comissão nesse meio-tempo**. Trocar pelo link real
quando quiser: formulário "Atualizar link de afiliado" na página de
detalhe da oferta (`/admin/ofertas/[id]`), não precisa mudar o status
(já publica sozinho).

## Reforço futuro (não necessário pro v1)

`CRON_SECRET` fica em texto puro dentro de `cron.job` (visível via `select * from
cron.job` por qualquer um com acesso ao dashboard do projeto). Aceitável pra um projeto
pequeno com um único dono. Se isso passar a importar, o caminho correto é o Supabase
Vault (`select vault.create_secret(...)`, depois referenciar via
`vault.decrypted_secrets` dentro do corpo do job) em vez do valor cru.
