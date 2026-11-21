@echo off
rem Telefondan kullanmak için: sunucuyu ev ağına açar ve rastgele bir ERİŞİM KODU üretir.
rem Kod olmadan kimse AI sohbeti ya da ses puanlamayı kullanamaz. Sadece güvendiğin ev ağında kullan.
cd /d "%~dp0"
set PY=E:\AI\envs\media\Scripts\python.exe
"%PY%" -I server\akici_server.py --lan
pause
