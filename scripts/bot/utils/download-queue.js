/**
 * bot/utils/download-queue.js — Cola de descargas secuenciales de clips
 *
 * Extraído de callbacks.js para compartirlo entre media.js y callbacks.js.
 * Utiliza bot-instance para acceder al bot sin pasar referencia manual.
 */
const fs   = require('fs')
const path = require('path')
const axios = require('axios')
const state = require('../state')
const { log } = require('../safe-action')
const botInstance = require('./bot-instance')

/**
 * Procesa la cola de descargas de clips de Meta AI de forma secuencial.
 * Cada clip se intenta hasta 3 veces antes de marcarlo como fallido.
 * Al final reporta al usuario si hubo errores.
 */
async function processDownloadQueue() {
  const { getBot, getChatId } = botInstance
  const bot    = getBot()
  const CHAT_ID = getChatId()

  if (state.isDownloading || state.downloadQueue.length === 0) return
  state.isDownloading = true

  while (state.downloadQueue.length > 0) {
    if (state.cancelRequested) {
      log('🛑', 'Descarga cancelada por el usuario')
      if (bot) await bot.sendMessage(CHAT_ID,
        '🛑 Descarga cancelada. ' + state.receivedScenes.length + ' clips guardados.'
      ).catch(() => {})
      state.cancelRequested = false
      state.isDownloading   = false
      return
    }

    const { fileId, clipNum, filename, filePath } = state.downloadQueue.shift()
    let success = false

    // Intentar hasta 3 veces
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log('📥', `Descargando clip #${clipNum} (intento ${attempt}/3)...`)
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || require('../config').BOT_TOKEN
        const fileUrl = bot
          ? await bot.getFileLink(fileId)
          : `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`

        const resp = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
        fs.writeFileSync(filePath, resp.data)
        state.receivedScenes.push(filePath)
        const sizekB = Math.round(resp.data.byteLength / 1024)
        log('✅', `Clip #${clipNum} guardado: ${filename} (${sizekB} KB)`)

        const pendientes = state.totalScenes > 0 ? state.totalScenes - clipNum : '?'
        if (bot) await bot.sendMessage(CHAT_ID,
          `✅ *Clip #${clipNum} guardado* → \`${filename}\` (${sizekB} KB)\n` +
          (state.totalScenes > 0
            ? (clipNum >= state.totalScenes
              ? `🎬 ¡Eso es todo! Escribe *listo* para armar el video final.`
              : `📬 Faltan *${pendientes}* clip(s) más.`)
            : `📬 Sigue enviando. Cuando termines escribe *listo*.`),
          { parse_mode: 'Markdown' }
        ).catch(() => {})

        success = true
        break
      } catch (err) {
        log('⚠️', `Intento ${attempt} fallido para clip #${clipNum}: ${err.message}`)
        if (attempt < 3) await new Promise(r => setTimeout(r, 3000))
      }
    }

    if (!success) {
      log('❌', `Clip #${clipNum} falló 3 veces, omitido.`)
      state.failedClips.push(clipNum)
      if (bot) await bot.sendMessage(CHAT_ID,
        `⚠️ Clip #${clipNum} falló 3 veces. Lo anoto para avisarte al final.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {})
    }

    await new Promise(r => setTimeout(r, 500))
  }

  state.isDownloading = false

  // Reporte final
  if (bot) {
    if (state.failedClips.length > 0) {
      await bot.sendMessage(CHAT_ID,
        `⚠️ *Descarga terminada con ${state.failedClips.length} error(es)*\n\n` +
        `Los siguientes clips no se pudieron bajar. Por favor reenvíamelos:\n\n` +
        state.failedClips.map(n => `• Video #${n}`).join('\n') +
        `\n\n💡 Envíamelos uno por uno y el bot los agrega automáticamente.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {})
    } else if (state.receivedScenes.length > 0) {
      await bot.sendMessage(CHAT_ID,
        `✅ *¡Todos los ${state.receivedScenes.length} clips descargados correctamente!*\n` +
        `Escribe *listo* para ensamblar el video final.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {})
    }
  }
}

module.exports = { processDownloadQueue }
