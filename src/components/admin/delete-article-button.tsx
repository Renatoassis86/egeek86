'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteArticle } from '@/server/actions/news';

export function DeleteArticleButton({ articleId, articleTitle }: { articleId: string; articleTitle: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Tem certeza que deseja excluir a matéria "${articleTitle}"?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteArticle(articleId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(res.message);
      }
    } catch {
      toast.error('Erro ao excluir a matéria.');
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
      title="Excluir Matéria"
      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
