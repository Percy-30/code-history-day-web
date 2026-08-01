/**
 * bot/services/groq.js — Funciones de IA con Groq
 */
const { log } = require('../safe-action')

/** Generar descripción SEO para YouTube */
async function generateYouTubeDescription(narrationText, postText) {
  try {
    const Groq = require('groq-sdk')
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const prompt = [
      'Eres un experto en SEO para YouTube. Genera una descripción optimizada para un video de YouTube basada en esta narración documental.',
      '', 'NARRACIÓN DEL VIDEO:', narrationText.substring(0, 2000),
      '', 'DESCRIPCIÓN CORTA DEL POST (usa como contexto):', postText.substring(0, 500),
      '', 'INSTRUCCIONES:',
      '- Escribe la descripción completa en español neutro',
      '- Primer párrafo: resumen atractivo del video (2-3 frases)',
      '- Segundo párrafo: contexto histórico expandido (3-4 frases)',
      '- Tercer párrafo: ¿por qué es relevante hoy? (2-3 frases)',
      '- Incluye timestamps ficticios (00:00 Intro, 00:10 Contexto, etc.)',
      '- Agrega 15 hashtags relevantes al final',
      '- Incluye links a las redes de CodeHistory Daily',
      '- Longitud total: 800-1200 caracteres',
      '- NO uses emojis excesivos, mantén un tono profesional',
    ].join('\n')
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 1500,
    })
    const result = completion.choices[0]?.message?.content?.trim()
    if (!result || result.length < 100) throw new Error('Respuesta vacía')
    return result
  } catch (err) {
    log('⚠️', 'generateYouTubeDescription falló: ' + err.message + ' — usando descripción básica')
    return null
  }
}

/** Limpiar guion de Meta AI con IA para TTS */
async function cleanScriptWithAI(rawText) {
  try {
    const Groq = require('groq-sdk')
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const prompt = [
      'Actua como guionista documental profesional. Convierte el siguiente texto en una narracion fluida lista para TTS.',
      '', 'REGLAS ESTRICTAS:',
      '- Duracion objetivo: ~2 minutos 5 segundos (maximo 2200 caracteres)',
      '- Elimina TODAS las etiquetas: F1:, F2:, _F1:_, *F1:*, ESCENA 1, ESCENA 2, etc.',
      '- Elimina separadores: ---, ===, ***, emojis, asteriscos, guiones bajos',
      '- Elimina encabezados: ORIGENES, CONTEXTO, DESARROLLO, IMPACTO, DATOS CURIOSOS, CONCLUSION',
      '- Elimina "Empezamos con el FOTOGRAMA 1" y cualquier texto tecnico',
      '- Conserva TODOS los datos historicos: fechas, nombres, lugares',
      '- Espanol neutro, frases claras, pausas naturales con puntuacion correcta',
      '- Tono documental profesional y atractivo',
      '- Un parrafo por bloque narrativo, separados por linea en blanco',
      '- SIN titulos, SIN etiquetas, SIN emojis, SIN numeraciones',
      '- Devuelve UNICAMENTE la narracion final limpia, nada mas',
      '', 'TEXTO A LIMPIAR:', rawText
    ].join('\n')
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 2048,
    })
    const result = completion.choices[0]?.message?.content?.trim()
    if (!result || result.length < 100) throw new Error('Respuesta vacia de Groq')
    return result
  } catch (err) {
    log('⚠️', 'cleanScriptWithAI fallo: ' + err.message + ' — usando texto local')
    return null
  }
}

/** Generar post profesional con prompt de Director de Contenido */
async function generateProfessionalPost(fechaHistorica, eventoTexto) {
  const Groq = require('groq-sdk')
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const promptPost = [
    'Actúa como Director de Contenido de CodeHistory Daily, una marca especializada en historia de la tecnología, programación, software, Internet, inteligencia artificial y ciberseguridad.',
    '', 'Tu misión es crear TRES (3) versiones de publicación sobre esta efeméride: una para Facebook, una para TikTok y una para YouTube Community.',
    '', `Datos de la efeméride:`,
    `Fecha: \${fechaHistorica}`,
    `Título: \${eventoTexto.split('.')[0]}`,
    `Resumen: \${eventoTexto}`,
    '', 'REGLAS CRÍTICAS DE FACEBOOK Y MONETIZACIÓN (APLICA A TODAS LAS REDES):',
    '- 🚨 ES ESTRICTAMENTE OBLIGATORIO USAR UN MÁXIMO DE 5 HASHTAGS POR PUBLICACIÓN. Si usas 6 o más, las cuentas serán baneadas por spam.',
    '- 🚨 LAS DESCRIPCIONES DEBEN SER CORTAS. No uses descripciones extremadamente largas (máximo 1 o 2 párrafos breves).',
    '- NO uses lenguaje de clickbait ni pidas interacción engañosa.',
    '', 'Instrucciones para FACEBOOK:',
    '- 1 o 2 párrafos breves con un gancho inicial profesional.',
    '- Finaliza con una pregunta corta para la comunidad.',
    '- Hashtags (MÁXIMO 5): incluye #CodeHistoryDaily #ATPDev y 3 relevantes a la tecnología.',
    '', 'Instrucciones para TIKTOK:',
    '- Estilo muy corto, directo y dinámico.',
    '- Hashtags (MÁXIMO 5): usa hashtags virales de TikTok (ej. #fyp #viral #CodeHistoryDaily) y 2 de tecnología.',
    '', 'Instrucciones para YOUTUBE COMMUNITY:',
    '- Formato "Sabías que..." o dato curioso para lectura rápida.',
    '- Hashtags (MÁXIMO 5): incluye #CodeHistoryDaily #Historia y 3 relevantes.',
    '', 'Devuelve el resultado EXACTAMENTE con esta estructura (respeta los límites a rajatabla):',
    '', '=== 📱 FACEBOOK ===',
    '🚀 CodeHistory Daily | Efeméride Tecnológica',
    `📅 \${fechaHistorica}`,
    '', '[Texto para Facebook - 1 o 2 párrafos máximo]',
    '', '🌍 Más historias: https://code-history-day-web-alpha.vercel.app',
    '[ESCRIBE AQUÍ MÁXIMO 5 HASHTAGS PARA FB]',
    '', '=== 🎵 TIKTOK ===',
    `📅 \${fechaHistorica}`,
    '', '[Texto para TikTok - Corto y al grano]',
    '', '🔗 Enlace en nuestra bio para más.',
    '[ESCRIBE AQUÍ MÁXIMO 5 HASHTAGS VIRALES PARA TIKTOK]',
    '', '=== ▶️ YOUTUBE COMMUNITY ===',
    '🚀 Efeméride Tecnológica',
    `📅 \${fechaHistorica}`,
    '', '[Texto para YouTube - Curiosidad rápida]',
    '', '📺 ¡No te pierdas los nuevos videos en el canal!',
    '[ESCRIBE AQUÍ MÁXIMO 5 HASHTAGS PARA YOUTUBE]',
  ].join('\\n')

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: promptPost }],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    max_tokens: 1800,
  })
  const result = completion.choices[0]?.message?.content?.trim()
  if (!result || result.length < 100) throw new Error('Respuesta vacía de Groq')
  return result
}

/** Generar prompts de Shorts para Luma/Veo 3 */
async function generateShortsPrompts(fechaHistorica, tituloEfem, descEfem) {
  const Groq = require('groq-sdk')
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const prompt = `Genera un video documental cinematográfico dividido en 3 escenas consecutivas.

IMPORTANTE:
- Estilo documental histórico tecnológico.
- Sin mostrar ni recrear personas reales identificables.
- Si existe una persona asociada a la efeméride, representarla de manera genérica: "investigador", "programador", "ingeniero", "científico" o "equipo de desarrollo".
- Narración exclusivamente en español.
- Calidad cinematográfica ultra realista.
- Mantener coherencia visual entre las 3 escenas.
- Duración de cada escena: 8 segundos.

==================================================
DATOS DE LA EFEMÉRIDE
==================================================

FECHA:
${fechaHistorica}

TÍTULO:
${tituloEfem}

DESCRIPCIÓN:
${descEfem}

IMPACTO:
Avance clave en la historia tecnológica.

==================================================
ESCENA 1 - EL CONTEXTO
==================================================

Technology documentary film, [LUGAR APROXIMADO DE LA EFEMERIDE], [AÑO APROXIMADO].

Mostrar el contexto histórico y tecnológico de la época relacionado con la efeméride. Equipos, oficinas, laboratorios, centros de datos, computadoras, redes o tecnologías relevantes al acontecimiento. Ambiente auténtico de la época. Cinematic lighting. Ultra realistic. High detail. Documentary style.

CAMERA:
Slow cinematic push-in revealing the environment and technological context.

SOUND FX:
Ambience related to the scene.
Equipment sounds.
Environmental sounds appropriate to the location.

MUSIC:
Inspirational technology documentary soundtrack.
Soft ambient synth pads.

NARRATION (Spanish):
"${fechaHistorica}. [INTRODUCCIÓN DEL CONTEXTO Y PROBLEMA O SITUACIÓN QUE DIO ORIGEN A LA EFEMÉRIDE.]"

Duration: 8 seconds.

==================================================
ESCENA 2 - EL ACONTECIMIENTO
==================================================

Technology documentary film.

Mostrar visualmente el desarrollo, lanzamiento, descubrimiento, creación o evento principal relacionado con la efeméride. Interfaces, sistemas, documentación, código, hardware, prototipos, comunicaciones o elementos asociados. Estilo documental tecnológico. Ultra realistic.

CAMERA:
Tracking shot highlighting the key technological development.

SOUND FX:
Typing sounds.
Electronic signals.
Technology ambience.

MUSIC:
Motivational technology documentary soundtrack.
Rising synth atmosphere.

NARRATION (Spanish):
"[EXPLICACIÓN DEL ACONTECIMIENTO PRINCIPAL. QUÉ OCURRIÓ, QUIÉN O QUÉ ORGANIZACIÓN PARTICIPÓ Y POR QUÉ FUE IMPORTANTE.]"

Duration: 8 seconds.

==================================================
ESCENA 3 - EL IMPACTO
==================================================

Technology documentary film.

Visualización del impacto global de la efeméride. Redes digitales, dispositivos modernos, centros de datos, usuarios, industrias o tecnologías actuales relacionadas con el acontecimiento. Escala global. Cinematic documentary style. Ultra detailed.

CAMERA:
Epic zoom-out showing the worldwide influence and legacy of the event.

SOUND FX:
Digital connection sounds.
Modern technology ambience.
Subtle electronic pulses.

MUSIC:
Epic inspirational technology documentary soundtrack.
Cinematic orchestral finale.

NARRATION (Spanish):
"[EXPLICACIÓN DEL IMPACTO HISTÓRICO Y CÓMO ESTA EFEMÉRIDE INFLUYE EN EL PRESENTE.]"

Duration: 8 seconds.

=== INSTRUCCIÓN FINAL OBLIGATORIA ===
1. MANTÉN LA ESTRUCTURA ORIGINAL EXACTA AL 100%. Por cada escena, debes devolver TODOS los campos tal como te los pasé: la descripción visual inicial, CAMERA, SOUND FX, MUSIC, NARRATION y Duration. NO RESUMAS la escena en un solo párrafo.
2. Devuelve ÚNICAMENTE el texto de las 3 escenas rellenadas con la información correspondiente.
3. Debes separar cada escena con este texto exacto (incluyendo los pipes): |||ESCENA|||

Ejemplo de salida esperada:
ESCENA 1
Technology documentary film, [LUGAR], [AÑO]...
CAMERA: ...
SOUND FX: ...
MUSIC: ...
NARRATION (Spanish): ...
Duration: 8 seconds.
|||ESCENA|||
ESCENA 2
... (toda la estructura completa de la escena 2) ...
|||ESCENA|||
ESCENA 3
... (toda la estructura completa de la escena 3) ...`

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    max_tokens: 2500,
  })
  
  const result = completion.choices[0]?.message?.content?.trim()
  if (!result || result.length < 100) throw new Error('Respuesta vacía de Groq')
  return result
}

module.exports = { generateYouTubeDescription, cleanScriptWithAI, generateProfessionalPost, generateShortsPrompts }
