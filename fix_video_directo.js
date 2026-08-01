const fs = require('fs');
let code = fs.readFileSync('scripts/bot/handlers/commands.js', 'utf8');

const injection = `    // Guardar la ruta del video en memoria para el callback
    bot._pendingVideoPath = videoPath
    return
  }

  // /subir_video_directo — Subir video crudo y publicar directamente
  if (text === '/subir_video_directo' || text.startsWith('/subir_video_directo')) {
    state.pendingUploadMode = 'video_directo'
    await bot.sendMessage(CHAT_ID,
      '⚡ *Modo: Subir Video Directo activado*\\n\\n' +
      'Envíame ahora el video (crudo).\\nSe procesará y publicará automáticamente utilizando los textos generados de hoy.',
      { parse_mode: 'Markdown' }
    )
    return
  }

  // /generar_dia`;

code = code.replace(/    \/\/ Guardar la ruta del video en memoria para el callback\r?\n    bot\._pendingVideoPath = videoPath\r?\n    return\r?\n  \}\r?\n\r?\n  \/\/ \/generar_dia/, injection);

fs.writeFileSync('scripts/bot/handlers/commands.js', code, 'utf8');
console.log('Fixed');
