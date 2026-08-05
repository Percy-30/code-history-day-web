"use client"

import { useState, useEffect } from "react"
import { Calendar, Code, Terminal, Clock, Share2, Flame, Sparkles, BookOpen, Search, ExternalLink, RefreshCw, Send } from "lucide-react"
import { XLogo } from "@/components/ui/x-logo"
import { getCloseTabCommand, getOSInfo } from "@/lib/browser-utils"
import { getTodayEphemeris, formatEphemerisForDisplay } from "@/lib/ephemerides"
import type { Ephemeris } from "@/app/api/ephemerides/route"
import type { DailyContent } from "@/lib/daily-content"

export default function AlmaniqWeb() {
  const [activeTab, setActiveTab] = useState<"ephemeris" | "trends" | "history">("ephemeris")
  const [currentTime, setCurrentTime] = useState("")
  const [todayEphemeris, setTodayEphemeris] = useState<Ephemeris | null>(null)
  const [trendsHistory, setTrendsHistory] = useState<DailyContent[]>([])
  const [selectedContent, setSelectedContent] = useState<DailyContent | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  const [displayText, setDisplayText] = useState("")
  const [isTyping, setIsTyping] = useState(true)
  const [closeCommand, setCloseCommand] = useState("Ctrl+W")
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Interactive Terminal state
  const [terminalInput, setTerminalInput] = useState("")

  useEffect(() => {
    // Clock tick
    const timeInterval = setInterval(() => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString("es-ES", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
    }, 1000)

    const osInfo = getOSInfo()
    setCloseCommand(getCloseTabCommand())
    setIsMobile(osInfo.isMobile)

    // Load content
    const loadAllData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // 1. Fetch Today's Ephemeris
        const ephemeris = await getTodayEphemeris()
        setTodayEphemeris(ephemeris)

        // 2. Fetch Trends History from /api/daily-content
        const historyRes = await fetch("/api/daily-content?history=1&limit=30").catch(() => null)
        if (historyRes && historyRes.ok) {
          const json = await historyRes.json()
          if (json.data && Array.isArray(json.data)) {
            setTrendsHistory(json.data)
            if (json.data.length > 0) {
              setSelectedContent(json.data[0])
            }
          }
        }
      } catch (err) {
        console.error("Error cargando contenido de Almaniq:", err)
        setError("Error al conectar con la base de datos de Almaniq")
      } finally {
        setIsLoading(false)
      }
    }

    loadAllData()
    return () => clearInterval(timeInterval)
  }, [])

  // Typewriter effect for main ephemeris
  useEffect(() => {
    if (!todayEphemeris || isLoading) return

    const formattedEphemeris = formatEphemerisForDisplay(todayEphemeris)
    const fullText = `${formattedEphemeris.date} de ${formattedEphemeris.year}:\n\n${formattedEphemeris.event}`

    let index = 0
    setDisplayText("")
    setIsTyping(true)

    const typingInterval = setInterval(() => {
      if (index < fullText.length) {
        setDisplayText(fullText.slice(0, index + 1))
        index++
      } else {
        setIsTyping(false)
        clearInterval(typingInterval)
      }
    }, 25)

    return () => clearInterval(typingInterval)
  }, [todayEphemeris, isLoading])

  // Share handlers
  const handleShareX = (text: string) => {
    const tweetText = `💻 ${text.substring(0, 200)}...\n\n Cada día nuevas historias en Almaniq Web:`
    const url = window.location.href
    const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`
    window.open(xUrl, "_blank", "width=550,height=420")
  }

  const handleShareWhatsApp = (text: string) => {
    const message = `🚀 *Almaniq Web | Tendencia del Día*\n\n${text}\n\nLee más en: ${window.location.href}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank")
  }

  // Filtered trends for catalog
  const filteredTrends = trendsHistory.filter((item) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      item.ephemeris_text.toLowerCase().includes(q) ||
      item.date.toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Dynamic Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-emerald-600/15 rounded-full blur-[140px] animate-pulse"></div>
        <div className="absolute top-1/3 -right-40 w-[550px] h-[550px] bg-teal-600/15 rounded-full blur-[140px] animate-pulse delay-1000"></div>
        <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]"></div>
        {/* Fine Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        ></div>
      </div>

      {/* Main Container */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-6 md:py-10 flex flex-col min-h-screen">
        
        {/* TOP NAVBAR / HEADER */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-xl shadow-xl shadow-slate-950/50 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Sparkles className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-emerald-300 via-teal-200 to-white bg-clip-text text-transparent">
                  ALMANIQ WEB
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  v1.0 Pro
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Efemérides de Programación & Tendencias Virales
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center p-1 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("ephemeris")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "ephemeris"
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Efeméride del Día</span>
            </button>
            <button
              onClick={() => setActiveTab("trends")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "trends"
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Tendencias Virales</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === "history"
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Catálogo</span>
            </button>
          </nav>

          {/* Status & Clock */}
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="font-semibold">En Vivo</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentTime}</span>
            </div>
          </div>
        </header>

        {/* CONTENT AREA BASED ON TAB */}

        {/* TAB 1: EFEMÉRIDE DEL DÍA */}
        {activeTab === "ephemeris" && (
          <div className="space-y-6">
            {/* Featured Hero Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 border border-emerald-500/30 p-6 md:p-8 backdrop-blur-2xl shadow-2xl shadow-emerald-500/5">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono tracking-widest text-emerald-400 uppercase font-semibold">
                      EFEMÉRIDE DESTACADA
                    </span>
                    <h2 className="text-lg md:text-xl font-bold text-white">
                      Historia del Día en Tecnología
                    </h2>
                  </div>
                </div>
                <div className="text-xs font-mono text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                  {new Date().toLocaleDateString("es-ES", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>

              {/* Ephemeris Text Display */}
              <div className="bg-slate-950/90 rounded-2xl p-5 md:p-6 border border-slate-800/80 font-mono text-sm leading-relaxed text-emerald-300/90 shadow-inner">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 animate-pulse py-4">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Cargando efeméride del día desde Supabase...</span>
                  </div>
                ) : error ? (
                  <div className="text-rose-400 py-4 font-sans">{error}</div>
                ) : (
                  <div>
                    <p className="whitespace-pre-wrap">{displayText}</p>
                    {isTyping && <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse"></span>}
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              {todayEphemeris && !isLoading && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/80">
                  <span className="text-xs text-slate-400">
                    ¿Te gustó esta historia? Compártela con tu comunidad tech:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleShareX(displayText)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
                    >
                      <XLogo size={14} />
                      <span>Compartir en X</span>
                    </button>
                    <button
                      onClick={() => handleShareWhatsApp(displayText)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold transition-all border border-emerald-500/30"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Teaser Grid for Virals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl hover:border-emerald-500/30 transition-all group">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-2">
                  <Flame className="w-4 h-4 text-emerald-400" />
                  <span>ALMANIQ TELEGRAM BOT</span>
                </div>
                <h3 className="font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                  Generación Interactiva de Tendencias
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Nuestro bot escanea automáticamente las efemérides y tendencias virales para publicar videos en YouTube Shorts, TikTok y Facebook.
                </p>
                <button
                  onClick={() => setActiveTab("trends")}
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline"
                >
                  <span>Explorar catálogo de tendencias</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl hover:border-teal-500/30 transition-all group">
                <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold mb-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <span>ALMANIQ IA & STUDIO</span>
                </div>
                <h3 className="font-bold text-slate-100 group-hover:text-teal-300 transition-colors">
                  Generador Automático de Guiones
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Genera narraciones épicas de efemérides y curiosidades científicas usando inteligencia artificial Groq & Copilot.
                </p>
                <button
                  onClick={() => setActiveTab("history")}
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:underline"
                >
                  <span>Ver publicaciones recientes</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TENDENCIAS VIRALES (FORMATO TELEGRAM) */}
        {activeTab === "trends" && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider">
                    <Flame className="w-4 h-4" />
                    <span>CATÁLOGO DE TENDENCIAS & TELEGRAM</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1">
                    Últimas Historias Curadas por Almaniq Bot
                  </h2>
                </div>
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar tendencia o fecha..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 w-full md:w-64 transition-all"
                  />
                </div>
              </div>

              {/* Trends List / Grid */}
              {isLoading ? (
                <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Cargando tendencias desde la base de datos...</span>
                </div>
              ) : filteredTrends.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No se encontraron tendencias registradas en el catálogo.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTrends.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedContent(item)}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                        selectedContent?.id === item.id
                          ? "bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                          : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                          📅 {item.date}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            item.status === "publicado_todo" || item.status === "publicado_youtube"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 line-clamp-3 leading-relaxed font-sans">
                        {item.ephemeris_text}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-400 font-semibold pt-2 border-t border-slate-900">
                        <span>Ver detalles de publicación →</span>
                        {item.drive_video_url && <span>🎥 Video listo</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Content Inspector Modal / Box */}
            {selectedContent && (
              <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-emerald-500/30 shadow-2xl">
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-white text-base">
                      Detalles de la Historia seleccionada ({selectedContent.date})
                    </h3>
                  </div>
                  <button
                    onClick={() => handleShareX(selectedContent.ephemeris_text)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/20 transition-all"
                  >
                    <XLogo size={12} />
                    <span>Compartir</span>
                  </button>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 leading-relaxed whitespace-pre-wrap mb-4">
                  {selectedContent.ephemeris_text}
                </div>

                {selectedContent.scenes && Array.isArray(selectedContent.scenes) && selectedContent.scenes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 font-mono">
                      Escenas del Video Narrado:
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {selectedContent.scenes.map((scene, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px]">
                          <div className="text-emerald-400 font-bold mb-1">
                            {scene.title || `Escena ${idx + 1}`} ({scene.time_range})
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{scene.narration}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CATÁLOGO HISTÓRICO */}
        {activeTab === "history" && (
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl space-y-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-emerald-400" />
              <div>
                <h2 className="text-xl font-bold text-white">Catálogo Completo de Historias</h2>
                <p className="text-xs text-slate-400">
                  Explora todas las efemérides y curiosidades procesadas por Almaniq.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {trendsHistory.slice(0, 15).map((item, index) => (
                <div
                  key={item.id || index}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-emerald-500/40 transition-all"
                >
                  <div className="text-[10px] font-mono text-emerald-400 mb-1">
                    {item.date}
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-4 leading-relaxed font-sans">
                    {item.ephemeris_text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOTTOM TERMINAL DOCK */}
        <footer className="mt-auto pt-10">
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800/80 backdrop-blur-xl shadow-2xl font-mono text-xs text-emerald-400">
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-900 text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-200">Terminal Interactivo Almaniq</span>
              </div>
              <span className="text-[10px] text-slate-500">Pulsa {closeCommand} para salir</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-400">user@atpdev:~$</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder="./almaniq --today"
                className="bg-transparent text-emerald-300 focus:outline-none flex-1 caret-emerald-400 font-mono text-xs"
              />
            </div>
            
            <div className="mt-3 pt-3 border-t border-slate-900/80 text-[11px] text-slate-500 flex flex-col md:flex-row items-center justify-between gap-2">
              <div>© 2026 ATP Dev by Percy AT — Desarrollado con ❤️ desde Andahuaylas, Perú</div>
              <div>Basado en el proyecto original de MoureDev</div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  )
}
