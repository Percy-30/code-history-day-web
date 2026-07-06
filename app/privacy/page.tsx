import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidad — Code History Daily',
  description: 'Política de privacidad y tratamiento de datos de Code History Daily.',
}

export default function PrivacyPage() {
  const lastUpdated = '2026-07-06'

  return (
    <main className="min-h-screen bg-[#080b12] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <a href="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            ← Volver al inicio
          </a>
        </div>

        <h1 className="text-4xl font-bold mb-3">Política de Privacidad</h1>
        <p className="text-white/40 text-sm mb-10">Última actualización: {lastUpdated}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-white/70 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Responsable del Tratamiento</h2>
            <p>
              Code History Daily, operado por ATP Dev, es el responsable del tratamiento de los datos
              personales. Contacto:{' '}
              <a
                href="mailto:codehistorydaily@gmail.com"
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                codehistorydaily@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Datos que Recopilamos</h2>
            <p>Code History Daily NO recopila datos personales de visitantes. El proyecto utiliza:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Datos de APIs de Google (YouTube) para publicación de contenido propio</li>
              <li>Datos de la API de TikTok para publicación de contenido propio</li>
              <li>Datos de la API de Facebook para publicación de contenido propio</li>
            </ul>
            <p className="mt-3">
              En ningún caso se recopilan, almacenan ni comparten datos personales de usuarios
              de dichas plataformas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Uso de las APIs de Terceros</h2>
            <p>
              Las integraciones con YouTube, TikTok y Facebook se utilizan exclusivamente para
              publicar contenido educativo en los canales oficiales de Code History Daily. Los
              tokens de acceso se almacenan de forma segura y no se comparten con terceros.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                <strong className="text-white">YouTube:</strong> Usamos YouTube Data API v3 bajo los{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300"
                >
                  Términos de Privacidad de Google
                </a>
              </li>
              <li>
                <strong className="text-white">TikTok:</strong> Usamos TikTok Content Posting API bajo la{' '}
                <a
                  href="https://www.tiktok.com/legal/page/global/privacy-policy/en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300"
                >
                  Política de Privacidad de TikTok
                </a>
              </li>
              <li>
                <strong className="text-white">Facebook:</strong> Usamos Facebook Graph API bajo la{' '}
                <a
                  href="https://www.facebook.com/policy.php"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300"
                >
                  Política de Datos de Meta
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Cookies</h2>
            <p>
              Este sitio web no utiliza cookies de seguimiento ni publicidad. Solo se utilizan
              cookies de sesión estrictamente necesarias para el panel de administración.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Derechos del Usuario</h2>
            <p>
              De conformidad con la normativa vigente, puedes ejercer tus derechos de acceso,
              rectificación, cancelación y oposición enviando un correo a{' '}
              <a
                href="mailto:codehistorydaily@gmail.com"
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                codehistorydaily@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Cambios en esta Política</h2>
            <p>
              Nos reservamos el derecho de actualizar esta política en cualquier momento. Te
              notificaremos de cambios significativos publicando la nueva versión en esta página.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
