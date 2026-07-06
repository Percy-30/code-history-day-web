/**
 * Genera una imagen usando Pollinations.ai (gratis, sin API key).
 * Devuelve la URL pública de la imagen para usar directamente.
 */
export function getPollinationsImageUrl(
  prompt: string,
  options?: {
    width?: number
    height?: number
    seed?: number
    model?: string
  }
): string {
  const {
    width = 1080,
    height = 1920,
    seed = Math.floor(Math.random() * 100000),
    model = 'flux',
  } = options ?? {}

  const encodedPrompt = encodeURIComponent(prompt)
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`
}

/**
 * Descarga la imagen desde Pollinations y retorna el ArrayBuffer.
 * Útil cuando necesitas guardar la imagen en Storage.
 */
export async function downloadPollinationsImage(
  prompt: string,
  options?: {
    width?: number
    height?: number
    seed?: number
    model?: string
  }
): Promise<{ buffer: ArrayBuffer; url: string; seed: number }> {
  const seed = options?.seed ?? Math.floor(Math.random() * 100000)
  const url = getPollinationsImageUrl(prompt, { ...options, seed })

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CodeHistoryDaily/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Pollinations error: ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  return { buffer, url, seed }
}
