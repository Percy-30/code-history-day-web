/**
 * bot/check-connection.js — Verificación de conectividad reutilizable
 * 
 * Verifica la conexión a internet, Telegram y Google Drive.
 * Se usa en safe-action.js para dar diagnósticos profesionales al usuario.
 */
const https = require('https')

/**
 * Verificar si hay conexión a internet (ping a Google DNS)
 * @returns {Promise<boolean>}
 */
async function checkInternet() {
  return new Promise(resolve => {
    const req = https.get('https://dns.google', { timeout: 5000 }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/**
 * Verificar si la API de Telegram responde
 * @param {string} botToken
 * @returns {Promise<boolean>}
 */
async function checkTelegram(botToken) {
  return new Promise(resolve => {
    const req = https.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 5000 }, res => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/**
 * Verificar si Google Drive está accesible
 * @returns {Promise<boolean>}
 */
async function checkGoogleDrive() {
  return new Promise(resolve => {
    const req = https.get('https://www.googleapis.com/drive/v3/about', { timeout: 5000 }, res => {
      // 401 = no auth pero el servidor responde = Drive está UP
      resolve(res.statusCode === 401 || (res.statusCode >= 200 && res.statusCode < 500))
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/**
 * Ejecutar todas las verificaciones de conectividad
 * @param {string} botToken
 * @returns {Promise<{internet: boolean, telegram: boolean, drive: boolean, summary: string}>}
 */
async function checkAll(botToken) {
  const [internet, telegram, drive] = await Promise.all([
    checkInternet(),
    checkTelegram(botToken),
    checkGoogleDrive()
  ])

  const lines = []
  lines.push(internet ? '  ✅ Internet: Conectado'    : '  ❌ Internet: Sin conexión')
  lines.push(telegram ? '  ✅ Telegram: Conectado'    : '  ❌ Telegram: No responde')
  lines.push(drive    ? '  ✅ Google Drive: Conectado' : '  ❌ Google Drive: No responde')

  return {
    internet,
    telegram,
    drive,
    summary: lines.join('\n')
  }
}

module.exports = { checkInternet, checkTelegram, checkGoogleDrive, checkAll }
