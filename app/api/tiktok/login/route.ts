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

  // 2. Redirigir y guardar el code_verifier en una cookie HTTP-only
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('tiktok_code_verifier', code_verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10 // 10 minutos
  });

  return response;
}
