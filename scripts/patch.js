const fs = require('fs');
const path = 'scripts/bot/handlers/commands.js';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  "const formatsToCheck = [",
  "const formatsToCheck = [\n      { file: `${TODAY}_shorts_final.mp4`, label: '📱 Vertical 9:16 (Shorts)', platform: 'TikTok/Reels' },"
);
fs.writeFileSync(path, content);
console.log('Patched');
