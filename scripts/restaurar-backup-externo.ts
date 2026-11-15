export {};
/* Restaura/verifica um arquivo gerado por backup-externo.ts. Padrao = dry-run (decifra, confere checksum e conta linhas por tabela).
 * Uso:
 *   BACKUP_PASSPHRASE=... npx tsx scripts/restaurar-backup-externo.ts <arquivo.enc>
 *   BACKUP_PASSPHRASE=... DATABASE_URL_DESTINO=... npx tsx scripts/restaurar-backup-externo.ts <arquivo.enc> --aplicar [--so=t1,t2]
 * --aplicar insere com ON CONFLICT DO NOTHING (nao sobrescreve linhas existentes) no banco de DESTINO. Nunca usa DATABASE_URL.
 * Destino deve ter o schema (drizzle/migrations) ja aplicado. Nunca imprime URL nem senha. */
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const readline = require('readline');
const postgres = require('postgres');

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) throw new Error('informe o arquivo .enc');
  const aplicar = process.argv.includes('--aplicar');
  const pass = process.env.BACKUP_PASSPHRASE;
  if (!pass) throw new Error('BACKUP_PASSPHRASE ausente');
  const so = process.argv.find((a) => a.startsWith('--so='))?.slice(5).split(',');
  const buf = fs.readFileSync(file); // cifrado e comprimido: dezenas de MB no perfil essencial
  const shaFile = file + '.sha256';
  if (fs.existsSync(shaFile)) {
    const esperado = fs.readFileSync(shaFile, 'utf8').split(/\s+/)[0];
    const real = crypto.createHash('sha256').update(buf).digest('hex');
    if (esperado !== real) throw new Error('checksum NAO confere: arquivo corrompido');
    console.log('checksum sha256 confere');
  }
  if (buf.subarray(0, 8).toString() !== 'EG86BK1\n') throw new Error('formato desconhecido');
  const salt = buf.subarray(8, 24), iv = buf.subarray(24, 36), tag = buf.subarray(buf.length - 16);
  const key = crypto.scryptSync(pass, salt, 32);
  const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  let plain: Buffer;
  try { plain = Buffer.concat([dec.update(buf.subarray(36, buf.length - 16)), dec.final()]); } catch { throw new Error('senha errada ou arquivo adulterado'); }
  const rl = readline.createInterface({ input: require('stream').Readable.from(zlib.gunzipSync(plain)) });
  let sql: any = null;
  if (aplicar) {
    const dest = process.env.DATABASE_URL_DESTINO;
    if (!dest) throw new Error('DATABASE_URL_DESTINO ausente');
    sql = postgres(dest, { max: 1, prepare: false });
  }
  const cont: Record<string, number> = {};
  const lote: Record<string, any[]> = {};
  const flush = async (t: string) => {
    if (!sql || !lote[t]?.length) return;
    await sql.unsafe(`insert into "public"."${t}" select * from json_populate_recordset(null::"public"."${t}", $1::json) on conflict do nothing`, [JSON.stringify(lote[t])]);
    lote[t] = [];
  };
  if (sql) { try { await sql`set session_replication_role = replica`; } catch { console.log('aviso: sem permissao para session_replication_role; FKs podem exigir ordem'); } }
  for await (const line of rl) {
    if (!line) continue;
    const { t, r } = JSON.parse(line);
    if (so && !so.includes(t)) continue;
    cont[t] = (cont[t] ?? 0) + 1;
    if (sql) { (lote[t] ??= []).push(r); if (lote[t].length >= 500) await flush(t); }
  }
  if (sql) { for (const t of Object.keys(lote)) await flush(t); await sql.end({ timeout: 5 }); }
  console.log(`${aplicar ? 'APLICADO' : 'DRY-RUN (verificado, nada gravado)'}: tabelas=${Object.keys(cont).length} linhas=${Object.values(cont).reduce((a, b) => a + b, 0)}`);
  for (const [t, n] of Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${t}: ${n}`);
}
main().catch((e) => { console.error('ERRO:', String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, '<url>')); process.exit(1); });
