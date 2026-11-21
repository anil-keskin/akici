@echo off
rem Lokilingo bilgisayar sürümü: yerel sunucuyu (ücretsiz, sınırsız yapay zekâ + Whisper telaffuz) başlatır ve uygulama penceresinde açar.
cd /d "%~dp0"
netstat -ano | findstr ":8790 " | findstr LISTENING >nul
if errorlevel 1 start "Lokilingo sunucu" /min E:\AI\envs\media\Scripts\python.exe -I -X utf8 server\akici_server.py --lan
timeout /t 4 /nobreak >nul
set CH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist %CH% ( start "" %CH% --app=http://127.0.0.1:8790/ ) else ( start "" msedge --app=http://127.0.0.1:8790/ )
