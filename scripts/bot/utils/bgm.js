/**
 * bot/utils/bgm.js — Selección inteligente de música de fondo
 */
const path = require('path')
const fs   = require('fs')

/** Seleccionar categoría de BGM basada en el contexto de la narración */
function selectBGMByContext(narrationText) {
  const txt = (narrationText || '').toLowerCase()
  const categories = [
    { tag: 'epico',         keywords: ['guerra', 'batalla', 'conquista', 'revolución', 'cohete', 'nasa', 'apollo', 'misil', 'bomba', 'nuclear', 'ataque'] },
    { tag: 'inspiracional', keywords: ['inventor', 'genio', 'visionario', 'soñaba', 'soñó', 'legado', 'nació', 'creador', 'fundador', 'pionero', 'primera vez'] },
    { tag: 'tecnologico',   keywords: ['computadora', 'ordenador', 'software', 'hardware', 'internet', 'código', 'algoritmo', 'programación', 'chip', 'transistor', 'procesador', 'cpu', 'inteligencia artificial', 'byte'] },
    { tag: 'dramatico',     keywords: ['murió', 'muerte', 'fracaso', 'fracasó', 'crisis', 'accidente', 'colapso', 'falló', 'tragedia', 'perdió', 'ruina'] },
    { tag: 'cientifico',    keywords: ['descubrimiento', 'descubrió', 'física', 'química', 'biología', 'laboratorio', 'experimento', 'teoría', 'fórmula', 'científ', 'nobel'] },
    { tag: 'futuro',        keywords: ['futuro', 'inteligencia artificial', 'robot', 'automatización', 'metaverso', 'blockchain', 'cuántico', 'nanotecnolog', '5g', '6g'] }
  ]
  let best = { tag: 'inspiracional', count: 0 }
  for (const cat of categories) {
    const count = cat.keywords.filter(kw => txt.includes(kw)).length
    if (count > best.count) best = { tag: cat.tag, count }
  }
  return best.tag
}

/** Buscar archivo de música por tag en la carpeta de assets */
function findBGMByTag(tag) {
  const musicDir = path.join(__dirname, '..', '..', '..', 'assets', 'audio', 'music')
  if (!fs.existsSync(musicDir)) return null
  const directFiles = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') && f.toLowerCase().includes(tag.toLowerCase()))
  if (directFiles.length > 0) return path.join(musicDir, directFiles[Math.floor(Math.random() * directFiles.length)])
  const subDir = path.join(musicDir, tag)
  if (fs.existsSync(subDir)) {
    const subFiles = fs.readdirSync(subDir).filter(f => f.endsWith('.mp3'))
    if (subFiles.length > 0) return path.join(subDir, subFiles[Math.floor(Math.random() * subFiles.length)])
  }
  const allMp3 = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'))
  if (allMp3.length > 0) return path.join(musicDir, allMp3[Math.floor(Math.random() * allMp3.length)])
  return null
}

module.exports = { selectBGMByContext, findBGMByTag }
