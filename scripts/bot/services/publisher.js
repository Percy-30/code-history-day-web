const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })

const FB_PAGE_ID = process.env.FACEBOOK_PAGE_ID
const FB_TOKEN   = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
const TIKTOK_TOKEN = process.env.TIKTOK_ACCESS_TOKEN

/**
 * Publica una imagen con texto en Facebook Page.
 */
async function publishImageToFacebook(imagePath, message) {
  if (!FB_PAGE_ID || !FB_TOKEN) throw new Error('Credenciales de Facebook no configuradas')
  const form = new FormData()
  form.append('message', message)
  form.append('source', fs.createReadStream(imagePath))
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/photos?access_token=${FB_TOKEN}`,
    form,
    { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity }
  )
  return res.data.id
}

/**
 * Publica un Reel/Video en Facebook Page
 * Flujo: START → rupload binario (usando video_id como session) → FINISH
 */
async function publishReelToFacebook(videoPath, description) {
  if (!FB_PAGE_ID || !FB_TOKEN) throw new Error('Credenciales de Facebook no configuradas')

  const videoSize = fs.statSync(videoPath).size

  // 1. START
  const startRes = await axios.post(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/video_reels`,
    { upload_phase: 'START', file_size: videoSize },
    { headers: { Authorization: `Bearer ${FB_TOKEN}`, 'Content-Type': 'application/json' } }
  )

  const { video_id, upload_url } = startRes.data
  if (!video_id || !upload_url) {
    throw new Error('Facebook no devolvió video_id o upload_url: ' + JSON.stringify(startRes.data))
  }

  // 2. TRANSFER — POST binario al upload_url de rupload
  const videoBuffer = fs.readFileSync(videoPath)
  await axios.post(upload_url, videoBuffer, {
    headers: {
      Authorization: `OAuth ${FB_TOKEN}`,
      offset: '0',
      file_size: String(videoSize),
      'Content-Type': 'application/octet-stream',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 600000,
  })

  // 3. FINISH — usar video_id como upload_session_id
  const finishRes = await axios.post(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/video_reels`,
    {
      upload_phase: 'FINISH',
      video_id: video_id,
      video_state: 'PUBLISHED',
      description,
      title: description.split('\n')[0].substring(0, 100),
    },
    { headers: { Authorization: `Bearer ${FB_TOKEN}`, 'Content-Type': 'application/json' } }
  )

  if (finishRes.data.success === false) {
    throw new Error('FINISH falló: ' + JSON.stringify(finishRes.data))
  }

  return video_id
}

/**
 * Sube un video a TikTok como BORRADOR (Draft).
 * Usa chunks de 128MB máximo, máximo 5 chunks totales.
 */
async function publishToTikTok(videoPath, title) {
  if (!TIKTOK_TOKEN) throw new Error('Token de TikTok no configurado')

  const videoSize = fs.statSync(videoPath).size

  // TikTok API exige que chunk_size sea entre 5MB y 64MB, y usar Math.floor para el conteo
  const chunkSize = 30 * 1024 * 1024; // 30 MB por chunk
  const totalChunks = Math.max(1, Math.floor(videoSize / chunkSize));

  // 1. Init
  const initRes = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
    {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${TIKTOK_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!initRes.data.data) {
    throw new Error('TikTok init falló: ' + JSON.stringify(initRes.data))
  }

  const { upload_url, publish_id } = initRes.data.data

  // 2. Upload en chunks
  const videoBuffer = fs.readFileSync(videoPath)
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
    // El último chunk se lleva el resto de los bytes del archivo
    const end = (i === totalChunks - 1) ? videoSize - 1 : start + chunkSize - 1
    const chunk = videoBuffer.slice(start, end + 1)
    await axios.put(upload_url, chunk, {
      headers: {
        'Content-Range': `bytes ${start}-${end}/${videoSize}`,
        'Content-Length': chunk.length,
        'Content-Type': 'video/mp4'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 600000
    })
  }

  return publish_id + ' (borrador en TikTok — ábrelo y publícalo)'
}

module.exports = {
  publishImageToFacebook,
  publishReelToFacebook,
  publishToTikTok
}
