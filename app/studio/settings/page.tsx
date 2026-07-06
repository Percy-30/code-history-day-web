'use client'

import { useState, useEffect, useCallback } from 'react'

interface PlatformSetting {
  platform: string
  enabled: boolean
  privacy: string
  access_token?: string
  channel_id?: string
  page_id?: string
  extra_config?: Record<string, string>
}

interface PlatformConfig {
  id: string
  name: string
  icon: string
  color: string
  privacyOptions: { value: string; label: string; icon: string }[]
  fields: { key: keyof PlatformSetting; label: string; placeholder: string; type?: string }[]
  docUrl: string
  description: string
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: '▶️',
    color: 'red',
    privacyOptions: [
      { value: 'public', label: 'Público', icon: '🌐' },
      { value: 'unlisted', label: 'Oculto', icon: '🔗' },
      { value: 'private', label: 'Privado', icon: '🔒' },
    ],
    fields: [
      { key: 'channel_id', label: 'Channel ID', placeholder: 'UCxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    docUrl: 'https://console.cloud.google.com',
    description: 'Usa el mismo OAuth de Google que ya configuraste (Drive/Calendar). No necesitas access_token separado.',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    color: 'pink',
    privacyOptions: [
      { value: 'public', label: 'Público', icon: '🌐' },
      { value: 'friends', label: 'Solo amigos', icon: '👥' },
      { value: 'private', label: 'Solo yo', icon: '🔒' },
    ],
    fields: [
      { key: 'access_token', label: 'Access Token', placeholder: 'act.XXXXXXX...', type: 'password' },
    ],
    docUrl: 'https://developers.tiktok.com',
    description: 'Genera un access_token con scope video.upload desde TikTok Developer Portal.',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: '📘',
    color: 'blue',
    privacyOptions: [
      { value: 'public', label: 'Todo el mundo', icon: '🌐' },
      { value: 'friends', label: 'Amigos', icon: '👥' },
      { value: 'private', label: 'Solo yo', icon: '🔒' },
    ],
    fields: [
      { key: 'page_id', label: 'Page ID', placeholder: '123456789012345' },
      { key: 'access_token', label: 'Page Access Token', placeholder: 'EAAxxxxxxxx...', type: 'password' },
    ],
    docUrl: 'https://developers.facebook.com/tools/explorer',
    description: 'Necesitas un Page Access Token con permisos pages_manage_posts y pages_read_engagement.',
  },
]

const CRON_JOBS = [
  {
    path: '/api/cron/generate',
    schedule: '0 11 * * *',
    description: 'Genera guion, 25 imágenes y sube a Drive (11:00 UTC = 6:00 AM Perú)',
    phase: 1,
    active: true,
  },
  {
    path: '/api/cron/check-drive',
    schedule: '*/30 * * * *',
    description: 'Detecta si subiste el video final a Drive y crea evento en Calendar',
    phase: 2,
    active: true,
  },
  {
    path: '/api/cron/publish',
    schedule: '*/30 * * * *',
    description: 'Publica automáticamente en YouTube, TikTok y Facebook',
    phase: 3,
    active: true,
  },
]

const colorMap: Record<string, string> = {
  red: 'border-red-500/30 bg-red-500/5',
  pink: 'border-pink-500/30 bg-pink-500/5',
  blue: 'border-blue-500/30 bg-blue-500/5',
}
const badgeMap: Record<string, string> = {
  red: 'bg-red-500/20 text-red-300 border-red-500/30',
  pink: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
}
const toggleMap: Record<string, string> = {
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  blue: 'bg-blue-500',
}

function Toggle({ enabled, color, onToggle }: { enabled: boolean; color: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none ${
        enabled ? toggleMap[color] : 'bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, PlatformSetting>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [showToken, setShowToken] = useState<Record<string, boolean>>({})

  // Cargar configuraciones al montar
  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/platforms/settings')
    if (res.ok) {
      const data = await res.json()
      const map: Record<string, PlatformSetting> = {}
      for (const s of data.settings ?? []) {
        map[s.platform] = s
      }
      setSettings(map)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const updateField = (platform: string, key: keyof PlatformSetting, value: unknown) => {
    setSettings(prev => ({
      ...prev,
      [platform]: { ...(prev[platform] ?? { platform, enabled: false, privacy: 'private' }), [key]: value }
    }))
  }

  const savePlatform = async (platform: string) => {
    setSaving(platform)
    const setting = settings[platform] ?? { platform, enabled: false, privacy: 'private' }
    try {
      const res = await fetch('/api/platforms/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...setting, platform }),
      })
      if (res.ok) {
        setSaved(platform)
        setTimeout(() => setSaved(null), 2500)
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Configuración de Publicación</h1>
        <p className="text-white/40 text-sm">
          Activa y configura cada plataforma. El cron job publicará automáticamente cuando el video esté listo.
        </p>
      </div>

      {/* Plataformas */}
      <div className="space-y-5">
        <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">
          📡 Plataformas de Publicación
        </div>

        {PLATFORMS.map((platform) => {
          const s = settings[platform.id] ?? { platform: platform.id, enabled: false, privacy: 'private' }
          const isSaving = saving === platform.id
          const isSaved = saved === platform.id

          return (
            <div
              key={platform.id}
              className={`rounded-2xl border backdrop-blur-sm overflow-hidden transition-all duration-300 ${colorMap[platform.color]} ${
                s.enabled ? 'shadow-lg' : 'opacity-70'
              }`}
            >
              {/* Header de la plataforma */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{platform.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-base">{platform.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badgeMap[platform.color]}`}>
                        Fase 3
                      </span>
                      {s.enabled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/20 font-medium">
                          Activo
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-xs mt-0.5">{platform.description}</p>
                  </div>
                </div>
                <Toggle
                  enabled={s.enabled}
                  color={platform.color}
                  onToggle={() => updateField(platform.id, 'enabled', !s.enabled)}
                />
              </div>

              {/* Configuración */}
              <div className="px-5 py-4 space-y-4">
                {/* Privacidad */}
                <div>
                  <label className="text-white/50 text-xs font-semibold uppercase tracking-wider block mb-2">
                    🔐 Privacidad al publicar
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {platform.privacyOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateField(platform.id, 'privacy', opt.value)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                          s.privacy === opt.value
                            ? `${badgeMap[platform.color]} border-current shadow-md scale-105`
                            : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80'
                        }`}
                      >
                        <span>{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campos de autenticación */}
                <div className="grid gap-3">
                  {platform.fields.map((field) => (
                    <div key={String(field.key)}>
                      <label className="text-white/50 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                        {field.label}
                      </label>
                      <div className="relative">
                        <input
                          type={field.type === 'password' && !showToken[`${platform.id}_${String(field.key)}`] ? 'password' : 'text'}
                          value={(s[field.key] as string) ?? ''}
                          onChange={(e) => updateField(platform.id, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors pr-10 font-mono"
                        />
                        {field.type === 'password' && (
                          <button
                            onClick={() => setShowToken(prev => ({
                              ...prev,
                              [`${platform.id}_${String(field.key)}`]: !prev[`${platform.id}_${String(field.key)}`]
                            }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-sm"
                          >
                            {showToken[`${platform.id}_${String(field.key)}`] ? '🙈' : '👁️'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botones */}
                <div className="flex items-center justify-between pt-1">
                  <a
                    href={platform.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-2"
                  >
                    📄 Ver documentación →
                  </a>
                  <button
                    onClick={() => savePlatform(platform.id)}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isSaved
                        ? 'bg-green-500/20 text-green-300 border border-green-400/30'
                        : `${badgeMap[platform.color]} hover:scale-105 border active:scale-95`
                    }`}
                  >
                    {isSaving ? (
                      <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Guardando...</>
                    ) : isSaved ? (
                      <>✅ Guardado</>
                    ) : (
                      <>💾 Guardar configuración</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cron Jobs */}
      <div className="space-y-4">
        <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">
          ⏰ Pipeline Automático (Cron Jobs)
        </div>
        <div className="rounded-2xl border border-white/6 bg-white/3 backdrop-blur-sm overflow-hidden">
          <div className="divide-y divide-white/5">
            {CRON_JOBS.map((cron, i) => (
              <div key={cron.path} className="px-5 py-4 flex items-center gap-4">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  cron.active ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/30'
                }`}>
                  {cron.phase}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded truncate">
                      {cron.path}
                    </span>
                    <span className="text-[10px] text-white/30 font-mono flex-shrink-0">{cron.schedule}</span>
                  </div>
                  <p className="text-white/50 text-xs">{cron.description}</p>
                </div>
                <span className={`text-xs flex-shrink-0 px-2 py-1 rounded-lg border ${
                  cron.active
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-white/5 text-white/30 border-white/10'
                }`}>
                  {cron.active ? '✅ Activo' : '⏸️ Paused'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SQL Helper */}
      <div className="space-y-4">
        <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">
          🗄️ SQL — Tabla platform_settings (ejecutar en Supabase si no existe)
        </div>
        <div className="rounded-2xl border border-white/6 bg-black/30 overflow-hidden">
          <pre className="p-5 text-xs text-green-400/80 overflow-x-auto leading-relaxed whitespace-pre-wrap font-mono">
{`CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL UNIQUE,
  enabled boolean DEFAULT false,
  privacy text DEFAULT 'private',
  access_token text,
  channel_id text,
  page_id text,
  extra_config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);`}
          </pre>
        </div>
      </div>
    </div>
  )
}
