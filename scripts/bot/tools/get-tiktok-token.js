const http = require('http')
const url = require('url')
const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })

const clientKey = process.env.TIKTOK_CLIENT_KEY
const clientSecret = process.env.TIKTOK_CLIENT_SECRET
const redirectUri = 'http://localhost:3000/oauth2callback'

if (!clientKey || !clientSecret) {
  console.error('\n❌ ERROR: Faltan TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET en .env.local')
  process.exit(1)
}

// 1. Generar URL de Autorización (Login Kit)
// NOTA: TikTok prefiere CSRF state, pero para uso local es suficiente un string estático
const state = 'tiktok_auth_state'
const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&response_type=code&scope=user.info.basic,video.upload,video.list&redirect_uri=${encodeURIComponent(
  redirectUri
)}&state=${state}`

console.log('\n======================================================')
console.log('🎵 SCRIPT DE OBTENCIÓN DE TIKTOK ACCESS TOKEN')
console.log('======================================================\n')
console.log('Por favor, abre la siguiente URL en tu navegador (asegúrate de estar logueado en tu cuenta CodeHistoryDaily):\n')
console.log(authUrl)
console.log('\n======================================================')
console.log('Esperando respuesta en el puerto 3000...')

// 2. Servidor local para recibir el 'code'
const server = http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/oauth2callback')) {
        const q = url.parse(req.url, true).query

        if (q.error) {
          console.error('❌ TikTok Error:', q.error, q.error_description)
          res.end('Error de autorizacion. Revisa consola.')
          server.close()
          return
        }

        const code = q.code

        if (!code) {
          res.end('No code returned from TikTok.')
          server.close()
          return
        }

        console.log('\n✅ Código obtenido, intercambiando por Access Token...')

        // 3. Intercambiar el código por un Access Token
        // TikTok requiere POST url-encoded para obtener token (a diferencia de Google)
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache',
          },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        })

        const data = await tokenRes.json()

        if (data.error) {
          console.error('❌ Error pidiendo token:', data.error_description || data)
          res.end('Error al intercambiar el token. Revisa consola.')
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <h1>✅ Autorización exitosa</h1>
            <p>Puedes cerrar esta ventana y regresar a tu terminal.</p>
          `)

          console.log('\n🎉 ¡ÉXITO! Se obtuvo el Access Token de TikTok.\n')
          console.log('Copia el siguiente valor y pégalo en tu panel de Studio (Settings > TikTok):\n')
          console.log(`TIKTOK_ACCESS_TOKEN=${data.access_token}\n`)
          
          if (data.refresh_token) {
             console.log(`TIKTOK_REFRESH_TOKEN=${data.refresh_token} (Opcional por ahora)\n`)
          }
        }

        server.close()
        process.exit(0)
      }
    } catch (error) {
      console.error('Error procesando peticion:', error)
      res.end('Error.')
      server.close()
      process.exit(1)
    }
  })
  .listen(3000)
