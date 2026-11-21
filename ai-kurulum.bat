@echo off
chcp 65001 >nul
cd /d "%~dp0worker"
echo ==============================================================
echo  AKICI AI KURULUMU (bir kez yapilir)
echo  1) Tarayici acilacak: Cloudflare hesabinla gir, "Allow" de.
echo  2) Sonra Gemini anahtarini yapistirman istenecek (ekranda gorunmez).
echo     Anahtar: aistudio.google.com - Get API key. Faturalandirma ACMA.
echo ==============================================================
pause
call npx --yes wrangler@4 login
if errorlevel 1 goto hata
call npx --yes wrangler@4 deploy
if errorlevel 1 goto hata
echo.
echo Simdi Gemini API anahtarini yapistir ve Enter'a bas:
call npx --yes wrangler@4 secret put GEMINI_KEY
if errorlevel 1 goto hata
echo.
echo ==== BITTI. Claude'a "kurulum bitti" yaz. ====
pause
exit /b 0
:hata
echo.
echo Bir hata oldu. Bu pencerenin ekran goruntusunu Claude'a gonder.
pause
