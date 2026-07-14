Set WshShell = CreateObject("WScript.Shell")

' 1. Iniciar servidor web de Next.js oculto (0) y redirigir output a nextjs.log
WshShell.Run "cmd /c cd /d d:\PROYECTOS\code-history-day-web && npm run dev > scripts\nextjs.log 2>&1", 0, False

' 2. Darle unos segundos a Next.js para que inicie antes de levantar el bot
WScript.Sleep 5000

' 3. Iniciar Bot de Telegram oculto (0)
WshShell.Run "cmd /c cd /d d:\PROYECTOS\code-history-day-web && node scripts\telegram-meta-ai-bot.js", 0, False

Set WshShell = Nothing
