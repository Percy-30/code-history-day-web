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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * Obtiene el token de TikTok desde Supabase
 */
async function getTikTokToken() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase no está configurado en el bot.');
  const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/platform_settings?platform=eq.tiktok&select=access_token,extra_config`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!data || data.length === 0) throw new Error('No se encontró configuración de TikTok en Supabase. Asegúrate de hacer el login primero.');
  return data[0];
}

/**
 * Renueva el token de TikTok usando el refresh_token
 */
async function refreshTikTokToken(refreshToken) {
  const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
  if (!CLIENT_KEY || !CLIENT_SECRET) throw new Error('Faltan TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET en .env.local');

  const res = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  if (res.data.error) throw new Error(`TikTok refresh falló: ${res.data.error_description || res.data.error}`);

  const newAccessToken = res.data.access_token;
  const newRefreshToken = res.data.refresh_token;

  // Actualizar en Supabase
  await axios.patch(`${SUPABASE_URL}/rest/v1/platform_settings?platform=eq.tiktok`, {
    access_token: newAccessToken,
    extra_config: {
      refresh_token: newRefreshToken,
      token_expires_at: new Date(Date.now() + res.data.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(Date.now() + res.data.refresh_expires_in * 1000).toISOString()
    }
  }, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }
  });

  return newAccessToken;
}

/**
 * Sube un video a TikTok como BORRADOR (Draft).
 * Usa chunks de 128MB máximo, máximo 5 chunks totales.
 */
async function publishToTikTok(videoPath, title) {
  let tokenData = await getTikTokToken();
  let accessToken = tokenData.access_token;
  
  if (!accessToken) throw new Error('No hay access_token guardado en Supabase para TikTok.');

  const videoSize = fs.statSync(videoPath).size
  const chunkSize = 30 * 1024 * 1024; // 30 MB por chunk
  const totalChunks = Math.max(1, Math.floor(videoSize / chunkSize));

  // Función envoltorio para intentar llamar a la API y refrescar si falla
  async function callInitApi(token) {
    const res = await axios.post(
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
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true // No lanzar excepcion automatica por HTTP status
      }
    )
    return res;
  }

  let initRes = await callInitApi(accessToken);

  // Detectar si el token expiró (TikTok devuelve 401 o un error json con access_token_invalid)
  const isExpired = initRes.status === 401 || (initRes.data && initRes.data.error && (initRes.data.error.code === 'access_token_invalid' || initRes.data.error.code === 'unauthorized'));

  if (isExpired) {
    console.log('🔄 Token de TikTok expirado. Intentando renovarlo...');
    if (!tokenData.extra_config || !tokenData.extra_config.refresh_token) {
      throw new Error('Token de TikTok expirado y no hay refresh_token en Supabase para renovarlo. Debes iniciar sesión nuevamente.');
    }
    accessToken = await refreshTikTokToken(tokenData.extra_config.refresh_token);
    console.log('✅ Token de TikTok renovado exitosamente.');
    
    // Reintentar
    initRes = await callInitApi(accessToken);
  }

  if (initRes.status !== 200 || !initRes.data || !initRes.data.data) {
    throw new Error('TikTok init falló: ' + JSON.stringify(initRes.data));
  }

  const { upload_url, publish_id } = initRes.data.data

  // 2. Upload en chunks
  const videoBuffer = fs.readFileSync(videoPath)
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
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
