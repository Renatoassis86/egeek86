'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { AdminNavLinks } from '@/components/layout/admin-nav-links';

/**
 * Navegação mobile do admin — some no desktop (lg:hidden). Antes da sidebar
 * `hidden lg:block` não existia nenhum substituto no mobile; isso reaproveita
 * o Drawer (bottom sheet) já existente no design system como menu hambúrguer.
 */
export function AdminMobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Abrir menu de navegação"
          className="-ml-2"
        >
          <Menu className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Menu</DrawerTitle>
        </DrawerHeader>
        <AdminNavLinks className="px-3 pb-6" onNavigate={() => setOpen(false)} />
      </DrawerContent>
    </Drawer>
  );
}
