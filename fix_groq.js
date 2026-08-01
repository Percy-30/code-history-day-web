const fs = require('fs');
let code = fs.readFileSync('scripts/bot/services/groq.js', 'utf8');

// Replace all instances of \\\` with just \` (backtick)
code = code.replace(/\\`/g, '`');

fs.writeFileSync('scripts/bot/services/groq.js', code, 'utf8');
console.log('Fixed backticks in groq.js');
