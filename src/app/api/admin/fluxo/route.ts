import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { carregarFluxo } from '@/server/queries/fluxo';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Mesmos blocos da página /admin/fluxo em JSON (só admin; cache de 15 s no servidor). Zero escrita. */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  const snap = await carregarFluxo();
  return NextResponse.json(snap, { headers: { 'Cache-Control': 'private, no-store' } });
}
