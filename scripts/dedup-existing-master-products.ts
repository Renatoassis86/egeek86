import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

function loadDatabaseUrl(): string {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('DATABASE_URL=')) {
          return line.trim().substring('DATABASE_URL='.length).replace(/["']/g, '').trim();
        }
      }
    }
  } catch (err) {
    console.error('Falha ao ler .env.local:', err);
  }
  return process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
}

const connectionString = loadDatabaseUrl();

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
});

/**
 * Copiado de src/lib/affiliate/dedup.ts para rodar isolado sem importar drizzle/server-only
 */
function normalizeTitle(title: string): { cleanTitle: string; platform: string } {
  let text = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase();

  // Extrai a plataforma de jogo
  let platform = 'unknown';
  if (text.includes('nintendo switch 2') || text.includes('switch 2')) {
    platform = 'switch_2';
  } else if (text.includes('nintendo switch') || text.includes('switch') || text.includes('nsw') || text.includes('lite')) {
    platform = 'switch_1';
  } else if (text.includes('ps5') || text.includes('playstation 5')) {
    platform = 'ps5';
  } else if (text.includes('ps4') || text.includes('playstation 4')) {
    platform = 'ps4';
  } else if (text.includes('xbox series x/s') || text.includes('xbox series') || text.includes('xbox series x') || text.includes('xbox series s')) {
    platform = 'xbox_series';
  } else if (text.includes('xbox one') || text.includes('xb1')) {
    platform = 'xbox_one';
  } else if (text.includes('xbox 360') || text.includes('x360')) {
    platform = 'xbox_360';
  }

  // Remove ruídos de termos de plataforma
  text = text
    .replace(/nintendo switch 2/g, '')
    .replace(/nintendo switch/g, '')
    .replace(/switch 2/g, '')
    .replace(/switch/g, '')
    .replace(/playstation 5/g, '')
    .replace(/playstation 4/g, '')
    .replace(/ps5/g, '')
    .replace(/ps4/g, '')
    .replace(/xbox series x\/s/g, '')
    .replace(/xbox series x/g, '')
    .replace(/xbox series s/g, '')
    .replace(/xbox series/g, '')
    .replace(/xbox one/g, '')
    .replace(/xbox 360/g, '');

  // Termos irrelevantes que costumam poluir anúncios
  const noiseWords = [
    'fisico', 'fisica', 'midia fisica', 'midia', 'jogo', 'original', 'lacrado', 'novo', 'nna', 'edicao', 'edition',
    'standard', 'classico', 'portugues', 'dublado', 'legendado', 'br', 'usa', 'eur', 'nsc', 'nna', 'brinde', 'promocao'
  ];

  // Limpa caracteres especiais, pontuação etc.
  text = text.replace(/[^a-z0-9\s]+/g, ' ');

  // Separa em palavras, filtra ruídos e reagrupa
  const tokens = text.split(/\s+/).filter(token => token.length > 1 && !noiseWords.includes(token));

  return {
    cleanTitle: tokens.join(' ').trim(),
    platform
  };
}

async function main() {
  console.log('🔄 Iniciando script de deduplicação de master_products via SQL bruto e isolado...');

  // 1. Carrega todos os master products cadastrados
  const allMasterProducts = await sql`
    SELECT id, name, game_platform_gen, created_at 
    FROM master_products
  `;

  console.log(`📋 Total de master_products carregados: ${allMasterProducts.length}`);

  // 2. Agrupa por chave normalizada (título limpo + plataforma)
  const groups: Record<string, any[]> = {};

  for (const mp of allMasterProducts) {
    const norm = normalizeTitle(mp.name);
    const platform = mp.game_platform_gen || norm.platform || 'unknown';
    if (!norm.cleanTitle) continue;

    const key = `${norm.cleanTitle}::${platform}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(mp);
  }

  let totalDuplicatesResolved = 0;
  let totalGroupsProcessed = 0;

  // 3. Processa cada grupo de duplicatas
  for (const [key, items] of Object.entries(groups)) {
    if (items.length <= 1) continue;

    totalGroupsProcessed++;
    // Ordena por data de criação (mais antigo primeiro) para escolher o canônico original
    items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const canonical = items[0];
    const duplicates = items.slice(1);

    console.log(`\n🔍 Grupo Duplicado [${key}]:`);
    console.log(`   ✅ Canônico: "${canonical.name}" (${canonical.id})`);
    
    for (const dup of duplicates) {
      console.log(`   ❌ Duplicata: "${dup.name}" (${dup.id})`);

      await sql.begin(async (tx) => {
        // A. Atualiza affiliate_offers apontando pro ID canônico
        const updatedOffers = await tx`
          UPDATE affiliate_offers
          SET master_product_id = ${canonical.id}
          WHERE master_product_id = ${dup.id}
          RETURNING id
        `;
        
        if (updatedOffers.length > 0) {
          console.log(`      ➡️  Movidas ${updatedOffers.length} ofertas de afiliados.`);
        }

        // B. Atualiza products (catálogo local de vendedores) apontando pro ID canônico
        const updatedProducts = await tx`
          UPDATE products
          SET master_product_id = ${canonical.id}
          WHERE master_product_id = ${dup.id}
          RETURNING id
        `;

        if (updatedProducts.length > 0) {
          console.log(`      ➡️  Movidos ${updatedProducts.length} produtos de vendedores.`);
        }

        // C. Atualiza ou remove watches (para evitar violar a restrição uniqueIndex de user+master)
        const dupWatches = await tx`
          SELECT id, user_id 
          FROM affiliate_price_watches
          WHERE master_product_id = ${dup.id}
        `;

        for (const watch of dupWatches) {
          // Verifica se o usuário já monitora o canônico
          const canonicalWatch = await tx`
            SELECT id 
            FROM affiliate_price_watches
            WHERE user_id = ${watch.user_id} AND master_product_id = ${canonical.id}
            LIMIT 1
          `;

          if (canonicalWatch.length > 0) {
            // Se já monitorava o canônico, apenas deleta o watch duplicado
            await tx`
              DELETE FROM affiliate_price_watches
              WHERE id = ${watch.id}
            `;
          } else {
            // Caso contrário, atualiza o monitoramento pro canônico
            await tx`
              UPDATE affiliate_price_watches
              SET master_product_id = ${canonical.id}
              WHERE id = ${watch.id}
            `;
          }
        }
        if (dupWatches.length > 0) {
          console.log(`      ➡️  Processados ${dupWatches.length} monitoramentos de preço.`);
        }

        // D. Exclui o master product duplicado
        await tx`
          DELETE FROM master_products
          WHERE id = ${dup.id}
        `;
        console.log(`      🗑️  Excluído master_product duplicado.`);
        totalDuplicatesResolved++;
      });
    }
  }

  console.log(`\n🎉 Concluído!`);
  console.log(`👉 Grupos duplicados identificados: ${totalGroupsProcessed}`);
  console.log(`👉 Total de registros duplicados limpos no banco: ${totalDuplicatesResolved}`);
  
  await sql.end();
}

main().catch((err) => {
  console.error('❌ Erro no script de deduplicação:', err);
  process.exit(1);
});
