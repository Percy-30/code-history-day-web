/**
 * bot/safe-action.js — Wrapper profesional con retry/cancel para TODAS las acciones
 * 
 * Uso:
 *   const { safeAction } = require('./safe-action')
 *   await safeAction(bot, chatId, 'Descargando video', async () => {
 *     // ... lógica que puede fallar ...
 *   }, { retryCallback: 'shorts_from_drive', cancelCallback: 'cancel_publish_video' })
 */
const { checkAll } = require('./check-connection')
const { BOT_TOKEN } = require('./config')

function log(emoji, msg) { console.log(`${emoji}  ${msg}`) }

/**
 * Ejecuta una acción de forma segura. Si falla, muestra diagnóstico + botones retry/cancel.
 * 
 * @param {object}   bot             - Instancia del bot de Telegram
 * @param {number}   chatId          - Chat ID del usuario
 * @param {string}   actionName      - Nombre descriptivo de la acción (ej: "Descargando video")
 * @param {Function} actionFn        - Función async con la lógica principal
 * @param {object}   [opts]          - Opciones
 * @param {string}   [opts.retryCallback]  - callback_data para el botón de reintentar
 * @param {string}   [opts.cancelCallback] - callback_data para el botón de cancelar
 * @param {boolean}  [opts.showDiagnostics=true] - Mostrar diagnóstico de conexión
 * @returns {Promise<any>} - El resultado de actionFn si tuvo éxito
 */
async function safeAction(bot, chatId, actionName, actionFn, opts = {}) {
  const {
    retryCallback = null,
    cancelCallback = 'cancel_publish_video',
    showDiagnostics = true
  } = opts

  try {
    return await actionFn()
  } catch (err) {
    log('❌', `Error en "${actionName}": ${err.message}`)

    // Construir mensaje de error profesional
    let errorMsg = `⚠️ *Ocurrió un problema durante:* ${actionName}\n\n`
    errorMsg += `\`${err.message.substring(0, 300)}\`\n`

    // Diagnóstico de conexión (solo si es un error de red)
    if (showDiagnostics && isNetworkError(err)) {
      try {
        const status = await checkAll(BOT_TOKEN)
        errorMsg += `\n🌐 *Estado de conexión:*\n${status.summary}\n`
      } catch (_) {
        errorMsg += `\n🌐 No se pudo verificar la conexión.\n`
      }
    }

    // Construir botones de acción
    const buttons = []
    if (retryCallback) {
      buttons.push([{ text: '🔄 Reintentar', callback_data: retryCallback }])
    }
    buttons.push([{ text: '❌ Cancelar', callback_data: cancelCallback }])

    const msgOpts = { parse_mode: 'Markdown' }
    if (buttons.length > 0) {
      msgOpts.reply_markup = { inline_keyboard: buttons }
    }

    try {
      await bot.sendMessage(chatId, errorMsg, msgOpts)
    } catch (sendErr) {
      log('💥', `No se pudo enviar el mensaje de error: ${sendErr.message}`)
    }

    return null // Indica que falló
  }
}

/**
 * Determina si un error es de red/conectividad
 */
function isNetworkError(err) {
  const msg = (err.message || '').toLowerCase()
  const networkKeywords = [
    'fetch failed', 'efatal', 'enotfound', 'econnrefused', 'econnreset',
    'etimedout', 'enetunreach', 'socket hang up', 'aborted', 'network',
    'timeout', 'dns', 'certificate', 'ssl'
  ]
  return networkKeywords.some(kw => msg.includes(kw))
}

/**
 * Helper: enviar mensaje sin crashear si hay error de red
 */
async function safeSend(bot, chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts)
  } catch (e) {
    log('⚠️', 'No se pudo enviar mensaje: ' + e.message)
    return null
  }
}

module.exports = { safeAction, safeSend, isNetworkError, log }
