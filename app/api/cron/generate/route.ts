import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { generateDailyContent, generateMissingEphemeris } from '@/lib/groq'
import { getPollinationsImageUrl } from '@/lib/pollinations'
import { upsertDailyContent, updateDailyContent, getTodayDate } from '@/lib/daily-content'
import { getOrCreateDriveFolder, uploadFileToDrive } from '@/lib/google'
import type { Scene } from '@/lib/daily-content'
import { headers } from 'next/headers'

// Función auxiliar para cortar texto inteligentemente (respetando palabras completas)
function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  
  // Cortar en la posición maxLength
  let truncated = text.substring(0, maxLength)
  
  // Buscar el último espacio para no cortar a mitad de palabra
  const lastSpaceIndex = truncated.lastIndexOf(' ')
  
  // Si encontramos un espacio y no está al inicio, usarlo
  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex)
  }
  
  // Si no hay espacio, devolver el texto original truncado
  return truncated
}

// Verificar que el request viene de Vercel Cron o tiene la clave secreta
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // En desarrollo, permitir sin auth
  if (process.env.NODE_ENV === 'development') return true

  // Verificar header de Vercel Cron
  if (request.headers.get('x-vercel-cron') === '1') return true

  // Verificar CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  return false
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = getTodayDate()
  console.log(`🚀 Iniciando generación de contenido para: ${today}`)

  try {
    // 1. Marcar como "generando" en Supabase (o crear el registro)
    // 2. Obtener la efeméride del día desde la tabla existente
    let { data: ephemerisData, error: ephemerisError } = await supabaseServer
      .from('ephemerides')
      .select('*')
      .eq('display_date', today)
      .single()

    if (ephemerisError || !ephemerisData) {
      console.log('⚠️ No se encontró efeméride pre-cargada para hoy. Generando automáticamente con Groq AI...')
      try {
        const generatedEphem = await generateMissingEphemeris(today)
        const dateObj = new Date(`${today}T12:00:00`)
        
        const newEphemeris = {
          day: dateObj.getDate(),
          month: dateObj.getMonth() + 1,
          year: dateObj.getFullYear(),
          event: generatedEphem.event,
          display_date: today,
          historical_day: dateObj.getDate(),
          historical_month: dateObj.getMonth() + 1,
          historical_year: generatedEphem.historical_year
        }

        // Insertar en Supabase para el futuro
        const { data: insertedData, error: insertError } = await supabaseServer
          .from('ephemerides')
          .insert([newEphemeris])
          .select()
          .single()

        if (insertError) {
          console.error('❌ Error guardando la nueva efeméride en DB:', insertError)
          throw insertError
        }

        ephemerisData = insertedData
        console.log(`✅ Efeméride automática guardada exitosamente: ${generatedEphem.historical_year} - ${generatedEphem.event.substring(0, 50)}...`)
      } catch (err) {
        console.error('❌ Falló la generación automática de la efeméride:', err)
        return NextResponse.json(
          { error: 'No ephemeris found for today and auto-generation failed', date: today },
          { status: 404 }
        )
      }
    }

    const ephemerisText = ephemerisData.event as string
    
    // Construir texto enriquecido con la fecha histórica real del evento
    const historicalDay   = ephemerisData.historical_day   as number || ephemerisData.day   as number
    const historicalMonth = ephemerisData.historical_month as number || ephemerisData.month as number  
    const historicalYear  = ephemerisData.historical_year  as number || ephemerisData.year  as number
    const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    const historicalDateStr = `${historicalDay} de ${monthNames[historicalMonth - 1]} de ${historicalYear}`
    // Texto enriquecido: incluye la fecha histórica real para que Groq la use correctamente
    const ephemerisTextWithDate = `El ${historicalDateStr}, ${ephemerisText.charAt(0).toLowerCase()}${ephemerisText.slice(1)}`
    console.log(`📅 Fecha histórica: ${historicalDateStr}`)
    console.log(`📖 Efeméride con fecha: ${ephemerisTextWithDate.substring(0, 100)}...`)

    await upsertDailyContent(today, {
      ephemeris_text: ephemerisText,
      status: 'generando',
    })

    // 3. Generar guion + prompts con Groq — usar texto con fecha histórica real
    console.log('🤖 Generando guion con Groq...')
    const generated = await generateDailyContent(ephemerisTextWithDate)
    console.log(`✅ Guion generado: ${generated.scenes.length} escenas`)

    // 4. Generar URLs de imágenes con Pollinations para cada fotograma (DESACTIVADO TEMPORALMENTE)
    console.log('🎨 Generación de imágenes de fotogramas con Pollinations desactivada temporalmente...')
    const baseSeed = Date.now()
    
    const scenesWithImages: Scene[] = generated.scenes.map((scene, sceneIndex) => {
      const framesWithImages = (scene.frames || []).map((frame, frameIndex) => {
        // const fullPrompt = `${generated.character_anchor}. ${frame.frame_prompt}`
        return {
          ...frame,
          // image_url: getPollinationsImageUrl(fullPrompt, {
          //   width: 1080,
          //   height: 1920,
          //   seed: baseSeed, // misma semilla para mayor consistencia visual
          //   model: 'flux',
          // }),
        }
      })
      return {
        ...scene,
        frames: framesWithImages,
      }
    })

    // === NUEVO: Guardar primero en Supabase para evitar pérdida por timeout de Drive ===
    console.log('💾 Guardando escenas en Supabase preventivamente...')
    const saved = await upsertDailyContent(today, {
      ephemeris_text: ephemerisText,
      video_script: generated.video_script,
      scenes: scenesWithImages,
      status: 'imagenes_listas'
    })
    console.log(`✅ Contenido base guardado con ID: ${saved.id}`)

    // === Fase 2 - Subir a Google Drive ===
    let driveFolderId = null
    const rootDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    if (rootDriveFolderId) {
      try {
        console.log(`[Drive] Creando carpeta para ${today}...`)
        const createdDriveFolderId = await getOrCreateDriveFolder(today, rootDriveFolderId)
        if (!createdDriveFolderId) {
          throw new Error('Google Drive no devolvio el ID de la carpeta del dia')
        }
        driveFolderId = createdDriveFolderId
        
        // === NUEVO: Generar Portada Híbrida ===
        console.log(`[Drive] Generando fondo de portada con IA...`)
        const headersList = await headers()
        const host = headersList.get('host') || 'localhost:3000'
        const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'
        
        // Formatear fecha a español (ej: 8 de julio de 2026)
        const dateObj = new Date(`${today}T12:00:00`)
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
        const formattedDate = dateObj.toLocaleDateString('es-ES', options)
        
        // Usar directamente la fecha histórica construida desde los campos de Supabase (fuente de verdad)
        // No intentar extraerla del texto: puede que el texto no la incluya de forma explícita.
        const fechaExplicita = historicalDateStr // ej: "13 de julio de 2001"
        console.log(`📅 Fecha histórica (DB): "${fechaExplicita}" | Fecha actual: ${formattedDate}`)
        
        // Usar el prompt ultra detallado generado por Groq para la portada (o un fallback si falta)
        const coverBgPrompt = generated.copilot_cover_prompt || `A 90s retro futuristic tech landscape, glowing neon globe, vintage computer, representing: ${ephemerisText}. Highly detailed, cyberpunk style, empty dark space in the center for text overlay, 16:9`
        
        // Generar fondo para la portada con Pollinations (Flux es sorprendentemente bueno con texto)
        const bgUrl = getPollinationsImageUrl(coverBgPrompt, { width: 1200, height: 630, seed: baseSeed, model: 'flux' })
        
        // Construir URL de nuestra API de Satori
        const ephemerisTitleMatch = ephemerisText.split('.')[0] || 'Evento Histórico'
        const ogUrl = new URL(`${protocol}://${host}/api/og/cover`)
        ogUrl.searchParams.set('date', formattedDate)          // Fecha actual (pie de imagen)
        ogUrl.searchParams.set('ephemerisDate', fechaExplicita) // Fecha histórica REAL del evento
        ogUrl.searchParams.set('ephemerisTitle', truncateAtWord(ephemerisTitleMatch, 100))
        ogUrl.searchParams.set('ephemerisDesc', truncateAtWord(ephemerisText, 160) + '...')
        ogUrl.searchParams.set('bg_url', bgUrl)

        console.log(`[Drive] Obteniendo portada final de: ${ogUrl.toString()}`)
        try {
          const ogResponse = await fetch(ogUrl.toString())
          if (ogResponse.ok) {
            const ogBuffer = Buffer.from(await ogResponse.arrayBuffer())
            await uploadFileToDrive(
              ogBuffer,
              `00_portada_${today}.png`,
              'image/png',
              driveFolderId
            )
            console.log(`[Drive] ✅ Portada subida exitosamente`)
          } else {
            console.error(`[Drive] Error al generar portada Satori: ${ogResponse.status}`)
          }
        } catch (ogError) {
          console.error(`[Drive] Error llamando a Satori:`, ogError)
        }

        console.log(`[Drive] Subiendo imágenes de fotogramas a la carpeta ${driveFolderId}...`)
        let frameCounter = 1
        
        let textGeneral = `=== GUION Y PROMPTS DE ANIMACIÓN - ${today} ===\n\nPERSONAJE/ENTORNO BASE:\n${generated.character_anchor}\n\n`
        let textAudio = `=== GUION DE AUDIO - ${today} ===\n\n`
        let textImagenes = `=== PROMPTS DE IMAGEN - ${today} ===\n\nPERSONAJE/ENTORNO BASE:\n${generated.character_anchor}\n\n`
        let textVideo = `=== PROMPTS DE ANIMACIÓN (META AI / KLING) - ${today} ===\n\n`

        for (let sIndex = 0; sIndex < scenesWithImages.length; sIndex++) {
          const scene = scenesWithImages[sIndex]
          const sceneHeader = `--- ESCENA ${sIndex + 1} (${scene.time_range}) ---\n`
          
          textGeneral += sceneHeader + `🎙️ NARRACIÓN:\n${scene.narration}\n\n`
          textAudio += sceneHeader + `${scene.narration}\n\n`
          textImagenes += sceneHeader
          textVideo += sceneHeader

          if (scene.frames) {
            for (let fIndex = 0; fIndex < scene.frames.length; fIndex++) {
              const frame = scene.frames[fIndex]
              const frameHeader = `[Fotograma ${fIndex + 1}]\n`
              
              textGeneral += frameHeader
              textGeneral += `🎬 Animación: ${frame.animation_prompt}\n`
              textGeneral += `🖼️ Imagen: ${frame.frame_prompt}\n\n`

              textImagenes += frameHeader + `${frame.frame_prompt}\n\n`
              textVideo += frameHeader + `${frame.animation_prompt}\n\n`

              if (frame.image_url) {
                const response = await fetch(frame.image_url)
                if (response.ok) {
                  const arrayBuffer = await response.arrayBuffer()
                  const buffer = Buffer.from(arrayBuffer)
                  await uploadFileToDrive(
                    buffer,
                    `frame_${String(frameCounter).padStart(2, '0')}_${today}.jpg`,
                    'image/jpeg',
                    driveFolderId
                  )
                  frameCounter++
                }
              }
            }
          }
          textGeneral += `\n`
          textImagenes += `\n`
          textVideo += `\n`
        }

        // Subir los 5 archivos de texto (incluido el prompt de Copilot con plantilla maestra)
        console.log(`[Drive] Subiendo archivos de texto...`)
        if (generated.copilot_cover_prompt) {
          // Groq devuelve los 4 campos variables; los inyectamos en la plantilla maestra
          let copilotVars: any = {}
          try {
            // Groq puede devolver el JSON como string dentro del campo
            const raw = generated.copilot_cover_prompt
            const jsonStr = raw.includes('{') ? raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1) : null
            if (jsonStr) copilotVars = JSON.parse(jsonStr.replace(/'/g, '"'))
          } catch {}
          // fechaExplicita es siempre historicalDateStr (ej: "13 de julio de 2001") — fuente de verdad
          const fechaHist  = fechaExplicita  // fecha histórica REAL del evento (nunca la fecha actual)
          const tituloMain = copilotVars.titulo_principal || truncateAtWord(ephemerisTitleMatch, 120)
          const subtit     = copilotVars.subtitulo        || truncateAtWord(ephemerisText, 200)
          const elemVisual = copilotVars.elemento_visual  || truncateAtWord(ephemerisTitleMatch, 100)

          const fullCopilotPrompt = `Diseño tecnológico futurista estilo cyberpunk premium, miniatura profesional de YouTube, formato panorámico 16:9.

MANTENER SIEMPRE LA MISMA IDENTIDAD VISUAL DE LA MARCA "CodeHistory Daily".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CABECERA FIJA

En la parte superior una terminal futurista mostrando:
user@atpdev:~$ ./code-history --day

Debajo un gran título principal:
CodeHistory Daily

Subtítulo:
Descubre la historia de la programación día a día

La cabecera debe permanecer exactamente igual en todas las imágenes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FONDO GENERAL

Centro de datos futurista. Circuitos digitales. Interfaces holográficas. Paneles HUD transparentes. Redes digitales. Efectos de energía. Iluminación neón azul y naranja. Ambiente tecnológico cinematográfico. Estética cyberpunk premium. Sin espacios vacíos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENIDO VARIABLE

EFEMÉRIDE DEL DÍA

FECHA HISTÓRICA:
${fechaHist}

TÍTULO PRINCIPAL:
${tituloMain}

SUBTÍTULO:
${subtit}

ELEMENTO VISUAL PRINCIPAL:
${elemVisual}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA CRÍTICA DE FECHAS

Mostrar claramente dos fechas distintas:

FECHA HISTÓRICA: ${fechaHist}
FECHA ACTUAL: ${formattedDate}

IMPORTANTE:
- La FECHA HISTÓRICA debe aparecer únicamente en la sección principal de la efeméride.
- La FECHA ACTUAL debe aparecer únicamente en el pie de imagen.
- NO CONFUNDIR AMBAS FECHAS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPOSICIÓN VISUAL

LADO IZQUIERDO
Mostrar el protagonista principal de la efeméride: ${elemVisual}
Retrato realista y cinematográfico. El protagonista debe ocupar aproximadamente el 35% de la imagen.

CENTRO
Mostrar en texto grande y perfectamente legible:
EFEMÉRIDE DEL DÍA
${fechaHist}
${tituloMain}
${subtit}
El texto debe ser el elemento dominante — aproximadamente el 40% de la composición.

LADO DERECHO
Globo terráqueo holográfico futurista con redes luminosas globales. Representar el impacto mundial. Paneles informativos relacionados con la efeméride — aproximadamente el 25% de la composición.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BADGE SUPERIOR DERECHO

TECH HISTORY
SERIE OFICIAL
Estilo HUD futurista. Color naranja neón.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIE DE IMAGEN

Fecha actual: ${formattedDate}
© 2026 ATP Dev | v0.1.0 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS OBLIGATORIAS

- Todo el texto debe estar completamente en español.
- Todo el texto debe ser perfectamente legible.
- Sin errores ortográficos.
- No agregar textos aleatorios ni inventar fechas.
- No agregar marcas de agua ni logotipos inventados.
- No deformar letras ni cortar palabras.
- Mantener siempre la misma identidad visual de CodeHistory Daily.
- Calidad profesional cinematográfica.
- Estética consistente entre todas las publicaciones.
- Sin espacios vacíos.
- Ultra detallado. Cyberpunk premium.`

          await uploadFileToDrive(Buffer.from(fullCopilotPrompt, 'utf-8'), `00_prompt_portada_copilot_${today}.txt`, 'text/plain', driveFolderId)
          // Guardar para usar en el envío de Telegram
          ;(generated as any)._fullCopilotPrompt = fullCopilotPrompt
        }
        await uploadFileToDrive(Buffer.from(textAudio, 'utf-8'), `01_guion_audio_${today}.txt`, 'text/plain', driveFolderId)
        await uploadFileToDrive(Buffer.from(textImagenes, 'utf-8'), `02_prompts_imagenes_${today}.txt`, 'text/plain', driveFolderId)
        await uploadFileToDrive(Buffer.from(textVideo, 'utf-8'), `03_prompts_video_animacion_${today}.txt`, 'text/plain', driveFolderId)
        await uploadFileToDrive(Buffer.from(textGeneral, 'utf-8'), `04_prompts_general_${today}.txt`, 'text/plain', driveFolderId)
        
        if (generated.social_media_post) {
           await uploadFileToDrive(Buffer.from(generated.social_media_post, 'utf-8'), `05_social_media_post_${today}.txt`, 'text/plain', driveFolderId)
        }

        // === NUEVO: Generar y Subir Prompt Maestro para Meta AI ===
        const metaAIPrompt = `Dale, historia de efeméride del día ${historicalDateStr} - ${truncateAtWord(ephemerisTitleMatch, 110)}

Hazme 25 fotogramas animados sobre la efeméride de hoy.
Estructura:
Escena 1: Orígenes/Contexto - 5 fotogramas
Escena 2: Desarrollo/Historia - 5 fotogramas  
Escena 3: Impacto/Actualidad - 5 fotogramas
Escena 4: Datos curiosos - 5 fotogramas
Escena 5: Conclusión - 5 fotogramas

Por cada fotograma dame:
1. Imagen con estilo cinematográfico, alta calidad
2. Animación sutil de 3-5 segundos
3. NARRACIÓN EXACTA de 5 segundos

Es VITAL que devuelvas la respuesta EXACTAMENTE con este formato:

Me encanta la idea 🔥 
25 fotogramas x 5 segundos = *video de 2 min 5 seg* con narración completa.

Aquí tienes *toda la narración para el audio del video*:

---

*NARRACIÓN COMPLETA - 25 FOTOGRAMAS x 5 SEG*

*ESCENA 1: [NOMBRE DE LA ESCENA]*
*F1:* [Texto de la narración de 5 segundos]
*F2:* [Texto de la narración de 5 segundos]
(Y así sucesivamente hasta F25)

Empezamos con el FOTOGRAMA 1`;

        await uploadFileToDrive(Buffer.from(metaAIPrompt, 'utf-8'), `06_prompt_meta_ai_master_${today}.txt`, 'text/plain', driveFolderId)
        
        // Enviar el prompt directamente por Telegram si el token está disponible
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
          try {
            console.log(`[Telegram] Enviando Prompt Maestro...`);
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await fetch(telegramUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: `🤖 *NUEVA EFEMÉRIDE GENERADA: ${today}*\n\nCopia y pega este texto en Meta AI:\n\n\`\`\`text\n${metaAIPrompt}\n\`\`\``,
                parse_mode: 'Markdown'
              })
            });
            console.log(`[Telegram] ✅ Prompt enviado al chat`);
            
            // Enviar prompt de Copilot si existe
            const fullCopilotPrompt = (generated as any)._fullCopilotPrompt
            if (fullCopilotPrompt) {
              await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: TELEGRAM_CHAT_ID,
                  text: `🎨 PROMPT PARA PORTADA (COPILOT)\n\nCopia y pega el texto del siguiente mensaje en Copilot Designer:\nhttps://copilot.microsoft.com/images/create\n\nUna vez generada la imagen, mandamela con /subir_portada`
                })
              });
              await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: fullCopilotPrompt })
              });
              console.log(`[Telegram] ✅ Prompt de Copilot enviado al chat`);
            }
          } catch (tError) {
            console.error(`[Telegram] Error enviando mensaje:`, tError);
          }
        }

      } catch (driveError) {
        console.error('[Drive] Error interactuando con Google Drive:', driveError)
        // No detenemos el proceso si Drive falla, guardamos en DB de todas formas
      }
    }

    // Actualizar Supabase con el ID de Drive si se subió correctamente
    if (driveFolderId) {
      console.log('💾 Actualizando Supabase con el ID de Drive...')
      await updateDailyContent(saved.id, {
        drive_folder_id: driveFolderId
      })
    }

    console.log(`✅ Proceso completado exitosamente para el día: ${today}`)

    return NextResponse.json({
      success: true,
      date: today,
      id: saved.id,
      scenes_count: scenesWithImages.length,
      status: 'imagenes_listas',
    })
  } catch (error) {
    console.error('❌ Error en cron/generate:', error)

    // Marcar como error en Supabase para visibility
    try {
      // Como esto es un error genérico, actualizar solo si ya existe la fila
      const { supabaseServer } = await import('@/lib/supabase-server')
      await supabaseServer.from('daily_content').update({ status: 'generando' }).eq('date', today)
    } catch {}

    return NextResponse.json(
      {
        error: 'Generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Soporte para GET también (para testing en browser)
export async function GET(request: NextRequest) {
  return POST(request)
}
