import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { OFFER_CARD_COLORS as C } from '@/lib/pricing/offer-card-model';

/**
 * Imagem de PERFIL de cada loja (canal do Telegram / grupo do WhatsApp). 1024x1024, identidade do site (fundo escuro, ouro, cantos
 * quadrados, logo). Todo o conteúdo fica dentro do círculo central, porque o Telegram e o WhatsApp recortam a foto em círculo.
 */
export const STORE_PROFILES: Record<string, { label: string; tagline: string; bg: string; accent: string; edge: string }> = {
  // Base sempre escura (identidade do site); só o matiz e o destaque mudam por loja, em tons próximos (dono, 2026-11-11).
  comunidade: { label: 'COMUNIDADE', tagline: 'Menor preço monitorado', bg: '#0B0908', accent: '#D4AF37', edge: '#2A241E' },
  games: { label: 'GAMES', tagline: 'Jogos e consoles', bg: '#150E24', accent: '#A87BFF', edge: '#2E2150' },
  'impressao-3d': { label: 'IMPRESSÃO 3D', tagline: 'Impressoras, filamentos e resinas', bg: '#0A1A22', accent: '#3FC1E8', edge: '#16384A' },
  tecnologia: { label: 'TECNOLOGIA', tagline: 'Hardware e periféricos', bg: '#0A1330', accent: '#5B93FF', edge: '#1B2C5C' },
  livros: { label: 'LIVROS', tagline: 'Livros e coleções', bg: '#1C0E14', accent: '#E0708A', edge: '#40202C' },
  casa: { label: 'CASA', tagline: 'Eletrodomésticos', bg: '#0C1A14', accent: '#4FD08F', edge: '#1B3A2B' },
  eletronicos: { label: 'ELETRÔNICOS', tagline: 'Eletroeletrônicos', bg: '#091C1C', accent: '#33D6C6', edge: '#17403F' },
  esporte: { label: 'ESPORTE', tagline: 'Esporte e fitness', bg: '#1E1109', accent: '#FF9242', edge: '#43260F' },
};

let logoUri: string | null = null;
export async function loadLogo(): Promise<string | null> {
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
      <div style={{ width: size, height: size, display: 'flex', position: 'relative', background: p.bg, color: C.text }}>
        <div style={{ position: 'absolute', display: 'flex', left: 92, top: 92, width: 840, height: 840, border: `2px solid ${p.edge}` }} />
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={420} height={156} alt="" style={{ position: 'absolute', left: 302, top: 214, width: 420, height: 156 }} />
        ) : (
          <div style={{ position: 'absolute', display: 'flex', left: 0, top: 260, width: size, justifyContent: 'center', fontSize: 54, color: C.gold }}>ESPAÇO GEEK 86</div>
        )}
        <div style={{ position: 'absolute', display: 'flex', left: 332, top: 428, width: 360, height: 6, background: p.accent }} />
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 468, width: size, justifyContent: 'center', fontSize: fontLabel, letterSpacing: 4, color: C.text }}>{p.label}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 592, width: size, justifyContent: 'center', fontSize: 34, color: p.accent }}>{p.tagline}</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 690, width: size, justifyContent: 'center', fontSize: 28, color: C.secondary }}>Menor preço monitorado</div>
        <div style={{ position: 'absolute', display: 'flex', left: 0, top: 762, width: size, justifyContent: 'center', fontSize: 26, color: C.secondary }}>egeek86.com</div>
      </div>
    ),
    { width: size, height: size }
  );
  return Buffer.from(await res.arrayBuffer());
}
