import { NextRequest, NextResponse } from 'next/server'
import { updateDailyContent } from '@/lib/daily-content'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json()
    const { id } = await params

    // Solo permitir actualizar campos seguros desde el cliente
    const allowedFields = [
      'status',
      'drive_folder_id',
      'drive_video_file_id',
      'drive_video_url',
      'youtube_video_id',
    ]

    const safeUpdates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) {
        safeUpdates[field] = body[field]
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await updateDailyContent(id, safeUpdates)
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Error in PATCH /api/daily-content/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
