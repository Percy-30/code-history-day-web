#!/usr/bin/env node
/**
 * 🤖 Bot de Telegram — Asistente de Meta AI para CodeHistory Daily
 *
 * Flujo de trabajo:
 *   1. El bot te envía las imágenes de escenas (Pollinations) + su prompt.
 *   2. Tú reenvías cada imagen a Meta AI en WhatsApp y te genera un video.
 *   3. Reenvías cada video al bot de Telegram (este script).
 *   4. El bot los guarda numerados: escena_01.mp4, escena_02.mp4, etc.
 *   5. Cuando escribes "listo", el bot ensambla todo con FFmpeg y sube a Drive.
 *
 * Uso:
 *   node scripts/telegram-meta-ai-bot.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const TelegramBotLib = require('node-telegram-bot-api')
const TelegramBot = TelegramBotLib.default || TelegramBotLib
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const publisher = require('./publisher.js')
const Groq = require('groq-sdk')

// ── Configuración ─────────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID    = Number(process.env.TELEGRAM_CHAT_ID)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

// ── Función auxiliar para cortar texto inteligentemente ──────────────────────
function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text
  
  let truncated = text.substring(0, maxLength)
  const lastSpaceIndex = truncated.lastIndexOf(' ')
  
  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex)
  }
  
  return truncated
}

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env.local')
  process.exit(1)
}

const SCENES_BASE_DIR = path.join(__dirname, 'downloads', 'scenes')
// Calcular la fecha actual en la zona horaria local (UTC-5 para Perú)
const offset = -5 // UTC-5
const localDate = new Date(new Date().getTime() + offset * 3600 * 1000)
let TODAY = localDate.toISOString().split('T')[0]
let SCENES_DIR = path.join(SCENES_BASE_DIR, TODAY)

if (!fs.existsSync(SCENES_BASE_DIR)) fs.mkdirSync(SCENES_BASE_DIR, { recursive: true })
if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true })

// ── Estado en memoria ─────────────────────────────────────────────────────────
let sceneCounter    = 0   // Cuántos clips de Meta AI has enviado ya
let totalScenes     = 0   // Total de escenas que el bot enviará hoy
let receivedScenes  = []  // Rutas locales de los clips descargados
let downloadQueue   = []  // Cola de descargas pendientes
let isDownloading   = false // Mutex para descargas secuenciales
let savedAudioScript = ''  // Guion de narración guardado por el usuario
let motorVozActivo = 'es-MX-JorgeNeural' // Motor de voz por defecto
let velocidadVozActiva = '-10%' // Velocidad por defecto
let pendingUploadMode = null // 'intro' | 'outro' | 'portada' | 'audio' | null
let audioUploadCounter = 0   // Contador secuencial para audios sin número F en nombre
let failedClips    = []  // Clips que fallaron la descarga
let cancelRequested = false // Flag global de cancelación (/parar)

// ── Rutas de carpetas de activos ─────────────────────────────────────────────
const INTRO_DIR  = path.join(__dirname, '..', 'assets', 'video', 'intro')
const OUTRO_DIR  = path.join(__dirname, '..', 'assets', 'video', 'outro')
const LOGOS_DIR  = path.join(__dirname, '..', 'assets', 'images', 'logos')
const BGM_DIR    = path.join(__dirname, '..', 'assets', 'audio', 'music')

if (!fs.existsSync(INTRO_DIR)) fs.mkdirSync(INTRO_DIR, { recursive: true })
if (!fs.existsSync(OUTRO_DIR)) fs.mkdirSync(OUTRO_DIR, { recursive: true })
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true })
if (!fs.existsSync(BGM_DIR))   fs.mkdirSync(BGM_DIR,   { recursive: true })

// ── Función: obtener carpeta de audios del día ────────────────────────────────
function getAudioDir() {
  const dir = path.join(SCENES_DIR, 'audio')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Función: detectar número de frame desde nombre de archivo ─────────────────
// Acepta: F1.mp3, f01.ogg, audio_F5.m4a, frame_3.wav, narr-F12.mp3, etc.
function detectFrameNumber(filename) {
  const base = path.basename(filename, path.extname(filename))
  const match = base.match(/[fF](\d+)/)
  if (match) return parseInt(match[1], 10)
  const numMatch = base.match(/(\d+)/)
  if (numMatch) return parseInt(numMatch[1], 10)
  return null
}

// ── Inicializar bot ───────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true })
// Suprimir errores de polling de red (EFATAL) — son temporales y no afectan el bot
bot.on('polling_error', (err) => {
  if (err.code !== 'EFATAL') log('⚠️', 'Polling error: ' + err.message)
})

function log(emoji, msg) { console.log(`${emoji}  ${msg}`) }


// ── Generar descripción larga para YouTube con hashtags SEO ──────────────────
async function generateYouTubeDescription(narrationText, postText) {
  try {
    const Groq = require('groq-sdk')
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const prompt = [
      'Eres un experto en SEO para YouTube. Genera una descripción optimizada para un video de YouTube basada en esta narración documental.',
      '',
      'NARRACIÓN DEL VIDEO:',
      narrationText.substring(0, 2000),
      '',
      'DESCRIPCIÓN CORTA DEL POST (usa como contexto):',
      postText.substring(0, 500),
      '',
      'INSTRUCCIONES:',
      '- Escribe la descripción completa en español neutro',
      '- Primer párrafo: resumen atractivo del video (2-3 frases)',
      '- Segundo párrafo: contexto histórico expandido (3-4 frases)',
      '- Tercer párrafo: por qué es relevante hoy (2-3 frases)',
      '- Cuarto párrafo: incluye exactamente estas líneas:',
      '  Suscríbete para más historia de la tecnología: @CodeHistoryDaily',
      '  🌐 code-history-day-web-alpha.vercel.app',
      '  ▶️ youtube.com/@CodeHistoryDaily',
      '  🎵 tiktok.com/@codehistorydaily',
      '  📱 facebook.com/CodeHistoryDaily',
      '- Al final, agrega una sección de hashtags: mínimo 20, máximo 30 hashtags',
      '  Incluye siempre: #CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Programacion #Tecnologia #Historia #HistoriaTech',
      '  Agrega hashtags específicos del tema del video (nombres, tecnologías, fechas, etc.)',
      '  Agrega hashtags de descubrimiento populares en YouTube en español',
      '- Último párrafo SIEMPRE: Music by Kevin MacLeod (incompetech.com) Licensed under CC BY 3.0 https://creativecommons.org/licenses/by/3.0/',
      '- NO incluyas el texto de la narración directamente, solo el resumen',
      '- Longitud total: entre 400 y 800 palabras',
      '- Devuelve ÚNICAMENTE la descripción, sin comentarios ni explicaciones'
    ].join('\n')

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      max_tokens: 1500,
    })
    const result = completion.choices[0]?.message?.content?.trim()
    if (!result || result.length < 100) throw new Error('Respuesta vacía')
    return result
  } catch (err) {
    log('⚠️', 'generateYouTubeDescription falló: ' + err.message + ' — usando descripción básica')
    return null
  }
}

// ── Limpiar guion con Groq AI antes del TTS ──────────────────────────────────
async function cleanScriptWithAI(rawText) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const prompt = [
      'Actua como guionista documental profesional. Convierte el siguiente texto en una narracion fluida lista para TTS.',
      '',
      'REGLAS ESTRICTAS:',
      '- Duracion objetivo: ~2 minutos 5 segundos (maximo 2200 caracteres)',
      '- Elimina TODAS las etiquetas: F1:, F2:, _F1:_, *F1:*, ESCENA 1, ESCENA 2, etc.',
      '- Elimina separadores: ---, ===, ***, emojis, asteriscos, guiones bajos',
      '- Elimina encabezados: ORIGENES, CONTEXTO, DESARROLLO, IMPACTO, DATOS CURIOSOS, CONCLUSION',
      '- Elimina "Empezamos con el FOTOGRAMA 1" y cualquier texto tecnico',
      '- Conserva TODOS los datos historicos: fechas, nombres, lugares',
      '- Espanol neutro, frases claras, pausas naturales con puntuacion correcta',
      '- Tono documental profesional y atractivo',
      '- Un parrafo por bloque narrativo, separados por linea en blanco',
      '- SIN titulos, SIN etiquetas, SIN emojis, SIN numeraciones',
      '- Devuelve UNICAMENTE la narracion final limpia, nada mas',
      '',
      'TEXTO A LIMPIAR:',
      rawText
    ].join('\n')
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 2048,
    })
    const result = completion.choices[0]?.message?.content?.trim()
    if (!result || result.length < 100) throw new Error('Respuesta vacia de Groq')
    return result
  } catch (err) {
    log('⚠️', 'cleanScriptWithAI fallo: ' + err.message + ' — usando texto local')
    return null
  }
}


// Helper: enviar mensaje sin crashear si hay error de red
async function safeSend(text, opts = {}) {
  try { await bot.sendMessage(CHAT_ID, text, opts) }
  catch (e) { log('⚠️', 'No se pudo enviar mensaje: ' + e.message) }
}

// Evitar que errores de red maten el proceso completo
process.on('uncaughtException', (err) => {
  log('💥', 'uncaughtException: ' + err.message)
  if (err.code === 'EFATAL' || err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
    log('🔄', 'Error de red temporal, el bot continua...')
  }
})
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  log('💥', 'unhandledRejection: ' + msg)
})


// ── Escuchar mensajes ─────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  // Solo responder al dueño del bot (tu chat ID)
  if (msg.chat.id !== CHAT_ID) {
    bot.sendMessage(msg.chat.id, '⛔ No autorizado.')
    return
  }

  const text = (msg.text || '').toLowerCase().trim()

  // ── Comandos de texto ──────────────────────────────────────────────────────

  // /start o /ayuda
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

  if (text === '/publicar_video') {
    // Buscar el mejor formato disponible para publicar
    const formatsToCheck = [
      { file: `${TODAY}_vertical_9x16.mp4`, label: '📱 Vertical 9:16', platform: 'TikTok/Reels' },
      { file: `${TODAY}_final.mp4`,         label: '🎬 Master',         platform: 'General' },
      { file: `${TODAY}_master.mp4`,        label: '🎬 Master',         platform: 'General' },
    ]
    let videoPath = null
    let videoLabel = ''
    for (const f of formatsToCheck) {
      const p = path.join(SCENES_DIR, f.file)
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
      const txtPath = path.join(SCENES_DIR, `post_text_${TODAY}.txt`)
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
    const imgPath = path.join(SCENES_DIR, `ephemeris_${TODAY}.jpg`)
    const txtPath = path.join(SCENES_DIR, `post_text_${TODAY}.txt`)

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
          q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${TODAY}' and mimeType='application/vnd.google-apps.folder'`,
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
          `${SUPABASE_URL}/rest/v1/ephemerides?display_date=eq.${TODAY}&limit=1&select=event,historical_day,historical_month,historical_year`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        )
        const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        let fechaHistorica = TODAY
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
          '📺 YouTube:',
          'https://youtube.com/@CodeHistoryDaily',
          '',
          '🎵 TikTok:',
          'https://tiktok.com/@codehistorydaily',
          '',
          '📘 Facebook:',
          'https://facebook.com/CodeHistoryDaily',
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
        `📅 ${TODAY}\n\n` +
        `Descubre la historia tecnológica de hoy en CodeHistory Daily.\n\n` +
        `🌍 Más historias tecnológicas:\nhttps://code-history-day-web-alpha.vercel.app\n\n` +
        `📺 YouTube:\nhttps://youtube.com/@CodeHistoryDaily\n\n` +
        `🎵 TikTok:\nhttps://tiktok.com/@codehistorydaily\n\n` +
        `📘 Facebook:\nhttps://facebook.com/CodeHistoryDaily\n\n` +
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
    const targetDate = specificDate || TODAY

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

      // 2. Actualizar TODAY y SCENES_DIR a la fecha generada
      TODAY = targetDate
      SCENES_DIR = path.join(SCENES_BASE_DIR, TODAY)
      if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true })

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
          fs.writeFileSync(path.join(SCENES_DIR, `01_guion_audio_${targetDate}.txt`), textAudio, 'utf8')
          fs.writeFileSync(path.join(SCENES_DIR, `03_prompts_video_animacion_${targetDate}.txt`), textVideo, 'utf8')
          fs.writeFileSync(path.join(SCENES_DIR, `02_prompts_imagenes_${targetDate}.txt`), textImagenes, 'utf8')
          fs.writeFileSync(path.join(SCENES_DIR, `06_prompt_meta_ai_master_${targetDate}.txt`), metaAIPromptText, 'utf8')

          await bot.sendMessage(CHAT_ID, `✅ Paso 2/3 — 4 archivos TXT guardados en \`scenes/${targetDate}/\``)
        }
      }

      await bot.sendMessage(CHAT_ID, `📣 Paso 3/3 — Enviando Prompt Maestro para Meta AI...`)

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
    if (isDownloading) {
      await bot.sendMessage(CHAT_ID, '⏳ *¡Aún estoy descargando los clips!*\nPor favor espera a que termine (te avisaré con un mensaje) antes de empezar el ensamblaje.', { parse_mode: 'Markdown' })
      return
    }
    const existingClips = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') && !f.includes('proc_'))
    if (existingClips.length === 0) {
      await bot.sendMessage(CHAT_ID, '⚠️ No encontré ningún clip en disco. Reenvíame los videos de Meta AI primero.')
      return
    }

    // Detectar intro/outro
    const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const hasScript = fs.existsSync(path.join(SCENES_DIR, 'script.json'))

    // Detectar narración completa
    const narracionFiles = fs.readdirSync(SCENES_DIR).filter(f => f.startsWith('narracion_completa') && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f))
    const hasNarracionCompleta = narracionFiles.length > 0

    // Contar audios subidos manualmente
    const audioDir = getAudioDir()
    const uploadedAudios = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length
      : 0
    const ttsAudios = fs.readdirSync(SCENES_DIR).filter(f => f.startsWith('voiceover_') && f.endsWith('.mp3')).length
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
            { text: `🗣️ Cambiar voz (actual: ${motorVozActivo.replace('es-MX-', '').replace('es-ES-', '').replace('Neural', '')})`, callback_data: 'pre_ensamble_voz' }
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
      `🗣️ Voz TTS: ${hasNarracionCompleta ? 'Ignorada (usando audio completo)' : `*${motorVozActivo}*`}\n` +
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
    pendingUploadMode = 'audio_text'
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
    pendingUploadMode === 'audio_text' ||
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
        fs.writeFileSync(path.join(SCENES_DIR, 'script.json'), JSON.stringify(framesData, null, 2), 'utf8')

        const escapeHTML = str => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const preview = framesData.slice(0, 5)
          .map(f => `  <b>F${f.frame}:</b> ${escapeHTML(f.text.substring(0, 60))}${f.text.length > 60 ? '…' : ''}`)
          .join('\n')

        pendingUploadMode = null // Limpiar modo al recibir el texto
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
            const audioPath = path.join(SCENES_DIR, 'narracion_completa.mp3')
            const textPath = path.join(SCENES_DIR, 'temp_text_completo.txt')
            fs.writeFileSync(textPath, fullText, 'utf8')

            let exitoTTS = false
            const result = spawnSync('python', [
              '-m', 'edge_tts',
              '--voice', motorVozActivo,
              `--rate=${velocidadVozActiva}`,
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
          fs.writeFileSync(path.join(SCENES_DIR, 'script.txt'), cleanFallback, 'utf8')
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

    pendingUploadMode = 'musica_' + tagArg
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
    pendingUploadMode = 'audio_completo'
    const existing = path.join(SCENES_DIR, 'narracion_completa.mp3')
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
    pendingUploadMode = 'intro'
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
    pendingUploadMode = 'outro'
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
    audioUploadCounter = existing.length > 0
      ? Math.max(...existing.map(f => detectFrameNumber(f) || 0))
      : 0
    pendingUploadMode = 'audio'
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
        `🎤 *Estado de Audios — ${TODAY}*\n\n` +
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
    let msg3 = `🎤 *Estado de Audios — ${TODAY}*\n\n`
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
        q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and name='${TODAY}' and mimeType='application/vnd.google-apps.folder'`,
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
      await bot.sendMessage(CHAT_ID, String(promptContent))
    } catch (err) {
      log('❌', `Error obteniendo prompt: ${err.message}`)
      await bot.sendMessage(CHAT_ID, `⚠️ No pude obtener el prompt: ${err.message}`)
    }
    return
  }

  // /subir_portada — Poner el bot en modo espera de imagen de portada de Copilot
  if (text === '/subir_portada') {
    pendingUploadMode = 'portada'
    await bot.sendMessage(CHAT_ID, `🖼️ *Modo: Subir PORTADA activado*\n\nEnvíame la imagen que generaste en Copilot (asegúrate de enviarla como FOTO/IMAGEN, no como archivo).\nReemplazará la portada generada automáticamente para los posts de hoy.`, { parse_mode: 'Markdown' })
    return
  }

  // ── Recibir audio, imagen, video o documento ──────────────────────────────
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
})

// ── Manejar botones del Inline Keyboard (/voz y /publicar_post) ─────────────
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
      const imgPath = path.join(SCENES_DIR, `ephemeris_${TODAY}.jpg`);
      const txtPath = path.join(SCENES_DIR, `post_text_${TODAY}.txt`);
      
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
    const txtPath = path.join(SCENES_DIR, `post_text_${TODAY}.txt`);
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
        const txtPath = path.join(SCENES_DIR, 'post_text_' + TODAY + '.txt')
        if (fs.existsSync(txtPath)) postText = fs.readFileSync(txtPath, 'utf8')
      } catch(_) {}

      // Estado de publicaciones
      const pubStatePath = path.join(SCENES_DIR, 'pub_status_' + TODAY + '.json')
      let pubStatus = { tiktok: false, facebook_reel: false, youtube_short: false, youtube_video: false, facebook_video: false }
      if (fs.existsSync(pubStatePath)) {
        try { const old = JSON.parse(fs.readFileSync(pubStatePath, 'utf8')); Object.assign(pubStatus, old) } catch(_) {}
      }

      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      const results = {}

      // ── TikTok (vertical 9:16) ──────────────────────────────────────────────
      if (pubStatus.tiktok) {
        results.tiktok = '⏭️ Ya publicado'
        await bot.sendMessage(chatId, 'TikTok: ya publicado — omitiendo')
      } else {
        await bot.sendMessage(chatId, '⏳ Subiendo a TikTok...')
        try {
          const pub = require('./publisher.js')
          const ttId = await pub.publishToTikTok(videoPath, postText)
          results.tiktok = '✅ Borrador en TikTok — ábrelo y publícalo'
          pubStatus.tiktok = true
        } catch(e) {
          const msg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e)
          results.tiktok = (msg.includes('token') || msg.includes('auth') || msg.includes('401')) ? '❌ Token expirado — renueva TIKTOK_ACCESS_TOKEN' : '❌ ' + msg.substring(0,250)
        }
        await safeSend('📱 TikTok: ' + results.tiktok)
      }

      // ── Facebook Reel (vertical 9:16) ───────────────────────────────────────
      if (pubStatus.facebook_reel) {
        results.facebook_reel = '⏭️ Ya publicado'
        await bot.sendMessage(chatId, 'Facebook Reel: ya publicado — omitiendo')
      } else {
        await bot.sendMessage(chatId, '⏳ Subiendo Facebook Reel (9:16)...')
        try {
          const pub = require('./publisher.js')
          const fbId = await pub.publishReelToFacebook(videoPath, postText)
          results.facebook_reel = '✅ ID ' + fbId
          pubStatus.facebook_reel = true
        } catch(e) {
          const msg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e)
          results.facebook_reel = (msg.includes('token') || msg.includes('OAuth') || msg.includes('400') || msg.includes('401') || msg.includes('expired')) ? '❌ Token expirado — renueva FACEBOOK_PAGE_ACCESS_TOKEN' : '❌ ' + msg.substring(0,250)
        }
        await safeSend('📱 Facebook Reel: ' + results.facebook_reel)
      }

      // ── YouTube Short (vertical 9:16) ───────────────────────────────────────
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
        } catch(e) { results.youtube_short = '❌ ' + e.message.substring(0,150) }
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
    } catch(err) {
      await bot.sendMessage(chatId, '❌ Error: ' + err.message)
    }
    return
  }

  if (data === 'confirm_publish_16x9') {
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
      const ytDescPath = path.join(path.dirname(horizPath), 'yt_description_' + TODAY + '.txt')
      const postTxtPath = path.join(path.dirname(horizPath), 'post_text_' + TODAY + '.txt')
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
    } catch(e) { log('⚠️', 'Error leyendo descripción: ' + e.message) }

    try {
      const { google } = require('googleapis')
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
      oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

      // YouTube Video 16:9
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
      } catch(e) { ytRes = '▶️ YouTube: ❌ ' + e.message.substring(0,150) }
      await safeSend(ytRes)

      // Facebook Video 16:9
      await bot.sendMessage(chatId, '⏳ Subiendo a Facebook Video (16:9)...')
      let fbRes = ''
      try {
        const fbId = await require('./publisher.js').publishReelToFacebook(horizPath, longDesc)
        fbRes = '📘 Facebook: ✅ ID ' + fbId
      } catch(e) {
        const msg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e)
        fbRes = '📘 Facebook: ' + (msg.includes('token') || msg.includes('OAuth') ? 'Token expirado — renueva FACEBOOK_PAGE_ACCESS_TOKEN' : msg.substring(0,200))
      }
      await safeSend(fbRes)

      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      await bot.sendMessage(chatId,
        '<b>📊 Resumen Video 16:9:</b>\n\n' + esc(ytRes) + '\n' + esc(fbRes),
        { parse_mode: 'HTML' }
      )
    } catch(err) {
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
      const dd = String(d.getDate()).padStart(2,'0')
      const mm = String(d.getMonth()+1).padStart(2,'0')
      const yyyy = d.getFullYear()
      const datePatterns = [
        dd + '-' + mm + '-' + yyyy,
        yyyy + '-' + mm + '-' + dd,
        dd + '_' + mm + '_' + yyyy,
        TODAY
      ]

      // Buscar la carpeta del día actual
      const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
      const folderSearch = await drive.files.list({
        q: `'${rootId}' in parents and name='${TODAY}' and mimeType='application/vnd.google-apps.folder'`,
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
            // Preferir el más grande (video completo)
            foundFile = res.data.files.sort((a,b) => Number(b.size||0) - Number(a.size||0))[0]
            break
          }
        }
      }

      if (!foundFile) {
        let debugMsg = `❌ No encontré ningún video MP4 de hoy en Drive.\n\n`
        if (!dayFolder) {
          debugMsg += `⚠️ No se encontró la carpeta del día (\`${TODAY}\`) en Drive.\n`
        } else {
          debugMsg += `📂 Busqué en la carpeta \`${TODAY}\` los patrones: ${datePatterns.join(', ')}\n`
        }
        await bot.sendMessage(chatId,
          debugMsg + '\nSube el archivo MP4 a la carpeta de hoy en Drive y vuelve a intentarlo, o envíame el video manualmente.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      await bot.sendMessage(chatId,
        '✅ Video encontrado: *' + foundFile.name + '* (' + Math.round(Number(foundFile.size||0)/1024/1024) + ' MB)\n' +
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

      const localPath = path.join(SCENES_DIR, 'input_shorts_' + TODAY + '.mp4')
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
              bot.editMessageText(`⬇️ Descargando: ${percent}% (${(downloadedBytes/1024/1024).toFixed(1)} MB / ${(totalBytes/1024/1024).toFixed(1)} MB)`, { chat_id: chatId, message_id: statusMsg.message_id }).catch(()=>{})
            }
          }
          this.push(chunk)
          callback()
        }
      })

      await new Promise((resolve, reject) => {
        dlRes.data.pipe(progressTracker).pipe(dest)
        dest.on('finish', resolve)
        dest.on('error', reject)
        dlRes.data.on('error', reject)
      })

      const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1)
      await bot.editMessageText(`✅ Descarga completada (${sizeMB} MB). Iniciando procesamiento...`, { chat_id: chatId, message_id: statusMsg.message_id }).catch(()=>{})
      
      // Procesar y publicar
      await procesarYPublicarShorts(localPath, chatId)
    } catch(err) {
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
    pendingUploadMode = 'shorts_video'
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
    await bot.sendMessage(CHAT_ID, `🗣️ *Selecciona la voz para el video:*\n\n_(Motor actual: ${motorVozActivo})_`, { parse_mode: 'Markdown', ...opts })
    return
  }

  // Selección de voz desde el resumen pre-ensamblaje (regresa al resumen con voz actualizada)
  if (data.startsWith('voicepre_')) {
    const selectedVoice = data.replace('voicepre_', '')
    motorVozActivo = selectedVoice
    await bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Voz: ${motorVozActivo}` })

    // Limpiar audios TTS previos para regenerar con la nueva voz
    const oldTTS = fs.readdirSync(SCENES_DIR).filter(f => f.startsWith('voiceover_') && f.endsWith('.mp3'))
    oldTTS.forEach(f => { try { fs.unlinkSync(path.join(SCENES_DIR, f)) } catch(_){} })

    const existingClips = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') && !f.includes('proc_'))
    const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const hasScript = fs.existsSync(path.join(SCENES_DIR, 'script.json'))
    const audioDir = getAudioDir()
    const uploadedAudios = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length : 0
    const audioStatus = uploadedAudios > 0 ? `✅ ${uploadedAudios} audios subidos manualmente` : (hasScript ? `✅ TTS con ${motorVozActivo}` : `⚠️ Sin guion`)

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🗣️ Cambiar voz (actual: ${motorVozActivo.replace('es-MX-', '').replace('es-ES-', '').replace('Neural', '')})`, callback_data: 'pre_ensamble_voz' }
          ],
          [
            { text: '🎬 ¡Ensamblar con esta voz!', callback_data: 'confirm_ensamble' },
            { text: '❌ Cancelar', callback_data: 'cancel_ensamble' }
          ]
        ]
      }
    }
    await bot.sendMessage(CHAT_ID,
      `✅ *Voz actualizada a: ${motorVozActivo}*\n${oldTTS.length > 0 ? `🔄 Se borraron ${oldTTS.length} audios TTS anteriores para regenerar con la nueva voz.\n` : ''}\n` +
      `🎬 *Resumen listo para ensamblar:*\n\n` +
      `🎥 Clips: *${existingClips.length}*\n` +
      `🗣️ Voz TTS: *${motorVozActivo}*\n` +
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
    const existingClips = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.mp4') && !f.includes('final') && !f.includes('output') && !f.includes('proc_'))
    const introFiles = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const hasScript = fs.existsSync(path.join(SCENES_DIR, 'script.json'))
    const audioDir = getAudioDir()
    const uploadedAudios = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).filter(f => /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f)).length : 0
    const ttsAudios = fs.readdirSync(SCENES_DIR).filter(f => f.startsWith('voiceover_') && f.endsWith('.mp3')).length
    const totalAudios = uploadedAudios + ttsAudios
    const audioStatus = totalAudios > 0
      ? `✅ ${totalAudios} audios (${uploadedAudios} subidos + ${ttsAudios} TTS)`
      : `⚠️ Sin audios — el video tendrá silencio`
    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `🗣️ Cambiar voz (actual: ${motorVozActivo.replace('es-MX-', '').replace('es-ES-', '').replace('Neural', '')})`, callback_data: 'pre_ensamble_voz' }
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
      `🗣️ Voz TTS: *${motorVozActivo}*\n` +
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

    motorVozActivo = selectedVoice;
    await bot.answerCallbackQuery(callbackQuery.id, { text: `✅ Voz cambiada a: ${motorVozActivo}` });
    await bot.sendMessage(CHAT_ID, `✅ Voz actualizada a: *${motorVozActivo}*`, { parse_mode: 'Markdown' });
  }

  // ── Eliminar intro por índice ──────────────────────────────────────────────
  if (data.startsWith('di:')) {
    const idx = data.replace('di:', '')
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId })
    if (idx === 'ALL') {
      const files = fs.existsSync(INTRO_DIR) ? fs.readdirSync(INTRO_DIR).filter(f => f.endsWith('.mp4')) : []
      files.forEach(f => { try { fs.unlinkSync(path.join(INTRO_DIR, f)) } catch(_){} })
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
      } catch(e) { await bot.sendMessage(chatId, `❌ No se pudo eliminar: ${e.message}`) }
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
      files.forEach(f => { try { fs.unlinkSync(path.join(OUTRO_DIR, f)) } catch(_){} })
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
      } catch(e) { await bot.sendMessage(chatId, `❌ No se pudo eliminar: ${e.message}`) }
    }
    await bot.answerCallbackQuery(callbackQuery.id)
    return
  }
})

// ── Cola de descargas secuenciales (1 a 1) ──────────────────────────
async function processDownloadQueue() {
  if (isDownloading || downloadQueue.length === 0) return
  isDownloading = true

  while (downloadQueue.length > 0) {
    if (cancelRequested) {
      log('🛑', 'Descarga cancelada')
      await bot.sendMessage(CHAT_ID, '🛑 Descarga cancelada. ' + receivedScenes.length + ' clips guardados.')
      cancelRequested = false; isDownloading = false; return
    }
    const { fileId, clipNum, filename, filePath } = downloadQueue.shift()
    let success = false

    // Intentar hasta 3 veces
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log('📥', `Descargando clip #${clipNum} (intento ${attempt}/3)...`)
        const fileUrl = await bot.getFileLink(fileId)
        const resp    = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
        fs.writeFileSync(filePath, resp.data)
        receivedScenes.push(filePath)
        const sizekB = Math.round(resp.data.byteLength / 1024)
        log('✅', `Clip #${clipNum} guardado: ${filename} (${sizekB} KB)`)

        const pendientes = totalScenes > 0 ? totalScenes - clipNum : '?'
        await bot.sendMessage(CHAT_ID,
          `✅ *Clip #${clipNum} guardado* → \`${filename}\` (${sizekB} KB)\n` +
          (totalScenes > 0
            ? (clipNum >= totalScenes
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
      failedClips.push(clipNum) // 📌 Registrar para el reporte final
      await bot.sendMessage(CHAT_ID,
        `⚠️ Clip #${clipNum} falló 3 veces. Lo anoto para avisarte al final.`,
        { parse_mode: 'Markdown' }
      )
    }

    await new Promise(r => setTimeout(r, 500))
  }

  isDownloading = false

  // 📌 Reporte final cuando la cola se vacía
  if (failedClips.length > 0) {
    await bot.sendMessage(CHAT_ID,
      `⚠️ *Descarga terminada con ${failedClips.length} error(es)*\n\n` +
      `Los siguientes clips no se pudieron bajar. Por favor reenvíamelos de nuevo:\n\n` +
      failedClips.map(n => `• Video #${n}`).join('\n') +
      `\n\n💡 Envíamelos uno por uno y el bot los agregará automáticamente al lote.`,
      { parse_mode: 'Markdown' }
    )
  } else if (downloadQueue.length === 0 && receivedScenes.length > 0) {
    await bot.sendMessage(CHAT_ID,
      `✅ *¡Todos los ${receivedScenes.length} clips descargados correctamente!*\n` +
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
      TODAY = specificDate // Actualizamos el estado para que los videos se guarden con esta fecha
    } else {
      await bot.sendMessage(CHAT_ID, `🔍 Buscando la efeméride *más reciente* generada...`, { parse_mode: 'Markdown' })
    }

    const res  = await axios.get(queryUrl, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    const data = res.data

    if (!Array.isArray(data) || data.length === 0) {
      await bot.sendMessage(CHAT_ID, `⚠️ No encontré ninguna efeméride. Ejecuta primero el script de generación.`)
      return
    }

    const ephemeris = data[0]
    
    // Si buscamos la más reciente, actualizamos TODAY a la fecha encontrada
    if (!specificDate) {
        TODAY = ephemeris.date
    } else {
        TODAY = specificDate
    }
    SCENES_DIR = path.join(SCENES_BASE_DIR, TODAY);
    if (!fs.existsSync(SCENES_DIR)) fs.mkdirSync(SCENES_DIR, { recursive: true });

    const scenes    = ephemeris.scenes || []

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

    totalScenes = allFrames.length
    await bot.sendMessage(CHAT_ID,
      `✅ *Efeméride encontrada (${ephemeris.date}):*\n"${ephemeris.ephemeris_text.substring(0, 100)}..."\n\n` +
      `🎬 Tengo *${totalScenes} fotogramas* para animar (en ${scenes.length} escenas).\n` +
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
        `🎬 <b>Escena ${frameItem.sceneNumber} - Fotograma ${frameItem.frameNumber}</b> (${i+1}/${allFrames.length})\n\n` +
        `📝 <b>Prompt para Meta AI:</b>\n` +
        `<i>${promptText}</i>\n\n` +
        `👆 Reenvía a Meta AI con el prompt de arriba.`

      if (frameItem.imageUrl) {
        // Descargar la imagen localmente antes de enviar a Telegram
        // (Telegram no puede acceder directamente a URLs de Pollinations)
        const tempImgPath = path.join(SCENES_DIR, `temp_frame_${i+1}.jpg`)
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
            log('⚠️', `Intento ${attempt}/3 fallido al descargar fotograma ${i+1}: ${imgErr.message}`)
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
          log('❌', `Fallo definitivo al descargar fotograma ${i+1}. Enviando solo texto.`)
          await bot.sendMessage(CHAT_ID, caption, { parse_mode: 'HTML' })
        }
      } else {
        await bot.sendMessage(CHAT_ID, caption, { parse_mode: 'HTML' })
      }


      log('📤', `Fotograma ${i+1}/${allFrames.length} enviado`)
    }

    await bot.sendMessage(CHAT_ID,
      `✅ ¡Listo! Te envié las *${totalScenes} escenas*.\n` +
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
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100', '-ac', '2',
        '-t', '5'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', (err) => {
        // Fallback: añadir audio de silencio si el clip no tiene stream de audio
        log('⚠️', `Reintentando normalización con audio de silencio: ${err.message}`)
        try { fs.unlinkSync(outputPath) } catch (_) {}
        ffmpegFactory()
          .input(inputPath)
          .input('anullsrc=r=44100:cl=stereo')
          .inputOptions(['-f', 'lavfi'])
          .outputOptions([
            '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
            '-map', '0:v:0', '-map', '1:a',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
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
    const ffmpeg     = require('fluent-ffmpeg')
    const ffmpegPath = require('ffmpeg-static')
    ffmpeg.setFfmpegPath(ffmpegPath)

    await safeSend('🎬 Procesando video shorts...')

    // 1. Logo random de assets/images/logos/
    const logosDir = path.join(__dirname, '..', 'assets', 'images', 'logos')
    let logoPath = null
    if (fs.existsSync(logosDir)) {
      const logos = fs.readdirSync(logosDir).filter(f => /\.(png|jpg)$/i.test(f))
      if (logos.length > 0) logoPath = path.join(logosDir, logos[Math.floor(Math.random() * logos.length)])
    }

    // 2. Portada del día: buscar ephemeris*.jpg en la carpeta de scenes del día
    let portadaPath = null
    const ephFiles = fs.readdirSync(SCENES_DIR).filter(f => f.startsWith('ephemeris') && /\.(jpg|jpeg|png)$/i.test(f))
    if (ephFiles.length > 0) portadaPath = path.join(SCENES_DIR, ephFiles[0])

    // 3. Outro más reciente
    const outroFiles = fs.existsSync(OUTRO_DIR) ? fs.readdirSync(OUTRO_DIR).filter(f => f.endsWith('.mp4')).sort().reverse() : []
    const outroSrc = outroFiles.length > 0 ? path.join(OUTRO_DIR, outroFiles[0]) : null

    const outputDir  = SCENES_DIR
    const finalPath  = path.join(outputDir, TODAY + '_shorts_final.mp4')
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
            '[1:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.75[logo]',
            '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[bg]',
            '[bg][logo]overlay=W-w-15:15[v_out]',
            'anullsrc=r=44100:cl=stereo[a_out]'
          ])
          .outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '3', '-r', '30'])
        } else {
          cmd.complexFilter([
            '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[v_out]',
            'anullsrc=r=44100:cl=stereo[a_out]'
          ])
          .outputOptions(['-y', '-map', '[v_out]', '-map', '[a_out]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '3', '-r', '30'])
        }
        cmd.output(portadaVid).on('end', resolve).on('error', reject).run()
      })
      parts.push(portadaVid)
      await safeSend('✅ Portada convertida (3s)')
    }

    // 5. Normalizar el video principal a 1080x1920 + logo
    const mainNorm = path.join(processedDir, 'main_norm.mp4')
    await new Promise((resolve, reject) => {
      let cmd = ffmpeg().input(inputVideoPath)
      if (logoPath) {
        cmd = cmd.input(logoPath)
        cmd.complexFilter([
          '[1:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.75[logo]',
          '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[bg]',
          '[bg][logo]overlay=W-w-15:15[v_out]'
        ])
        .outputOptions(['-y', '-map', '[v_out]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'])
      } else {
        cmd.outputOptions(['-y', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'])
      }
      cmd.output(mainNorm).on('end', resolve).on('error', (e) => {
        // fallback sin audio map
        ffmpeg().input(inputVideoPath)
          .input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
          .outputOptions(['-y', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest'])
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
          .outputOptions(['-y', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '5', '-shortest'])
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
        .outputOptions(['-y', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'])
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
      const url = await uploadToGoogleDrive(finalPath, TODAY + '_shorts_processed.mp4')
      await safeSend('✅ Subido a Drive: ' + url, { disable_web_page_preview: true })
    } catch(e) { await safeSend('⚠️ No se pudo subir a Drive: ' + e.message) }

    // 9. Preguntar si publicar
    await bot.sendMessage(chatId,
      '📱 *¿Publicar ahora en TikTok + FB Reel + YT Short?*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Publicar ahora', callback_data: 'confirm_publish_shorts' }],
            [{ text: '❌ Solo guardar en Drive', callback_data: 'cancel_publish_video' }]
          ]
        }
      }
    )
    bot._pendingVideoPath = finalPath

  } catch(err) {
    log('❌', 'procesarYPublicarShorts error: ' + err.message)
    await safeSend('❌ Error procesando: ' + err.message)
  }
}

// ── Ensamblar video final con FFmpeg ──────────────────────────────────────────
async function ensamblarVideoFinal() {
  try {
    const ffmpeg     = require('fluent-ffmpeg')
    const ffmpegPath = require('ffmpeg-static')
    ffmpeg.setFfmpegPath(ffmpegPath)
    const { spawnSync, execFileSync } = require('child_process')

    const outputPath    = path.join(SCENES_DIR, TODAY + '_final.mp4')
    const processedDir  = path.join(SCENES_DIR, 'processed')
    const normalizedDir = path.join(SCENES_DIR, 'normalized')
    if (!fs.existsSync(processedDir))  fs.mkdirSync(processedDir,  { recursive: true })
    if (!fs.existsSync(normalizedDir)) fs.mkdirSync(normalizedDir, { recursive: true })

    const allFiles = fs.readdirSync(SCENES_DIR)
      .filter(f => f.endsWith('.mp4') &&
        !f.includes('final') && !f.includes('output') && !f.includes('proc_') &&
        !f.includes('video_only') && !f.includes('master') && !f.includes('vertical') &&
        !f.includes('horizontal') && !f.includes('cuadrado'))
      .sort()

    if (allFiles.length === 0) {
      await safeSend('⚠️ No encontré ningún clip MP4. Reenvíame los videos primero.')
      return
    }
    const clipPaths = allFiles.map(f => path.join(SCENES_DIR, f))

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
    const scriptJsonPath = path.join(SCENES_DIR, 'script.json')
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
    const audioTxtPath = path.join(SCENES_DIR, '01_guion_audio_' + TODAY + '.txt')
    if (fs.existsSync(audioTxtPath)) {
      ephemerisContext = fs.readFileSync(audioTxtPath, 'utf8').substring(0, 3000)
    }
    const allNarration = ephemerisContext + ' ' + framesData.map(f => f.text).join(' ')
    const bgmTag  = selectBGMByContext(allNarration)
    const bgmPath = findBGMByTag(bgmTag)
    if (bgmPath) {
      await safeSend(`🎵 Música seleccionada: *${bgmTag}* (\`${path.basename(bgmPath)}\`)`, { parse_mode: 'Markdown' })
    }

    // ── ffprobe helper ────────────────────────────────────────────────────────
    const ffprobeStaticPath = (() => {
      try { return require('ffprobe-static').path } catch(_) {}
      const dir  = path.dirname(ffmpegPath)
      const name = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
      const p    = path.join(dir, name)
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
          filterParts.push(`[1:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.75[logo];[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[scaled];[scaled][logo]overlay=W-w-30:30[v_logo]`)
        } else {
          filterParts.push(`[0:v]scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black[v_logo]`)
        }
        // Sin subtítulos — solo logo
        filterParts.push(`[v_logo]copy[v_out]`)
        filterParts.push(`anullsrc=r=44100:cl=stereo[a_sil]`)
        cmd.complexFilter(filterParts.join(';'))
          .outputOptions([
            '-map', '[v_out]', '-map', '[a_sil]',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
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
      const videoOut = path.join(processedDir, `proc_${String(frameNum).padStart(2,'0')}.mp4`)
      // Check cancellation before each clip
      if (cancelRequested) {
        cancelRequested = false
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
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '5'
        ])
        .output(dst).on('end', resolve).on('error', (err) => {
          // Fallback: si no tiene audio, agregar silencio
          log('⚠️', `Fallo al procesar audio original de intro/salida. Usando silencio...`)
          try { fs.unlinkSync(dst) } catch (_) {}
          ffmpeg().input(src).input('anullsrc=r=44100:cl=stereo').inputOptions(['-f', 'lavfi'])
            .outputOptions([
              '-vf', 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black',
              '-map', '0:v:0', '-map', '1:a',
              '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
              '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-t', '5', '-shortest'
            ])
            .output(dst).on('end', resolve).on('error', reject).run()
        }).run()
    })

    let introProcPath = null, outroProcPath = null
    if (introSrc) {
      introProcPath = path.join(normalizedDir, 'intro_norm.mp4')
      try { await normalizeIntroOutro(introSrc, introProcPath); log('✅', 'Intro normalizado') }
      catch(e) { log('⚠️', 'Intro omitido: ' + e.message); introProcPath = null }
    }
    if (outroSrc) {
      outroProcPath = path.join(normalizedDir, 'outro_norm.mp4')
      try { await normalizeIntroOutro(outroSrc, outroProcPath); log('✅', 'Salida normalizada') }
      catch(e) { log('⚠️', 'Salida omitida: ' + e.message); outroProcPath = null }
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

    const videoOnlyPath = path.join(SCENES_DIR, TODAY + '_video_only.mp4')
    const concatTxtPath = path.join(SCENES_DIR, 'concat.txt')
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
    const narracionFiles = fs.readdirSync(SCENES_DIR)
      .filter(f => f.startsWith('narracion_completa') && /\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(f))

    if (narracionFiles.length > 0) {
      const narracionSrc = path.join(SCENES_DIR, narracionFiles[0])
      const narracionOut = path.join(SCENES_DIR, 'narracion_ajustada.mp3')

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
      const audioConcatTxt = path.join(SCENES_DIR, 'audio_concat.txt')
      const audioLines = []
      for (let i = 1; i <= clipPaths.length; i++) {
        const p = uploadedAudioMap[i]
        if (p && fs.existsSync(p)) audioLines.push(`file '${p.replace(/\\/g, '/')}'`)
      }
      if (audioLines.length > 0) {
        fs.writeFileSync(audioConcatTxt, audioLines.join('\n'))
        const concatenatedAudio = path.join(SCENES_DIR, 'narration_concatenated.mp3')
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
      const wordCount   = fullText.split(/\s+/).length
      const naturalSecs = (wordCount / 150) * 60
      const targetSecs  = scenesDur * 0.93 // Ajustar solo a las escenas
      const ratio       = naturalSecs / targetSecs
      let ratePercent   = Math.round((ratio - 1) * 100)
      ratePercent = Math.max(-45, Math.min(95, ratePercent))
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

      log('🎙️', `Palabras: ${wordCount} | natural: ${naturalSecs.toFixed(1)}s | target: ${targetSecs.toFixed(1)}s | rate: ${rateStr}`)
      await safeSend(`🎙️ TTS: *${wordCount} palabras* — velocidad *${rateStr}* para ${targetSecs.toFixed(1)}s`, { parse_mode: 'Markdown' })

      const fullTextPath = path.join(SCENES_DIR, 'narration_full.txt')
      const rawAudioPath = path.join(SCENES_DIR, 'narration_raw.mp3')
      fs.writeFileSync(fullTextPath, fullText, 'utf8')

      const ttsResult = spawnSync('python', [
        '-m', 'edge_tts', '--voice', motorVozActivo, `--rate=${rateStr}`,
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
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
             '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest'
           ])
      } else {
        cmd.outputOptions([
          '-map', '0:v', '-map', '0:a',
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
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
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-ar', '44100', '-ac', '2'
        ])
        .output(output).on('end', resolve).on('error', reject).run()
    })

    const formatos = [
      {
        label: '📱 Vertical 9:16', desc: 'TikTok / Reels / Shorts',
        // El master ya es 2160x3840 — solo re-encoder
        vf: 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        filename: TODAY + '_vertical_9x16.mp4'
      },
      {
        label: '🖥️ Horizontal 16:9', desc: 'YouTube / Facebook Video',
        // Video vertical centrado con barras negras a los lados — 4K UHD
        vf: 'scale=2160:3840:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        filename: TODAY + '_horizontal_16x9.mp4'
      },
      {
        label: '⬛ Cuadrado 1:1', desc: 'Instagram / Facebook Feed',
        vf: 'scale=2160:2160:force_original_aspect_ratio=decrease,pad=2160:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        filename: TODAY + '_cuadrado_1x1.mp4'
      }
    ]

    const exportResults = []
    for (const fmt of formatos) {
      const fmtPath = path.join(SCENES_DIR, fmt.filename)
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
    try { driveLinks.push(`🎬 Master: [Ver](${await uploadToGoogleDrive(outputPath, TODAY + '_master.mp4')})`) }
    catch(e) { driveLinks.push(`🎬 Master: ❌ ${e.message}`) }
    for (const r of exportResults) {
      if (!r.ok) { driveLinks.push(`${r.label}: ❌ No generado`); continue }
      try { driveLinks.push(`${r.label}: [Ver](${await uploadToGoogleDrive(r.fmtPath, r.filename)})`) }
      catch(e) { driveLinks.push(`${r.label}: ❌ ${e.message}`) }
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
async function getOrCreateDateFolder(drive, dateStr) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const search = await drive.files.list({
    q: `'${rootFolderId}' in parents and name='${dateStr}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)', pageSize: 1
  })
  if (search.data.files && search.data.files.length > 0) {
    log('📁', `Subcarpeta encontrada: ${dateStr} (${search.data.files[0].id})`)
    return search.data.files[0].id
  }
  const folder = await drive.files.create({
    requestBody: { name: dateStr, mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] },
    fields: 'id'
  })
  log('📁', `Subcarpeta creada: ${dateStr} (${folder.data.id})`)
  return folder.data.id
}

// ── Subir archivo a Drive ─────────────────────────────────────────────────────
async function uploadToGoogleDrive(filePath, filename, mimeType = 'video/mp4', dateStr = TODAY) {
  const { google } = require('googleapis')
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth: oauth2 })
  const dateFolderId = await getOrCreateDateFolder(drive, dateStr)
  log('☁️', `Subiendo ${filename} a Drive > ${dateStr}/...`)
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [dateFolderId], mimeType },
    media: { mimeType, body: fs.createReadStream(filePath) },
    fields: 'id, webViewLink'
  })
  await drive.permissions.create({ fileId: res.data.id, requestBody: { role: 'reader', type: 'anyone' } })
  log('✅', `Subido: ${res.data.webViewLink}`)
  return res.data.webViewLink
}

// ── Selección de BGM por contexto ─────────────────────────────────────────────
function selectBGMByContext(narrationText) {
  const txt = (narrationText || '').toLowerCase()
  const categories = [
    { tag: 'epico',         keywords: ['guerra', 'batalla', 'conquista', 'revolución', 'cohete', 'nasa', 'apollo', 'misil', 'bomba', 'nuclear', 'ataque'] },
    { tag: 'inspiracional', keywords: ['inventor', 'genio', 'visionario', 'soñaba', 'soñó', 'legado', 'nació', 'creador', 'fundador', 'pionero', 'primera vez'] },
    { tag: 'tecnologico',   keywords: ['computadora', 'ordenador', 'software', 'hardware', 'internet', 'código', 'algoritmo', 'programación', 'chip', 'transistor', 'procesador', 'cpu', 'inteligencia artificial', 'byte'] },
    { tag: 'dramatico',     keywords: ['murió', 'muerte', 'fracaso', 'fracasó', 'crisis', 'accidente', 'colapso', 'falló', 'tragedia', 'perdió', 'ruina'] },
    { tag: 'cientifico',    keywords: ['descubrimiento', 'descubrió', 'física', 'química', 'biología', 'laboratorio', 'experimento', 'teoría', 'fórmula', 'científ', 'nobel'] },
    { tag: 'futuro',        keywords: ['futuro', 'inteligencia artificial', 'robot', 'automatización', 'metaverso', 'blockchain', 'cuántico', 'nanotecnolog', '5g', '6g'] }
  ]
  let best = { tag: 'inspiracional', count: 0 }
  for (const cat of categories) {
    const count = cat.keywords.filter(kw => txt.includes(kw)).length
    if (count > best.count) best = { tag: cat.tag, count }
  }
  return best.tag
}

// ── Buscar archivo de música por tag ─────────────────────────────────────────
function findBGMByTag(tag) {
  const musicDir = path.join(__dirname, '..', 'assets', 'audio', 'music')
  if (!fs.existsSync(musicDir)) return null
  const directFiles = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') && f.toLowerCase().includes(tag.toLowerCase()))
  if (directFiles.length > 0) return path.join(musicDir, directFiles[Math.floor(Math.random() * directFiles.length)])
  const subDir = path.join(musicDir, tag)
  if (fs.existsSync(subDir)) {
    const subFiles = fs.readdirSync(subDir).filter(f => f.endsWith('.mp3'))
    if (subFiles.length > 0) return path.join(subDir, subFiles[Math.floor(Math.random() * subFiles.length)])
  }
  const allMp3 = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'))
  if (allMp3.length > 0) return path.join(musicDir, allMp3[Math.floor(Math.random() * allMp3.length)])
  return null
}

// ── Inicio ────────────────────────────────────────────────────────────────────
log('🚀', 'Bot de Telegram iniciado correctamente')
log('🤖', `Bot: @CodeHistoryDaily_bot`)
log('👤', `Escuchando mensajes de Chat ID: ${CHAT_ID}`)
log('📁', `Clips se guardan en: ${SCENES_DIR}`)

bot.sendMessage(CHAT_ID,
  `🚀 *¡Bot CodeHistory Daily conectado!*\n\n` +
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
      `🎬 */subir_video_shorts* — Subir tu video editado y publicar automáticamente\n` +
      `🎥 */publicar_video* — Publicar vertical 9:16 (TikTok + FB Reel + YT Short)\n` +
      `🖥️ */publicar_video_16x9* — Publicar horizontal 16:9 (YouTube Video + Facebook Video)\n` +
      `🔍 */estado* — Ver clips guardados + intro/salida activos\n` +
      `🔄 */reset* — Reiniciar el contador de hoy\n` +
      `🗑️ */limpiar* — Borrar todos los clips del disco\n` +
      `🛑 */parar* — Cancelar cualquier proceso en curso\n`,
  { parse_mode: 'Markdown' }
).catch(err => log('⚠️', `No pude enviar bienvenida: ${err.message}`))
