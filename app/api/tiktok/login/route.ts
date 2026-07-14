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
  const REDIRECT_URI = 'https://code-history-day-web-alpha.vercel.app/api/tiktok/callback';

  if (!TIKTOK_CLIENT_KEY) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY no está configurado.' }, { status: 500 });
  }

  const state = 'tiktok_auth';
  const code_verifier = crypto.randomBytes(32).toString('hex');
  const code_challenge = base64URLEncode(sha256(code_verifier));

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&response_type=code&scope=user.info.basic,video.upload,video.list&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&code_challenge=${code_challenge}&code_challenge_method=S256`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('tiktok_code_verifier', code_verifier, {
    httpOnly: true,
    secure: true,
    path: '/',
    maxAge: 60 * 10
  });

  return response;
}
