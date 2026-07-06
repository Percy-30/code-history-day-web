'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setIsLoading(false)

    if (result?.error) {
      setError('Credenciales incorrectas. Inténtalo de nuevo.')
    } else {
      router.push('/studio')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#080b12] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-cyan-600/8 rounded-full blur-3xl" />
      </div>

      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-3xl mx-auto mb-4 shadow-xl shadow-violet-500/25">
              🎬
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Code History Daily</h1>
            <p className="text-white/40 text-sm">Panel de automatización</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-all duration-200"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-all duration-200"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/15 border border-red-500/25 text-red-300 text-xs">
                <span>⚠️</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              id="login-submit"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Solo el administrador tiene acceso a este panel.
        </p>
      </div>
    </div>
  )
}
