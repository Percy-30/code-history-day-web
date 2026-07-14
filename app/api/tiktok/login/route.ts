import { NextResponse } from 'next/server';
import crypto from 'crypto';

function base64URLEncode(str: Buffer) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer: string) {
  return crypto.createHash('sha256').update(buffer).digest();
}

export async function GET(request: Request) {
  const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  // Hardcodeamos la URL exacta que está en tu portal de TikTok para descartar cualquier error
  const REDIRECT_URI = `https://code-history-day-web-alpha.vercel.app/api/tiktok/callback`;

  if (!TIKTOK_CLIENT_KEY) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY no está configurado.' }, { status: 500 });
  }

  // 1. Generar state y PKCE verifier/challenge
  const state = Math.random().toString(36).substring(7);
  const code_verifier = crypto.randomBytes(32).toString('hex');
  const code_challenge = base64URLEncode(sha256(code_verifier));

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.append('client_key', TIKTOK_CLIENT_KEY);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'user.info.basic,video.upload,video.list');
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', code_challenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  // Construir la URL exacta del usuario manual pero con la nueva redirect_uri
  const manualUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.upload,video.list&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=tiktok_auth`;

  // Construir URL sin PKCE
  const noPkceUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.upload,video.list&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

  const response = new NextResponse(`
    <html>
      <head>
         <meta charset="utf-8">
         <title>Depuración de TikTok</title>
         <style>
            body { font-family: system-ui, sans-serif; padding: 2rem; background: #000; color: #fff; }
            a { color: #00f2fe; word-break: break-all; }
            .box { background: #111; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #333; }
         </style>
      </head>
      <body>
         <h1>🕵️‍♂️ Panel de Diagnóstico de TikTok</h1>
         <p>TikTok nos está bloqueando por un detalle minúsculo en la URL. Prueba hacer clic en estos 3 enlaces, a ver cuál te deja pasar:</p>
         
         <div class="box">
           <h3>1. URL de mi código (Con seguridad PKCE)</h3>
           <p><a href="${authUrl.toString()}">👉 Probar Enlace 1</a></p>
         </div>

         <div class="box">
           <h3>2. URL sin PKCE</h3>
           <p><a href="${noPkceUrl}">👉 Probar Enlace 2</a></p>
         </div>

         <div class="box">
           <h3>3. Tu URL manual EXACTA</h3>
           <p>Esta es literalmente la URL que me pasaste antes, pero apuntando a Vercel.</p>
           <p><a href="${manualUrl}">👉 Probar Enlace 3</a></p>
         </div>
      </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } });

  // Guardamos la cookie de todas formas por si funcionan los enlaces
  response.cookies.set('tiktok_code_verifier', code_verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10 // 10 minutos
  });

  return response;
}
