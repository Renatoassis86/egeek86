/**
 * Rótulos de exibição pra classificação de jogos (Geek Deals) e reputação de
 * vendedor — centralizados aqui pra não duplicar strings entre offer-card,
 * offer-filters e a página de detalhe.
 */
import type { AffiliateSeller, GameEditionType, GameFormat, GamePlatformGen } from '@/db/schema';

export const GAME_FORMAT_LABELS: Record<GameFormat, string> = {
  physical: 'Físico',
  digital: 'Digital',
  unknown: 'Formato não identificado',
};

export const GAME_PLATFORM_GEN_LABELS: Record<GamePlatformGen, string> = {
  switch_1: 'Nintendo Switch',
  switch_2: 'Nintendo Switch 2',
  ps4: 'PlayStation 4',
  ps5: 'PlayStation 5',
  xbox_one: 'Xbox One',
  xbox_series: 'Xbox Series',
  xbox_360: 'Xbox 360',
  unknown: 'Geração não identificada',
};

export const GAME_EDITION_TYPE_LABELS: Record<GameEditionType, string> = {
  full_game: 'Jogo completo',
  upgrade_pack: 'Pacote de atualização',
  dlc: 'DLC',
  bundle: 'Bundle',
  unknown: 'Edição não identificada',
};

type SellerForTrust = Pick<AffiliateSeller, 'reputationLevel' | 'powerSellerStatus' | 'totalSales'> | null | undefined;

export interface SellerTrustInfo {
  label: string;
  variant: 'success' | 'primary' | 'default' | 'danger';
}

/**
 * Heurística de confiança a partir dos campos crus de reputação do Mercado
 * Livre (level_id tipo "5_green"..."1_red", power_seller_status
 * "platinum"/"gold"/"silver"/null) — texto livre por rede, então tratamos
 * como best-effort, não como enum fechado.
 */
export function getSellerTrustInfo(seller: SellerForTrust): SellerTrustInfo | null {
  if (!seller) return null;

  if (seller.powerSellerStatus) {
    return { label: `Vendedor confiável · ${seller.powerSellerStatus}`, variant: 'success' };
  }

  const level = seller.reputationLevel ?? '';
  if (level.endsWith('green')) return { label: 'Boa reputação', variant: 'success' };
  if (level.endsWith('yellow') || level.endsWith('orange')) return { label: 'Reputação mediana', variant: 'default' };
  if (level.endsWith('red')) return { label: 'Reputação baixa', variant: 'danger' };

  if ((seller.totalSales ?? 0) >= 500) {
    return { label: 'Vendedor experiente', variant: 'primary' };
  }

  return null;
}

/** Mapeia SellerTrustInfo.variant pro prop `color` do componente <Text> (que não tem "default"). */
export function sellerTrustTextColor(variant: SellerTrustInfo['variant']): 'success' | 'accent' | 'secondary' | 'danger' {
  switch (variant) {
    case 'success':
      return 'success';
    case 'primary':
      return 'accent';
    case 'danger':
      return 'danger';
    default:
      return 'secondary';
  }
}
