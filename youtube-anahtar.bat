@echo off
chcp 65001 >nul
cd /d "%~dp0worker"
echo.
echo  ============================================================
echo   YOUTUBE ARAMA ANAHTARI (bir kez, ucretsiz)
echo   1) Tarayicida ac: console.cloud.google.com/apis/library/youtube.googleapis.com
echo      ETKINLESTIR (Enable) dugmesine bas.
echo   2) Sonra: console.cloud.google.com/apis/credentials
echo      + CREATE CREDENTIALS - API key. Cikan anahtari KOPYALA.
echo   3) Asagida "Enter a secret value" cikinca SAG TIKLA, ENTER.
echo  ============================================================
echo.
call npx --yes wrangler@4 secret put YOUTUBE_KEY
echo.
echo  ==== TAMAM. Claude'a "youtube tamam" yaz. ====
pause
