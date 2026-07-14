const fs = require('fs');
let c = fs.readFileSync('d:/PROYECTOS/code-history-day-web/scripts/bot/handlers/callbacks.js', 'utf8');

c = c.replace(/1080:1920/g, '2160:3840');
c = c.replace(/scale=160:-1/g, 'scale=320:-1');
c = c.replace(/W-w-15:15/g, 'W-w-30:30');

// Insert -crf 16 before -preset veryfast
c = c.replace(/'-c:v', 'libx264', '-preset'/g, "'-c:v', 'libx264', '-crf', '16', '-preset'");

// For the concat step, we need to replace the re-encoding output options with -c copy
c = c.replace(/\.outputOptions\(\['-y', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'\]\)/g, ".outputOptions(['-y', '-c', 'copy'])");

fs.writeFileSync('d:/PROYECTOS/code-history-day-web/scripts/bot/handlers/callbacks.js', c, 'utf8');
console.log('Video quality and 4K updates applied!');
