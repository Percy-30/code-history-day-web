interface EphemerisCardProps {
  text: string
  date: string
}

export function EphemerisCard({ text, date }: EphemerisCardProps) {
  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-gradient-to-br from-amber-950/40 to-orange-950/20 backdrop-blur-sm">
      {/* Glow accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/20 flex items-center justify-center text-xl">
            📅
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-400/80 text-[10px] font-semibold uppercase tracking-wider">
                Efeméride del día
              </span>
              <span className="text-white/30 text-[10px]">•</span>
              <span className="text-white/40 text-[10px] capitalize">{formattedDate}</span>
            </div>
            <p className="text-white/85 text-sm leading-relaxed">{text}</p>
          </div>
        </div>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
    </div>
  )
}
