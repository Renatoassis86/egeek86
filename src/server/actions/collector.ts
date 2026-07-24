'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sellers, sellerMetrics, profiles, products, productVariants, productMedia, drops, categories } from '@/db/schema';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { slugify } from '@/lib/slugify';
import { isNonProductAccessory } from '@/server/collector/discover-products';

/**
 * Conclui o questionário de qualificação do colecionador e o registra como vendedor ativo.
 */
export async function saveCollectorOnboarding(answers: {
  fullName: string;
  documentId: string;
  phone: string;
  cityState: string;
  bio: string;
  experienceYears: number;
  focusFranchises: string[];
  guaranteesAuthentic: boolean;
}) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para realizar o onboarding.' };
    }

    if (!answers.fullName || answers.fullName.trim().length < 3) {
      return { error: 'Informe seu Nome Completo para o cadastro.' };
    }

    if (!answers.documentId || answers.documentId.trim().length < 11) {
      return { error: 'Informe um CPF ou CNPJ válido.' };
    }

    if (!answers.phone || answers.phone.trim().length < 8) {
      return { error: 'Informe um número de Telefone / WhatsApp válido.' };
    }

    if (!answers.guaranteesAuthentic) {
      return { error: 'Você precisa concordar em garantir a autenticidade e qualidade dos seus itens.' };
    }

    // Cria ou atualiza o perfil do vendedor (seller)
    const displayName = answers.fullName.trim();
    const sellerSlug = slugify(`${displayName}-${randomUUID().slice(0, 4)}`);
    
    // Verifica se já existe vendedor
    const [existingSeller] = await db
      .select()
      .from(sellers)
      .where(eq(sellers.userId, profile.id))
      .limit(1);

    let sellerId: string;

    if (existingSeller) {
      sellerId = existingSeller.id;
      await db
        .update(sellers)
        .set({
          companyName: displayName,
          displayName: displayName,
          cnpj: answers.documentId.trim(),
          phone: answers.phone.trim(),
          description: answers.bio,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(sellers.id, sellerId));
    } else {
      const [newSeller] = await db
        .insert(sellers)
        .values({
          userId: profile.id,
          companyName: displayName,
          displayName: displayName,
          slug: sellerSlug,
          cnpj: answers.documentId.trim(),
          phone: answers.phone.trim(),
          emailBusiness: profile.email,
          description: answers.bio,
          status: 'active',
        })
        .returning();
      sellerId = newSeller.id;
    }

    // Inicializa métricas de vendedor se não existirem
    const [existingMetrics] = await db
      .select()
      .from(sellerMetrics)
      .where(eq(sellerMetrics.sellerId, sellerId))
      .limit(1);

    if (!existingMetrics) {
      await db.insert(sellerMetrics).values({
        sellerId,
        avgRating: '5.00',
        totalReviews: 1,
        totalOrders: 0,
      });
    }

    // Gamificação: Recompensa o usuário com 150 Geek Points pelo onboarding!
    const updatedPreferences = {
      ...(profile.preferences as Record<string, any> || {}),
      collectorOnboarding: {
        completed: true,
        answers,
        completedAt: new Date().toISOString(),
      }
    };

    await db
      .update(profiles)
      .set({
        geekPoints: (profile.geekPoints || 0) + 150,
        preferences: updatedPreferences,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profile.id));

    revalidatePath('/conta');
    revalidatePath('/hype-zone');
    return { success: true, message: 'Parabéns! Onboarding concluído. Você recebeu 150 Geek Points de bônus!' };
  } catch (error) {
    console.error('Erro no onboarding do colecionador:', error);
    return { error: 'Ocorreu um erro ao processar seu onboarding. Tente novamente.' };
  }
}

/**
 * Cria um produto, variante, imagens e agenda o drop na Hype Zone (limite de 10 fotos).
 */
export async function createCollectorDrop(data: {
  title: string;
  description: string;
  story: string;
  priceCents: number;
  startsAtStr: string;
  stockLimit: number;
  images: string[];
}) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { error: 'Você precisa estar logado para agendar um drop.' };
    }

    // Carrega o registro de vendedor ativo
    const [seller] = await db
      .select()
      .from(sellers)
      .where(and(eq(sellers.userId, profile.id), eq(sellers.status, 'active')))
      .limit(1);

    if (!seller) {
      return { error: 'Você precisa concluir seu onboarding de Colecionador Vendedor antes de criar um drop.' };
    }

    // Validação estrita do limite de 10 imagens
    const imageList = data.images.filter(Boolean);
    if (imageList.length === 0) {
      return { error: 'Você precisa enviar ao menos 1 imagem do item.' };
    }
    if (imageList.length > 10) {
      return { error: 'O limite máximo permitido é de 10 imagens.' };
    }

    // Validação de tipo de item proibido (merchandising/decorativos)
    if (isNonProductAccessory(data.title)) {
      return { error: 'Este tipo de item (chaveiro, caneca, camiseta, funko, miniatura, etc.) não é permitido em nosso inventário. Apenas itens de jogo ou para melhorar a experiência de jogo são aceitos.' };
    }

    // Obter ou criar uma categoria padrão para o catálogo
    let categoryId: string;
    const [existingCat] = await db.select().from(categories).limit(1);
    
    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      // Cria uma categoria padrão do catálogo de colecionáveis
      const [newCat] = await db
        .insert(categories)
        .values({
          name: 'Colecionáveis Raros',
          slug: 'colecionaveis-raros',
          path: '/colecionaveis-raros',
          level: 0,
        })
        .returning();
      categoryId = newCat.id;
    }

    // Cria o produto no catálogo do vendedor
    const productSlug = slugify(`${data.title}-${randomUUID().slice(0, 6)}`);
    const [product] = await db
      .insert(products)
      .values({
        sellerId: seller.id,
        categoryId,
        title: data.title,
        slug: productSlug,
        description: data.description,
        shortDescription: data.story.slice(0, 150),
        status: 'active',
        isAuthentic: true,
        isExclusive: true,
      })
      .returning();

    // Cria a variante do produto (necessária para compras e preço)
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: product.id,
        sku: `SKU-${randomUUID().slice(0, 8).toUpperCase()}`,
        priceCents: data.priceCents,
        isDefault: true,
      })
      .returning();

    // Cria os registros das mídias associadas (máximo 10)
    for (let i = 0; i < imageList.length; i++) {
      await db.insert(productMedia).values({
        productId: product.id,
        variantId: variant.id,
        type: 'image',
        url: imageList[i],
        position: i,
        altText: `${data.title} - Imagem ${i + 1}`,
      });
    }

    // Cria e agenda o Drop na Hype Zone
    const dropSlug = slugify(`drop-${data.title}-${randomUUID().slice(0, 6)}`);
    const startsAt = new Date(data.startsAtStr);
    const endsAt = new Date(startsAt.getTime() + 1000 * 60 * 60 * 24); // Termina 24 horas depois

    await db.insert(drops).values({
      productId: product.id,
      variantId: variant.id,
      title: data.title,
      slug: dropSlug,
      description: data.description,
      bannerUrl: imageList[0],
      startsAt,
      endsAt,
      stockLimit: data.stockLimit,
      stockSold: 0,
      perUserLimit: 1,
      priceCents: data.priceCents,
      accessType: 'public',
      status: 'scheduled',
      metadata: {
        story: data.story,
        specs: [
          'Item Inspecionado por Especialista',
          'Autenticidade Garantida',
          'Embalagem Protetora Premium'
        ],
        antiBotCertified: true
      }
    });

    revalidatePath('/hype-zone');
    return { success: true, message: 'Seu drop foi agendado com sucesso e aparecerá nos Próximos Lançamentos!' };
  } catch (error) {
    console.error('Erro ao agendar drop do colecionador:', error);
    return { error: 'Ocorreu um erro no servidor ao tentar agendar o drop. Tente novamente.' };
  }
}

/**
 * Dispara uma varredura instantânea por termo ou URL/ID do Mercado Livre.
 * Permite cadastrar qualquer item (ex: Turok Nintendo Switch ou link MLB61640919) imediatamente.
 */
export async function triggerManualMeliExtraction(queryOrUrl: string) {
  try {
    const { searchAndIngestMeliTerm } = await import('@/server/collector/discover-products');
    const { collectPrices } = await import('@/server/collector/collect-prices');
    const { getValidAccessToken } = await import('@/server/collector/sources/mercado-livre-auth');
    const { affiliateOffers, affiliateNetworks, masterProducts } = await import('@/db/schema');
    const { classifyFromAttributes } = await import('@/server/collector/sources/mercado-livre-classify');

    const cleanInput = queryOrUrl.trim();
    if (!cleanInput) {
      return { error: 'Informe um termo de busca ou link do Mercado Livre.' };
    }

    // Extrai ID do catálogo (ex: MLB61640919 ou MLB5893431912) se fornecido em URL
    const mlbMatch = cleanInput.match(/MLB-?\d+/i) || cleanInput.match(/\/p\/(MLB\d+)/i);

    if (mlbMatch) {
      const accessToken = await getValidAccessToken();
      const [network] = await db
        .select()
        .from(affiliateNetworks)
        .where(eq(affiliateNetworks.slug, 'mercado-livre'))
        .limit(1);

      if (!network) {
        return { error: 'Rede mercado-livre não cadastrada no banco.' };
      }

      const catalogId = mlbMatch[0].replace('-', '');
      const response = await fetch(`https://api.mercadolibre.com/products/${catalogId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        return { error: `Mercado Livre não encontrou o produto ${catalogId}. Confira o link/ID.` };
      }

      const itemData = await response.json();
      const [existing] = await db
        .select({ id: masterProducts.id })
        .from(masterProducts)
        .where(eq(masterProducts.meliCatalogId, itemData.id))
        .limit(1);

      if (existing) {
        return { error: `"${itemData.name}" já está catalogado — veja em Ofertas.` };
      }

      const classification = classifyFromAttributes(itemData.attributes || [], itemData.name);
      const baseSlug = slugify(itemData.name);

      const [masterProduct] = await db
        .insert(masterProducts)
        .values({
          name: itemData.name,
          slug: baseSlug,
          meliCatalogId: itemData.id,
          defaultImages: itemData.pictures?.map((p: any) => p.url) ?? [],
          ...classification,
          classifiedAt: new Date(),
        })
        .returning();

      const offerSlug = slugify(`${itemData.name}-${itemData.id.slice(-6)}-${randomUUID().slice(0, 6)}`);

      await db.insert(affiliateOffers).values({
        masterProductId: masterProduct.id,
        networkId: network.id,
        title: itemData.name,
        slug: offerSlug,
        affiliateUrl: `https://www.mercadolivre.com.br/p/${itemData.id}`,
        affiliateLinkPending: true,
        imageUrl: itemData.pictures?.[0]?.url ?? null,
        externalRef: itemData.id,
        // Sem preço coletado ainda (endpoint de catálogo não garante preço
        // confiável de buy-box) — nunca inventa um valor; collectPrices()
        // logo abaixo já busca o preço real antes da action retornar.
        currentPriceCents: 0,
        status: 'active',
        publishedAt: new Date(),
      });

      const priceSummary = await collectPrices();
      revalidatePath('/ofertas');
      revalidatePath('/monitoramento');
      revalidatePath('/admin/ofertas');

      return {
        success: true,
        message: `"${itemData.name}" catalogado! ${priceSummary.updated} preços atualizados.`,
        discoverySummary: { created: 1 },
        priceSummary,
      };
    }

    // Termo de texto livre (ex: "Turok Nintendo Switch") — busca de verdade
    // por ESSE termo específico, não uma redescoberta genérica que ignora o
    // que foi digitado.
    const termResult = await searchAndIngestMeliTerm(cleanInput);
    const priceSummary = await collectPrices();

    revalidatePath('/ofertas');
    revalidatePath('/monitoramento');
    revalidatePath('/admin/ofertas');

    if (termResult.errors.length > 0 && termResult.found === 0) {
      return { error: `Erro ao buscar "${cleanInput}" no Mercado Livre: ${termResult.errors[0].message}` };
    }

    if (termResult.created === 0) {
      const reason =
        termResult.found === 0
          ? `Mercado Livre não retornou nenhum resultado pra "${cleanInput}".`
          : `Encontrado ${termResult.found} resultado(s) pra "${cleanInput}", mas todos já estavam catalogados ou fora do escopo (jogo/console/acessório de jogo).`;
      return {
        success: true,
        message: reason,
        discoverySummary: { created: 0 },
        priceSummary,
      };
    }

    return {
      success: true,
      message: `${termResult.created} novo(s) produto(s) catalogado(s) pra "${cleanInput}": ${termResult.createdTitles.slice(0, 3).join(', ')}${termResult.createdTitles.length > 3 ? '...' : ''}. ${priceSummary.updated} preços atualizados.`,
      discoverySummary: { created: termResult.created },
      priceSummary,
    };
  } catch (error) {
    console.error('Erro na extração manual do Mercado Livre:', error);
    return { error: 'Ocorreu um erro ao extrair dados do Mercado Livre. Verifique o termo e tente novamente.' };
  }
}

/**
 * Dispara uma varredura completa de descoberta e atualização de preços sob demanda.
 */
export async function triggerFullDiscoveryRun() {
  try {
    const { discoverNewProducts, discoverAllCategoryProducts } = await import('@/server/collector/discover-products');
    const { discoverShopeeProducts } = await import('@/server/collector/discover-shopee-products');
    const { discoverMagaluProducts } = await import('@/server/collector/discover-magalu-products');
    const { collectPrices } = await import('@/server/collector/collect-prices');

    const categorySummary = await discoverAllCategoryProducts(5);
    const discoverySummary = await discoverNewProducts();
    const shopeeSummary = await discoverShopeeProducts();
    const magaluSummary = await discoverMagaluProducts();
    const priceSummary = await collectPrices();

    revalidatePath('/ofertas');
    revalidatePath('/monitoramento');
    revalidatePath('/admin/ofertas');

    const totalNew =
      (categorySummary?.totalIngested || 0) +
      (discoverySummary?.created || 0) +
      (shopeeSummary?.created || 0) +
      (magaluSummary?.created || 0);

    return {
      success: true,
      message: `Varredura completa Mercado Livre + Shopee + Magalu executada! ${totalNew} novos produtos catalogados de todas as lojas e ${priceSummary.updated} preços atualizados.`,
      categorySummary,
      discoverySummary,
      shopeeSummary,
      magaluSummary,
      priceSummary,
    };
  } catch (error) {
    console.error('Erro ao disparar varredura geral:', error);
    return { error: 'Ocorreu um erro ao executar a varredura geral das plataformas.' };
  }
}

/**
 * Dispara uma extração instantânea para Shopee por palavra-chave ou link.
 */
export async function triggerShopeeExtraction(queryOrUrl: string) {
  try {
    const { discoverShopeeProducts } = await import('@/server/collector/discover-shopee-products');
    const summary = await discoverShopeeProducts();

    revalidatePath('/ofertas');
    revalidatePath('/monitoramento');
    revalidatePath('/admin/ofertas');

    return {
      success: true,
      message: `Extração Shopee concluída! ${summary.created} novos produtos catalogados da Shopee.`,
      summary,
    };
  } catch (error) {
    console.error('Erro na extração Shopee:', error);
    return { error: 'Ocorreu um erro ao conectar com a API da Shopee.' };
  }
}

/**
 * Dispara uma extração instantânea para Magazine Luiza (Magalu).
 */
export async function triggerMagaluExtraction(queryOrUrl?: string) {
  try {
    const { discoverMagaluProducts } = await import('@/server/collector/discover-magalu-products');
    const summary = await discoverMagaluProducts();

    revalidatePath('/ofertas');
    revalidatePath('/monitoramento');
    revalidatePath('/admin/ofertas');

    return {
      success: true,
      message: `Extração Magalu concluída! ${summary.created} novos produtos catalogados do Magazine Luiza.`,
      summary,
    };
  } catch (error) {
    console.error('Erro na extração Magalu:', error);
    return { error: 'Ocorreu um erro ao conectar com a API do Magalu.' };
  }
}
