const fs = require('fs')
let c = fs.readFileSync('scripts/telegram-meta-ai-bot.js', 'utf8')

// The limpiar line appears twice in welcome blocks at chars ~8984 and ~116103
// Use a unique surrounding context to find and replace each one

// Welcome block 1 (in /start command) — ends with backtick + comma
const OLD1 = 'disco\\n`,'
const NEW1 = 'disco\\n` +\n      `\uD83D\uDED1 */parar* \u2014 Cancelar cualquier proceso en curso`,'

// Welcome block 2 (startup message) — ends with backtick + CRLF + { parse_mode
const OLD2 = 'disco\\n`,\r\n  { parse_mode:'
const NEW2 = 'disco\\n` +\n  `\uD83D\uDED1 */parar* \u2014 Cancelar cualquier proceso en curso`,\r\n  { parse_mode:'

let nc = c
if (nc.includes(OLD1)) { nc = nc.replace(OLD1, NEW1); console.log('Block 1 updated') }
else console.error('Block 1 NOT found')

if (nc.includes(OLD2)) { nc = nc.replace(OLD2, NEW2); console.log('Block 2 updated') }
else console.error('Block 2 NOT found')

fs.writeFileSync('scripts/telegram-meta-ai-bot.js', nc, 'utf8')
console.log('Done. Size:', nc.length)
