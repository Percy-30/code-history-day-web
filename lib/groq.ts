import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
})

export interface Frame {
  frame_prompt: string
  animation_prompt: string
}

export interface Scene {
  time_range: string
  title: string
  narration: string
  frames?: Frame[]
  // Fallback para tipos antiguos
  image_prompt?: string
  animation_prompt?: string
  image_url?: string
}

export interface VideoScript {
  format: string
  duration_seconds: number
  tone: string
}

export interface GeneratedContent {
  video_script: VideoScript
  character_anchor: string
  scenes: Scene[]
}

/**
 * Genera el guion de video completo, prompts de imagen y prompts de animación
 * para una efeméride del día usando Groq (Llama).
 */
export async function generateDailyContent(ephemerisText: string): Promise<GeneratedContent> {
  const prompt = `Eres guionista y director de arte de un canal de curiosidades tecnológicas para TikTok/YouTube Shorts llamado "Code History Daily", que publica una efeméride de programación/tecnología cada día.

Efeméride de hoy:
"${ephemerisText}"

Genera la siguiente estructura EXACTA en JSON (sin texto adicional fuera del JSON):

{
  "video_script": {
    "format": "9:16",
    "duration_seconds": 125,
    "tone": "descripción del tono general (nostálgico, educativo, cálido)"
  },
  "character_anchor": "Descripción muy detallada del personaje principal y el entorno principal (ej: Hombre de 30 años con bata blanca, gafas redondas, en un laboratorio de los años 80 iluminado con luz de neón). ESTO ES CRUCIAL PARA LA COHERENCIA VISUAL.",
  "scenes": [
    {
      "time_range": "0:00-0:25",
      "title": "nombre de la escena 1",
      "narration": "texto exacto que dirá el narrador durante estos 25 segundos",
      "frames": [
        {
          "frame_prompt": "prompt específico para el fotograma 1 (0-5s). DEBE incluir siempre al 'character_anchor' haciendo una acción específica. Formato vertical 9:16. Sin texto.",
          "animation_prompt": "prompt de movimiento para animar en Kling/Meta AI (movimiento de cámara, gestos suaves)"
        },
        ... (DEBES generar exactamente 5 objetos en 'frames' para cada escena)
      ]
    },
    ... (DEBES generar exactamente 5 escenas que cubran de 0:00 hasta 2:05)
  ]
}

Reglas:
- Genera EXACTAMENTE 5 escenas.
- Cada escena DEBE tener EXACTAMENTE 5 objetos en la lista "frames". (Total: 25 fotogramas).
- La narración debe sonar natural y cubrir los 25 segundos de la escena.
- El hook de la escena 1 NO debe empezar con la fecha.
- Cierra la escena 5 con una pregunta para generar comentarios.
- Los frame_prompt deben ser altamente descriptivos, enfocándose en la composición visual e INCLUIR SIEMPRE los rasgos visuales del character_anchor para mantener la coherencia en las 25 imágenes.`

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('Groq returned empty response')
  }

  const parsed = JSON.parse(content) as GeneratedContent

  // Validar estructura básica
  if (!parsed.video_script || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('Invalid response structure from Groq')
  }

  return parsed
}
