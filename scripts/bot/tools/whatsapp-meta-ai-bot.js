require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')

// ── Configuración ──
// El número principal del usuario al que el bot le enviará los mensajes
const USER_PHONE = '51987006572'
const USER_JID = `${USER_PHONE}@c.us`

// Carpeta donde se guardan los videos recibidos de Meta AI
const VIDEOS_DIR = path.join(__dirname, 'downloads', 'scenes')
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true })

// Contador de escenas recibidas hoy
let sceneCounter = 0

// Ruta del Edge ya instalado en Windows
const EDGE_EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

console.log('\n🤖 Iniciando el Asistente de WhatsApp para Meta AI...')
console.log(`📡 Bot número: +51 987 006 572 | Usuario: ${USER_PHONE}`)

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'bot-session',
        dataPath: path.join(__dirname, '.wwebjs_auth')
    }),
    puppeteer: {
        executablePath: EDGE_EXE,  // Usamos Edge ya instalado, sin bajar Chrome
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
        ]
    }
})

// Evento: Se requiere escanear el QR
client.on('qr', (qr) => {
    console.log('\n======================================================')
    console.log('📱 ESCANEA ESTE CÓDIGO QR CON EL WHATSAPP DEL BOT')
    console.log('======================================================\n')
    qrcode.generate(qr, { small: true })
})

// Evento: Sesión iniciada correctamente
client.on('ready', async () => {
    console.log('\n✅ ¡Bot de WhatsApp conectado y listo!')
    console.log(`🤖 Verificando comunicación con el usuario principal: ${USER_PHONE}...`)
    
    try {
        await client.sendMessage(USER_JID, '👋 *¡Hola, Percy!* Soy tu bot automatizado de programación. Acabo de conectarme con éxito. Estoy listo para enviarte las imágenes y prompts de las efemérides para animarlas con Meta AI. 🚀')
        console.log('📨 Mensaje de prueba enviado a tu WhatsApp principal.')
    } catch (err) {
        console.error('❌ Error enviando mensaje de prueba:', err)
    }
})

// Evento: Autenticación exitosa
client.on('authenticated', () => {
    console.log('🔓 Autenticación exitosa (Sesión guardada localmente).')
})

// Evento: Escuchar mensajes entrantes (aquí recibimos los videos de Meta AI)
client.on('message', async (msg) => {
    if (msg.from !== USER_JID) return // Solo escuchar tu número principal

    // Comando de prueba
    if (msg.body.toLowerCase() === 'ping') {
        msg.reply('pong 🏓 ¡El bot está activo y escuchando!')
        return
    }

    // Detectar si envias un video (los clips generados por Meta AI)
    if (msg.hasMedia) {
        const media = await msg.downloadMedia()

        if (media && media.mimetype.includes('video')) {
            sceneCounter++
            const today = new Date().toISOString().split('T')[0]
            const filename = `${today}_escena_${String(sceneCounter).padStart(2,'0')}.mp4`
            const filePath = path.join(VIDEOS_DIR, filename)

            // Guardar el video como archivo local
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'))

            console.log(`\n🎥 Video #${sceneCounter} guardado: ${filePath}`)
            await msg.reply(
                `✅ *Video #${sceneCounter} recibido y guardado* como \`${filename}\`.\n` +
                `Sigue enviando los demás clips de Meta AI. Cuando termines, escríbeme: *\'listo\'*`
            )
        } else {
            await msg.reply('⚠️ Eso no parece un video MP4. ¿Estas reenviando los clips de Meta AI?')
        }
    }

    // Cuando el usuario dice 'listo', el bot sabe que ya tiene todos los videos
    if (msg.body.toLowerCase() === 'listo' && sceneCounter > 0) {
        await msg.reply(
            `🎨 Perfecto! Tengo *${sceneCounter} clips* guardados.\n` +
            `🔧 Iniciando el ensamblaje final del video con FFmpeg...`
        )
        console.log(`\n🔧 El usuario dijo 'listo'. Procesando ${sceneCounter} clips con FFmpeg...`)
        // TODO: Llamar a la función de FFmpeg para unir los videos
        // await assembleFinalVideo(today, sceneCounter)
    }
})

client.initialize()
