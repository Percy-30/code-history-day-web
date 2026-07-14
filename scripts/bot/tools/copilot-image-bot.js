#!/usr/bin/env node

/**
 * 🤖 Bot Local - Generador de Imágenes de Efemérides con Copilot
 * 
 * Este script automatiza la generación de la imagen de portada diaria usando
 * Microsoft Copilot / Bing Image Creator con TU CUENTA ya iniciada.
 * 
 * ¿Cómo funciona?
 *  1. Copia las cookies/sesión de tu perfil de Edge a un perfil temporal.
 *  2. Abre ese perfil temporal (Edge puede seguir abierto sin problemas).
 *  3. Va a copilot.microsoft.com y escribe el prompt de la efeméride del día.
 *  4. Espera que Copilot genere las imágenes.
 *  5. Descarga la primera imagen a /scripts/downloads/.
 *  6. La sube a Google Drive en tu carpeta de efemérides.
 * 
 * Uso:
 *   node scripts/copilot-image-bot.js              → Genera para HOY
 *   node scripts/copilot-image-bot.js 2026-07-10   → Genera para fecha específica
 *   node scripts/copilot-image-bot.js --visible    → Modo visible (ver el navegador)
 * 
 * Requisitos:
 *   - Tener Microsoft Edge instalado (viene en Windows)
 *   - O Google Chrome instalado
 *   - Haber iniciado sesión en copilot.microsoft.com al menos una vez
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

// ─── Configuración ──────────────────────────────────────────────────────────

// Rutas comunes de Edge y Chrome en Windows
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
]

// Perfiles de usuario (donde está tu sesión guardada)
const EDGE_USER_DATA = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local', 'Microsoft\\Edge\\User Data')
const CHROME_USER_DATA = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local', 'Google\\Chrome\\User Data')

// Directorio temporal para el perfil clonado (evita conflicto con Edge abierto)
const TEMP_PROFILE_DIR = path.join(require('os').tmpdir(), 'copilot-bot-profile')

// Directorio donde se guardan las imágenes descargadas
const DOWNLOADS_DIR = path.join(__dirname, 'downloads')

// Google Drive config desde .env.local
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const EPHEMERIS_DRIVE_FOLDER_ID = process.env.GOOGLE_EPHEMERIS_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID

// Supabase y Groq para obtener la efeméride real del día
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

// ─── Utilidades ─────────────────────────────────────────────────────────────

function log(emoji, msg) { console.log(`${emoji}  ${msg}`) }

function getMonthNameEs(month) {
  const months = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre']
  return months[month - 1]
}

/** Retorna la fecha objetivo según el argumento o usa hoy (hora Perú UTC-5) */
function getTargetDate() {
  const arg = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))
  if (arg) return new Date(arg + 'T12:00:00.000Z')

  // Hora Perú: UTC-5
  const now = new Date()
  const peruTime = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  return peruTime
}

/** Detecta si se pidió modo visible (--visible) */
function isVisible() {
  return process.argv.includes('--visible')
}

/** Encuentra el ejecutable del navegador disponible */
function findBrowser() {
  for (const p of EDGE_PATHS) {
    if (fs.existsSync(p)) return { exe: p, userDataDir: EDGE_USER_DATA, name: 'Edge' }
  }
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return { exe: p, userDataDir: CHROME_USER_DATA, name: 'Chrome' }
  }
  return null
}

/**
 * Copia los archivos críticos del perfil real al directorio temporal.
 * Esto nos permite preservar las cookies (sesión) sin conflicto con el
 * navegador que ya esté abierto.
 */
function cloneProfileSession(sourceUserDataDir, browserName) {
  // Archivos clave que contienen las cookies / sesión de Microsoft
  const criticalFiles = [
    'Default\\Cookies',
    'Default\\Login Data',
    'Default\\Web Data',
    'Default\\Network\\Cookies',   // Edge almacena cookies aquí
    'Default\\Preferences',
    'Local State',
  ]

  // Crear estructura del perfil temporal
  const tempDefault = path.join(TEMP_PROFILE_DIR, 'Default')
  const tempNetwork = path.join(tempDefault, 'Network')
  fs.mkdirSync(tempNetwork, { recursive: true })

  let copiedCount = 0
  for (const relPath of criticalFiles) {
    const src = path.join(sourceUserDataDir, relPath)
    const dst = path.join(TEMP_PROFILE_DIR, relPath)
    if (fs.existsSync(src)) {
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        fs.copyFileSync(src, dst)
        copiedCount++
      } catch {
        // Algunos archivos pueden estar bloqueados (DB open); ignorar
      }
    }
  }

  log('📋', `Perfil temporal creado con ${copiedCount} archivos de sesión`)
  return TEMP_PROFILE_DIR
}

// ─── Supabase: leer efeméride del día ──────────────────────────────────────────

/**
 * Obtiene la efeméride del día desde Supabase.
 * Retorna null si no existe o si Supabase no está configurado.
 */
async function fetchEphemerisForDate(displayDate) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    log('⚠️', 'Supabase no configurado — se usará prompt genérico')
    return null
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ephemerides?display_date=eq.${displayDate}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    )
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      log('📖', `Efeméride encontrada: ${data[0].event.substring(0, 80)}...`)
      return data[0]
    }
    log('⚠️', 'No hay efeméride en Supabase para hoy — se usará prompt genérico')
    return null
  } catch (err) {
    log('⚠️', `Error consultando Supabase: ${err.message}`)
    return null
  }
}

// ─── Groq: generar elementos visuales dinámicos ─────────────────────────────

/**
 * Usa Groq para sugerir los elementos visuales específicos del evento.
 * Esto es lo que hace que cada imagen sea única y contextual (como la del virus Sasser
 * que incluyó una PC con Windows XP + mazo de juez + globo con conexiones).
 */
async function generateVisualElements(eventText, historicalYear) {
  if (!GROQ_API_KEY) {
    return null
  }

  try {
    log('🧠', 'Generando elementos visuales con Groq...')
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Eres un director de arte especializado en thumbnails de YouTube de tecnología. Analizas eventos históricos de programación y sugieres elementos visuales específicos y contextuales para crear imágenes cinematográficas. Respondes siempre en JSON válido.',
          },
          {
            role: 'user',
            content: `Evento histórico: "${eventText}" (año: ${historicalYear})

Sugiere elementos visuales específicos para crear un thumbnail profesional de YouTube sobre este evento. Responde en JSON:
{
  "titulo_corto": "Título impactante de máximo 8 palabras en español",
  "descripcion_corta": "Descripción de 1 línea, max 15 palabras en español",
  "objeto_principal": "El objeto físico más representativo del evento (ej: computadora Apple II, mazo de juez, disquete)",
  "objeto_secundario": "Segundo elemento visual complementario (ej: globo terráqueo, código fuente, diagrama de red)",
  "objeto_tercero": "Tercer elemento decorativo (ej: chip de CPU, libro, servidor)",
  "panel_hud_izq": "Texto para panel de diagnóstico técnico izquierdo (3-4 líneas de datos técnicos del evento)",
  "panel_hud_der": "Texto para panel de estadísticas derecho (3-4 líneas con impacto del evento)",
  "color_acento": "Color neón dominante adicional según el tipo de evento (red/orange para virus, blue/green para inventos, purple para software, yellow para hardware)",
  "ambiente": "3-4 palabras que describen el ambiente visual (ej: tension judicial, celebracion tecnologica, drama cibernetico)"
}`,
          },
        ],
      }),
    })

    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content)
    log('🎨', `Estilo: ${parsed.ambiente} | Acento: ${parsed.color_acento}`)
    return parsed
  } catch (err) {
    log('⚠️', `Groq visual elements error: ${err.message}`)
    return null
  }
}

// ─── Prompt Builder — Estilo Thumbnail Profesional ─────────────────────────

/**
 * Construye el prompt definitivo para Copilot.
 * Si hay datos de efeméride + elementos visuales, genera una imagen específica
 * y cinematográfica del evento. Si no, genera un banner genérico de calidad.
 */
function buildRichCopilotPrompt(day, month, year, monthName, ephemeris, visualEl) {
  const todayStr = `${day} de ${monthName} de ${year}`

  // Datos de la efeméride (con fallbacks)
  const histDay       = ephemeris?.historical_day    || day
  const histMonth     = ephemeris?.historical_month  || month
  const histYear      = ephemeris?.historical_year   || year
  const histMonthName = getMonthNameEs(histMonth)
  const titulo        = visualEl?.titulo_corto       || (ephemeris?.event ? ephemeris.event.substring(0, 80)  : 'Efeméride del Día')
  const descripcion   = visualEl?.descripcion_corta  || (ephemeris?.event ? ephemeris.event.substring(0, 150) : 'Un hito en la historia de la tecnología')
  const personaje     = visualEl?.objeto_principal   || 'pionero de la tecnología'
  const acento        = visualEl?.color_acento       || 'blue'

  return `Diseño tecnológico futurista estilo cyberpunk premium, miniatura profesional de YouTube, formato panorámico 16:9.

MANTENER SIEMPRE LA MISMA IDENTIDAD VISUAL DE LA MARCA "CodeHistory Daily".

CABECERA FIJA

En la parte superior una terminal futurista mostrando:

user@atpdev:~$ ./code-history --day

Debajo un gran título principal:

CodeHistory Daily

Subtítulo:

Descubre la historia de la programación día a día

Fondo tecnológico con centro de datos futurista, circuitos digitales, interfaces holográficas, luces neón azules y naranjas, paneles HUD transparentes, efectos de energía y ambiente tecnológico cinematográfico.

--------------------------------------------------

CONTENIDO VARIABLE

EFEMÉRIDE DEL DÍA

${histDay} de ${histMonthName} de ${histYear}

Título principal:

${titulo}

Subtítulo:

${descripcion}

Elemento visual principal relacionado con la efeméride:

${personaje}

--------------------------------------------------

COMPOSICIÓN VISUAL

Lado izquierdo:
Elemento principal de la efeméride representado con estilo realista y cinematográfico: ${personaje}.

Centro:
Texto de la efeméride perfectamente legible y dominante.

Lado derecho:
Globo terráqueo holográfico futurista con redes digitales, conexiones luminosas y paneles tecnológicos relacionados con el impacto global de la efeméride.

Agregar elementos secundarios relacionados con la temática:
- Diagramas holográficos.
- Interfaces HUD.
- Datos históricos.
- Efectos tecnológicos.
- Iluminación neón azul, naranja y ${acento}.
- Profundidad cinematográfica.
- Detalles ultra realistas.

--------------------------------------------------

PIE DE IMAGEN

Fecha actual: ${todayStr}

© 2026 ATP Dev | v0.1.0 |

--------------------------------------------------

IMPORTANTE

- Todo el texto debe estar completamente en español.
- Todo el texto debe ser perfectamente legible.
- Mantener composición profesional.
- No agregar marcas de agua.
- No agregar logotipos adicionales.
- No agregar textos aleatorios.
- No deformar letras.
- Mantener estética consistente entre todas las imágenes.
- Ultra detallado.
- Calidad profesional.
- Estilo CodeHistory Daily.
- Sin espacios vacíos.`
}

// ─── Descarga de imagen ──────────────────────────────────────────────────────

/** Descarga una imagen desde una URL a un archivo local */
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)

    proto.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Seguir redirect
        return downloadImage(response.headers.location, destPath).then(resolve).catch(reject)
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode} al descargar imagen`))
      }
      response.pipe(file)
      file.on('finish', () => { file.close(); resolve(destPath) })
    }).on('error', (err) => {
      fs.unlink(destPath, () => {})
      reject(err)
    })
  })
}

// ─── Google Drive Upload ─────────────────────────────────────────────────────

/** Obtiene un access token de Google usando el refresh token */
async function getGoogleAccessToken() {
  if (!GOOGLE_REFRESH_TOKEN || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    log('⚠️', 'Variables de Google no configuradas — se omite subida a Drive')
    return null
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Error obteniendo access token de Google: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

/** Busca o crea la subcarpeta de la fecha dentro de la carpeta raíz */
async function getOrCreateDateFolderCopilot(accessToken, dateStr) {
  const rootFolderId = EPHEMERIS_DRIVE_FOLDER_ID
  if (!rootFolderId) return null

  // Buscar subcarpeta existente
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q='${rootFolderId}'+in+parents+and+name='${dateStr}'+and+mimeType='application%2Fvnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&pageSize=1`
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const searchData = await searchRes.json()

  if (searchData.files && searchData.files.length > 0) {
    log('📁', `Subcarpeta encontrada en Drive: ${dateStr}`)
    return searchData.files[0].id
  }

  // Crear subcarpeta si no existe
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: dateStr,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }),
  })
  const createData = await createRes.json()
  if (!createData.id) throw new Error(`No se pudo crear subcarpeta ${dateStr}: ${JSON.stringify(createData)}`)

  log('📁', `Subcarpeta creada en Drive: ${dateStr} (${createData.id})`)
  return createData.id
}

/** Sube un archivo local a Google Drive dentro de la subcarpeta de la fecha */
async function uploadToDrive(filePath, fileName, accessToken, dateStr) {
  if (!accessToken) return null

  // Resolver la subcarpeta de la fecha
  let targetFolderId = EPHEMERIS_DRIVE_FOLDER_ID
  if (dateStr && EPHEMERIS_DRIVE_FOLDER_ID) {
    try {
      targetFolderId = await getOrCreateDateFolderCopilot(accessToken, dateStr)
    } catch (folderErr) {
      log('⚠️', `No se pudo crear subcarpeta, subiendo a raíz: ${folderErr.message}`)
    }
  }

  const fileBuffer = fs.readFileSync(filePath)
  const fileSize = fileBuffer.length

  const metadata = {
    name: fileName,
    mimeType: 'image/jpeg',
    ...(targetFolderId && { parents: [targetFolderId] }),
  }

  // Upload multipart
  const boundary = '-------ephemeris_boundary_xyz'
  const metaStr = JSON.stringify(metadata)

  const bodyParts = [
    `--${boundary}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    `${metaStr}\r\n`,
    `--${boundary}\r\n`,
    `Content-Type: image/jpeg\r\n`,
    `Content-Length: ${fileSize}\r\n\r\n`,
  ]

  const headerBuffer = Buffer.from(bodyParts.join(''))
  const footerBuffer = Buffer.from(`\r\n--${boundary}--`)
  const body = Buffer.concat([headerBuffer, fileBuffer, footerBuffer])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    }
  )

  const data = await res.json()
  if (!data.id) {
    throw new Error(`Error subiendo a Drive: ${JSON.stringify(data)}`)
  }

  return data // { id, name, webViewLink }
}


// ─── Bot Principal ───────────────────────────────────────────────────────────

async function run() {
  log('🚀', 'Iniciando Bot de Imágenes de Efemérides...')

  // 1. Calcular fecha y prompt
  const targetDate = getTargetDate()
  const day = targetDate.getUTCDate()
  const month = targetDate.getUTCMonth() + 1
  const year = targetDate.getUTCFullYear()
  const monthName = getMonthNameEs(month)
  const dateStr = `${day} de ${monthName} de ${year}`
  const fileDateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`

  log('📅', `Fecha objetivo: ${dateStr}`)

  // 2. Obtener datos de la efeméride real desde Supabase y Groq
  const displayDateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const ephemeris = await fetchEphemerisForDate(displayDateStr)
  let visualEl = null
  if (ephemeris) {
    visualEl = await generateVisualElements(ephemeris.event, ephemeris.historical_year)
  }

  // 3. Preparar directorio de descargas
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
  }

  // 4. Detectar navegador
  const browser = findBrowser()
  if (!browser) {
    log('❌', 'No se encontró Edge ni Chrome instalado en rutas estándar.')
    log('💡', 'Instala Microsoft Edge o Google Chrome y vuelve a intentarlo.')
    process.exit(1)
  }
  log('🌐', `Usando navegador: ${browser.name} → ${browser.exe}`)

  // 5. Construir el prompt dinámico y cinematográfico
  const prompt = buildRichCopilotPrompt(day, month, year, monthName, ephemeris, visualEl)
  log('📝', `Prompt construido para: ${dateStr}`)
  log('✨', `Extracto del prompt: ${prompt.substring(0, 100)}...`)

  // 6. Lanzar navegador con perfil del usuario
  log('🔓', `Preparando perfil de sesión para ${browser.name}...`)

  // Clonar perfil a directorio temporal para no conflictuar con el navegador abierto
  const tempProfileDir = cloneProfileSession(browser.userDataDir, browser.name)
  const headless = !isVisible()

  log('🚀', `Lanzando ${browser.name} con perfil temporal (Edge puede seguir abierto)...`)

  let browserInstance
  try {
    browserInstance = await puppeteer.launch({
      executablePath: browser.exe,
      userDataDir: tempProfileDir,
      headless: headless ? 'new' : false,
      defaultViewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--disable-extensions-except',
        '--disable-gpu',
        '--profile-directory=Default',
      ],
    })
  } catch (err) {
    log('❌', `Error lanzando ${browser.name}: ${err.message}`)
    log('💡', `Detalle: ${err.message}`)
    // Último recurso: lanzar sin perfil de usuario (pedirá login manualmente)
    log('🔄', 'Intentando sin perfil de sesión (necesitarás iniciar sesión manualmente)...')
    try {
      browserInstance = await puppeteer.launch({
        executablePath: browser.exe,
        headless: false, // Sin headless para que puedas hacer login
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      log('⚠️', 'Navegador abierto SIN sesión. Inicia sesión en Copilot manualmente y vuelve a ejecutar.')
    } catch (err2) {
      log('❌', `Error fatal: ${err2.message}`)
      process.exit(1)
    }
  }

  const page = await browserInstance.newPage()

  // Ocultar que somos un bot
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  try {
    // 6. Ir a Copilot
    log('🌐', 'Navegando a copilot.microsoft.com...')
    await page.goto('https://copilot.microsoft.com', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Esperar a que cargue la página
    await new Promise(r => setTimeout(r, 3000))

    // Verificar si estamos logueados (buscar algún indicador)
    const pageTitle = await page.title()
    log('📄', `Título de página: ${pageTitle}`)

    // 7. Buscar el área de texto del chat de Copilot
    log('🔍', 'Buscando el área de entrada de texto...')

    // Copilot tiene diferentes selectores según la versión; intentamos varios
    const textAreaSelectors = [
      'textarea[placeholder*="Pregunta"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Copilot"]',
      'div[contenteditable="true"]',
      '#searchbox',
      'textarea',
      'input[type="text"]',
    ]

    let textArea = null
    for (const selector of textAreaSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 })
        textArea = await page.$(selector)
        if (textArea) {
          log('✅', `Área de texto encontrada con selector: ${selector}`)
          break
        }
      } catch { /* continuar */ }
    }

    if (!textArea) {
      // Tomar screenshot para diagnóstico
      const screenshotPath = path.join(DOWNLOADS_DIR, `debug-screenshot-${fileDateStr}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      log('⚠️', `No se encontró el área de texto. Screenshot guardado en: ${screenshotPath}`)
      log('💡', 'Ejecuta con --visible para ver qué pasa: node scripts/copilot-image-bot.js --visible')
      throw new Error('No se pudo encontrar el área de texto de Copilot')
    }

    // 8. Pegar el prompt COMPLETO de una sola vez (evita que Copilot responda a medias)
    log('📋', 'Pegando prompt completo en Copilot (un solo paste, sin typo)...')
    try {
      await textArea.click()
    } catch {
      await page.evaluate(el => el.focus(), textArea)
    }
    await new Promise(r => setTimeout(r, 500))

    // Escribir el prompt al portapapeles del navegador y pegarlo con Ctrl+V
    // Esto manda TODO el texto de una sola vez, Copilot no puede leer a medias.
    await page.evaluate((text) => {
      return navigator.clipboard.writeText(text)
    }, prompt)

    // Limpiar cualquier texto previo en el textarea y pegar
    try {
      await textArea.click({ clickCount: 3 }) // seleccionar todo
    } catch {
      await page.evaluate(el => {
        el.focus();
        if (typeof el.select === 'function') el.select();
      }, textArea);
    }
    await page.keyboard.press('Delete')
    await page.keyboard.down('Control')
    await page.keyboard.press('v')
    await page.keyboard.up('Control')

    // Esperar que el texto quede pegado correctamente antes de enviar
    await new Promise(r => setTimeout(r, 1500))

    // Verificar que el texto se pegó (al menos 100 chars)
    const pastedLength = await page.evaluate(() => {
      const ta = document.querySelector('textarea')
      return ta ? ta.value.length : 0
    })
    log('📋', `Texto pegado: ${pastedLength} caracteres en el textarea`)

    if (pastedLength < 50) {
      // Fallback: intentar con execCommand (método antiguo pero compatible)
      log('🔄', 'Clipboard API falló, intentando execCommand...')
      await page.evaluate((text) => {
        const ta = document.querySelector('textarea')
        if (ta) {
          ta.focus()
          ta.select()
          document.execCommand('insertText', false, text)
        }
      }, prompt)
      await new Promise(r => setTimeout(r, 500))
    }

    // Enviar el prompt
    await new Promise(r => setTimeout(r, 800))

    // Intentar botón de enviar primero
    const sendSelectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
      'button[type="submit"]',
      'button[aria-label*="submit"]',
    ]

    let sent = false
    for (const selector of sendSelectors) {
      try {
        const btn = await page.$(selector)
        if (btn) {
          await btn.click()
          sent = true
          log('📤', 'Prompt enviado con botón.')
          break
        }
      } catch { /* continuar */ }
    }

    if (!sent) {
      await page.keyboard.press('Enter')
      log('📤', 'Prompt enviado con Enter.')
    }

    // 9. Esperar que se generen las imágenes (Copilot tarda ~30-90 segundos)
    log('⏳', 'Esperando que Copilot genere las imágenes (puede tardar 30-90 segundos)...')

    // Dominios y patrones que son imágenes reales de AI generadas por Copilot/Bing
    const VALID_IMAGE_DOMAINS = [
      'th.bing.com',
      'r.bing.com',
      'sydney.bing.com',
      'bingimagecreatorstorage.blob.core.windows.net',
      'dalleproduse.blob.core.windows.net',
      'oaidalle',
      '.blob.core.windows.net',
      'images.bing.com',
    ]
    // Patrones a EXCLUIR (trackers, logos, iconos)
    const EXCLUDE_PATTERNS = [
      'bat.bing.com',
      'www.bing.com/th?id=OIP',  // thumbnails normales de Bing
      '/logo',
      '/icon',
      'favicon',
      'avatar',
      'profile',
    ]

    /**
     * Extrae todas las imágenes grandes de la página actual usando evaluate().
     * Filtra por: tamaño real renderizado (> 200x200) y dominio válido.
     */
    async function findGeneratedImages() {
      return page.evaluate((validDomains, excludePatterns) => {
        const imgs = Array.from(document.querySelectorAll('img'))
        const results = []
        for (const img of imgs) {
          const src = img.src || img.getAttribute('src') || ''
          if (!src || !src.startsWith('http')) continue

          // Excluir trackers y elementos no-imagen
          const isExcluded = excludePatterns.some(p => src.includes(p))
          if (isExcluded) continue

          // Aceptar si viene de un dominio conocido de Copilot/DALLE
          const isValidDomain = validDomains.some(d => src.includes(d))

          // O bien: si la imagen renderizada es grande (>200px en alguna dimensión)
          const isBig = img.naturalWidth > 200 || img.naturalHeight > 200 ||
                        img.width > 200 || img.height > 200

          if (isValidDomain || isBig) {
            results.push({
              src,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
            })
          }
        }
        // Ordenar por área (más grande primero)
        results.sort((a, b) => (b.width * b.height) - (a.width * a.height))
        return results.map(r => r.src)
      }, VALID_IMAGE_DOMAINS, EXCLUDE_PATTERNS)
    }

    let foundImages = []
    const maxWait = 120000 // 2 minutos máximo
    const startTime = Date.now()

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, 5000)) // Revisar cada 5 segundos

      try {
        const candidates = await findGeneratedImages()
        if (candidates.length > 0) {
          foundImages = candidates
          log('🎨', `¡${foundImages.length} imagen(es) generada(s)!`)
          // Loguear las primeras 3 para diagnóstico
          foundImages.slice(0, 3).forEach((url, i) => {
            log('🖼️', `  [${i+1}] ${url.substring(0, 90)}`)
          })
          break
        }
      } catch { /* continuar */ }

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      log('⏳', `Esperando... (${elapsed}s)`)
    }

    if (foundImages.length === 0) {
      // Screenshot de diagnóstico
      const screenshotPath = path.join(DOWNLOADS_DIR, `debug-timeout-${fileDateStr}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      log('⚠️', `Timeout: no se generaron imágenes. Screenshot: ${screenshotPath}`)
      log('💡', 'Intenta con --visible para depurar: node scripts/copilot-image-bot.js --visible')
      throw new Error('Timeout esperando imágenes de Copilot')
    }

    // 10. Descargar la primera imagen
    const imageUrl = foundImages[0]
    const outputFileName = `ephemeris-${fileDateStr}.jpg`
    const outputPath = path.join(DOWNLOADS_DIR, outputFileName)

    log('⬇️', `Descargando imagen desde: ${imageUrl.substring(0, 80)}...`)
    await downloadImage(imageUrl, outputPath)
    log('✅', `Imagen descargada: ${outputPath}`)

    // 11. Subir a Google Drive
    log('☁️', 'Subiendo a Google Drive...')
    let driveResult = null
    try {
      const accessToken = await getGoogleAccessToken()
      if (accessToken) {
        driveResult = await uploadToDrive(outputPath, outputFileName, accessToken, fileDateStr)
        log('✅', `Subida a Drive exitosa!`)
        log('🔗', `Link: ${driveResult.webViewLink}`)
        log('🆔', `File ID: ${driveResult.id}`)
      }
    } catch (driveErr) {
      log('⚠️', `Error subiendo a Drive: ${driveErr.message}`)
      log('💡', 'La imagen está guardada localmente en: ' + outputPath)
    }

    // 12. Resumen final
    console.log('\n' + '═'.repeat(60))
    log('🎉', '¡PROCESO COMPLETADO EXITOSAMENTE!')
    console.log('═'.repeat(60))
    log('📅', `Fecha: ${dateStr}`)
    log('📁', `Archivo local: ${outputPath}`)
    if (driveResult) {
      log('☁️', `Google Drive ID: ${driveResult.id}`)
      log('🔗', `Ver en Drive: ${driveResult.webViewLink}`)
    }
    console.log('═'.repeat(60))

  } catch (err) {
    log('❌', `Error: ${err.message}`)
    process.exit(1)
  } finally {
    await browserInstance.close()
  }
}

// ─── Entrypoint ──────────────────────────────────────────────────────────────

if (require.main === module) {
  run().catch(err => {
    console.error('❌ Error fatal:', err)
    process.exit(1)
  })
}
