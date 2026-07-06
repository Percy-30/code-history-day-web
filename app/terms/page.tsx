import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Términos de Servicio — Code History Daily',
  description: 'Términos de uso y condiciones del servicio de Code History Daily.',
}

export default function TermsPage() {
  const lastUpdated = '2026-07-06'

  return (
    <main className="min-h-screen bg-[#080b12] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <a href="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            ← Volver al inicio
          </a>
        </div>

        <h1 className="text-4xl font-bold mb-3">Términos de Servicio</h1>
        <p className="text-white/40 text-sm mb-10">Última actualización: {lastUpdated}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-white/70 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Aceptación de los Términos</h2>
            <p>
              Al acceder y utilizar Code History Daily (en adelante, "el Servicio"), aceptas quedar
              vinculado por estos Términos de Servicio. Si no estás de acuerdo con alguno de estos
              términos, no debes utilizar el Servicio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Descripción del Servicio</h2>
            <p>
              Code History Daily es un proyecto educativo que publica contenido sobre la historia
              de la programación y la tecnología. El contenido se distribuye a través de plataformas
              digitales como YouTube, TikTok y Facebook en formato de video corto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Uso del Contenido</h2>
            <p>
              Todo el contenido publicado por Code History Daily es de carácter educativo e
              informativo. Queda prohibida la reproducción total o parcial sin autorización expresa
              del titular del proyecto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Integración con Terceros</h2>
            <p>
              Code History Daily utiliza APIs de terceros (YouTube Data API, TikTok Content Posting
              API, Facebook Graph API) exclusivamente para la publicación automatizada de contenido
              educativo en sus canales oficiales. No se recopilan datos de usuarios de dichas
              plataformas más allá de lo estrictamente necesario para la publicación.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Limitación de Responsabilidad</h2>
            <p>
              Code History Daily no garantiza la disponibilidad ininterrumpida del Servicio y no
              será responsable de daños directos o indirectos derivados del uso o la imposibilidad
              de uso del mismo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Modificaciones</h2>
            <p>
              Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios
              serán efectivos al ser publicados en esta página. El uso continuado del Servicio
              implica la aceptación de los términos modificados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Contacto</h2>
            <p>
              Para consultas relacionadas con estos términos, puedes escribirnos a:{' '}
              <a
                href="mailto:codehistorydaily@gmail.com"
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                codehistorydaily@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
