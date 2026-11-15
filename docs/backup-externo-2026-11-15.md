# Backup externo do banco (fila #71, checklist item 14), 2026-11-15

Decisão do dono: "Pode fazer". Sem criar conta, sem comprar add-on, sem digitar segredo.

## Escolha

**(a)+(b) combinadas: export lógico cifrado das tabelas de `public`, agendado no GitHub Actions, guardado como artifact privado do workflow (retenção 30 dias).** O `pg_dump` não existe nesta máquina e o `postgres.js` já é dependência, então o export é feito em Node (`scripts/backup-externo.ts`), em uma transação `REPEATABLE READ` somente leitura (retrato consistente entre tabelas).

Por quê: custo zero, nenhuma conta nova (o GitHub já hospeda o repositório), fora do PC, sem PC ligado. (c) PITR não foi ativado: é pago.

- Perfil `essencial` (diário, 03:17 BRT): todas as tabelas de `public` menos as três pesadas e derivadas (`affiliate_price_snapshots` ~667 MB, `coupon_reads`, `collector_runs`). Medido: 3 tabelas de teste (43 mil linhas) = 5 MB cifrados.
- Perfil `completo` (domingo): inclui as três pesadas. Pode levar muito tempo e carga no banco (3,4 mi de linhas de snapshots); `price_daily_offer` já guarda o histórico consolidado.
- Cifra: AES-256-GCM, chave `scrypt(BACKUP_PASSPHRASE)`; arquivo `.enc` + `.sha256` + manifesto (só contagens). Conteúdo inclui `profiles` (dados pessoais), por isso a cifra é obrigatória: **o repositório hoje é público e artifacts de repositório público são baixáveis por quem tem conta GitHub e acha o run; só a cifra protege.** Quando o repositório virar privado (decisão 1), o artifact também fica privado.

## RPO / RTO

- RPO: até 24 h (essencial); tabelas pesadas até 7 dias. Quem precisar de RPO de minutos precisa de PITR.
- RTO: algumas horas (baixar artifact, decifrar, aplicar em banco novo com o schema das migrações). Não medido ponta a ponta.

## O que o dono precisa fazer (2 passos, ~3 minutos)

1. GitHub > repositório > Settings > Secrets and variables > Actions > New repository secret: `DATABASE_URL` (a mesma URL do `.env.local`, de preferência a de conexão direta ou do pooler em modo sessão).
2. Mesmo lugar: secret `BACKUP_PASSPHRASE` com uma frase longa e aleatória (mín. 16 caracteres; gerador de senhas). **Guardar essa frase também fora do computador (gerenciador de senhas): sem ela o backup não abre.**

Depois: Actions > backup-externo > Run workflow (perfil essencial) para o primeiro backup. Sem os secrets o workflow só emite um aviso e não falha.

## PITR (opcional, pago, não feito)

Supabase > Project Settings > Add-ons > Point in Time Recovery (a partir de ~US$ 100/mês no plano Pro, valor a conferir no painel; exige o plano Pro e, conforme o tamanho do computador, compute acima do Micro). Os backups diários do próprio Supabase existem nos planos pagos, mas ficam na conta do Supabase: não substituem cópia fora dela. Não confirmei o plano do projeto (sem acesso ao painel).

## Restauração

1. Baixar o artifact (Actions > run > Artifacts) e descompactar.
2. Verificar sem gravar: `BACKUP_PASSPHRASE=... npx tsx scripts/restaurar-backup-externo.ts egeek86-essencial-<data>.ndjson.gz.enc` (confere checksum, decifra, conta linhas por tabela).
3. Criar banco novo, aplicar `drizzle/migrations`, e então: `BACKUP_PASSPHRASE=... DATABASE_URL_DESTINO=... npx tsx scripts/restaurar-backup-externo.ts <arquivo> --aplicar [--so=tabela1,tabela2]`. Insere com `ON CONFLICT DO NOTHING` (não sobrescreve) e tenta `session_replication_role=replica` para ignorar a ordem das chaves estrangeiras.

## Verificado e não verificado

- Verificado em 2026-11-15 contra o banco real (somente leitura): dry-run; dump cifrado de 3 tabelas (43.145 linhas); decifragem, checksum e contagem batendo; senha errada rejeitada.
- **Não verificado:** execução do workflow no GitHub (precisa dos secrets); perfil completo (carga no banco); `--aplicar` (restauração real em banco de destino); tempo do perfil essencial inteiro; plano e custo exato do PITR.
- Nota: `backup/dados` (884 MB, mesmo PC) continua só local; este backup cobre o banco, não esse export.
