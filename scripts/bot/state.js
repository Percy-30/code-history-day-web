/**
 * bot/state.js — Estado mutable en memoria del bot
 */
const path = require('path')
const fs   = require('fs')
const { SCENES_BASE_DIR } = require('./config')

const state = {
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

Object.defineProperty(state, 'TODAY', {
  get: function() {
    const offset = -5
    const localDate = new Date(new Date().getTime() + offset * 3600 * 1000)
    return localDate.toISOString().split('T')[0]
  }
})

Object.defineProperty(state, 'SCENES_DIR', {
  get: function() {
    const dir = path.join(SCENES_BASE_DIR, this.TODAY)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }
})

module.exports = state
