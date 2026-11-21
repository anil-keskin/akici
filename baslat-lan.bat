@echo off
chcp 65001 >nul
rem Telefondan kullanmak için: sunucuyu ev ağına açar. ERİŞİM KODU olmadan kimse AI sohbeti ya da ses puanlamayı kullanamaz.
rem Kod server\erisim-kodu.txt dosyasında saklanır; telefona bir kez girmen yeter. Sadece güvendiğin ev ağında kullan.
cd /d "%~dp0"
set PY=E:\AI\envs\media\Scripts\python.exe
"%PY%" -I -X utf8 server\akici_server.py --lan
pause
