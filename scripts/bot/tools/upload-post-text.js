require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { google } = require('googleapis')
const stream = require('stream')

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: oauth2 })

const FOLDER_2026_07_08 = '1i1qdC-0xrsFRqOeVqkqhkKpJGoSCibVk'

const postText = `🖥️ Bienvenido a CodeHistory Daily

Cada línea de código que usamos hoy tiene una historia detrás. Cada lenguaje, cada máquina, cada 'eureka' de un programador en un garaje o un laboratorio — construyó el mundo digital en el que vivimos.

CodeHistory Daily nace para contar esa historia, un día a la vez. Todos los días vas a encontrar aquí una efeméride real de la programación y la tecnología: el nacimiento de un lenguaje, el lanzamiento de una máquina que cambió todo, la decisión de una empresa que redefinió una industria entera.

📅 Hoy, 8 de mayo de 2004: Arrestan a Sven Jaschan, el joven de 18 años creador del infame virus Sasser, que paralizó millones de computadoras, hospitales y aerolíneas en todo el mundo.

Este es solo el primer capítulo. Cada día habrá uno nuevo.

Sígueme si te gusta la tecnología, la programación, o simplemente esas curiosidades que nadie te contó en la escuela.

🔗 Explora el proyecto completo: code-history-day-web-alpha.vercel.app

#CodeHistoryDaily #HistoriaDelCódigo #ATPDev #EfeméridesTech #Ciberseguridad #Sasser #SvenJaschan #Malware`

const bufferStream = new stream.PassThrough()
bufferStream.end(Buffer.from(postText, 'utf8'))

drive.files.create({
  requestBody: {
    name: '05_social_media_post_2026-07-08.txt',
    parents: [FOLDER_2026_07_08],
    mimeType: 'text/plain'
  },
  media: {
    mimeType: 'text/plain',
    body: bufferStream
  }
}).then(res => {
  console.log('Archivo subido con ID:', res.data.id)
}).catch(err => {
  console.error('Error subiendo archivo:', err.message)
})
