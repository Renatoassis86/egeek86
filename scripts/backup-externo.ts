export {};
/* Backup logico externo do banco (docs/backup-externo-2026-11-15.md, fila #71).
 * Somente LEITURA no banco. Padrao = dry-run (conta linhas, nao grava nada).
 * Uso:
 *   npx tsx --env-file=.env.local scripts/backup-externo.ts                      (dry-run, perfil essencial)
 *   npx tsx --env-file=.env.local scripts/backup-externo.ts --perfil=completo    (dry-run)
 *   BACKUP_PASSPHRASE=... npx tsx ... scripts/backup-externo.ts --executar [--saida=dir] [--perfil=essencial|completo] [--so=t1,t2]
 * Formato: <saida>/egeek86-<perfil>-<UTC>.ndjson.gz.enc  (+ .sha256 e .manifest.json sem dados)
 *   cripto: AES-256-GCM, chave = scrypt(BACKUP_PASSPHRASE, salt). Conteudo: gzip de NDJSON {"t":tabela,"r":linha}.
 * Nunca imprime DATABASE_URL nem a senha. */
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const MAGIC = Buffer.from('EG86BK1\n');
// Tabelas pesadas e reconstruiveis/derivadas: so no perfil completo (semanal).
const PESADAS = ['affiliate_price_snapshots', 'coupon_reads', 'collector_runs'];

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : undefined;
}

async function main() {
  const executar = process.argv.includes('--executar');
  const perfil = arg('perfil') ?? 'essencial';
  if (!['essencial', 'completo'].includes(perfil)) throw new Error('perfil invalido');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  const pass = process.env.BACKUP_PASSPHRASE;
  if (executar && (!pass || pass.length < 16)) throw new Error('BACKUP_PASSPHRASE ausente ou curta (min. 16)');
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 30 });
  try {
    const so = arg('so')?.split(',');
    let tabelas: { relname: string; n: string }[] = await sql`
      select c.relname, c.reltuples::bigint::text n from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind = 'r' order by c.relname`;
    tabelas = tabelas.filter((t) => (so ? so.includes(t.relname) : perfil === 'completo' || !PESADAS.includes(t.relname)));
    console.log(`modo=${executar ? 'EXECUTAR' : 'DRY-RUN'} perfil=${perfil} tabelas=${tabelas.length} linhas_estimadas=${tabelas.reduce((a, t) => a + Math.max(0, Number(t.n)), 0)}`);
    if (!executar) {
      for (const t of tabelas.slice(0, 15)) console.log(`  ${t.relname}: ~${t.n}`);
      console.log('Dry-run: nada gravado. Use --executar com BACKUP_PASSPHRASE.');
      return;
    }
    const dir = arg('saida') ?? path.join(process.cwd(), 'backup-externo-saida');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(dir, `egeek86-${perfil}-${stamp}.ndjson.gz.enc`);
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(pass as string, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const gz = zlib.createGzip({ level: 6 });
    const out = fs.createWriteStream(base);
    const hash = crypto.createHash('sha256');
    const escreve = (b: Buffer) => { hash.update(b); return out.write(b); };
    escreve(Buffer.concat([MAGIC, salt, iv]));
    gz.on('data', (c: Buffer) => escreve(cipher.update(c)));
    const fim = new Promise<void>((res, rej) => { out.on('finish', res); out.on('error', rej); gz.on('error', rej); });
    const contagem: Record<string, number> = {};
    // Snapshot consistente entre tabelas: transacao REPEATABLE READ somente leitura.
    await sql.begin('isolation level repeatable read read only', async (tx: any) => {
      await tx`set local statement_timeout = '1800s'`;
      for (const t of tabelas) {
        let n = 0;
        await tx.unsafe(`select * from "public"."${t.relname}"`).cursor(1000, async (rows: any[]) => {
          for (const r of rows) {
            const ok = gz.write(JSON.stringify({ t: t.relname, r }) + '\n');
            n++;
            if (!ok) await new Promise((res) => gz.once('drain', res));
          }
        });
        contagem[t.relname] = n;
      }
    });
    const gzFim = new Promise((res) => gz.once('end', res));
    gz.end();
    await gzFim;
    escreve(cipher.final());
    escreve(cipher.getAuthTag());
    out.end();
    await fim;
    const sha = hash.digest('hex');
    fs.writeFileSync(base + '.sha256', `${sha}  ${path.basename(base)}\n`);
    fs.writeFileSync(base + '.manifest.json', JSON.stringify({ geradoEm: new Date().toISOString(), perfil, tabelas: contagem, bytes: fs.statSync(base).size, sha256: sha }, null, 2));
    console.log(`OK ${path.basename(base)} bytes=${fs.statSync(base).size} tabelas=${Object.keys(contagem).length} linhas=${Object.values(contagem).reduce((a, b) => a + b, 0)} sha256=${sha.slice(0, 16)}...`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error('ERRO:', String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, '<url>')); process.exit(1); });
