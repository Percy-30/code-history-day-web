/**
 * bot/utils/paths.js — Utilidades de rutas compartidas entre handlers
 */
const path = require('path')
const fs   = require('fs')
const state = require('../state')

/**
 * Retorna el directorio de audios del día actual y lo crea si no existe.
 * @returns {string} Ruta absoluta a scripts/downloads/scenes/YYYY-MM-DD/audio/
 */
function getAudioDir() {
  const dir = path.join(state.SCENES_DIR, 'audio')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = { getAudioDir }
