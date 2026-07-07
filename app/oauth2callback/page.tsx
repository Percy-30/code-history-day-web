'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function CallbackContent() {
  const searchParams = useSearchParams()
  const [copied, setCopied] = useState(false)

  const accessToken = searchParams.get('access_token')
  const openId = searchParams.get('open_id')
  const error = searchParams.get('error')
  const desc = searchParams.get('desc')

  const copyToken = () => {
    if (accessToken) {
      navigator.clipboard.writeText(accessToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Si tenemos token, redirigir automáticamente al studio después de 5 segundos
  useEffect(() => {
    if (accessToken) {
      const timer = setTimeout(() => {
        window.location.href = '/studio/settings'
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [accessToken])

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a0a1a 100%)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '600px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Logo TikTok */}
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {accessToken ? '🎵' : '❌'}
        </div>

        {accessToken ? (
          <>
            <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
              ¡Autorización Exitosa!
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '32px' }}>
              Tu cuenta de TikTok está conectada. Copia el token y pégalo en el panel de Studio.
            </p>

            {/* Access Token */}
            <div style={{ textAlign: 'left', marginBottom: '24px' }}>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>
                ACCESS TOKEN
              </label>
              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <code
                  style={{
                    color: '#a78bfa',
                    fontSize: '12px',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {accessToken}
                </code>
                <button
                  onClick={copyToken}
                  style={{
                    background: copied ? '#10b981' : '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s',
                  }}
                >
                  {copied ? '✅ Copiado' : '📋 Copiar'}
                </button>
              </div>
            </div>

            {openId && (
              <div style={{ textAlign: 'left', marginBottom: '24px' }}>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>
                  OPEN ID (Tu ID de usuario TikTok)
                </label>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginTop: '8px',
                  }}
                >
                  <code style={{ color: '#34d399', fontSize: '12px' }}>{openId}</code>
                </div>
              </div>
            )}

            <div
              style={{
                background: 'rgba(124, 58, 237, 0.1)',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: 0 }}>
                📋 <strong>Pasos:</strong>
                <br />1. Copia el Access Token de arriba.
                <br />2. Ve a <strong>Studio → Plataformas</strong>.
                <br />3. Pégalo en el campo "Access Token" de TikTok.
                <br />4. Dale a <strong>Guardar configuración</strong>.
              </p>
            </div>

            <a
              href="/studio/settings"
              style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                color: '#fff',
                textDecoration: 'none',
                padding: '12px 32px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Ir al Panel de Studio →
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '12px' }}>
              Redirigiendo automáticamente en 8 segundos...
            </p>
          </>
        ) : (
          <>
            <h1 style={{ color: '#ef4444', fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
              Error de Autorización
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>
              {desc || error || 'Ocurrió un error al conectar con TikTok.'}
            </p>
            <a
              href="/studio/settings"
              style={{
                display: 'inline-block',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                textDecoration: 'none',
                padding: '12px 32px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Volver al Panel →
            </a>
          </>
        )}
      </div>
    </main>
  )
}

export default function OAuth2CallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a1a', color: '#fff' }}>
        Procesando autorización...
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
