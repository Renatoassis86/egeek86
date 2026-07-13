import { AppShell } from '@/components/layout/app-shell';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
