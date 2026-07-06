import { NextRequest, NextResponse } from 'next/server'
import { getDailyContent, getDailyContentHistory, getTodayDate } from '@/lib/daily-content'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const history = searchParams.get('history')

    // Retornar historial completo
    if (history === '1') {
      const limit = parseInt(searchParams.get('limit') ?? '30')
      const data = await getDailyContentHistory(limit)
      return NextResponse.json({ data })
    }

    // Retornar contenido de una fecha específica o de hoy
    const targetDate = date ?? getTodayDate()
    const content = await getDailyContent(targetDate)

    if (!content) {
      return NextResponse.json(
        { error: 'No content found for this date', date: targetDate },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: content })
  } catch (error) {
    console.error('Error in /api/daily-content:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
