# Araştırma: En iyi İngilizce uygulamaları ve teknikleri (21 Kas 2026)

## Yöntem ve sınır (önemli)
Ticari uygulamaların (Duolingo, Busuu, ELSA, Babbel…) APK'sını açıp kodunu/içeriğini almak **yapılmadı**:
- İçerikleri (cümle, ses, görsel, ders metni) telif hakkıyla korunur; kopyalamak uygulamayı mağazadan kaldırtır, dava riski doğurur.
- APK'yı Play dışından indirmek güvenilmeyen dosya demek; Play'den almak hesap gerektirir.
- Kullanım şartları tersine mühendisliği yasaklar.

Bunun yerine "tersine mühendislik" şöyle yapıldı — yasal ve daha verimli:
1. Şirketlerin **kendi yayınladığı** araştırma ve açık kaynak kodu (Duolingo HLR makalesi ve `duolingo/halflife-regression` reposu, FSRS benchmark'ı).
2. Uygulamaların **dışarıdan gözlenen** davranışı ve teknik incelemeler (hangi egzersiz, hangi sırayla, hangi geri bildirim).
3. GitHub'daki benzer açık kaynak projeler (aşağıda) — fikir alındı, kod kopyalanmadı (çoğu AGPL/GPL).
4. Tüm içerik **açık lisanslı** kaynaklardan üretildi (bkz. `README.md` → Lisanslar).

## Uygulama → teknik → bizdeki karşılığı

| Uygulama | Güçlü olduğu teknik | Akıcı'daki karşılığı |
|---|---|---|
| **Duolingo** | Kısa dersler (2–5 dk), seri (streak), XP, günlük hedef, karma egzersiz (çeviri, eşleştirme, dinle-yaz, konuş), HLR ile kişisel tekrar zamanı | Günlük hedef + seri + XP + **seri kalkanı** (seriyi kaybetme kaygısını azaltır); karma "Günün dersi"; HLR yerine daha iyi olan **FSRS** |
| **Busuu** | A1–C1 yapılandırılmış kurs, gramer ipuçları, yazma ödevine insan düzeltmesi | CEFR seviyeli gramer yolu; yazma ödevini **yapay zekâ düzeltir** (Busuu topluluğunun yerine) |
| **ELSA Speak** | Fonem (ses) düzeyinde telaffuz puanı, ses bazlı ipucu | Kelime düzeyinde yerel Whisper puanı + Türklere özel ses ipuçları (TH, W/V, -ed, NG…) + **minimal çift** alıştırması (ship/sheep) |
| **Speak / Praktika** | Yapay zekâ ile sesli rol yapma, senaryolar | AI Sohbet: serbest, rol yapma (100+ senaryo), sınav konuşması; sesli giriş/çıkış |
| **Babbel** | Gerçek hayat diyalogları, tekrar | Senaryo diyalogları (restoran, havaalanı, iş görüşmesi…) + diyalog ezberleme |
| **Memrise** | Gerçek insan videoları, "mem" (hafıza ipucu) | Kelime kartında not/hafıza ipucu alanı; AI'dan anımsatıcı üretme |
| **Anki** | Aralıklı tekrar (FSRS), kişisel deste | FSRS-6 (ts-fsrs), kendi kartını ekleme, okumadan kart çıkarma |
| **Clozemaster** | Gerçek cümlelerde boşluk doldurma (Tatoeba), sıklığa göre | Tatoeba'dan **on binlerce** EN–TR cümle ile cloze modu |
| **Lingvist** | Sıklık temelli kelime, bağlam içinde yazarak hatırlama | Kelimeler sıklık sırasıyla (wordfreq), yazarak hatırlama modu |
| **LingQ / Language Reactor** | Anlaşılır girdi (comprehensible input): metin oku, bilinmeyen kelimeye dokun, desteye ekle | Okuma modülü: public-domain kitaplar + seviyeli metinler, kelimeye dokun → çeviri → desteye ekle; bilinen/öğrenilen renklendirme |
| **Pimsleur / Glossika** | Sesli, kademeli aralıklı tekrar; cümle tekrarı | "Dinle-tekrar et" eller serbest mod; cümle akışı (otomatik çal-bekle-tekrar) |
| **Shadowing (yöntem)** | Ana dili konuşanı geriden takip ederek aynı anda tekrar | Shadowing stüdyosu: yavaş/normal hız, cümle bölme, kaydet-dinle-karşılaştır, puan |
| **Dikte** | Dinleyip yazma | Dikte modu, harf düzeyinde fark gösterimi |
| **Quizlet** | Eşleştirme oyunları, hızlı tur | Eşleştirme oyunu, hız turu |

## Bilimsel temel (kısa)
- **Aralıklı tekrar:** Duolingo'nun HLR modeli (Settles & Meeder, ACL 2016) Leitner'e göre hatayı yarıya indirdi. Açık benchmark'ta (open-spaced-repetition/srs-benchmark) **FSRS** HLR'den daha iyi tahmin yapıyor → FSRS seçildi.
- **Geri çağırma (active recall)** tanımaktan güçlüdür → kartlarda önce yazarak/söyleyerek hatırlama.
- **Karışık tekrar (interleaving)** → günün dersi kelime + gramer + dinleme karışık.
- **Anlaşılır girdi** → okuma/dinleme seviyeye göre (%95+ bilinen kelime hedefi).
- **Seri (streak) dikkat:** araştırmalar serinin "uygulamayı açmak" için optimize olabildiğini, kırılınca bırakmaya yol açtığını gösteriyor → seri kalkanı + "öğrenme" ölçen hedefler (tekrar tamamlama, konuşma süresi).

## Benzer açık kaynak projeler (incelendi, kod alınmadı)
| Repo | Fikir | Lisans |
|---|---|---|
| open-spaced-repetition/ts-fsrs (fsrs4anki ailesi) | FSRS algoritması — **kütüphane olarak kullanıldı** | MIT |
| duolingo/halflife-regression | Duolingo'nun HLR kodu — karşılaştırma | MIT |
| baturyilmaz/wordpecker-app | Kişisel listelerden Duolingo tarzı ders | MIT |
| artcc/freelingo | Yerel/bulut LLM ile AI dil öğretmeni, CEFR | AGPL-3.0 |
| OpenPronounce/OpenPronounce | Fonem düzeyi telaffuz değerlendirme (gelecek adım) | AGPL-3.0 |
| Oliviaviaviavia/english-trainer | Videodan dinleme/shadowing (yerel Language Reactor + ELSA) | MIT |
| Samuelxiaozhuofeng/LinguaClip | Video/podcast'ten dikte | AGPL-3.0 |
| designfuchen/word-atlas | Görselli kelime + FSRS | — |
| h16nning/skola | Yerel öncelikli SRS PWA | AGPL-3.0 |
| sanidhyy/duolingo-clone, bryanjenningz/react-duolingo | Ders akışı UI kalıpları | MIT |

## Tasarım ilkeleri (araştırmadan)
- Kullanıcıların çoğu ilk hafta, ilerlemeyi göremediği ya da menülerde kaybolduğu için bırakıyor. Bu yüzden ana ekranda tek büyük **"Devam et"** düğmesi olacak.
- İlerleme hep görünür olacak: halka grafik, seviye çubuğu, öğrenilen kelime sayacı.
- Oyunlaştırma öğrenmeyi ödüllendirecek: XP tekrar tamamlamaya ve konuşmaya verilir, sadece uygulamayı açmaya verilmez.
- Görsel dil özgün olacak. Duolingo'nun yeşil-baykuş kimliği ya da başka bir markanın görünümü kopyalanmayacak.

## Kaynaklar
- Duolingo HLR: https://blog.duolingo.com/how-we-learn-how-you-learn , https://preview.aclanthology.org/fix_video/P16-1174.pdf , https://research.duolingo.com/
- HLR 2026 revizyonu: https://proceedings.mlr.press/v339/ilidio26a.html
- 2026 uygulama karşılaştırmaları: https://www.italki.com/en/blog/english-learning-app , https://www.clozemaster.com/blog/?p=7678 , https://bestforandroid.com/english-learning-apps/
- Oyunlaştırma eleştirisi: https://dev.to/qcrao/why-i-avoided-gamification-in-a-vocabulary-tool-for-adult-learners-dl6 , https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps
