/**
 * bot/services/video-processor.js — Procesamiento de video para Shorts
 *
 * Extraído de callbacks.js para compartirlo entre media.js y callbacks.js.
 * Usa bot-instance para enviar mensajes sin recibir bot como parámetro.
 */
const fs   = require('fs')
const path = require('path')
const state  = require('../state')
const config = require('../config')
const { log } = require('../safe-action')
const { uploadToGoogleDrive } = require('./drive')
const { escapeHTML } = require('../utils/text')
const botInstance = require('../utils/bot-instance')

const { LOGOS_DIR, OUTRO_DIR, BGM_DIR } = config

/**
 * Procesa un video MP4 para formato Shorts 9:16 y ofrece publicarlo.
 * Pipeline: portada(3s) + logo + video principal + outro → concat → Drive → botones publicar
 *
 * @param {string} inputVideoPath  Ruta local al MP4 de entrada
 * @param {number} chatId          Chat ID para enviar mensajes
 */
async function procesarYPublicarShorts(inputVideoPath, chatId) {
  const bot = botInstance.getBot()
  const CHAT_ID = chatId || botInstance.getChatId()

  async function safeSend(text, opts = {}) {
    if (!bot) return
    try { await bot.sendMessage(CHAT_ID, text, opts) }
    catch (e) { log('s?', 'video-processor safeSend: ' + e.message) }
  }

  try {
    const ffmpeg     = require('fluent-ffmpeg')
    const ffmpegPath = require('ffmpeg-static')
    ffmpeg.setFfmpegPath(ffmpegPath)

    await safeSend('🎬 Procesando video para Shorts...')

    // 1. Logo aleatorio
    let logoPath = null
    if (fs.existsSync(LOGOS_DIR)) {
      const logos = fs.readdirSync(LOGOS_DIR).filter(f => /\.(png|jpg)$/i.test(f))
      if (logos.length > 0) logoPath = path.join(LOGOS_DIR, logos[Math.floor(Math.random() * logos.length)])
    }

    // 2. Portada del día
    let portadaPath = null
    const ephFiles = fs.readdirSync(state.SCENES_DIR).filter(f => f.startsWith('ephemeris') && /\.(jpg|jpeg|png)$/i.test(f))
    if (ephFiles.length > 0) portadaPath = path.join(state.SCENES_DIR, ephFiles[0])

    // 3. Outro más reciente
    const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const outroSrc   = outroFiles.length > 0 ? path.join(OUTRO_DIR, outroFiles[0]) : null

    const finalPath    = path.join(state.SCENES_DIR, state.TODAY + '_shorts_final.mp4')
    const processedDir = path.join(state.SCENES_DIR, 'proc_shorts')
    if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true })

    const parts = []

    // 4. Portada → 3 segundos de video
    if (portadaPath) {
      const portadaVid = path.join(processedDir, 'portada_3s.mp4')
      await new Promise((resolve, reject) => {
        let cmd = ffmpeg().input(portadaPath).inputOptions(['-loop', '1'])
        if (logoPath) {
          cmd = cmd.input(logoPath)
          cmd.complexFilter([
            '[1:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.75[logo]',
            '[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[bg]',
            '[bg][logo]overlay=W-w-30:30[v_out]',
            'anullsrc=r=44100:cl=stereo[a_out]'
          ]).outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]',
            '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
            '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '3'])
        } else {
          cmd.complexFilter([
            '[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[v_out]',
            'anullsrc=r=44100:cl=stereo[a_out]'
          ]).outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]',
            '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
            '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '3'])
        }
        cmd.output(portadaVid).on('end', resolve).on('error', reject).run()
      })
      parts.push(portadaVid)
      await safeSend('✅ Portada convertida (3s)')
    }

    // 5. Normalizar video principal
    const bgmPath = path.join(state.SCENES_DIR, 'bgm_active.mp3')
    const hasBgm  = fs.existsSync(bgmPath)
    const mainNorm = path.join(processedDir, 'main_norm.mp4')

    await new Promise((resolve, reject) => {
      let inputsIdx = 1, logoIdx = -1, bgmIdx = -1
      let cmd = ffmpeg().input(inputVideoPath)
      if (logoPath) { cmd = cmd.input(logoPath).inputOptions(['-loop', '1']); logoIdx = inputsIdx++ }
      if (hasBgm)   { cmd = cmd.input(bgmPath);  bgmIdx  = inputsIdx++ }

      const filters = [
        `[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[bg]`
      ]
      if (logoIdx !== -1) {
        filters.push(`[${logoIdx}:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.75[logo]`)
        filters.push(`[bg][logo]overlay=W-w-30:30:shortest=1[v_out]`)
      } else {
        filters.push(`[bg]copy[v_out]`)
      }
      if (bgmIdx !== -1) {
        filters.push(`[${bgmIdx}:a]volume=0.1[bgm]`)
        filters.push(`[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out]`)
      } else {
        filters.push(`[0:a]anull[a_out]`)
      }

      cmd.complexFilter(filters)
        .outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]',
          '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2'])
        .output(mainNorm)
        .on('end', resolve)
        .on('error', (e) => {
          // Fallback: video sin audio original
          log('⚠️', 'Reintentando con audio nulo: ' + e.message)
          try { fs.unlinkSync(mainNorm) } catch (_) {}
          let fbInputsIdx = 2, fbLogoIdx = -1, fbBgmIdx = -1
          let fbCmd = ffmpeg().input(inputVideoPath).input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
          if (logoPath) { fbCmd = fbCmd.input(logoPath).inputOptions(['-loop', '1']); fbLogoIdx = fbInputsIdx++ }
          if (hasBgm)   { fbCmd = fbCmd.input(bgmPath);  fbBgmIdx  = fbInputsIdx++ }
          const fbFilters = [`[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[bg]`]
          if (fbLogoIdx !== -1) {
            fbFilters.push(`[${fbLogoIdx}:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.75[logo]`)
            fbFilters.push(`[bg][logo]overlay=W-w-30:30:shortest=1[v_out]`)
          } else { fbFilters.push(`[bg]copy[v_out]`) }
          if (fbBgmIdx !== -1) {
            fbFilters.push(`[${fbBgmIdx}:a]volume=0.1[bgm]`)
            fbFilters.push(`[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out]`)
          } else { fbFilters.push(`[1:a]anull[a_out]`) }
          fbCmd.complexFilter(fbFilters)
            .outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]',
              '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
              '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest'])
            .output(mainNorm).on('end', resolve).on('error', reject).run()
        }).run()
    })
    parts.push(mainNorm)
    await safeSend('✅ Video principal normalizado')

    // 6. Normalizar outro
    if (outroSrc) {
      const outroNorm = path.join(processedDir, 'outro_norm.mp4')
      await new Promise((resolve, reject) => {
        ffmpeg().input(outroSrc).input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
          .outputOptions(['-y', '-vf',
            'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v', '-map', '1:a',
            '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
            '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '5', '-shortest'])
          .output(outroNorm).on('end', resolve).on('error', reject).run()
      })
      parts.push(outroNorm)
      await safeSend('✅ Outro normalizado')
    }

    // 7. Concatenar todo
    await safeSend('🔗 Concatenando: portada + video + outro...')
    const concatTxt = path.join(processedDir, 'concat_shorts.txt')
    fs.writeFileSync(concatTxt, parts.map(p => "file '" + p.replace(/\\/g, '/') + "'").join('\n'))
    await new Promise((resolve, reject) => {
      ffmpeg().input(concatTxt).inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-y', '-c', 'copy'])
        .output(finalPath).on('end', resolve).on('error', reject).run()
    })

    const sizeMB = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1)
    await safeSend(
      `🎉 *Video Shorts listo!* (${sizeMB} MB)\n` +
      (portadaPath ? '✅ Portada | ' : '⚠️ Sin portada | ') +
      '✅ Video + logo | ' +
      (outroSrc ? '✅ Outro' : '⚠️ Sin outro'),
      { parse_mode: 'Markdown' }
    )

    // 8. Subir a Drive
    try {
      await safeSend('☁️ Subiendo a Google Drive...')
      const url = await uploadToGoogleDrive(finalPath, state.TODAY + '_shorts_processed.mp4')
      await safeSend('✅ Subido a Drive: ' + url, { disable_web_page_preview: true })
    } catch (e) { await safeSend('⚠️ No se pudo subir a Drive: ' + e.message) }

    // 9. Preguntar si publicar
    let postTextPreview = 'Sin descripción disponible. Usa /publicar_post si necesitas que la IA lo redacte.'
    try {
      const txtPath = path.join(state.SCENES_DIR, `05_social_media_post_${state.TODAY}.txt`)
      if (fs.existsSync(txtPath)) postTextPreview = fs.readFileSync(txtPath, 'utf8').substring(0, 300)
    } catch (_) {}

    if (bot) {
      await bot.sendMessage(CHAT_ID,
        `🎥 <b>Previsualización antes de publicar:</b>\n\n` +
        `📁 Archivo: <code>${path.basename(finalPath)}</code>\n` +
        `📦 Tamaño: <b>${sizeMB} MB</b>\n` +
        `🏷️ Formato: 📱 Vertical 9:16 (Shorts)\n\n` +
        `📝 <b>Descripción:</b>\n<pre>${escapeHTML(postTextPreview)}...</pre>\n\n` +
        `¿Publicar en TikTok, Facebook Reels y YouTube Shorts?`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Publicar en todas las plataformas', callback_data: 'confirm_publish_video' }],
              [{ text: '🔄 Regenerar post con IA', callback_data: 'regenerate_post' }],
              [{ text: '❌ Cancelar', callback_data: 'cancel_publish_video' }]
            ]
          }
        }
      )
      bot._pendingVideoPath = finalPath
    }

  } catch (err) {
    log('❌', 'procesarYPublicarShorts error: ' + err.message)
    await safeSend('❌ Error procesando: ' + err.message)
  }
}


/**
 * Publica un video crudo enviado por el usuario, sin concatenaciones.
 *
 * @param {string} inputVideoPath  Ruta local al MP4 de entrada
 * @param {number} chatId          Chat ID para enviar mensajes
 */
async function publicarVideoDirecto(inputVideoPath, chatId) {
  const bot = botInstance.getBot()
  const CHAT_ID = chatId || botInstance.getChatId()

  async function safeSend(text, opts = {}) {
    if (!bot) return
    try { await bot.sendMessage(CHAT_ID, text, opts) }
    catch (e) { log('s?', 'video-processor safeSend: ' + e.message) }
  }

  try {
    await safeSend('🎬 Preparando video directo...')

    const finalPath = path.join(state.SCENES_DIR, state.TODAY + '_direct_final.mp4')
    // Simplemente copiamos el video de entrada a finalPath
    fs.copyFileSync(inputVideoPath, finalPath)

    const sizeMB = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1)
    await safeSend(`🎉 *Video directo listo!* (${sizeMB} MB)\nNo se ha modificado el contenido.`, { parse_mode: 'Markdown' })

    // Subir a Drive para respaldo
    try {
      await safeSend('☁️ Subiendo a Google Drive...')
      const url = await uploadToGoogleDrive(finalPath, state.TODAY + '_direct_processed.mp4')
      await safeSend('✅ Subido a Drive: ' + url, { disable_web_page_preview: true })
    } catch (e) { await safeSend('⚠️ No se pudo subir a Drive: ' + e.message) }

    // Mostrar botones
    let postTextPreview = 'Sin descripción disponible. Usa /publicar_post si necesitas que la IA lo redacte.'
    try {
      const txtPath = path.join(state.SCENES_DIR, `05_social_media_post_${state.TODAY}.txt`)
      if (fs.existsSync(txtPath)) postTextPreview = fs.readFileSync(txtPath, 'utf8').substring(0, 300)
    } catch (_) {}

    if (bot) {
      await bot.sendMessage(CHAT_ID,
        `🎥 <b>Previsualización antes de publicar:</b>\n\n` +
        `📁 Archivo: <code>${path.basename(finalPath)}</code>\n` +
        `📦 Tamaño: <b>${sizeMB} MB</b>\n` +
        `🏷️ Formato: 📱 Video en crudo (Directo)\n\n` +
        `📝 <b>Descripción:</b>\n<pre>${escapeHTML(postTextPreview)}...</pre>\n\n` +
        `¿Publicar en TikTok, Facebook Reels y YouTube Shorts?`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Publicar en todas las plataformas', callback_data: 'confirm_publish_video' }],
              [{ text: '🔄 Regenerar post con IA', callback_data: 'regenerate_post' }],
              [{ text: '❌ Cancelar', callback_data: 'cancel_publish_video' }]
            ]
          }
        }
      )
      bot._pendingVideoPath = finalPath
    }
  } catch (err) {
    log('❌', 'publicarVideoDirecto error: ' + err.message)
    await safeSend('❌ Error procesando: ' + err.message)
  }
}

module.exports = { procesarYPublicarShorts, publicarVideoDirecto }
