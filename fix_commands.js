const fs = require('fs');
let code = fs.readFileSync('scripts/bot/handlers/commands.js', 'utf8');

// Fix 1: Error Markdown in /publicar_post
code = code.replace(
  /await bot\.sendMessage\(CHAT_ID,\s*`❌ No encuentro la portada local de hoy\.\\n\\n` \+\s*`Archivo esperado:\\n\\`\$\{imgPath\}\\`\\n\\n` \+\s*`Primero usa \/subir_portada y enviame la imagen como FOTO\.`,\s*\{ parse_mode: 'Markdown' \}\s*\)/,
  `try {
        await bot.sendMessage(CHAT_ID,
          \`❌ No encuentro la portada local de hoy.\\n\\n\` +
          \`Archivo esperado:\\n<code>\${escapeHTML(imgPath)}</code>\\n\\n\` +
          \`Primero usa /subir_portada y enviame la imagen como FOTO.\`,
          { parse_mode: 'HTML' }
        )
      } catch(err) {
        log('❌', 'Error enviando msg de portada: ' + err.message)
      }`
);

// Fix 2: Unhandled rejection in /publicar_post image sending
code = code.replace(
  /await bot\.sendPhoto\(CHAT_ID, imgPath, \{\s*caption:\s*`📢 <b>Previsualización del Post Gráfico<\/b>\\n\\n` \+\s*`🖼️ Portada: <code>\$\{path\.basename\(imgPath\)\}<\/code>\\n` \+\s*`📦 Tamaño: <b>\$\{sizeMB\} MB<\/b>\\n\\n` \+\s*`El texto completo del post va en el siguiente mensaje\. ⬇️`,\s*parse_mode: 'HTML'\s*\}\)/,
  `try {
      await bot.sendPhoto(CHAT_ID, imgPath, {
        caption:
          \`📢 <b>Previsualización del Post Gráfico</b>\\n\\n\` +
          \`🖼️ Portada: <code>\${path.basename(imgPath)}</code>\\n\` +
          \`📦 Tamaño: <b>\${sizeMB} MB</b>\\n\\n\` +
          \`El texto completo del post va en el siguiente mensaje. ⬇️\`,
        parse_mode: 'HTML'
      })
    } catch(err) {
      log('❌', 'Error al enviar previsualización: ' + err.message)
      await bot.sendMessage(CHAT_ID, \`❌ Error enviando foto: \${err.message}\`)
      return
    }`
);

// Fix 3: Injecting generateProfessionalPost into /generar_dia
const searchGenerarDiaEnd = `await bot.sendMessage(CHAT_ID, \`📣 Paso 4/4 — Enviando Prompt Maestro para Meta AI...\`)`;
const replacementGenerarDiaEnd = `// ── Generar Post para Redes Sociales con Groq AI ─────────────────────────
      await bot.sendMessage(CHAT_ID, \`📝 Paso 4/5 — Redactando post profesional para redes sociales...\`)
      try {
        const { generateProfessionalPost } = require('../services/groq')
        const postContent = await generateProfessionalPost(
          historicalDateStr || targetDate,
          ephemerisText || 'Efeméride tecnológica del día'
        )
        fs.writeFileSync(path.join(state.SCENES_DIR, \`post_text_\${targetDate}.txt\`), postContent, 'utf8')
        fs.writeFileSync(path.join(state.SCENES_DIR, \`05_social_media_post_\${targetDate}.txt\`), postContent, 'utf8')
        await bot.sendMessage(CHAT_ID, \`✅ Post guardado en \\\`post_text_\${targetDate}.txt\\\`\`, { parse_mode: 'Markdown' })
      } catch (err) {
        log('⚠️', \`No se generó el post de redes sociales: \${err.message}\`)
        const fallbackPost = \`🚀 CodeHistory Daily | Efeméride Tecnológica del Día\\n\\n📅 \${historicalDateStr || targetDate}\\n\\nDescubre la historia tecnológica de hoy en CodeHistory Daily.\\n\\n🌍 Más historias tecnológicas:\\nhttps://code-history-day-web-alpha.vercel.app\\n\\n▶️ youtube.com/@CodeHistoryDaily\\n\\n🎵 tiktok.com/@codehistorydaily\\n\\n📱 facebook.com/CodeHistoryDaily\\n\\n#CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Tecnologia #Historia\`
        fs.writeFileSync(path.join(state.SCENES_DIR, \`post_text_\${targetDate}.txt\`), fallbackPost, 'utf8')
      }
      
      await bot.sendMessage(CHAT_ID, \`📣 Paso 5/5 — Enviando Prompt Maestro para Meta AI...\`)`;

code = code.replace(searchGenerarDiaEnd, replacementGenerarDiaEnd);

// Fix 4: Rename steps 2/4 and 3/4 to 2/5 and 3/5
code = code.replace('✅ Paso 2/4', '✅ Paso 2/5');
code = code.replace('🎬 Paso 3/4', '🎬 Paso 3/5');

fs.writeFileSync('scripts/bot/handlers/commands.js', code, 'utf8');
console.log('Fixed successfully');
