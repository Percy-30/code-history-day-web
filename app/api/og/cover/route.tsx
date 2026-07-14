import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // Leer parámetros de la URL
    const dateStr = searchParams.get('date') || '6 de julio de 2026'
    const title = searchParams.get('title') || 'CodeHistory Daily'
    const subtitle = searchParams.get('subtitle') || 'Descubre la historia de la programación día a día'
    const ephemerisDate = searchParams.get('ephemerisDate') || '6 de julio de 1995'
    const ephemerisTitle = searchParams.get('ephemerisTitle') || 'IBM compra Lotus'
    const ephemerisDesc = searchParams.get('ephemerisDesc') || 'La mayor adquisición de una empresa de software'
    
    // Fallback background image (placeholder) si no se provee
    const bgUrl = searchParams.get('bg_url') || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80'

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontFamily: 'sans-serif',
            color: 'white',
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            position: 'relative',
          }}
        >
          {/* Capa de overlay oscuro para mejorar la legibilidad */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backgroundImage: 'linear-gradient(to bottom, rgba(0, 10, 30, 0.8), rgba(0, 20, 50, 0.6))',
            }}
          />

          {/* Contenido Principal (con z-index por así decirlo, aunque Satori usa orden de renderizado) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              padding: '40px 60px',
            }}
          >
            {/* Header / Terminal */}
            <div style={{ display: 'flex', marginBottom: '40px' }}>
              <div
                style={{
                  display: 'flex',
                  color: '#4ade80', // Verde terminal
                  fontSize: '24px',
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                  textShadow: '0 0 10px rgba(74, 222, 128, 0.5)',
                }}
              >
                user@atpdev:~$ ./code-history --day
              </div>
            </div>

            {/* Título y Subtítulo de la marca */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                marginBottom: '40px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '100px',
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                  textShadow: '0px 4px 20px rgba(255, 255, 255, 0.3), 0px 8px 40px rgba(59, 130, 246, 0.5)',
                  marginBottom: '10px',
                }}
              >
                {title}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '36px',
                  fontWeight: 600,
                  color: '#fbbf24', // Amarillo/naranja suave
                  textShadow: '0px 2px 10px rgba(251, 191, 36, 0.4)',
                }}
              >
                {subtitle}
              </div>
            </div>

            {/* Bloque central de Efeméride */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                flexGrow: 1,
                marginLeft: '30px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '28px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: '#fbbf24',
                  marginBottom: '15px',
                }}
              >
                EFEMÉRIDE DEL DÍA
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '64px',
                  fontWeight: 800,
                  color: '#fbbf24',
                  marginBottom: '10px',
                  textShadow: '0px 4px 15px rgba(251, 191, 36, 0.3)',
                }}
              >
                {ephemerisDate}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '48px',
                  fontWeight: 800,
                  color: '#ffffff',
                  marginBottom: '15px',
                  textShadow: '0px 4px 20px rgba(0, 0, 0, 0.8)',
                  lineHeight: 1.2,
                }}
              >
                {ephemerisTitle}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '28px',
                  fontWeight: 500,
                  color: '#6ee7b7', // Verde esmeralda claro
                  textShadow: '0px 2px 10px rgba(0, 0, 0, 0.8)',
                  lineHeight: 1.3,
                  maxWidth: '900px',
                }}
              >
                {ephemerisDesc}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '2px solid rgba(255, 255, 255, 0.1)',
                paddingTop: '20px',
                marginTop: '30px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: '#9ca3af',
                }}
              >
                <span style={{ color: '#4ade80', marginRight: '8px' }}>Fecha actual:</span> {dateStr}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: '#9ca3af',
                }}
              >
                © 2026 Desarrollado POR ATP DEV | v0.1.0
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (e: any) {
    console.error('Error generating cover image:', e)
    return new Response('Failed to generate cover image', { status: 500 })
  }
}
