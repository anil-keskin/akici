# Akıcı — Güvenlik ve Gizlilik Tasarımı

## 1. Varlıklar
- Kullanıcının öğrenme verisi: kart geçmişi, puanlar, notlar.
- Ses kayıtları: telaffuz ve shadowing için.
- AI sohbet metinleri.
- AI sağlayıcı anahtarı (kullanıcı kendi anahtarını girerse).

## 2. Mimari (güven sınırları)
```
[Tarayıcı / Android WebView]  ──(sadece 127.0.0.1 veya kullanıcının seçtiği adres)──▶  [Akıcı yerel sunucu (Python)]
   │  IndexedDB (cihazda)                                                                   ├─ /api/score  → Whisper (GPU, bu PC)
   │  Web Speech / Android TTS-STT                                                         └─ /api/chat   → Ollama (bu PC)
   └─(isteğe bağlı, kullanıcı anahtarıyla)──▶ [OpenAI uyumlu / Anthropic API]
```
- **Hesap yok, bulut veritabanı yok.** Tüm öğrenme verisi cihazda (IndexedDB) durur. Sızacak merkezi bir veri yok.
- Uygulama sunucusuz da tam çalışır. AI sohbet ve Whisper puanlama, yerel sunucu açıksa devreye girer.

## 3. Tehditler (STRIDE) ve önlemler
| Tehdit | Önlem |
|---|---|
| Aynı ağdaki biri yerel sunucuyu kullanır ya da ses gönderir | Sunucu varsayılan olarak **sadece 127.0.0.1**'i dinler. Android'den bağlanmak için LAN modu bilerek açılır, rastgele bir **erişim kodu** ister. |
| Başka bir site tarayıcı üzerinden yerel sunucuya istek atar (CSRF / DNS rebinding) | Origin ve Host başlığı beyaz listede olmalı. JSON dışı içerik reddedilir. |
| Büyük dosya ya da çok istekle sunucuyu çökertme | Ses en fazla 3 MB / 30 sn. Sohbet mesajı en fazla 4000 karakter. İstemci başına hız sınırı. |
| AI'ya prompt injection | Modelin aracı yok, sadece metin üretir. Sistem istemi sabittir. Model çıktısı HTML olarak değil düz metin olarak basılır (XSS yok). |
| XSS | React metni otomatik escape eder. `dangerouslySetInnerHTML` kullanılmaz. Sıkı bir CSP vardır. |
| Anahtar sızıntısı | Kendi anahtarını giren kullanıcı için anahtar sadece cihazda (IndexedDB) durur, koda ve git'e girmez. Ekranda uyarı gösterilir. Varsayılan seçenek anahtarsız yerel Ollama'dır. |
| Bağımlılık saldırısı | Lock dosyası tutulur. `npm audit` ve `pip-audit` çalıştırılır. Sadece bilinen paketler kullanılır (aşağıda). |
| Veri kaybı | "Yedeği dışa aktar / içe aktar" (JSON) vardır. Tarayıcı verisi temizlenirse yedekten dönülür. |

## 4. KVKK
- **Veri sorumlusu:** Uygulamayı kendi bilgisayarında çalıştıran kişi. Kişisel kullanım için KVKK yükümlülüğü yoktur. Uygulama başkalarına dağıtılırsa aşağıdakiler hazır:
- **Aydınlatma metni:** Uygulama içinde (Ayarlar → Gizlilik). Hangi verinin nerede tutulduğunu ve nereye gittiğini açıkça söyler.
- **Mikrofon:** İlk kullanımdan önce açıklama gösterilir ve onay alınır. Whisper modunda ses bu bilgisayardan çıkmaz ve diske kalıcı yazılmaz. Tarayıcının konuşma tanıması kullanılırsa ses Google'a (Chrome) ya da Microsoft'a (Edge) gider. Bu ayrıca belirtilir ve kullanıcı seçer.
- **AI sohbet:** Yerel Ollama'da metin bilgisayardan çıkmaz. Bulut sağlayıcı seçilirse bu **yurtdışına aktarımdır (md. 9)**. Seçim ekranında uyarı vardır, varsayılan seçenek yereldir.
- **Silme hakkı:** Ayarlar → "Tüm verilerimi sil" her şeyi siler.
- **Çerez ve analitik:** Yok. Fontlar uygulamanın içinde gelir; Google Fonts'a istek gitmez.

## 5. Mağaza (Android, ileride Play'e konursa)
- **Data Safety:** "Veri toplanmaz" denebilir, çünkü her şey cihazda kalır. Bulut AI seçilirse "kullanıcının seçtiği 3. tarafa gönderilir" diye beyan edilir.
- **İzinler:** Sadece RECORD_AUDIO (konuşma alıştırması) ve INTERNET (yerel sunucu ya da AI için).
- **Gizlilik politikası URL'si:** Yayın öncesi gerekir (`docs/gizlilik.md` taslağı hazırlanacak).

## 6. Kabul edilen riskler
- Tarayıcı konuşma tanımasında ses üreticinin sunucusuna gider. Bu yüzden Whisper (yerel) varsayılan seçenektir; tarayıcı tanıması sadece yedek olarak kullanılır.
- Kullanıcının girdiği bulut AI anahtarı cihazda şifrelenmeden durur. Kişisel cihaz için kabul edildi ve ekranda uyarı gösteriliyor.

## Akıcı AI aracı sunucusu (worker/, 21 Kas)
- Amaç: APK/site kullanıcılarına anahtarsız AI sohbet. Anahtar sadece Cloudflare secret `GEMINI_KEY`; koda, APK'ya, git'e girmez.
- Ücret güvencesi: faturalandırması kapalı (ücretsiz kota) Gemini anahtarı → en kötü durumda kota dolar, fatura çıkmaz.
- Kötüye kullanım: IP başına 12/dk, cihaz başına 8/dk (Workers rate limit), 30 mesaj × 6000 karakter, 40 KB gövde, sabit model, max 1200 token.
- Gizlilik: içerik loglanmaz (observability kapalı); Settings aydınlatma metni yurtdışı aktarımı (KVKK md. 9) açıklar.
- Zayıf nokta: cihaz numarası istemci tarafından üretilir, taklit edilebilir; asıl sınır IP sınırı + Gemini kotası.

## Bulut yedeği / kaldığın yerden devam (worker `/sync/<id>`, 22 Kas)
- **Hesap yok, e-posta yok.** Cihaz 20 haneli rastgele kurtarma kodu üretir (~100 bit, `crypto.getRandomValues`).
- **Uçtan uca şifreleme:** ilerleme cihazda gzip + AES-GCM (anahtar = SHA-256("lokilingo-sync-key:"+kod)). Sunucu sadece şifreli kutuyu ve kimliği (SHA-256("lokilingo-sync-id:"+kod)) görür; kod ve içerik sunucuya hiç gitmez.
- **Yedeğe girmeyenler:** API anahtarı, LAN erişim kodu, sunucu/sağlayıcı/ses ayarları (`DEVICE_FIELDS`), `sync.*`. Geri yüklerken cihazdaki bu alanlar korunur.
- **Sunucu:** Cloudflare KV `SYNC`, kutu ≤ 8 MB, IP başına dakikada 12 istek, 400 gün kullanılmazsa TTL ile silinir. "Kapat ve sil" düğmesi DELETE ile hemen siler (KVKK md. 7/11).
- **Tehdit:** kodu ele geçiren ilerlemeyi okuyabilir/üzerine yazabilir (kod = tek anahtar). Kabul edildi: içerik kişisel veri değil (kelime ilerlemesi, sohbet geçmişi); kullanıcıya "kodu paylaşma, sohbete kişisel bilgi yazma" uyarısı var. Kod tahmini 2^100 denemede imkânsız.
- **Çakışma:** son yazan kazanır. Açılışta buluttaki daha yeniyse ve bu cihazda değişiklik yoksa otomatik çekilir. Her kişi kendi kodunu kullanır.

## Podcast, şarkı sözü, canlı döküm (22 Kas)
- `/pod/search` (Apple iTunes Search; Cloudflare IP'leri sınırlanırsa fyyd.de), `/pod/feed` (podcast'in herkese açık RSS'i), `/pod/transcript` (ses ADRESİ Groq Whisper'a verilir, ses bizde saklanmaz; döküm KV'de 60 gün önbellek `pt4:`+sha256(url)), `/pod/audio` (sadece audio/* içerik aktaran, Range destekli aracı; http podcastler https uygulamada çalsın diye), `/lyrics` (lrclib.net).
- **SSRF önlemi:** `safeUrl()` sadece http/https alır; localhost, özel IP blokları ve çıplak IP adresleri reddedilir. Aracı sadece ses türü içerik geçirir (genel proxy olarak kullanılamaz).
- **Canlı döküm (PC):** `getDisplayMedia` ile kullanıcının kendi izniyle sekmenin sesi alınır, 10 sn'lik parçalar `/stt`'ye gider, ses saklanmaz. YouTube sunucusundan altyazı/veri ÇEKİLMEZ.
- Hız sınırları: IP 40/dk, cihaz 25/dk (döküm ayrı anahtar `ptr:`). Groq ücretsiz kotası doğal üst sınır.
- CSP: `img-src https:` ve `media-src https:` açıldı (podcast kapak/ses her alan adından gelebilir); script-src hâlâ sadece 'self'.
