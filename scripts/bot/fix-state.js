const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, 'handlers/commands.js'),
  path.join(__dirname, 'handlers/callbacks.js'),
  path.join(__dirname, 'handlers/media.js')
];

const stateVars = [
  'TODAY', 'SCENES_DIR', 'sceneCounter', 'totalScenes', 'receivedScenes', 
  'downloadQueue', 'isDownloading', 'savedAudioScript', 'motorVozActivo', 
  'velocidadVozActiva', 'pendingUploadMode', 'audioUploadCounter', 
  'failedClips', 'cancelRequested'
];

const destructureLineRegex = /let\s+\{\s*TODAY[\s\S]*?\}\s*=\s*state\s*;?/g;
const varRegex = new RegExp(`(?<!state\\.)\\b(${stateVars.join('|')})\\b(?!\\s*:)`, 'g');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove the destructuring line
  content = content.replace(destructureLineRegex, '');
  
  // Replace the variables with state.VAR
  content = content.replace(varRegex, 'state.$1');
  
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Fixed ${file}`);
}
