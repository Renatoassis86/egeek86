import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

async function run() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env.local not found');
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
    if (!dbUrlMatch) {
      throw new Error('DATABASE_URL not found in .env.local');
    }
    const connectionString = dbUrlMatch[1];
    console.log('Connecting to database...');
    
    // Connect directly
    const sql = postgres(connectionString, { max: 1 });
    
    console.log('Listing active database connections...');
    const connections = await sql`
      SELECT 
        pid,
        usename,
        state,
        query,
        EXTRACT(epoch FROM (now() - query_start))::integer AS duration_seconds
      FROM pg_stat_activity
      WHERE state IS NOT NULL AND pid <> pg_backend_pid();
    `;

    console.log(`Found ${connections.length} other connections:`);
    let killedCount = 0;
    for (const r of connections) {
      console.log(`[PID: ${r.pid}] State: ${r.state}, User: ${r.usename}, Duration: ${r.duration_seconds}s`);
      console.log(`  Query: ${r.query ? r.query.substring(0, 120) : 'N/A'}`);
      
      if (r.duration_seconds > 45 || r.state === 'idle in transaction' || r.duration_seconds === null) {
        console.log(`  ---> Terminating backend PID ${r.pid}...`);
        try {
          await sql`SELECT pg_terminate_backend(${r.pid});`;
          killedCount++;
        } catch (err) {
          console.error(`  Failed to kill PID ${r.pid}:`, err);
        }
      }
    }
    console.log(`Finished database cleanup. Killed ${killedCount} connections.`);
    await sql.end();
  } catch (error) {
    console.error('Error executing connection cleanup:', error);
  }
  process.exit(0);
}

run();
