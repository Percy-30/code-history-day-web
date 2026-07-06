import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

// Obtener publicaciones de plataformas para un daily_content_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dailyContentId = searchParams.get('daily_content_id')

    if (!dailyContentId) {
      return NextResponse.json({ error: 'daily_content_id is required' }, { status: 400 })
    }

    const { data, error } = await supabaseServer
      .from('platform_publications')
      .select('*')
      .eq('daily_content_id', dailyContentId)

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('Error in /api/platform-publications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Upsert: marcar plataforma como publicada
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { daily_content_id, platform, published, notes } = body

    if (!daily_content_id || !platform) {
      return NextResponse.json(
        { error: 'daily_content_id and platform are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServer
      .from('platform_publications')
      .upsert(
        {
          daily_content_id,
          platform,
          published: published ?? true,
          published_at: published ? new Date().toISOString() : null,
          notes: notes ?? null,
        },
        { onConflict: 'daily_content_id,platform' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in POST /api/platform-publications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
