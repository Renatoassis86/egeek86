'use client';

// Último recurso: falha no layout raiz. Substitui o layout, por isso define
// <html>, <body> e estilos inline (sem depender de CSS, fontes ou providers).
export default function ErroGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B0908',
          color: '#F2E9D8',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <main style={{ maxWidth: 520 }}>
          <p style={{ margin: 0, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#E0A83B' }}>
            Espaço Geek 86
          </p>
          <h1 style={{ margin: '12px 0 0', fontSize: 28, lineHeight: 1.2 }}>O site não carregou agora.</h1>
          <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.5, opacity: 0.8 }}>
            Foi uma falha nossa, não sua. Tente de novo em instantes.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ minHeight: 44, padding: '0 20px', background: '#E0A83B', color: '#0B0908', border: 0, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
            >
              Tentar de novo
            </button>
            <a
              href="/"
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 20px', border: '1px solid #E0A83B', color: '#F2E9D8', fontSize: 16, textDecoration: 'none' }}
            >
              Voltar para a home
            </a>
          </div>
          {error.digest ? (
            <p style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>Código do erro: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
