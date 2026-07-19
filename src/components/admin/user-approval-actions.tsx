'use client';

import { useTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { approveCollectorUser, approveAffiliateUser } from '@/server/actions/user-actions';

export function UserApprovalActions({
  userId,
  role,
  hasPendingCollector,
  hasPendingAffiliate,
}: {
  userId: string;
  role: string;
  hasPendingCollector: boolean;
  hasPendingAffiliate: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleApproveCollector = () => {
    startTransition(async () => {
      const res = await approveCollectorUser(userId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleApproveAffiliate = () => {
    startTransition(async () => {
      const res = await approveAffiliateUser(userId);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {hasPendingCollector && (
        <Button
          size="sm"
          variant="hype"
          loading={isPending}
          onClick={handleApproveCollector}
        >
          Aprovar Colecionador
        </Button>
      )}
      {hasPendingAffiliate && (
        <Button
          size="sm"
          variant="primary"
          loading={isPending}
          onClick={handleApproveAffiliate}
        >
          Aprovar Afiliado
        </Button>
      )}
    </div>
  );
}

export function PhotoPreviewModal({ photoBase64, title }: { photoBase64: string; title: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!photoBase64) return null;

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setIsOpen(true)}>
        🖼️ Ver Foto da Coleção + Rosto
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative max-w-2xl w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-body-md">{title}</span>
              <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
                ✕ Fechar
              </Button>
            </div>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-md)] bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoBase64} alt={title} className="h-full w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
