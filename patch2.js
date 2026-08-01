const fs = require('fs');
let c = fs.readFileSync('scripts/bot/handlers/commands.js', 'utf8');
c = c.replace(
  "if (text === '/subir_audio_completo') {",
  `// /subir_video_directo — Subir video crudo y publicar directamente
  if (text === '/subir_video_directo' || text.startsWith('/subir_video_directo')) {
    state.pendingUploadMode = 'video_directo'
    bot.sendMessage(CHAT_ID,
      '⚡ *Modo: Subir Video Directo activado*\\n\\n' +
      'Envíame ahora el video (crudo).\\nSe procesará y publicará automáticamente utilizando los textos generados de hoy.',
      { parse_mode: 'Markdown' }
    )
    return
  }

  if (text === '/subir_audio_completo') {`
);
fs.writeFileSync('scripts/bot/handlers/commands.js', c);
console.log('Patch2 done');
