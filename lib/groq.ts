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
  copilot_cover_prompt?: string
  social_media_post?: string
  scenes: Scene[]
}

/**
 * Genera el guion de video completo, prompts de imagen y prompts de animación
 * para una efeméride del día usando Groq (Llama).
 */
export async function generateDailyContent(ephemerisText: string): Promise<GeneratedContent> {
  // Extraer TODAS las fechas de la efeméride — usar la PRIMERA que aparece
  const allDates = [...ephemerisText.matchAll(/(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/gi)]
  const fechaExplicita = allDates.length > 0 ? allDates[0][1] : ''
  // Si hay múltiples fechas, mostrarlas todas para que Groq sepa cuál es la principal
  const todasFechas = allDates.map(m => m[1]).join(', ')

  const prompt = `Eres guionista y director de arte de un canal de curiosidades tecnológicas para TikTok/YouTube Shorts llamado "Code History Daily", que publica una efeméride de programación/tecnología cada día.

Efeméride de hoy:
"${ephemerisText}"
${fechaExplicita ? `
⚠️ INSTRUCCIÓN CRÍTICA SOBRE FECHAS:
La efeméride menciona estas fechas: ${todasFechas}
La fecha PRINCIPAL del evento es: "${fechaExplicita}" (la PRIMERA fecha mencionada)
DEBES usar "${fechaExplicita}" en el social_media_post y en copilot_cover_prompt.
Si la efeméride menciona múltiples eventos con distintas fechas, el evento PRINCIPAL es el que ocurrió el ${fechaExplicita}.
NO uses ninguna otra fecha del texto. NO uses la fecha de hoy.
` : ''}
Genera la siguiente estructura EXACTA en JSON (sin texto adicional fuera del JSON):

{
  "video_script": {
    "format": "9:16",
    "duration_seconds": 125,
    "tone": "descripción del tono general (nostálgico, educativo, cálido)"
  },
  "character_anchor": "Descripción muy detallada del personaje principal y el entorno principal (ej: Hombre de 30 años con bata blanca, gafas redondas, en un laboratorio de los años 80 iluminado con luz de neón). ESTO ES CRUCIAL PARA LA COHERENCIA VISUAL.",
  "copilot_cover_prompt": "Rellena SOLO las cuatro partes variables de la plantilla maestra de portada. CRÍTICO: la 'fecha_historica' debe ser la fecha del evento histórico de la efeméride (el año en que ocurrió, NO el año actual). Devuelve un JSON dentro de este campo con esta forma exacta: { fecha_historica: '[DÍA] de [MES] de [AÑO_HISTORICO]', titulo_principal: '[TÍTULO CORTO DE LA EFEMÉRIDE, máx 70 caracteres]', subtitulo: '[DESCRIPCIÓN BREVE DEL IMPACTO, máx 120 caracteres]', elemento_visual: '[PERSONA, INVENTO, EMPRESA, SOFTWARE o TECNOLOGÍA representativa de la efeméride]' }. EJEMPLO: si la efeméride es del 13 de julio de 2001, fecha_historica debe ser '13 de julio de 2001'. NUNCA pongas el año actual. Usa comillas simples dentro del JSON para evitar conflictos.",
  "social_media_post": "Actúa como Director de Contenido de CodeHistory Daily, una marca especializada en historia de la tecnología. Tu misión es crear una publicación profesional, formal y atractiva. IMPORTANTE: La efeméride ocurrió exactamente en la fecha proporcionada al inicio del prompt y úsala textualmente, NO inventes ni cambies la fecha (ej: 13 de julio de 2001). ESTRUCTURA OBLIGATORIA EXACTA (sin añadir texto extra): 1) Empieza con '🚀 CodeHistory Daily | Efeméride Tecnológica del Día\\n\\n📅 [FECHA HISTÓRICA]'. 2) [TEXTO PRINCIPAL — 2 o 3 párrafos explicando el evento con gancho]. 3) '🔍 ¿Por qué es importante hoy?\\n[REFLEXIÓN — 2-3 frases conectando con el presente]'. 4) '🌍 Más historias tecnológicas:\\nhttps://code-history-day-web-alpha.vercel.app\\n\\n📺 YouTube:\\nhttps://youtube.com/@CodeHistoryDaily\\n\\n🎵 TikTok:\\nhttps://tiktok.com/@codehistorydaily\\n\\n📘 Facebook:\\nhttps://facebook.com/CodeHistoryDaily'. 5) '💬 [PREGUNTA PARA LA COMUNIDAD]'. 6) [15 HASHTAGS RELEVANTES — incluye #CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Programacion #Tecnologia #Historia].",
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
- Cada escena DEBE tener EXACTAMENTE 5 objetos en la lista "frames". (Total: 25 fotogramas, 2 minutos y 5 segundos de duración).
- MUY IMPORTANTE: La "narration" de CADA escena DEBE tener EXACTAMENTE entre 70 y 85 palabras para garantizar que al leerse en voz alta dure exactamente 25 segundos. Toda la narración sumada debe tener alrededor de 350-400 palabras en total. ESTO ES CRÍTICO.
- El hook de la escena 1 NO debe empezar con la fecha. Arranca con una frase impactante.
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

/**
 * Genera una efeméride tecnológica histórica para una fecha específica
 * cuando no existe en la base de datos.
 */
export async function generateMissingEphemeris(dateString: string): Promise<{ event: string, historical_year: number }> {
  const dateObj = new Date(`${dateString}T12:00:00`);
  const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const day = dateObj.getDate();
  const month = monthNames[dateObj.getMonth()];
  
  const prompt = `Actúa como historiador de la tecnología.
Dime el acontecimiento histórico más importante relacionado con la informática, software, hardware, internet, videojuegos o tecnología que haya ocurrido un ${day} de ${month} (en cualquier año del pasado).
Si no hay un evento masivo exacto, dame un lanzamiento importante, el nacimiento de un pionero o la fundación de una empresa de tecnología ese día.

Devuelve EXACTAMENTE un JSON con este formato (sin texto extra):
{
  "historical_year": AÑO_EN_QUE_OCURRIÓ (en formato número de 4 dígitos),
  "event": "Descripción detallada del evento, el impacto que tuvo y por qué es importante. (Máximo 2 párrafos)"
}`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty response for missing ephemeris');
  
  const parsed = JSON.parse(content);
  return {
    event: parsed.event,
    historical_year: parsed.historical_year
  };
}
