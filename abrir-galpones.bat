@echo off
REM Abre MW WAREHOUSE (configurador de galpones) en tu compu: http://localhost:3030/galpones
REM Doble clic para iniciar. Cerra esta ventana negra para apagarlo.
REM Si ya tenes otro servidor de MODELLWERK abierto (por ejemplo el de Planta en 3020),
REM no hace falta este: abri /galpones en esa misma direccion (ej. http://localhost:3020/galpones).
cd /d "%~dp0"
echo Iniciando MW WAREHOUSE en http://localhost:3030/galpones
echo La primera vez tarda unos segundos. Cerra esta ventana para apagarlo.
start "" /min cmd /c "timeout /t 15 /nobreak >nul & start "" http://localhost:3030/galpones"
call npm run dev -- -p 3030
pause
