import 'server-only';
import { and, eq, inArray, lt, gt, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { drops, products, sellers, profiles, sellerMetrics, productMedia, dropWaitlist } from '@/db/schema';
import type { Drop } from '@/db/schema';

export interface CollectorInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  geekPoints: number;
  avgRating: number;
  totalReviews: number;
  badgeName: string;
}

export interface DropWithRelations extends Drop {
  collector: CollectorInfo | null;
  images: string[];
}

// Mapeia pontos para badges do colecionador
export function getBadgeName(points: number): string {
  if (points >= 5000) return 'Lendário';
  if (points >= 2000) return 'Mestre';
  if (points >= 800) return 'Veterano';
  if (points >= 200) return 'Explorador';
  return 'Iniciante';
}

function getMockDrops(): DropWithRelations[] {
  const now = new Date();
  
  return [
    {
      id: 'd1111111-1111-1111-1111-111111111111',
      productId: null,
      variantId: null,
      title: 'PlayStation 5 Pro - Edição Limitada 30 Anos',
      slug: 'ps5-pro-30-anos-lim',
      description: 'O drop mais disputado do ano. Coleção comemorativa oficial da Sony em homenagem ao lendário console cinza original de 1994. Caixa numerada de colecionador e acabamentos clássicos impecáveis.',
      bannerUrl: '/images/hype-zone/banner.png',
      startsAt: new Date(now.getTime() - 1000 * 60 * 45), // Começou há 45 min
      endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 3), // Acaba em 3 horas
      stockLimit: 8,
      stockSold: 7, // Resta 1 (87.5% vendido)
      perUserLimit: 1,
      priceCents: 999900,
      accessType: 'public',
      requiredLevelId: null,
      requiredAccountAgeDays: 0,
      status: 'live',
      metadata: {
        velocityIndex: 'CRITICAL_SPEED',
        collectorsViewing: 142,
        velocityMessage: 'Última unidade disponível. Alta velocidade de checkout!',
        antiBotCertified: true,
        rarityGrade: 'Legendary (Tier 1)',
        specs: [
          'Console PS5® Pro (Edição de Colecionador)',
          'Tampa de console estilizada clássica cinza',
          'Controle DualSense® Edge 30 Anos',
          'Caixa especial estilo original com número estampado (#0886)'
        ],
        story: 'Adquiri este PS5 Pro no lançamento oficial da PlayStation Direct Brasil. Está absolutamente lacrado na caixa original, sem nenhum detalhe de manuseio. Um tesouro definitivo para qualquer fã da marca.'
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        '/images/hype-zone/banner.png',
        '/images/hero/tile-main.png',
        '/images/hero/tile-accent.png'
      ],
      collector: {
        id: 'collector-1',
        displayName: 'Renato Assis (Renato86)',
        avatarUrl: null,
        geekPoints: 3450,
        avgRating: 4.9,
        totalReviews: 86,
        badgeName: 'Mestre'
      }
    },
    {
      id: 'd2222222-2222-2222-2222-222222222222',
      productId: null,
      variantId: null,
      title: 'Funko Pop! Gold Metallic Charizard #04',
      slug: 'funko-pop-metallic-charizard',
      description: 'Exclusividade San Diego Comic-Con. Edição metálica banhada a ouro do icônico Pokémon de fogo Charizard. Apenas para colecionadores selecionados com Geek Level avançado.',
      bannerUrl: '/images/hero/tile-main.png',
      startsAt: new Date(now.getTime() + 1000 * 60 * 60 * 1.5), // Começa em 1h 30min
      endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 5),
      stockLimit: 15,
      stockSold: 0,
      perUserLimit: 1,
      priceCents: 49900,
      accessType: 'tier_locked',
      requiredLevelId: 'level-master-id',
      requiredAccountAgeDays: 15,
      status: 'scheduled',
      metadata: {
        requiredLevelName: 'Nível 5 - Mestre',
        rarityGrade: 'Legendary (Tier 2)',
        collectorsWatching: 580,
        antiBotCertified: true,
        specs: [
          'Edição SDCC Oficial',
          'Acabamento folheado a ouro escovado',
          'Acompanha case rígido acrílico de proteção UV',
          'Selo oficial de autenticidade numerado'
        ],
        story: 'Este item foi importado diretamente da SDCC de 2022. Caixa em perfeitas condições (Grade 9.5/10). Foi guardado em ambiente livre de fumaça e poeira desde então. Ideal para exibição.'
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        '/images/hero/tile-main.png',
        '/images/hero/tile-accent.png'
      ],
      collector: {
        id: 'collector-2',
        displayName: 'Arthur Pendragon',
        avatarUrl: null,
        geekPoints: 6120,
        avgRating: 4.8,
        totalReviews: 124,
        badgeName: 'Lendário'
      }
    },
    {
      id: 'd3333333-3333-3333-3333-333333333333',
      productId: null,
      variantId: null,
      title: 'Vaporwave Custom Keyboard mechanical (65%)',
      slug: 'vaporwave-retro-keyboard',
      description: 'Teclado mecânico feito à mão com carcaça de alumínio anodizado roxo, switches lubrificados de fábrica e keycaps PBT no clássico estilo neon Vaporwave. Lista de espera obrigatória para liberar o link.',
      bannerUrl: '/images/hero/tile-back.png',
      startsAt: new Date(now.getTime() + 1000 * 60 * 60 * 36), // Começa em 36h
      endsAt: new Date(now.getTime() + 1000 * 60 * 60 * 42),
      stockLimit: 25,
      stockSold: 0,
      perUserLimit: 1,
      priceCents: 125000,
      accessType: 'waitlist',
      requiredLevelId: null,
      requiredAccountAgeDays: 0,
      status: 'scheduled',
      metadata: {
        rarityGrade: 'Rare (Tier 3)',
        collectorsWatching: 1204,
        antiBotCertified: true,
        specs: [
          'Switches Customizados Lineares (Lubed)',
          'Keycaps Premium PBT Double-Shot (Dye-sub)',
          'Estrutura Gasket-mount de alumínio pesado',
          'Cabo em espiral paracord roxo com conector aviador'
        ],
        story: 'Montei este teclado usando os melhores componentes importados. A lubrificação dos switches Gateron Yellow foi feita manualmente com Krytox 205g0 para um som incrivelmente suave e silencioso (clássico "thock").'
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        '/images/hero/tile-back.png',
        '/images/hero/tile-main.png'
      ],
      collector: {
        id: 'collector-3',
        displayName: 'Aline Tech & Craft',
        avatarUrl: null,
        geekPoints: 1250,
        avgRating: 5.0,
        totalReviews: 12,
        badgeName: 'Veterano'
      }
    },
    {
      id: 'd4444444-4444-4444-4444-444444444444',
      productId: null,
      variantId: null,
      title: 'Retro Game Boy Color Custom (IPS backlit)',
      slug: 'retro-gameboy-color-ips',
      description: 'Console Game Boy Color customizado com tela IPS retroiluminada de alta definição (ajuste de brilho por toque), carcaça translúcida fumê e bateria interna recarregável USB-C.',
      bannerUrl: '/images/hero/tile-accent.png',
      startsAt: new Date(now.getTime() - 1000 * 60 * 60 * 48),
      endsAt: new Date(now.getTime() - 1000 * 60 * 60 * 46),
      stockLimit: 5,
      stockSold: 5,
      perUserLimit: 1,
      priceCents: 140000,
      accessType: 'public',
      requiredLevelId: null,
      requiredAccountAgeDays: 0,
      status: 'sold_out',
      metadata: {
        soldOutInSeconds: 42,
        velocityMessage: 'Esgotado em apenas 42 segundos!',
        antiBotCertified: true,
        specs: [
          'Tela IPS retroiluminada v3 com 5 níveis de brilho',
          'Alto-falante amplificado com áudio cristalino',
          'Porta USB-C para recarga integrada',
          'Bateria de Lítio de 1200mAh inclusa'
        ],
        story: 'Um projeto de modificação feito com muito carinho. A placa original foi lavada em banho ultrassônico e todos os capacitores foram trocados por novos de alta durabilidade (re-capped). A tela IPS é vibrante!'
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        '/images/hero/tile-accent.png'
      ],
      collector: {
        id: 'collector-4',
        displayName: 'Gamer Retro Lab',
        avatarUrl: null,
        geekPoints: 4100,
        avgRating: 4.7,
        totalReviews: 242,
        badgeName: 'Mestre'
      }
    },
    {
      id: 'd5555555-5555-5555-5555-555555555555',
      productId: null,
      variantId: null,
      title: 'Magic: The Gathering - Caixa de Booster de Colecionador',
      slug: 'mtg-booster-box-ltd',
      description: 'Caixa lacrada contendo boosters de colecionador raros com artes exclusivas de borda infinita, cards numerados e foils texturizados premium.',
      bannerUrl: '/images/hero/tile-main.png',
      startsAt: new Date(now.getTime() - 1000 * 60 * 60 * 120),
      endsAt: new Date(now.getTime() - 1000 * 60 * 60 * 115),
      stockLimit: 12,
      stockSold: 12,
      perUserLimit: 2,
      priceCents: 249000,
      accessType: 'public',
      requiredLevelId: null,
      requiredAccountAgeDays: 0,
      status: 'sold_out',
      metadata: {
        soldOutInSeconds: 118,
        velocityMessage: 'Esgotado em 1 minuto e 58 segundos!',
        antiBotCertified: true,
        specs: [
          'Caixa contendo 12 boosters de colecionador premium',
          'Chances aumentadas de cards numerados raros',
          'Selo oficial holográfico Wizards of the Coast'
        ],
        story: 'Caixa guardada em caixa organizadora hermética protegida de umidade. Sem rasgos no plástico termoencolhível original da Wizards. Perfeito para colecionadores selados.'
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        '/images/hero/tile-main.png'
      ],
      collector: {
        id: 'collector-5',
        displayName: 'Card Kingdom BR',
        avatarUrl: null,
        geekPoints: 8900,
        avgRating: 4.95,
        totalReviews: 615,
        badgeName: 'Lendário'
      }
    }
  ];
}

async function mapDropsToRelations(dbDrops: any[]): Promise<DropWithRelations[]> {
  if (dbDrops.length === 0) return [];
  
  const results: DropWithRelations[] = [];
  
  for (const drop of dbDrops) {
    let collector: CollectorInfo | null = null;
    let images: string[] = [];

    // Se o drop tiver produto associado, buscamos as mídias e os dados do vendedor
    if (drop.productId) {
      try {
        const mediaList = await db
          .select({ url: productMedia.url })
          .from(productMedia)
          .where(eq(productMedia.productId, drop.productId))
          .orderBy(productMedia.position);
          
        images = mediaList.map((m) => m.url);
        
        // Dados do vendedor/colecionador
        const [prod] = await db
          .select({ sellerId: products.sellerId })
          .from(products)
          .where(eq(products.id, drop.productId))
          .limit(1);

        if (prod) {
          const [sell] = await db
            .select({
              id: sellers.id,
              displayName: sellers.displayName,
              userId: sellers.userId
            })
            .from(sellers)
            .where(eq(sellers.id, prod.sellerId))
            .limit(1);

          if (sell) {
            const [prof] = await db
              .select({
                name: profiles.name,
                avatarUrl: profiles.avatarUrl,
                geekPoints: profiles.geekPoints
              })
              .from(profiles)
              .where(eq(profiles.id, sell.userId))
              .limit(1);
              
            const [metrics] = await db
              .select({
                avgRating: sellerMetrics.avgRating,
                totalReviews: sellerMetrics.totalReviews
              })
              .from(sellerMetrics)
              .where(eq(sellerMetrics.sellerId, sell.id))
              .limit(1);

            collector = {
              id: sell.id,
              displayName: sell.displayName || prof?.name || 'Colecionador',
              avatarUrl: prof?.avatarUrl ?? null,
              geekPoints: prof?.geekPoints ?? 0,
              avgRating: metrics ? Number(metrics.avgRating) : 5.0,
              totalReviews: metrics ? metrics.totalReviews : 0,
              badgeName: getBadgeName(prof?.geekPoints ?? 0)
            };
          }
        }
      } catch (err) {
        console.error(`Erro ao montar relações para o drop ${drop.id}:`, err);
      }
    }

    // Fallback de imagem caso o produto não tenha mídias cadastradas
    if (images.length === 0 && drop.bannerUrl) {
      images = [drop.bannerUrl];
    }

    results.push({
      ...drop,
      collector,
      images
    });
  }

  return results;
}

/**
 * Retorna todos os drops ativos (Live) com relações do Colecionador.
 */
export async function getLiveDrops(): Promise<DropWithRelations[]> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(drops)
      .where(
        or(
          eq(drops.status, 'live'),
          and(
            eq(drops.status, 'scheduled'),
            lte(drops.startsAt, now),
            gt(drops.endsAt, now)
          )
        )
      )
      .orderBy(drops.startsAt);
      
    if (rows.length === 0) {
      return getMockDrops().filter((d) => d.status === 'live');
    }
    
    return await mapDropsToRelations(rows);
  } catch (error) {
    console.error('Falha ao obter live drops do banco, usando mocks:', error);
    return getMockDrops().filter((d) => d.status === 'live');
  }
}

/**
 * Retorna os próximos drops (Scheduled) com relações do Colecionador.
 */
export async function getUpcomingDrops(): Promise<DropWithRelations[]> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(drops)
      .where(
        and(
          eq(drops.status, 'scheduled'),
          gt(drops.startsAt, now)
        )
      )
      .orderBy(drops.startsAt);

    if (rows.length === 0) {
      return getMockDrops().filter((d) => d.status === 'scheduled');
    }
    
    return await mapDropsToRelations(rows);
  } catch (error) {
    console.error('Falha ao obter upcoming drops do banco, usando mocks:', error);
    return getMockDrops().filter((d) => d.status === 'scheduled');
  }
}

/**
 * Retorna os drops passados (Sold Out / Ended) com relações do Colecionador.
 */
export async function getPastDrops(): Promise<DropWithRelations[]> {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(drops)
      .where(
        or(
          eq(drops.status, 'sold_out'),
          eq(drops.status, 'ended'),
          lt(drops.endsAt, now)
        )
      )
      .orderBy(drops.endsAt);

    if (rows.length === 0) {
      return getMockDrops().filter((d) => d.status === 'sold_out' || d.status === 'ended');
    }
    
    return await mapDropsToRelations(rows);
  } catch (error) {
    console.error('Falha ao obter past drops do banco, usando mocks:', error);
    return getMockDrops().filter((d) => d.status === 'sold_out' || d.status === 'ended');
  }
}

/**
 * Retorna os IDs dos drops em que o usuário está na lista de espera.
 */
export async function getUserWaitlist(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ dropId: dropWaitlist.dropId })
      .from(dropWaitlist)
      .where(eq(dropWaitlist.userId, userId));
    return rows.map((r) => r.dropId);
  } catch (error) {
    console.error('Falha ao obter waitlist do usuário:', error);
    return [];
  }
}
