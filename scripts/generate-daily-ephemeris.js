#!/usr/bin/env node

/**
 * Script para generar efemérides diarias usando IA con grounding real (Tavily + Groq)
 * 
 * Uso:
 * node scripts/generate-daily-ephemeris.js [fecha_opcional]
 * 
 * Ejemplos:
 * node scripts/generate-daily-ephemeris.js              // Genera para mañana
 * node scripts/generate-daily-ephemeris.js 2025-01-15   // Genera para fecha específica
 */

const https = require('https')
const http = require('http')

// Configuración desde variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const TAVILY_API_KEY = process.env.TAVILY_API_KEY

if (!GROQ_API_KEY) {
    console.error('❌ Error: GROQ_API_KEY no está configurada')
    console.error('Configura tu API key de Groq (gratis, sin tarjeta, en https://console.groq.com/keys):')
    console.error('export GROQ_API_KEY="tu-api-key-aqui"')
    process.exit(1)
}

if (!TAVILY_API_KEY) {
    console.error('❌ Error: TAVILY_API_KEY no está configurada')
    console.error('Configura tu API key de Tavily (gratis, 1000 búsquedas/mes, sin tarjeta, en https://app.tavily.com):')
    console.error('export TAVILY_API_KEY="tvly-tu-api-key-aqui"')
    process.exit(1)
}

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_KEY no está configurada')
    console.error('Configura tu service key de Supabase:')
    console.error('export SUPABASE_SERVICE_KEY="tu-service-key-aqui"')
    process.exit(1)
}

// Función auxiliar para hacer peticiones HTTP
function makeRequest(url, options = {}, data = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url)
        const isHttps = urlObj.protocol === 'https:'
        const lib = isHttps ? https : http

        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        }

        const req = lib.request(reqOptions, (res) => {
            let body = ''
            res.on('data', chunk => body += chunk)
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(body)
                    resolve({ status: res.statusCode, data: jsonData })
                } catch (e) {
                    resolve({ status: res.statusCode, data: body })
                }
            })
        })

        req.on('error', reject)

        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data))
        }

        req.end()
    })
}

// Función para obtener el nombre del mes
function getMonthName(month) {
    const months = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ]
    return months[month - 1]
}

// Función para buscar en la web con Tavily (fuente de verdad real)
async function tavilySearch(query, maxResults = 5) {
    const response = await makeRequest('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TAVILY_API_KEY}`,
            'Content-Type': 'application/json',
        }
    }, {
        query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_answer: true,
    })

    if (response.status !== 200) {
        throw new Error(`Error de Tavily: ${response.status} ${JSON.stringify(response.data)}`)
    }

    return response.data // { answer, results: [{ title, url, content }, ...] }
}

// Función auxiliar para llamar a Groq con un prompt de chat dado
async function callGroq(messages, { temperature = 0, max_tokens = 600 } = {}) {
    const response = await makeRequest('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        }
    }, {
        model: GROQ_MODEL,
        messages,
        temperature,
        max_tokens,
        response_format: { type: 'json_object' },
    })

    if (response.status !== 200) {
        throw new Error(`Error de Groq: ${response.status} ${JSON.stringify(response.data)}`)
    }

    const content = response.data.choices?.[0]?.message?.content
    if (!content) {
        throw new Error('No se recibió contenido de Groq')
    }

    // Limpiar la respuesta y extraer JSON si está en un bloque de código markdown
    let cleanContent = content.trim()
    if (cleanContent.startsWith('```json') || cleanContent.startsWith('```')) {
        const lines = cleanContent.split('\n')
        const startIndex = lines.findIndex(line => line.startsWith('```'))
        const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === '```')
        if (startIndex !== -1 && endIndex !== -1) {
            cleanContent = lines.slice(startIndex + 1, endIndex).join('\n').trim()
        }
    }

    return JSON.parse(cleanContent)
}

// Función para generar efeméride: primero busca en internet con Tavily (fuente de
// verdad real) y luego pide a Groq que redacte el texto SOLO con base en esos
// resultados, nunca de memoria. Si la búsqueda no trae nada verificable para esta
// fecha exacta, no se inventa nada: se descarta.
async function generateEphemeris(targetDate) {
    // Usamos los métodos UTC para que el día/mes coincidan exactamente con la
    // fecha que se pasó por argumento (evita el desfase por zona horaria local)
    const day = targetDate.getUTCDate()
    const month = targetDate.getUTCMonth() + 1
    const monthName = getMonthName(month)

    console.log(`🔎 Buscando en la web eventos de tecnología para el ${day} de ${monthName}...`)

    try {
        // Buscamos en inglés (mejor cobertura de "on this day in tech history")
        // y también en español, y combinamos los resultados.
        const [resultsEn, resultsEs] = await Promise.all([
            tavilySearch(`"on this day" OR "today in history" technology software programming ${monthName} ${day}`),
            tavilySearch(`efeméride tecnología programación ${day} de ${monthName} historia`),
        ])

        const allResults = [...(resultsEn.results || []), ...(resultsEs.results || [])]

        if (allResults.length === 0) {
            console.log('⚠️ La búsqueda no devolvió resultados. Se descarta.')
            return null
        }

        // Armamos el contexto que se le pasará a Groq: SOLO esto puede usar,
        // nada de "recordar" de su entrenamiento.
        const context = allResults
            .slice(0, 8)
            .map((r, i) => `[Fuente ${i + 1}] ${r.title}\nURL: ${r.url}\nContenido: ${(r.content || '').substring(0, 800)}`)
            .join('\n\n')

        console.log(`🤖 Redactando efeméride para ${day} de ${monthName} con base en las fuentes encontradas...`)

        const prompt = `A continuación tienes resultados reales de una búsqueda web sobre eventos de tecnología/programación relacionados con el ${day} de ${monthName}:

---
${context}
---

Tu tarea: identificar, SOLO a partir del texto de arriba, un evento de programación/tecnología que haya ocurrido específicamente un ${day} de ${monthName} (de cualquier año). 

Reglas estrictas:
- NO uses ningún dato que no esté explícitamente en las fuentes de arriba. No completes con tu propio conocimiento.
- Si ninguna fuente confirma con claridad un evento de ESE día y mes exactos, responde con {"error": "No se encontró un evento verificable para esta fecha en las fuentes"}.
- Si encuentras un evento válido, indica también de qué número de fuente lo sacaste.

Responde SOLO en formato JSON, sin texto adicional:
{
    "event": "Descripción del evento en español, redactada por ti mismo pero basada estrictamente en la fuente",
    "historicalYear": año_del_evento,
    "historicalMonth": ${month},
    "historicalDay": ${day},
    "sourceIndex": número_de_fuente_usada,
    "sourceUrl": "URL de la fuente usada"
}

O si no hay nada verificable:
{
    "error": "No se encontró un evento verificable para esta fecha en las fuentes"
}`

        const ephemeris = await callGroq([
            {
                role: 'system',
                content: 'Eres un redactor de efemérides de tecnología extremadamente riguroso. SOLO puedes usar la información que se te entrega explícitamente en el contexto de búsqueda; tienes prohibido usar tu conocimiento general o inventar datos. Si el contexto no confirma el evento con la fecha exacta pedida, reportas error en vez de arriesgarte. Respondes siempre en formato JSON válido.'
            },
            { role: 'user', content: prompt }
        ], { temperature: 0, max_tokens: 700 })

        if (ephemeris.error) {
            console.log(`⚠️ IA reportó: ${ephemeris.error}`)
            return null
        }

        if (!ephemeris.event || !ephemeris.historicalYear || !ephemeris.historicalMonth || !ephemeris.historicalDay) {
            throw new Error('Respuesta de IA incompleta')
        }

        // Validación estricta: el día/mes histórico debe coincidir con el pedido.
        if (Number(ephemeris.historicalDay) !== day || Number(ephemeris.historicalMonth) !== month) {
            console.log(`⚠️ Descartado: la IA devolvió ${ephemeris.historicalDay}/${ephemeris.historicalMonth} en vez de ${day}/${month}`)
            return null
        }

        console.log(`✅ Efeméride generada (fuente: ${ephemeris.sourceUrl || 'sin URL'}): ${ephemeris.event.substring(0, 100)}...`)
        return ephemeris
    } catch (error) {
        console.error('❌ Error generando efeméride:', error.message)
        return null
    }
}

// Función para verificar si ya existe una efeméride
async function checkExistingEphemeris(displayDate) {
    try {
        const response = await makeRequest(
            `${SUPABASE_URL}/rest/v1/ephemerides?display_date=eq.${displayDate}`,
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                }
            }
        )

        if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
            return response.data[0]
        }

        return null
    } catch (error) {
        console.error('❌ Error verificando efeméride existente:', error.message)
        return null
    }
}

// Función para insertar efeméride en Supabase
async function insertEphemeris(targetDate, ephemerisData) {
    const displayDate = targetDate.toISOString().split('T')[0] // YYYY-MM-DD

    const ephemerisRecord = {
        day: targetDate.getUTCDate(),
        month: targetDate.getUTCMonth() + 1,
        year: targetDate.getUTCFullYear(),
        event: ephemerisData.event,
        display_date: displayDate,
        historical_day: ephemerisData.historicalDay,
        historical_month: ephemerisData.historicalMonth,
        historical_year: ephemerisData.historicalYear,
    }

    console.log(`💾 Insertando efeméride en la base de datos...`)

    try {
        const response = await makeRequest(`${SUPABASE_URL}/rest/v1/ephemerides`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
            }
        }, ephemerisRecord)

        if (response.status !== 201) {
            throw new Error(`Error insertando en Supabase: ${response.status} ${JSON.stringify(response.data)}`)
        }

        console.log(`✅ Efeméride insertada exitosamente para ${displayDate}`)
        return response.data[0]
    } catch (error) {
        console.error('❌ Error insertando efeméride:', error.message)
        throw error
    }
}

// Función principal
async function main() {
    console.log('🚀 Iniciando generación de efeméride diaria...')

    // Determinar la fecha objetivo
    const targetDateArg = process.argv[2]
    let targetDate

    if (targetDateArg) {
        targetDate = new Date(targetDateArg + 'T00:00:00.000Z')
        if (isNaN(targetDate.getTime())) {
            console.error('❌ Error: Fecha inválida. Usa formato YYYY-MM-DD')
            process.exit(1)
        }
    } else {
        // Por defecto: mañana
        targetDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    }

    const displayDate = targetDate.toISOString().split('T')[0]
    console.log(`📅 Fecha objetivo: ${displayDate}`)

    try {
        // Verificar si ya existe una efeméride para esta fecha
        console.log('🔍 Verificando si ya existe una efeméride...')
        const existing = await checkExistingEphemeris(displayDate)

        if (existing) {
            console.log(`⚠️  Ya existe una efeméride para ${displayDate}:`)
            console.log(`   ${existing.event}`)
            console.log('✨ No se necesita generar una nueva.')
            return
        }

        // Generar nueva efeméride
        const ephemerisData = await generateEphemeris(targetDate)

        if (!ephemerisData) {
            console.error('❌ No se pudo generar la efeméride')
            process.exit(1)
        }

        // Insertar en la base de datos
        const insertedEphemeris = await insertEphemeris(targetDate, ephemerisData)

        console.log('🎉 ¡Efeméride generada e insertada exitosamente!')
        console.log(`📖 Evento: ${insertedEphemeris.event}`)
        console.log(`📅 Fecha histórica: ${insertedEphemeris.historical_day}/${insertedEphemeris.historical_month}/${insertedEphemeris.historical_year}`)

    } catch (error) {
        console.error('❌ Error en el proceso:', error.message)
        process.exit(1)
    }
}

// Ejecutar el script
if (require.main === module) {
    main()
}