import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, type Profile } from '@/db/schema';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
    return profile ?? null;
  } catch (e) {
    console.error('Erro ao recuperar perfil do usuário:', e);
    return null;
  }
}

/**
 * Gate reutilizado pelo layout admin (redirect amigável) E por toda Server
 * Action de mutação do domínio Geek Deals — Server Actions são endpoints
 * públicos por padrão, não herdam a proteção da página que as invoca.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'super_admin') redirect('/');
  return profile;
}
