const fs = require('fs');
const file = 'scripts/bot/handlers/commands.js';
let content = fs.readFileSync(file, 'utf8');

// Fix 1: imgPath unescaped markdown bug
content = content.replace(
  /if \(!fs\.existsSync\(imgPath\)\) \{\s*await bot\.sendMessage\(CHAT_ID,\s*`❌ No encuentro la portada local de hoy\.\\n\\n` \+\s*`Archivo esperado:\\n\\`\$\{imgPath\}\\`\\n\\n` \+\s*`Primero usa \/subir_portada y enviame la imagen como FOTO\.`,\s*\{ parse_mode: 'Markdown' \}\s*\)\s*return\s*\}/,
  \`if (!fs.existsSync(imgPath)) {
      try {
        await bot.sendMessage(CHAT_ID,
          \`❌ No encuentro la portada local de hoy.\\n\\n\` +
          \`Archivo esperado:\\n<code>\${escapeHTML(imgPath)}</code>\\n\\n\` +
          \`Primero usa /subir_portada y enviame la imagen como FOTO.\`,
          { parse_mode: 'HTML' }
        )
      } catch (err) {
        log('❌', 'Error al enviar advertencia de portada: ' + err.message)
      }
      return
    }\`
);

// Fix 2: sendPhoto unhandled rejection
content = content.replace(
  /await bot\.sendPhoto\(CHAT_ID, imgPath, \{\s*caption:\s*`📢 <b>Previsualización del Post Gráfico<\/b>\\n\\n` \+\s*`🖼️ Portada: <code>\$\{path\.basename\(imgPath\)\}<\/code>\\n` \+\s*`📦 Tamaño: <b>\$\{sizeMB\} MB<\/b>\\n\\n` \+\s*`El texto completo del post va en el siguiente mensaje\. ⬇️`,\s*parse_mode: 'HTML'\s*\}\)/,
  \`try {
      await bot.sendPhoto(CHAT_ID, imgPath, {
        caption:
          \`📢 <b>Previsualización del Post Gráfico</b>\\n\\n\` +
          \`🖼️ Portada: <code>\${path.basename(imgPath)}</code>\\n\` +
          \`📦 Tamaño: <b>\${sizeMB} MB</b>\\n\\n\` +
          \`El texto completo del post va en el siguiente mensaje. ⬇️\`,
        parse_mode: 'HTML'
      })
    } catch (err) {
      log('❌', 'Error enviando foto de portada: ' + err.message)
      await bot.sendMessage(CHAT_ID, \`❌ Error enviando foto de portada: \${err.message}\`)
      return
    }\`
);

// Fix 3: /generar_dia injecting the Groq AI call
content = content.replace(
  /await bot\.sendMessage\(CHAT_ID, `✅ Paso 2\/4 — 4 archivos TXT guardados en \\`scenes\/\$\{targetDate\}\/\\``\)/,
  \`await bot.sendMessage(CHAT_ID, \\\`✅ Paso 2/5 — 4 archivos TXT guardados en \\\\\\`scenes/\${targetDate}/\\\\\\`\\\`)\`
);

content = content.replace(
  /await bot\.sendMessage\(CHAT_ID, `🎬 Paso 3\/4 — Generando prompts cinematográficos para Shorts con IA\.\.\.`\)/,
  \`await bot.sendMessage(CHAT_ID, \\\`🎬 Paso 3/5 — Generando prompts cinematográficos para Shorts con IA...\\\`)\`
);

content = content.replace(
  /await bot\.sendMessage\(CHAT_ID, `📣 Paso 4\/4 — Enviando Prompt Maestro para Meta AI\.\.\.`\)/,
  \`// ── Generar Post para Redes Sociales con Groq AI ─────────────────────────
      await bot.sendMessage(CHAT_ID, \\\`📝 Paso 4/5 — Redactando post profesional para redes sociales...\\\`)
      try {
        const postContent = await generateProfessionalPost(
          historicalDateStr || targetDate,
          ephemerisText || 'Efeméride tecnológica del día'
        )
        // Guardamos explícitamente en el archivo que publicador espera
        fs.writeFileSync(path.join(state.SCENES_DIR, \\\`05_social_media_post_\${targetDate}.txt\\\`), postContent, 'utf8')
        // También guardamos en post_text para compatibilidad local si es necesario
        fs.writeFileSync(path.join(state.SCENES_DIR, \\\`post_text_\${targetDate}.txt\\\`), postContent, 'utf8')
        await bot.sendMessage(CHAT_ID, \\\`✅ Post guardado con IA exitosamente.\\\`)
      } catch (err) {
        log('⚠️', \\\`No se generó el post de redes sociales: \${err.message}\\\`)
        const fallbackPost = \\\`🚀 CodeHistory Daily | Efeméride Tecnológica del Día\\n\\n📅 \${historicalDateStr || targetDate}\\n\\nDescubre la historia tecnológica de hoy en CodeHistory Daily.\\n\\n🌍 Más historias tecnológicas:\\nhttps://code-history-day-web-alpha.vercel.app\\n\\n▶️ youtube.com/@CodeHistoryDaily\\n\\n🎵 tiktok.com/@codehistorydaily\\n\\n📱 facebook.com/CodeHistoryDaily\\n\\n#CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Tecnologia #Historia\\\`
        fs.writeFileSync(path.join(state.SCENES_DIR, \\\`05_social_media_post_\${targetDate}.txt\\\`), fallbackPost, 'utf8')
        fs.writeFileSync(path.join(state.SCENES_DIR, \\\`post_text_\${targetDate}.txt\\\`), fallbackPost, 'utf8')
        await bot.sendMessage(CHAT_ID, \\\`⚠️ Error generando post de redes, usando fallback básico.\\\`)
      }
      
      await bot.sendMessage(CHAT_ID, \\\`📣 Paso 5/5 — Enviando Prompt Maestro para Meta AI...\\\`)\`
);

// We noticed the previous file used post_text_${state.TODAY}.txt on line 142. Let's fix that too.
content = content.replace(
  /const txtPath = path\.join\(state\.SCENES_DIR, `post_text_\$\{state\.TODAY\}\.txt`\)/g,
  \`const txtPath = path.join(state.SCENES_DIR, \\\`05_social_media_post_\${state.TODAY}.txt\\\`)\`
);

fs.writeFileSync(file, content);
console.log("Patch completed");
