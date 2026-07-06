import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { searchVideoInFolder, createCalendarEvent } from '@/lib/google'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (process.env.NODE_ENV === 'development') return true
  if (request.headers.get('x-vercel-cron') === '1') return true
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  return false
}

/**
 * Fase 2 — Busca en Google Drive si el video fue subido,
 * actualiza el estado en la BD y crea un evento en Google Calendar.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('🔍 [check-drive] Buscando videos subidos a Google Drive...')

  try {
    // Buscar contenidos con drive_folder_id que aún no tienen video listo
    const { data: pendingItems, error } = await supabaseServer
      .from('daily_content')
      .select('id, date, drive_folder_id, status')
      .not('drive_folder_id', 'is', null)
      .in('status', ['imagenes_listas', 'en_animacion'])
      .order('date', { ascending: false })
      .limit(10)

    if (error) throw error

    if (!pendingItems || pendingItems.length === 0) {
      console.log('[check-drive] No hay contenidos pendientes con carpeta de Drive.')
      return NextResponse.json({
        checked: 0,
        message: 'No hay contenidos pendientes.',
      })
    }

    console.log(`[check-drive] Revisando ${pendingItems.length} contenido(s)...`)

    const results = []
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

    for (const item of pendingItems) {
      console.log(`[check-drive] Revisando carpeta de Drive para ${item.date}...`)
      
      try {
        const video = await searchVideoInFolder(item.drive_folder_id, `video_${item.date}.mp4`)
        
        if (video) {
          console.log(`✅ [check-drive] Video encontrado para ${item.date}: ${video.name}`)
          
          // Actualizar estado en Supabase
          const { error: updateError } = await supabaseServer
            .from('daily_content')
            .update({
              status: 'video_listo',
              drive_video_file_id: video.id,
              drive_video_url: video.webViewLink,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)

          if (updateError) {
            console.error(`Error actualizando BD para ${item.date}:`, updateError)
          } else {
            // Crear evento en Google Calendar
            try {
              const calEvent = await createCalendarEvent(
                `📹 Video listo: Code History ${item.date}`,
                `El video para la efeméride del ${item.date} está listo en Google Drive.\n\nLink: ${video.webViewLink}`,
                item.date,
                calendarId
              )
              console.log(`📅 [check-drive] Evento creado en Calendar para ${item.date}: ${calEvent.id}`)
              
              // Guardar el ID del evento en la BD
              await supabaseServer
                .from('daily_content')
                .update({ calendar_event_id: calEvent.id })
                .eq('id', item.id)
            } catch (calError) {
              console.error('[check-drive] Error creando evento de Calendar:', calError)
            }

            results.push({
              date: item.date,
              status: 'video_listo',
              video_name: video.name,
              video_url: video.webViewLink,
            })
          }
        } else {
          console.log(`⏳ [check-drive] Sin video aún para ${item.date}`)
          
          // Marcar como "en animacion" si ya pasamos de la generación
          if (item.status === 'imagenes_listas') {
            await supabaseServer
              .from('daily_content')
              .update({ status: 'en_animacion' })
              .eq('id', item.id)
          }

          results.push({ date: item.date, status: 'sin_video' })
        }
      } catch (itemError) {
        console.error(`Error procesando ${item.date}:`, itemError)
        results.push({ date: item.date, status: 'error', error: String(itemError) })
      }
    }

    return NextResponse.json({
      checked: pendingItems.length,
      results,
    })
  } catch (error) {
    console.error('❌ [check-drive] Error general:', error)
    return NextResponse.json(
      { error: 'check-drive failed', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
