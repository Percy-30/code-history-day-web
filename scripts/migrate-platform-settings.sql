-- ═══════════════════════════════════════════════════════════
-- MIGRATION: platform_settings table
-- Ejecutar en: Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL UNIQUE,       -- 'youtube' | 'tiktok' | 'facebook'
  enabled boolean DEFAULT false,       -- Activado/desactivado
  privacy text DEFAULT 'private',      -- 'public' | 'private' | 'unlisted' (YT) / 'public' | 'friends' | 'private' (TT/FB)
  access_token text,                   -- Token de acceso (TikTok, Facebook)
  channel_id text,                     -- YouTube Channel ID
  page_id text,                        -- Facebook Page ID
  extra_config jsonb DEFAULT '{}',     -- Configuración adicional por plataforma
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Política: solo el service_role puede leer/escribir (acceso desde servidor)
CREATE POLICY "Service role full access" ON platform_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insertar configuración inicial vacía para las 3 plataformas
INSERT INTO platform_settings (platform, enabled, privacy)
VALUES 
  ('youtube', false, 'private'),
  ('tiktok', false, 'private'),
  ('facebook', false, 'private')
ON CONFLICT (platform) DO NOTHING;
