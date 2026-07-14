const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'telegram-meta-ai-bot.js');
const lines = fs.readFileSync(srcFile, 'utf8').split('\n');

const headerLines = [
  "const config = require('../config')",
  "const state  = require('../state')",
  "const { safeAction, safeSend: _safeSend, log } = require('../safe-action')",
  "const { truncateAtWord, detectFrameNumber, escapeHTML } = require('../utils/text')",
  "const { selectBGMByContext, findBGMByTag } = require('../utils/bgm')",
  "const { uploadToGoogleDrive, createDriveClient } = require('../services/drive')",
  "const { generateYouTubeDescription, cleanScriptWithAI, generateProfessionalPost } = require('../services/groq')",
  "const axios = require('axios')",
  "const fs = require('fs')",
  "const path = require('path')",
  "const publisher = require('../../publisher.js')",
  "const { BOT_TOKEN, CHAT_ID, SUPABASE_URL, SUPABASE_KEY, SCENES_BASE_DIR, INTRO_DIR, OUTRO_DIR, LOGOS_DIR, BGM_DIR } = config",
  "",
  "let { TODAY, SCENES_DIR, sceneCounter, totalScenes, receivedScenes, downloadQueue, isDownloading, savedAudioScript, motorVozActivo, velocidadVozActiva, pendingUploadMode, audioUploadCounter, failedClips, cancelRequested } = state",
  "",
  "async function safeSend(bot, text, opts = {}) {",
  "  try { await bot.sendMessage(CHAT_ID, text, opts) }",
  "  catch (e) { log('s?', 'No se pudo enviar mensaje: ' + e.message) }",
  "}",
  ""
];

// Commands logic: 115 to 1085 (indices 114 to 1084)
let commandsLogic = lines.slice(114, 1085).join('\n');
const commandsContent = [
  ...headerLines,
  "module.exports = function registerCommands(bot) {",
  "  bot.on('message', async (msg) => {",
  "    if (msg.chat.id !== CHAT_ID) return;",
  "    const text = (msg.text || '').toLowerCase().trim();",
  "    if (!text) return;",
  commandsLogic,
  "  });",
  "}"
].join('\n');
fs.writeFileSync(path.join(__dirname, 'bot/handlers/commands.js'), commandsContent);

// Media logic: 1086 to 1371 (indices 1085 to 1370)
let mediaLogic = lines.slice(1085, 1371).join('\n');
const mediaContent = [
  ...headerLines,
  "module.exports = function registerMediaHandler(bot) {",
  "  bot.on('message', async (msg) => {",
  "    if (msg.chat.id !== CHAT_ID) return;",
  mediaLogic,
  "  });",
  "}"
].join('\n');
fs.writeFileSync(path.join(__dirname, 'bot/handlers/media.js'), mediaContent);

// Callbacks logic: 1376 to 2995 (indices 1375 to 2994)
// find where bot.on('callback_query' ends (probably index 2994 or so)
let callbacksEndIdx = lines.length - 1;
for (let i = lines.length - 1; i > 1375; i--) {
  if (lines[i].includes('})')) {
    callbacksEndIdx = i;
    break;
  }
}
let callbacksLogic = lines.slice(1375, callbacksEndIdx).join('\n');
const callbacksContent = [
  ...headerLines,
  "module.exports = function registerCallbacks(bot) {",
  "  bot.on('callback_query', async (callbackQuery) => {",
  callbacksLogic,
  "  });",
  "}"
].join('\n');
fs.writeFileSync(path.join(__dirname, 'bot/handlers/callbacks.js'), callbacksContent);

console.log('Successfully generated handlers!');
