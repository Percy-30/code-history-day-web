import { google } from 'googleapis'
import { Readable } from 'stream'

/**
 * Descarga un archivo de Google Drive como buffer/stream.
 */
export const downloadFileFromDrive = async (fileId: string): Promise<Buffer> => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(response.data as ArrayBuffer)
}

export type YouTubePrivacy = 'public' | 'private' | 'unlisted'

interface YouTubeUploadOptions {
  title: string
  description: string
  tags?: string[]
  privacy?: YouTubePrivacy
  videoBuffer: Buffer
  mimeType?: string
}

/**
 * Sube un video a YouTube con las opciones dadas.
 * Usa el refresh token de Google del .env (mismo OAuth que Drive/Calendar).
 */
export const uploadVideoToYouTube = async (
  opts: YouTubeUploadOptions
): Promise<{ videoId: string; videoUrl: string }> => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

  const videoStream = Readable.from(opts.videoBuffer)

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: opts.title,
        description: opts.description,
        tags: opts.tags ?? ['CodeHistoryDaily', 'Shorts', 'Programación', 'Historia', 'Tech'],
        categoryId: '27', // Education
        defaultLanguage: 'es',
      },
      status: {
        privacyStatus: opts.privacy ?? 'private',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: opts.mimeType ?? 'video/mp4',
      body: videoStream,
    },
  })

  const videoId = response.data.id!
  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }
}
