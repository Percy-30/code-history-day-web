import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { generateDailyContent } from '@/lib/groq'
import { getPollinationsImageUrl } from '@/lib/pollinations'
import { upsertDailyContent, getTodayDate } from '@/lib/daily-content'
import { getOrCreateDriveFolder, uploadFileToDrive } from '@/lib/google'
import type { Scene } from '@/lib/daily-content'

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
    const { data: ephemerisData, error: ephemerisError } = await supabaseServer
      .from('ephemerides')
      .select('*')
      .eq('display_date', today)
      .single()

    if (ephemerisError || !ephemerisData) {
      console.error('❌ No se encontró efeméride para hoy:', ephemerisError)
      return NextResponse.json(
        { error: 'No ephemeris found for today', date: today },
        { status: 404 }
      )
    }

    const ephemerisText = ephemerisData.event as string
    await upsertDailyContent(today, {
      ephemeris_text: ephemerisText,
      status: 'generando',
    })
    console.log(`📖 Efeméride: ${ephemerisText.substring(0, 100)}...`)

    // 3. Generar guion + prompts con Groq
    console.log('🤖 Generando guion con Groq...')
    const generated = await generateDailyContent(ephemerisText)
    console.log(`✅ Guion generado: ${generated.scenes.length} escenas`)

    // 4. Generar URLs de imágenes con Pollinations para cada fotograma
    console.log('🎨 Generando imágenes con Pollinations (25 fotogramas)...')
    const baseSeed = Date.now()
    
    const scenesWithImages: Scene[] = generated.scenes.map((scene, sceneIndex) => {
      const framesWithImages = (scene.frames || []).map((frame, frameIndex) => {
        const fullPrompt = `${generated.character_anchor}. ${frame.frame_prompt}`
        return {
          ...frame,
          image_url: getPollinationsImageUrl(fullPrompt, {
            width: 1080,
            height: 1920,
            seed: baseSeed, // misma semilla para mayor consistencia visual
            model: 'flux',
          }),
        }
      })
      return {
        ...scene,
        frames: framesWithImages,
      }
    })

    // === NUEVO: Fase 2 - Subir a Google Drive ===
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
        
        console.log(`[Drive] Subiendo imágenes a la carpeta ${driveFolderId}...`)
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

        // Subir los 4 archivos de texto
        console.log(`[Drive] Subiendo archivos de texto...`)
        await uploadFileToDrive(Buffer.from(textAudio, 'utf-8'), `01_guion_audio_${today}.txt`, 'text/plain', driveFolderId)
        await uploadFileToDrive(Buffer.from(textImagenes, 'utf-8'), `02_prompts_imagenes_${today}.txt`, 'text/plain', driveFolderId)
        await uploadFileToDrive(Buffer.from(textVideo, 'utf-8'), `03_prompts_video_animacion_${today}.txt`, 'text/plain', driveFolderId)
        await uploadFileToDrive(Buffer.from(textGeneral, 'utf-8'), `04_prompts_general_${today}.txt`, 'text/plain', driveFolderId)
      } catch (driveError) {
        console.error('[Drive] Error interactuando con Google Drive:', driveError)
        // No detenemos el proceso si Drive falla, guardamos en DB de todas formas
      }
    }

    // 5. Guardar todo en Supabase
    console.log('💾 Guardando en Supabase...')
    const saved = await upsertDailyContent(today, {
      ephemeris_text: ephemerisText,
      video_script: generated.video_script,
      scenes: scenesWithImages,
      status: 'imagenes_listas',
      drive_folder_id: driveFolderId || undefined // Guardar el ID de Drive
    })

    console.log(`✅ Contenido del día guardado con ID: ${saved.id}`)

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
      await upsertDailyContent(today, { status: 'generando' })
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
