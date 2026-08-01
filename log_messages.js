const fs = require('fs');
let c = fs.readFileSync('scripts/telegram-meta-ai-bot.js', 'utf8');
c = c.replace('registerCommands(bot);', 'bot.on("message", (msg) => console.log("RECIBIDO:", msg.text));\n  registerCommands(bot);');
fs.writeFileSync('scripts/telegram-meta-ai-bot.js', c);
console.log('Patched');
