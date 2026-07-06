'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SceneCard } from '@/components/studio/SceneCard'
import { EphemerisCard } from '@/components/studio/EphemerisCard'
import { StatusBadge } from '@/components/studio/StatusBadge'
import { PipelineStepper } from '@/components/studio/PipelineStepper'
import type { DailyContent } from '@/lib/daily-content'

export default function HistoryDetailPage() {
  const { date } = useParams<{ date: string }>()
  const [content, setContent] = useState<DailyContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/daily-content?date=${date}`)
        if (res.status === 404) {
          setError('No se encontró contenido para esta fecha.')
          return
        }
        if (!res.ok) throw new Error('Error al cargar')
        const json = await res.json()
        setContent(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setIsLoading(false)
      }
    }
    if (date) load()
  }, [date])

  const formattedDate = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : ''

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/studio/history"
          className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Historial
        </Link>
        <div className="text-white/20">/</div>
        <div>
          <h1 className="text-xl font-bold text-white capitalize">{formattedDate}</h1>
          {content && (
            <div className="mt-1">
              <StatusBadge status={content.status} />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-16 rounded-2xl bg-white/5" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-96 rounded-2xl bg-white/5" />)}
          </div>
        </div>
      )}

      {!isLoading && content && (
        <div className="space-y-6">
          <EphemerisCard text={content.ephemeris_text} date={content.date} />

          {/* Pipeline */}
          <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm p-5">
            <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-4">Estado del pipeline</div>
            <PipelineStepper status={content.status} />
          </div>

          {/* Escenas */}
          {content.scenes && content.scenes.length > 0 && (
            <div>
              <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-4">
                🎨 Escenas ({content.scenes.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {content.scenes.map((scene, index) => (
                  <SceneCard key={index} scene={scene} index={index} />
                ))}
              </div>
            </div>
          )}

          {/* Links */}
          {(content.drive_video_url || content.youtube_video_id) && (
            <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm p-5 space-y-3">
              <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">🔗 Links</div>
              {content.drive_video_url && (
                <a href={content.drive_video_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors">
                  📁 Video en Drive
                </a>
              )}
              {content.youtube_video_id && (
                <a href={`https://youtube.com/watch?v=${content.youtube_video_id}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-red-300 hover:text-red-200 transition-colors">
                  ▶️ Ver en YouTube
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
