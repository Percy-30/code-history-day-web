import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { downloadFileFromDrive } from '@/lib/youtube'
import { uploadVideoToYouTube } from '@/lib/youtube'
import { uploadVideoToTikTok } from '@/lib/tiktok'
import { uploadReelToFacebook } from '@/lib/facebook'
import { upsertDailyContent } from '@/lib/daily-content'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (process.env.NODE_ENV === 'development') return true
  if (request.headers.get('x-vercel-cron') === '1') return true
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  return false
}

/**
 * Fase 3 — Publica el video en las plataformas habilitadas.
 * Lee configuraciones desde la tabla platform_settings.
 * Se dispara automáticamente cuando el estado es 'video_listo'.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('📤 [publish] Buscando videos listos para publicar...')

  try {
    // 1. Buscar contenidos con video listo y sin publicar
    const { data: readyItems, error } = await supabaseServer
      .from('daily_content')
      .select('id, date, drive_video_file_id, scenes, video_script')
      .eq('status', 'video_listo')
      .order('date', { ascending: false })
      .limit(5)

    if (error) throw error

    if (!readyItems || readyItems.length === 0) {
      console.log('[publish] No hay videos listos para publicar.')
      return NextResponse.json({ published: 0, message: 'No hay videos listos.' })
    }

    // 2. Cargar configuraciones de plataformas habilitadas
    const { data: platformSettings } = await supabaseServer
      .from('platform_settings')
      .select('*')
      .eq('enabled', true)

    if (!platformSettings || platformSettings.length === 0) {
      return NextResponse.json({ published: 0, message: 'No hay plataformas habilitadas.' })
    }

    const results = []

    for (const item of readyItems) {
      if (!item.drive_video_file_id) {
        results.push({ date: item.date, status: 'sin_video_en_drive' })
        continue
      }

      console.log(`[publish] Procesando ${item.date}...`)

      // 3. Descargar el video de Drive una sola vez
      let videoBuffer: Buffer | null = null
      try {
        videoBuffer = await downloadFileFromDrive(item.drive_video_file_id)
        console.log(`[publish] Video descargado: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`)
      } catch (err) {
        console.error('[publish] Error descargando de Drive:', err)
        results.push({ date: item.date, status: 'error_descarga', error: String(err) })
        continue
      }

      // Datos comunes del video
      const videoTitle = `¿Sabías esto? Code History Daily ${item.date} #Shorts`
      const videoDescription = [
        `📅 #CodeHistoryDaily - ${item.date}`,
        '',
        'Efemérides de programación y tecnología. ¡Suscríbete para aprender un poco de historia tech cada día!',
        '',
        '#Programación #Historia #Tech #Shorts #TikTok #CodeHistory',
      ].join('\n')

      const platformResults: Record<string, unknown> = {}
      const enabledPlatforms = platformSettings.map((ps) => ps.platform as string)
      const successfulPlatforms = new Set<string>()

      // 4. Publicar en cada plataforma habilitada
      for (const ps of platformSettings) {
        try {
          if (ps.platform === 'youtube') {
            const privacyMap: Record<string, 'public' | 'private' | 'unlisted'> = {
              public: 'public', private: 'private', unlisted: 'unlisted'
            }
            const ytResult = await uploadVideoToYouTube({
              title: videoTitle,
              description: videoDescription,
              privacy: privacyMap[ps.privacy] ?? 'private',
              videoBuffer,
            })
            platformResults.youtube = ytResult
            successfulPlatforms.add('youtube')
            await upsertDailyContent(item.date, {
              youtube_video_id: ytResult.videoId,
              status: 'publicado_youtube',
            })
            console.log(`✅ [publish] YouTube: ${ytResult.videoUrl}`)
          }

          if (ps.platform === 'tiktok' && ps.access_token) {
            const ttResult = await uploadVideoToTikTok(
              {
                videoBuffer,
                title: videoTitle,
                privacy: ps.privacy === 'public' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY',
              },
              ps.access_token
            )
            platformResults.tiktok = ttResult
            successfulPlatforms.add('tiktok')
            console.log(`✅ [publish] TikTok publish_id: ${ttResult.publishId}`)
          }

          if (ps.platform === 'facebook' && ps.access_token && ps.page_id) {
            const fbPrivacy = ps.privacy === 'public' ? 'EVERYONE' : 'ONLY_ME'
            const fbResult = await uploadReelToFacebook({
              videoBuffer,
              description: videoDescription,
              privacy: fbPrivacy,
              pageId: ps.page_id,
              accessToken: ps.access_token,
            })
            platformResults.facebook = fbResult
            successfulPlatforms.add('facebook')
            console.log(`✅ [publish] Facebook: ${fbResult.postUrl}`)
          }
        } catch (platformErr) {
          console.error(`[publish] Error en ${ps.platform}:`, platformErr)
          platformResults[ps.platform] = { error: String(platformErr) }
        }
      }

      for (const platform of successfulPlatforms) {
        await supabaseServer
          .from('platform_publications')
          .upsert(
            {
              daily_content_id: item.id,
              platform,
              published: true,
              published_at: new Date().toISOString(),
            },
            { onConflict: 'daily_content_id,platform' }
          )
      }

      const allEnabledPublished = enabledPlatforms.every((platform) => successfulPlatforms.has(platform))
      if (allEnabledPublished) {
        await upsertDailyContent(item.date, { status: 'publicado_todo' })
      } else if (successfulPlatforms.has('youtube')) {
        await upsertDailyContent(item.date, { status: 'publicado_youtube' })
      }

      results.push({
        date: item.date,
        status: allEnabledPublished ? 'publicado_todo' : 'publicacion_parcial',
        platforms: platformResults,
      })
    }

    return NextResponse.json({ published: results.length, results })
  } catch (error) {
    console.error('❌ [publish] Error general:', error)
    return NextResponse.json(
      { error: 'publish failed', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
