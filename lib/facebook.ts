/**
 * Facebook Graph API — Publicación de Reels en una Página
 * Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 *
 * Requiere:
 *  - FACEBOOK_PAGE_ID
 *  - FACEBOOK_PAGE_ACCESS_TOKEN (con permisos: pages_manage_posts, pages_read_engagement)
 */

export type FacebookPrivacy = 'EVERYONE' | 'FRIENDS' | 'ONLY_ME'

interface FacebookUploadOptions {
  videoBuffer: Buffer
  description: string
  privacy?: FacebookPrivacy
  pageId: string
  accessToken: string
}

/**
 * Sube un video como Reel a una Página de Facebook.
 * Flujo: start → upload → finish
 */
export const uploadReelToFacebook = async (
  opts: FacebookUploadOptions
): Promise<{ videoId: string; postUrl: string }> => {
  const videoSize = opts.videoBuffer.length

  // 1. Iniciar sesión de subida (Chunked Upload)
  const startRes = await fetch(
    `https://graph.facebook.com/v19.0/${opts.pageId}/video_reels`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upload_phase: 'start',
        file_size: videoSize,
      }),
    }
  )

  const startData = await startRes.json()
  if (!startData.upload_session_id || !startData.video_id) {
    throw new Error(`Facebook start upload error: ${JSON.stringify(startData)}`)
  }

  const { upload_session_id, video_id, start_offset, end_offset } = startData

  // 2. Subir el chunk de video
  const formData = new FormData()
  formData.append('upload_phase', 'transfer')
  formData.append('upload_session_id', upload_session_id)
  formData.append('start_offset', start_offset)
  formData.append(
    'video_file_chunk',
    new Blob([opts.videoBuffer.slice(Number(start_offset), Number(end_offset) + 1)], {
      type: 'video/mp4',
    })
  )

  const uploadRes = await fetch(
    `https://graph.facebook.com/v19.0/${opts.pageId}/video_reels`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      body: formData,
    }
  )

  const uploadData = await uploadRes.json()
  if (!uploadData.success) {
    throw new Error(`Facebook upload error: ${JSON.stringify(uploadData)}`)
  }

  // 3. Finalizar y publicar
  const finishRes = await fetch(
    `https://graph.facebook.com/v19.0/${opts.pageId}/video_reels`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upload_phase: 'finish',
        upload_session_id,
        video_state: 'PUBLISHED',
        description: opts.description,
        privacy: { allow: opts.privacy ?? 'ONLY_ME' },
      }),
    }
  )

  const finishData = await finishRes.json()
  if (!finishData.success) {
    throw new Error(`Facebook finish error: ${JSON.stringify(finishData)}`)
  }

  return {
    videoId: video_id,
    postUrl: `https://www.facebook.com/video/${video_id}`,
  }
}
