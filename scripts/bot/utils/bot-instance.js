/**
 * bot/utils/bot-instance.js — Singleton del bot de Telegram
 *
 * Permite que módulos desacoplados (download-queue, video-processor)
 * accedan al bot sin necesidad de que se les pase como parámetro.
 *
 * Uso:
 *   // En el entry point, después de crear el bot:
 *   const botInstance = require('./bot/utils/bot-instance')
 *   botInstance.init(bot)
 *
 *   // En cualquier módulo:
 *   const { send, getBot, getChatId } = require('../utils/bot-instance')
 *   await send('Hola!')
 */
const { log } = require('../safe-action')

let _bot    = null
let _chatId = null

/**
 * Inicializa el singleton con la instancia del bot y el chat ID.
 * Debe llamarse UNA vez desde el entry point, antes de registrar handlers.
 */
function init(bot, chatId) {
  _bot    = bot
  _chatId = chatId
  log('+', 'bot-instance: singleton inicializado correctamente.')
}

/** @returns {import('node-telegram-bot-api')} La instancia del bot */
function getBot() { return _bot }

/** @returns {number} El chat ID del propietario */
function getChatId() { return _chatId }

/**
 * Envía un mensaje al chat del propietario de forma segura (no crashea).
 * @param {string} text    Texto del mensaje
 * @param {object} [opts]  Opciones del mensaje (parse_mode, reply_markup, etc.)
 * @returns {Promise<object|null>}
 */
async function send(text, opts = {}) {
  if (!_bot || !_chatId) {
    log('⚠️', 'bot-instance.send: bot no inicializado todavía')
    return null
  }
  try {
    return await _bot.sendMessage(_chatId, text, opts)
  } catch (e) {
    log('s?', 'bot-instance.send: no se pudo enviar: ' + e.message)
    return null
  }
}

module.exports = { init, getBot, getChatId, send }
