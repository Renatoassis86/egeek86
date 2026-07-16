import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from './require-admin';
import type { Profile } from '@/db/schema';

/**
 * Gate pra /conta/** e Server Actions de watch/preferências — qualquer
 * profile autenticado serve (sem checar role, diferente de requireAdmin):
 * todo profile já nasce com role 'customer', e mesmo staff/admin deve poder
 * usar a área de cliente normalmente.
 */
export async function requireCustomer(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/entrar');
  return profile;
}
