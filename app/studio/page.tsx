'use client'

import { useState, useEffect, useCallback } from 'react'
import { SceneCard } from '@/components/studio/SceneCard'
import { PipelineStepper } from '@/components/studio/PipelineStepper'
import { EphemerisCard } from '@/components/studio/EphemerisCard'
import { StatusBadge } from '@/components/studio/StatusBadge'
import type { DailyContent } from '@/lib/daily-content'

export default function StudioDashboard() {
  const [content, setContent] = useState<DailyContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [platforms, setPlatforms] = useState<{ tiktok: boolean; facebook: boolean }>({
    tiktok: false,
    facebook: false,
  })

  const today = new Date().toLocaleDateString('es-PE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Lima',
  })

  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

  const fetchContent = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`/api/daily-content?date=${todayISO}`)
      if (res.status === 404) {
        setContent(null)
        return
      }
      if (!res.ok) throw new Error('Error al cargar el contenido')
      const json = await res.json()
      setContent(json.data)

      // Cargar publicaciones de plataformas
      if (json.data?.id) {
        const pubRes = await fetch(`/api/platform-publications?daily_content_id=${json.data.id}`)
        if (pubRes.ok) {
          const pubJson = await pubRes.json()
          const pubs = pubJson.data ?? []
          setPlatforms({
            tiktok: pubs.find((p: { platform: string }) => p.platform === 'tiktok')?.published ?? false,
            facebook: pubs.find((p: { platform: string }) => p.platform === 'facebook')?.published ?? false,
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [todayISO])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/cron/generate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al generar')
      await fetchContent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar el contenido')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlatformToggle = async (platform: 'tiktok' | 'facebook') => {
    if (!content) return
    const newValue = !platforms[platform]
    setPlatforms((p) => ({ ...p, [platform]: newValue }))

    await fetch('/api/platform-publications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daily_content_id: content.id,
        platform,
        published: newValue,
      }),
    })

    // Si ambas plataformas + YouTube publicados → actualizar status
    if (newValue && content.youtube_video_id) {
      const otherPlatform = platform === 'tiktok' ? 'facebook' : 'tiktok'
      if (platforms[otherPlatform]) {
        await fetch(`/api/daily-content/${content.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'publicado_todo' }),
        })
        await fetchContent()
      }
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-white/40 text-sm capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          {content && <StatusBadge status={content.status} />}
          <button
            id="btn-generate"
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <span>⚡</span>
                {content ? 'Regenerar' : 'Generar ahora'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          <span className="text-base">⚠️</span>
          <div>
            <div className="font-medium">Error</div>
            <div className="text-red-400/70 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-16 rounded-2xl bg-white/5" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-96 rounded-2xl bg-white/5" />
            <div className="h-96 rounded-2xl bg-white/5" />
            <div className="h-96 rounded-2xl bg-white/5" />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !content && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl">
            🎬
          </div>
          <div>
            <div className="text-white/80 font-semibold text-lg mb-1">
              Sin contenido para hoy
            </div>
            <p className="text-white/40 text-sm max-w-xs">
              Pulsa «Generar ahora» para que el sistema cree el guion, prompts e imágenes del día.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-violet-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando...
              </>
            ) : (
              '⚡ Generar contenido del día'
            )}
          </button>
        </div>
      )}

      {/* Content loaded */}
      {!isLoading && content && (
        <div className="space-y-6">
          {/* Efeméride */}
          <EphemerisCard text={content.ephemeris_text} date={content.date} />

          {/* Pipeline stepper */}
          <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm p-5">
            <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-4">
              Estado del pipeline
            </div>
            <PipelineStepper status={content.status} />
          </div>

          {/* Video script info */}
          {content.video_script && (
            <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm p-5">
              <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">
                🎥 Guion del video
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-white/60">
                  <span className="text-white/30">Formato:</span>
                  <span className="font-mono bg-white/8 px-2 py-0.5 rounded text-xs">
                    {(content.video_script as { format?: string }).format ?? '9:16'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <span className="text-white/30">Duración:</span>
                  <span className="font-mono bg-white/8 px-2 py-0.5 rounded text-xs">
                    {(content.video_script as { duration_seconds?: number }).duration_seconds ?? 90}s
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <span className="text-white/30">Tono:</span>
                  <span className="text-white/80 text-xs italic">
                    {(content.video_script as { tone?: string }).tone ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Escenas */}
          {content.scenes && content.scenes.length > 0 && (
            <div>
              <div className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-4">
                🎨 Escenas generadas ({content.scenes.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {content.scenes.map((scene, index) => (
                  <SceneCard key={index} scene={scene} index={index} />
                ))}
              </div>
            </div>
          )}

          {/* Links y publicación manual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Links de Drive y YouTube */}
            <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm p-5 space-y-3">
              <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                🔗 Links
              </div>
              {content.drive_folder_id ? (
                <a
                  href={`https://drive.google.com/drive/folders/${content.drive_folder_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors"
                >
                  <span>📁</span> Carpeta en Drive
                </a>
              ) : (
                <div className="text-white/20 text-sm">📁 Drive — Pendiente (Fase 2)</div>
              )}
              {content.youtube_video_id ? (
                <a
                  href={`https://youtube.com/watch?v=${content.youtube_video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-red-300 hover:text-red-200 transition-colors"
                >
                  <span>▶️</span> Ver en YouTube
                </a>
              ) : (
                <div className="text-white/20 text-sm">▶️ YouTube — Pendiente (Fase 3)</div>
              )}
            </div>

            {/* Publicación manual TikTok / Facebook */}
            <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm p-5 space-y-3">
              <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                📱 Publicación manual
              </div>
              <div className="space-y-2">
                {(['tiktok', 'facebook'] as const).map((platform) => (
                  <label
                    key={platform}
                    htmlFor={`check-${platform}`}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <input
                      id={`check-${platform}`}
                      type="checkbox"
                      checked={platforms[platform]}
                      onChange={() => handlePlatformToggle(platform)}
                      className="w-4 h-4 rounded accent-violet-500"
                    />
                    <span className={`text-sm transition-colors ${platforms[platform] ? 'text-green-300' : 'text-white/50 group-hover:text-white/70'}`}>
                      {platform === 'tiktok' ? '🎵 Publicado en TikTok' : '📘 Publicado en Facebook'}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-white/20 text-xs">
                Marca cuando hayas publicado manualmente en cada plataforma.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
