import postgres from 'postgres';

const sql = postgres('postgresql://postgres.sdrjxgwczeumbcbscjpi:Rairooha123%40@aws-1-us-west-2.pooler.supabase.com:5432/postgres');

async function main() {
  console.log('=== VERIFICANDO E GARANTINDO 5 NOTÍCIAS PUBLICADAS COM CAPAS CERTAS ===\n');

  // Buscar admin ou primeiro usuario como autor
  const authors = await sql`SELECT id FROM profiles LIMIT 1`;
  const authorId = authors[0]?.id;

  if (!authorId) {
    console.error('Nenhum autor encontrado em profiles.');
    process.exit(1);
  }

  // Lista das 5 notícias essenciais do ecossistema
  const newsList = [
    {
      slug: 'especialistas-preveem-que-gta-6-fature-us-5-2-bilhoes-na-semana-de-lancamento',
      title: 'Especialistas preveem que GTA 6 fature US$ 5,2 bilhões na semana de lançamento',
      excerpt: 'Analistas do setor projetam a maior quebra de recorde da história do entretenimento com a chegada da sequência da Rockstar Games.',
      content: 'A indústria dos videogames se prepara para o maior lançamento da história. Analistas da Newzoo e Bloomberg projetam receitas superiores a 5 bilhões de dólares em apenas 7 dias.',
      category: 'cultura_pop',
      cover_image_url: '/images/noticias-hub/news-gta6.png',
      status: 'published',
    },
    {
      slug: 'x-men-insider-revela-qual-sera-o-arco-adaptado-em-novo-reboot',
      title: 'X-Men | Insider revela qual será o arco adaptado em novo reboot dos mutantes',
      excerpt: 'Informações de bastidores indicam que o Marvel Studios abordará a fase Krakoa no aguardado retorno dos mutantes às telas.',
      content: 'Os mutantes estão oficialmente retornando ao Universo Cinematográfico da Marvel. Fontes ligadas à produção confirmam o foco no arco contemporâneo das HQs.',
      category: 'cultura_pop',
      cover_image_url: '/images/noticias-hub/news-xmen.png',
      status: 'published',
    },
    {
      slug: 'o-crescimento-dos-campeonatos-de-e-sports-e-tours-locais-no-brasil',
      title: 'O crescimento dos campeonatos de E-sports e circuito regional no Brasil',
      excerpt: 'Torneios locais de fighting games e TCG expandem público e movimentam o mercado de arena e patrocínio gamer.',
      content: 'O circuito brasileiro de esportes eletrônicos atinge marcas históricas em 2026 com arena cheia e engajamento rekord no ecossistema de games.',
      category: 'pesquisa_mercado',
      cover_image_url: '/images/noticias-hub/news-esports.png',
      status: 'published',
    },
    {
      slug: 'guia-de-monitores-e-setups-gamer-para-alta-performance-em-2026',
      title: 'Guia de setups e periféricos para alta performance no mercado gamer em 2026',
      excerpt: 'Avaliação técnica sobre taxa de atualização, tempo de resposta e custo-benefício de periféricos para e-sports.',
      content: 'Nossa equipe de análise testou os principais monitores OLED e teclados mecânicos para apontar o melhor custo-benefício do ano.',
      category: 'tecnologia',
      cover_image_url: '/images/noticias-hub/news-gaming-setup.png',
      status: 'published',
    },
    {
      slug: 'a-valorizacao-dos-consoles-retro-e-midias-fisicas-raras-no-brasil',
      title: 'A valorização dos consoles retrô e mídias físicas raras no mercado brasileiro',
      excerpt: 'Levantamento revela a alta de preços de cartuchos raros e consoles 16-bit e 32-bit em feiras e leilões C2C.',
      content: 'Consoles clássicos como Super Nintendo, Mega Drive e PlayStation 1 continuam registrando valorização histórica para colecionadores.',
      category: 'games',
      cover_image_url: '/images/noticias-hub/news-retro-console.png',
      status: 'published',
    },
  ];

  for (const n of newsList) {
    const existing = await sql`SELECT id FROM news_articles WHERE slug = ${n.slug}`;
    if (existing.length > 0) {
      await sql`
        UPDATE news_articles
        SET title = ${n.title},
            excerpt = ${n.excerpt},
            body_markdown = ${n.content},
            category = ${n.category},
            cover_image_url = ${n.cover_image_url},
            status = ${n.status},
            updated_at = NOW()
        WHERE slug = ${n.slug}
      `;
      console.log(`✅ Atualizado: ${n.title}`);
    } else {
      await sql`
        INSERT INTO news_articles (id, title, slug, excerpt, body_markdown, kind, category, cover_image_url, status, author_id, published_at, created_at, updated_at)
        VALUES (gen_random_uuid(), ${n.title}, ${n.slug}, ${n.excerpt}, ${n.content}, 'original', ${n.category}, ${n.cover_image_url}, ${n.status}, ${authorId}, NOW(), NOW(), NOW())
      `;
      console.log(`✨ Criado: ${n.title}`);
    }
  }

  const allNews = await sql`SELECT id, title, cover_image_url FROM news_articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 5`;
  console.log(`\n📌 Total de Notícias Publicadas Ativas (${allNews.length}):`);
  for (const item of allNews) {
    console.log(` - ${item.title} -> [${item.cover_image_url}]`);
  }

  await sql.end();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
