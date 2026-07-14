/**
 * bot/config.js — Configuración centralizada del bot
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
const path = require('path')
const fs   = require('fs')

// ── Variables de entorno ──────────────────────────────────────────────
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID      = Number(process.env.TELEGRAM_CHAT_ID)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env.local')
  process.exit(1)
}

// ── Rutas del proyecto ───────────────────────────────────────────────
const SCENES_BASE_DIR = path.join(__dirname, '..', 'downloads', 'scenes')
const INTRO_DIR  = path.join(__dirname, '..', '..', 'assets', 'video', 'intro')
const OUTRO_DIR  = path.join(__dirname, '..', '..', 'assets', 'video', 'outro')
const LOGOS_DIR  = path.join(__dirname, '..', '..', 'assets', 'images', 'logos')
const BGM_DIR    = path.join(__dirname, '..', '..', 'assets', 'audio', 'music')

// Crear directorios si no existen
;[SCENES_BASE_DIR, INTRO_DIR, OUTRO_DIR, LOGOS_DIR, BGM_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

module.exports = {
  BOT_TOKEN,
  CHAT_ID,
  SUPABASE_URL,
  SUPABASE_KEY,
  SCENES_BASE_DIR,
  INTRO_DIR,
  OUTRO_DIR,
  LOGOS_DIR,
  BGM_DIR,
}
