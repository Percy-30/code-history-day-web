import { supabaseServer } from './supabase-server'

export interface DailyContent {
  id: string
  date: string
  ephemeris_text: string
  video_script: VideoScript | Record<string, unknown> | null
  scenes: Scene[] | null
  status: ContentStatus
  drive_folder_id: string | null
  drive_video_file_id: string | null
  drive_video_url: string | null
  youtube_video_id: string | null
  calendar_event_id: string | null
  created_at: string
  updated_at: string
}

export interface Frame {
  frame_prompt: string
  animation_prompt: string
  image_url?: string
}

export interface Scene {
  time_range: string
  title: string
  narration: string
  // Fase 1 v1
  image_prompt?: string
  animation_prompt?: string
  image_url?: string
  // Fase 1 v2.1 (Múltiples fotogramas)
  frames?: Frame[]
}

export interface VideoScript {
  format: string
  duration_seconds: number
  tone: string
}

export type ContentStatus =
  | 'generando'
  | 'imagenes_listas'
  | 'en_animacion'
  | 'video_listo'
  | 'publicado_youtube'
  | 'publicado_todo'

/**
 * Obtiene el contenido diario para una fecha específica.
 * Si no se proporciona fecha, usa la fecha de hoy (UTC-5, hora Perú).
 */
export async function getDailyContent(date?: string): Promise<DailyContent | null> {
  const targetDate = date ?? getTodayDate()

  const { data, error } = await supabaseServer
    .from('daily_content')
    .select('*')
    .eq('date', targetDate)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // No encontrado
    throw error
  }

  return data as DailyContent
}

/**
 * Obtiene los últimos N registros de contenido diario para el historial.
 */
export async function getDailyContentHistory(limit = 30): Promise<DailyContent[]> {
  const { data, error } = await supabaseServer
    .from('daily_content')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as DailyContent[]) ?? []
}

/**
 * Crea un nuevo registro de contenido diario.
 */
export async function createDailyContent(
  input: Pick<DailyContent, 'date' | 'ephemeris_text'> &
    Partial<Pick<DailyContent, 'video_script' | 'scenes' | 'status'>>
): Promise<DailyContent> {
  const { data, error } = await supabaseServer
    .from('daily_content')
    .insert({
      date: input.date,
      ephemeris_text: input.ephemeris_text,
      video_script: input.video_script ?? null,
      scenes: input.scenes ?? null,
      status: input.status ?? 'generando',
    })
    .select()
    .single()

  if (error) throw error
  return data as DailyContent
}

/**
 * Actualiza campos de un registro existente.
 */
export async function updateDailyContent(
  id: string,
  updates: Partial<Omit<DailyContent, 'id' | 'created_at' | 'updated_at'>>
): Promise<DailyContent> {
  const { data, error } = await supabaseServer
    .from('daily_content')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as DailyContent
}

/**
 * Upsert: crea o actualiza el registro del día.
 */
export async function upsertDailyContent(
  date: string,
  updates: Partial<Omit<DailyContent, 'id' | 'created_at' | 'updated_at'>>
): Promise<DailyContent> {
  const { data, error } = await supabaseServer
    .from('daily_content')
    .upsert({ date, ...updates }, { onConflict: 'date' })
    .select()
    .single()

  if (error) throw error
  return data as DailyContent
}

/**
 * Retorna la fecha de hoy en zona horaria Perú (UTC-5) como YYYY-MM-DD.
 */
export function getTodayDate(): string {
  const now = new Date()
  // Ajustar a UTC-5 (hora Perú)
  const peruOffset = -5 * 60
  const utcOffset = now.getTimezoneOffset()
  const peruTime = new Date(now.getTime() + (peruOffset - utcOffset) * 60 * 1000)
  
  return peruTime.toISOString().split('T')[0]
}
