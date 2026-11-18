import 'server-only';
import { ImageResponse } from 'next/og';
import { STORE_PROFILES, loadLogo } from '@/server/messaging/store-profile-card';
import { loadFontsV2 } from '@/server/messaging/card-v2';
import { diagnosticoCurto, reais, tituloCurto, type JogoVitrine } from '@/lib/messaging/vitrine-games';

/**
 * CAPA da vitrine "Jogos até R$ 200" (dono, 2026-11-17): 1080x1350 (4:5), identidade do canal de games (roxo profundo, destaque violeta, cantos quadrados),
 * logo, título grande, hora da leitura e os 10 principais em grade 2x5 com foto real, plataforma, preço e diagnóstico curto. Só dado recebido; foto que
 * não carregar vira um bloco com a inicial (nada inventado). Preço e diagnóstico são os MESMOS da legenda.
 */
export const CAPA_W = 1080;
export const CAPA_H = 1350;
const G = STORE_PROFILES.games;
const OURO = '#D4AF37';
const TEXTO = '#F4EFFF';
const SEC = '#B9AEDB';

export async function renderCapaVitrine(top: readonly JogoVitrine[], hora: string, fotos: ReadonlyArray<string | null>): Promise<Buffer> {
  const logo = await loadLogo();
  const fonts = await loadFontsV2();
  const linhas: JogoVitrine[][] = [];
  for (let i = 0; i < top.length; i += 2) linhas.push(top.slice(i, i + 2));
  const res = new ImageResponse(
    (
      <div style={{ width: CAPA_W, height: CAPA_H, display: 'flex', flexDirection: 'column', background: `linear-gradient(160deg, #1D1338 0%, ${G.bg} 55%, #0B0714 100%)`, color: TEXTO, fontFamily: 'Inter, sans-serif', padding: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={246} height={91} alt="" style={{ width: 246, height: 91 }} />
          ) : (
            <div style={{ display: 'flex', fontSize: 34, color: OURO, fontWeight: 800 }}>ESPAÇO GEEK 86</div>
          )}
          <div style={{ display: 'flex', border: `2px solid ${G.accent}`, color: G.accent, fontSize: 24, fontWeight: 800, letterSpacing: 4, padding: '10px 22px' }}>GAMES</div>
        </div>
        <div style={{ display: 'flex', width: 120, height: 8, background: G.accent, marginTop: 26 }} />
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1.15, letterSpacing: -2, marginTop: 14 }}>Jogos até R$ 200</div>
        <div style={{ display: 'flex', fontSize: 28, color: SEC, marginTop: 30, fontWeight: 600 }}>Top {top.length} do catálogo · conferido às {hora}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30, flexGrow: 1, justifyContent: 'space-between' }}>
          {linhas.map((par, li) => (
            <div key={li} style={{ display: 'flex', justifyContent: 'space-between' }}>
              {par.map((j, ci) => {
                const idx = li * 2 + ci;
                const d = diagnosticoCurto(j);
                const foto = fotos[idx];
                return (
                  <div key={j.masterId} style={{ display: 'flex', width: 486, height: 186, background: '#1A1230', border: `2px solid ${G.edge}` }}>
                    <div style={{ display: 'flex', width: 186, height: 182, background: '#FFFFFF', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto} alt="" style={{ width: 186, height: 182, objectFit: 'contain' }} />
                      ) : (
                        <div style={{ display: 'flex', fontSize: 80, fontWeight: 800, color: G.accent }}>{(j.titulo.trim()[0] ?? '?').toUpperCase()}</div>
                      )}
                      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, background: G.accent, color: '#12091F', fontSize: 26, fontWeight: 800, width: 48, height: 44, alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '14px 16px', width: 296 }}>
                      <div style={{ display: 'flex', fontSize: 23, fontWeight: 800, lineHeight: 1.12 }}>{tituloCurto(j.titulo, 40)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', fontSize: 19, color: SEC, fontWeight: 600 }}>{j.plataforma}</div>
                        <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, color: OURO, letterSpacing: -1 }}>{reais(j.precoCentavos)}</div>
                        <div style={{ display: 'flex', fontSize: 17, fontWeight: 600, color: d.diagnostico ? '#7CE0A5' : SEC }}>{d.texto}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, fontSize: 22, color: SEC, fontWeight: 600 }}>
          <div style={{ display: 'flex' }}>egeek86.com</div>
          <div style={{ display: 'flex' }}>Atualizado a cada 30 min · diagnóstico só com histórico suficiente</div>
        </div>
      </div>
    ),
    { width: CAPA_W, height: CAPA_H, ...(fonts ? { fonts } : {}) },
  );
  return Buffer.from(await res.arrayBuffer());
}
