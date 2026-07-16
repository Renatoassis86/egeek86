import { requireCustomer } from '@/lib/auth/require-customer';

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  await requireCustomer();
  return <>{children}</>;
}
