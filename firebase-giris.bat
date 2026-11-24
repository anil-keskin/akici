@echo off
chcp 65001 >nul
echo Firebase girisi: acilan tarayicida Google hesabinla giris yap ve izin ver.
echo Soru sorarsa (Gemini / veri toplama) "n" yazip Enter bas.
call npx --yes firebase-tools@latest login
echo.
echo Bitti. Bu pencereyi kapatip Claude a "girdim" yaz.
pause
