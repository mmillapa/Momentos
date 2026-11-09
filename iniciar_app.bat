@echo off
title Nuestros Momentos - Citas en Pareja
echo ==================================================
echo   Iniciando la Aplicacion "Nuestros Momentos"...
echo ==================================================
cd /d "%~dp0backend"
npm install --silent
start http://localhost:3000
node server.js
pause
