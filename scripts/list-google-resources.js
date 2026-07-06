/**
 * Script para listar tus carpetas de Google Drive y calendarios.
 * Ejecutar: node scripts/list-google-resources.js
 * 
 * Copia el ID de la carpeta donde guardarás los videos y el ID de tu calendario
 * y pégalos en tu .env.local como GOOGLE_DRIVE_FOLDER_ID y GOOGLE_CALENDAR_ID
 */

const { google } = require('googleapis')
const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

async function main() {
  console.log('\n======================================================')
  console.log('📂 LISTANDO RECURSOS DE GOOGLE')
  console.log('======================================================\n')

  // ─── Carpetas de Google Drive ────────────────────────────────
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 20,
      spaces: 'drive',
    })

    const folders = res.data.files || []
    if (folders.length === 0) {
      console.log('📁 No se encontraron carpetas en tu Drive.')
      console.log('   Ve a drive.google.com, crea una carpeta (ej: "Code History Daily")')
      console.log('   y vuelve a ejecutar este script.')
    } else {
      console.log('📁 CARPETAS EN TU GOOGLE DRIVE:')
      console.log('─────────────────────────────────────────────')
      folders.forEach(f => {
        console.log(`   Nombre: ${f.name}`)
        console.log(`   ID:     ${f.id}`)
        console.log('   ─')
      })
      console.log('\n👉 Copia el ID de tu carpeta principal y ponlo en .env.local:')
      console.log('   GOOGLE_DRIVE_FOLDER_ID=<ID>')
    }
  } catch (err) {
    console.error('❌ Error accediendo a Drive:', err.message)
  }

  console.log('')

  // ─── Calendarios ─────────────────────────────────────────────
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const res = await calendar.calendarList.list()

    const cals = res.data.items || []
    console.log('📅 TUS CALENDARIOS DE GOOGLE:')
    console.log('─────────────────────────────────────────────')
    cals.forEach(c => {
      console.log(`   Nombre: ${c.summary}`)
      console.log(`   ID:     ${c.id}`)
      console.log('   ─')
    })
    console.log('\n👉 Para el calendario principal es "primary". Cópialo en .env.local:')
    console.log('   GOOGLE_CALENDAR_ID=primary')
    console.log('   (o el ID específico del calendario que quieras usar)\n')
  } catch (err) {
    console.error('❌ Error accediendo a Calendar:', err.message)
  }
}

main().catch(console.error)
