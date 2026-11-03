import { cn } from '@/lib/cn';

/**
 * Aviso de remuneração dos links de loja. Texto aprovado pelo dono (nunca usar a palavra "afiliado" na interface).
 * Fonte única: qualquer ajuste de redação é feito aqui. Revisão jurídica final pendente (docs/revisao-legal-lgpd-comissao-2026-11-03.md).
 */
export const COMMISSION_NOTICE_TEXT =
  'Podemos receber uma comissão pelas compras feitas pelos nossos links, sem custo extra para você.';

export function CommissionNotice({ className, withLink = true }: { className?: string; withLink?: boolean }) {
  return (
    <p className={cn('text-[12px] leading-relaxed text-[var(--color-text-tertiary)]', className)}>
      {COMMISSION_NOTICE_TEXT}
      {withLink && (
        <>
          {' '}
          <a href="/termos#divulgacao" className="underline underline-offset-2 hover:text-[var(--color-text-secondary)]">
            Saiba mais
          </a>
          .
        </>
      )}
    </p>
  );
}
