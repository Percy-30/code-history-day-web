const config = require('../config')
const state  = require('../state')
const { safeAction, safeSend: _safeSend, log } = require('../safe-action')
const { truncateAtWord, detectFrameNumber, escapeHTML } = require('../utils/text')
const { selectBGMByContext, findBGMByTag } = require('../utils/bgm')
const { uploadToGoogleDrive, createDriveClient } = require('../services/drive')
const { generateYouTubeDescription, cleanScriptWithAI, generateProfessionalPost } = require('../services/groq')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const publisher = require('../services/publisher.js')
const { BOT_TOKEN, CHAT_ID, SUPABASE_URL, SUPABASE_KEY, SCENES_BASE_DIR, INTRO_DIR, OUTRO_DIR, LOGOS_DIR, BGM_DIR } = config

let { TODAY, SCENES_DIR, sceneCounter, totalScenes, receivedScenes, downloadQueue, isDownloading, savedAudioScript, motorVozActivo, velocidadVozActiva, pendingUploadMode, audioUploadCounter, failedClips, cancelRequested } = state

let globalBot = null;
async function safeSend(text, opts = {}) {
  if (!globalBot) return;
  try { await globalBot.sendMessage(CHAT_ID, text, opts) }
  catch (e) { log('s?', 'No se pudo enviar mensaje: ' + e.message) }
}

module.exports = function registerMediaHandler(bot) {
  globalBot = bot;
  bot.on('message', async (msg) => {
    if (msg.chat.id !== CHAT_ID) return;
  if (msg.photo || msg.video || msg.document || msg.audio || msg.voice) {
    const isPhoto = !!msg.photo
    const isAudio = !!(msg.audio || msg.voice)
    const fileId = isPhoto
      ? msg.photo[msg.photo.length - 1].file_id
      : (msg.audio?.file_id || msg.voice?.file_id || msg.video?.file_id || msg.document?.file_id)
    const originalName = msg.audio?.file_name || msg.document?.file_name || ''
    const mimeType = isPhoto ? 'image/jpeg'
      : isAudio ? (msg.audio?.mime_type || msg.voice?.mime_type || 'audio/mpeg')
      : (msg.video?.mime_type || msg.document?.mime_type || '')

    // ── Modo: Subir Narración Completa ───────────────────────────────────────
    // Se activa cuando: (1) el modo es 'audio_completo' (por /subir_audio_completo),
    // o (2) el nombre contiene un hash largo seguido de @elevenLabs (auto-detect)
    const isElevenLabsAudio = originalName && (
      /@elevenLabs/i.test(originalName) ||        // @elevenLabs, @ElevenLabs, @elevenLabsVoicerBot, etc.
      /^[a-f0-9]{20,}@/i.test(originalName)       // hash largo + @
    )
    const isAudioFile = isAudio || (msg.document && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(originalName))

    // IMPORTANTE: este bloque va PRIMERO, antes que el handler de audio F1-F25
    if (isAudioFile && (pendingUploadMode === 'audio_completo' || isElevenLabsAudio)) {
      pendingUploadMode = null // Limpiar modo siempre
      const ext = path.extname(originalName) || '.mp3'
      const filePath = path.join(SCENES_DIR, `narracion_completa${ext}`)

      await bot.sendMessage(CHAT_ID,
        `📥 <b>Descargando narración completa...</b>\n` +
        `🎙️ ${isElevenLabsAudio ? 'Audio de ElevenLabs detectado automáticamente ✨' : 'Guardando como narración completa del día...'}`,
        { parse_mode: 'HTML' }
      )
      try {
        const fileInfo = await bot.getFile(fileId)
        const fileUrl  = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'arraybuffer' })
        fs.writeFileSync(filePath, response.data)
        const sizekB  = Math.round(response.data.byteLength / 1024)

        // Medir duración del audio subido
        const { execFileSync } = require('child_process')
        const ffmpegPath = require('ffmpeg-static')
        const ffprobeDir  = require('path').dirname(ffmpegPath)
        const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
        const ffprobePath = require('path').join(ffprobeDir, ffprobeName)
        let audioDurSecs = 0
        if (fs.existsSync(ffprobePath)) {
          try {
            const out = execFileSync(ffprobePath, [
              '-v', 'error', '-show_entries', 'format=duration',
              '-of', 'default=noprint_wrappers=1:nokey=1', filePath
            ], { encoding: 'utf8', timeout: 15000 }).trim()
            audioDurSecs = parseFloat(out) || 0
          } catch(_) {}
        }

        // Contar clips del día para calcular duración objetivo
        const clipCount = fs.readdirSync(SCENES_DIR)
          .filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') &&
                       !f.includes('proc_') && !f.includes('video_only') && !f.includes('master') &&
                       !f.includes('vertical') && !f.includes('horizontal') && !f.includes('cuadrado'))
          .length
        const targetSecs = clipCount > 0 ? clipCount * 5 : 125 // 5s por clip

        const minutos = Math.floor(audioDurSecs / 60)
        const segundos = Math.round(audioDurSecs % 60)
        const minObj   = Math.floor(targetSecs / 60)
        const segObj   = Math.round(targetSecs % 60)

        await bot.sendMessage(CHAT_ID,
          `✅ <b>¡Narración completa guardada!</b> (${sizekB} KB)\n\n` +
          `🎙️ Duración del audio: <b>${minutos}:${String(segundos).padStart(2,'0')}</b>\n` +
          `🎥 Duración del video (${clipCount} clips × 5s): <b>${minObj}:${String(segObj).padStart(2,'0')}</b>\n\n` +
          `${audioDurSecs > 0 && Math.abs(audioDurSecs - targetSecs) > 2
            ? `⚡ Al ensamblar, el audio se ajustará automáticamente a <b>${minObj}:${String(segObj).padStart(2,'0')}</b>`
            : `✨ El audio encaja perfectamente con el video`}\n\n` +
          `🎵 La música de fondo se mezclará automáticamente al ensamblar.\n` +
          `Escribe <b>listo</b> para iniciar el ensamblaje.`,
          { parse_mode: 'HTML' }
        )
      } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Error guardando narración: ${err.message}`)
      }
      return
    }


    // ── Modo: Subir Música de fondo ───────────────────────────────────────────
    if ((isAudio || (msg.document && /\.(mp3|ogg|m4a|wav|aac)$/i.test(originalName))) && pendingUploadMode && pendingUploadMode.startsWith('musica_')) {
      const tag     = pendingUploadMode.replace('musica_', '')
      pendingUploadMode = null
      const musicDir = path.join(__dirname, '..', 'assets', 'audio', 'music')
      if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true })
      const ext      = path.extname(originalName) || '.mp3'
      const dest     = path.join(musicDir, tag + ext)

      await bot.sendMessage(CHAT_ID, '🎵 Descargando música [' + tag + ']...', { parse_mode: 'Markdown' })
      try {
        const fileInfo = await bot.getFile(fileId)
        const fileUrl  = 'https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + fileInfo.file_path
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'arraybuffer' })
        // Borrar pista anterior si existe con diferente extensión
        const oldFiles = fs.readdirSync(musicDir).filter(f => f.startsWith(tag + '.'))
        oldFiles.forEach(f => { try { fs.unlinkSync(path.join(musicDir, f)) } catch(_){} })
        fs.writeFileSync(dest, response.data)
        const sizekB = Math.round(response.data.byteLength / 1024)
        const mins   = Math.floor(sizekB * 1024 / (128 * 1024 / 8) / 60)
        await bot.sendMessage(CHAT_ID,
          '✅ *Música [' + tag + '] guardada!* (' + sizekB + ' KB)\n\n' +
          '🎵 El bot usará esta pista automáticamente cuando la efeméride del día sea de tipo *' + tag + '*.',
          { parse_mode: 'Markdown' }
        )

        // Listar todas las pistas disponibles
        const allTracks = fs.readdirSync(musicDir).filter(f => /\.(mp3|ogg|m4a|wav)$/i.test(f))
        await bot.sendMessage(CHAT_ID,
          '📁 *Pistas disponibles (' + allTracks.length + '):*\n' +
          allTracks.map(f => '  🎵 ' + f).join('\n'),
          { parse_mode: 'Markdown' }
        )
      } catch (err) {
        await bot.sendMessage(CHAT_ID, '❌ Error guardando música: ' + err.message)
      }
      return
    }


    // ── Modo: Subir Video para Shorts ─────────────────────────────────────────
    if (!isPhoto && mimeType && mimeType.includes('video') && pendingUploadMode === 'shorts_video') {
      pendingUploadMode = null
      await bot.sendMessage(CHAT_ID, '⬇️ Descargando tu video...')
      try {
        const fileInfo = await bot.getFile(fileId)
        const fileUrl  = 'https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + fileInfo.file_path
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'arraybuffer' })
        const localPath = path.join(SCENES_DIR, 'input_shorts_' + TODAY + '.mp4')
        fs.writeFileSync(localPath, response.data)
        const sizeMB = (response.data.byteLength / 1024 / 1024).toFixed(1)
        await bot.sendMessage(CHAT_ID, '✅ Video recibido (' + sizeMB + ' MB). Procesando...')
        await procesarYPublicarShorts(localPath, CHAT_ID)
      } catch(err) {
        await bot.sendMessage(CHAT_ID, '❌ Error: ' + err.message)
      }
      return
    }

    // ── Modo: Subir Audio (narración F1-F25) ──────────────────────────────────
    if ((isAudio || (msg.document && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(originalName))) && pendingUploadMode === 'audio') {
      const audioDir = getAudioDir()
      // Detectar número de frame
      let frameNum = detectFrameNumber(originalName)
      if (!frameNum) {
        audioUploadCounter++
        frameNum = audioUploadCounter
      }
      const ext = path.extname(originalName) || (mimeType.includes('ogg') ? '.ogg' : '.mp3')
      const filename = `audio_F${String(frameNum).padStart(2, '0')}${ext}`
      const filePath = path.join(audioDir, filename)

      await bot.sendMessage(CHAT_ID, `🎤 Guardando audio como *F${frameNum}*...`, { parse_mode: 'Markdown' })
      try {
        const fileInfo = await bot.getFile(fileId)
        const fileUrl  = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'arraybuffer' })
        fs.writeFileSync(filePath, response.data)
        const sizekB = Math.round(response.data.byteLength / 1024)
        // Contar total de audios
        const totalAudios = fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length
        const remaining = 25 - totalAudios
        await bot.sendMessage(CHAT_ID,
          `✅ *Audio F${frameNum} guardado* \`${filename}\` (${sizekB} KB)\n` +
          (remaining > 0
            ? `📬 Tienes *${totalAudios}/25* audios. Faltan *${remaining}* fotogramas.`
            : `🎉 *¡Tienes los 25 audios listos!* Escribe *listo* para ensamblar el video.`),
          { parse_mode: 'Markdown' }
        )
      } catch (err) {
        await bot.sendMessage(CHAT_ID, `❌ Error guardando audio F${frameNum}: ${err.message}`)
      }
      return
    }

    if (!isPhoto && !isAudio && !mimeType.includes('video') && !fileId) {
      await bot.sendMessage(CHAT_ID, '⚠️ Eso no parece un video ni imagen. Reenvíame los archivos correctos.')
      return
    }

    // ── Modo: Subir Portada ───────────────────────────────────────────────
    if (isPhoto && pendingUploadMode === 'portada') {
      pendingUploadMode = null // Limpiar modo
      const filename = `ephemeris_${TODAY}.jpg`
      const filePath = path.join(SCENES_DIR, filename)

      await bot.sendMessage(CHAT_ID, `📥 Descargando la portada de Copilot...`, { parse_mode: 'Markdown' })

      try {
        const fileInfo = await bot.getFile(fileId)
        const fileUrl  = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'stream' })
        const writer   = fs.createWriteStream(filePath)
        response.data.pipe(writer)
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej) })

        await bot.sendMessage(CHAT_ID, `✅ ¡Portada guardada exitosamente!\nEsta imagen será utilizada cuando uses \`/publicar_post\` el día de hoy.`, { parse_mode: 'Markdown' })
        
        try {
          await bot.sendMessage(CHAT_ID, `☁️ Subiendo portada a Google Drive para respaldo...`)
          await uploadToGoogleDrive(filePath, `ephemeris-copilot-${TODAY}.jpg`, 'image/jpeg', TODAY)
          await bot.sendMessage(CHAT_ID, `✅ Portada respaldada en Google Drive.`)
        } catch (e) {
          log('⚠️', `No se pudo respaldar la portada en Drive: ${e.message}`)
        }
      } catch (err) {
        log('❌', `Error descargando portada: ${err.message}`)
        await bot.sendMessage(CHAT_ID, `❌ Error al guardar la portada: ${err.message}`)
      }
      return
    }

    if (isPhoto) {
      if (pendingUploadMode !== 'portada') {
        await bot.sendMessage(CHAT_ID, `⚠️ Recibí una imagen pero no estoy en modo portada. Escribe /subir_portada primero si quieres guardarla como portada de hoy.`)
      }
      return
    }

    // ── Modo: Subir intro o salida ────────────────────────────────────────
    if (pendingUploadMode === 'intro' || pendingUploadMode === 'outro') {
      const mode = pendingUploadMode
      pendingUploadMode = null // Limpiar modo

      const targetDir = mode === 'intro' ? INTRO_DIR : OUTRO_DIR
      const label     = mode === 'intro' ? 'INTRO' : 'SALIDA'
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
      const filename  = `${mode}_${timestamp}.mp4`
      const filePath  = path.join(targetDir, filename)

      await bot.sendMessage(CHAT_ID, `⬇️ Descargando video de *${label}*...`, { parse_mode: 'Markdown' })

      try {
        const fileInfo = await bot.getFile(fileId)
        const fileUrl  = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'stream' })
        const writer   = fs.createWriteStream(filePath)
        response.data.pipe(writer)
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej) })

        const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1)
        const filesInDir = fs.readdirSync(targetDir).filter(f => f.endsWith('.mp4')).length
        log('✅', `${label} guardado: ${filename} (${sizeMB} MB)`)
        await bot.sendMessage(CHAT_ID,
          `✅ *¡Video de ${label} guardado!* \`${filename}\` (${sizeMB} MB)\n` +
          `📁 Tienes *${filesInDir}* versión(es) guardada(s) en la carpeta ${mode}.\n` +
          `🎬 Este video se usará automáticamente al ensamblar todos los videos del mes.`,
          { parse_mode: 'Markdown' }
        )
      } catch (err) {
        log('❌', `Error descargando ${label}: ${err.message}`)
        await bot.sendMessage(CHAT_ID, `❌ Error al guardar el video de ${label}: ${err.message}`)
        pendingUploadMode = null
      }
      return
    }

    // ── Validar que solo videos se guarden como escenas ────────────────────
    const isAudioType = isAudio || (msg.document && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(originalName))
    if (isAudioType) {
      await bot.sendMessage(CHAT_ID, `⚠️ Recibí un archivo de audio/música, pero no indicaste para qué es.\n\nPor favor, usa primero un comando como:\n🎤 /subir_audio\n🎙️ /subir_audio_completo\n🎵 /subir_musica [categoria]\n\nY luego envíame el archivo.`)
      return
    }

    const isVideoFile = !!msg.video || (msg.document && (mimeType.includes('video') || /\.(mp4|mov|avi|mkv)$/i.test(originalName)))
    if (!isVideoFile) {
      await bot.sendMessage(CHAT_ID, `⚠️ Recibí un archivo que no parece ser un video válido. Los clips de escenas deben ser videos (.mp4).`)
      return
    }

    sceneCounter++
    const clipNum  = sceneCounter
    const filename = `${TODAY}_escena_${String(clipNum).padStart(2,'0')}.mp4`
    const filePath = path.join(SCENES_DIR, filename)

    // Agregar a la cola y procesar secuencialmente (evita timeouts en masa)
    downloadQueue.push({ fileId, clipNum, filename, filePath })
    if (!isDownloading) processDownloadQueue()
    return
  }
  });
}