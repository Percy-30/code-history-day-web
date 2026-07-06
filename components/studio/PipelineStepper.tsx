import type { ContentStatus } from '@/lib/daily-content'

interface PipelineStepperProps {
  status: ContentStatus
}

const STEPS: { key: ContentStatus; label: string; icon: string }[] = [
  { key: 'generando', label: 'Generando', icon: '⚙️' },
  { key: 'imagenes_listas', label: 'Imágenes', icon: '🎨' },
  { key: 'en_animacion', label: 'Animando', icon: '🎬' },
  { key: 'video_listo', label: 'Video', icon: '📹' },
  { key: 'publicado_youtube', label: 'YouTube', icon: '▶️' },
  { key: 'publicado_todo', label: 'Completo', icon: '✅' },
]

const STATUS_ORDER: Record<ContentStatus, number> = {
  generando: 0,
  imagenes_listas: 1,
  en_animacion: 2,
  video_listo: 3,
  publicado_youtube: 4,
  publicado_todo: 5,
}

export function PipelineStepper({ status }: PipelineStepperProps) {
  const currentIndex = STATUS_ORDER[status] ?? 0

  return (
    <div className="w-full">
      <div className="flex items-center justify-between relative">
        {/* Línea de fondo */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-white/10 z-0" />
        {/* Línea de progreso */}
        <div
          className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-violet-500 to-cyan-500 z-0 transition-all duration-700"
          style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex
          const isPending = index > currentIndex

          return (
            <div key={step.key} className="flex flex-col items-center gap-2 z-10">
              {/* Círculo */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold border-2 transition-all duration-500 ${
                  isDone
                    ? 'bg-violet-600 border-violet-400 shadow-lg shadow-violet-500/30'
                    : isCurrent
                    ? 'bg-cyan-500/30 border-cyan-400 shadow-lg shadow-cyan-500/40 ring-2 ring-cyan-400/30 animate-pulse'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                {isDone ? '✓' : step.icon}
              </div>
              {/* Label */}
              <span
                className={`text-[10px] font-medium text-center leading-tight ${
                  isDone
                    ? 'text-violet-300'
                    : isCurrent
                    ? 'text-cyan-300'
                    : 'text-white/30'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
