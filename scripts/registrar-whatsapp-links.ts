import { connect } from './_dup-shared';
const L: Record<string, string> = {
  games: 'IA2waSYeBkn6WHu0SscThL', esporte: 'DDZk1P7tlONCxKZa3fHmlN', eletroeletronicos: 'K9OqgTA8IgQGgogO7rP5FE',
  eletrodomesticos: 'KMakESjyJS8CKqb91r2Uef', livros: 'BogVoOh81wq7WII4UETC68', tecnologia: 'CsB8BKKTKqzLbGADSMjPnh', 'impressao-3d': 'GRiP25CUXk5KJ929DKHND',
};
(async () => {
  const sql = await connect();
  const rows = await sql`SELECT slug FROM store_sections ORDER BY slug`;
  console.log('slugs:', rows.map((r: any) => r.slug).join(', '));
  for (const [slug, code] of Object.entries(L)) {
    const r = await sql`UPDATE store_sections SET whatsapp_group_url = ${'https://chat.whatsapp.com/' + code} WHERE slug = ${slug} RETURNING slug`;
    console.log(slug, r.length ? 'ok' : 'SEM LOJA');
  }
  process.exit(0);
})();
