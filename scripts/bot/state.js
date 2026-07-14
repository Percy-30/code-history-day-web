/**
 * bot/state.js — Estado mutable en memoria del bot
 */
const path = require('path')
const fs   = require('fs')
const { SCENES_BASE_DIR } = require('./config')

// Calcular la fecha actual en la zona horaria local (UTC-5 para Perú)
const offset = -5
const localDate = new Date(new Date().getTime() + offset * 3600 * 1000)

const state = {
  TODAY:       localDate.toISOString().split('T')[0],
  SCENES_DIR:  '',

  sceneCounter:       0,
  totalScenes:        0,
  receivedScenes:     [],
  downloadQueue:      [],
  isDownloading:      false,
  savedAudioScript:   '',
  motorVozActivo:     'es-MX-JorgeNeural',
  velocidadVozActiva: '-10%',
  pendingUploadMode:  null,
  audioUploadCounter: 0,
  failedClips:        [],
  cancelRequested:    false,
}

// Inicializar SCENES_DIR
state.SCENES_DIR = path.join(SCENES_BASE_DIR, state.TODAY)
if (!fs.existsSync(state.SCENES_DIR)) fs.mkdirSync(state.SCENES_DIR, { recursive: true })

module.exports = state
