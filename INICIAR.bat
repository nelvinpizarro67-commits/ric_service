@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo   RIC SERVICE - iniciando el sistema
echo ==========================================
if not exist node_modules\bootstrap (
  echo Instalando por primera vez. Necesita internet SOLO esta vez...
  call npm install
)
echo.
echo Abre en el navegador:  http://localhost:3000
echo (para cerrar el sistema presiona Ctrl + C)
echo.
start "" http://localhost:3000
call npm start
pause
