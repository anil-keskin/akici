@echo off
chcp 65001 >nul
cd /d "%~dp0worker"
echo.
echo  ============================================================
echo   GEMINI ANAHTARINI GIR
echo   1) aistudio.google.com sayfasinda anahtarini KOPYALA
echo      (AIza ile baslayan uzun yazi)
echo   2) Asagida "Enter a secret value" cikinca SAG TIKLA, ENTER
echo      (Yazdigin gorunmez, normal.)
echo  ============================================================
echo.
call npx --yes wrangler@4 secret put GEMINI_KEY
echo.
echo  ==== TAMAM. Claude'a "girdim" yaz. ====
pause
