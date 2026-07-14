import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const REDIRECT_URI = `${SITE_URL}/api/auth/tiktok/callback`;

  if (!TIKTOK_CLIENT_KEY) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY no está configurado.' }, { status: 500 });
  }

  // Generar un state simple (CSRF token) - en un caso real se guardaría en cookie/session
  const state = Math.random().toString(36).substring(7);

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.append('client_key', TIKTOK_CLIENT_KEY);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'video.upload,video.publish');
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', state);

  return NextResponse.redirect(authUrl.toString());
}
