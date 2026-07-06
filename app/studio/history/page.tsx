'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/studio/StatusBadge'
import type { DailyContent } from '@/lib/daily-content'

export default function HistoryPage() {
  const [history, setHistory] = useState<DailyContent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/daily-content?history=1&limit=60')
        if (!res.ok) throw new Error('Error al cargar el historial')
        const json = await res.json()
        setHistory(json.data ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Historial</h1>
        <p className="text-white/40 text-sm">Todos los contenidos generados</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="text-4xl">📭</div>
          <div className="text-white/60 font-medium">Sin historial aún</div>
          <p className="text-white/30 text-sm">
            Genera el primer contenido desde el{' '}
            <Link href="/studio" className="text-violet-400 hover:underline">
              Dashboard
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/6 bg-white/2 backdrop-blur-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-white/6 text-white/30 text-xs font-semibold uppercase tracking-wider">
            <span>Fecha</span>
            <span>Escenas</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-white/4">
            {history.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/3 transition-colors"
              >
                <div>
                  <div className="text-white/80 text-sm font-medium capitalize">
                    {formatDate(item.date)}
                  </div>
                  <div className="text-white/30 text-xs mt-0.5 truncate max-w-xs">
                    {item.ephemeris_text
                      ? item.ephemeris_text.substring(0, 80) + '...'
                      : '—'}
                  </div>
                </div>
                <div className="text-white/40 text-sm text-center">
                  {Array.isArray(item.scenes) ? item.scenes.length : '—'}
                </div>
                <StatusBadge status={item.status} />
                <Link
                  href={`/studio/history/${item.date}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-medium transition-all duration-200 border border-white/8 hover:border-white/20"
                >
                  Ver
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
