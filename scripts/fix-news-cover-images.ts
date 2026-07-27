import { db } from '../src/lib/db';
import { newsArticles } from '../src/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Atualizando URLs de capas de notícias para caminhos locais seguros...');
  
  await db
    .update(newsArticles)
    .set({
      coverImageUrl: '/images/home/observatorio-gamer-hero.png',
      updatedAt: new Date(),
    })
    .where(sql`cover_image_url IS NULL OR cover_image_url NOT LIKE '/images/%'`);

  console.log('Atualização concluída com sucesso!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao atualizar capas de notícias:', err);
  process.exit(1);
});
