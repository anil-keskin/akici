# Lokilingo — Loki ile İngilizce (eski adı: Akıcı)

## Çalıştırma
`baslat.bat` → http://127.0.0.1:8790 (Whisper telaffuz puanı + yerel AI sohbet).
Telefon için `baslat-lan.bat` (erişim kodu verir).

## İçerik (21 Kas 2026)
- 20.000 kelime: IPA, Türkçe anlam, CEFR seviyesi, gerçek örnek cümle.
- 77.654 İngilizce–Türkçe cümle (Tatoeba).
- 7.770 kalıp: phrasal verb, deyim, atasözü.
- 53 gramer konusu ve gerçek cümlelerden üretilmiş 8.240 alıştırma.
- 81 senaryo ve 405 anahtar kalıp.
- 10 seviyeli hikâye, minimal çiftler, FSRS tekrar sistemi.
- Modüller: dikte, shadowing, telaffuz koçu, seviye testi, AI öğretmen (6 mod).

Ayrıntılar: `docs/arastirma.md`, `docs/guvenlik-tasarimi.md`.

## Veri hattı (`data/pipeline`, Python ortamı: `E:\AI\envs\akici`)
`build_data.py` → `build_grammar.py` → `build_scenarios.py` → `build_books.py` → `make_audio.py` (kokoro env) → `cd app && npx vite build`

⚠️ Kelime numaraları kart kimliğidir. `build_data.py` içindeki sıralama ve eleme mantığı değişirse kullanıcı kartları kayar.

## YOL HARİTASI
- [x] Araştırma, güvenlik tasarımı, veri hattı, web uygulaması, yerel sunucu
- [~] Arka planda (21 Kas gecesi başladı):
  - `mt_translate.py`: C1-C2 kelimelerin makine çevirisi
  - `gen_dialogs.py`: senaryo diyalogları
  - `make_audio.py`: Kokoro sesleri
- [ ] Arka plan işleri bitince yeniden derle: `build_data.py`, `build_grammar.py`, `build_scenarios.py`, `make_audio.py`, `vite build`
- [ ] Gutenberg klasikleri: indirme 503 verdi; `build_books.py` daha sonra tekrar çalıştırılacak
- [ ] Android: `npx cap add android` ve APK derleme (SDK 35/36 ve JDK 21 hazır: `E:\RE\bin\jdk21`)
- [ ] PWA kurulumunu (service worker) gerçek Chrome'da doğrula; uygulama içi panelde kayıt hatası veriyor
- [ ] KULLANICI: uygulamayı dene; beğenmediğin yerleri söyle
- [x] Gemini anahtarı girildi (23 Kas), gerçek çağrı doğrulandı. Sadece İngilizce, Groq dolunca; tavan 200/gün, 2500/ay.
- [ ] KULLANICI: Google AI Studio'da ödemeyi açınca aylık 5 $ harcama limiti koy
