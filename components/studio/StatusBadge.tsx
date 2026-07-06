import type { ContentStatus } from '@/lib/daily-content'

interface StatusBadgeProps {
  status: ContentStatus
  className?: string
}

const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; dot: string }> = {
  generando: {
    label: 'Generando...',
    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    dot: 'bg-yellow-400 animate-pulse',
  },
  imagenes_listas: {
    label: 'Imágenes listas',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
  },
  en_animacion: {
    label: 'En animación',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400 animate-pulse',
  },
  video_listo: {
    label: 'Video listo',
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
  },
  publicado_youtube: {
    label: 'En YouTube',
    color: 'bg-red-500/20 text-red-300 border-red-500/30',
    dot: 'bg-red-400',
  },
  publicado_todo: {
    label: '✅ Publicado todo',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
    dot: 'bg-green-400',
  },
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['generando']
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
