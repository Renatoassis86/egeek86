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
      return `${discountValue}x Geek Coins`;
    default:
      return `${discountValue} OFF`;
  }
}

/** "10/11 às 19:42" no horário de Brasília; vazio se inválido. Exigido junto ao preço da Amazon (Licença de PI do Programa de Associados). */
export function formatBrasiliaStamp(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')} às ${g('hour')}:${g('minute')}`;
}
