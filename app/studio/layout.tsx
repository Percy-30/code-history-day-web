'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/studio', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/studio/history', label: 'Historial', icon: '📋', exact: false },
  { href: '/studio/settings', label: 'Plataformas', icon: '📡', exact: false },
]

function NavLink({ href, icon, label, exact }: { href: string; icon: string; label: string; exact: boolean }) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
        isActive
          ? 'bg-white/10 text-white font-semibold shadow-sm'
          : 'text-white/50 hover:text-white hover:bg-white/6'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="font-medium">{label}</span>
      {isActive && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
      )}
    </Link>
  )
}

function PublishButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handlePublish = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/cron/publish', { method: 'GET' })
      const data = await res.json()
      setResult(data.published > 0 ? `✅ ${data.published} publicado(s)` : '⏳ Sin videos listos')
    } catch {
      setResult('❌ Error')
    } finally {
      setLoading(false)
      setTimeout(() => setResult(null), 4000)
    }
  }

  return (
    <button
      onClick={handlePublish}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 bg-gradient-to-r from-violet-600/80 to-cyan-600/80 hover:from-violet-500 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/20 disabled:opacity-50"
    >
      {loading ? (
        <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Publicando...</>
      ) : result ? result : (
        <><span>📤</span> Publicar ahora</>
      )}
    </button>
  )
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080b12] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/6 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-600/4 rounded-full blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-white/6 bg-white/2 backdrop-blur-md flex flex-col">
          {/* Logo */}
          <div className="px-6 py-6 border-b border-white/6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-lg shadow-lg shadow-violet-500/20">
                🎬
              </div>
              <div>
                <div className="text-sm font-bold text-white leading-tight">Code History</div>
                <div className="text-[10px] text-white/40 font-medium tracking-wider uppercase">Daily Studio</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <div className="px-3 mb-2 text-[10px] text-white/25 font-semibold uppercase tracking-widest">
              Contenido
            </div>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>

          {/* Publish button */}
          <div className="px-3 py-3 border-t border-white/6 space-y-3">
            <div className="px-1 text-[10px] text-white/25 font-semibold uppercase tracking-widest">
              Pipeline
            </div>
            <PublishButton />
          </div>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-white/6">
            <Link
              href="/"
              className="flex items-center gap-2 text-white/30 hover:text-white/60 text-xs transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver al sitio público
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto">
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
            rel="stylesheet"
          />
          {children}
        </main>
      </div>
    </div>
  )
}
