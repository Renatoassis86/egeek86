'use client';

import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import { useRouter } from 'next/navigation';

export function ToastNotification({
  created,
  updated,
  published,
  archived,
}: {
  created: boolean;
  updated: boolean;
  published: boolean;
  archived: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (created) {
      toast.success('Notícia criada com sucesso!');
      router.replace(window.location.pathname);
    } else if (updated) {
      toast.success('Notícia atualizada com sucesso!');
      router.replace(window.location.pathname);
    } else if (published) {
      toast.success('Notícia publicada com sucesso!');
      router.replace(window.location.pathname);
    } else if (archived) {
      toast.success('Notícia arquivada com sucesso!');
      router.replace(window.location.pathname);
    }
  }, [created, updated, published, archived, router]);

  return null;
}
