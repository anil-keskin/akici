@echo off
chcp 65001 >nul
cd /d "%~dp0worker"
echo.
echo  ============================================================
echo   B PLANI: GROQ ANAHTARI (ucretsiz, kart istemez, istege bagli)
echo   1) console.groq.com adresine Google hesabinla gir.
echo   2) Solda "API Keys" - "Create API Key" - anahtari KOPYALA.
echo   3) Asagida "Enter a secret value" cikinca SAG TIKLA, ENTER.
echo  ============================================================
echo.
call npx --yes wrangler@4 secret put GROQ_KEY
echo.
echo  ==== TAMAM. Claude'a "groq tamam" yaz. ====
pause
