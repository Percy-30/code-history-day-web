import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const adminEmail = process.env.ADMIN_EMAIL
        // ADMIN_PASSWORD_HASH: bcrypt hash (producción, Vercel)
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH
        // ADMIN_PASSWORD: texto plano (solo desarrollo local)
        const adminPasswordPlain = process.env.ADMIN_PASSWORD

        if (!adminEmail) {
          console.error('[Auth] ADMIN_EMAIL no configurado')
          return null
        }

        if (credentials.email !== adminEmail) return null

        let isValid = false

        // Caso 1: hay hash bcrypt válido (empieza con $2a o $2b)
        if (adminPasswordHash && /^\$2[ab]\$\d+\$/.test(adminPasswordHash)) {
          isValid = await bcrypt.compare(credentials.password, adminPasswordHash)
        }
        // Caso 2: contraseña en texto plano (dev local, NUNCA en producción)
        else if (adminPasswordPlain) {
          isValid = credentials.password === adminPasswordPlain
          if (!process.env.NEXTAUTH_URL?.includes('localhost')) {
            console.warn('[Auth] ADVERTENCIA: usando ADMIN_PASSWORD en texto plano fuera de localhost!')
          }
        }
        // Caso 3: hash llegó corrupto por dotenv-expand → loguear para debug
        else {
          console.error('[Auth] No hay credenciales válidas configuradas. Revisa ADMIN_PASSWORD o ADMIN_PASSWORD_HASH en .env.local')
          return null
        }

        if (!isValid) return null

        return { id: '1', email: adminEmail, name: 'Admin' }
      },
    }),
  ],
  pages: {
    signIn: '/studio/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 días
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
