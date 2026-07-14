@echo off
:: Navegar a la carpeta del proyecto
cd /d "d:\PROYECTOS\code-history-day-web"

:: Ejecutar el bot de Node.js y guardar un registro en bot-cron.log
node scripts\copilot-image-bot.js >> scripts\bot-cron.log 2>&1
