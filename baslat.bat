@echo off
rem Akıcı'yı bu bilgisayarda açar. Sunucu SADECE 127.0.0.1'de çalışır (ağdaki başka cihazlar erişemez).
rem Telaffuz puanlaması bu bilgisayarda Whisper ile yapılır; ses internete gitmez. AI sohbet yerel Ollama ile çalışır.
cd /d "%~dp0"
set PY=E:\AI\envs\media\Scripts\python.exe
if not exist "%PY%" ( echo Python ortami bulunamadi: %PY% & pause & exit /b 1 )
if not exist "app\dist\index.html" ( echo Uygulama derlenmemis. app klasorunde: npm run build & pause & exit /b 1 )
start "Akici sunucusu (kapatinca durur)" /min "%PY%" -I server\akici_server.py
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8790/
