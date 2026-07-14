#!/usr/bin/env node
/**
 * Bot de Telegram - Asistente de Meta AI para CodeHistory Daily
 * Arquitectura 100% Modular y Profesional
 */

// 1. Configuraciones y Estado Centralizado
const config = require('./bot/config');
const state  = require('./bot/state');
const { log } = require('./bot/safe-action');

// 2. Dependencias Externas
const TelegramBotLib = require('node-telegram-bot-api');
const TelegramBot = TelegramBotLib.default || TelegramBotLib;

// 3. Importar Handlers Modulares
const registerCommands = require('./bot/handlers/commands');
const registerMediaHandler = require('./bot/handlers/media');
const registerCallbacks = require('./bot/handlers/callbacks');

const { BOT_TOKEN, CHAT_ID } = config;

// Manejo global de errores (Professional Resilience)
process.on('uncaughtException', (err) => {
  log('x', 'uncaughtException: ' + err.message);
  if (err.code === 'EFATAL' || err.message.includes('fetch failed') || err.message.includes('ENOTFOUND')) {
    log('!', 'Error de red temporal, el bot continua...');
  }
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log('x', 'unhandledRejection: ' + msg);
});

// Inicializacion del Bot
function initBot() {
  log('+', 'Iniciando CodeHistory Daily Bot (MODULAR)...');
  const bot = new TelegramBot(BOT_TOKEN, { 
    polling: true
  });

  // Manejar errores de red de Telegram silenciosamente
  bot.on('polling_error', (error) => {
    if (error.code === 'EFATAL' || (error.message && error.message.includes('fetch failed'))) {
      // Ignorar el spam de error de red temporal
    } else {
      log('x', 'Telegram Polling Error: ' + error.message);
    }
  });

  // Registrar todos los handlers de manera limpia
  registerCommands(bot);
  registerMediaHandler(bot);
  registerCallbacks(bot);

  // Mensaje de bienvenida on boot
  bot.sendMessage(CHAT_ID, 
    'Bot CodeHistory Daily Reiniciado (Arquitectura Modular)\n\n' +
    'Modulos activos:\n' +
    '- Comandos (/start)\n' +
    '- Gestor de Media\n' +
    '- Callbacks y Publicacion\n\n' +
    'Sistema 100% profesional.',
    { parse_mode: 'Markdown' }
  ).catch(err => log('x', 'No pude enviar bienvenida: ' + err.message));

  log('+', 'Bot conectado y escuchando comandos.');
}

initBot();
