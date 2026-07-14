const fs = require('fs');
const path = require('path');

const files = [
  'callbacks.js',
  'commands.js',
  'media.js'
].map(f => path.join('d:/PROYECTOS/code-history-day-web/scripts/bot/handlers', f));

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  
  const search = "async function safeSend(bot, text, opts = {}) {\n  try { await bot.sendMessage(CHAT_ID, text, opts) }\n  catch (e) { log('s?', 'No se pudo enviar mensaje: ' + e.message) }\n}";
  const replace = "let globalBot = null;\nasync function safeSend(text, opts = {}) {\n  if (!globalBot) return;\n  try { await globalBot.sendMessage(CHAT_ID, text, opts) }\n  catch (e) { log('s?', 'No se pudo enviar mensaje: ' + e.message) }\n}";
  
  c = c.replace(search, replace);
  
  c = c.replace(/module\.exports = function ([a-zA-Z]+)\(bot\) \{/, "module.exports = function $1(bot) {\n  globalBot = bot;");
  
  fs.writeFileSync(f, c, 'utf8');
});

console.log('Fixed safeSend globally!');
