import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { coletarPopularidadeMl } from '@/server/collector/popularidade-ml';
import { verticalDaJanela } from '@/lib/popularidade/score';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Departamentos com fonte de "mais vendidos" do ML configurada (areas.ts). Um por janela de 30 min, em rodizio; `?v=` forca um (dry com `&dry=1`).
const VERTICAIS = ['games', 'tecnologia', 'eletroeletronicos', 'eletrodomesticos', 'esporte', 'livros'] as const;

export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;
  const v = request.nextUrl.searchParams.get('v') ?? verticalDaJanela(VERTICAIS);
  if (!v || !(VERTICAIS as readonly string[]).includes(v)) return NextResponse.json({ error: 'vertical_invalida' }, { status: 400 });
  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const t0 = Date.now();
  try {
    const r = await coletarPopularidadeMl(v, { dry });
    console.log('[popularidade]', JSON.stringify({ ...r, erros: r.erros.slice(0, 5) }));
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'erro';
    console.error('[popularidade] falhou:', msg);
    return NextResponse.json({ ok: false, vertical: v, erro: msg, ms: Date.now() - t0 }, { status: 500 });
  }
}
