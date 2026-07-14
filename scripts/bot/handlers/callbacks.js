const config = require('../config')
const state = require('../state')
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

let globalBot = null;
async function safeSend(text, opts = {}) {
  if (!globalBot) return;
  try { await globalBot.sendMessage(CHAT_ID, text, opts) }
  catch (e) { log('s?', 'No se pudo enviar mensaje: ' + e.message) }
}

module.exports = function registerCallbacks(bot) {
  globalBot = bot;
  bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // Confirmar ensamblaje de video
    if (data === 'confirm_ensamble') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      await bot.sendMessage(chatId, '🎬 ¡Empezando ensamblaje!', { parse_mode: 'Markdown' })
      try {
        await ensamblarVideoFinal()
      } catch (err) {
        log('❌', `Error ensamblando: ${err.message}`)
        await bot.sendMessage(chatId, `❌ Error ensamblando: ${err.message}`)
      }
      return
    }

    // Cancelar ensamblaje
    if (data === 'cancel_ensamble') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      await bot.sendMessage(chatId, '✅ Ensamblaje cancelado. Usa /voz para cambiar la voz o /estado para revisar todo antes de intentar de nuevo.')
      return
    }

    // Confirmar publicación
    if (data === 'confirm_publish_post') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      await bot.sendMessage(chatId, '🚀 Publicando el Post Gráfico en Facebook...');
      try {
        const imgPath = path.join(state.SCENES_DIR, `ephemeris_${state.TODAY}.jpg`);
        const txtPath = path.join(state.SCENES_DIR, `post_text_${state.TODAY}.txt`);

        if (!fs.existsSync(imgPath) || !fs.existsSync(txtPath)) {
          throw new Error('No se encontraron los archivos locales descargados.');
        }

        const postText = fs.readFileSync(txtPath, 'utf-8');
        const postId = await publisher.publishImageToFacebook(imgPath, postText);

        await bot.sendMessage(chatId, `✅ ¡Post publicado exitosamente en Facebook!\n🔗 ID: ${postId}`);
      } catch (err) {
        log('❌', err.message);

        let errorMsg = err.message;
        if (err.response && err.response.data && err.response.data.error) {
          errorMsg = err.response.data.error.message;
        }

        if (errorMsg.includes('code 400') || errorMsg.includes('OAuth') || errorMsg.includes('session has been invalidated') || errorMsg.includes('token')) {
          await bot.sendMessage(chatId,
            `❌ *Error de Autenticación con Facebook*\n\n` +
            `Parece que el **Facebook Page Access Token** ha expirado o es inválido. Esto es normal por políticas de seguridad de Meta.\n\n` +
            `🛠️ **Para solucionarlo:**\n` +
            `1. Ve al [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)\n` +
            `2. Genera un nuevo Page Access Token para tu página\n` +
            `3. Pégalo en tu archivo \`.env.local\` en la variable \`FACEBOOK_PAGE_ACCESS_TOKEN\`\n` +
            `4. Reinicia este bot en la terminal.`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
          );
        } else {
          await bot.sendMessage(chatId, `❌ Error al publicar: ${errorMsg}`);
        }
      }
      return;
    }

    // Cancelar publicación
    if (data === 'cancel_publish_post') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      await bot.sendMessage(chatId, '❌ Publicación cancelada.');
      return;
    }

    // Regenerar publicación
    if (data === 'regenerate_post') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
      const txtPath = path.join(state.SCENES_DIR, `post_text_${state.TODAY}.txt`);
      try {
        if (fs.existsSync(txtPath)) {
          fs.unlinkSync(txtPath);
        }
      } catch (e) {
        log('⚠️', `No se pudo borrar el post para regenerarlo: ${e.message}`);
      }
      await bot.sendMessage(chatId, '🔄 El texto guardado ha sido borrado. Usa `/publicar_post` nuevamente para que la IA genere un texto nuevo (o lo descargue si actualizaste Drive).', { parse_mode: 'Markdown' });
      return;
    }

    // Confirmar publicación de VIDEO
    if (data === 'confirm_publish_video') {
      state.cancelRequested = false;
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      const videoPath = bot._pendingVideoPath
      bot._pendingVideoPath = null
      if (!videoPath || !fs.existsSync(videoPath)) {
        await bot.sendMessage(chatId, '❌ No se encontró el video. Usa /publicar_video de nuevo.')
        return
      }
      await bot.sendMessage(chatId, '🎥 Publicando vertical 9:16 en TikTok + Facebook Reel + YouTube Short...')
      try {
        const { google } = require('googleapis')
        const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

        // Cargar descripción corta
        let postText = 'CodeHistory Daily - Efeméride tecnológica del día \n\n▶️ youtube.com/@CodeHistoryDaily\n🎵 tiktok.com/@codehistorydaily\n📱 facebook.com/CodeHistoryDaily\n\n#CodeHistoryDaily #ATPDev #Tecnologia'
        try {
          const txtPath = path.join(state.SCENES_DIR, 'post_text_' + state.TODAY + '.txt')
          if (fs.existsSync(txtPath)) postText = fs.readFileSync(txtPath, 'utf8')
        } catch (_) { }

        // Estado de publicaciones
        const pubStatePath = path.join(state.SCENES_DIR, 'pub_status_' + state.TODAY + '.json')
        let pubStatus = { tiktok: false, facebook_reel: false, youtube_short: false, youtube_video: false, facebook_video: false }
        if (fs.existsSync(pubStatePath)) {
          try { const old = JSON.parse(fs.readFileSync(pubStatePath, 'utf8')); Object.assign(pubStatus, old) } catch (_) { }
        }

        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const results = {}

        // ── TikTok (vertical 9:16) ──────────────────────────────────────────────
        if (state.cancelRequested) throw new Error('🛑 Proceso cancelado por el usuario.');
        if (pubStatus.tiktok) {
          results.tiktok = '⏭️ Ya publicado'
          await bot.sendMessage(chatId, 'TikTok: ya publicado — omitiendo')
        } else {
          await bot.sendMessage(chatId, '⏳ Subiendo a TikTok...')
          try {
            const pub = require('../services/publisher.js')
            const ttId = await pub.publishToTikTok(videoPath, postText)
            results.tiktok = '✅ Borrador en TikTok — ábrelo y publícalo'
            pubStatus.tiktok = true
          } catch (e) {
            const msg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e)
            results.tiktok = (msg.includes('token') || msg.includes('auth') || msg.includes('401')) ? '❌ Token expirado — renueva TIKTOK_ACCESS_TOKEN' : '❌ ' + msg.substring(0, 250)
          }
          await safeSend('📱 TikTok: ' + results.tiktok)
        }

        // ── Facebook Reel (vertical 9:16) ───────────────────────────────────────
        if (state.cancelRequested) throw new Error('🛑 Proceso cancelado por el usuario.');
        if (pubStatus.facebook_reel) {
          results.facebook_reel = '⏭️ Ya publicado'
          await bot.sendMessage(chatId, 'Facebook Reel: ya publicado — omitiendo')
        } else {
          await bot.sendMessage(chatId, '⏳ Subiendo Facebook Reel (9:16)...')
          try {
            const pub = require('../services/publisher.js')
            const fbId = await pub.publishReelToFacebook(videoPath, postText)
            results.facebook_reel = '✅ ID ' + fbId
            pubStatus.facebook_reel = true
          } catch (e) {
            const msg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e)
            results.facebook_reel = (msg.includes('token') || msg.includes('OAuth') || msg.includes('400') || msg.includes('401') || msg.includes('expired')) ? '❌ Token expirado — renueva FACEBOOK_PAGE_ACCESS_TOKEN' : '❌ ' + msg.substring(0, 250)
          }
          await safeSend('📱 Facebook Reel: ' + results.facebook_reel)
        }

        // ── YouTube Short (vertical 9:16) ───────────────────────────────────────
        if (state.cancelRequested) throw new Error('🛑 Proceso cancelado por el usuario.');
        if (pubStatus.youtube_short) {
          results.youtube_short = '⏭️ Ya publicado'
          await bot.sendMessage(chatId, 'YouTube Short: ya publicado — omitiendo')
        } else {
          await bot.sendMessage(chatId, '⏳ Subiendo YouTube Short (9:16)...')
          try {
            const youtube = google.youtube({ version: 'v3', auth: oauth2 })
            const resYt = await youtube.videos.insert({
              part: 'snippet,status',
              requestBody: {
                snippet: {
                  title: postText.split('\n')[0].substring(0, 85) + ' #Shorts',
                  description: postText + '\n\n#Shorts\n\nMusic by Kevin MacLeod (incompetech.com) Licensed under CC BY 3.0',
                  tags: ['tecnologia', 'programacion', 'historia', 'shorts', 'CodeHistoryDaily']
                },
                status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
              },
              media: { body: fs.createReadStream(videoPath) }
            })
            results.youtube_short = '✅ ID ' + resYt.data.id
            pubStatus.youtube_short = true
          } catch (e) { results.youtube_short = '❌ ' + e.message.substring(0, 150) }
          await safeSend('▶️ YouTube Short: ' + results.youtube_short)
        }

        // Guardar estado
        fs.writeFileSync(pubStatePath, JSON.stringify(pubStatus, null, 2), 'utf8')

        const yt = results.youtube_short || '⏭️'
        const tt = results.tiktok || '⏭️'
        const fb = results.facebook_reel || '⏭️'
        await bot.sendMessage(chatId,
          '<b>📊 Resumen Publicación Vertical 9:16:</b>\n\n' +
          '📱 TikTok: ' + esc(tt) + '\n' +
          '📱 FB Reel: ' + esc(fb) + '\n' +
          '▶️ YT Short: ' + esc(yt) + '\n\n' +
          '💡 Para YouTube Video + Facebook Video (16:9) usa: /publicar_video_16x9',
          { parse_mode: 'HTML' }
        )
      } catch (err) {
        await safeSend('❌ Error: ' + err.message)
      }
      return
    }

    if (data === 'confirm_publish_16x9') {
      state.cancelRequested = false;
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      const horizPath = bot._pendingHorizPath
      bot._pendingHorizPath = null
      if (!horizPath || !fs.existsSync(horizPath)) {
        await bot.sendMessage(chatId, '❌ No se encontró el archivo. Usa /publicar_video_16x9 de nuevo.')
        return
      }

      // Leer descripción SEO o generar si no existe
      let longDesc = ''
      try {
        const ytDescPath = path.join(path.dirname(horizPath), 'yt_description_' + state.TODAY + '.txt')
        const postTxtPath = path.join(path.dirname(horizPath), 'post_text_' + state.TODAY + '.txt')
        const narrationPath = path.join(path.dirname(horizPath), 'narration_full.txt')
        if (fs.existsSync(ytDescPath)) {
          longDesc = fs.readFileSync(ytDescPath, 'utf8')
        } else {
          await bot.sendMessage(chatId, '🤖 Generando descripción SEO con Groq...')
          const narText = fs.existsSync(narrationPath) ? fs.readFileSync(narrationPath, 'utf8') : ''
          const postText = fs.existsSync(postTxtPath) ? fs.readFileSync(postTxtPath, 'utf8') : ''
          const seoDesc = await generateYouTubeDescription(narText, postText)
          if (seoDesc) {
            longDesc = seoDesc
            fs.writeFileSync(ytDescPath, seoDesc, 'utf8')
            await bot.sendMessage(chatId, '✅ Descripción SEO generada (' + seoDesc.length + ' chars)')
          } else {
            longDesc = postText || 'CodeHistory Daily - Efeméride tecnológica'
          }
        }
      } catch (e) { log('⚠️', 'Error leyendo descripción: ' + e.message) }

      try {
        const { google } = require('googleapis')
        const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

        // YouTube Video 16:9
        if (state.cancelRequested) throw new Error('🛑 Proceso cancelado por el usuario.');
        await bot.sendMessage(chatId, '⏳ Subiendo a YouTube Video (16:9)...')
        let ytRes = ''
        try {
          const youtube = google.youtube({ version: 'v3', auth: oauth2 })
          const titleBase = longDesc.split('\n')[0].substring(0, 90)
          const resYt = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
              snippet: {
                title: titleBase,
                description: longDesc,
                tags: ['tecnologia', 'programacion', 'historia', 'CodeHistoryDaily', 'efemeride', 'HistoriaTech']
              },
              status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
            },
            media: { body: fs.createReadStream(horizPath) }
          })
          ytRes = '▶️ YouTube: ✅ ID ' + resYt.data.id
        } catch (e) { ytRes = '▶️ YouTube: ❌ ' + e.message.substring(0, 150) }
        await safeSend(ytRes)

        // Facebook Video 16:9
        if (state.cancelRequested) throw new Error('🛑 Proceso cancelado por el usuario.');
        await bot.sendMessage(chatId, '⏳ Subiendo a Facebook Video (16:9)...')
        let fbRes = ''
        try {
          const fbId = await require('../services/publisher.js').publishReelToFacebook(horizPath, longDesc)
          fbRes = '📘 Facebook: ✅ ID ' + fbId
        } catch (e) {
          const msg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e)
          fbRes = '📘 Facebook: ' + (msg.includes('token') || msg.includes('OAuth') ? 'Token expirado — renueva FACEBOOK_PAGE_ACCESS_TOKEN' : msg.substring(0, 200))
        }
        await safeSend(fbRes)

        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        await bot.sendMessage(chatId,
          '<b>📊 Resumen Video 16:9:</b>\n\n' + esc(ytRes) + '\n' + esc(fbRes),
          { parse_mode: 'HTML' }
        )
      } catch (err) {
        await bot.sendMessage(chatId, '❌ Error: ' + err.message)
      }
      return
    }


    // Shorts desde Drive automático
    if (data === 'shorts_from_drive') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      await bot.sendMessage(chatId, '🔍 Buscando video de hoy en Google Drive...')
      try {
        const { google } = require('googleapis')
        const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
        const drive = google.drive({ version: 'v3', auth: oauth2 })

        // Formatos de fecha posibles: DD-MM-YYYY, YYYY-MM-DD, DD_MM_YYYY
        const d = new Date()
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        const datePatterns = [
          dd + '-' + mm + '-' + yyyy,
          yyyy + '-' + mm + '-' + dd,
          dd + '_' + mm + '_' + yyyy,
          state.TODAY
        ]

        // Buscar la carpeta del día actual
        const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
        const folderSearch = await drive.files.list({
          q: `'${rootId}' in parents and name='${state.TODAY}' and mimeType='application/vnd.google-apps.folder'`,
          fields: 'files(id,name)'
        })
        const dayFolder = folderSearch.data.files[0]

        let foundFile = null
        if (dayFolder) {
          // Buscar el video dentro de la carpeta del día
          for (const pat of datePatterns) {
            const res = await drive.files.list({
              q: `'${dayFolder.id}' in parents and name contains '${pat}' and trashed=false and mimeType != 'application/vnd.google-apps.vid'`,
              fields: 'files(id,name,size,mimeType)',
              pageSize: 10
            })
            if (res.data.files && res.data.files.length > 0) {
              // Filtrar estrictamente archivos de video (ignorar portadas png/jpg)
              const videoFiles = res.data.files.filter(f => f.mimeType.includes('video') || f.name.toLowerCase().endsWith('.mp4') || f.name.toLowerCase().endsWith('.mov'))
              if (videoFiles.length > 0) {
                // Preferir el más grande (video completo)
                foundFile = videoFiles.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0]
                break
              }
            }
          }
        }

        if (!foundFile) {
          let debugMsg = `❌ No encontré ningún video MP4 de hoy en Drive.\n\n`
          if (!dayFolder) {
            debugMsg += `⚠️ No se encontró la carpeta del día (\`${state.TODAY}\`) en Drive.\n`
          } else {
            debugMsg += `📂 Busqué en la carpeta \`${state.TODAY}\` los patrones: ${datePatterns.join(', ')}\n`
          }
          await bot.sendMessage(chatId,
            debugMsg + '\nSube el archivo MP4 a la carpeta de hoy en Drive y vuelve a intentarlo, o envíame el video manualmente.',
            { parse_mode: 'Markdown' }
          )
          return
        }

        await bot.sendMessage(chatId,
          '✅ Video encontrado: *' + foundFile.name + '* (' + Math.round(Number(foundFile.size || 0) / 1024 / 1024) + ' MB)\n' +
          '⬇️ Descargando...',
          { parse_mode: 'Markdown' }
        )

        // Si es un archivo de Google Workspace (Google Vids, Docs, etc.), exportar como MP4
        let downloadId = foundFile.id
        if (foundFile.mimeType === 'application/vnd.google-apps.shortcut') {
          await bot.sendMessage(chatId, '🔗 Es un acceso directo, obteniendo archivo real...')
          const shortcutMeta = await drive.files.get({
            fileId: foundFile.id,
            fields: 'shortcutDetails(targetId,targetMimeType)'
          })
          downloadId = shortcutMeta.data.shortcutDetails && shortcutMeta.data.shortcutDetails.targetId
          if (!downloadId) throw new Error('No se pudo obtener el archivo real del acceso directo')
        }

        // Obtener mimeType real del archivo
        const fileMeta = await drive.files.get({ fileId: downloadId, fields: 'id,name,mimeType' })
        const realMimeType = fileMeta.data.mimeType
        await bot.sendMessage(chatId, '📄 Tipo de archivo: ' + realMimeType)

        const localPath = path.join(state.SCENES_DIR, 'input_shorts_' + state.TODAY + '.mp4')
        const dest = require('fs').createWriteStream(localPath)

        let dlRes
        if (realMimeType === 'application/vnd.google-apps.vid') {
          // Limitación oficial de Google Drive API (Catch-22): 
          // No soporta export ni get(alt=media) para Google Vids aún.
          throw new Error(
            'El archivo encontrado es un **Proyecto de Google Vids**.\n\n' +
            '⚠️ *Limitación de Google:* Actualmente la API de Google no permite descargar ni exportar proyectos de Vids automáticamente.\n\n' +
            '🛠️ *Solución:*\n' +
            '1. Abre Google Vids en tu navegador.\n' +
            '2. Exporta el video como **MP4**.\n' +
            '3. Súbelo a Telegram usando la Opción 1 (*"Voy a enviar el video ahora"*).'
          )
        } else if (realMimeType && realMimeType.includes('vnd.google-apps')) {
          // Archivos de Google Workspace (Docs, Slides, etc) se exportan
          await bot.sendMessage(chatId, '⏳ Exportando archivo de Google Workspace como MP4...')
          dlRes = await drive.files.export({ fileId: downloadId, mimeType: 'video/mp4' }, { responseType: 'stream' })
        } else {
          // Archivos binarios normales (ej: un MP4 subido a Drive)
          dlRes = await drive.files.get({ fileId: downloadId, alt: 'media' }, { responseType: 'stream' })
        }

        const statusMsg = await bot.sendMessage(chatId, '⏳ Iniciando descarga: 0%')

        const { Transform } = require('stream')
        let downloadedBytes = 0
        const totalBytes = Number(foundFile.size || 0)
        let lastReport = 0

        const progressTracker = new Transform({
          transform(chunk, encoding, callback) {
            downloadedBytes += chunk.length
            if (totalBytes > 0) {
              const percent = Math.floor((downloadedBytes / totalBytes) * 100)
              if (percent >= lastReport + 10) {
                lastReport = percent
                bot.editMessageText(`⬇️ Descargando: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`, { chat_id: chatId, message_id: statusMsg.message_id }).catch(() => { })
              }
            }
            this.push(chunk)
            callback()
          }
        })

        const { pipeline } = require('stream/promises')
        await pipeline(dlRes.data, progressTracker, dest)

        const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1)
        await bot.editMessageText(`✅ Descarga completada (${sizeMB} MB). Iniciando procesamiento...`, { chat_id: chatId, message_id: statusMsg.message_id }).catch(() => { })

        // Procesar y publicar
        await procesarYPublicarShorts(localPath, chatId)
      } catch (err) {
        log('❌', 'Error en shorts_from_drive: ' + err.message)
        await bot.sendMessage(chatId,
          `⚠️ *Ocurrió un problema de conexión o procesamiento:*\n\n` +
          `\`${err.message}\`\n\n` +
          `Esto suele deberse a problemas temporales de conexión a Internet con Google Drive o Telegram. ¿Qué deseas hacer?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔄 Reintentar Escanear Drive', callback_data: 'shorts_from_drive' }
                ],
                [
                  { text: '❌ Cancelar', callback_data: 'cancel_publish_video' }
                ]
              ]
            }
          }
        )
      }
      return
    }

    // Shorts upload manual — activar modo espera
    if (data === 'shorts_manual_upload') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      state.pendingUploadMode = 'shorts_video'
      await bot.sendMessage(chatId,
        '📤 *Modo: Subir video para Shorts activado*\n\nEnvíame ahora el video (MP4, MOV, etc.).',
        { parse_mode: 'Markdown' }
      )
      return
    }


    // Confirmar publicar shorts procesado
    if (data === 'confirm_publish_shorts') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      // Reusar el flujo de confirm_publish_video (ya tiene el path en bot._pendingVideoPath)
      // Simular el callback de confirm_publish_video
      const fakeCallbackQuery = { ...callbackQuery, data: 'confirm_publish_video' }
      // Re-emit with confirm_publish_video
      bot._pendingVideoPath = bot._pendingVideoPath
      await bot.sendMessage(chatId, '🚀 Iniciando publicación...')
      // Trigger publish directly
      bot.emit('callback_query', { ...callbackQuery, data: 'confirm_publish_video', message: callbackQuery.message })
      return
    }

    if (data === 'cancel_publish_video') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      bot._pendingVideoPath = null
      await bot.sendMessage(chatId, '❌ Publicación cancelada.')
      return
    }

    // Mostrar selector de voz desde el resumen pre-ensamblaje
    if (data === 'pre_ensamble_voz') {
      await bot.answerCallbackQuery(callbackQuery.id)
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇲🇽 Jorge (Hombre - México)', callback_data: 'voicepre_es-MX-JorgeNeural' },
              { text: '🇪🇸 Elvira (Mujer - España)', callback_data: 'voicepre_es-ES-ElviraNeural' }
            ],
            [
              { text: '🇲🇽 Dalia (Mujer - México)', callback_data: 'voicepre_es-MX-DaliaNeural' },
              { text: '🇪🇸 Álvaro (Hombre - España)', callback_data: 'voicepre_es-ES-AlvaroNeural' }
            ],
            [
              { text: '↩️ Volver al resumen', callback_data: 'back_to_resumen' }
            ]
          ]
        }
      }
      await bot.sendMessage(CHAT_ID, `🗣️ *Selecciona la voz para el video:*\n\n_(Motor actual: ${state.motorVozActivo})_`, { parse_mode: 'Markdown', ...opts })
      return
    }

    // Selección de voz desde el resumen pre-ensamblaje (regresa al resumen con voz actualizada)
    if (data.startsWith('voicepre_')) {
      const selectedVoice = data.replace('voicepre_', '')
      state.motorVozActivo = selectedVoice
      await bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Voz: ${state.motorVozActivo}` })

      // Limpiar audios TTS previos para regenerar con la nueva voz
      const oldTTS = fs.readdirSync(state.SCENES_DIR).filter(f => f.startsWith('voiceover_') && f.endsWith('.mp3'))
      oldTTS.forEach(f => { try { fs.unlinkSync(path.join(state.SCENES_DIR, f)) } catch (_) { } })

      const existingClips = fs.readdirSync(state.SCENES_DIR).filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') && !f.includes('proc_'))
      const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const hasScript = fs.existsSync(path.join(state.SCENES_DIR, 'script.json'))
      const audioDir = getAudioDir()
      const uploadedAudios = fs.existsSync(audioDir)
        ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length : 0
      const audioStatus = uploadedAudios > 0 ? `✅ ${uploadedAudios} audios subidos manualmente` : (hasScript ? `✅ TTS con ${state.motorVozActivo}` : `⚠️ Sin guion`)

      const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `🗣️ Cambiar voz (actual: ${state.motorVozActivo.replace('es-MX-', '').replace('es-ES-', '').replace('Neural', '')})`, callback_data: 'pre_ensamble_voz' }
            ],
            [
              { text: '🎬 ¡Ensamblar con esta voz!', callback_data: 'confirm_ensamble' },
              { text: '❌ Cancelar', callback_data: 'cancel_ensamble' }
            ]
          ]
        }
      }
      await bot.sendMessage(CHAT_ID,
        `✅ *Voz actualizada a: ${state.motorVozActivo}*\n${oldTTS.length > 0 ? `🔄 Se borraron ${oldTTS.length} audios TTS anteriores para regenerar con la nueva voz.\n` : ''}\n` +
        `🎬 *Resumen listo para ensamblar:*\n\n` +
        `🎥 Clips: *${existingClips.length}*\n` +
        `🗣️ Voz TTS: *${state.motorVozActivo}*\n` +
        `📢 Audio: ${audioStatus}\n` +
        `🎬 Intro: ${introFiles.length > 0 ? `✅ \`${introFiles[0]}\`` : '⚠️ Sin intro'}\n` +
        `🏁 Salida: ${outroFiles.length > 0 ? `✅ \`${outroFiles[0]}\`` : '⚠️ Sin salida'}\n\n` +
        `👆 *¿Listo? Toca «Ensamblar»:*`,
        opts
      )
      return
    }

    // Volver al resumen (sin cambiar voz)
    if (data === 'back_to_resumen') {
      await bot.answerCallbackQuery(callbackQuery.id)
      const existingClips = fs.readdirSync(state.SCENES_DIR).filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') && !f.includes('proc_'))
      const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const hasScript = fs.existsSync(path.join(state.SCENES_DIR, 'script.json'))
      const audioDir = getAudioDir()
      const uploadedAudios = fs.existsSync(audioDir)
        ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length : 0
      const ttsAudios = fs.readdirSync(state.SCENES_DIR).filter(f => f.startsWith('voiceover_') && f.endsWith('.mp3')).length
      const totalAudios = uploadedAudios + ttsAudios
      const audioStatus = totalAudios > 0
        ? `✅ ${totalAudios} audios (${uploadedAudios} subidos + ${ttsAudios} TTS)`
        : `⚠️ Sin audios — el video tendrá silencio`
      const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `🗣️ Cambiar voz (actual: ${state.motorVozActivo.replace('es-MX-', '').replace('es-ES-', '').replace('Neural', '')})`, callback_data: 'pre_ensamble_voz' }
            ],
            [
              { text: '🎬 ¡Ensamblar con esta voz!', callback_data: 'confirm_ensamble' },
              { text: '❌ Cancelar', callback_data: 'cancel_ensamble' }
            ]
          ]
        }
      }
      await bot.sendMessage(CHAT_ID,
        `🎬 *Resumen antes de ensamblar:*\n\n` +
        `🎥 Clips: *${existingClips.length}*\n` +
        `🗣️ Voz TTS: *${state.motorVozActivo}*\n` +
        `🎙️ Guion/Audios: ${hasScript ? `✅ script.json cargado` : (totalAudios > 0 ? `✅ audios subidos` : `⚠️ Sin guion`)}\n` +
        `📢 Estado audio: ${audioStatus}\n` +
        `🎬 Intro: ${introFiles.length > 0 ? `✅ \`${introFiles[0]}\`` : '⚠️ Sin intro'}\n` +
        `🏁 Salida: ${outroFiles.length > 0 ? `✅ \`${outroFiles[0]}\`` : '⚠️ Sin salida'}\n\n` +
        `👆 *Cambia la voz si necesitas, o toca «Ensamblar»:*`,
        opts
      )
      return
    }

    // Cambiar voz (desde /voz)
    if (data.startsWith('voice_')) {
      const selectedVoice = data.replace('voice_', '');

      if (selectedVoice === 'voicebox') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Voicebox requiere configuración local previa. Aún no disponible.' });
        return;
      }

      state.motorVozActivo = selectedVoice;
      await bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Voz cambiada a: ${state.motorVozActivo}` });
      await bot.sendMessage(CHAT_ID, `✅ Voz actualizada a: *${state.motorVozActivo}*`, { parse_mode: 'Markdown' });
    }

    // ── Eliminar intro por índice ──────────────────────────────────────────────
    if (data.startsWith('di:')) {
      const idx = data.replace('di:', '')
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      if (idx === 'ALL') {
        const files = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')) : []
        files.forEach(f => { try { fs.unlinkSync(path.join(INTRO_DIR, f)) } catch (_) { } })
        bot._introFilesList = []
        await bot.sendMessage(chatId, `🗑️ *${files.length}* intros eliminados.`, { parse_mode: 'Markdown' })
      } else {
        const files = bot._introFilesList || []
        const filename = files[parseInt(idx)]
        if (!filename) { await bot.sendMessage(chatId, '❌ Índice no válido. Usa /eliminar_intro de nuevo.'); return }
        try {
          fs.unlinkSync(path.join(INTRO_DIR, filename))
          bot._introFilesList = []
          await bot.sendMessage(chatId, `✅ Eliminado: \`${filename}\``, { parse_mode: 'Markdown' })
        } catch (e) { await bot.sendMessage(chatId, `❌ No se pudo eliminar: ${e.message}`) }
      }
      await bot.answerCallbackQuery(callbackQuery.id)
      return
    }

    // ── Eliminar outro por índice ──────────────────────────────────────────────
    if (data.startsWith('do:')) {
      const idx = data.replace('do:', '')
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
      if (idx === 'ALL') {
        const files = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')) : []
        files.forEach(f => { try { fs.unlinkSync(path.join(OUTRO_DIR, f)) } catch (_) { } })
        bot._outroFilesList = []
        await bot.sendMessage(chatId, `🗑️ *${files.length}* salidas eliminadas.`, { parse_mode: 'Markdown' })
      } else {
        const files = bot._outroFilesList || []
        const filename = files[parseInt(idx)]
        if (!filename) { await bot.sendMessage(chatId, '❌ Índice no válido. Usa /eliminar_salida de nuevo.'); return }
        try {
          fs.unlinkSync(path.join(OUTRO_DIR, filename))
          bot._outroFilesList = []
          await bot.sendMessage(chatId, `✅ Eliminada: \`${filename}\``, { parse_mode: 'Markdown' })
        } catch (e) { await bot.sendMessage(chatId, `❌ No se pudo eliminar: ${e.message}`) }
      }
      await bot.answerCallbackQuery(callbackQuery.id)
      return
    }
  })

  // ── Cola de descargas secuenciales (1 a 1) ──────────────────────────
  async function processDownloadQueue() {
    if (state.isDownloading || state.downloadQueue.length === 0) return
    state.isDownloading = true

    while (state.downloadQueue.length > 0) {
      if (state.cancelRequested) {
        log('🛑', 'Descarga cancelada')
        await bot.sendMessage(CHAT_ID, '🛑 Descarga cancelada. ' + state.receivedScenes.length + ' clips guardados.')
        state.cancelRequested = false; state.isDownloading = false; return
      }
      const { fileId, clipNum, filename, filePath } = state.downloadQueue.shift()
      let success = false

      // Intentar hasta 3 veces
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          log('📥', `Descargando clip #${clipNum} (intento ${attempt}/3)...`)
          const fileUrl = await bot.getFileLink(fileId)
          const resp = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
          fs.writeFileSync(filePath, resp.data)
          state.receivedScenes.push(filePath)
          const sizekB = Math.round(resp.data.byteLength / 1024)
          log('✅', `Clip #${clipNum} guardado: ${filename} (${sizekB} KB)`)

          const pendientes = state.totalScenes > 0 ? state.totalScenes - clipNum : '?'
          await bot.sendMessage(CHAT_ID,
            `✅ *Clip #${clipNum} guardado* → \`${filename}\` (${sizekB} KB)\n` +
            (state.totalScenes > 0
              ? (clipNum >= state.totalScenes
                ? `🎬 ¡Eso es todo! Escribe *listo* para armar el video final.`
                : `📬 Faltan *${pendientes}* clip(s) más.`)
              : `📬 Sigue enviando. Cuando termines escribe *listo*.`),
            { parse_mode: 'Markdown' }
          )
          success = true
          break
        } catch (err) {
          log('⚠️', `Intento ${attempt} fallido para clip #${clipNum}: ${err.message}`)
          if (attempt < 3) await new Promise(r => setTimeout(r, 3000))
        }
      }

      if (!success) {
        log('❌', `Clip #${clipNum} falló 3 veces, omitido.`)
        state.failedClips.push(clipNum) // 📌 Registrar para el reporte final
        await bot.sendMessage(CHAT_ID,
          `⚠️ Clip #${clipNum} falló 3 veces. Lo anoto para avisarte al final.`,
          { parse_mode: 'Markdown' }
        )
      }

      await new Promise(r => setTimeout(r, 500))
    }

    state.isDownloading = false

    // 📌 Reporte final cuando la cola se vacía
    if (state.failedClips.length > 0) {
      await bot.sendMessage(CHAT_ID,
        `⚠️ *Descarga terminada con ${state.failedClips.length} error(es)*\n\n` +
        `Los siguientes clips no se pudieron bajar. Por favor reenvíamelos de nuevo:\n\n` +
        state.failedClips.map(n => `• Video #${n}`).join('\n') +
        `\n\n💡 Envíamelos uno por uno y el bot los agregará automáticamente al lote.`,
        { parse_mode: 'Markdown' }
      )
    } else if (state.downloadQueue.length === 0 && state.receivedScenes.length > 0) {
      await bot.sendMessage(CHAT_ID,
        `✅ *¡Todos los ${state.receivedScenes.length} clips descargados correctamente!*\n` +
        `Escribe *listo* para ensamblar el video final.`,
        { parse_mode: 'Markdown' }
      )
    }

  } // ── fin processDownloadQueue

  // ── Enviar escenas desde Supabase ─────────────────────────────────────────────
  async function enviarEscenasDeHoy(specificDate = null) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      await bot.sendMessage(CHAT_ID, '⚠️ Supabase no está configurado. No puedo leer las escenas del día.')
      return
    }

    try {
      let queryUrl = `${SUPABASE_URL}/rest/v1/daily_content?order=date.desc&limit=1`

      if (specificDate) {
        await bot.sendMessage(CHAT_ID, `🔍 Buscando escenas para la fecha *${specificDate}*...`, { parse_mode: 'Markdown' })
        queryUrl = `${SUPABASE_URL}/rest/v1/daily_content?date=eq.${specificDate}&limit=1`
        state.TODAY = specificDate // Actualizamos el estado para que los videos se guarden con esta fecha
      } else {
        await bot.sendMessage(CHAT_ID, `🔍 Buscando la efeméride *más reciente* generada...`, { parse_mode: 'Markdown' })
      }

      const res = await axios.get(queryUrl, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      })
      const data = res.data

      if (!Array.isArray(data) || data.length === 0) {
        await bot.sendMessage(CHAT_ID, `⚠️ No encontré ninguna efeméride. Ejecuta primero el script de generación.`)
        return
      }

      const ephemeris = data[0]

      // Si buscamos la más reciente, actualizamos state.TODAY a la fecha encontrada
      if (!specificDate) {
        state.TODAY = ephemeris.date
      } else {
        state.TODAY = specificDate
      }
      state.SCENES_DIR = path.join(SCENES_BASE_DIR, state.TODAY);
      if (!fs.existsSync(state.SCENES_DIR)) fs.mkdirSync(state.SCENES_DIR, { recursive: true });

      const scenes = ephemeris.scenes || []

      if (scenes.length === 0) {
        await bot.sendMessage(CHAT_ID,
          `📖 *Efeméride encontrada:*\n"${ephemeris.ephemeris_text.substring(0, 100)}..."\n\n` +
          `⚠️ No hay escenas generadas aún. Ejecuta el script de generación de contenido primero.`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Aplanar todas las escenas y fotogramas en una sola lista para el bot
      let allFrames = []
      scenes.forEach((scene, sceneIndex) => {
        if (scene.frames && Array.isArray(scene.frames) && scene.frames.length > 0) {
          // Formato nuevo (v2.1): múltiples fotogramas por escena
          scene.frames.forEach((frame, frameIndex) => {
            allFrames.push({
              sceneNumber: sceneIndex + 1,
              frameNumber: frameIndex + 1,
              imageUrl: frame.image_url,
              prompt: frame.animation_prompt || frame.frame_prompt
            })
          })
        } else {
          // Formato antiguo (v1): una imagen por escena
          allFrames.push({
            sceneNumber: sceneIndex + 1,
            frameNumber: 1,
            imageUrl: scene.image_url,
            prompt: scene.animation_prompt || scene.image_prompt
          })
        }
      })

      state.totalScenes = allFrames.length
      await bot.sendMessage(CHAT_ID,
        `✅ *Efeméride encontrada (${ephemeris.date}):*\n"${ephemeris.ephemeris_text.substring(0, 100)}..."\n\n` +
        `🎬 Tengo *${state.totalScenes} fotogramas* para animar (en ${scenes.length} escenas).\n` +
        `📌 Te las envío una por una. Para cada una:\n` +
        `  1️⃣ Reenvía la imagen a *Meta AI* en WhatsApp\n` +
        `  2️⃣ Pega el prompt de texto junto a la imagen\n` +
        `  3️⃣ Meta AI genera el video → reenvíamelo aquí`,
        { parse_mode: 'Markdown' }
      )

      // Enviar cada fotograma con su imagen y prompt
      for (let i = 0; i < allFrames.length; i++) {
        const frameItem = allFrames[i]
        await new Promise(r => setTimeout(r, 2000)) // Pausa de 2s para evitar ban de spam de Telegram

        const escapeHTML = str => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const promptText = escapeHTML(frameItem.prompt || 'Haz un video animado de esta imagen con efecto cinematográfico')

        const caption =
          `🎬 <b>Escena ${frameItem.sceneNumber} - Fotograma ${frameItem.frameNumber}</b> (${i + 1}/${allFrames.length})\n\n` +
          `📝 <b>Prompt para Meta AI:</b>\n` +
          `<i>${promptText}</i>\n\n` +
          `👆 Reenvía a Meta AI con el prompt de arriba.`

        if (frameItem.imageUrl) {
          // Descargar la imagen localmente antes de enviar a Telegram
          // (Telegram no puede acceder directamente a URLs de Pollinations)
          const tempImgPath = path.join(state.SCENES_DIR, `temp_frame_${i + 1}.jpg`)
          let imgDownloaded = false;

          // Intentar hasta 3 veces si Pollinations tarda mucho en responder
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const imgResp = await axios.get(frameItem.imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
              })
              fs.writeFileSync(tempImgPath, imgResp.data)
              imgDownloaded = true;
              break;
            } catch (imgErr) {
              log('⚠️', `Intento ${attempt}/3 fallido al descargar fotograma ${i + 1}: ${imgErr.message}`)
              if (attempt < 3) await new Promise(r => setTimeout(r, 5000)); // Esperar 5s antes de reintentar
            }
          }

          if (imgDownloaded) {
            try {
              await bot.sendPhoto(CHAT_ID, tempImgPath, { caption, parse_mode: 'HTML' })
              fs.unlinkSync(tempImgPath) // Limpiar después de enviar
            } catch (telegramErr) {
              log('❌', `Error al enviar foto a Telegram: ${telegramErr.message}`)
              await bot.sendMessage(CHAT_ID, caption, { parse_mode: 'HTML' })
            }
          } else {
            log('❌', `Fallo definitivo al descargar fotograma ${i + 1}. Enviando solo texto.`)
            await bot.sendMessage(CHAT_ID, caption, { parse_mode: 'HTML' })
          }
        } else {
          await bot.sendMessage(CHAT_ID, caption, { parse_mode: 'HTML' })
        }


        log('📤', `Fotograma ${i + 1}/${allFrames.length} enviado`)
      }

      await bot.sendMessage(CHAT_ID,
        `✅ ¡Listo! Te envié las *${state.totalScenes} escenas*.\n` +
        `Cuando hayas generado todos los videos con Meta AI y me los hayas reenviado, escribe: *listo*`,
        { parse_mode: 'Markdown' }
      )

    } catch (err) {
      log('❌', `Error consultando Supabase: ${err.message}`)
      await bot.sendMessage(CHAT_ID, `❌ Error consultando la base de datos: ${err.message}`)
    }
  }

  // ── Normalizar clip a codec estándar (1080x1920, libx264, aac) ──────────────
  function normalizeClip(ffmpegFactory, inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      // Primer intento: escalar video + usar audio original si existe
      ffmpegFactory()
        .input(inputPath)
        .outputOptions([
          '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
          '-map', '0:v:0',
          '-map', '0:a', // Enforzar que exista el stream, si no existe falla y pasa al fallback
          '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2',
          '-t', '5'
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => {
          // Fallback: añadir audio de silencio si el clip no tiene stream de audio
          log('⚠️', `Reintentando normalización con audio de silencio: ${err.message}`)
          try { fs.unlinkSync(outputPath) } catch (_) { }
          ffmpegFactory()
            .input(inputPath)
            .input('anullsrc=r=44100:cl=stereo')
            .inputOptions(['-f', 'lavfi'])
            .outputOptions([
              '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
              '-map', '0:v:0', '-map', '1:a',
              '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
              '-c:a', 'aac', '-ar', '44100', '-ac', '2',
              '-t', '5', '-shortest'
            ])
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run()
        })
        .run()
    })
  }


  // ── Procesar video para Shorts: portada + logo + video + outro ────────────────
  async function procesarYPublicarShorts(inputVideoPath, chatId) {
    try {
      const ffmpeg = require('fluent-ffmpeg')
      const ffmpegPath = require('ffmpeg-static')
      ffmpeg.setFfmpegPath(ffmpegPath)

      await safeSend('🎬 Procesando video shorts...')

      // 1. Logo random de assets/images/logos/
      let logoPath = null
      if (fs.existsSync(LOGOS_DIR)) {
        const logos = fs.readdirSync(LOGOS_DIR).filter(f => /\.(png|jpg)$/i.test(f))
        if (logos.length > 0) logoPath = path.join(LOGOS_DIR, logos[Math.floor(Math.random() * logos.length)])
      }

      // 2. Portada del día: buscar ephemeris*.jpg en la carpeta de scenes del día
      let portadaPath = null
      const ephFiles = fs.readdirSync(state.SCENES_DIR).filter(f => f.startsWith('ephemeris') && /\.(jpg|jpeg|png)$/i.test(f))
      if (ephFiles.length > 0) portadaPath = path.join(state.SCENES_DIR, ephFiles[0])

      // 3. Outro más reciente
      const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const outroSrc = outroFiles.length > 0 ? path.join(OUTRO_DIR, outroFiles[0]) : null

      const outputDir = state.SCENES_DIR
      const finalPath = path.join(outputDir, state.TODAY + '_shorts_final.mp4')
      const processedDir = path.join(outputDir, 'proc_shorts')
      if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true })

      const parts = []

      // 4. Convertir portada a video de 3 segundos
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
            ])
              .outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '3'])
          } else {
            cmd.complexFilter([
              '[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[v_out]',
              'anullsrc=r=44100:cl=stereo[a_out]'
            ])
              .outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '3'])
          }
          cmd.output(portadaVid).on('end', resolve).on('error', reject).run()
        })
        parts.push(portadaVid)
        await safeSend('✅ Portada convertida (3s)')
      }

      // 5. Normalizar el video principal a 1080x1920 + logo + bgm
      const bgmPath = path.join(state.SCENES_DIR, 'bgm_active.mp3')
      const hasBgm = fs.existsSync(bgmPath)
      const mainNorm = path.join(processedDir, 'main_norm.mp4')
      
      await new Promise((resolve, reject) => {
        let inputsIdx = 1
        let logoIdx = -1
        let bgmIdx = -1
        let cmd = ffmpeg().input(inputVideoPath)
        
        if (logoPath) { cmd = cmd.input(logoPath).inputOptions(['-loop', '1']); logoIdx = inputsIdx++; }
        if (hasBgm) { cmd = cmd.input(bgmPath); bgmIdx = inputsIdx++; }

        let filters = []
        filters.push(`[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[bg]`)
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
        cmd.outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2'])
        
        cmd.output(mainNorm).on('end', resolve).on('error', (e) => {
          // fallback sin audio original (si el video no tenia audio y [0:a] falló)
          let fbInputsIdx = 2
          let fbLogoIdx = -1
          let fbBgmIdx = -1
          let fbCmd = ffmpeg().input(inputVideoPath).input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
          
          if (logoPath) { fbCmd = fbCmd.input(logoPath).inputOptions(['-loop', '1']); fbLogoIdx = fbInputsIdx++; }
          if (hasBgm) { fbCmd = fbCmd.input(bgmPath); fbBgmIdx = fbInputsIdx++; }

          let fbFilters = []
          fbFilters.push(`[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[bg]`)
          if (fbLogoIdx !== -1) {
            fbFilters.push(`[${fbLogoIdx}:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.75[logo]`)
            fbFilters.push(`[bg][logo]overlay=W-w-30:30:shortest=1[v_out]`)
          } else {
            fbFilters.push(`[bg]copy[v_out]`)
          }

          if (fbBgmIdx !== -1) {
            fbFilters.push(`[${fbBgmIdx}:a]volume=0.1[bgm]`)
            fbFilters.push(`[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a_out]`)
          } else {
            fbFilters.push(`[1:a]anull[a_out]`)
          }

          fbCmd.complexFilter(fbFilters)
          fbCmd.outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest'])
          
          fbCmd.output(mainNorm).on('end', resolve).on('error', reject).run()
        }).run()
      })
      parts.push(mainNorm)
      await safeSend('✅ Video principal normalizado')

      // 6. Normalizar outro
      if (outroSrc) {
        const outroNorm = path.join(processedDir, 'outro_norm.mp4')
        await new Promise((resolve, reject) => {
          ffmpeg().input(outroSrc).input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
            .outputOptions(['-y', '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '5', '-shortest'])
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
      await safeSend('🎉 *Video Shorts listo!* (' + sizeMB + ' MB)\n' +
        (portadaPath ? '✅ Portada | ' : '⚠️ Sin portada | ') +
        '✅ Video + logo | ' +
        (outroSrc ? '✅ Outro' : '⚠️ Sin outro'), { parse_mode: 'Markdown' })

      // 8. Subir a Drive
      try {
        await safeSend('☁️ Subiendo a Google Drive...')
        const url = await uploadToGoogleDrive(finalPath, state.TODAY + '_shorts_processed.mp4')
        await safeSend('✅ Subido a Drive: ' + url, { disable_web_page_preview: true })
      } catch (e) { await safeSend('⚠️ No se pudo subir a Drive: ' + e.message) }

      // 9. Previsualizar post y preguntar si publicar
      let postTextPreview = 'Sin descripción disponible. Usa /publicar_post si necesitas que la IA lo redacte.'
      try {
        const txtPath = path.join(state.SCENES_DIR, `post_text_${state.TODAY}.txt`)
        if (fs.existsSync(txtPath)) {
          postTextPreview = fs.readFileSync(txtPath, 'utf8').substring(0, 300)
        }
      } catch (_) { }

      await bot.sendMessage(chatId,
        `🎥 *Previsualización antes de publicar:*\n\n` +
        `📁 Archivo: \`${path.basename(finalPath)}\`\n` +
        `📦 Tamaño: *${sizeMB} MB*\n` +
        `🏷️ Formato: 📱 Vertical 9:16 (Shorts)\n\n` +
        `📝 *Descripción:*\n${postTextPreview}...\n\n` +
        `¿Publicar en TikTok, Facebook Reels y YouTube Shorts?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Publicar en todas las plataformas', callback_data: 'confirm_publish_video' }
              ],
              [
                { text: '🔄 Regenerar post con IA', callback_data: 'regenerate_post' }
              ],
              [
                { text: '❌ Cancelar', callback_data: 'cancel_publish_video' }
              ]
            ]
          }
        }
      )
      bot._pendingVideoPath = finalPath

    } catch (err) {
      log('❌', 'procesarYPublicarShorts error: ' + err.message)
      await safeSend('❌ Error procesando: ' + err.message)
    }
  }

  // ── Ensamblar video final con FFmpeg ──────────────────────────────────────────
  async function ensamblarVideoFinal() {
    try {
      const ffmpeg = require('fluent-ffmpeg')
      const ffmpegPath = require('ffmpeg-static')
      ffmpeg.setFfmpegPath(ffmpegPath)
      const { spawnSync, execFileSync } = require('child_process')

      const outputPath = path.join(state.SCENES_DIR, state.TODAY + '_final.mp4')
      const processedDir = path.join(state.SCENES_DIR, 'processed')
      const normalizedDir = path.join(state.SCENES_DIR, 'normalized')
      if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true })
      if (!fs.existsSync(normalizedDir)) fs.mkdirSync(normalizedDir, { recursive: true })

      const allFiles = fs.readdirSync(state.SCENES_DIR)
        .filter(f => f.endsWith('.mp4') &&
          !f.includes('final') && !f.includes('output') && !f.includes('proc_') &&
          !f.includes('video_only') && !f.includes('master') && !f.includes('vertical') &&
          !f.includes('horizontal') && !f.includes('cuadrado'))
        .sort()

      if (allFiles.length === 0) {
        await safeSend('⚠️ No encontré ningún clip MP4. Reenvíame los videos primero.')
        return
      }
      const clipPaths = allFiles.map(f => path.join(state.SCENES_DIR, f))

      const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
      const introSrc = introFiles.length > 0 ? path.join(INTRO_DIR, introFiles[0]) : null
      const outroSrc = outroFiles.length > 0 ? path.join(OUTRO_DIR, outroFiles[0]) : null

      await safeSend(
        `🎙️ *Paso 1/6 — Preparando ensamblaje...*\n` +
        `${introSrc ? `🎬 Intro: \`${introFiles[0]}\`` : '⚠️ Sin intro'}\n` +
        `${outroSrc ? `🏁 Salida: \`${outroFiles[0]}\`` : '⚠️ Sin salida'}\n` +
        `🎥 Clips de escenas: *${clipPaths.length}*`,
        { parse_mode: 'Markdown' }
      )

      let framesData = []
      const scriptJsonPath = path.join(state.SCENES_DIR, 'script.json')
      if (fs.existsSync(scriptJsonPath)) {
        framesData = JSON.parse(fs.readFileSync(scriptJsonPath, 'utf8'))
      }

      const audioDir = getAudioDir()
      const uploadedAudioMap = {}
      if (fs.existsSync(audioDir)) {
        fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).forEach(f => {
          const n = detectFrameNumber(f)
          if (n) uploadedAudioMap[n] = path.join(audioDir, f)
        })
      }
      const uploadedCount = Object.keys(uploadedAudioMap).length

      const logosDir = path.join(__dirname, '..', 'assets', 'images', 'logos')
      let logoPath = null
      if (fs.existsSync(logosDir)) {
        const logos = fs.readdirSync(logosDir).filter(f => /\.(png|jpg)$/i.test(f))
        if (logos.length > 0) logoPath = path.join(logosDir, logos[Math.floor(Math.random() * logos.length)])
      }

      // BGM con contexto de efeméride
      let ephemerisContext = ''
      const audioTxtPath = path.join(state.SCENES_DIR, '01_guion_audio_' + state.TODAY + '.txt')
      if (fs.existsSync(audioTxtPath)) {
        ephemerisContext = fs.readFileSync(audioTxtPath, 'utf8').substring(0, 3000)
      }
      const allNarration = ephemerisContext + ' ' + framesData.map(f => f.text).join(' ')
      const bgmTag = selectBGMByContext(allNarration)
      const bgmPath = findBGMByTag(bgmTag)
      if (bgmPath) {
        await safeSend(`🎵 Música seleccionada: *${bgmTag}* (\`${path.basename(bgmPath)}\`)`, { parse_mode: 'Markdown' })
      }

      // ── ffprobe helper ────────────────────────────────────────────────────────
      const ffprobeStaticPath = (() => {
        try { return require('ffprobe-static').path } catch (_) { }
        const dir = path.dirname(ffmpegPath)
        const name = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
        const p = path.join(dir, name)
        return fs.existsSync(p) ? p : null
      })()

      const getVideoDuration = (filePath) => {
        if (!ffprobeStaticPath) return 5
        try {
          const out = execFileSync(ffprobeStaticPath, [
            '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', filePath
          ], { encoding: 'utf8', timeout: 15000 }).trim()
          return parseFloat(out) || 5
        } catch { return 5 }
      }

      // ── Procesar cada clip: 4K + logo overlay + silencio ─────────────────────
      const processClipVideoOnly = (videoIn, logoIn, videoOut) => {
        return new Promise((resolve, reject) => {
          let cmd = ffmpeg().input(videoIn)
          if (logoIn) cmd = cmd.input(logoIn)
          let filterParts = []
          if (logoIn) {
            filterParts.push(`[1:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.75[logo];[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[scaled];[scaled][logo]overlay=W-w-30:30[v_logo]`)
          } else {
            filterParts.push(`[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[v_logo]`)
          }
          // Sin subtítulos — solo logo
          filterParts.push(`[v_logo]copy[v_out]`)
          filterParts.push(`anullsrc=r=44100:cl=stereo[a_sil]`)
          cmd.complexFilter(filterParts.join(';'))
            .outputOptions([
              '-map', '[v_out]', '-map', '[a_sil]',
              '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
              '-c:a', 'aac', '-ar', '44100', '-ac', '2',
              '-t', '5', '-shortest'
            ])
            .output(videoOut)
            .on('end', resolve)
            .on('error', reject)
            .run()
        })
      }

      await safeSend(`🎬 *Paso 2/6 — Normalizando ${clipPaths.length} clips a 4K...*`, { parse_mode: 'Markdown' })
      const processedPaths = []
      for (let i = 0; i < clipPaths.length; i++) {
        const frameNum = i + 1
        const videoOut = path.join(processedDir, `proc_${String(frameNum).padStart(2, '0')}.mp4`)
        // Check cancellation before each clip
        if (state.cancelRequested) {
          state.cancelRequested = false
          await safeSend('🛑 *Ensamblaje cancelado* en clip ' + frameNum + '/' + clipPaths.length + '.\nPuedes reintentarlo con *listo*.', { parse_mode: 'Markdown' })
          return
        }
        log('🔧', `Normalizando clip ${frameNum}/${clipPaths.length}...`)
        await processClipVideoOnly(clipPaths[i], logoPath, videoOut)
        processedPaths.push(videoOut)
        if (frameNum % 5 === 0 || frameNum === clipPaths.length) {
          await safeSend(`⚙️ Normalizando clips... *${frameNum}/${clipPaths.length}* ✅`, { parse_mode: 'Markdown' })
        }
      }

      // ── Normalizar intro y outro a 4K ─────────────────────────────────────────
      await safeSend(`🔗 *Paso 3/6 — Normalizando intro y outro...*`, { parse_mode: 'Markdown' })

      const normalizeIntroOutro = (src, dst) => new Promise((resolve, reject) => {
        // Intentar preservar el audio original del intro/salida
        ffmpeg().input(src)
          .outputOptions([
            '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v:0', '-map', '0:a',
            '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '5'
          ])
          .output(dst).on('end', resolve).on('error', (err) => {
            // Fallback: si no tiene audio, agregar silencio
            log('⚠️', `Fallo al procesar audio original de intro/salida. Usando silencio...`)
            try { fs.unlinkSync(dst) } catch (_) { }
            ffmpeg().input(src).input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
              .outputOptions([
                '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
                '-map', '0:v:0', '-map', '1:a',
                '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '5', '-shortest'
              ])
              .output(dst).on('end', resolve).on('error', reject).run()
          }).run()
      })

      let introProcPath = null, outroProcPath = null
      if (introSrc) {
        introProcPath = path.join(normalizedDir, 'intro_norm.mp4')
        try { await normalizeIntroOutro(introSrc, introProcPath); log('✅', 'Intro normalizado') }
        catch (e) { log('⚠️', 'Intro omitido: ' + e.message); introProcPath = null }
      }
      if (outroSrc) {
        outroProcPath = path.join(normalizedDir, 'outro_norm.mp4')
        try { await normalizeIntroOutro(outroSrc, outroProcPath); log('✅', 'Salida normalizada') }
        catch (e) { log('⚠️', 'Salida omitida: ' + e.message); outroProcPath = null }
      }

      // ── Concat video puro ─────────────────────────────────────────────────────
      const finalClipList = [
        ...(introProcPath ? [introProcPath] : []),
        ...processedPaths,
        ...(outroProcPath ? [outroProcPath] : [])
      ]
      const totalParts = finalClipList.length

      await safeSend(
        `🔄 *Paso 4/6 — Uniendo ${totalParts} partes...*\n` +
        `${introProcPath ? '✅' : '⚠️'} Intro | *${processedPaths.length}* escenas | ${outroProcPath ? '✅' : '⚠️'} Salida`,
        { parse_mode: 'Markdown' }
      )

      const videoOnlyPath = path.join(state.SCENES_DIR, state.TODAY + '_video_only.mp4')
      const concatTxtPath = path.join(state.SCENES_DIR, 'concat.txt')
      fs.writeFileSync(concatTxtPath, finalClipList.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'))

      await new Promise((resolve, reject) => {
        ffmpeg().input(concatTxtPath).inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c', 'copy'])
          .output(videoOnlyPath).on('end', resolve).on('error', reject).run()
      })

      const realDuration = getVideoDuration(videoOnlyPath)
      const introDur = introProcPath ? 5 : 0
      const outroDur = outroProcPath ? 5 : 0
      const scenesDur = processedPaths.length * 5
      log('📏', `Duración total: ${realDuration.toFixed(2)}s (Intro: ${introDur}s, Escenas: ${scenesDur}s, Salida: ${outroDur}s)`)

      // ── Generar narración continua ajustada ───────────────────────────────────
      await safeSend(
        `🎙️ *Paso 5/6 — Generando narración continua...*\n` +
        `⏱️ Duración del video: *${realDuration.toFixed(1)}s*\n` +
        `📝 Fotogramas con texto: *${framesData.length}*`,
        { parse_mode: 'Markdown' }
      )

      let masterAudioPath = null

      // ── Prioridad 1: Narración completa subida con /subir_audio_completo ──────────
      const narracionFiles = fs.readdirSync(state.SCENES_DIR)
        .filter(f => f.startsWith('narracion_completa') && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f))

      if (narracionFiles.length > 0) {
        const narracionSrc = path.join(state.SCENES_DIR, narracionFiles[0])
        const narracionOut = path.join(state.SCENES_DIR, 'narracion_ajustada.mp3')

        // Medir duración con múltiples métodos
        let audioDur = getVideoDuration(narracionSrc)
        // Fallback: estimar por tamaño del archivo (128kbps MP3 = 16KB/s)
        if (!audioDur || audioDur <= 5) {
          const fileSizeBytes = fs.statSync(narracionSrc).size
          audioDur = fileSizeBytes / (128 * 1024 / 8) // bytes / (bits/s / 8)
          log('⚠️', 'ffprobe no midió duración, estimando por tamaño: ' + audioDur.toFixed(1) + 's')
        }
        // Fallback final: si sigue siendo inválido, usar 125s (duración estándar)
        if (!audioDur || audioDur <= 5) {
          audioDur = 125
          log('⚠️', 'Usando duración por defecto: 125s')
        }

        const targetDur = realDuration * 0.97
        const speedRatio = audioDur / targetDur

        // atempo acepta 0.5–2.0; encadenar si el ratio está fuera de rango
        // Límite máximo real para no distorsionar: 1.5x (50% más rápido)
        const clampedRatio = Math.max(0.5, Math.min(1.5, speedRatio))
        let atempoFilter = 'atempo=' + clampedRatio.toFixed(4)

        log('🎙️', 'Audio: ' + audioDur.toFixed(1) + 's | Target: ' + targetDur.toFixed(1) + 's | ratio: ' + speedRatio.toFixed(3) + ' | atempo: ' + atempoFilter)
        await safeSend(
          '🎙️ *Narración completa detectada* (' + audioDur.toFixed(1) + 's)\n' +
          '⚡ Ajustando velocidad para encajar en *' + targetDur.toFixed(1) + 's* (duración de escenas)...',
          { parse_mode: 'Markdown' }
        )

        await new Promise((resolve, reject) => {
          require('fluent-ffmpeg')().input(narracionSrc)
            .audioFilters(atempoFilter)
            .outputOptions(['-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2'])
            .output(narracionOut)
            .on('end', resolve)
            .on('error', reject)
            .run()
        })

        const adjustedDur = getVideoDuration(narracionOut)
        await safeSend('✅ Audio ajustado: *' + adjustedDur.toFixed(1) + 's* (video: ' + realDuration.toFixed(1) + 's)', { parse_mode: 'Markdown' })
        masterAudioPath = narracionOut

      } else if (uploadedCount >= clipPaths.length) {
        // Audios manuales: concatenar en uno solo
        const audioConcatTxt = path.join(state.SCENES_DIR, 'audio_concat.txt')
        const audioLines = []
        for (let i = 1; i <= clipPaths.length; i++) {
          const p = uploadedAudioMap[i]
          if (p && fs.existsSync(p)) audioLines.push(`file '${p.replace(/\\/g, '/')}'`)
        }
        if (audioLines.length > 0) {
          fs.writeFileSync(audioConcatTxt, audioLines.join('\n'))
          const concatenatedAudio = path.join(state.SCENES_DIR, 'narration_concatenated.mp3')
          await new Promise((resolve, reject) => {
            ffmpeg().input(audioConcatTxt).inputOptions(['-f', 'concat', '-safe', '0'])
              .outputOptions(['-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2'])
              .output(concatenatedAudio).on('end', resolve).on('error', reject).run()
          })
          masterAudioPath = concatenatedAudio
        }
      } else if (framesData.length > 0) {
        // TTS continuo ajustado a la duración real de las escenas
        const fullText = framesData.sort((a, b) => a.frame - b.frame).map(f => f.text).join(' ')
        const wordCount = fullText.split(/\s+/).length
        const naturalSecs = (wordCount / 150) * 60
        const targetSecs = scenesDur * 0.93 // Ajustar solo a las escenas
        const ratio = naturalSecs / targetSecs
        let ratePercent = Math.round((ratio - 1) * 100)
        ratePercent = Math.max(-45, Math.min(95, ratePercent))
        const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

        log('🎙️', `Palabras: ${wordCount} | natural: ${naturalSecs.toFixed(1)}s | target: ${targetSecs.toFixed(1)}s | rate: ${rateStr}`)
        await safeSend(`🎙️ TTS: *${wordCount} palabras* — velocidad *${rateStr}* para ${targetSecs.toFixed(1)}s`, { parse_mode: 'Markdown' })

        const fullTextPath = path.join(state.SCENES_DIR, 'narration_full.txt')
        const rawAudioPath = path.join(state.SCENES_DIR, 'narration_raw.mp3')
        fs.writeFileSync(fullTextPath, fullText, 'utf8')

        const ttsResult = spawnSync('python', [
          '-m', 'edge_tts', '--voice', state.motorVozActivo, `--rate=${rateStr}`,
          '-f', fullTextPath, '--write-media', rawAudioPath
        ], { encoding: 'utf8', timeout: 120000 })

        if (ttsResult.status === 0 && fs.existsSync(rawAudioPath)) {
          const ttsDuration = getVideoDuration(rawAudioPath)
          await safeSend(`✅ Narración: *${ttsDuration.toFixed(1)}s* (video: ${realDuration.toFixed(1)}s)`, { parse_mode: 'Markdown' })
          masterAudioPath = rawAudioPath
        } else {
          await safeSend(`⚠️ TTS falló. El video tendrá solo música de fondo.`)
          log('⚠️', `TTS error: ${ttsResult.stderr || 'desconocido'}`)
        }
      }

      // ── Mezclar video + narración + BGM ───────────────────────────────────────
      await safeSend(`🔄 *Paso 6/6 — Mezclando audio y exportando formatos...*`, { parse_mode: 'Markdown' })

      await new Promise((resolve, reject) => {
        let cmd = ffmpeg().input(videoOnlyPath)
        let audioFilterComplex = '', audioMap = '0:a'

        if (masterAudioPath && fs.existsSync(masterAudioPath)) {
          cmd = cmd.input(masterAudioPath)
          const adelayMs = introDur * 1000
          const delayFilter = adelayMs > 0 ? `adelay=${adelayMs}|${adelayMs},` : ''

          if (bgmPath) {
            cmd = cmd.input(bgmPath).inputOptions(['-stream_loop', '-1'])
            audioFilterComplex = `[0:a]volume=1.0[orig];[1:a]${delayFilter}apad=whole_dur=${realDuration + 2}[narr];[2:a]volume=0.12[bgm];[orig][narr][bgm]amix=inputs=3:duration=first:dropout_transition=3[a_out]`
            audioMap = '[a_out]'
          } else {
            audioFilterComplex = `[0:a]volume=1.0[orig];[1:a]${delayFilter}apad=whole_dur=${realDuration + 2}[narr];[orig][narr]amix=inputs=2:duration=first:dropout_transition=3[a_out]`
            audioMap = '[a_out]'
          }
        } else if (bgmPath) {
          cmd = cmd.input(bgmPath).inputOptions(['-stream_loop', '-1'])
          audioFilterComplex = `[0:a]volume=1.0[orig];[1:a]volume=0.12[bgm];[orig][bgm]amix=inputs=2:duration=first:dropout_transition=3[a_out]`
          audioMap = '[a_out]'
        }

        if (audioFilterComplex) {
          cmd.complexFilter(audioFilterComplex)
            .outputOptions([
              '-map', '0:v', '-map', audioMap,
              '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
              '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest'
            ])
        } else {
          cmd.outputOptions([
            '-map', '0:v', '-map', '0:a',
            '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '44100', '-ac', '2'
          ])
        }
        cmd.output(outputPath).on('end', resolve).on('error', reject).run()
      })

      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)
      log('✅', `Video master: ${outputPath} (${sizeMB} MB)`)
      await safeSend(`🎉 *¡Video master ensamblado!* (${sizeMB} MB)\n📐 Exportando 3 formatos 4K...`, { parse_mode: 'Markdown' })

      // ── Exportar 3 formatos ───────────────────────────────────────────────────
      const exportFormato = (input, output, vf) => new Promise((resolve, reject) => {
        ffmpeg().input(input)
          .outputOptions([
            '-vf', vf,
            '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '44100', '-ac', '2'
          ])
          .output(output).on('end', resolve).on('error', reject).run()
      })

      const formatos = [
        {
          label: '📱 Vertical 9:16', desc: 'TikTok / Reels / Shorts',
          // El master ya es 2160x3840 — solo re-encoder
          vf: 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
          filename: state.TODAY + '_vertical_9x16.mp4'
        },
        {
          label: '🖥️ Horizontal 16:9', desc: 'YouTube / Facebook Video',
          // Video vertical centrado con barras negras a los lados — 4K UHD
          vf: 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
          filename: state.TODAY + '_horizontal_16x9.mp4'
        },
        {
          label: '⬛ Cuadrado 1:1', desc: 'Instagram / Facebook Feed',
          vf: 'scale=2160:2160:force_original_aspect_ratio=decrease,pad=2160:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
          filename: state.TODAY + '_cuadrado_1x1.mp4'
        }
      ]

      const exportResults = []
      for (const fmt of formatos) {
        const fmtPath = path.join(state.SCENES_DIR, fmt.filename)
        try {
          log('📐', `Exportando ${fmt.label}...`)
          await exportFormato(outputPath, fmtPath, fmt.vf)
          const fmtMB = (fs.statSync(fmtPath).size / 1024 / 1024).toFixed(1)
          exportResults.push({ ...fmt, fmtPath, fmtMB, ok: true })
        } catch (e) {
          log('❌', `Error exportando ${fmt.label}: ${e.message}`)
          exportResults.push({ ...fmt, ok: false, error: e.message })
        }
      }

      let resumen = `📐 *Formatos generados:*\n`
      for (const r of exportResults) {
        resumen += r.ok ? `${r.label} ✅ \`${r.filename}\` (${r.fmtMB} MB) — _${r.desc}_\n`
          : `${r.label} ❌ ${r.error}\n`
      }
      await safeSend(resumen, { parse_mode: 'Markdown' })

      // ── Subir a Drive ─────────────────────────────────────────────────────────
      await safeSend(`☁️ Subiendo ${exportResults.filter(r => r.ok).length + 1} archivos a Google Drive...`)
      const driveLinks = []
      try { driveLinks.push(`🎬 Master: [Ver](${await uploadToGoogleDrive(outputPath, state.TODAY + '_master.mp4')})`) }
      catch (e) { driveLinks.push(`🎬 Master: ❌ ${e.message}`) }
      for (const r of exportResults) {
        if (!r.ok) { driveLinks.push(`${r.label}: ❌ No generado`); continue }
        try { driveLinks.push(`${r.label}: [Ver](${await uploadToGoogleDrive(r.fmtPath, r.filename)})`) }
        catch (e) { driveLinks.push(`${r.label}: ❌ ${e.message}`) }
      }
      await safeSend(
        `✅ *¡Subida a Drive completa!*\n\n` + driveLinks.join('\n') + `\n\n🚀 Listo para publicar.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      )

    } catch (err) {
      log('❌', `Error ensamblando: ${err.message}`)
      await safeSend(`❌ Error con FFmpeg: ${err.message}`)
    }
  }

  // ── Obtener o crear subcarpeta de fecha en Drive ──────────────────────────────
}