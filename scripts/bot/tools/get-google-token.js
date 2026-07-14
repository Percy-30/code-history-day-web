const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const dotenv = require('dotenv');

// Cargar variables de entorno del archivo .env.local
dotenv.config({ path: '.env.local' });

// Obtener credenciales
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = 'http://localhost:3000/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('\n❌ ERROR: Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en tu archivo .env.local\n');
  console.log('Por favor, crea un proyecto en Google Cloud Console, genera credenciales OAuth (Web Application)');
  console.log('y ponlas en tu archivo .env.local antes de correr este script.');
  process.exit(1);
}

// Configurar el cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// Definir los permisos (scopes) que necesitamos
const scopes = [
  'https://www.googleapis.com/auth/drive',              // Acceso completo a Drive
  'https://www.googleapis.com/auth/drive.file',         // Crear carpetas y subir archivos
  'https://www.googleapis.com/auth/calendar',           // Acceso completo a Calendar
  'https://www.googleapis.com/auth/calendar.events',    // Crear eventos
  'https://www.googleapis.com/auth/youtube.upload',     // Subir videos a YouTube
  'https://www.googleapis.com/auth/youtube',            // Gestión de YouTube
];

// Generar la URL de autorización
const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Crucial: Esto pide el refresh_token
  scope: scopes,
  prompt: 'consent' // Fuerza a mostrar la pantalla de consentimiento para asegurar el refresh_token
});

console.log('\n======================================================');
console.log('🔑 SCRIPT DE OBTENCIÓN DE GOOGLE REFRESH TOKEN');
console.log('======================================================\n');
console.log('Por favor, abre la siguiente URL en tu navegador:\n');
console.log(authorizationUrl);
console.log('\n======================================================');
console.log('Esperando respuesta... (El servidor local está escuchando en el puerto 3000)');

// Crear un servidor local para escuchar el callback de Google
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/oauth2callback')) {
      const q = url.parse(req.url, true).query;
      
      if (q.error) {
        console.error('Error reportado por Google:', q.error);
        res.end('Error en la autorización. Revisa la consola.');
        server.close();
        return;
      }

      // Obtener el código de autorización
      const code = q.code;
      
      // Intercambiar el código por los tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      oauth2Client.setCredentials(tokens);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      
      if (tokens.refresh_token) {
        res.end(`
          <h1>✅ Autorización exitosa</h1>
          <p>Puedes cerrar esta ventana.</p>
          <p>Revisa tu terminal para ver el REFRESH_TOKEN.</p>
        `);
        console.log('\n✅ ¡ÉXITO! Se obtuvo el refresh_token.\n');
        console.log('Copia el siguiente valor y pégalo en tu .env.local y en Vercel:\n');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      } else {
        res.end(`
          <h1>⚠️ Atención</h1>
          <p>No se recibió un refresh_token. Esto pasa si ya autorizaste la app antes.</p>
          <p>Ve a tu cuenta de Google > Seguridad > Apps de terceros y elimina el acceso, luego vuelve a intentar.</p>
        `);
        console.log('\n⚠️ No se recibió un refresh_token.');
        console.log('Asegúrate de haber revocado accesos anteriores o de que apareció la pantalla de consentimiento.');
      }
      
      server.close();
      process.exit(0);
    }
  } catch (error) {
    console.error('Error durante el proceso:', error);
    res.end('Ocurrió un error. Revisa la consola.');
    server.close();
    process.exit(1);
  }
}).listen(3000);
