@echo off
REM Abre MW LAND (que podes construir en tu lote) en tu compu: http://localhost:3050/land
REM Doble clic para iniciar. Cerra esta ventana negra para apagarlo.
cd /d "%~dp0"
echo Iniciando MW LAND en http://localhost:3050/land
echo La primera vez tarda unos segundos. Cerra esta ventana para apagarlo.
start "" /min cmd /c "timeout /t 15 /nobreak >nul & start "" http://localhost:3050/land"
call npm run dev -- -p 3050
pause
