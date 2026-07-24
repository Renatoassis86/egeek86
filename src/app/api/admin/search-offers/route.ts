import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { searchOffersForAdmin } from '@/server/queries/affiliate';

export const dynamic = 'force-dynamic';

/**
 * Autocomplete do campo de busca/extração do painel admin — mostra o que já
 * está catalogado enquanto digita (ver searchOffersForAdmin).
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') ?? '';
  const items = await searchOffersForAdmin(q);
  return NextResponse.json({ items });
}
