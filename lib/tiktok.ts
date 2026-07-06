/**
 * TikTok Content Posting API v2
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 *
 * Requiere:
 *  - TIKTOK_CLIENT_KEY
 *  - TIKTOK_CLIENT_SECRET
 *  - TIKTOK_ACCESS_TOKEN (token de usuario con scope video.upload)
 */

export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY'

interface TikTokUploadOptions {
  videoBuffer: Buffer
  title: string
  privacy?: TikTokPrivacy
  disableComment?: boolean
  disableDuet?: boolean
  disableStitch?: boolean
}

interface TikTokInitResponse {
  data: {
    publish_id: string
    upload_url: string
  }
  error?: { code: string; message: string }
}

/**
 * Sube un video a TikTok usando la API de Direct Post (v2).
 * Flujo: init → upload → resultado con publish_id
 */
export const uploadVideoToTikTok = async (
  opts: TikTokUploadOptions,
  accessToken: string
): Promise<{ publishId: string }> => {
  const chunkSize = opts.videoBuffer.length

  // 1. Inicializar la subida
  const initRes = await fetch(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: opts.title.substring(0, 150), // TikTok max 150 chars
          privacy_level: opts.privacy ?? 'SELF_ONLY',
          disable_comment: opts.disableComment ?? false,
          disable_duet: opts.disableDuet ?? false,
          disable_stitch: opts.disableStitch ?? false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: chunkSize,
          chunk_size: chunkSize,
          total_chunk_count: 1,
        },
      }),
    }
  )

  const initData: TikTokInitResponse = await initRes.json()
  if (initData.error?.code && initData.error.code !== 'ok') {
    throw new Error(`TikTok init error: ${initData.error.message}`)
  }

  const { publish_id, upload_url } = initData.data

  // 2. Subir el video en un solo chunk
  const uploadRes = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes 0-${chunkSize - 1}/${chunkSize}`,
      'Content-Type': 'video/mp4',
      'Content-Length': String(chunkSize),
    },
    body: opts.videoBuffer,
  })

  if (!uploadRes.ok) {
    throw new Error(`TikTok upload failed with status ${uploadRes.status}`)
  }

  return { publishId: publish_id }
}

/**
 * Verifica el estado de una publicación en TikTok.
 */
export const checkTikTokPublishStatus = async (
  publishId: string,
  accessToken: string
): Promise<{ status: string; publiclyAvailablePostId?: string }> => {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  })

  const data = await res.json()
  return {
    status: data.data?.status ?? 'unknown',
    publiclyAvailablePostId: data.data?.publiclyAvailablePostId,
  }
}
