-- Tabla principal de contenido diario
CREATE TABLE IF NOT EXISTS daily_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  ephemeris_text TEXT NOT NULL,
  video_script JSONB,
  scenes JSONB, -- [{ image_prompt, animation_prompt, image_url, narration }]
  status TEXT NOT NULL DEFAULT 'generando'
    CHECK (status IN ('generando', 'imagenes_listas', 'en_animacion', 'video_listo', 'publicado_youtube', 'publicado_todo')),
  drive_folder_id TEXT,
  drive_video_file_id TEXT,
  drive_video_url TEXT,
  youtube_video_id TEXT,
  calendar_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de publicaciones por plataforma
CREATE TABLE IF NOT EXISTS platform_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_content_id UUID NOT NULL REFERENCES daily_content(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'facebook')),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (daily_content_id, platform)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_daily_content_date ON daily_content(date DESC);
CREATE INDEX IF NOT EXISTS idx_platform_publications_content_id ON platform_publications(daily_content_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON daily_content;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON daily_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS policies (acceso solo desde service_key)
ALTER TABLE daily_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_publications ENABLE ROW LEVEL SECURITY;

-- Permitir todo para service role
CREATE POLICY "service_role_all_daily_content" ON daily_content
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_platform_publications" ON platform_publications
  FOR ALL USING (auth.role() = 'service_role');
