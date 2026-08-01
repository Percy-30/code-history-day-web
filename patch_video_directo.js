const fs = require('fs');
let c = fs.readFileSync('scripts/bot/handlers/commands.js', 'utf8');

if (!c.includes('⚡ */subir_video_directo*')) {
  c = c.replace(
    /🎬 \*\/subir_video_shorts\* — Subir tu video editado y publicar automáticamente\\n` \+/,
    `🎬 */subir_video_shorts* — Subir tu video editado y publicar automáticamente\\n\` +\n      \`⚡ */subir_video_directo* — Subir video crudo y publicar directamente\\n\` +`
  );
}

if (!c.includes('/subir_video_directo')) {
  c = c.replace(
    /        }\n      }\n    \)\n    return\n  }\n/,
    `        }\n      }\n    )\n    return\n  }\n\n  // /subir_video_directo — Subir video crudo y publicar directamente\n  if (text === '/subir_video_directo' || text.startsWith('/subir_video_directo')) {\n    state.pendingUploadMode = 'video_directo'\n    await bot.sendMessage(CHAT_ID,\n      '⚡ *Modo: Subir Video Directo activado*\\n\\n' +\n      'Envíame ahora el video (crudo).\\nSe procesará y publicará automáticamente utilizando los textos generados de hoy.',\n      { parse_mode: 'Markdown' }\n    )\n    return\n  }\n`
  );
}

fs.writeFileSync('scripts/bot/handlers/commands.js', c);
console.log('Patched commands.js for subir_video_directo');
