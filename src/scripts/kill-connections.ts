import { sql } from 'drizzle-orm';
import { db } from '../lib/db';

async function run() {
  try {
    console.log('Listing active database connections...');
    const connections = await db.execute<{
      pid: number;
      usename: string;
      state: string;
      query: string;
      duration_seconds: number;
    }>(sql`
      SELECT 
        pid,
        usename,
        state,
        query,
        EXTRACT(epoch FROM (now() - query_start))::integer AS duration_seconds
      FROM pg_stat_activity
      WHERE state IS NOT NULL AND pid <> pg_backend_pid();
    `);

    console.log(`Found ${connections.length} other connections:`);
    let killedCount = 0;
    for (const r of connections) {
      console.log(`[PID: ${r.pid}] State: ${r.state}, User: ${r.usename}, Duration: ${r.duration_seconds}s`);
      console.log(`  Query: ${r.query ? r.query.substring(0, 120) : 'N/A'}`);
      
      if (r.duration_seconds > 60 || r.state === 'idle in transaction' || r.duration_seconds === null) {
        console.log(`  ---> Terminating backend PID ${r.pid}...`);
        await db.execute(sql`SELECT pg_terminate_backend(${r.pid});`);
        killedCount++;
      }
    }
    console.log(`Finished database cleanup. Killed ${killedCount} connections.`);
  } catch (error) {
    console.error('Error executing connection cleanup:', error);
  }
  process.exit(0);
}

run();
