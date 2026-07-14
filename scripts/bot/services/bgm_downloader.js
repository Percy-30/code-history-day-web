/**
 * Descarga música de Kevin MacLeod (incompetech.com) desde archive.org
 * Licencia: CC BY 3.0 — libre para YouTube, TikTok, Facebook con atribución
 * Atribución requerida en descripción: "Music by Kevin MacLeod (incompetech.com)"
 * Kevin MacLeod está en YouTube Audio Library — NO genera Content ID claims
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const MUSIC_DIR = path.join(__dirname, '..', 'assets', 'audio', 'music')
if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true })

// Pistas de Kevin MacLeod en archive.org — CC BY 3.0, sin Content ID en YouTube
const tracks = [
  {
    tag: 'tecnologico',
    name: 'Cipher',
    url: 'https://archive.org/download/kevin-macleod-incompetech/Cipher.mp3',
    fallback: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher.mp3'
  },
  {
    tag: 'inspiracional',
    name: 'Inspired',
    url: 'https://archive.org/download/kevin-macleod-incompetech/Inspired.mp3',
    fallback: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3'
  },
  {
    tag: 'epico',
    name: 'Epic Action A',
    url: 'https://archive.org/download/kevin-macleod-incompetech/Epic%20Action%20A.mp3',
    fallback: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Epic%20Action%20A.mp3'
  },
  {
    tag: 'dramatico',
    name: 'Darkest Child',
    url: 'https://archive.org/download/kevin-macleod-incompetech/Darkest%20Child.mp3',
    fallback: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Darkest%20Child.mp3'
  },
  {
    tag: 'cientifico',
    name: 'Investigations',
    url: 'https://archive.org/download/kevin-macleod-incompetech/Investigations.mp3',
    fallback: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Investigations.mp3'
  },
  {
    tag: 'futuro',
    name: 'Floating Cities',
    url: 'https://archive.org/download/kevin-macleod-incompetech/Floating%20Cities.mp3',
    fallback: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Floating%20Cities.mp3'
  }
]

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file  = fs.createWriteStream(dest)
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        file.close()
        try { fs.unlinkSync(dest) } catch(_) {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch(_) {}
        return reject(new Error(`HTTP ${res.statusCode} para ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    }).on('error', reject)
  })
}

;(async () => {
  console.log('\n🎵 Descargando música de Kevin MacLeod (CC BY 3.0 — segura para YouTube)\n')
  console.log('Fuente: incompetech.com | archive.org')
  console.log('Atribución requerida: "Music by Kevin MacLeod (incompetech.com) Licensed under CC BY 3.0"\n')

  let ok = 0, fail = 0

  for (const t of tracks) {
    const dest = path.join(MUSIC_DIR, t.tag + '.mp3')

    if (fs.existsSync(dest) && fs.statSync(dest).size > 50000) {
      console.log(`⏭️  ${t.tag}.mp3 ya existe — saltando`)
      ok++; continue
    }

    console.log(`⬇️  [${t.tag}] "${t.name}"...`)
    let downloaded = false

    // Intentar URL principal
    try {
      await downloadFile(t.url, dest)
      const kb = Math.round(fs.statSync(dest).size / 1024)
      if (kb > 50) {
        console.log(`   ✅ ${t.tag}.mp3 (${kb} KB)`)
        downloaded = true; ok++
      } else {
        throw new Error('Archivo muy pequeño: ' + kb + 'KB')
      }
    } catch(e) {
      console.log(`   ⚠️  URL principal falló: ${e.message}`)
    }

    // Intentar fallback
    if (!downloaded && t.fallback) {
      try {
        await downloadFile(t.fallback, dest)
        const kb = Math.round(fs.statSync(dest).size / 1024)
        if (kb > 50) {
          console.log(`   ✅ ${t.tag}.mp3 via fallback (${kb} KB)`)
          downloaded = true; ok++
        } else {
          throw new Error('Archivo muy pequeño')
        }
      } catch(e2) {
        console.log(`   ❌ Fallback también falló: ${e2.message}`)
        try { fs.unlinkSync(dest) } catch(_) {}
        fail++
      }
    }
  }

  console.log(`\n✅ ${ok} pistas descargadas`)
  if (fail > 0) {
    console.log(`❌ ${fail} fallaron — las puedes subir manualmente con /subir_musica`)
  }
  console.log(`\n📁 Guardadas en: ${MUSIC_DIR}`)
  console.log('\n⚠️  RECUERDA agregar en la descripción de tus videos:')
  console.log('"Music by Kevin MacLeod (incompetech.com) Licensed under CC BY 3.0 https://creativecommons.org/licenses/by/3.0/"')
})()
