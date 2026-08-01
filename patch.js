const fs = require('fs');
const file = 'scripts/bot/handlers/commands.js';
let content = fs.readFileSync(file, 'utf8');

const s1 = `    if (!fs.existsSync(imgPath)) {
      await bot.sendMessage(CHAT_ID,
        \`❌ No encuentro la portada local de hoy.\\n\\n\` +
        \`Archivo esperado:\\n\\\`\${imgPath}\\\`\\n\\n\` +
        \`Primero usa /subir_portada y enviame la imagen como FOTO.\`,
        { parse_mode: 'Markdown' }
      )
      return
    }`;
const r1 = `    if (!fs.existsSync(imgPath)) {
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
    }`;
content = content.replace(s1, r1);

const s2 = `    // Enviar primero la imagen con caption corto (límite 1024 chars en captions de foto)
    await bot.sendPhoto(CHAT_ID, imgPath, {
      caption:
        \`📢 <b>Previsualización del Post Gráfico</b>\\n\\n\` +
        \`🖼️ Portada: <code>\${path.basename(imgPath)}</code>\\n\` +
        \`📦 Tamaño: <b>\${sizeMB} MB</b>\\n\\n\` +
        \`El texto completo del post va en el siguiente mensaje. ⬇️\`,
      parse_mode: 'HTML'
    })`;
const r2 = `    // Enviar primero la imagen con caption corto (límite 1024 chars en captions de foto)
    try {
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
    }`;
content = content.replace(s2, r2);

const s3 = `          await bot.sendMessage(CHAT_ID, \`✅ Paso 2/4 — 4 archivos TXT guardados en \\\`scenes/\${targetDate}/\\\`\`)

          // ── Generar Prompts para Shorts (Luma/Veo 3) ─────────────────────────
          await bot.sendMessage(CHAT_ID, \`🎬 Paso 3/4 — Generando prompts cinematográficos para Shorts con IA...\`)`;
const r3 = `          await bot.sendMessage(CHAT_ID, \`✅ Paso 2/5 — 4 archivos TXT guardados en \\\`scenes/\${targetDate}/\\\`\`)

          // ── Generar Prompts para Shorts (Luma/Veo 3) ─────────────────────────
          await bot.sendMessage(CHAT_ID, \`🎬 Paso 3/5 — Generando prompts cinematográficos para Shorts con IA...\`)`;
content = content.replace(s3, r3);

const s4 = `          }
        }
      }

      await bot.sendMessage(CHAT_ID, \`📣 Paso 4/4 — Enviando Prompt Maestro para Meta AI...\`)`;
const r4 = `          }

          // ── Generar Post para Redes Sociales con Groq AI ─────────────────────────
          await bot.sendMessage(CHAT_ID, \`📝 Paso 4/5 — Redactando post profesional para redes sociales...\`)
          try {
            const postContent = await generateProfessionalPost(
              historicalDateStr || targetDate,
              ephemerisText || 'Efeméride tecnológica del día'
            )
            fs.writeFileSync(path.join(state.SCENES_DIR, \`05_social_media_post_\${targetDate}.txt\`), postContent, 'utf8')
            await bot.sendMessage(CHAT_ID, \`✅ Post guardado en \\\`05_social_media_post_\${targetDate}.txt\\\`\`, { parse_mode: 'Markdown' })
          } catch (err) {
            log('⚠️', \`No se generó el post de redes sociales: \${err.message}\`)
            const fallbackPost = \`🚀 CodeHistory Daily | Efeméride Tecnológica del Día\\n\\n📅 \${historicalDateStr || targetDate}\\n\\nDescubre la historia tecnológica de hoy en CodeHistory Daily.\\n\\n🌍 Más historias tecnológicas:\\nhttps://code-history-day-web-alpha.vercel.app\\n\\n▶️ youtube.com/@CodeHistoryDaily\\n\\n🎵 tiktok.com/@codehistorydaily\\n\\n📱 facebook.com/CodeHistoryDaily\\n\\n#CodeHistoryDaily #HistoriaDelCódigo #ATPDev #Tecnologia #Historia\`
            fs.writeFileSync(path.join(state.SCENES_DIR, \`05_social_media_post_\${targetDate}.txt\`), fallbackPost, 'utf8')
            await bot.sendMessage(CHAT_ID, \`⚠️ Error generando post de redes, usando fallback básico.\`)
          }
        }
      }

      await bot.sendMessage(CHAT_ID, \`📣 Paso 5/5 — Enviando Prompt Maestro para Meta AI...\`)`;
content = content.replace(s4, r4);

fs.writeFileSync(file, content);
console.log('Patch applied successfully!');
