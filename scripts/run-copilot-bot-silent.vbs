Set WshShell = CreateObject("WScript.Shell")
' El 0 indica que la ventana del CMD (pantalla negra) debe estar oculta (completamente invisible)
WshShell.Run chr(34) & "d:\PROYECTOS\code-history-day-web\scripts\run-copilot-bot.bat" & Chr(34), 0
Set WshShell = Nothing
