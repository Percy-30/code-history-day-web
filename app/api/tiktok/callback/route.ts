import { NextResponse } from 'next/server';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `TikTok retornó un error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Falta el parámetro de autorización (code).' }, { status: 400 });
  }

  // Leer code_verifier de las cookies (PKCE)
  const cookieStore = cookies();
  const code_verifier = cookieStore.get('tiktok_code_verifier')?.value;

  // No lo hacemos bloqueante si falla, pero TikTok podría rechazarlo si su API lo exige.
  // if (!code_verifier) {
  //   return NextResponse.json({ error: 'Sesión expirada o falta code_verifier.' }, { status: 400 });
  // }

  const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
  const SITE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const REDIRECT_URI = `${SITE_URL}/api/tiktok/callback`;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Variables de entorno incompletas.' }, { status: 500 });
  }

  try {
    // 1. Intercambiar el código por el token de acceso
    const payload: Record<string, string> = {
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    };
    
    if (code_verifier) {
      payload.code_verifier = code_verifier;
    }

    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      }
    });

    const data = tokenResponse.data;

    if (data.error) {
      throw new Error(`Error de TikTok: ${data.error_description || data.error}`);
    }

    const { access_token, refresh_token, expires_in, refresh_expires_in } = data;

    // 2. Guardar en Supabase (platform_settings)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Calcular fechas de expiración
    const token_expires_at = new Date(Date.now() + expires_in * 1000).toISOString();
    const refresh_expires_at = new Date(Date.now() + refresh_expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from('platform_settings')
      .upsert({
        platform: 'tiktok',
        access_token: access_token,
        extra_config: {
          refresh_token: refresh_token,
          token_expires_at: token_expires_at,
          refresh_expires_at: refresh_expires_at
        },
        enabled: true
      }, { onConflict: 'platform' });

    if (dbError) {
      throw new Error(`Error guardando en Supabase: ${dbError.message}`);
    }

    // 3. Mostrar pantalla de éxito
    const response = new NextResponse(`
      <html>
        <head>
          <title>Autenticación Exitosa</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; margin-top: 50px; background-color: #000; color: #fff; }
            .box { background: #111; padding: 30px; border-radius: 12px; display: inline-block; border: 1px solid #333; }
            h1 { color: #00f2fe; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>✅ ¡TikTok Conectado Exitosamente!</h1>
            <p>El bot ya tiene los permisos necesarios y guardó el token en la base de datos.</p>
            <p>Ahora puedes volver a Telegram y el bot usará este token y lo renovará automáticamente.</p>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });

    // Limpiar la cookie del verifier
    response.cookies.delete('tiktok_code_verifier');
    return response;

  } catch (err: any) {
    const msg = err.response?.data?.error_description || err.response?.data?.message || err.message;
    return NextResponse.json({ error: 'Fallo al autenticar con TikTok', detalles: msg, error_obj: err.response?.data }, { status: 500 });
  }
}
