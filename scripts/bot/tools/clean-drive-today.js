const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

const getAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

const drive = google.drive({ version: 'v3', auth: getAuthClient() });

async function cleanTodayFolder() {
  const date = '2026-07-10';
  const folderName = date;

  console.log(`Buscando carpeta ${folderName} en Drive...`);
  const existing = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });

  const folder = existing.data.files?.[0];
  if (!folder) {
    console.log('Carpeta no encontrada.');
    return;
  }

  console.log(`Carpeta encontrada con ID: ${folder.id}. Buscando archivos dentro...`);
  
  const files = await drive.files.list({
    q: `'${folder.id}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const fileList = files.data.files;
  console.log(`Encontrados ${fileList.length} archivos para eliminar...`);

  for (const file of fileList) {
    console.log(`Eliminando: ${file.name}`);
    await drive.files.delete({ fileId: file.id });
  }

  console.log('¡Limpieza completada! El Drive está vacío para hoy.');
}

cleanTodayFolder().catch(console.error);
