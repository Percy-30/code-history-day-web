/**
 * bot/services/drive.js — Operaciones con Google Drive
 */
const fs   = require('fs')
const path = require('path')
const { log } = require('../safe-action')

/** Crear o encontrar la carpeta del día en Drive */
async function getOrCreateDateFolder(drive, dateStr) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) return null
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name='${dateStr}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)'
  })
  if (existing.data.files && existing.data.files.length > 0) return existing.data.files[0].id
  const folderMetadata = {
    name: dateStr,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [folderId]
  }
  const folder = await drive.files.create({ resource: folderMetadata, fields: 'id' })
  return folder.data.id
}

/** Subir archivo a Google Drive */
async function uploadToGoogleDrive(filePath, filename, mimeType = 'video/mp4', dateStr) {
  const { google } = require('googleapis')
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth: oauth2 })
  
  const folderId = await getOrCreateDateFolder(drive, dateStr)
  const fileMetadata = { name: filename }
  if (folderId) fileMetadata.parents = [folderId]
  
  const media = { mimeType, body: fs.createReadStream(filePath) }
  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, webViewLink'
  })
  return res.data.webViewLink || res.data.id
}

/** Crear cliente autenticado de Google Drive */
function createDriveClient() {
  const { google } = require('googleapis')
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return {
    drive: google.drive({ version: 'v3', auth: oauth2 }),
    google,
    oauth2
  }
}

module.exports = { getOrCreateDateFolder, uploadToGoogleDrive, createDriveClient }
