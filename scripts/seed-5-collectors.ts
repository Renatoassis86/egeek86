import postgres from 'postgres';

const sql = postgres('postgresql://postgres.sdrjxgwczeumbcbscjpi:Rairooha123%40@aws-1-us-west-2.pooler.supabase.com:5432/postgres');

async function main() {
  console.log('--- GERANDO 5 COLECIONADORES DE DEMONSTRAÇÃO ---');

  const collectors = [
    {
      name: 'Carlos Eduardo (Retro & Nintendo)',
      email: 'carlos.retro.nintendo@egeek86.dev',
      role: 'seller',
      collectionFocus: 'Game Boy Color, SNES CIB, N64',
      collectionSize: '~150 itens catalogados',
      verified: true,
    },
    {
      name: 'Beatriz Mendes (JRPGs Raridades)',
      email: 'beatriz.rpg.collector@egeek86.dev',
      role: 'seller',
      collectionFocus: 'Final Fantasy, Persona, JRPGs PS1/PS2',
      collectionSize: '~85 itens de coleção',
      verified: true,
    },
    {
      name: 'Lucas "ZeldaMaster" Silva',
      email: 'lucas.zeldamaster@egeek86.dev',
      role: 'seller',
      collectionFocus: 'The Legend of Zelda Special Editions',
      collectionSize: '~120 itens exclusivos',
      verified: true,
    },
    {
      name: 'Mariana Rocha (Arcade & Sega Classics)',
      email: 'mariana.sega.arcade@egeek86.dev',
      role: 'seller',
      collectionFocus: 'Mega Drive, Sega Saturn, Dreamcast',
      collectionSize: '~200 itens raros',
      verified: true,
    },
    {
      name: 'Gabriel "Vault86" Oliveira',
      email: 'gabriel.vault86@egeek86.dev',
      role: 'seller',
      collectionFocus: 'Mídias Físicas Lacradas Graduadas',
      collectionSize: '~45 mídias seladas',
      verified: true,
    },
  ];

  for (const c of collectors) {
    const existing = await sql`SELECT id FROM profiles WHERE email = ${c.email}`;
    if (existing.length > 0) {
      console.log(`Colecionador ${c.name} já cadastrado.`);
      continue;
    }

    const userId = crypto.randomUUID();
    await sql`
      INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
      VALUES (
        ${userId},
        '00000000-0000-0000-0000-000000000000',
        ${c.email},
        '$2a$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567',
        NOW(),
        '{"provider":"email","providers":["email"]}',
        ${JSON.stringify({ name: c.name })},
        NOW(),
        NOW(),
        'authenticated',
        'authenticated'
      )
      ON CONFLICT DO NOTHING
    `;

    await sql`
      INSERT INTO profiles (id, name, email, role, created_at, updated_at)
      VALUES (${userId}, ${c.name}, ${c.email}, ${c.role}, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;

    console.log(`✅ Colecionador criado: ${c.name} (${c.email})`);
  }

  // Limpeza de ofertas com preço zero (R$ 0,00) e ofertas duplicadas sem cotações
  console.log('\n--- EXECUTANDO LIMPEZA DE ITENS COM PREÇO R$ 0,00 E DUPLICATAS ---');
  const deletedZeroOffers = await sql`
    DELETE FROM affiliate_offers 
    WHERE current_price_cents = 0 
       OR current_price_cents IS NULL
  `;
  console.log(`🧹 Ofertas com preço R$ 0,00 excluídas: ${deletedZeroOffers.count}`);

  await sql.end();
  console.log('\n--- OPERAÇÃO CONCLUÍDA COM SUCESSO ---');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
