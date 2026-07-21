'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteSellerAction } from '@/server/actions/curation';

export function DeleteSellerButton({ sellerId, displayName }: { sellerId: string; displayName: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Tem certeza que deseja excluir o vendedor colecionador "${displayName}"?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteSellerAction(sellerId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
      }
    } catch {
      toast.error('Erro ao excluir o colecionador.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleDelete}
      disabled={isDeleting}
      title="Excluir Colecionador"
      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
