#!/usr/bin/env node
/**
 * Genera un nuevo GOOGLE_REFRESH_TOKEN con permisos de Drive + YouTube.
 * Levanta un servidor local temporal para capturar el código de autorización.
 */
require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const http = require('http');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Falta GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en .env.local');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

// Servidor temporal para capturar el código
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const code = urlObj.searchParams.get('code');
  const error = urlObj.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Error: ${error}</h1>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ No se recibió código</h1>');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    
    console.log('\n✅ ¡Token generado exitosamente!\n');
    console.log('════════════════════════════════════════════════════════');
    console.log('Tu nuevo GOOGLE_REFRESH_TOKEN es:\n');
    console.log(tokens.refresh_token);
    console.log('\n════════════════════════════════════════════════════════');
    console.log('\n📋 Copia este valor y reemplázalo en tu .env.local');
    console.log('   en la línea: GOOGLE_REFRESH_TOKEN=...\n');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:system-ui;text-align:center;padding:50px;background:#000;color:#fff">
        <h1 style="color:#00f2fe">✅ ¡Token Generado!</h1>
        <p>Revisa tu terminal para copiar el nuevo GOOGLE_REFRESH_TOKEN.</p>
        <p>Ya puedes cerrar esta ventana.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Error: ${err.message}</h1>`);
  }

  setTimeout(() => { server.close(); process.exit(0); }, 2000);
});

server.listen(PORT, () => {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  🔑 Generador de Google Refresh Token (Drive + YouTube)');
  console.log('════════════════════════════════════════════════════════\n');
  console.log('Abre esta URL en tu navegador:\n');
  console.log(url);
  console.log('\nEsperando autorización...\n');
});
