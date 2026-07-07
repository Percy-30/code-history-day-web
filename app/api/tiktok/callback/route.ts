import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    return NextResponse.redirect(
      new URL(`/oauth2callback?error=${error}&desc=${errorDescription}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/oauth2callback?error=no_code', request.url))
  }

  // Intercambiar código por access token
  const clientKey = process.env.TIKTOK_CLIENT_KEY!
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!
  const redirectUri = `${process.env.NEXTAUTH_URL}/oauth2callback`

  try {
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
      return NextResponse.redirect(
        new URL(`/oauth2callback?error=${data.error}&desc=${data.error_description}`, request.url)
      )
    }

    // Redirigir a la página de callback con el token
    const params = new URLSearchParams({
      access_token: data.access_token || '',
      open_id: data.open_id || '',
      expires_in: String(data.expires_in || ''),
    })

    return NextResponse.redirect(new URL(`/oauth2callback?${params.toString()}`, request.url))
  } catch (err) {
    return NextResponse.redirect(
      new URL('/oauth2callback?error=fetch_failed', request.url)
    )
  }
}
