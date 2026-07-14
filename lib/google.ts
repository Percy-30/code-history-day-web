import { google } from 'googleapis'
import { Readable } from 'stream'

const getAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Faltan credenciales de Google en las variables de entorno')
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

const escapeDriveQueryValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const addDays = (dateStr: string, days: number) => {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const getOrCreateDriveFolder = async (folderName: string, parentFolderId?: string) => {
  const drive = google.drive({ version: 'v3', auth: getAuthClient() })

  const parentQuery = parentFolderId ? ` and '${parentFolderId}' in parents` : ''
  const existing = await drive.files.list({
    q: `name='${escapeDriveQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQuery}`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  })

  const existingFolder = existing.data.files?.[0]
  if (existingFolder?.id) {
    return existingFolder.id
  }

  const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentFolderId) {
    fileMetadata.parents = [parentFolderId]
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  })
  
  return response.data.id
}

export const createDriveFolder = getOrCreateDriveFolder

export const uploadFileToDrive = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  parentFolderId: string
) => {
  const drive = google.drive({ version: 'v3', auth: getAuthClient() })
  
  // Buscar si el archivo ya existe en esa carpeta
  const existingFiles = await drive.files.list({
    q: `'${parentFolderId}' in parents and name='${escapeDriveQueryValue(fileName)}' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  })

  const stream = Readable.from(buffer)
  const existingFile = existingFiles.data.files?.[0]

  if (existingFile?.id) {
    // Si existe, actualizamos el archivo (esto evita los duplicados '(1)', '(2)', etc.)
    const response = await drive.files.update({
      fileId: existingFile.id,
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
    })
    return response.data
  } else {
    // Si no existe, lo creamos
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentFolderId],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
    })
    return response.data
  }
}

export const searchVideoInFolder = async (folderId: string, expectedFileName?: string) => {
  const drive = google.drive({ version: 'v3', auth: getAuthClient() })

  const nameFilter = expectedFileName
    ? ` and name='${escapeDriveQueryValue(expectedFileName)}'`
    : ''

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='video/mp4' and trashed=false${nameFilter}`,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    pageSize: 1,
  })

  const files = response.data.files
  if (files && files.length > 0) {
    return files[0] // Retorna el primer video encontrado
  }
  return null
}

export const createCalendarEvent = async (
  title: string,
  description: string,
  dateStr: string,
  calendarId: string = 'primary'
) => {
  const calendar = google.calendar({ version: 'v3', auth: getAuthClient() })
  
  // Evento de todo el día
  const event = {
    summary: title,
    description: description,
    start: {
      date: dateStr, // Formato YYYY-MM-DD
    },
    end: {
      date: addDays(dateStr, 1),
    },
  }

  const response = await calendar.events.insert({
    calendarId: calendarId,
    requestBody: event,
  })

  return response.data
}
