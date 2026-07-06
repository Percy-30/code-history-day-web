'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { Scene } from '@/lib/daily-content'

interface SceneCardProps {
  scene: Scene
  index: number
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        copied
          ? 'bg-green-500/30 text-green-300 border border-green-400/40'
          : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 hover:border-white/20'
      }`}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copiado
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}

export function SceneCard({ scene, index }: SceneCardProps) {
  const sceneColors = [
    { border: 'border-violet-500/30', badge: 'bg-violet-500/20 text-violet-300', glow: 'shadow-violet-500/10' },
    { border: 'border-cyan-500/30', badge: 'bg-cyan-500/20 text-cyan-300', glow: 'shadow-cyan-500/10' },
    { border: 'border-pink-500/30', badge: 'bg-pink-500/20 text-pink-300', glow: 'shadow-pink-500/10' },
  ]
  const color = sceneColors[index % 3]

  const frames = scene.frames && scene.frames.length > 0 
    ? scene.frames 
    : [{
        frame_prompt: scene.image_prompt || '',
        animation_prompt: scene.animation_prompt || '',
        image_url: scene.image_url
      }]

  return (
    <div className={`rounded-2xl border ${color.border} bg-white/3 backdrop-blur-sm shadow-xl ${color.glow} overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${color.badge}`}>
            Escena {index + 1}
          </span>
          <span className="text-white/40 text-xs">{scene.time_range}</span>
        </div>
        <span className="text-white/60 text-sm font-medium truncate max-w-[140px]">{scene.title}</span>
      </div>

      {/* Narración de toda la escena */}
      <div className="px-4 pb-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">🎙️ Narración (25s)</span>
            <CopyButton text={scene.narration} label="Copiar" />
          </div>
          <p className="text-white/70 text-xs leading-relaxed bg-white/5 rounded-lg p-2.5 border border-white/5">
            {scene.narration}
          </p>
        </div>
      </div>

      {/* Filmstrip de fotogramas */}
      <div className="flex overflow-x-auto gap-4 px-4 pb-4 snap-x custom-scrollbar">
        {frames.map((frame, fIndex) => (
          <div key={fIndex} className="min-w-[85%] md:min-w-[280px] snap-center flex flex-col gap-3 bg-black/20 rounded-xl p-3 border border-white/5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-white/50">Fotograma {fIndex + 1}</span>
            </div>
            
            {/* Imagen generada */}
            <div className="relative rounded-xl overflow-hidden bg-white/5 aspect-[9/16] max-h-72">
              {frame.image_url ? (
                <>
                  <img
                    src={frame.image_url}
                    alt={`Escena ${index + 1} Fotograma ${fIndex + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-500"
                    loading="lazy"
                  />
                  <a
                    href={frame.image_url}
                    download={`escena-${index + 1}-frame-${fIndex + 1}.jpg`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-all duration-200 text-white/70 hover:text-white"
                    title="Descargar imagen"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                  <span className="text-4xl">🎨</span>
                  <span className="text-white/30 text-xs text-center">Sin imagen</span>
                </div>
              )}
            </div>

            {/* Prompts de fotograma */}
            <div className="space-y-3 flex-1 flex flex-col justify-end">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">🎬 Animación</span>
                  <CopyButton text={frame.animation_prompt} label="Copiar" />
                </div>
                <p className="text-white/50 text-[11px] leading-relaxed line-clamp-2 italic" title={frame.animation_prompt}>
                  {frame.animation_prompt}
                </p>
              </div>

              <details className="group">
                <summary className="text-white/30 text-[10px] font-semibold uppercase tracking-wider cursor-pointer hover:text-white/50 transition-colors flex items-center gap-1">
                  <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  🖼️ Prompt de imagen
                </summary>
                <div className="mt-1.5 flex flex-col gap-1">
                  <p className="text-white/40 text-[11px] leading-relaxed bg-white/5 rounded-lg p-2 border border-white/5 italic max-h-24 overflow-y-auto custom-scrollbar">
                    {frame.frame_prompt}
                  </p>
                  <CopyButton text={frame.frame_prompt} label="Copiar prompt" />
                </div>
              </details>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
