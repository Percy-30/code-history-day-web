import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/platforms/settings
 * Devuelve la configuración de todas las plataformas.
 */
export async function GET() {
  const { data, error } = await supabaseServer
    .from('platform_settings')
    .select('*')
    .order('platform')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settings: data })
}

/**
 * POST /api/platforms/settings
 * Guarda (upsert) la configuración de una plataforma.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { platform, enabled, privacy, access_token, channel_id, page_id, extra_config } = body

  if (!platform) {
    return NextResponse.json({ error: 'platform is required' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('platform_settings')
    .upsert(
      {
        platform,
        enabled: enabled ?? false,
        privacy: privacy ?? 'private',
        ...(access_token !== undefined && { access_token }),
        ...(channel_id !== undefined && { channel_id }),
        ...(page_id !== undefined && { page_id }),
        ...(extra_config !== undefined && { extra_config }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, setting: data })
}
