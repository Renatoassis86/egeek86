import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { profiles } from '@/db/schema';

/**
 * Callback do magic link (Supabase Auth). Não existe trigger `handle_new_user`
 * no banco (auth.users -> public.profiles) — o upsert abaixo é o que garante
 * que a linha em `profiles` existe no primeiro login.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await db
        .insert(profiles)
        .values({
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.email?.split('@')[0] ?? 'Usuário',
        })
        .onConflictDoNothing({ target: profiles.id });

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
