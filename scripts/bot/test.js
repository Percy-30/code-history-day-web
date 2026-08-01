const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.BOT_TOKEN);
bot.sendMessage(config.CHAT_ID, `❌ No encuentro la portada local de hoy.\n\nArchivo esperado:\n\`d:\\PROYECTOS\\code-history-day-web\\scripts\\downloads\\scenes\\2026-07-31\\ephemeris_2026-07-31.jpg\`\n\nPrimero usa /subir_portada y enviame la imagen como FOTO.`, { parse_mode: 'Markdown' }).then(() => console.log('OK')).catch(console.error);
