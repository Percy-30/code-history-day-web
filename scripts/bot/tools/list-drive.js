require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { google } = require('googleapis')

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: oauth2 })

const FOLDER_2026_07_08 = '1i1qdC-0xrsFRqOeVqkqhkKpJGoSCibVk'

drive.files.list({
  q: `'${FOLDER_2026_07_08}' in parents`,
  fields: 'files(id,name,mimeType)',
  pageSize: 50
}).then(r => {
  console.log('Archivos en carpeta 2026-07-08:')
  r.data.files.forEach(f => console.log(` - ${f.name}  [${f.mimeType}]  id:${f.id}`))
}).catch(e => console.log('ERROR', e.message))
