import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { OFFER_CARD_COLORS as C } from '@/lib/pricing/offer-card-model';

/**
 * Imagem de PERFIL de cada loja (canal do Telegram / grupo do WhatsApp). 1024x1024, identidade do site (fundo escuro, ouro, cantos
 * quadrados, logo). Todo o conteúdo fica dentro do círculo central, porque o Telegram e o WhatsApp recortam a foto em círculo.
 */
export const STORE_PROFILES: Record<string, { label: string; tagline: string }> = {
  games: { label: 'GAMES', tagline: 'Jogos e consoles' },
  'impressao-3d': { label: 'IMPRESSÃO 3D', tagline: 'Impressoras, filamentos e resinas' },
  tecnologia: { label: 'TECNOLOGIA', tagline: 'Hardware e periféricos' },
  livros: { label: 'LIVROS', tagline: 'Livros e coleções' },
  casa: { label: 'CASA', tagline: 'Eletrodomésticos' },
  eletronicos: { label: 'ELETRÔNICOS', tagline: 'Eletroeletrônicos' },
  esporte: { label: 'ESPORTE', tagline: 'Esporte e fitness' },
};

let logoUri: string | null = null;
async function loadLogo(): Promise<string | null> {
  if (logoUri) return logoUri;
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'geek 86.png'));
    logoUri = `data:image/png;base64,${buf.toString('base64')}`;
    return logoUri;
  } catch {
    return null;
  }
}

export async function renderStoreProfileCard(slug: string): Promise<Buffer | null> {
  const p = STORE_PROFILES[slug];
  if (!p) return null;
  const logo = await loadLogo();
  const size = 1024;
  const fontLabel = p.label.length > 11 ? 78 : 96;
  const res = new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', position: 'relative', background: C.canvas, color: C.text }}>
        <div style={{ position: 'absolute', display: 'flex', left: 92, top: 92, width: 840, height: 840, border: `2px solid ${C.grid}` }} />
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={420} height={156} alt="" style={{ position: 'absolute', left: 302, top: 214, width: 420, height: 156 }} />
        ) : (
          <div style={{ position: 'absolute', display: 'flex', left: 0, top: 260, width: size, justifyContent: 'center', fontSize: 54, color: C.gold }}>ESPAÇO GEEK 86</div>
        )}
        <div style={{ position: 'absolute', display: 'flex', left: 332, top: 428, width: 360, height: 6, background: C.gold }} />
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 468, width: size, justifyContent: 'center', fontSize: fontLabel, letterSpacing: 4, color: C.text }}>{p.label}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 592, width: size, justifyContent: 'center', fontSize: 34, color: C.gold }}>{p.tagline}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 690, width: size, justifyContent: 'center', fontSize: 28, color: C.secondary }}>Menor preço monitorado</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 762, width: size, justifyContent: 'center', fontSize: 26, color: C.secondary }}>egeek86.com</div>
      </div>
    ),
    { width: size, height: size }
  );
  return Buffer.from(await res.arrayBuffer());
}
