import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { getPollinationsImageUrl } from '@/lib/pollinations'
import { upsertDailyContent, getTodayDate } from '@/lib/daily-content'
import { uploadFileToDrive } from '@/lib/google'

export async function POST(request: NextRequest) {
  try {
    // Basic auth check using body or query param could be added here, 
    // or rely on a secret if needed. For now, we will use a secret token from the bot.
    const body = await request.json().catch(() => ({}))
    const { secret, date } = body

    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const targetDate = date || getTodayDate()
    console.log(`[Generate Images] Iniciando generación manual para: ${targetDate}`)

    // 1. Fetch daily content
    const { data: contentData, error: contentError } = await supabaseServer
      .from('daily_content')
      .select('*')
      .eq('date', targetDate)
      .single()

    if (contentError || !contentData) {
      return NextResponse.json({ error: 'No daily content found for date', details: contentError }, { status: 404 })
    }

    let scenes = contentData.scenes || []
    if (scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found to generate images for' }, { status: 400 })
    }

    const baseSeed = Date.now()
    const characterAnchor = contentData.video_script ? 'Personaje principal' : '' // Fallback if anchor not stored directly
    // Wait, the character anchor is usually in the scenes or video_script, but Pollinations works fine with the frame_prompt directly if it's descriptive enough. We can try to extract character_anchor from the prompt or just use frame_prompt.
    // In cron/generate/route.ts it was `${generated.character_anchor}. ${frame.frame_prompt}`
    // Since character_anchor is not saved as a separate column, we might just use frame_prompt, which usually contains enough context. Or we can just use `frame_prompt`.

    let generatedCount = 0
    let frameCounter = 1 // Global frame counter for Drive uploads
    const driveFolderId = contentData.drive_folder_id

    // 2. Iterate through scenes and frames
    const updatedScenes = []
    for (let sIndex = 0; sIndex < scenes.length; sIndex++) {
      const scene = scenes[sIndex]
      const updatedFrames = []

      for (let fIndex = 0; fIndex < (scene.frames || []).length; fIndex++) {
        const frame = scene.frames[fIndex]
        let currentImageUrl = frame.image_url

        // Si no tiene imagen, la generamos
        if (!currentImageUrl) {
          console.log(`[Generate Images] Generando imagen para Escena ${sIndex + 1}, Fotograma ${fIndex + 1}...`)
          const prompt = frame.frame_prompt || scene.image_prompt || ''
          currentImageUrl = getPollinationsImageUrl(prompt, {
            width: 1080,
            height: 1920,
            seed: baseSeed + frameCounter, // slightly different seed per frame for variety or same seed? Let's use baseSeed + frameCounter
            model: 'flux',
          })
          generatedCount++

          // 3. Upload to Google Drive
          if (driveFolderId && currentImageUrl) {
            try {
              console.log(`[Generate Images] Subiendo imagen a Drive para Fotograma ${frameCounter}...`)
              const response = await fetch(currentImageUrl)
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                await uploadFileToDrive(
                  buffer,
                  `frame_${String(frameCounter).padStart(2, '0')}_${targetDate}.jpg`,
                  'image/jpeg',
                  driveFolderId
                )
              }
            } catch (err) {
              console.error(`[Generate Images] Error subiendo a Drive fotograma ${frameCounter}:`, err)
            }
          }
        }
        
        updatedFrames.push({
          ...frame,
          image_url: currentImageUrl
        })
        frameCounter++
      }

      updatedScenes.push({
        ...scene,
        frames: updatedFrames
      })
    }

    if (generatedCount === 0) {
      return NextResponse.json({ message: 'Todas las escenas ya tenían imágenes generadas', success: true })
    }

    // 4. Update Supabase
    console.log(`[Generate Images] Actualizando base de datos con las nuevas URLs...`)
    await upsertDailyContent(targetDate, {
      scenes: updatedScenes,
      status: 'imagenes_listas'
    })

    console.log(`[Generate Images] ✅ Proceso completado exitosamente`)
    return NextResponse.json({
      success: true,
      message: `Generadas ${generatedCount} imágenes exitosamente.`,
      date: targetDate
    })

  } catch (error) {
    console.error('❌ Error en daily-content/generate-images:', error)
    return NextResponse.json(
      {
        error: 'Image generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
