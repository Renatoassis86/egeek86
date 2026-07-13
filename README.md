# Espaço Geek 86

Marketplace vertical de produtos geek, cultura pop, colecionáveis, TCG e hype drops.

**Stack:** Next.js 15 · TypeScript · TailwindCSS 4 · PostgreSQL (Supabase) · Drizzle ORM · Zod.

---

## Setup local

### 1. Pré-requisitos

- Node.js 20+
- Conta no [Supabase](https://supabase.com) com projeto criado
- `npm` (ou ajuste comandos para pnpm/yarn)

### 2. Variáveis de ambiente

Copie o exemplo e preencha:

```bash
cp .env.example .env.local
```

Pegue os valores em **Supabase Dashboard → Settings**:

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` (⚠️ secreta) |
| `DATABASE_URL` | Settings → Database → Connection string → **Transaction** (porta 6543) |
| `DIRECT_URL` | Settings → Database → Connection string → **Session** (porta 5432) |

Substitua `[YOUR-PASSWORD]` nas connection strings pela senha do banco (definida na criação do projeto, ou resetável em Database → Reset password).

> ⚠️ **NUNCA** comite `.env.local`. Nunca exponha a `service_role` em código client-side.

### 3. Instalar dependências

```bash
npm install
```

### 4. Validar conexão

```bash
npm run dev
```

Abra http://localhost:3000/api/health — deve retornar `{ "status": "healthy", ... }`.

### 5. Migrations do banco (Drizzle)

A primeira migration (`drizzle/migrations/0000_initial.sql` + `0001_extras.sql`) já está commitada com:
- 24 ENUMs + 38 tabelas (identity, seller, catalog, inventory, pricing, commerce, payment, hype, loyalty, engagement, search, notification, analytics, audit, ops)
- Extensões `pgcrypto`, `citext`, `pg_trgm`, `unaccent`
- FK `profiles.id → auth.users.id` (Supabase)
- Trigger universal `updated_at`
- Generated columns: `stocks.available`, `products.search_tsv` (FTS portuguese)
- CHECKs de invariantes (estoque ≥ 0, valores > 0, ratings 1-5, etc)

```bash
npm run db:migrate    # aplica migrations no banco
npm run db:studio     # UI do Drizzle Studio
npm run db:generate   # gera nova migration ao alterar src/db/schema/*
npm run db:push       # (dev only) sincroniza schema sem migration formal — NÃO USE em prod
```

**Próximos passos pós-migration:**
- RLS policies (criar `0002_rls.sql`)
- Triggers de cache (rating médio, geek_points, popularity_score)
- Seed inicial (`categories`, `franchises`, `brands`, `levels`, `badges`, `point_rules`)

---

## Estrutura

```
src/
├── app/                    # Next.js App Router
│   ├── api/health/         # health check (Supabase + Postgres)
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts       # browser client (anon)
│   │   ├── server.ts       # server client (anon + cookies)
│   │   ├── admin.ts        # service_role (bypassa RLS — só server)
│   │   └── middleware.ts   # refresh de sessão
│   └── db/
│       └── index.ts        # Drizzle client (Postgres)
├── db/
│   └── schema/             # Drizzle schemas por domínio
│       ├── index.ts        # barrel
│       └── profiles.ts     # exemplo (identity domain)
├── features/               # (futuro) feature-sliced (catalog, cart, order...)
├── server/                 # (futuro) Server Actions + queries
├── components/             # (futuro) UI + shadcn
└── middleware.ts           # Supabase session refresh
```

---

## Próximos passos

- [ ] Habilitar extensões Postgres: `pgcrypto`, `pg_trgm`, `unaccent`, `citext`
- [ ] Adicionar schemas Drizzle restantes (seller, catalog, inventory, commerce, payment, hype, loyalty, engagement)
- [ ] Primeira migration completa
- [ ] RLS policies por tabela
- [ ] Design system base (shadcn/ui)
- [ ] Auth flow (login / cadastro / magic link)
- [ ] Integração Mercado Pago
- [ ] Integração Melhor Envio

---

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Build produção |
| `npm run typecheck` | Valida TypeScript |
| `npm run db:generate` | Gera migration SQL |
| `npm run db:migrate` | Aplica migrations |
| `npm run db:studio` | UI do Drizzle Studio |
