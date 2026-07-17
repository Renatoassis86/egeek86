import { cn } from '@/lib/cn';

export type LetterGlyph = 'E' | 'G' | '8' | '6';

const VIEWBOX: Record<LetterGlyph, string> = {
  E: '0 0 200 240',
  G: '0 0 200 240',
  '8': '0 0 160 240',
  '6': '0 0 160 240',
};

/**
 * Formas geométricas cruas (retângulos arredondados) que compõem cada glifo.
 * Não é uma fonte real — é uma interpretação bold/geométrica das letras/
 * números "E G 8 6" (iniciais + número da marca), pensada pro tratamento
 * "imagem dentro da letra" pedido pelo cliente. `fill="#000"` = furo (usado
 * nos anéis do 8/6), qualquer outra cor = área sólida do glifo.
 */
function glyphRects(letter: LetterGlyph): { x: number; y: number; w: number; h: number; rx: number; hole?: boolean }[] {
  switch (letter) {
    case 'E':
      return [
        { x: 0, y: 0, w: 54, h: 240, rx: 10 },
        { x: 0, y: 0, w: 200, h: 54, rx: 10 },
        { x: 0, y: 93, w: 160, h: 54, rx: 10 },
        { x: 0, y: 186, w: 200, h: 54, rx: 10 },
      ];
    case 'G':
      return [
        { x: 0, y: 0, w: 200, h: 50, rx: 16 },
        { x: 0, y: 0, w: 50, h: 240, rx: 16 },
        { x: 0, y: 190, w: 200, h: 50, rx: 16 },
        { x: 150, y: 110, w: 50, h: 130, rx: 16 },
        { x: 100, y: 110, w: 100, h: 50, rx: 16 },
      ];
    case '8':
      return [
        { x: 10, y: 6, w: 140, h: 112, rx: 40 },
        { x: 34, y: 28, w: 92, h: 68, rx: 26, hole: true },
        { x: 4, y: 118, w: 152, h: 118, rx: 44 },
        { x: 30, y: 142, w: 100, h: 72, rx: 28, hole: true },
      ];
    case '6':
      return [
        { x: 70, y: 0, w: 50, h: 54, rx: 16 },
        { x: 6, y: 0, w: 54, h: 150, rx: 16 },
        { x: 6, y: 118, w: 148, h: 118, rx: 44 },
        { x: 32, y: 142, w: 96, h: 70, rx: 26, hole: true },
      ];
  }
}

/**
 * LetterMask — recorta uma imagem dentro de uma interpretação geométrica/
 * blocada de E, G, 8 ou 6 (iniciais + número de "Espaço Geek 86"), com um
 * traço dourado contornando o glifo. Tudo em SVG puro (clipPath + <image>),
 * então escala fluido em qualquer viewport sem distorcer — o tamanho é
 * controlado 100% pelo container via `className` (ex: "w-40 lg:w-64").
 *
 * Usa <image> em vez de next/image de propósito: é uma técnica de máscara
 * (mesma exceção documentada pro clip-path/background), não uma foto de
 * produto — não precisa de otimização/srcset do Next aqui.
 */
export function LetterMask({
  id,
  letter,
  src,
  alt = '',
  className,
  tint = true,
  outline = true,
}: {
  id: string;
  letter: LetterGlyph;
  src: string;
  alt?: string;
  className?: string;
  tint?: boolean;
  outline?: boolean;
}) {
  const clipId = `lm-clip-${id}`;
  const rects = glyphRects(letter);
  const viewBox = VIEWBOX[letter];
  const [, , vbW, vbH] = viewBox.split(' ').map(Number);

  return (
    <div className={cn('relative', className)} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={!alt}>
      <svg viewBox={viewBox} className="size-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            {rects
              .filter((r) => !r.hole)
              .map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx} />
              ))}
          </clipPath>
          <mask id={`${clipId}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={vbW} height={vbH}>
            {rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx} fill={r.hole ? '#000' : '#fff'} />
            ))}
          </mask>
        </defs>

        <g mask={`url(#${clipId}-mask)`}>
          <image
            href={src}
            x={0}
            y={0}
            width={vbW}
            height={vbH}
            preserveAspectRatio="xMidYMid slice"
          />
          {tint && (
            <rect
              x={0}
              y={0}
              width={vbW}
              height={vbH}
              fill="var(--color-accent-primary)"
              opacity={0.1}
            />
          )}
          <rect
            x={0}
            y={0}
            width={vbW}
            height={vbH}
            fill="url(#lm-scrim)"
          />
        </g>

        <linearGradient id="lm-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>

        {outline && (
          <g fill="none" stroke="var(--color-accent-primary)" strokeOpacity="0.85" strokeWidth={3}>
            {rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx} />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
