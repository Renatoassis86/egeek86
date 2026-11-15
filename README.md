# Espaço Geek 86

Hub de inteligência de preços para o consumidor gamer e de tecnologia no Brasil. O sistema acompanha ofertas de redes de varejo, guarda o histórico de preço por oferta e por dia, mostra o menor preço registrado e a média única de cada produto, e avisa as quedas reais por Telegram. A receita é comissão de afiliado por clique rastreado.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · PostgreSQL (Supabase) · Drizzle ORM · Zod · Vercel (hospedagem e crons).

> **Atualizado em 2026-11-15** (auditoria geral do Conselho Geek, `docs/auditoria-2026-11-15/`). O README descrevia, desde julho, um "marketplace vertical de colecionáveis, TCG e hype drops". Esse não é o produto que existe. O retrato abaixo é o do código e do banco em 15/11/2026; o que não deu para confirmar está marcado NÃO VERIFICADO. Os guias históricos de julho (`docs/radiografia-plataforma.md`, `docs/plano-metricas-regras-negocio.md`, `docs/plano-data-science-e-analytics.md`) seguem como memória de época, não como retrato.

---

## O que o sistema é hoje

| Item | Estado em 2026-11-15 |
|---|---|
| Redes monitoradas | Mercado Livre (API oficial), Shopee (API de afiliados), Amazon (coleta assistida na aba logada do dono). Magalu: em estudo, pausada pelo dono (fila #61). AliExpress: retirado |
| Ofertas ativas (fora da quarentena) | ~31,3 mil: ML ~24,5 mil, Shopee ~4,1 mil, Amazon ~2,8 mil |
| Catálogo | masters (produto único) com regras de identidade; 6.443 aprovados com oferta ativa; só produto novo e em linha |
| Departamentos (7) | Games, Impressão 3D, Tecnologia, Livros, Eletrodomésticos, Eletroeletrônicos, Esporte (ADR 0008) |
| Indicadores | série de preço por oferta e por dia, menor preço registrado (toda mudança é um evento), média única por produto, selo com piso de 5 cotações e 14 dias (ADR 0004, 0010) |
| Canais | site `egeek86.com`; Telegram (canal t.me/egeek86, um grupo por loja, canal Destaques, bot); WhatsApp assistido (manual, 0 envios em 7 dias); contatos só em `/contatos` |
| Mensagens | cerca de 1.440 por dia, com preço reconferido ao vivo antes do envio, régua de destaque, cooldown por produto, cartões de imagem v2 |
| Receita | comissão de afiliado; comissão prevista só no `/admin`; comissão realizada: SEM DADO (`affiliate_conversions` com 0 linhas) |
| Audiência medida | 1 chat do Telegram com 5 membros |

### Fluxo do funil

```
descoberta -> coleta -> catálogo -> indicador -> site / mensagem -> clique -> comissão
```

1. **Descoberta:** crons por departamento e por rede (busca, semeadura por segmento, cobertura Shopee, vitrine e promoções da Amazon).
2. **Coleta de preço:** API oficial por cron (ML e Shopee) e **coleta assistida** na aba logada do próprio dono (Amazon, cupons, links meli.la), por laços de navegador em `public/loops/` com vigia. A coleta assistida é exceção autorizada pelo dono (ADR 0009); não há raspagem em massa, nem contorno de captcha, login ou limite de taxa.
3. **Catálogo:** porteiro e identidade decidem o que é produto válido (só novo e em linha; sem usado, retrô, peça ou item miúdo; console é só videogame; foto com mão real em oferta tira a oferta das médias). Aprovação em bloco só com backup, log e rollback.
4. **Indicador:** `price_daily_offer` e `price_daily_state` (cada oferta vale 1 por dia), eventos do menor preço, selo.
5. **Site e mensagem:** vitrines, páginas de produto e `/black-friday`; mensagens no Telegram com link rastreado `/go/<slug>?s=tg&m=<chave>` e link curto `/g/<código>`.
6. **Clique e comissão:** `/go` registra o clique e redireciona para o link de afiliado; a importação de conversões existe no código (`src/server/affiliate-reports/`) mas não está agendada. A comissão prevista (tabela versionada em `src/lib/admin-gestao/taxas-comissao.ts`) é métrica interna do admin e nunca aparece no site, nas mensagens ou em API pública.

### Regras que o dono já fixou (resumo; íntegra em `CLAUDE.md`, `AGENTS.md` e `docs/03-metodologia/FLUXO_MESTRE.md`)
Só produto novo e em linha; a única restrição de entrada é usado/retrô e barreira nova só com aval do dono; grupos só de produtos iguais; sem itens miúdos; console é só videogame; foto real, nunca imagem gerada por IA; frescor de 24 h para ML e Shopee clicáveis; sem teto de queda de 50%; vendedor fraco fica fora só da média; nenhum dado fake; pedido novo do dono vai para a lista sem parar o que está em andamento; nenhum loop pode parar.

### Onde ler mais
| Assunto | Documento |
|---|---|
| Retrato e estratégia | `docs/PROJECT_BLUEPRINT.md` |
| Lei de convivência dos processos | `docs/03-metodologia/FLUXO_MESTRE.md` |
| Fila viva de tarefas | `docs/fila-de-execucao.md` |
| Auditoria geral de 15/11 | `docs/auditoria-2026-11-15/00-sintese.md` |
| Conselho Geek e atas | `docs/03-metodologia/CONSELHO_GEEK.md`, `docs/conselho/atas/` |
| Decisões de arquitetura | `docs/08-decisoes-adr/` |
| Agentes | `agents/`, `docs/03-metodologia/ARQUITETURA_AGENTES.md` |

---

## Setup local

### 1. Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com) com projeto criado
- `npm`

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Valores em **Supabase Dashboard -> Settings**:

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings -> API -> Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings -> API -> `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings -> API -> `service_role` (secreta) |
| `DATABASE_URL` | Settings -> Database -> Connection string -> **Transaction** (porta 6543) |
| `DIRECT_URL` | Settings -> Database -> Connection string -> **Session** (porta 5432) |

> **NUNCA** comite `.env.local`. Nunca exponha a `service_role` em código de cliente. Segredos de integração (Shopee, tokens de ingest, bot) vivem na Vercel como "Sensitive" e não existem no `.env.local`; diagnósticos que dependem deles rodam por rota de cron, não por script local.

### 3. Instalar e rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000/api/health.

### 4. Banco

As migrações ficam em `drizzle/migrations/`. O ledger do Drizzle está incompleto (19 linhas para ~52 migrações, NÃO VERIFICADO se há drift além disso): migrações são aplicadas por scripts próprios, com backup. `npm run db:push` não é para produção.

---

## Estrutura (resumo)

```
src/
├── app/            # rotas (shop), (detalhe), admin, api (crons e ingest), go, g
├── components/     # UI
├── lib/            # lógica pura (preço, catálogo, mensagens, auth)
├── server/         # I/O: coleta, consultas, mensagens, cron
├── db/schema/      # Drizzle por domínio
└── proxy.ts        # barreira barata e sessão (a autorização real fica em requireAdmin)
scripts/            # manutenção (aplicar-*, test-*, medições); padrão: dry-run, backup, rollback
public/loops/       # laços das abas logadas (Amazon, ML, cupons)
agents/ docs/       # agentes, ADRs, fila, atas, auditorias
```

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build de produção |
| `npm run typecheck` | Valida TypeScript |
| `npm run test:*` | Testes de regra (32 de 89 têm entrada; `npm test` agregado: fila #91) |
| `npm run db:generate` | Gera migration SQL |
| `npm run db:studio` | Drizzle Studio |

## Próximos passos

Estão na fila viva (`docs/fila-de-execucao.md`, #69 em diante) e no plano da síntese de auditoria. Antes da Black Friday (27/11): repositório privado, alertas e sonda externa, backup fora da máquina, importação de conversões, audiência e frescor da Amazon.
