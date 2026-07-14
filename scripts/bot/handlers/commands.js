const config = require('../config')
const state  = require('../state')
const { safeAction, safeSend: _safeSend, log } = require('../safe-action')
const { truncateAtWord, detectFrameNumber, escapeHTML } = require('../utils/text')
const { selectBGMByContext, findBGMByTag } = require('../utils/bgm')
const { uploadToGoogleDrive, createDriveClient } = require('../services/drive')
const { generateYouTubeDescription, cleanScriptWithAI, generateProfessionalPost, generateShortsPrompts } = require('../services/groq')
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

module.exports = function registerCommands(bot) {
  globalBot = bot;
  bot.on('message', async (msg) => {
    if (msg.chat.id !== CHAT_ID) return;
    const text = (msg.text || '').toLowerCase().trim();
    if (!text) return;
  if (text === '/start' || text === '/ayuda') {
    await bot.sendMessage(CHAT_ID,
      `🤖 *Bot CodeHistory Daily activo!*\n\n` +
      `*Comandos disponibles:*\n` +
      `🚀 */generar_dia* — Generar efeméride, TXTs y portada del día en Drive\n` +
      `📋 */escenas* — Imágenes de hoy con sus prompts\n` +
      `🎨 */generar_escenas* — Generar imágenes con Pollinations\n` +
      `✅ *listo* — Ensamblar el video final cuando termines\n` +
      `🗣️ */voz* — Cambiar el motor de voz para la narración\n` +
      `🎬 */subir_intro* — Subir video de intro (5s)\n` +
      `🏁 */subir_salida* — Subir video de cierre (5s)\n` +
      `🎙️ */subir_audio_completo* — Subir narración completa (se adapta al video)\n` +
      `🎵 */subir_musica [cat]* — Subir música de fondo propia\n` +
      `🎤 */subir_audio* — Subir MP3 narración por fotograma (F1-F25)\n` +
      `📝 */subir_audio_text* — Pegar texto F1-F25 y generar TTS automáticamente\n` +
      `📊 */audio_estado* — Ver cuántos audios F tienes cargados hoy\n` +
      `🖼️ */prompt_portada* — Ver el prompt de Copilot para la portada\n` +
      `🖼️ */subir_portada* — Subir tu portada generada de Copilot\n` +
      `📢 */publicar_post* — Publicar Post Gráfico en Facebook\n` +
      `📝 */ver_descripcion_post* — Ver y copiar la descripción del post\n` +
      `🎬 */subir_video_shorts* — Subir tu video editado y publicar automáticamente\n` +
      `🎥 */publicar_video* — Publicar vertical 9:16 (TikTok + FB Reel + YT Short)\n` +
      `🖥️ */publicar_video_16x9* — Publicar horizontal 16:9 (YouTube Video + Facebook Video)\n` +
      `🔍 */estado* — Ver clips guardados + intro/salida activos\n` +
      `🔄 */reset* — Reiniciar el contador de hoy\n` +
      `🗑️ */limpiar* — Borrar todos los clips del disco\n` +
      `🛑 */parar* — Cancelar cualquier proceso en curso\n`,
      { parse_mode: 'Markdown' }
    )
    
    return
  }
  if (text === '/ver_descripcion_post') {
    const txtPath = path.join(state.SCENES_DIR, `post_text_${state.TODAY}.txt`)
    if (fs.existsSync(txtPath)) {
      const desc = fs.readFileSync(txtPath, 'utf8')
      await safeSend('📝 *Descripción del post (toca el siguiente mensaje para copiar):*', { parse_mode: 'Markdown' })
      await safeSend(`\`\`\`\n${desc}\n\`\`\``, { parse_mode: 'Markdown' })
    } else {
      await safeSend('❌ No se encontró la descripción del post para hoy. Genera primero el día o usa /publicar_post para crearla.')
    }
    return
  }

  if (text === '/publicar_video') {
    // Buscar el mejor formato disponible para publicar
    const formatsToCheck = [
      { file: `${state.TODAY}_shorts_final.mp4`, label: '📱 Vertical 9:16 (Shorts)', platform: 'TikTok/Reels' },
      { file: `${state.TODAY}_vertical_9x16.mp4`, label: '📱 Vertical 9:16', platform: 'TikTok/Reels' },
      { file: `${state.TODAY}_final.mp4`,         label: '🎬 Master',         platform: 'General' },
      { file: `${state.TODAY}_master.mp4`,        label: '🎬 Master',         platform: 'General' },
    ]
    let videoPath = null
    let videoLabel = ''
    for (const f of formatsToCheck) {
      const p = path.join(state.SCENES_DIR, f.file)
      if (fs.existsSync(p)) { videoPath = p; videoLabel = f.label; break }
    }

    if (!videoPath) {
      await bot.sendMessage(CHAT_ID,
        `❌ No se encontró ningún video para hoy.\n` +
        `Asegúrate de haber ensamblado el video con *listo* primero.`,
        { parse_mode: 'Markdown' }
      )
      return
    }

    // Mostrar previsualización antes de publicar
    const sizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)

    // Obtener texto del post para la descripción
    let postTextPreview = 'Sin descripción disponible.'
    try {
      const txtPath = path.join(state.SCENES_DIR, `post_text_${state.TODAY}.txt`)
      if (fs.existsSync(txtPath)) {
        postTextPreview = fs.readFileSync(txtPath, 'utf8').substring(0, 300)
      }
    } catch(_) {}

    await bot.sendMessage(CHAT_ID,
      `🎥 *Previsualización antes de publicar:*\n\n` +
      `📁 Archivo: \`${path.basename(videoPath)}\`\n` +
      `📦 Tamaño: *${sizeMB} MB*\n` +
      `🏷️ Formato: ${videoLabel}\n\n` +
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
              { text: '❌ Cancelar', callback_data: 'cancel_publish_video' }
            ]
          ]
        }
      }
    )
    // Guardar la ruta del video en memoria para el callback
    bot._pendingVideoPath = videoPath
    return
  }

  // /generar_dia — Generar la eféméride completa del día: TXTs, portada, y prompt Meta AI
  if (text === '/publicar_post') {
    const imgPath = path.join(state.SCENES_DIR, `ephemeris_${state.TODAY}.jpg`)
    const txtPath = path.join(state.SCENES_DIR, `post_text_${state.TODAY}.txt`)

    if (!fs.existsSync(imgPath)) {
      await bot.sendMessage(CHAT_ID,
        `❌ No encuentro la portada local de hoy.\n\n` +
        `Archivo esperado:\n\`${imgPath}\`\n\n` +
        `Primero usa /subir_portada y enviame la imagen como FOTO.`,
        { parse_mode: 'Markdown' }
      )
      return
    }

    // ── Intentar descargar el post de Drive primero si no existe localmente ─────────
    if (!fs.existsSync(txtPath)) {
      await bot.sendMessage(CHAT_ID, `🔍 Buscando el texto del post en Google Drive...`)
      try {
        const { google } = require('googleapis')
        const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
        const drive = google.drive({ version: 'v3', auth: oauth2 })

        const folderSearch = await drive.files.list({
          q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${state.TODAY}' and mimeType='application/vnd.google-apps.folder'`,
          fields: 'files(id,name)'
        })
        const dayFolder = folderSearch.data.files[0]
        
        if (dayFolder) {
          const filesRes = await drive.files.list({
            q: `'${dayFolder.id}' in parents and name contains '05_social_media_post_'`,
            fields: 'files(id,name)'
          })
          const postFile = filesRes.data.files[0]
          
          if (postFile) {
            const postRes = await drive.files.get({ fileId: postFile.id, alt: 'media' })
            // Guardar localmente
            fs.writeFileSync(txtPath, String(postRes.data), 'utf8')
            await bot.sendMessage(CHAT_ID, `✅ <b>Post descargado desde Drive:</b> <code>${postFile.name}</code>`, { parse_mode: 'HTML' })
          } else {
            await bot.sendMessage(CHAT_ID, `⚠️ No encontré el archivo 05_social_media_post en Drive.`)
          }
        } else {
          await bot.sendMessage(CHAT_ID, `⚠️ No encontré la carpeta del día en Drive.`)
        }
      } catch (err) {
        log('⚠️', `Error buscando post en Drive: ${err.message}`)
        await bot.sendMessage(CHAT_ID, `⚠️ Error conectando a Drive: ${err.message}`)
      }
    }

    // ── Generar post profesional con Groq AI si aún no existe el archivo ─────────
    if (!fs.existsSync(txtPath)) {
      await bot.sendMessage(CHAT_ID,
        `🤖 <b>Generando post profesional con IA...</b>\n` +
        `No encontré texto guardado — voy a redactar uno ahora con Groq.`,
        { parse_mode: 'HTML' }
      )

      let generatedPost = null
      try {
        // Obtener la efeméride del día desde Supabase
        const ephemRes = await axios.get(
          `${SUPABASE_URL}/rest/v1/ephemerides?display_date=eq.${state.TODAY}&limit=1&select=event,historical_day,historical_month,historical_year`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        )
        const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        let fechaHistorica = state.TODAY
        let eventoTexto = 'Efeméride tecnológica del día'

        if (Array.isArray(ephemRes.data) && ephemRes.data.length > 0) {
          const e = ephemRes.data[0]
          eventoTexto = e.event || eventoTexto
          if (e.historical_year && e.historical_month && e.historical_day) {
            fechaHistorica = `${e.historical_day} de ${monthNames[e.historical_month - 1]} de ${e.historical_year}`
          }
        }

        // Prompt profesional de Director de Contenido
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
        const promptPost = [
          'Actúa como Director de Contenido de CodeHistory Daily, una marca especializada en historia de la tecnología, programación, software, Internet, inteligencia artificial y ciberseguridad.',
          '',
          'Tu misión es crear una publicación profesional, formal, atractiva y potencialmente viral para Facebook, TikTok, Instagram, LinkedIn y YouTube Community.',
          '',
          `Datos de la efeméride:`,
          `Fecha: ${fechaHistorica}`,
          `Título: ${eventoTexto.split('.')[0]}`,
          `Resumen: ${eventoTexto}`,
          '',
          'Instrucciones:',
          '1. Mantén un tono profesional, educativo y periodístico.',
          '2. Genera un gancho inicial que despierte curiosidad.',
          '3. Explica el acontecimiento en 2 o 3 párrafos breves.',
          '4. Destaca por qué este hecho fue importante para la evolución de la tecnología.',
          '5. Relaciona el acontecimiento con el mundo digital actual.',
          '6. Utiliza emojis de forma moderada y elegante.',
          '7. Finaliza con una pregunta que invite al debate y aumente la interacción.',
          '8. Incluye una llamada a la acción para visitar CodeHistory Daily.',
          '9. Agrega hashtags estratégicos relacionados con tecnología, historia e innovación.',
          '10. El texto debe parecer escrito por un medio especializado en tecnología.',
          '',
          'Devuelve el resultado EXACTAMENTE con esta estructura (sin añadir texto extra fuera de ella):',
          '',
          '🚀 CodeHistory Daily | Efeméride Tecnológica del Día',
          '',
          `📅 ${fechaHistorica}`,
          '',
          '[TEXTO PRINCIPAL — 2 o 3 párrafos con gancho + explicación del evento]',
          '',
          '🔍 ¿Por qué es importante hoy?',
          '[REFLEXIÓN — 2-3 frases conectando el evento con el presente digital]',
          '',
          '🌍 Más historias tecnológicas:',
          'https://code-history-day-web-alpha.vercel.app',
          '',
          '▶️ youtube.com/@CodeHistoryDaily',
          '',
          '🎵 tiktok.com/@codehistorydaily',
          '',
          '📱 facebook.com/CodeHistoryDaily',
          '',
          '💬 [PREGUNTA PARA LA COMUNIDAD — una pregunta atractiva que invite al debate]',
          '',
          '[15 HASHTAGS RELEVANTES separados por espacios — incluye siempre #CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Programacion #Tecnologia #Historia]',
        ].join('\n')

        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: promptPost }],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.5,
          max_tokens: 1800,
        })
        generatedPost = completion.choices[0]?.message?.content?.trim()
        if (!generatedPost || generatedPost.length < 100) throw new Error('Respuesta vacía de Groq')

      } catch (aiErr) {
        log('⚠️', `Groq post generation failed: ${aiErr.message}`)
        generatedPost = null
      }

      // Usar post generado por IA o fallback mínimo
      const postToSave = generatedPost || (
        `🚀 CodeHistory Daily | Efeméride Tecnológica del Día\n\n` +
        `📅 ${state.TODAY}\n\n` +
        `Descubre la historia tecnológica de hoy en CodeHistory Daily.\n\n` +
        `🌍 Más historias tecnológicas:\nhttps://code-history-day-web-alpha.vercel.app\n\n` +
        `▶️ youtube.com/@CodeHistoryDaily\n\n` +
        `🎵 tiktok.com/@codehistorydaily\n\n` +
        `📱 facebook.com/CodeHistoryDaily\n\n` +
        `#CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Tecnologia #Historia`
      )

      fs.writeFileSync(txtPath, postToSave, 'utf8')

      if (generatedPost) {
        await bot.sendMessage(CHAT_ID,
          `✅ <b>Post profesional generado con IA</b> y guardado en:\n<code>${txtPath}</code>`,
          { parse_mode: 'HTML' }
        )
      } else {
        await bot.sendMessage(CHAT_ID,
          `⚠️ No pude generar con IA — usando texto de respaldo básico.\nGuardado en: <code>${txtPath}</code>`,
          { parse_mode: 'HTML' }
        )
      }
    }

    // ── Leer el post y mostrarlo completo ────────────────────────────────────
    const fullPostText = fs.readFileSync(txtPath, 'utf-8')
    const sizeMB = (fs.statSync(imgPath).size / 1024 / 1024).toFixed(2)

    // Enviar primero la imagen con caption corto (límite 1024 chars en captions de foto)
    await bot.sendPhoto(CHAT_ID, imgPath, {
      caption:
        `📢 <b>Previsualización del Post Gráfico</b>\n\n` +
        `🖼️ Portada: <code>${path.basename(imgPath)}</code>\n` +
        `📦 Tamaño: <b>${sizeMB} MB</b>\n\n` +
        `El texto completo del post va en el siguiente mensaje. ⬇️`,
      parse_mode: 'HTML'
    })

    // Enviar el texto completo del post como mensaje independiente (sin límite de 1024 chars)
    // Dividir si supera 4096 chars (límite de Telegram por mensaje)
    const MAX_MSG = 4000
    if (fullPostText.length <= MAX_MSG) {
      await bot.sendMessage(CHAT_ID, `📝 <b>Texto completo del post:</b>\n\n${fullPostText}`, { parse_mode: 'HTML' })
    } else {
      // Enviar en partes
      await bot.sendMessage(CHAT_ID, `📝 <b>Texto completo del post (parte 1/2):</b>\n\n${fullPostText.substring(0, MAX_MSG)}`, { parse_mode: 'HTML' })
      await bot.sendMessage(CHAT_ID, `📝 <b>(parte 2/2):</b>\n\n${fullPostText.substring(MAX_MSG)}`, { parse_mode: 'HTML' })
    }

    // Botones de acción
    await bot.sendMessage(CHAT_ID,
      `¿Publicar este post en Facebook?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Publicar post', callback_data: 'confirm_publish_post' }],
            [{ text: '🔄 Regenerar post con IA', callback_data: 'regenerate_post' }],
            [{ text: '❌ Cancelar', callback_data: 'cancel_publish_post' }]
          ]
        }
      }
    )
    return
  }

  if (text.startsWith('/generar_dia')) {
    const parts = (msg.text || '').trim().split(' ')
    const specificDate = parts.length > 1 ? parts[1] : null
    const targetDate = specificDate || state.TODAY

    await bot.sendMessage(CHAT_ID,
      `🚀 *Iniciando generación completa para ${targetDate}...*\n` +
      `Esto puede tardar 30-60 segundos. Te aviso cuando termine.`,
      { parse_mode: 'Markdown' }
    )

    try {
      // 1. Llamar al cron del servidor para generar todo (guión, TXTs, portada en Drive)
      const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      const cronPayload = { secret: process.env.CRON_SECRET || '' }
      if (specificDate) cronPayload.date = specificDate

      await bot.sendMessage(CHAT_ID, `⚙️ Paso 1/3 — Generando guión con Groq AI...`)
      const cronRes = await axios.post(`${appUrl}/api/cron/generate`, cronPayload, { timeout: 120000 })

      if (!cronRes.data.success) {
        throw new Error(cronRes.data.error || 'Error desconocido en el cron')
      }

      await bot.sendMessage(CHAT_ID, `✅ Guión generado (${cronRes.data.scenes_count} escenas). Paso 2/3 — Descargando archivos...`)

      // 2. Actualizar state.TODAY y state.SCENES_DIR a la fecha generada
      state.TODAY = targetDate
      state.SCENES_DIR = path.join(SCENES_BASE_DIR, state.TODAY)
      if (!fs.existsSync(state.SCENES_DIR)) fs.mkdirSync(state.SCENES_DIR, { recursive: true })

      // 3. Descargar los TXTs desde Drive (leer de Supabase para obtener el folder ID)
      // Usamos las constantes del nivel superior: SUPABASE_URL y SUPABASE_KEY (definidas al inicio del archivo)
      let metaAIPromptText = null

      if (SUPABASE_URL && SUPABASE_KEY) {
        const supaRes = await axios.get(
          `${SUPABASE_URL}/rest/v1/daily_content?date=eq.${targetDate}&limit=1&select=ephemeris_text,video_script,scenes`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        )
        const supaData = supaRes.data
        if (Array.isArray(supaData) && supaData.length > 0) {
          const record = supaData[0]
          const ephemerisText = record.ephemeris_text || ''
          const scenes = record.scenes || []

          // Reconstruir el prompt de Meta AI localmente (igual que en el cron)
          const dateObj = new Date(`${targetDate}T12:00:00`)
          const formattedDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
          const ephemerisTitleMatch = ephemerisText.split('.')[0] || 'Evento Histórico'

          // ── Obtener la fecha histórica REAL desde la tabla ephemerides ─────────
          const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
          let historicalDateStr = formattedDate // fallback: fecha actual si no encontramos la histórica
          try {
            const ephemRes = await axios.get(
              `${SUPABASE_URL}/rest/v1/ephemerides?display_date=eq.${targetDate}&limit=1&select=historical_day,historical_month,historical_year`,
              { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            )
            if (Array.isArray(ephemRes.data) && ephemRes.data.length > 0) {
              const e = ephemRes.data[0]
              const hDay   = e.historical_day   || dateObj.getUTCDate()
              const hMonth = e.historical_month || (dateObj.getUTCMonth() + 1)
              const hYear  = e.historical_year  || dateObj.getUTCFullYear()
              historicalDateStr = `${hDay} de ${monthNames[hMonth - 1]} de ${hYear}`
              log('📅', `Fecha histórica real: ${historicalDateStr}`)
            }
          } catch (ephemErr) {
            log('⚠️', `No se pudo obtener fecha histórica de ephemerides: ${ephemErr.message}`)
          }

          // Generar TXT del guión de audio desde las escenas de Supabase
          let textAudio = `=== GUIÓN DE AUDIO - ${targetDate} ===\n\n`
          let textVideo = `=== PROMPTS DE ANIMACIÓN (META AI) - ${targetDate} ===\n\n`
          let textImagenes = `=== PROMPTS DE IMAGEN - ${targetDate} ===\n\n`

          scenes.forEach((scene, sIndex) => {
            const sceneHeader = `--- ESCENA ${sIndex + 1} ---\n`
            textAudio += sceneHeader + (scene.narration || '') + '\n\n'
            textVideo += sceneHeader
            textImagenes += sceneHeader
            ;(scene.frames || []).forEach((frame, fIndex) => {
              textAudio += `F${sIndex * 5 + fIndex + 1}: ${frame.narration || frame.frame_prompt || ''}\n`
              textVideo += `[Fotograma ${fIndex + 1}]\n${frame.animation_prompt || ''}\n\n`
              textImagenes += `[Fotograma ${fIndex + 1}]\n${frame.frame_prompt || ''}\n\n`
            })
            textAudio += '\n'
          })

          // Prompt de Meta AI (usa fecha histórica REAL del evento, no la fecha de hoy)
          metaAIPromptText = `Dale, historia de efeméride del día ${historicalDateStr} - ${truncateAtWord(ephemerisTitleMatch, 110)}

Hazme 25 fotogramas animados sobre la efeméride de hoy.
Estructura:
Escena 1: Orígenes/Contexto - 5 fotogramas
Escena 2: Desarrollo/Historia - 5 fotogramas  
Escena 3: Impacto/Actualidad - 5 fotogramas
Escena 4: Datos curiosos - 5 fotogramas
Escena 5: Conclusión - 5 fotogramas

Por cada fotograma dame:
1. Imagen con estilo cinematográfico, alta calidad
2. Animación sutil de 3-5 segundos
3. NARRACIÓN EXACTA de 5 segundos

Es VITAL que devuelvas la respuesta EXACTAMENTE con este formato:

Me encanta la idea 🔥 
25 fotogramas x 5 segundos = *video de 2 min 5 seg* con narración completa.

Aquí tienes *toda la narración para el audio del video*:

---

*NARRACIÓN COMPLETA - 25 FOTOGRAMAS x 5 SEG*

*ESCENA 1: [NOMBRE DE LA ESCENA]*
*F1:* [Texto de la narración de 5 segundos]
*F2:* [Texto de la narración de 5 segundos]
(Y así sucesivamente hasta F25)

Empezamos con el FOTOGRAMA 1`

          // Guardar TXTs en la carpeta del día
          fs.writeFileSync(path.join(state.SCENES_DIR, `01_guion_audio_${targetDate}.txt`), textAudio, 'utf8')
          fs.writeFileSync(path.join(state.SCENES_DIR, `03_prompts_video_animacion_${targetDate}.txt`), textVideo, 'utf8')
          fs.writeFileSync(path.join(state.SCENES_DIR, `02_prompts_imagenes_${targetDate}.txt`), textImagenes, 'utf8')
          fs.writeFileSync(path.join(state.SCENES_DIR, `06_prompt_meta_ai_master_${targetDate}.txt`), metaAIPromptText, 'utf8')

          await bot.sendMessage(CHAT_ID, `✅ Paso 2/4 — 4 archivos TXT guardados en \`scenes/${targetDate}/\``)

          // ── Generar Prompts para Shorts (Luma/Veo 3) ─────────────────────────
          await bot.sendMessage(CHAT_ID, `🎬 Paso 3/4 — Generando prompts cinematográficos para Shorts con IA...`)
          try {
            const shortsPrompts = await generateShortsPrompts(
              historicalDateStr || targetDate,
              ephemerisTitleMatch || 'Evento Histórico',
              ephemerisText || 'Efeméride tecnológica.'
            )
            fs.writeFileSync(path.join(state.SCENES_DIR, `07_prompts_shorts_luma_${targetDate}.txt`), shortsPrompts, 'utf8')
            
            const scenesOut = shortsPrompts.split('|||ESCENA|||')
            await bot.sendMessage(CHAT_ID, `🎥 *Prompts para Shorts (Cópialos uno por uno):*`, { parse_mode: 'Markdown' })
            for (let i = 0; i < scenesOut.length; i++) {
              const scText = scenesOut[i].trim()
              if (scText.length > 5) {
                await bot.sendMessage(CHAT_ID, `\`\`\`\n${scText}\n\`\`\``, { parse_mode: 'Markdown' })
              }
            }
          } catch (err) {
            log('⚠️', `No se generaron prompts de Shorts: ${err.message}`)
            await bot.sendMessage(CHAT_ID, `⚠️ Error generando prompts de Shorts: ${err.message}`)
          }
        }
      }

      await bot.sendMessage(CHAT_ID, `📣 Paso 4/4 — Enviando Prompt Maestro para Meta AI...`)

      // 4. Enviar el prompt de Meta AI al chat (en partes si es largo)
      if (metaAIPromptText) {
        // Enviar primero el contexto
        await bot.sendMessage(CHAT_ID,
          `🤖 *¡Generación completa para ${targetDate}!*\n\n` +
          `💾 Archivos guardados en: \`scripts/downloads/scenes/${targetDate}/\`\n` +
          `📊 Supabase: ✅ | 📂 Drive: ✅ | 📝 TXTs: ✅\n\n` +
          `Copia el siguiente texto y pégalo en *Meta AI* en WhatsApp:`,
          { parse_mode: 'Markdown' }
        )
        // Enviar el prompt completo en bloque de código
        await bot.sendMessage(CHAT_ID, `\`\`\`\n${metaAIPromptText}\n\`\`\``, { parse_mode: 'Markdown' })
      } else {
        await bot.sendMessage(CHAT_ID,
          `🤖 *¡Generación completa para ${targetDate}!*\n\nDrive y Supabase actualizados.\n` +
          `Usa /escenas para ver las imágenes.`,
          { parse_mode: 'Markdown' }
        )
      }

    } catch (err) {
      log('❌', `Error en /generar_dia: ${err.message}`)
      if (err.message.includes('ECONNREFUSED')) {
        await bot.sendMessage(CHAT_ID, `❌ *Error de conexión:* El servidor web (Next.js) no está corriendo.\n\nPor favor, ejecuta \`npm run dev\` en otra terminal o usa el script \`run-all.bat\` para iniciar la web y el bot juntos.`, { parse_mode: 'Markdown' })
      } else {
        await bot.sendMessage(CHAT_ID, `❌ Error generando el día: ${err.response?.data?.details || err.message}`)
      }
    }
    return
  }

  // /escenas — Obtener las escenas (por defecto la más reciente, o la de una fecha específica)
  if (text.startsWith('/escenas')) {
    const parts = text.split(' ')
    const specificDate = parts.length > 1 ? parts[1] : null
    await enviarEscenasDeHoy(specificDate)
    return
  }

  // /generar_escenas — Llamar a la API para generar las imágenes de las escenas con Pollinations
  if (text.startsWith('/generar_escenas')) {
    const parts = text.split(' ')
    const specificDate = parts.length > 1 ? parts[1] : null
    
    await bot.sendMessage(CHAT_ID, '⏳ Generando imágenes de escenas con Pollinations y subiendo a Drive. Esto puede tardar unos minutos...')
    
    try {
      const payload = {
        secret: process.env.CRON_SECRET || ''
      }
      if (specificDate) {
        payload.date = specificDate
      }
      
      const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      const res = await axios.post(`${appUrl}/api/daily-content/generate-images`, payload)
      
      if (res.data.success) {
        await bot.sendMessage(CHAT_ID, `✅ ¡Imágenes generadas exitosamente!\n${res.data.message}`)
      } else {
        await bot.sendMessage(CHAT_ID, `⚠️ Ocurrió algo inesperado: ${res.data.error}`)
      }
    } catch (err) {
      log('❌', `Error en /generar_escenas: ${err.message}`)
      await bot.sendMessage(CHAT_ID, `❌ Error al generar escenas: ${err.response?.data?.details || err.message}`)
    }
    return
  }
  // "listo" — Confirmar antes de ensamblar el video final
  if (text.toLowerCase() === 'listo') {
    if (state.isDownloading) {
      await bot.sendMessage(CHAT_ID, '⏳ *¡Aún estoy descargando los clips!*\nPor favor espera a que termine (te avisaré con un mensaje) antes de empezar el ensamblaje.', { parse_mode: 'Markdown' })
      return
    }
    const existingClips = fs.readdirSync(state.SCENES_DIR).filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') && !f.includes('proc_'))
    if (existingClips.length === 0) {
      await bot.sendMessage(CHAT_ID, '⚠️ No encontré ningún clip en disco. Reenvíame los videos de Meta AI primero.')
      return
    }

    // Detectar intro/outro
    const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const hasScript = fs.existsSync(path.join(state.SCENES_DIR, 'script.json'))

    // Detectar narración completa
    const narracionFiles = fs.readdirSync(state.SCENES_DIR).filter(f => f.startsWith('narracion_completa') && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f))
    const hasNarracionCompleta = narracionFiles.length > 0

    // Contar audios subidos manualmente
    const audioDir = getAudioDir()
    const uploadedAudios = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length
      : 0
    const ttsAudios = fs.readdirSync(state.SCENES_DIR).filter(f => f.startsWith('voiceover_') && f.endsWith('.mp3')).length
    const totalAudios = uploadedAudios + ttsAudios
    
    let audioStatus = `⚠️ Sin audios — el video tendrá silencio`
    if (hasNarracionCompleta) {
      audioStatus = `✅ Narración Completa cargada (se ajustará al video)`
    } else if (totalAudios > 0) {
      audioStatus = `✅ ${totalAudios} audios por fotograma listos`
    }

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: hasNarracionCompleta ? [
          [
            { text: '🎬 ¡Ensamblar con Narración Completa!', callback_data: 'confirm_ensamble' },
            { text: '❌ Cancelar', callback_data: 'cancel_ensamble' }
          ]
        ] : [
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
      `🗣️ Voz TTS: ${hasNarracionCompleta ? 'Ignorada (usando audio completo)' : `*${state.motorVozActivo}*`}\n` +
      `🎙️ Guion/Audios: ${hasScript ? `✅ script.json cargado` : (hasNarracionCompleta ? `✅ Modo profesional` : (totalAudios > 0 ? `✅ audios subidos manualmente` : `⚠️ Sin guion (sin narración)`))}\n` +
      `📢 Estado audio: ${audioStatus}\n` +
      `🎬 Intro: ${introFiles.length > 0 ? `✅ \`${introFiles[0]}\`` : '⚠️ Sin intro'}\n` +
      `🏁 Salida: ${outroFiles.length > 0 ? `✅ \`${outroFiles[0]}\`` : '⚠️ Sin salida'}\n\n` +
      `👆 *Toca «Ensamblar» para continuar:*`,
      opts
    )
    return
  }

  // /subir_audio_text — Activar modo espera de texto narración F1-F25
  if (text === '/subir_audio_text') {
    state.pendingUploadMode = 'audio_text'
    await bot.sendMessage(CHAT_ID,
      `📝 *Modo: Subir NARRACIÓN en TEXTO activado*\n\n` +
      `Pega ahora el texto completo con el formato F1-F25 que te dio Meta AI.\n\n` +
      `*Formato aceptado:*\n` +
      `\`F1: En 1856, en un pequeño pueblo de Croacia...\`\n` +
      `\`F2: Nació Nikola Tesla, hijo de...\`\n` +
      `_(con o sin asteriscos *F1:*, tal como llega de Meta AI)_\n\n` +
      `🎙️ El bot parseará cada fotograma y generará el audio TTS de forma automática.`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  // Detectar guion F1-F25 pegado como texto plano
  // Acepta: comando /guion, modo audio_text, o formato automático F1: (con o sin * o _)
  const rawText = msg.text || ''
  const looksLikeGuion = (
    text.startsWith('/guion') ||
    state.pendingUploadMode === 'audio_text' ||
    rawText.trim().startsWith('=== GUION') ||
    rawText.trim().startsWith('*NARRACIÓN') ||
    rawText.trim().startsWith('NARRACIÓN COMPLETA') ||
    /[_*]*[fF]1[_*]*\s*[:\-–—=]/.test(rawText)
  )

  if (looksLikeGuion) {
    try {
      // ── 1. Limpiar ruido de Meta AI ────────────────────────────────────────────
      let clean = rawText
        .replace(/\*?PARA GENERAR EL AUDIO[\s\S]*/i, '')
        .replace(/Si quieres que yo te genere[\s\S]*/i, '')
        .replace(/¿Qué hacemos ahora\?[\s\S]*/i, '')
        .replace(/O si prefieres grabarlo[\s\S]*/i, '')

      // ── 2. Parsear F1:, F2:... con o sin asteriscos/guiones bajos (_F1:_, *F1:*) ──
      const regex = /[_*]*[fF](\d+)[_*]*\s*[:\-–—=]\s*[_*]*(.+?)(?=\n\s*[_*]*[fF]\d+[_*]*\s*[:\-–—=]|$)/gs
      let match
      const framesData = []

      while ((match = regex.exec(clean)) !== null) {
        const frameNum = parseInt(match[1])
        const frameText = match[2]
          .replace(/^[_*\s]+|[_*\s]+$/g, '') // Quitar guiones bajos, asteriscos y espacios del inicio/fin
          .replace(/\s+/g, ' ')              // Normalizar espacios
          .trim()
        if (frameText.length > 2) {
          framesData.push({ frame: frameNum, text: frameText })
        }
      }

      if (framesData.length > 0) {
        framesData.sort((a, b) => a.frame - b.frame)
        fs.writeFileSync(path.join(state.SCENES_DIR, 'script.json'), JSON.stringify(framesData, null, 2), 'utf8')

        const escapeHTML = str => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const preview = framesData.slice(0, 5)
          .map(f => `  <b>F${f.frame}:</b> ${escapeHTML(f.text.substring(0, 60))}${f.text.length > 60 ? '…' : ''}`)
          .join('\n')

        state.pendingUploadMode = null // Limpiar modo al recibir el texto
        await bot.sendMessage(CHAT_ID,
          `✅ <b>¡Guion detectado!</b> ${framesData.length} fotogramas F1-F25 parseados.\n\n` +
          `<b>Vista previa:</b>\n${preview}\n\n` +
          `🤖 <b>Limpiando y profesionalizando el guion con IA...</b>`,
          { parse_mode: 'HTML' }
        )
        await bot.sendMessage(CHAT_ID, `💡 <i>Tip: mientras proceso el guion, puedes seguir enviando los clips de Meta AI.</i>`, { parse_mode: 'HTML' })

        // ── 3. Generar TTS con texto limpiado por Groq ───────────────────────────
        ;(async () => {
          try {
            const { spawnSync } = require('child_process')
            // Limpiar con Groq primero
            const rawForGroq = framesData.map(f => f.text).join('\n')
            const groqCleaned = await cleanScriptWithAI(rawForGroq)
            const fullText = groqCleaned || framesData.map(f => f.text).join(' ')
            if (groqCleaned) {
              log('🤖', 'Groq limpio el guion: ' + groqCleaned.length + ' chars')
              await bot.sendMessage(CHAT_ID,
                `✅ <b>Guion limpiado con IA</b>\n` +
                `<i>${escapeHTML(groqCleaned.substring(0, 150))}...</i>\n\n` +
                `🎙️ <b>Generando audio TTS continuo...</b>`,
                { parse_mode: 'HTML' }
              )
            } else {
              await bot.sendMessage(CHAT_ID, `🎙️ <b>Generando audio TTS...</b>`, { parse_mode: 'HTML' })
            }
            const audioPath = path.join(state.SCENES_DIR, 'narracion_completa.mp3')
            const textPath = path.join(state.SCENES_DIR, 'temp_text_completo.txt')
            fs.writeFileSync(textPath, fullText, 'utf8')

            let exitoTTS = false
            const result = spawnSync('python', [
              '-m', 'edge_tts',
              '--voice', state.motorVozActivo,
              `--rate=${state.velocidadVozActiva}`,
              '-f', textPath,
              '--write-media', audioPath
            ], { encoding: 'utf8', timeout: 60000 })

            if (result.status === 0 && fs.existsSync(audioPath)) {
              exitoTTS = true
            } else {
              log('⚠️', `TTS falló para narración completa: ${result.stderr || 'error desconocido'}`)
            }

            // Detectar BGM inteligente basado en el texto del guion
            const bgmTag = selectBGMByContext(fullText)
            const bgmPath = findBGMByTag(bgmTag)

            await bot.sendMessage(CHAT_ID,
              `🎙️ <b>¡Audio TTS generado!</b>\n\n` +
              (exitoTTS ? `✅ <b>Narración Completa</b> lista sin cortes\n` : `⚠️ <b>Falló la generación de audio</b>\n`) +
              `\n🎵 <b>Música seleccionada:</b> ${bgmTag}` +
              (bgmPath ? ` → <code>${path.basename(bgmPath)}</code>` : ' (no encontrada, sin fondo)') +
              `\n\nEscribe <b>listo</b> cuando hayas enviado todos los clips de Meta AI para ensamblar el video.`,
              { parse_mode: 'HTML' }
            )
          } catch (bgErr) {
            log('❌', `Error en la generación TTS en background: ${bgErr.message}`)
            await bot.sendMessage(CHAT_ID, `❌ Error en generación TTS: ${bgErr.message}`)
          }
        })()

      } else {
        // Fallback: guardar texto completo limpio
        const cleanFallback = rawText
          .replace(/\*?PARA GENERAR[\s\S]*/i, '')
          .replace(/\*/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        if (cleanFallback.length > 50) {
          fs.writeFileSync(path.join(state.SCENES_DIR, 'script.txt'), cleanFallback, 'utf8')
          await bot.sendMessage(CHAT_ID,
            `⚠️ <b>No detecté el formato F1:, F2: correctamente.</b>\n` +
            `Guardé el texto como fallback en <code>script.txt</code>.\n\n` +
            `💡 Envía el mensaje de Meta AI <b>sin modificar</b>, tal como lo recibes.`,
            { parse_mode: 'HTML' }
          )
        } else {
          await bot.sendMessage(CHAT_ID,
            `❌ No pude detectar ningún fotograma F1:...F25: en tu mensaje.\nEnvía el guion completo de Meta AI sin modificarlo.`
          )
        }
      }
    } catch (handlerErr) {
      log('❌', `Error procesando el guion: ${handlerErr.message}`)
      await bot.sendMessage(CHAT_ID, `❌ Error procesando el guion: ${handlerErr.message}`)
    }
    return
  }




  // /subir_musica — Subir pista de música de fondo personalizada
  if (text === '/subir_musica' || text.startsWith('/subir_musica ')) {
    const parts = (msg.text || '').trim().split(' ')
    const tagArg = parts[1] ? parts[1].toLowerCase() : null
    const validTags = ['tecnologico', 'inspiracional', 'epico', 'dramatico', 'cientifico', 'futuro', 'general']

    if (!tagArg || !validTags.includes(tagArg)) {
      await bot.sendMessage(CHAT_ID,
        '*🎵 Comando: /subir_musica [categoria]*\n\n' +
        'Envía el comando con la categoría donde guardar la música:\n\n' +
        '*/subir_musica tecnologico* — software, internet, código\n' +
        '*/subir_musica inspiracional* — inventores, pioneros, fundadores\n' +
        '*/subir_musica epico* — conquistas, batallas, NASA\n' +
        '*/subir_musica dramatico* — crisis, tragedias, fracasos\n' +
        '*/subir_musica cientifico* — descubrimientos, Nobel, laboratorio\n' +
        '*/subir_musica futuro* — IA, robots, blockchain\n' +
        '*/subir_musica general* — comodín para cualquier efeméride\n\n' +
        '💡 Ejemplo: */subir_musica epico* y luego envía el MP3\n' +
        'El bot reemplazará la pista anterior de esa categoría.',
        { parse_mode: 'Markdown' }
      )
      return
    }

    state.pendingUploadMode = 'musica_' + tagArg
    const musicDir = require('path').join(__dirname, '..', 'assets', 'audio', 'music')
    const existing = require('fs').existsSync(require('path').join(musicDir, tagArg + '.mp3'))

    await bot.sendMessage(CHAT_ID,
      '*🎵 Modo: Subir MÚSICA [' + tagArg.toUpperCase() + '] activado*\n\n' +
      'Envíame ahora el archivo MP3.\n\n' +
      (existing
        ? '♻️ _Ya tienes música para esta categoría. La nueva la reemplazará._'
        : '_No hay música para esta categoría aún._') +
      '\n\nLa música se usará automáticamente cuando el contexto de la efeméride coincida con *' + tagArg + '*.',
      { parse_mode: 'Markdown' }
    )
    return
  }

  // /subir_audio_completo — Subir audio completo de narración (se adapta al video)

  // /subir_video_shorts — Subir video ya editado o tomar de Drive automáticamente
  if (text === '/subir_video_shorts' || text.startsWith('/subir_video_shorts')) {
    const parts = (msg.text || '').trim().split(' ')
    const forceManual = parts[1] === 'manual'

    await bot.sendMessage(CHAT_ID,
      '🎬 *Comando: /subir_video_shorts*\n\n' +
      'Opciones:\n' +
      '1️⃣ *Envíame el video directamente* — el bot lo procesa y publica\n' +
      '2️⃣ *Escanear Drive automáticamente* — busca el video de hoy en la raíz de Drive\n\n' +
      '¿Qué prefieres?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📁 Buscar en Drive automáticamente', callback_data: 'shorts_from_drive' },
            ],
            [
              { text: '📤 Voy a enviar el video ahora', callback_data: 'shorts_manual_upload' }
            ]
          ]
        }
      }
    )
    return
  }

  if (text === '/subir_audio_completo') {
    state.pendingUploadMode = 'audio_completo'
    const existing = path.join(state.SCENES_DIR, 'narracion_completa.mp3')
    const hasExisting = fs.existsSync(existing)
    await bot.sendMessage(CHAT_ID,
      `🎙️ *Modo: Subir NARRACIÓN COMPLETA activado*\n\n` +
      `Envíame el audio completo de narración (MP3, OGG, M4A, etc.).\n\n` +
      `✨ *El bot lo adaptará automáticamente:*\n` +
      `• Detecta la duración de tus 25 clips (ej: 125 segundos)\n` +
      `• Ajusta la velocidad del audio para que encaje exactamente\n` +
      `• Le añade la música de fondo al momento de ensamblar\n\n` +
      (hasExisting ? `♻️ _Ya tienes una narración cargada hoy. La nueva la reemplazará._` : `_Aún no tienes narración para hoy._`),
      { parse_mode: 'Markdown' }
    )
    return
  }

  // /subir_intro — Poner el bot en modo espera de video de intro
  if (text === '/subir_intro') {
    const existing = fs.existsSync(INTRO_DIR)
      ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse()
      : []
    state.pendingUploadMode = 'intro'
    let msg2 = `🎬 *Modo: Subir INTRO activado*\n\nEnvíame ahora el video de intro (máx. 5 segundos).\nSe guardará con timestamp y se usará en todos los ensamblajes.\n\n`
    if (existing.length > 0) {
      msg2 += `📁 *Versiones guardadas (${existing.length}):*\n`
      existing.slice(0, 5).forEach((f, i) => { msg2 += `  ${i + 1}. \`${f}\`\n` })
      msg2 += `\n_El más reciente se usa automáticamente._`
    } else {
      msg2 += `_Aún no tienes ningún intro guardado._`
    }
    await bot.sendMessage(CHAT_ID, msg2, { parse_mode: 'Markdown' })
    return
  }

  // /subir_salida — Poner el bot en modo espera de video de outro/salida
  if (text === '/subir_salida') {
    const existing = fs.existsSync(OUTRO_DIR)
      ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse()
      : []
    state.pendingUploadMode = 'outro'
    let msg2 = `🏁 *Modo: Subir SALIDA activado*\n\nEnvíame ahora el video de cierre/despedida (máx. 5 segundos).\nSe guardará con timestamp y se usará en todos los ensamblajes.\n\n`
    if (existing.length > 0) {
      msg2 += `📁 *Versiones guardadas (${existing.length}):*\n`
      existing.slice(0, 5).forEach((f, i) => { msg2 += `  ${i + 1}. \`${f}\`\n` })
      msg2 += `\n_El más reciente se usa automáticamente._`
    } else {
      msg2 += `_Aún no tienes ninguna salida guardada._`
    }
    await bot.sendMessage(CHAT_ID, msg2, { parse_mode: 'Markdown' })
    return
  }

  // /subir_audio — Activar modo espera de archivos de audio (narración F1-F25)
  if (text === '/subir_audio') {
    const audioDir = getAudioDir()
    const existing = fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).sort()
    state.audioUploadCounter = existing.length > 0
      ? Math.max(...existing.map(f => detectFrameNumber(f) || 0))
      : 0
    state.pendingUploadMode = 'audio'
    let msg2 = `🎤 *Modo: Subir AUDIO activado*\n\n` +
      `Envíame los audios de narración uno a uno.\n\n` +
      `*El bot detecta el fotograma automáticamente:*\n` +
      `• Nombra el archivo con F: \`F1.mp3\`, \`audio_F5.ogg\`, \`F12.m4a\`\n` +
      `• O envíalos en orden y el bot los numera en secuencia.\n\n`
    if (existing.length > 0) {
      msg2 += `📁 *Audios cargados hoy (${existing.length}):*\n`
      existing.slice(0, 10).forEach(f => { msg2 += `  ✅ \`${f}\`\n` })
      if (existing.length > 10) msg2 += `  ...y ${existing.length - 10} más.\n`
      msg2 += `\n_Escribe /audio_estado para ver el resumen completo._`
    } else {
      msg2 += `_Aún no tienes audios para hoy. Empieza enviando F1._`
    }
    await bot.sendMessage(CHAT_ID, msg2, { parse_mode: 'Markdown' })
    return
  }

  // /audio_estado — Ver resumen de audios cargados
  if (text === '/audio_estado') {
    const audioDir = getAudioDir()
    const audioFiles = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f))
      : []
    if (audioFiles.length === 0) {
      await bot.sendMessage(CHAT_ID,
        `🎤 *Estado de Audios — ${state.TODAY}*\n\n` +
        `❌ No tienes ningún audio cargado para hoy.\n` +
        `Usa */subir_audio* para empezar a subir los audios F1-F25.`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    // Mapear qué frames F tienen audio
    const frameMap = {}
    audioFiles.forEach(f => {
      const n = detectFrameNumber(f)
      if (n) frameMap[n] = f
    })
    const loaded = Object.keys(frameMap).map(Number).sort((a, b) => a - b)
    const missing = []
    for (let i = 1; i <= 25; i++) { if (!frameMap[i]) missing.push(i) }
    let msg3 = `🎤 *Estado de Audios — ${state.TODAY}*\n\n`
    msg3 += `✅ *Cargados (${loaded.length}/25):* ${loaded.map(n => `F${n}`).join(', ')}\n`
    if (missing.length > 0) {
      msg3 += `❌ *Faltantes:* ${missing.map(n => `F${n}`).join(', ')}\n`
    } else {
      msg3 += `🎉 *¡Todos los 25 fotogramas tienen audio!*\n`
    }
    msg3 += `\n💡 El ensamblador usará estos audios en lugar de generar voz TTS.`
    await bot.sendMessage(CHAT_ID, msg3, { parse_mode: 'Markdown' })
    return
  }

  // /prompt_portada — Enviar el prompt de Copilot
  if (text === '/prompt_portada') {
    await bot.sendMessage(CHAT_ID, `🔍 Buscando el prompt de portada en Drive...`)
    try {
      const { google } = require('googleapis')
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
      oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
      const drive = google.drive({ version: 'v3', auth: oauth2 })

      // Buscar carpeta de hoy
      const folderSearch = await drive.files.list({
        q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${state.TODAY}' and mimeType='application/vnd.google-apps.folder'`,
        fields: 'files(id,name)'
      })
      const dayFolder = folderSearch.data.files[0]
      if (!dayFolder) throw new Error('Carpeta del día no encontrada en Drive.')

      // Buscar archivo del prompt
      const filesRes = await drive.files.list({
        q: `'${dayFolder.id}' in parents and name contains '00_prompt_portada_copilot'`,
        fields: 'files(id,name)'
      })
      const promptFile = filesRes.data.files[0]
      if (!promptFile) throw new Error('No se encontró el archivo del prompt en Drive.')

      const promptRes = await drive.files.get({ fileId: promptFile.id, alt: 'media' })
      const promptContent = promptRes.data

      // Enviamos ambos mensajes como texto plano para evitar errores de parsing Markdown
      await bot.sendMessage(CHAT_ID,
        `🎨 PROMPT PARA PORTADA (COPILOT)\n\nCopia y pega el texto del siguiente mensaje en Copilot Designer:\nhttps://copilot.microsoft.com/images/create\n\nUna vez generada la imagen, mándamela con /subir_portada`
      )
      await bot.sendMessage(CHAT_ID, `\`\`\`\n${String(promptContent)}\n\`\`\``, { parse_mode: 'Markdown' })
    } catch (err) {
      log('❌', `Error obteniendo prompt: ${err.message}`)
      await bot.sendMessage(CHAT_ID, `⚠️ No pude obtener el prompt: ${err.message}`)
    }
    return
  }

  // /subir_portada — Poner el bot en modo espera de imagen de portada de Copilot
  if (text === '/subir_portada') {
    state.pendingUploadMode = 'portada'
    await bot.sendMessage(CHAT_ID, `🖼️ *Modo: Subir PORTADA activado*\n\nEnvíame la imagen que generaste en Copilot (asegúrate de enviarla como FOTO/IMAGEN, no como archivo).\nReemplazará la portada generada automáticamente para los posts de hoy.`, { parse_mode: 'Markdown' })
    return
  }

  // ── Recibir audio, imagen, video o documento ──────────────────────────────
  });
}