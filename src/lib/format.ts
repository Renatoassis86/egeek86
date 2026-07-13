export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Rótulo de desconto para exibição/mensagem — cobre todos os valores de
 * promotionType (não só percentage/fixed), evitando "0.00 R$ OFF" em cupons
 * de frete grátis e afins.
 */
export function formatDiscountLabel(discountType: string, discountValue: string): string {
  switch (discountType) {
    case 'percentage':
      return `${discountValue}% OFF`;
    case 'fixed':
      return `R$ ${discountValue} OFF`;
    case 'free_shipping':
      return 'Frete grátis';
    case 'bxgy':
      return 'Leve mais, pague menos';
    case 'points_multiplier':
      return `${discountValue}x Geek Points`;
    default:
      return `${discountValue} OFF`;
  }
}
